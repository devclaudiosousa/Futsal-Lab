import {db} from '../db.js';
import {esc, toast, copy, longDate, weekday} from '../ui.js';
import {atletas, marcadorSet, resultado, placar, desfecho, jogoTitulo, config, FONTES} from '../data.js';
import {playerStats, quartets, goalsAgainst, mmss, minLabel} from '../stats.js';
import {field} from './common.js';
import {lerTempo} from '../importar-tempos.js';

let srcPref = null;

export async function render(main, [id], ctx) {
  let j = await db.get('jogos', id);
  ctx.title('Jogo', '#/epoca');
  if (!j) { main.innerHTML = '<div class="empty">Este jogo já não existe.<a class="btn" href="#/epoca">Voltar à época</a></div>'; return; }
  const [ats, cfg] = await Promise.all([atletas(true), config()]);
  const byId = Object.fromEntries(ats.map(a => [a.id, a]));
  let confirmDel = false;
  let pend = null;
  // As marcações são do marcador: guarda sempre as que estão na base de dados, não a cópia desta página
  const save = async () => { clearTimeout(pend); pend = null; const cur = await db.get('jogos', j.id); j = await db.put('jogos', {...j, marcador: cur ? cur.marcador : j.marcador, aovivo: cur ? cur.aovivo : j.aovivo}); };
  const saveLater = () => { clearTimeout(pend); pend = setTimeout(save, 400); };

  const convText = () => {
    const conv = (j.convocados || []).map(i => byId[i]).filter(Boolean).sort((a, b) => (parseInt(a.num) || 99) - (parseInt(b.num) || 99));
    const [h, m] = (j.hora || '00:00').split(':').map(Number), c = (h * 60 + m - (+j.concentracao || 0) + 1440) % 1440;
    return `Convocatória · ${jogoTitulo(j, cfg.clube)}\n${weekday(j.data)}, ${longDate(j.data).split(', ')[1]}, ${j.hora || ''}${j.local ? ' · ' + j.local : ''}` +
      (+j.concentracao ? `\nConcentração: ${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}` : '') +
      `\n\n${conv.map(a => `${a.num} ${a.nome || ''}`.trim()).join('\n')}`;
  };

  const draw = () => {
    const r = resultado(j), d = desfecho(r);
    const vivoN = j.marcador?.vivo?.events?.length || 0, vidN = j.marcador?.video?.events?.length || 0;
    const {src, events, fontes: fontesJ} = marcadorSet(j, srcPref);
    const ps = events.length ? playerStats(events) : [];
    const psByNum = Object.fromEntries(ps.map(p => [p.n, p]));
    const qs = events.length ? quartets(events) : [];
    const ga = events.length ? goalsAgainst(events) : [];
    const temLinhas = events.some(e => e.type === 'linha');
    const conv = new Set(j.convocados || []);
    const convList = ats.filter(a => conv.has(a.id));
    const ativos = ats.filter(a => a.ativo !== false || conv.has(a.id));
    // sem Ao vivo nem substituições no vídeo, os tempos podem ser escritos à mão
    const manual = !j.aovivo?.events?.some(e => e.type === 'kickoff') && !temLinhas;
    const manList = manual ? ats.filter(a => conv.has(a.id) || j.minutos?.[a.id]) : [];
    const bestQ = qs.filter(q => q.seg >= 120).reduce((b, q) => !b || (q.gm - q.gs) > (b.gm - b.gs) || ((q.gm - q.gs) === (b.gm - b.gs) && q.rm - q.rs > b.rm - b.rs) ? q : b, null);

    main.innerHTML = `
      <div class="hero">
        <span class="kick">${esc(j.competicao || 'Jogo')} · ${longDate(j.data)}${j.hora ? ', ' + esc(j.hora) : ''}</span>
        <div class="row between"><h3>${esc(jogoTitulo(j, cfg.clube))}</h3>${r ? `<span class="row"><span class="score">${placar(j, r)}</span><span class="pill ${d[1]}">${d[0]}</span></span>` : ''}</div>
        <div class="row"><a class="btn primary" href="#/aovivo/${j.id}">Ao vivo</a><a class="btn" href="marcador.html?jogo=${j.id}">Vídeo</a></div>
        <p class="small muted">${j.aovivo?.events?.length ? `Ao vivo: ${j.aovivo.events.length} toques` : vivoN ? `Ao vivo antigo: ${vivoN} eventos` : 'Ao vivo: por marcar'} · ${vidN ? `Vídeo: ${vidN} eventos${j.marcador?.video?.nome ? ' (' + esc(j.marcador.video.nome) + ')' : ''}` : 'Vídeo: por analisar'}</p>
      </div>

      <details class="panel" ${j.adversario ? '' : 'open'}><summary><h2 style="display:inline">Dados do jogo</h2></summary>
        <div class="fields">
          ${field('adversario', 'Adversário', j.adversario, 'maxlength="40" placeholder="ex.: CD Angrense"', true)}
          ${field('competicao', 'Competição', j.competicao, 'maxlength="40" placeholder="Campeonato, Taça…"')}
          ${field('local', 'Local', j.local, 'maxlength="60"')}
          ${field('data', 'Data', j.data, 'type="date"')}${field('hora', 'Hora', j.hora, 'type="time"')}
          ${field('concentracao', 'Concentração (min antes)', j.concentracao, 'type="number" inputmode="numeric" min="0" max="240"')}
          ${field('videoUrl', 'Vídeo do jogo (link do YouTube)', j.videoUrl, 'type="url" inputmode="url" placeholder="https://youtu.be/…"', true)}
          <label class="f"><span>Jogamos</span><select id="casa"><option value="1"${j.casa !== false ? ' selected' : ''}>Em casa</option><option value="0"${j.casa === false ? ' selected' : ''}>Fora</option></select></label>
          ${field('golosNos', `Golos ${esc(cfg.clube)} (manual)`, j.golosNos, `type="number" inputmode="numeric" min="0" placeholder="${r && !r.manual ? r.a : ''}"`)}
          ${field('golosEles', 'Golos adversário (manual)', j.golosEles, `type="number" inputmode="numeric" min="0" placeholder="${r && !r.manual ? r.b : ''}"`)}
        </div>
        <p class="small muted">O resultado vem do Ao vivo ou do Vídeo. Preenche à mão só se não marcaste o jogo.</p>
      </details>

      <section class="panel"><div class="row between"><h2>Convocatória</h2><span class="small muted">${conv.size} convocados${conv.size > 14 ? ' <span class="pill warn">mais de 14</span>' : ''}</span></div>
        ${ativos.length ? `<div class="chips">${ativos.map(a => `<button class="chip" data-conv="${a.id}" aria-pressed="${conv.has(a.id)}">${esc(a.num)} ${esc(a.nome || '')}</button>`).join('')}</div>
        <div class="row"><button id="copyConv" ${conv.size ? '' : 'disabled'}>Copiar para o grupo</button><button id="allConv" class="ghost">Todos</button></div>` : '<p class="muted">Sem atletas. <a href="#/plantel">Pôr o plantel</a></p>'}
      </section>

      ${convList.length ? `<section class="panel"><h2>Notas do jogo (1–10)</h2>
        <div class="tw"><table><thead><tr><th>Atleta</th><th>Tempo</th><th>Golos</th><th>Nota</th></tr></thead><tbody>
        ${convList.map(a => { const p = psByNum[a.num], seg = p?.seg || (manual ? j.minutos?.[a.id] : 0); return `<tr><td><b>${esc(a.num)}</b> ${esc(a.nome || '')}</td><td>${seg ? minLabel(seg) : '–'}</td><td>${p?.gol || 0}</td>
          <td><select id="nota-${a.id}" data-nota="${a.id}" aria-label="Nota de ${esc(a.nome || a.num)}" style="width:76px;min-height:34px;padding:4px"><option value="">–</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option${+(j.notas || {})[a.id] === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td></tr>`; }).join('')}
        </tbody></table></div></section>` : ''}

      ${manList.length ? `<details class="panel" id="manDet"><summary><h2 style="display:inline">Tempos de jogo à mão</h2> <span class="small muted">${Object.keys(j.minutos || {}).length ? Math.round(Object.values(j.minutos).reduce((a, b) => a + b, 0) / 60) + "' no total" : 'por preencher'}</span></summary>
        <p class="small muted">Para jogos sem Ao vivo. Escreve 15:38 ou só os minutos (28). Entram no Excel da época.</p>
        <div class="tw"><table><thead><tr><th>Atleta</th><th>Tempo</th></tr></thead><tbody>
        ${manList.map(a => `<tr><td><b>${esc(a.num || '–')}</b> ${esc(a.nome || '')}</td><td><input data-min="${a.id}" value="${j.minutos?.[a.id] ? mmss(j.minutos[a.id]) : ''}" inputmode="numeric" placeholder="0:00" style="width:90px;min-height:34px;padding:4px" aria-label="Tempo de ${esc(a.nome || a.num)}"></td></tr>`).join('')}
        </tbody></table></div><p class="small" id="manMsg" aria-live="polite"></p></details>` : ''}

      ${events.length ? `<section class="stack" style="gap:12px">
        <div class="row between"><h2>Estatística</h2>
          ${fontesJ.length > 1 ? `<div class="seg" role="group" aria-label="Origem">${fontesJ.map(f => `<button data-src="${f}" aria-pressed="${src === f}">${FONTES[f]}</button>`).join('')}</div>` : `<span class="pill">${FONTES[src]}</span>`}</div>
        ${!temLinhas ? '<div class="banner">Sem substituições registadas. Para teres tempo em campo e quartetos, usa o Ao vivo: as substituições ficam registadas com o tempo útil.</div>' : ''}
        <div class="tw"><table><thead><tr><th>Atleta</th><th>Tempo</th><th>Gol.</th><th>Ast.</th><th>Rem.</th><th>Enq.</th><th>Passe</th><th>Perd.</th><th>Recup.</th><th>Faltas</th></tr></thead><tbody>
          ${ps.map(p => `<tr><td><b>${esc(p.n)}</b> ${esc(p.nome)}</td><td>${p.seg ? mmss(p.seg) : '–'}</td><td>${p.gol}</td><td>${p.ast}</td><td>${p.rem}</td><td>${p.enq}</td>
            <td>${p.pc + p.pf ? Math.round(100 * p.pc / (p.pc + p.pf)) + '%' : '–'}</td><td>${p.perd}</td><td>${p.recup}</td><td>${p.falta}</td></tr>`).join('')}
        </tbody></table></div>
        ${qs.length ? `<h2>Quartetos</h2>
          <div class="tw"><table><thead><tr><th>Quarteto</th><th>Tempo</th><th>Golos</th><th>Saldo</th><th>Remates</th><th>Recup.</th><th>Perdas</th><th>Passe</th></tr></thead><tbody>
          ${qs.map(q => { const s = q.gm - q.gs; return `<tr><td><b>${q.nums.join(' · ')}</b>${q === bestQ ? ' <span class="pill ok">melhor saldo</span>' : ''}</td><td>${mmss(q.seg)}</td><td>${q.gm}:${q.gs}</td>
            <td class="${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}">${s > 0 ? '+' : ''}${s}</td><td>${q.rm}:${q.rs}</td><td>${q.rec}</td><td>${q.perd}</td><td>${q.pc + q.pf ? Math.round(100 * q.pc / (q.pc + q.pf)) + '%' : '–'}</td></tr>`; }).join('')}
          </tbody></table></div><p class="small muted">Quarteto = os quatro jogadores de campo, sem o GR. ${src === 'banco' ? 'Tempo útil, do Ao vivo.' : src === 'vivo' ? 'Ao vivo antigo do marcador: tempo real desde o apito (inclui paragens).' : 'Tempo do vídeo.'}</p>` : ''}
        ${ga.length ? `<h2>Como sofremos os golos</h2><div class="list">${ga.map(g => `<div class="item"><span class="pill crit">${g.parte}.ª · ${mmss(g.t)}</span><div class="main">
          <b>${g.quarteto ? 'Em campo: ' + g.quarteto.split('-').join(' · ') + (g.gr ? ' · GR ' + esc(g.gr) : '') : 'Sem registo de quem estava em campo'}</b>
          <span>${[g.zona && 'remate ' + g.zona, g.antes && 'depois de ' + g.antes, g.lance && 'lance: ' + g.lance, g.nota].filter(Boolean).map(esc).join(' · ') || 'Sem mais detalhe marcado'}</span></div></div>`).join('')}</div>` : ''}
      </section>` : ''}

      <div class="row"><button class="danger" id="del">Apagar jogo</button></div>
      ${confirmDel ? '<div class="confirm">Apagar este jogo e as marcações? <button id="delY" class="primary" style="background:var(--crit);border-color:var(--crit)">Apagar</button><button id="delN">Cancelar</button></div>' : ''}`;
    wire();
  };

  const wire = () => {
    ['adversario', 'competicao', 'local', 'data', 'hora', 'concentracao', 'videoUrl', 'golosNos', 'golosEles'].forEach(k => {
      main.querySelector('#' + k).oninput = e => { j[k] = e.target.value; saveLater(); };
      main.querySelector('#' + k).onchange = () => { save().then(() => { if (['adversario', 'golosNos', 'golosEles'].includes(k)) draw(); }); };
    });
    main.querySelector('#casa').onchange = async e => { j.casa = e.target.value === '1'; await save(); draw(); };
    main.querySelectorAll('[data-nota]').forEach(s => s.onchange = async e => { j.notas = {...j.notas, [e.target.dataset.nota]: e.target.value ? +e.target.value : undefined}; if (!e.target.value) delete j.notas[e.target.dataset.nota]; await save(); });
    main.querySelectorAll('[data-min]').forEach(inp => inp.onchange = async e => {
      const v = lerTempo(e.target.value), m = main.querySelector('#manMsg');
      if (v == null) { m.textContent = 'Tempo inválido: usa 15:38 ou 28.'; m.style.color = 'var(--crit)'; return; }
      const mins = {...(j.minutos || {})};
      if (v > 0) mins[e.target.dataset.min] = v; else delete mins[e.target.dataset.min];
      j.minutos = mins; await save(); draw(); main.querySelector('#manDet').open = true;
    });
    main.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { srcPref = b.dataset.src; draw(); });
    const cc = main.querySelector('#copyConv'); if (cc) cc.onclick = async () => { const ok = await copy(convText()); toast(ok ? 'Convocatória copiada' : 'Não deu para copiar neste browser'); };
    const ac = main.querySelector('#allConv'); if (ac) ac.onclick = async () => { j.convocados = ats.filter(a => a.ativo !== false).map(a => a.id); await save(); draw(); };
    main.querySelector('#del').onclick = () => { confirmDel = true; draw(); };
    const dy = main.querySelector('#delY'); if (dy) dy.onclick = async () => { await db.del('jogos', j.id); toast('Jogo apagado'); ctx.go('#/epoca'); };
    const dn = main.querySelector('#delN'); if (dn) dn.onclick = () => { confirmDel = false; draw(); };
  };
  main.onclick = async e => {
    const b = e.target.closest('[data-conv]'); if (!b) return;
    const s = new Set(j.convocados || []); s.has(b.dataset.conv) ? s.delete(b.dataset.conv) : s.add(b.dataset.conv);
    j.convocados = [...s]; await save(); draw();
  };
  draw();
  return () => { main.onclick = null; if (pend) save(); };
}
