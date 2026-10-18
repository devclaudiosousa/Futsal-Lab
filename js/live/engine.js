// Motor do jogo ao vivo (o antigo Control-Stats), sem DOM.
// O jogo é uma lista de eventos com a hora real de cada toque (t, em ms). Tudo o resto — relógios,
// minutos, rotações, quem está em campo — é recalculado a partir da lista. Vantagens:
//  - o tempo fica certo mesmo com o ecrã bloqueado ou o separador em segundo plano;
//  - desfazer é tirar um evento; gravar e sincronizar é gravar a lista.
//
// Relógios (por parte):
//  - run: tempo corrido, para só com PAUSA (o TIME do Control-Stats);
//  - eff: tempo útil, para também com PARAGEM (o PLAY TIME). Minutos e descanso contam em eff.

export const SLOTS = ['gr', 'fixo', 'ala1', 'ala2', 'pivo'];
export const FIELD_SLOTS = ['fixo', 'ala1', 'ala2', 'pivo'];
export const SLOT_LBL = {gr: 'GR', fixo: 'FIXO', ala1: 'ALA', ala2: 'ALA', pivo: 'PIVÔ'};

export const DEFAULT_PERIODS = [{lbl: '1H', min: 20}, {lbl: '2H', min: 20}, {lbl: 'ET1', min: 5}, {lbl: 'ET2', min: 5}];

// type "event" = pontual; "state" = dura até ser desligado (exclusivo dentro do grupo)
export const SITUACOES = [
  {id: '5-inicial', label: '5 Inicial', group: 'ini', type: 'event'},
  {id: '3-1', label: '3-1', group: 'sis', type: 'state'},
  {id: '4-0', label: '4-0', group: 'sis', type: 'state'},
  {id: 'bola-saida', label: 'Bola Saída', group: 'bola', type: 'event'},
  {id: 'saida-adv', label: 'Saída Adversário', group: 'bola', type: 'event'},
  {id: 'livre-of', label: 'Livre Ofensivo', group: 'bola', type: 'event'},
  {id: 'livre-def', label: 'Livre Defensivo', group: 'bola', type: 'event'},
  {id: '4x3', label: '4x3', group: 'num', type: 'state'},
  {id: '3x4', label: '3x4', group: 'num', type: 'state'},
  {id: '4x5', label: '4x5', group: 'num', type: 'state'},
  {id: '5x4', label: '5x4', group: 'num', type: 'state', gr: true},
];
export const sitById = id => SITUACOES.find(s => s.id === id);
export const slotsFor = sit => (sit.gr ? SLOTS : FIELD_SLOTS);

export function newLive({plantel = [], court = null, periods = DEFAULT_PERIODS} = {}) {
  return {v: 1, periods: periods.map(p => ({...p})), plantel, court0: court || defaultCourt(plantel), presets: {}, events: []};
}
export function defaultCourt(plantel) {
  const gr = plantel.find(p => p.pos === 'GR');
  const rest = plantel.filter(p => p !== gr);
  const order = gr ? [gr, ...rest] : plantel;
  return Object.fromEntries(SLOTS.map((s, i) => [s, order[i]?.id ?? null]));
}

// ---------- derivação

export function derive(live, now = null) {
  const P = live.plantel || [];
  const nper = live.periods.length;
  const pl = {};
  for (const p of P) pl[p.id] = {id: p.id, rot: Array(nper).fill(0), play: Array(nper).fill(0), rest: Array(nper).fill(0), stintPlay: 0, stintRest: 0, lastStint: 0};
  const st = {
    per: -1, phase: 'pre',            // pre | live | break | end
    paused: false, stopped: false,
    run: 0, eff: 0,                    // segundos na parte atual
    court: {...(live.court0 || {})},
    score: {nos: 0, adv: 0}, shots: {nos: 0, adv: 0}, fouls: [], foulsPer: {}, foulsAdv: [], foulsAdvPer: {}, cards: [],
    states: {num: null, sis: null},
    snapshot: null,                    // lugares antes do 1.º preset (para o Repor)
    rows: [], segments: [], goals: [],
    lastT: null,
  };
  const onCourt = () => SLOTS.map(s => st.court[s]).filter(id => id != null && pl[id]);
  let seg = null;
  const openSeg = () => { seg = {per: st.per, s: st.eff, e: st.eff, court: {...st.court}}; };
  const closeSeg = () => { if (seg) { seg.e = st.eff; if (seg.e > seg.s) st.segments.push(seg); seg = null; } };

  const advance = t => {
    if (st.lastT == null || st.phase !== 'live') { st.lastT = t; return; }
    const dt = Math.max(0, (t - st.lastT) / 1000);
    st.lastT = t;
    if (st.paused) return;
    st.run += dt;
    if (st.stopped) return;
    st.eff += dt;
    const on = new Set(onCourt());
    for (const id in pl) {
      const x = pl[id];
      if (on.has(id)) { x.play[st.per] += dt; x.stintPlay += dt; } else { x.rest[st.per] += dt; x.stintRest += dt; }
    }
  };
  const row = (result, p1 = null, p2 = null, withCourt = false, e = null) => {
    if (st.phase !== 'live') return;
    st.rows.push({id: e?.id, per: st.per, run: st.run, eff: st.eff, result, p1, p2, on: withCourt ? SLOTS.map(s => st.court[s] ?? null) : null});
  };
  const doSub = (off, on, e) => {
    const slot = SLOTS.find(s => st.court[s] === off);
    if (slot) st.court[slot] = on;
    else { const free = SLOTS.find(s => st.court[s] == null); if (free) st.court[free] = on; }
    if (pl[off]) { pl[off].lastStint = pl[off].stintPlay; pl[off].stintRest = 0; }
    if (pl[on]) { pl[on].stintPlay = 0; if (st.per >= 0) pl[on].rot[st.per] += 1; }
    row('substitution', off, on, false, e);
  };
  const applyLineup = (target, e) => {
    const cur = SLOTS.map(s => st.court[s]).filter(v => v != null);
    const tgt = SLOTS.map(s => target[s]).filter(v => v != null);
    const leaving = cur.filter(v => !tgt.includes(v)), entering = tgt.filter(v => !cur.includes(v));
    for (const s of SLOTS) {          // emparelha por lugar primeiro
      const on = target[s], off = st.court[s];
      if (entering.includes(on) && leaving.includes(off)) {
        doSub(off, on, e);
        entering.splice(entering.indexOf(on), 1); leaving.splice(leaving.indexOf(off), 1);
      }
    }
    while (leaving.length || entering.length) {
      const off = leaving.shift() ?? null, on = entering.shift() ?? null;
      if (off != null && pl[off]) { pl[off].lastStint = pl[off].stintPlay; pl[off].stintRest = 0; }
      if (on != null && pl[on]) { pl[on].stintPlay = 0; if (st.per >= 0) pl[on].rot[st.per] += 1; }
      row('substitution', off, on, false, e);
    }
    st.court = {...target};
  };

  for (const e of live.events || []) {
    advance(e.t);
    const changesCourt = ['sub', 'pos', 'lineup'].includes(e.type);
    if (changesCourt && st.phase === 'live') closeSeg();
    switch (e.type) {
      case 'kickoff':
        if (st.per + 1 >= nper || st.phase === 'live') break;
        st.per++; st.phase = 'live'; st.paused = false; st.stopped = false; st.run = 0; st.eff = 0;
        for (const id in pl) { pl[id].stintPlay = 0; pl[id].stintRest = 0; pl[id].lastStint = 0; }
        for (const id of onCourt()) pl[id].rot[st.per] = 1;
        for (const id of onCourt()) row('lineup', id, null, false, e);
        row('kick off', null, null, false, e);
        openSeg();
        break;
      case 'pause': if (st.phase === 'live') st.paused = !st.paused; break;
      case 'stop': if (st.phase === 'live' && !st.paused) st.stopped = !st.stopped; break;
      case 'break':
        if (st.phase !== 'live') break;
        closeSeg();
        for (const g of ['num', 'sis']) if (st.states[g]) { row(sitById(st.states[g]).label + ' fim', null, null, false, e); st.states[g] = null; }
        row('break', null, null, false, e);
        st.phase = st.per + 1 >= nper ? 'end' : 'break'; st.paused = false; st.stopped = false;
        break;
      case 'sub':
        if (!pl[e.on] && !pl[e.off]) break;
        doSub(e.off, e.on, e);
        break;
      case 'pos': {          // e.p passa para o lugar e.slot; quem lá estava fica com o lugar antigo de e.p
        const from = SLOTS.find(s => st.court[s] === e.p);
        if (from && from !== e.slot) { st.court[from] = st.court[e.slot] ?? null; st.court[e.slot] = e.p; }
        break;
      }
      case 'lineup':
        if (e.snap === 'set' && !st.snapshot) st.snapshot = {...st.court};
        applyLineup(e.court, e);
        if (e.snap === 'clear') st.snapshot = null;
        break;
      case 'goal': {
        const nos = e.team === 'nos';
        st.score[nos ? 'nos' : 'adv']++; st.shots[nos ? 'nos' : 'adv']++;
        row(nos ? 'golo marcado' : 'golo sofrido', e.by || null, e.ast || null, true, e);
        st.goals.push({id: e.id, team: e.team, per: st.per, run: st.run, eff: st.eff, on: SLOTS.map(s => st.court[s] ?? null), by: e.by || null, ast: e.ast || null});
        break;
      }
      case 'shot':
        st.shots[e.team === 'nos' ? 'nos' : 'adv']++;
        if (e.team === 'nos') row('remate feito', e.by || null, null, true, e);
        break;
      case 'foul': {         // falta nossa: quem fez e zona (MD/MO do nosso ponto de vista); do adversário só conta
        if (st.phase !== 'live') break;
        if (e.team === 'adv') {
          st.foulsAdv.push({id: e.id, per: st.per, eff: st.eff});
          st.foulsAdvPer[st.per] = (st.foulsAdvPer[st.per] || 0) + 1;
          row('falta adversário', null, null, false, e);
          break;
        }
        st.fouls.push({id: e.id, per: st.per, eff: st.eff, by: e.by || null, zona: e.zona || ''});
        st.foulsPer[st.per] = (st.foulsPer[st.per] || 0) + 1;
        row('falta' + (e.zona ? ' ' + e.zona : ''), e.by || null, null, false, e);
        break;
      }
      case 'sit': {
        const sit = sitById(e.sid); if (!sit) break;
        if (sit.type === 'state') {
          const cur = st.states[sit.group];
          if (cur === sit.id) { st.states[sit.group] = null; row(sit.label + ' fim', null, null, false, e); break; }
          if (cur) row(sitById(cur).label + ' fim', null, null, false, e);
          st.states[sit.group] = sit.id;
          row(sit.label + ' início', null, null, false, e);
        } else row(sit.label, null, null, false, e);
        break;
      }
      case 'card': {         // cartão: nosso (by = atleta) ou do adversário (num = camisola)
        st.cards.push({id: e.id, per: st.per, eff: st.eff, team: e.team, cor: e.cor, by: e.by || null, num: e.num || ''});
        row((e.cor === 'verm' ? 'vermelho' : 'amarelo') + (e.team === 'adv' ? ' adversário' + (e.num ? ' ' + e.num : '') : ''), e.team === 'adv' ? null : e.by || null, null, false, e);
        break;
      }
      case 'repor': row('Repor', null, null, false, e); break;
    }
    if (changesCourt && st.phase === 'live') openSeg();
  }
  if (now != null) advance(now);
  if (seg) { seg.e = st.eff; if (seg.e > seg.s) st.segments.push({...seg}); }

  const per = Math.max(0, st.per);
  const players = P.map(p => {
    const x = pl[p.id];
    const wr = x.play.map((v, i) => round2(v / (x.rest[i] + 1)));
    const pct = x.play.map((v, i) => Math.round(100 * v / (60 * live.periods[i].min)));
    return {...p, ...x, active: onCourt().includes(p.id), slot: SLOTS.find(s => st.court[s] === p.id) || null,
      wr, pct, totalPlay: sum(x.play), totalRest: sum(x.rest), stintWR: round2(x.stintPlay / (x.stintRest + 1))};
  });
  const period = live.periods[per];
  return {
    ...st, per: st.per, players, byId: Object.fromEntries(players.map(p => [p.id, p])),
    effLeft: period ? period.min * 60 - st.eff : 0,
    foulsNow: st.foulsPer[per] || 0, foulsAdvNow: st.foulsAdvPer[per] || 0,
    canKickoff: st.phase === 'pre' || st.phase === 'break',
    nextPeriod: live.periods[st.per + 1]?.lbl || null,
  };
}

const sum = a => a.reduce((s, v) => s + v, 0);
const round2 = v => Math.round(100 * v) / 100;

// ---------- edição (devolve um novo live; quem chama grava)

let seq = 0;
const evId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
export function push(live, ev, t = Date.now()) {
  return {...live, events: [...live.events, {id: evId(), t, ...ev}]};
}
// Antes do início do jogo, mexer nos jogadores muda só o cinco inicial
export function setCourt0(live, court) { return {...live, court0: {...court}}; }

export function removeEvent(live, id) { return {...live, events: live.events.filter(e => e.id !== id)}; }
export function lastOf(live, pred) { for (let i = live.events.length - 1; i >= 0; i--) if (pred(live.events[i])) return live.events[i]; return null; }

// DESFAZER (como no Control-Stats): última substituição, troca de posição ou preset
export function undoLineupChange(live) {
  const e = lastOf(live, e => ['sub', 'pos', 'lineup'].includes(e.type));
  return e ? removeEvent(live, e.id) : live;
}
export function undoGoal(live, team) {
  const e = lastOf(live, e => e.type === 'goal' && e.team === team);
  return e ? removeEvent(live, e.id) : live;
}
// Autor e assistência de um golo (marcados depois do toque no golo, ou corrigidos mais tarde)
export function setGoalAuthors(live, id, {by, ast}) {
  return {...live, events: live.events.map(e => e.id === id && (e.type === 'goal' || e.type === 'shot') ? {...e, ...(by !== undefined ? {by} : {}), ...(ast !== undefined ? {ast} : {})} : e)};
}
// Corrige campos de um evento já marcado (autor, assistência, zona…)
export function editEvent(live, id, patch) {
  return {...live, events: live.events.map(e => e.id === id ? {...e, ...patch} : e)};
}
export function undoFoul(live, team = 'nos') {
  const e = lastOf(live, e => e.type === 'foul' && (e.team || 'nos') === team);
  return e ? removeEvent(live, e.id) : live;
}
export function undoShot(live, team) {
  const e = lastOf(live, e => e.type === 'shot' && e.team === team);
  return e ? removeEvent(live, e.id) : live;
}

// Substituição a partir de dois toques (um em campo, outro no banco), em qualquer ordem
export function subFromPair(d, a, b) {
  const A = d.byId[a], B = d.byId[b];
  if (!A || !B || A.active === B.active) return null;
  return A.active ? {type: 'sub', off: a, on: b} : {type: 'sub', off: b, on: a};
}

// Lugares finais depois de aplicar o preset da situação, ou {error}
export function presetTarget(live, d, sit) {
  const pr = live.presets?.[sit.id];
  if (!pr) return null;
  const target = {...d.court};
  for (const s of slotsFor(sit)) target[s] = pr[s] ?? null;
  if (!sit.gr) {
    const gr = target.gr;
    if (gr != null && FIELD_SLOTS.some(s => target[s] === gr)) return {error: `${label(live, gr)} está como GR e também faz parte do preset ${sit.label}.`};
  }
  return {target};
}
export function runSituation(live, sit, t = Date.now()) {
  const d = derive(live, t);
  const pt = presetTarget(live, d, sit);
  if (pt?.error) return {error: pt.error};
  let out = push(live, {type: 'sit', sid: sit.id}, t);
  const turningOff = sit.type === 'state' && d.states[sit.group] === sit.id;
  if (pt?.target && !turningOff) out = push(out, {type: 'lineup', court: pt.target, snap: 'set'}, t);
  return {live: out};
}
export function repor(live, t = Date.now()) {
  const d = derive(live, t);
  if (!d.snapshot) return live;
  return push(push(live, {type: 'repor'}, t), {type: 'lineup', court: d.snapshot, snap: 'clear'}, t);
}

export const label = (live, id) => { const p = live.plantel.find(x => x.id === id); return p ? `${p.num}. ${p.nome || ''}`.trim() : '?'; };
export const cell = (live, id) => { const p = live.plantel.find(x => x.id === id); return p ? `${p.num} ${p.apelido || p.nome || ''}`.trim() : ''; };
export const clock = s => { const neg = s < 0; s = Math.floor(Math.abs(s)); return `${neg ? '-' : ''}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// Os eventos no formato do Banco (stats.js): linha = 5 em campo, golos e remates. Permite quartetos e
// "como sofremos os golos" a partir do jogo ao vivo, em tempo útil.
export function toBancoEvents(live, now = null) {
  const d = derive(live, now);
  const snap = id => { const p = live.plantel.find(x => x.id === id); return p ? {n: String(p.num), nome: p.nome || ''} : null; };
  const out = [];
  let id = 1;
  for (const s of d.segments) out.push({id: id++, type: 'linha', parte: s.per + 1, t: s.s, court: SLOTS.map(k => snap(s.court[k]))});
  const ends = {};
  for (const s of d.segments) ends[s.per] = Math.max(ends[s.per] || 0, s.e);
  for (const [p, e] of Object.entries(ends)) { out.push({id: id++, type: 'ini_parte', parte: +p + 1, t: 0}); out.push({id: id++, type: 'fim_parte', parte: +p + 1, t: e}); }
  for (const g of d.goals) out.push({id: id++, type: 'golo', team: g.team === 'nos' ? 'A' : 'B', parte: g.per + 1, t: g.eff});
  return out;
}
export function undoCard(live) {
  const e = lastOf(live, e => e.type === 'card');
  return e ? removeEvent(live, e.id) : live;
}
