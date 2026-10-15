import {today, monthLabel} from '../ui.js';
import {agenda, novoTreino, novoJogo, resultado, config} from '../data.js';
import {agendaItem} from './common.js';
import {db} from '../db.js';
import {toast, esc} from '../ui.js';
import {livroEpoca} from '../epoca-livro.js';
import {livroBytes} from '../xlsx-livro.js';
import {guardarNoOneDrive, syncNow} from '../sync.js';
import {importarControlStats} from '../importar-cs.js';
import {lerTabela, casar} from '../importar-tempos.js';
import {mmss} from '../stats.js';

let filtro = 'tudo';

export async function render(main, params, ctx) {
  ctx.title('Época');
  const [ag, cfg] = await Promise.all([agenda(), config()]);
  const hoje = today();

  const jogos = ag.filter(e => e.kind === 'jogo'), treinos = ag.filter(e => e.kind === 'treino' && e.data <= hoje);
  const res = jogos.map(resultado).filter(Boolean);
  const v = res.filter(r => r.a > r.b).length, e = res.filter(r => r.a === r.b).length, d = res.filter(r => r.a < r.b).length;
  const gm = res.reduce((s, r) => s + r.a, 0), gs = res.reduce((s, r) => s + r.b, 0);
  const presT = treinos.map(t => { const vals = Object.values(t.presencas || {}); return vals.length ? vals.filter(x => x === 'P').length / vals.length : null; }).filter(x => x != null);
  const presM = presT.length ? Math.round(100 * presT.reduce((a, b) => a + b, 0) / presT.length) : null;

  const draw = () => {
    const list = ag.filter(x => filtro === 'tudo' || x.kind === filtro);
    const fut = list.filter(x => x.data >= hoje), past = list.filter(x => x.data < hoje).reverse();
    const byMonth = arr => {
      const groups = [];
      for (const x of arr) { const k = (x.data || '').slice(0, 7); if (!groups.length || groups.at(-1).k !== k) groups.push({k, items: []}); groups.at(-1).items.push(x); }
      return groups.map(g => `<h2 style="margin-top:4px">${monthLabel(g.k + '-01')}</h2><div class="list">${g.items.map(i => agendaItem(i, cfg.clube)).join('')}</div>`).join('');
    };
    main.querySelector('#lists').innerHTML =
      `<section class="stack"><h2>Próximos</h2>${fut.length ? `<div class="list">${fut.map(i => agendaItem(i, cfg.clube)).join('')}</div>` : '<p class="muted">Nada marcado.</p>'}</section>` +
      (past.length ? `<section class="stack"><h2>Feitos</h2>${byMonth(past)}</section>` : '');
    main.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === filtro)));
  };

  main.innerHTML = `
    <div class="tw"><table><thead><tr><th>Época</th><th>Jogos</th><th>V-E-D</th><th>Golos</th><th>Treinos</th><th>Presença</th></tr></thead>
      <tbody><tr><td>${cfg.epoca || 'Atual'}</td><td>${res.length}</td><td>${v}-${e}-${d}</td><td>${gm}:${gs}</td><td>${treinos.length}</td><td>${presM == null ? '–' : presM + '%'}</td></tr></tbody></table></div>
    <div class="row between">
      <div class="seg" role="group" aria-label="Mostrar"><button data-f="tudo">Tudo</button><button data-f="treino">Treinos</button><button data-f="jogo">Jogos</button></div>
      <div class="row"><button id="nt">+ Treino</button><button id="nj">+ Jogo</button></div>
    </div>
    <div id="lists" class="stack" style="gap:16px"></div>
    <h2 class="small muted" style="margin-top:8px">Excel e jogos antigos</h2>
    <details class="panel"><summary><h2 style="display:inline">Excel da época</h2></summary>
      <p class="small muted">Feito de novo a partir de todos os jogos, por isso corrigir um jogo antigo corrige o Excel seguinte. Folhas: Resumo, Jogadores, Jogo a jogo, Minutos, Golos, Quartetos e, no fim, Dados (uma linha por jogador e jogo, para filtrar).</p>
      <div class="fields">
        <label class="f"><span>Competição</span><select id="xc"><option value="">Todas</option>${[...new Set(jogos.map(j => j.competicao).filter(Boolean))].sort().map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="f"><span>De</span><input type="date" id="xde"></label><label class="f"><span>Até</span><input type="date" id="xate"></label>
      </div>
      <div class="row"><button class="primary" id="xls">Exportar Excel da época</button></div>
    </details>
    <details class="panel"><summary><h2 style="display:inline">Importar jogos antigos</h2></summary>
      <p class="small muted"><b>Control-Stats:</b> escolhe os ficheiros .txt do Save Match (podes escolher vários). Cada um vira um jogo com o Ao vivo reconstruído: tempos por jogador, rotações, golos com os 5 em campo, situações. Os jogadores que não existirem no plantel são criados.</p>
      <div class="row"><label class="btn primary" for="csImp">Importar do Control-Stats<input type="file" id="csImp" accept=".txt,.json,text/plain" multiple hidden></label></div>
      <p class="small muted"><b>Marcador de vídeo antigo:</b> lá, carrega em <i>Guardar CSV</i>. Aqui, abre o jogo → <i>Vídeo</i> → abre o vídeo → <i>Abrir CSV</i>.</p>
      <p class="small" id="csMsg" aria-live="polite"></p>
    </details>
    <details class="panel" id="ttDet"><summary><h2 style="display:inline">Tempos de jogo de jogos antigos</h2></summary>
      <p class="small muted">Cola uma tabela com uma linha por atleta: <b>nome</b>, posição (opcional) e um tempo por jogo, por exemplo <code>Hugo Pires  Fixo  15:38  15:34</code>. "15:38" = 15 min 38 s, "28" = 28 min, "0" = não jogou. Cada coluna de tempos é um jogo.</p>
      <label class="f"><span>Tabela</span><textarea id="ttTxt" rows="6" spellcheck="false" placeholder="Rui Pacheco&#9;Redes&#9;28&#9;10"></textarea></label>
      <div class="row"><button id="ttLer">Ler tabela</button></div>
      <div id="ttPrev" class="stack"></div>
    </details>`;
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; draw(); });
  main.querySelector('#nt').onclick = async () => { const t = await novoTreino(); ctx.go('#/treino/' + t.id); };
  main.querySelector('#csImp').onchange = async e => {
    const msg = main.querySelector('#csMsg'), out = [];
    for (const f of e.target.files) {
      try { const r = await importarControlStats(f); out.push(`✓ ${f.name}: ${r.jogo.data || 'sem data'} vs ${r.jogo.adversario || '?'}${r.novos ? `, ${r.novos} atletas novos` : ''}`); }
      catch (err) { out.push(`✗ ${f.name}: ${err.message}`); }
    }
    e.target.value = '';
    toast(`${out.filter(x => x.startsWith('✓')).length} jogos importados`);
    ctx.rerender();
    setTimeout(() => { const m = document.querySelector('#csMsg'); if (m) { m.innerHTML = out.map(esc).join('<br>'); m.closest('details').open = true; } }, 50);
  };
  main.querySelector('#xls').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      // traz primeiro o que foi marcado noutros aparelhos (no máximo 15 s; sem rede segue com o que há aqui)
      btn.textContent = 'A sincronizar…';
      await Promise.race([syncNow().catch(() => null), new Promise(r => setTimeout(r, 15000))]);
      btn.textContent = 'A fazer o Excel…';
      const folhas = livroEpoca({jogos: await db.all('jogos'), atletas: await db.all('atletas'), cfg,
        filtro: {competicao: main.querySelector('#xc').value, de: main.querySelector('#xde').value, ate: main.querySelector('#xate').value}});
      // nome com data e hora: nunca se confunde com um Excel antigo nas Transferências
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const nome = `Estatisticas_${(cfg.epoca || hoje.slice(0, 4)).replace(/[\\/]/g, '-')}_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}h${p2(d.getMinutes())}.xlsx`;
      const blob = new Blob([livroBytes(folhas)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url = URL.createObjectURL(blob), a = Object.assign(document.createElement('a'), {href: url, download: nome});
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      const up = await guardarNoOneDrive(nome, blob).catch(() => null);
      toast(up ? 'Excel guardado aqui e no OneDrive' : 'Excel guardado');
    } catch (err) { toast('Não deu para exportar: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = 'Exportar Excel da época'; }
  };
  main.querySelector('#nj').onclick = async () => { const j = await novoJogo(); ctx.go('#/jogo/' + j.id); };
  main.querySelector('#ttLer').onclick = () => tempos(main, ctx);
  draw();
}

// Pré-visualização da tabela colada: quem é quem no plantel e a que jogo vai cada coluna
async function tempos(main, ctx) {
  const box = main.querySelector('#ttPrev');
  const {linhas, colunas, avisos} = lerTabela(main.querySelector('#ttTxt').value);
  if (!linhas.length) { box.innerHTML = '<p class="small" style="color:var(--crit)">Não encontrei linhas com nome e tempos.</p>'; return; }
  const ats = (await db.all('atletas')).filter(a => !a.deleted).sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999) || (a.nome || '').localeCompare(b.nome || ''));
  const jogos = (await db.all('jogos')).filter(j => !j.deleted).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const pick = linhas.map(l => casar(l.nome, ats));
  const optAt = sel => `<option value="">➕ Criar atleta novo</option>` + ats.map(a => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.num || '–')} ${esc(a.nome || '')}</option>`).join('');
  const optJg = `<option value="">➕ Jogo novo</option>` + jogos.map(j => `<option value="${j.id}">${esc(j.data || 'sem data')} · ${esc(j.adversario || 'sem adversário')}${j.competicao ? ' · ' + esc(j.competicao) : ''}</option>`).join('');
  const total = c => linhas.reduce((s, l) => s + (l.tempos[c] || 0), 0);
  box.innerHTML = `
    ${avisos.length ? `<p class="small muted">${avisos.map(esc).join('<br>')}</p>` : ''}
    <div class="tw"><table><thead><tr><th>Colado</th><th>Atleta na app</th>${Array.from({length: colunas}, (_, c) => `<th>Jogo ${c + 1}</th>`).join('')}</tr></thead><tbody>
      ${linhas.map((l, i) => `<tr><td>${esc(l.nome)}${l.pos ? ` <span class="small muted">${esc(l.pos)}</span>` : ''}</td>
        <td><select data-tat="${i}" style="min-height:34px;padding:4px">${optAt(pick[i])}</select></td>
        ${l.tempos.map(t => `<td>${t ? mmss(t) : '–'}</td>`).join('')}</tr>`).join('')}
      <tr><td><b>Total</b></td><td class="small muted">5 em campo × 40 min = 200 min</td>${Array.from({length: colunas}, (_, c) => `<td><b>${Math.round(total(c) / 60)}'</b></td>`).join('')}</tr>
    </tbody></table></div>
    ${Array.from({length: colunas}, (_, c) => `<fieldset class="panel" style="margin:0"><legend><b>Jogo ${c + 1}</b></legend>
      <label class="f"><span>Guardar em</span><select data-tj="${c}">${optJg}</select></label>
      <div class="fields" data-tnovo="${c}">
        <label class="f"><span>Adversário</span><input data-tadv="${c}" maxlength="40"></label>
        <label class="f"><span>Competição</span><input data-tcomp="${c}" maxlength="40"></label>
        <label class="f"><span>Data</span><input type="date" data-tdata="${c}"></label>
        <label class="f"><span>Jogamos</span><select data-tcasa="${c}"><option value="1">Em casa</option><option value="0">Fora</option></select></label>
      </div></fieldset>`).join('')}
    <p class="small muted">Os atletas com tempo entram na convocatória do jogo. Se o jogo já tinha tempos à mão, são substituídos por estes. Jogos com Ao vivo marcado continuam a usar os tempos do Ao vivo.</p>
    <div class="row"><button class="primary" id="ttOk">Guardar tempos</button></div>
    <p class="small" id="ttMsg" aria-live="polite"></p>`;
  box.querySelectorAll('[data-tj]').forEach(s => s.onchange = () => { box.querySelector(`[data-tnovo="${s.dataset.tj}"]`).hidden = !!s.value; });
  box.querySelector('#ttOk').onclick = async () => {
    const msg = box.querySelector('#ttMsg');
    for (let c = 0; c < colunas; c++) if (!box.querySelector(`[data-tj="${c}"]`).value && !box.querySelector(`[data-tadv="${c}"]`).value.trim()) { msg.textContent = `Jogo ${c + 1}: escolhe um jogo ou escreve o adversário.`; msg.style.color = 'var(--crit)'; return; }
    for (let c = 0; c < colunas; c++) if (!box.querySelector(`[data-tj="${c}"]`).value && !box.querySelector(`[data-tdata="${c}"]`).value) { msg.textContent = `Jogo ${c + 1}: falta a data.`; msg.style.color = 'var(--crit)'; return; }
    const ids = [];
    let novos = 0;
    for (let i = 0; i < linhas.length; i++) {
      let id = box.querySelector(`[data-tat="${i}"]`).value;
      if (!id) {
        if (!linhas[i].tempos.some(t => t > 0)) { ids.push(null); continue; }   // não jogou e não existe: não cria
        const a = await db.put('atletas', {num: '', nome: linhas[i].nome, posicao: linhas[i].pos, ativo: true}); id = a.id; novos++;
      }
      ids.push(id);
    }
    const out = [];
    for (let c = 0; c < colunas; c++) {
      const jid = box.querySelector(`[data-tj="${c}"]`).value;
      let j = jid ? await db.get('jogos', jid) : {...await novoJogo(box.querySelector(`[data-tdata="${c}"]`).value),
        adversario: box.querySelector(`[data-tadv="${c}"]`).value.trim(), competicao: box.querySelector(`[data-tcomp="${c}"]`).value.trim(),
        casa: box.querySelector(`[data-tcasa="${c}"]`).value === '1', hora: ''};
      const minutos = {};
      linhas.forEach((l, i) => { if (ids[i] && l.tempos[c] > 0) minutos[ids[i]] = (minutos[ids[i]] || 0) + l.tempos[c]; });
      j = await db.put('jogos', {...j, minutos, minutosP: {}, convocados: [...new Set([...(j.convocados || []), ...Object.keys(minutos)])]});
      out.push(`${j.data || ''} ${j.adversario || ''}: ${Object.keys(minutos).length} atletas`);
    }
    toast('Tempos guardados');
    msg.style.color = ''; msg.innerHTML = `✓ ${out.map(esc).join('<br>✓ ')}${novos ? `<br>${novos} atletas novos no plantel (sem número: põe-no em Plantel).` : ''}`;
  };
}
