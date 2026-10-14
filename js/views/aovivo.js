// Jogo ao vivo no banco: relógio de tempo útil, substituições, golos, remates e situações.
// Substitui o Control-Stats. Cada toque é um evento gravado de imediato no jogo (jogo.aovivo).
import {db, config} from '../db.js';
import {esc, toast} from '../ui.js';
import * as L from '../live/engine.js';
import {exportJogoAoVivo} from '../live/excel.js';

const LONG = 600;

export async function render(main, [id], ctx) {
  let j = await db.get('jogos', id);
  ctx.title('Ao vivo', '#/jogo/' + id);
  if (!j) { main.innerHTML = '<div class="empty">Este jogo já não existe.<a class="btn" href="#/epoca">Voltar à época</a></div>'; return; }
  const cfg = await config();
  let live = j.aovivo || await novoLive(j);
  let sel = null, modal = null, showTab = false, showReg = false, wake = null;
  document.body.classList.add('live-on');

  const save = async () => {
    const cur = await db.get('jogos', j.id) || j;          // não apaga o que outro ecrã mudou no jogo
    j = await db.put('jogos', {...cur, aovivo: live});
  };
  const set = async next => { if (next === live) return; live = next; await save(); draw(); };
  const add = ev => set(L.push(live, ev));

  const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {} };
  keepAwake();

  const nos = cfg.clube || 'Nós', adv = j.adversario || 'Adversário';
  const [labH, labA] = j.casa === false ? [adv, nos] : [nos, adv];
  const teamH = j.casa === false ? 'adv' : 'nos', teamA = j.casa === false ? 'nos' : 'adv';

  function draw() {
    const d = L.derive(live, Date.now());
    const per = live.periods[Math.max(0, d.per)];
    const running = d.phase === 'live';
    main.innerHTML = `<div class="live">
      <div class="sitbar" role="toolbar" aria-label="Situações">${L.SITUACOES.map(s => `<button class="sit${s.type === 'state' && d.states[s.group] === s.id ? ' on' : ''}${live.presets?.[s.id] ? ' preset' : ''}" data-sit="${s.id}" ${running ? '' : 'disabled'}>${esc(s.label)}</button>`).join('')}
        <button class="sit" data-act="repor" ${d.snapshot && running ? '' : 'disabled'}>Repor</button></div>

      <div class="clocks">
        <div class="cl"><span>Parte</span><b id="lvPer">${d.per < 0 ? '–' : esc(per.lbl)}</b></div>
        <div class="cl"><span>Tempo</span><b id="lvRun" class="${d.paused ? 'held' : ''}">${L.clock(d.run)}</b></div>
        <div class="cl big"><span>Tempo útil</span><b id="lvEff" class="${d.paused || d.stopped ? 'held' : ''}${d.effLeft < 0 ? ' over' : ''}">${running ? L.clock(d.effLeft) : '--:--'}</b></div>
      </div>
      <div class="ctl">
        ${d.canKickoff ? `<button class="primary" data-act="kickoff" ${d.nextPeriod ? '' : 'disabled'}>Início ${esc(d.nextPeriod || '')}</button>` : ''}
        ${running ? `<button data-act="stop" class="${d.stopped ? 'tog' : ''}" ${d.paused ? 'disabled' : ''}>${d.stopped ? 'Retomar' : 'Paragem'}</button>
          <button data-act="pause" class="${d.paused ? 'tog' : ''}">${d.paused ? 'Continuar' : 'Pausa'}</button>
          <button data-act="break">Fim da parte</button>` : ''}
        <button data-act="undo" title="Desfaz a última substituição, troca de posição ou situação">Desfazer</button>
      </div>

      <div class="scoreline">
        <button class="sc" data-goal="${teamH}">${esc(short(labH))}<b>${d.score[teamH]}</b><small>golo</small></button>
        <button class="sh" data-shot="${teamH}"><b>${d.shots[teamH]}</b><small>remates</small></button>
        <button class="sh" data-shot="${teamA}"><b>${d.shots[teamA]}</b><small>remates</small></button>
        <button class="sc" data-goal="${teamA}">${esc(short(labA))}<b>${d.score[teamA]}</b><small>golo</small></button>
      </div>
      <button class="foul${d.foulsNow >= 5 ? ' warn' : ''}" data-foul ${running ? '' : 'disabled'}>Falta<b>${d.foulsNow}</b><small>${d.foulsNow >= 5 ? 'a próxima dá livre de 10 m' : 'nesta parte'}</small></button>
      <p class="small muted hint">${hint(d)}</p>

      <div class="squad">${['Em campo', 'Banco'].map((h, k) => `<div class="grp"><h2>${h}</h2><div class="cards">${
        d.players.filter(p => p.active === (k === 0)).sort((a, b) => k === 0 ? L.SLOTS.indexOf(a.slot) - L.SLOTS.indexOf(b.slot) : (parseInt(a.num) || 99) - (parseInt(b.num) || 99))
          .map(p => card(p, d)).join('') || '<p class="muted small">—</p>'}</div></div>`).join('')}</div>

      <details class="panel" ${showReg ? 'open' : ''} id="regDet"><summary><h2 style="display:inline">Golos, remates e faltas (${registo(d).length})</h2></summary>${regHTML(d)}</details>
      <details class="panel" ${showTab ? 'open' : ''} id="tabDet"><summary><h2 style="display:inline">Tempos por parte</h2></summary>${tabela(d)}</details>
      <div class="row"><button id="xls">Exportar Excel (formato Control-Stats)</button><a class="btn" href="#/jogo/${j.id}">Ver o jogo</a></div>
      ${modal || ''}
    </div>`;
    wire(d);
  }

  function card(p, d) {
    const t = p.active ? p.stintPlay : p.stintRest;
    return `<button class="pc${p.active ? ' on' : ''}${sel === p.id ? ' sel' : ''}" data-p="${p.id}">
      <span class="no">${esc(p.num)}</span><span class="nm" title="${esc(p.nome || '')}">${esc(apelido(p.nome))}</span>
      ${p.slot ? `<span class="slot">${L.SLOT_LBL[p.slot]}</span>` : ''}
      <span class="tm mono" data-tm="${p.id}">${L.clock(t)}</span>
      <span class="meta mono"><span title="Entradas nesta parte">↻${p.rot[Math.max(0, d.per)]}</span><span title="Rácio jogo/descanso desde a última troca" class="${p.stintWR > 1.1 ? 'hot' : p.stintWR < 0.9 ? 'cool' : ''}">${p.stintWR.toFixed(2)}</span></span>
    </button>`;
  }
  // Registo editável: golos (nossos e sofridos), remates nossos e faltas, com o tempo útil de cada um
  function registo(d) {
    const quando = Object.fromEntries(d.rows.filter(r => r.id).map(r => [r.id, r]));
    return live.events.filter(e => e.type === 'goal' || e.type === 'foul' || (e.type === 'shot' && e.team === 'nos'))
      .map(e => ({e, r: quando[e.id] || d.goals.find(g => g.id === e.id) || d.fouls.find(f => f.id === e.id)}))
      .filter(x => x.r).reverse();
  }
  function regHTML(d) {
    const nome = id => { const p = d.byId[id]; return p ? `${p.num} ${apelido(p.nome)}` : ''; };
    const L2 = {goal: e => e.team === 'nos' ? 'Golo marcado' : 'Golo sofrido', shot: () => 'Remate', foul: () => 'Falta'};
    const items = registo(d);
    if (!items.length) return '<p class="muted small">Ainda nada marcado.</p>';
    return `<div class="list">${items.map(({e, r}) => {
      const det = e.type === 'goal' && e.team === 'nos' ? [e.by ? nome(e.by) : '<span class="pill warn">sem autor</span>', e.ast ? 'assist. ' + nome(e.ast) : ''].filter(Boolean).join(' · ')
        : e.type === 'shot' ? (e.by ? nome(e.by) : '<span class="pill warn">sem autor</span>')
        : e.type === 'foul' ? [e.by ? nome(e.by) : '<span class="pill warn">sem jogador</span>', e.zona || '<span class="pill warn">sem zona</span>'].join(' · ') : '';
      return `<div class="item"><span class="pill${e.type === 'goal' ? (e.team === 'nos' ? ' ok' : ' crit') : ''}">${esc(live.periods[r.per]?.lbl || '')} ${L.clock(r.eff)}</span>
        <div class="main"><b>${L2[e.type](e)}</b><span>${det}</span></div>
        ${e.type === 'goal' && e.team === 'adv' ? '' : `<button class="ghost" data-edit="${e.id}">Editar</button>`}<button class="ghost danger icon" data-del="${e.id}" aria-label="Apagar">✕</button></div>`;
    }).join('')}</div>`;
  }
  function hint(d) {
    if (sel) return 'Toca no jogador que entra ou sai. Toca outra vez para cancelar.';
    if (d.phase === 'pre') return 'Escolhe o cinco inicial: toca num jogador em campo e noutro do banco para trocar. Pressão longa no cartão muda a posição.';
    if (d.phase === 'break') return `Intervalo. ${d.nextPeriod ? 'Ajusta o cinco e carrega em Início ' + d.nextPeriod + '.' : ''}`;
    if (d.phase === 'end') return 'Jogo terminado.';
    return 'Toque no golo ou remate soma; pressão longa anula o último. Pressão longa numa situação define o preset.';
  }
  function tabela(d) {
    const pers = live.periods.map((p, i) => i).filter(i => i <= Math.max(0, d.per));
    const rows = [['Rotações', p => i => p.rot[i]], ['Tempo útil', p => i => L.clock(p.play[i])], ['Descanso', p => i => L.clock(p.rest[i])], ['J/D', p => i => p.wr[i].toFixed(2)], ['% da parte', p => i => p.pct[i] + '%']];
    return `<div class="tw"><table><thead><tr><th>Jogador</th>${pers.map(i => rows.map(([n]) => `<th>${esc(live.periods[i].lbl)} ${n}</th>`).join('')).join('')}<th>Total útil</th><th>Total descanso</th></tr></thead><tbody>
      ${d.players.map(p => `<tr><td><b>${esc(p.num)}</b> ${esc(p.nome || '')}</td>${pers.map(i => rows.map(([, f]) => `<td>${f(p)(i)}</td>`).join('')).join('')}<td>${L.clock(p.totalPlay)}</td><td>${L.clock(p.totalRest)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function wire(d) {
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, d));
    main.querySelectorAll('[data-p]').forEach(b => press(b, () => tapPlayer(b.dataset.p, d), () => openPos(b.dataset.p, d)));
    main.querySelectorAll('[data-goal]').forEach(b => press(b, async () => {
      const team = b.dataset.goal;
      await add({type: 'goal', team});
      if (team === 'nos') askAuthor(live.events.at(-1).id, 'by');
    }, () => {
      if (!d.score[b.dataset.goal]) return;
      if (confirm('Anular o último golo?')) set(L.undoGoal(live, b.dataset.goal));
    }));
    main.querySelectorAll('[data-shot]').forEach(b => press(b, async () => {
      const team = b.dataset.shot;
      await add({type: 'shot', team});
      if (team === 'nos') askAuthor(live.events.at(-1).id, 'shot');
    }, () => set(L.undoShot(live, b.dataset.shot))));
    const fb = main.querySelector('[data-foul]');
    if (fb) press(fb, () => askFoul(), () => { if (d.fouls.length && confirm('Anular a última falta?')) set(L.undoFoul(live)); });
    main.querySelectorAll('[data-sit]').forEach(b => press(b, () => runSit(b.dataset.sit), () => openPreset(b.dataset.sit, d)));
    main.querySelector('#tabDet').ontoggle = e => { showTab = e.target.open; };
    main.querySelector('#regDet').ontoggle = e => { showReg = e.target.open; };
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const e = live.events.find(x => x.id === b.dataset.edit); if (!e) return;
      if (e.type === 'foul') askFoul(e.zona || '', e.id);
      else askAuthor(e.id, e.type === 'goal' ? 'by' : 'shot');
    });
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Apagar este registo?')) set(L.removeEvent(live, b.dataset.del)); });
    main.querySelector('#xls').onclick = () => exportJogoAoVivo(j, live, cfg).catch(e => toast('Não deu para exportar: ' + e.message));
    const m = main.querySelector('.modal');
    if (m) {
      m.onclick = e => { if (e.target === m) { modal = null; draw(); } };
      m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { modal = null; draw(); });
      m.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { modal = null; add({type: 'pos', p: b.dataset.pid, slot: b.dataset.slot}); });
      const ps = m.querySelector('#psave');
      if (ps) ps.onclick = () => savePreset(m);
      const pc = m.querySelector('#pclear');
      if (pc) pc.onclick = () => { const {[pc.dataset.sid]: _, ...rest} = live.presets || {}; modal = null; set({...live, presets: rest}); };
    }
  }

  function act(a, d) {
    if (a === 'kickoff') add({type: 'kickoff'});
    else if (a === 'stop') add({type: 'stop'});
    else if (a === 'pause') add({type: 'pause'});
    else if (a === 'break') { if (confirm(`Terminar a ${live.periods[d.per].lbl}?`)) add({type: 'break'}); }
    else if (a === 'undo') { const n = L.undoLineupChange(live); if (n === live) toast('Nada para desfazer'); else set(n); }
    else if (a === 'repor') set(L.repor(live));
  }
  function tapPlayer(pid, d) {
    if (!sel) { sel = pid; draw(); return; }
    if (sel === pid) { sel = null; draw(); return; }
    const ev = L.subFromPair(d, sel, pid);
    sel = null;
    if (!ev) { sel = pid; draw(); return; }      // dois do mesmo lado: passa a seleção para o último
    add(ev);
  }
  function runSit(sid) {
    const r = L.runSituation(live, L.sitById(sid));
    if (r.error) { alert(r.error); return; }
    set(r.live);
  }
  // Depois do golo marcado: quem marcou e quem assistiu (pode saltar-se)
  // field: 'by' (golo, depois pergunta a assistência), 'ast' ou 'shot' (remate: só o autor)
  function askAuthor(gid, field, by = null) {
    const d = L.derive(live, Date.now());
    const opts = d.players.filter(p => p.id !== by).sort((a, b) => (b.active - a.active) || (parseInt(a.num) || 99) - (parseInt(b.num) || 99));
    const titulo = {by: 'Golo · quem marcou?', ast: 'Assistência?', shot: 'Remate · quem rematou?'}[field];
    modal = `<div class="modal"><div class="box"><h3>${titulo}</h3>
      <div class="pick">${opts.map(p => `<button data-author="${p.id}" class="${p.active ? 'on' : ''}"><b>${esc(p.num)}</b> ${esc(apelido(p.nome))}</button>`).join('')}</div>
      <div class="row"><button data-author="" class="ghost">${field === 'ast' ? 'Sem assistência' : 'Saltar'}</button></div></div></div>`;
    draw();
    main.querySelectorAll('[data-author]').forEach(b => b.onclick = async () => {
      const v = b.dataset.author || null;
      modal = null;
      await set(L.setGoalAuthors(live, gid, field === 'ast' ? {ast: v} : {by: v}));
      if (field === 'by' && v) askAuthor(gid, 'ast', v);
    });
  }
  // Falta nossa: zona (MD/MO) e quem fez, dos que estão em campo
  function askFoul(zona = '', editId = null) {
    const d = L.derive(live, Date.now());
    const on = editId ? [...d.players].sort((a, b) => (b.active - a.active) || (parseInt(a.num) || 99) - (parseInt(b.num) || 99))
      : d.players.filter(p => p.active).sort((a, b) => L.SLOTS.indexOf(a.slot) - L.SLOTS.indexOf(b.slot));
    modal = `<div class="modal"><div class="box"><h3>Falta · quem fez?</h3>
      <div class="seg zseg" role="group" aria-label="Zona"><button data-zona="MD" aria-pressed="${zona === 'MD'}">MD</button><button data-zona="MO" aria-pressed="${zona === 'MO'}">MO</button></div>
      <div class="pick">${on.map(p => `<button data-fby="${p.id}" class="${p.active ? 'on' : ''}"><b>${esc(p.num)}</b> ${esc(apelido(p.nome))}<small class="muted">${L.SLOT_LBL[p.slot] || ''}</small></button>`).join('')}</div>
      <div class="row"><button data-fby="" class="ghost">Sem jogador</button><button data-close class="ghost">Cancelar</button></div></div></div>`;
    draw();
    main.querySelectorAll('[data-zona]').forEach(b => b.onclick = () => askFoul(zona === b.dataset.zona ? '' : b.dataset.zona, editId));
    main.querySelectorAll('[data-fby]').forEach(b => b.onclick = () => {
      modal = null;
      if (editId) set(L.editEvent(live, editId, {by: b.dataset.fby || null, zona}));
      else add({type: 'foul', team: 'nos', by: b.dataset.fby || null, zona});
    });
  }
  function openPos(pid, d) {
    const p = d.byId[pid];
    if (!p?.slot) { toast('Só os jogadores em campo têm posição'); return; }
    modal = `<div class="modal"><div class="box"><h3>Posição: ${esc(p.num)} ${esc(p.nome || '')}</h3>
      ${L.SLOTS.map(s => { const o = d.court[s]; const q = o && d.byId[o]; return `<button data-slot="${s}" data-pid="${pid}" ${s === p.slot ? 'disabled' : ''}>${L.SLOT_LBL[s]}${q && s !== p.slot ? ` ⇄ ${esc(q.num)} ${esc(q.nome || '')}` : ''}</button>`; }).join('')}
      <button data-close class="ghost">Cancelar</button></div></div>`;
    draw();
  }
  function openPreset(sid) {
    const sit = L.sitById(sid), pr = live.presets?.[sid] || {};
    const opts = v => `<option value="">—</option>` + live.plantel.map(p => `<option value="${p.id}"${pr[v] === p.id ? ' selected' : ''}>${esc(p.num)} ${esc(p.nome || '')}</option>`).join('');
    modal = `<div class="modal"><div class="box"><h3>Preset: ${esc(sit.label)}</h3>
      ${L.slotsFor(sit).map(s => `<label class="f"><span>${s === 'gr' ? (sid === '5x4' ? 'GR (5.º jogador)' : 'GR') : L.SLOT_LBL[s]}</span><select data-ps="${s}">${opts(s)}</select></label>`).join('')}
      <p class="small" id="pmsg" style="color:var(--crit)"></p>
      <div class="row"><button class="primary" id="psave" data-sid="${sid}">Guardar</button>${live.presets?.[sid] ? `<button id="pclear" data-sid="${sid}">Limpar</button>` : ''}<button data-close class="ghost">Cancelar</button></div></div></div>`;
    draw();
  }
  function savePreset(m) {
    const sid = m.querySelector('#psave').dataset.sid, vals = {};
    for (const s of m.querySelectorAll('[data-ps]')) {
      if (!s.value) { m.querySelector('#pmsg').textContent = 'Preenche todas as posições.'; return; }
      vals[s.dataset.ps] = s.value;
    }
    if (new Set(Object.values(vals)).size !== Object.values(vals).length) { m.querySelector('#pmsg').textContent = 'Há jogadores repetidos.'; return; }
    modal = null;
    set({...live, presets: {...(live.presets || {}), [sid]: vals}});
  }

  // Toque vs pressão longa (como no Control-Stats)
  function press(el, onTap, onHold) {
    let tm = null;
    const cancel = () => { clearTimeout(tm); tm = null; el.classList.remove('pressing'); };
    el.addEventListener('pointerdown', e => {
      if (el.disabled || e.button > 0) return;
      el.classList.add('pressing');
      tm = setTimeout(() => { cancel(); try { navigator.vibrate?.(30); } catch (x) {} onHold(); }, LONG);
    });
    el.addEventListener('pointerup', () => { if (tm) { cancel(); onTap(); } });
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Relógios e tempos dos cartões atualizam sem redesenhar a página
  const tick = () => {
    if (modal) return;
    const d = L.derive(live, Date.now());
    const set2 = (sel2, v) => { const el = main.querySelector(sel2); if (el && el.textContent !== v) el.textContent = v; };
    set2('#lvRun', L.clock(d.run));
    if (d.phase === 'live') set2('#lvEff', L.clock(d.effLeft));
    main.querySelector('#lvEff')?.classList.toggle('over', d.phase === 'live' && d.effLeft < 0);
    for (const p of d.players) set2(`[data-tm="${p.id}"]`, L.clock(p.active ? p.stintPlay : p.stintRest));
  };
  const iv = setInterval(tick, 500);
  const vis = () => { if (document.visibilityState === 'visible') { keepAwake(); draw(); } };
  document.addEventListener('visibilitychange', vis);

  if (!j.aovivo) await save();
  draw();
  return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); document.body.classList.remove('live-on'); try { wake?.release(); } catch (e) {} };
}

const apelido = n => { const w = (n || '').trim().split(/\s+/); return w.length > 1 ? w.at(-1) : w[0] || ''; };
const short = s => (s || '').length > 12 ? s.slice(0, 11) + '…' : s;

// Plantel do jogo: convocados (ou todos os ativos). Presets herdados do último jogo ao vivo.
async function novoLive(j) {
  const ats = (await db.all('atletas')).filter(a => (j.convocados || []).length ? j.convocados.includes(a.id) : a.ativo !== false)
    .sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
  const plantel = ats.map(a => ({id: a.id, num: String(a.num || ''), nome: a.nome || '', pos: a.posicao || ''}));
  const live = L.newLive({plantel});
  const prev = (await db.all('jogos')).filter(x => x.aovivo?.presets && x.id !== j.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
  if (prev) {
    const ids = new Set(plantel.map(p => p.id));
    live.presets = Object.fromEntries(Object.entries(prev.aovivo.presets).filter(([, v]) => Object.values(v).every(x => ids.has(x))));
  } else {
    // presets importados do Excel do Control-Stats, guardados por número de camisola
    const byNum = Object.fromEntries(plantel.map(p => [p.num, p.id]));
    const pre = (await db.get('definicoes', 'presets'))?.porNumero || await db.meta('presets') || {};
    live.presets = Object.fromEntries(Object.entries(pre).map(([sid, v]) => [sid, Object.fromEntries(Object.entries(v).map(([s, n]) => [s, byNum[n]]))])
      .filter(([, v]) => Object.values(v).every(Boolean)));
  }
  return live;
}
