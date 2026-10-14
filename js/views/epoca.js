import {today, monthLabel} from '../ui.js';
import {agenda, novoTreino, novoJogo, resultado, config} from '../data.js';
import {agendaItem} from './common.js';
import {db} from '../db.js';
import {toast, esc} from '../ui.js';
import {buildEpoca} from '../epoca-excel.js';
import {loadXLSX} from '../live/excel.js';
import {guardarNoOneDrive} from '../sync.js';
import {importarControlStats} from '../importar-cs.js';

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
    <details class="panel"><summary><h2 style="display:inline">Excel da época</h2></summary>
      <p class="small muted">Feito de novo a partir de todos os jogos, por isso corrigir um jogo antigo corrige o Excel seguinte. Folhas: Jogos, Estatísticas por jogador (com valores por 40 min), Minutos, Totais por jogo e Eventos.</p>
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
    <div id="lists" class="stack" style="gap:16px"></div>`;
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
      const XLSX = await loadXLSX();
      const sheets = buildEpoca({jogos: await db.all('jogos'), atletas: await db.all('atletas'), cfg,
        filtro: {competicao: main.querySelector('#xc').value, de: main.querySelector('#xde').value, ate: main.querySelector('#xate').value}});
      const wb = XLSX.utils.book_new();
      for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
      const nome = `Estatisticas_${(cfg.epoca || hoje.slice(0, 4)).replace(/[\\/]/g, '-')}.xlsx`;
      XLSX.writeFile(wb, nome);
      const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const up = await guardarNoOneDrive(nome, new Blob([XLSX.write(wb, {bookType: 'xlsx', type: 'array'})], {type})).catch(() => null);
      toast(up ? 'Excel guardado aqui e no OneDrive' : 'Excel guardado');
    } catch (err) { toast('Não deu para exportar: ' + err.message); }
    finally { btn.disabled = false; }
  };
  main.querySelector('#nj').onclick = async () => { const j = await novoJogo(); ctx.go('#/jogo/' + j.id); };
  draw();
}
