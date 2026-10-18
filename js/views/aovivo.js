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
  // Antes do início do jogo o plantel acompanha a convocatória (e o plantel da app, se mudou entretanto)
  if (!live.events.some(e => e.type === 'kickoff')) {
    const fresh = await novoLive(j);
    const ids = new Set(fresh.plantel.map(p => p.id));
    const courtOk = L.SLOTS.every(s => live.court0?.[s] == null || ids.has(live.court0[s])) && L.SLOTS.some(s => live.court0?.[s]);
    live = {...live, plantel: fresh.plantel, court0: courtOk ? live.court0 : fresh.court0,
      events: live.events.filter(e => [e.off, e.on, e.p].every(x => x == null || ids.has(x))),
      presets: Object.keys(live.presets || {}).length ? live.presets : fresh.presets};
  }
  if (!live.plantel.length) {
    main.innerHTML = `<div class="hero"><span class="kick">Ao vivo</span><h3>Sem jogadores para este jogo</h3>
      <p class="muted">Põe o plantel primeiro. Se vens do Control-Stats, em Plantel carrega em <i>Importar Excel do Control-Stats</i> com o teu ficheiro de equipa: traz os jogadores, as posições e os presets das situações.</p>
      <div class="row"><a class="btn primary" href="#/plantel">Ir ao plantel</a><a class="btn" href="#/jogo/${j.id}">Convocatória do jogo</a></div></div>`;
    return;
  }
  let sel = null, modal = null, showTab = false, showReg = false, editPresets = false, wake = null;
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
    const bola = !running ? '' : d.paused
      ? `<button class="bola pausa" data-act="pause">PAUSA<small>desconto de tempo · toca para continuar</small></button>`
      : `<button class="bola ${d.stopped ? 'parada' : 'jogo'}" data-act="stop">${d.stopped ? 'BOLA PARADA' : 'BOLA EM JOGO'}<small>${d.stopped ? 'toca quando a bola voltar' : 'toca quando a bola sair'}</small></button>`;
    const inicio = d.canKickoff && d.nextPeriod ? `<button class="bola inicio" data-act="kickoff">INÍCIO${d.per < 0 ? '' : ' ' + esc(pc(d.nextPeriod)).toUpperCase()}<small>${d.per < 0 ? 'escolhe o cinco e começa o jogo' : 'ajusta o cinco e começa'}</small></button>` : '';
    const ordem = [...d.players].sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
    main.innerHTML = `<div class="live">
      <div class="sitbar" role="toolbar" aria-label="Situações">${L.SITUACOES.map(s => `<button class="sit${s.type === 'state' && d.states[s.group] === s.id ? ' on' : ''}${live.presets?.[s.id] ? ' preset' : ''}${editPresets ? ' editing' : ''}" data-sit="${s.id}">${esc(s.label)}</button>`).join('')}
        <button class="sit" data-act="repor" ${d.snapshot && running ? '' : 'disabled'}>Repor</button><span class="sp"></span><button class="sit edit${editPresets ? ' on' : ''}" data-act="presets" aria-pressed="${editPresets}">${editPresets ? '✓ Presets' : '✎ Presets'}</button></div>
      ${editPresets ? '<p class="small hint-edit">Toca numa situação para definir os jogadores do preset. Carrega em ✓ Presets para voltar a marcar.</p>' : ''}
      <div class="board">
        <div class="grade">${ordem.map(p => card(p, d)).join('')}</div>
        <div class="lado">
          <div class="relogio"><span class="lbl">${d.per < 0 ? 'Antes do jogo' : esc(pn(per.lbl))} · tempo útil</span>
            <b id="lvEff" class="mono ${d.paused || d.stopped ? 'held' : ''}${d.effLeft < 0 ? ' over' : ''}">${running ? L.clock(d.effLeft) : d.per < 0 ? L.clock(live.periods[0].min * 60) : '--:--'}</b>
            <span class="sub mono"><span>corrido <span id="lvRun">${L.clock(d.run)}</span></span><span class="${d.foulsNow >= 5 ? 'neg' : ''}">faltas ${d.foulsNow} · adv ${d.foulsAdvNow}</span></span></div>
          ${inicio}${bola}
          <div class="dois">
            <button class="sc nos" data-goal="nos"><span class="who">${esc(short(nos))}</span><b>${d.score.nos}</b><small>toque = golo</small></button>
            <button class="sc adv" data-goal="adv"><span class="who">${esc(short(adv))}</span><b>${d.score.adv}</b><small>toque = golo</small></button>
          </div>
          <div class="dois">
            <button class="b" data-shot="nos">Remate<small>nosso · ${d.shots.nos}</small></button>
            <button class="b" data-shot="adv">Remate<small>adv. · ${d.shots.adv}</small></button>
            <button class="b${d.foulsNow >= 5 ? ' warn' : ''}" data-foul>Falta<small>nós ${d.foulsNow} · adv ${d.foulsAdvNow}</small></button>
            <button class="b" data-card>Cartão<small>${d.cards.length ? d.cards.length + ' no jogo' : 'amarelo · vermelho'}</small></button>
            <button class="b" data-act="undo">↶ Desfazer<small>troca ou situação</small></button>
            ${running && !d.paused ? '<button class="b" data-act="pause">Desconto<small>de tempo</small></button>' : '<span></span>'}
          </div>
          ${running ? '<button class="b fim" data-fim>Fim da parte<small>manter premido</small></button>' : ''}
        </div>
      </div>
      <p class="small muted hint">${hint(d)}</p>

      <details class="panel" ${showReg ? 'open' : ''} id="regDet"><summary><h2 style="display:inline">Registo: golos, remates, faltas e cartões (${registo(d).length})</h2></summary>${regHTML(d)}</details>
      <details class="panel" ${showTab ? 'open' : ''} id="tabDet"><summary><h2 style="display:inline">Tempos por parte</h2></summary>${tabela(d)}</details>
      <div class="row"><button id="xls">Exportar Excel (formato Control-Stats)</button><a class="btn" href="#/jogo/${j.id}">Ver o jogo</a></div>
      ${modal || ''}
    </div>`;
    wire(d);
  }

  // Cartão do jogador: sempre no mesmo sítio (por número). Em campo: tempo desta entrada (verde → amarelo aos 4' → vermelho aos 6').
  // No banco: tempo a descansar; "descansado" quando já descansou o que jogou na última entrada.
  function card(p, d) {
    const t = p.active ? p.stintPlay : p.stintRest;
    const cor = p.active ? (p.stintPlay >= 360 ? ' red' : p.stintPlay >= 240 ? ' amb' : '') : '';
    const pronto = !p.active && p.lastStint >= 30 && p.stintRest >= p.lastStint;
    const cards = d.cards.filter(c => c.by === p.id).map(c => (c.cor === 'verm' ? '🟥' : '🟨')).join('');
    return `<button class="pc${p.active ? ' on' : ''}${cor}${pronto ? ' pronto' : ''}${sel === p.id ? ' sel' : ''}" data-p="${p.id}">
      <span class="h"><span class="no">${esc(p.num)}</span><span class="nm" title="${esc(p.nome || '')}">${esc(p.curto || p.nome || '')}</span>${cards ? `<span class="cart">${cards}</span>` : ''}</span>
      <span class="tm mono" data-tm="${p.id}">${L.clock(t)}</span>
      <span class="ft mono"><span data-tot="${p.id}">total ${L.clock(p.totalPlay)}</span><span data-ok="${p.id}">${pronto ? '✓ descansado' : '↻' + p.rot[Math.max(0, d.per)]}</span></span>
    </button>`;
  }
  // Registo editável: golos (nossos e sofridos), remates nossos e faltas, com o tempo útil de cada um
  function registo(d) {
    const quando = Object.fromEntries(d.rows.filter(r => r.id).map(r => [r.id, r]));
    return live.events.filter(e => e.type === 'goal' || e.type === 'foul' || e.type === 'card' || (e.type === 'shot' && e.team === 'nos'))
      .map(e => ({e, r: quando[e.id] || d.goals.find(g => g.id === e.id) || d.fouls.find(f => f.id === e.id) || d.foulsAdv.find(f => f.id === e.id) || d.cards.find(c => c.id === e.id)}))
      .filter(x => x.r).reverse();
  }
  function regHTML(d) {
    const nome = id => { const p = d.byId[id]; return p ? `${p.num} ${apelido(p)}` : ''; };
    const L2 = {goal: e => e.team === 'nos' ? 'Golo marcado' : 'Golo sofrido', shot: () => 'Remate', foul: e => e.team === 'adv' ? 'Falta do adversário' : 'Falta',
      card: e => `${e.cor === 'verm' ? '🟥 Vermelho' : '🟨 Amarelo'}${e.team === 'adv' ? ' · adversário' : ''}`};
    const items = registo(d);
    if (!items.length) return '<p class="muted small">Ainda nada marcado.</p>';
    return `<div class="list">${items.map(({e, r}) => {
      const det = e.type === 'goal' && e.team === 'nos' ? [e.by ? nome(e.by) : '<span class="pill warn">sem autor</span>', e.ast ? 'assist. ' + nome(e.ast) : ''].filter(Boolean).join(' · ')
        : e.type === 'shot' ? (e.by ? nome(e.by) : '<span class="pill warn">sem autor</span>')
        : e.type === 'foul' && e.team === 'adv' ? ''
        : e.type === 'foul' ? [e.by ? nome(e.by) : '<span class="pill warn">sem jogador</span>', e.zona || '<span class="pill warn">sem zona</span>'].join(' · ')
        : e.type === 'card' ? (e.team === 'adv' ? (e.num ? 'n.º ' + esc(e.num) : 'sem número') : (e.by ? nome(e.by) : '<span class="pill warn">sem jogador</span>')) : '';
      return `<div class="item"><span class="pill${e.type === 'goal' ? (e.team === 'nos' ? ' ok' : ' crit') : ''}">${r.per >= 0 ? esc(pc(live.periods[r.per]?.lbl)) + ' ' + L.clock(r.eff) : 'antes'}</span>
        <div class="main"><b>${L2[e.type](e)}</b><span>${det}</span></div>
        ${(e.type === 'goal' || e.type === 'foul') && e.team === 'adv' || e.type === 'card' ? '' : `<button class="ghost" data-edit="${e.id}">Editar</button>`}<button class="ghost danger icon" data-del="${e.id}" aria-label="Apagar">✕</button></div>`;
    }).join('')}</div>`;
  }
  function hint(d) {
    if (sel) return 'Toca no jogador que entra ou sai. Toca outra vez para cancelar.';
    if (d.phase === 'pre') return 'Escolhe o cinco inicial: toca num jogador em campo (contorno laranja) e noutro do banco para trocar.';
    if (d.phase === 'break' && d.per >= 1) return d.nextPeriod ? `Fim ${d.per >= 2 ? 'do' : 'da'} ${pn(live.periods[d.per].lbl).toLowerCase()}. ${d.per >= 2 ? 'Para o segundo prolongamento' : 'Se houver prolongamento'}, ajusta o cinco e carrega em Início ${pc(d.nextPeriod)}; se não, o jogo está terminado.` : 'Jogo terminado.';
    if (d.phase === 'break') return `Intervalo. ${d.nextPeriod ? 'Ajusta o cinco e carrega em Início ' + pc(d.nextPeriod) + '.' : ''}`;
    if (d.phase === 'end') return 'Jogo terminado.';
    return 'Troca: toca no jogador em campo e no do banco. Pressão longa no golo, remate ou falta anula o último.';
  }
  function tabela(d) {
    const pers = live.periods.map((p, i) => i).filter(i => i <= Math.max(0, d.per));
    const rows = [['Rotações', p => i => p.rot[i]], ['Tempo útil', p => i => L.clock(p.play[i])], ['Descanso', p => i => L.clock(p.rest[i])], ['J/D', p => i => p.wr[i].toFixed(2)], ['% da parte', p => i => p.pct[i] + '%']];
    return `<div class="tw"><table><thead><tr><th>Jogador</th>${pers.map(i => rows.map(([n]) => `<th>${esc(pc(live.periods[i].lbl))} ${n}</th>`).join('')).join('')}<th>Total útil</th><th>Total descanso</th></tr></thead><tbody>
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
    if (fb) press(fb, () => (d.phase === 'live' ? askFoul() : toast('As faltas contam durante a parte: carrega primeiro em Início.')), () => {
      const ult = L.lastOf(live, e => e.type === 'foul');
      if (ult && confirm(`Anular a última falta${ult.team === 'adv' ? ' do adversário' : ''}?`)) set(L.removeEvent(live, ult.id));
    });
    const cb = main.querySelector('[data-card]');
    if (cb) press(cb, () => askCard(), () => { if (d.cards.length && confirm('Anular o último cartão?')) set(L.undoCard(live)); });
    const fim = main.querySelector('[data-fim]');
    if (fim) press(fim, () => toast('Mantém premido para terminar a parte'), () => add({type: 'break'}));
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
    else if (a === 'break') { if (confirm(`Terminar ${/Prol/.test(pn(live.periods[d.per].lbl)) ? 'o' : 'a'} ${pn(live.periods[d.per].lbl).toLowerCase()}?`)) add({type: 'break'}); }
    else if (a === 'undo') { const n = L.undoLineupChange(live); if (n === live) toast('Nada para desfazer'); else set(n); }
    else if (a === 'repor') set(L.repor(live));
    else if (a === 'presets') { editPresets = !editPresets; draw(); }
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
    if (editPresets) { openPreset(sid); return; }
    if (L.derive(live, Date.now()).phase !== 'live') { toast('Começa a parte primeiro (Início). Para definir os jogadores, usa ✎ Presets.'); return; }
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
      <div class="pick">${opts.map(p => `<button data-author="${p.id}" class="${p.active ? 'on' : ''}"><b>${esc(p.num)}</b> ${esc(apelido(p))}</button>`).join('')}</div>
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
    modal = `<div class="modal"><div class="box"><h3>${editId ? 'Falta · quem fez?' : 'Falta nossa · quem fez?'}</h3>
      <div class="seg zseg" role="group" aria-label="Zona"><button data-zona="MD" aria-pressed="${zona === 'MD'}">MD</button><button data-zona="MO" aria-pressed="${zona === 'MO'}">MO</button></div>
      <div class="pick">${on.map(p => `<button data-fby="${p.id}" class="${p.active ? 'on' : ''}"><b>${esc(p.num)}</b> ${esc(apelido(p))}<small class="muted">${L.SLOT_LBL[p.slot] || ''}</small></button>`).join('')}</div>
      <div class="row"><button data-fby="" class="ghost">Sem jogador</button><button data-close class="ghost">Cancelar</button></div>
      ${editId ? '' : `<button class="fadv" data-fadv>Falta do <b>adversário</b><small>conta para as faltas deles (${d.foulsAdvNow} nesta parte)</small></button>`}</div></div>`;
    draw();
    const fa = main.querySelector('[data-fadv]'); if (fa) fa.onclick = () => { modal = null; add({type: 'foul', team: 'adv'}); };
    main.querySelectorAll('[data-zona]').forEach(b => b.onclick = () => askFoul(zona === b.dataset.zona ? '' : b.dataset.zona, editId));
    main.querySelectorAll('[data-fby]').forEach(b => b.onclick = () => {
      modal = null;
      if (editId) set(L.editEvent(live, editId, {by: b.dataset.fby || null, zona}));
      else add({type: 'foul', team: 'nos', by: b.dataset.fby || null, zona});
    });
  }
  // Cartão: cor → equipa → jogador (nosso) ou número (adversário). 3 toques.
  function askCard(cor = '', team = '', num = '') {
    const d = L.derive(live, Date.now());
    const passo = !cor ? 'cor' : !team ? 'team' : team === 'nos' ? 'nos' : 'adv';
    const lista = [...d.players].sort((a, b) => (b.active - a.active) || (parseInt(a.num) || 99) - (parseInt(b.num) || 99));
    const corTxt = cor === 'verm' ? '🟥 Vermelho' : '🟨 Amarelo';
    modal = `<div class="modal"><div class="box"><h3>${passo === 'cor' ? 'Cartão' : passo === 'team' ? corTxt + ' · a quem?' : passo === 'nos' ? corTxt + ' · que jogador?' : corTxt + ' · adversário n.º'}</h3>
      ${passo === 'cor' ? `<div class="dois"><button class="cartao am" data-cor="am">🟨 Amarelo</button><button class="cartao vm" data-cor="verm">🟥 Vermelho</button></div>` : ''}
      ${passo === 'team' ? `<div class="dois"><button class="cartao" data-team="nos">${esc(short(nos))}</button><button class="cartao" data-team="adv">${esc(short(adv))}</button></div>` : ''}
      ${passo === 'nos' ? `<div class="pick">${lista.map(p => `<button data-cby="${p.id}" class="${p.active ? 'on' : ''}"><b>${esc(p.num)}</b> ${esc(apelido(p))}</button>`).join('')}</div>` : ''}
      ${passo === 'adv' ? `<div class="numpad"><output>${esc(num) || '–'}</output>${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'].map(k => `<button data-k="${k}"${k === '✓' ? ' class="primary"' : ''}>${k}</button>`).join('')}</div>
        <div class="row"><button data-k="sem" class="ghost">Sem número</button></div>` : ''}
      <div class="row"><button data-close class="ghost">Cancelar</button></div></div></div>`;
    draw();
    main.querySelectorAll('[data-cor]').forEach(b => b.onclick = () => askCard(b.dataset.cor));
    main.querySelectorAll('[data-team]').forEach(b => b.onclick = () => askCard(cor, b.dataset.team));
    main.querySelectorAll('[data-cby]').forEach(b => b.onclick = () => { modal = null; add({type: 'card', cor, team: 'nos', by: b.dataset.cby}); });
    main.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === '✓' || k === 'sem') { modal = null; add({type: 'card', cor, team: 'adv', num: k === 'sem' ? '' : num}); return; }
      askCard(cor, team, k === '⌫' ? num.slice(0, -1) : (num + k).slice(0, 3));
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
    // toque = evento click (fiável em Android/iOS, também dentro de barras com scroll);
    // pressão longa = temporizador nos pointer events, ou o contextmenu do próprio sistema
    let tm = null, held = 0;
    const cancel = () => { clearTimeout(tm); tm = null; el.classList.remove('pressing'); };
    const hold = () => { cancel(); held = Date.now(); try { navigator.vibrate?.(30); } catch (x) {} onHold(); };
    el.addEventListener('pointerdown', e => { if (el.disabled || e.button > 0) return; cancel(); el.classList.add('pressing'); tm = setTimeout(hold, LONG); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', e => { e.preventDefault(); if (Date.now() - held > 1000) hold(); });
    el.addEventListener('click', e => { if (Date.now() - held < 800) { e.preventDefault(); return; } onTap(); });
  }

  // Relógios, tempos dos cartões e tabela atualizam sem redesenhar a página (também com um popup aberto)
  const tick = () => {
    const d = L.derive(live, Date.now());
    const set2 = (sel2, v) => { const el = main.querySelector(sel2); if (el && el.textContent !== v) el.textContent = v; };
    set2('#lvRun', L.clock(d.run));
    if (d.phase === 'live') set2('#lvEff', L.clock(d.effLeft));
    main.querySelector('#lvEff')?.classList.toggle('over', d.phase === 'live' && d.effLeft < 0);
    for (const p of d.players) {
      set2(`[data-tm="${p.id}"]`, L.clock(p.active ? p.stintPlay : p.stintRest));
      set2(`[data-tot="${p.id}"]`, 'total ' + L.clock(p.totalPlay));
      const pronto = !p.active && p.lastStint >= 30 && p.stintRest >= p.lastStint;
      set2(`[data-ok="${p.id}"]`, pronto ? '✓ descansado' : '↻' + p.rot[Math.max(0, d.per)]);
      const el = main.querySelector(`[data-p="${p.id}"]`);
      if (el) { el.classList.toggle('amb', p.active && p.stintPlay >= 240 && p.stintPlay < 360); el.classList.toggle('red', p.active && p.stintPlay >= 360); el.classList.toggle('pronto', pronto); }
    }
    const tb = main.querySelector('#tabDet');
    if (tb?.open && d.phase === 'live') { const box = tb.querySelector('.tw'); if (box) box.outerHTML = tabela(d); }
  };
  const iv = setInterval(tick, 500);
  const vis = () => { if (document.visibilityState === 'visible') { keepAwake(); draw(); } };
  document.addEventListener('visibilitychange', vis);

  if (!j.aovivo) await save();
  draw();
  return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); document.body.classList.remove('live-on'); try { wake?.release(); } catch (e) {} };
}

// nomes das partes no ecrã (no Excel ficam 1H/2H/ET1/ET2, como no Control-Stats)
const PN = {'1H': '1.ª parte', '2H': '2.ª parte', ET1: 'Prolongamento 1', ET2: 'Prolongamento 2'};
const pn = l => PN[l] || l || '';
const PC = {'1H': '1.ª', '2H': '2.ª', ET1: 'Prol. 1', ET2: 'Prol. 2'};
const pc = l => PC[l] || l || '';
// nome curto: o da ficha do atleta, ou o último nome
const apelido = p => { if (p?.curto) return p.curto; const w = (p?.nome || '').trim().split(/\s+/); return w.length > 1 ? w.at(-1) : w[0] || ''; };
const short = s => (s || '').length > 12 ? s.slice(0, 11) + '…' : s;

// Plantel do jogo: convocados (ou todos os ativos). Presets herdados do último jogo ao vivo.
async function novoLive(j) {
  const ats = (await db.all('atletas')).filter(a => (j.convocados || []).length ? j.convocados.includes(a.id) : a.ativo !== false)
    .sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
  const plantel = ats.map(a => ({id: a.id, num: String(a.num || ''), nome: a.nome || '', pos: a.posicao || '', ...(a.curto ? {curto: a.curto} : {})}));
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
