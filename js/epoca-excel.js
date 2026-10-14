// Excel da época, reconstruído do zero a partir de todos os jogos (a app é a única fonte de verdade).
//
// Fontes por jogo:
//  - minutos e quem está em campo: jogo ao vivo no banco (tempo útil); sem ele, substituições do marcador;
//    sem nenhum dos dois, os tempos escritos à mão (j.minutos = {idAtleta: segundos}, sem quem estava em campo);
//  - ações por jogador (golos, assistências, faltas, cartões…): marcador de vídeo; sem vídeo, o modo ao vivo antigo;
//  - golos: do vídeo se tiver golos; senão do banco (com autor e assistência, se marcados); senão os escritos à mão;
//  - à mão (j.manual): golos {nos, parte, min, by, ast, on:[GR, 4 de campo]}, e por atleta {am, verm, fcMD, fcMO}.
//
// +/− (definição da equipa): cada golo ou assistência vale +1; cada golo sofrido com o jogador em campo vale −1.
// Faltas: MD/MO tal como marcadas, sempre do nosso ponto de vista (MD = no nosso meio-campo defensivo).
// Remates no banco: o autor vem do popup "quem rematou?"; o golo conta também como remate do marcador.
import {derive, SLOTS} from './live/engine.js';
import {playerStats, segments, quartets, SHOTS, STRUCT} from './stats.js';
import {toBancoEvents} from './live/engine.js';

const LBL = {remate_enquadrado: 'Remate enquadrado', remate_fora: 'Remate fora', remate_bloqueado: 'Remate bloqueado', golo: 'Golo',
  perda: 'Perda de bola', recuperacao: 'Recuperação', canto: 'Canto', falta: 'Falta', amarelo: 'Amarelo', vermelho: 'Vermelho',
  marca: 'Marcador livre', passe_falhado: 'Passe falhado', lance: 'Lance'};
const ZN = {D10: 'D10M', F10: 'F10M', MD: 'MD', MO: 'MO'};

const ms = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)},${String(s % 60).padStart(2, '0')}`; };   // m,ss; minutos continuam acima de 60
const min1 = s => Math.round((s || 0) / 6) / 10;
const per40 = (v, s) => (s >= 60 ? Math.round(10 * v * 2400 / s) / 10 : '');
const pct = (a, b) => (a + b ? Math.round(100 * a / (a + b)) : '');
const byNum = (a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999);

export function fontesJogo(j) {
  const live = j.aovivo?.events?.some(e => e.type === 'kickoff') ? j.aovivo : null;
  const video = j.marcador?.video?.events || [], vivo = j.marcador?.vivo?.events || [];
  const acoes = video.length ? {src: 'Vídeo', events: video} : vivo.length ? {src: 'Vídeo (modo ao vivo antigo)', events: vivo} : {src: '', events: []};
  return {live, acoes};
}

const zeros = () => ({seg: 0, gol: 0, ast: 0, mais: 0, menos: 0, ajMais: 0, ajMenos: 0, gmCampo: 0, gsCampo: 0, rem: 0, enq: 0, pc: 0, pf: 0, perd: 0, recup: 0,
  fcMD: 0, fcMO: 0, fsMD: 0, fsMO: 0, am: 0, verm: 0});

// Tudo o que se sabe de um jogo, por jogador (chave = id do atleta, ou "#num" se não estiver no plantel)
export function analisarJogo(j, {atById, atByNum}) {
  const {live, acoes} = fontesJogo(j);
  const ev = acoes.events;
  const key = (num, id) => { const a = id ? atById[id] : atByNum[String(num)]; return a ? a.id : '#' + num; };
  const info = {};       // chave → {num, nome}
  const P = {};
  const g = (num, nome, id) => { const k = key(num, id); if (!P[k]) { P[k] = zeros(); const a = atById[k]; info[k] = {num: a?.num ?? num, nome: a?.nome || nome || '', posicao: a?.posicao || ''}; } return P[k]; };
  const fromSnap = s => (s ? g(s.n, s.nome) : null);
  const keyOfSnap = s => (s ? key(s.n) : null);

  // minutos e segmentos (quem esteve em campo)
  let minSrc = '', segEvents = null;
  const dl = live ? derive(live) : null;
  if (dl) {
    minSrc = 'Ao vivo (tempo útil)';
    for (const p of dl.players) if (p.totalPlay > 0) g(p.num, p.nome, p.id).seg += p.totalPlay;
    segEvents = toBancoEvents(live);
  } else if (ev.some(e => e.type === 'linha')) {
    minSrc = acoes.src + ' (substituições)';
    for (const s of segments(ev)) for (const c of s.court) if (c) g(c.n, c.nome).seg += s.e - s.s;
    segEvents = ev;
  } else if (j.minutos && Object.keys(j.minutos).length) {
    minSrc = 'Tempos à mão';
    for (const [id, s] of Object.entries(j.minutos)) if (s > 0 && atById[id]) g(atById[id].num, atById[id].nome, id).seg += s;
  }

  // ações por jogador
  for (const s of ev.length ? playerStats(ev) : []) {
    const x = g(s.n, s.nome);
    for (const k of ['rem', 'enq', 'pc', 'pf', 'perd', 'recup', 'am', 'verm']) x[k] += s[k];
  }
  for (const e of ev) {
    if (e.type !== 'falta') continue;
    if (e.team === 'A' && e.jog) { const x = fromSnap(e.jog); if (e.zona === 'MD') x.fcMD++; else if (e.zona === 'MO') x.fcMO++; }
    if (e.team === 'B' && e.sofreu) { const x = fromSnap(e.sofreu); if (e.zona === 'MD') x.fsMD++; else if (e.zona === 'MO') x.fsMO++; }
  }

  // jogo só marcado no banco: remates por jogador a partir dos autores (golo conta como remate)
  if (!ev.length && dl) {
    for (const e of live.events) if ((e.type === 'shot' || e.type === 'goal') && e.team === 'nos' && e.by && atById[e.by]) { const x = g(atById[e.by].num, '', e.by); x.rem++; if (e.type === 'goal') x.enq++; }
    for (const f of dl.fouls) if (f.by && atById[f.by]) { const x = g(atById[f.by].num, '', f.by); if (f.zona === 'MD') x.fcMD++; else if (f.zona === 'MO') x.fcMO++; else x.fcSemZona = (x.fcSemZona || 0) + 1; }
  }

  // estatística escrita à mão (jogos antigos): cartões sempre que o vídeo não os tenha; faltas só sem outra fonte
  const man = j.manual || {};
  const semFonte = !dl && !ev.length;
  const videoCartoes = ev.some(e => e.type === 'amarelo' || e.type === 'vermelho');
  for (const [id, m] of Object.entries(man.atletas || {})) {
    if (!atById[id]) continue;
    const x = g(atById[id].num, atById[id].nome, id);
    if (!videoCartoes) { x.am += +m.am || 0; x.verm += +m.verm || 0; }
    if (semFonte) { x.fcMD += +m.fcMD || 0; x.fcMO += +m.fcMO || 0; }
  }

  // golos (com autor, assistência e quem estava em campo)
  const golos = [];
  const segs = segEvents ? segments(segEvents) : [];
  const campoEm = (parte, t) => { const s = segs.find(s => s.parte === parte && t >= s.s && t <= s.e); return s ? s.court.map(c => (c ? key(c.n) : null)) : null; };
  const vidGolos = ev.filter(e => e.type === 'golo').sort((a, b) => a.parte - b.parte || a.t - b.t);
  if (vidGolos.length) {
    const liveGolos = dl ? {A: dl.goals.filter(x => x.team === 'nos'), B: dl.goals.filter(x => x.team === 'adv')} : null;
    const nth = {A: 0, B: 0};
    for (const e of vidGolos) {
      let on = segEvents === ev ? campoEm(e.parte, e.t) : null;
      const lg = liveGolos?.[e.team]?.[nth[e.team]++];
      if (!on && lg) on = lg.on.map(id => id && key(null, id));
      golos.push({nos: e.team === 'A', parte: e.parte, t: e.t, by: keyOfSnap(e.jog), ast: keyOfSnap(e.assist), on, fonte: 'Vídeo'});
    }
  } else if (dl) {
    for (const x of dl.goals) golos.push({nos: x.team === 'nos', parte: x.per + 1, t: x.eff, by: x.by ? key(null, x.by) : null, ast: x.ast ? key(null, x.ast) : null, on: x.on.map(id => id && key(null, id)), fonte: 'Ao vivo'});
  }
  else if (semFonte && man.golos?.length) {
    const k = id => (id && atById[id] ? id : null);
    for (const x of man.golos) golos.push({nos: !!x.nos, parte: +x.parte || 1, t: (+x.min || 0) * 60, by: x.nos ? k(x.by) : null, ast: x.nos ? k(x.ast) : null, on: (x.on || []).map(k), fonte: 'À mão'});
    golos.sort((a, b) => a.parte - b.parte || a.t - b.t);
  }
  for (const go of golos) {
    if (go.nos) {
      if (go.by) { const x = P[go.by] || g(atById[go.by]?.num ?? go.by.slice(1), '', atById[go.by] ? go.by : null); x.gol++; x.mais++; }
      if (go.ast) { const x = P[go.ast] || g(atById[go.ast]?.num ?? go.ast.slice(1), '', atById[go.ast] ? go.ast : null); x.ast++; x.mais++; }
    }
    for (const k of go.on || []) {
      if (!k) continue;
      const x = P[k] || g(atById[k]?.num ?? k.slice(1), '', atById[k] ? k : null);
      if (go.nos) x.gmCampo++; else { x.gsCampo++; x.menos++; }
    }
  }

  // ajustes do treinador no pós-jogo: +1 ou −1 com descrição (ex.: "boa transição defensiva")
  const ajustes = [];
  for (const a of j.ajustes || []) {
    if (!atById[a.atleta]) continue;
    const x = g(atById[a.atleta].num, atById[a.atleta].nome, a.atleta);
    if (a.v > 0) { x.mais++; x.ajMais++; } else { x.menos++; x.ajMenos++; }
    ajustes.push({k: a.atleta, v: a.v > 0 ? 1 : -1, desc: a.desc || ''});
  }

  // resultado e totais da equipa
  const A = e => e.team === 'A', B = e => e.team === 'B';
  const cnt = (f, t) => ev.filter(e => f(e) && t(e)).length;
  let gn, ga, rn, ra;
  if (j.golosNos !== '' && j.golosNos != null && j.golosEles !== '' && j.golosEles != null) { gn = +j.golosNos; ga = +j.golosEles; }
  else if (golos.length || dl) { gn = golos.filter(x => x.nos).length; ga = golos.filter(x => !x.nos).length; }
  else { gn = ga = null; }
  if (dl) { rn = dl.shots.nos; ra = dl.shots.adv; } else { rn = cnt(e => SHOTS.includes(e.type), A); ra = cnt(e => SHOTS.includes(e.type), B); }
  const totais = {gn, ga, rn, ra, enq: cnt(e => e.type === 'remate_enquadrado' || e.type === 'golo', A), perd: cnt(e => e.type === 'perda', A),
    recup: cnt(e => e.type === 'recuperacao', A), fn: ev.length ? cnt(e => e.type === 'falta', A) : dl ? dl.fouls.length : Object.values(man.atletas || {}).reduce((s, m) => s + (+m.fcMD || 0) + (+m.fcMO || 0), 0), fa: cnt(e => e.type === 'falta', B), cantos: cnt(e => e.type === 'canto', A)};

  // quartetos: pelos segmentos; nos jogos à mão só há os golos (sem minutos)
  let qs = segEvents ? quartets(segEvents) : [];
  if (!segEvents && golos.some(x => x.fonte === 'À mão')) {
    const m = new Map(), lbl = id => String(atById[id]?.num || atById[id]?.nome || '?');
    for (const go of golos) {
      const f = (go.on || []).slice(1).filter(Boolean);
      if (f.length < 4) continue;
      const nums = f.map(lbl).sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999) || a.localeCompare(b)), k = nums.join('-');
      if (!m.has(k)) m.set(k, {k, nums, seg: 0, gm: 0, gs: 0});
      go.nos ? m.get(k).gm++ : m.get(k).gs++;
    }
    qs = [...m.values()];
  }
  return {P, info, golos, ajustes, totais, minSrc, acoesSrc: acoes.src || (semFonte && (man.golos?.length || Object.keys(man.atletas || {}).length) ? 'À mão' : ''), events: ev, quartetos: qs};
}

// Estatísticas que um jogo conta para a época. Por defeito só as que o jogo tem de onde vir (um jogo sem vídeo
// não tem passes: não conta como 0 passes); o treinador pode ligar/desligar cada uma no jogo (j.contar).
export const CATEGORIAS = {
  minutos: {lbl: 'Minutos', campos: ['seg']},
  golos: {lbl: 'Golos e +/−', campos: ['gol', 'ast', 'mais', 'menos', 'ajMais', 'ajMenos', 'gmCampo', 'gsCampo']},
  remates: {lbl: 'Remates', campos: ['rem', 'enq']},
  passes: {lbl: 'Passes', campos: ['pc', 'pf']},
  perdas: {lbl: 'Perdas e recuperações', campos: ['perd', 'recup']},
  faltas: {lbl: 'Faltas', campos: ['fcMD', 'fcMO', 'fsMD', 'fsMO']},
  cartoes: {lbl: 'Cartões', campos: ['am', 'verm']},
};
export function categoriasAuto(j) {
  const {live, acoes} = fontesJogo(j);
  const ev = acoes.events, tem = (...t) => ev.some(e => t.includes(e.type));
  const man = j.manual || {};
  return {
    minutos: !!live || tem('linha') || !!(j.minutos && Object.keys(j.minutos).length),
    golos: !!live || tem('golo') || !!man.golos?.length,
    remates: !!live || tem(...SHOTS),
    passes: tem('passe', 'passe_falhado'),
    perdas: tem('perda', 'recuperacao'),
    faltas: !!live || tem('falta') || Object.values(man.atletas || {}).some(m => m.fcMD || m.fcMO),
    cartoes: !!live || !!ev.length || !!Object.keys(man.atletas || {}).length,
  };
}
export const categorias = j => ({...categoriasAuto(j), ...(j.contar || {})});

export function buildEpoca({jogos, atletas, cfg = {}, filtro = {}}) {
  const nos = cfg.clube || 'Nós';
  const sel = jogos.filter(j => !j.deleted && (!filtro.de || (j.data || '') >= filtro.de) && (!filtro.ate || (j.data || '') <= filtro.ate)
    && (!filtro.competicao || j.competicao === filtro.competicao)).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const atById = Object.fromEntries(atletas.map(a => [a.id, a]));
  const atByNum = {};
  for (const a of atletas) if (a.num && (a.ativo !== false || !atByNum[a.num])) atByNum[String(a.num)] = a;
  const nomeK = (k, info) => { const a = atById[k]; return a ? `${a.num} ${a.nome || ''}`.trim() : info?.[k] ? `${info[k].num} ${info[k].nome}`.trim() : (k || '').replace('#', ''); };
  const numK = (k, info) => atById[k]?.num ?? info?.[k]?.num ?? (k || '').replace('#', '');

  const season = {};   // chave → totais + jogos
  const meta = {};
  const jogosRows = [['Data', 'Competição', 'Adversário', 'Casa/Fora', `Golos ${nos}`, 'Golos adversário', 'Resultado', 'Minutos de', 'Ações de', 'Não conta para a época']];
  const totRows = [['Data', 'Adversário', `Golos ${nos}`, 'Golos adversário', `Remates ${nos}`, 'Remates adversário', 'Enquadrados', 'Perdas', 'Recuperações', `Faltas ${nos}`, 'Faltas adversário', 'Cantos']];
  const pjHead = ['Data', 'Adversário', 'Nº', 'Jogador', 'Minutos', 'Golos', 'Assistências', '+', '−', '+/−', '+ ajuste', '− ajuste', 'Em campo golo marcado', 'Em campo golo sofrido',
    'Faltas cometidas MD', 'Faltas cometidas MO', 'Faltas sofridas MD', 'Faltas sofridas MO', 'Amarelos', 'Vermelhos', 'Nota'];
  const pjRows = [pjHead];
  const ajRows = [['Data', 'Adversário', 'Nº', 'Jogador', '+/−', 'Descrição']];
  const golRows = [['Data', 'Adversário', 'Parte', 'Tempo', 'Golo', 'Marcador', 'Assistência', 'GR', 'Quarteto', 'Em campo', 'Fonte']];
  const evRows = [['Data', 'Adversário', 'Fonte', 'Parte', 'Tempo', 'Evento', 'Equipa', 'Nº', 'Jogador', 'Zona', 'Assistência / sofrida por', 'Nota']];
  const qAgg = {};
  const colJogos = [];

  sel.forEach((j, gi) => {
    const an = analisarJogo(j, {atById, atByNum});
    Object.assign(meta, an.info);
    const cat = categorias(j);
    const off = Object.keys(CATEGORIAS).filter(c => !cat[c]);
    const vazio = c => !cat[c];   // célula em branco (não é 0: o jogo não tem esta estatística)
    const col = `${j.data || ''} ${j.adversario || ''}`.trim();
    colJogos.push(col);
    const conv = new Set((j.convocados || []).filter(id => atById[id]));
    const keys = new Set([...conv, ...Object.keys(an.P)]);
    for (const k of keys) {
      const x0 = an.P[k] || zeros(), x = {...x0};
      for (const c of off) for (const f of CATEGORIAS[c].campos) x[f] = 0;
      const s = season[k] ||= {...zeros(), conv: 0, jogos: 0, notas: [], porJogo: {}, r40: {}};
      if (conv.has(k)) s.conv++;
      if (x.seg > 0) { s.jogos++; s.porJogo[gi] = x.seg; }
      for (const f of Object.keys(zeros())) s[f] += x[f];
      // valores por 40 min: só com os jogos que têm minutos E essa estatística
      if (x.seg > 0) for (const c of ['golos', 'remates', 'perdas']) if (cat[c]) {
        const r = s.r40[c] ||= {seg: 0}; r.seg += x.seg;
        for (const f of CATEGORIAS[c].campos) r[f] = (r[f] || 0) + x[f];
      }
      const nota = j.notas?.[k];
      if (nota) s.notas.push(+nota);
      const algo = x.seg || x.mais || x.menos || x.gmCampo || x.fcMD + x.fcMO + x.fsMD + x.fsMO + x.am + x.verm || nota;
      if (!conv.has(k) && !algo) continue;
      const G = vazio('golos'), F = vazio('faltas'), C = vazio('cartoes'), b = (off2, v) => (off2 ? '' : v);
      pjRows.push([j.data || '', j.adversario || '', numK(k, an.info), nomeK(k, an.info).replace(/^\S+\s/, ''), b(vazio('minutos'), min1(x.seg)),
        ...[x.gol, x.ast, x.mais, x.menos, x.mais - x.menos, x.ajMais, x.ajMenos, x.gmCampo, x.gsCampo].map(v => b(G, v)),
        ...[x.fcMD, x.fcMO, x.fsMD, x.fsMO].map(v => b(F, v)), b(C, x.am), b(C, x.verm), nota || '']);
    }

    const t = an.totais, tem = t.gn != null;
    jogosRows.push([j.data || '', j.competicao || '', j.adversario || '', j.casa === false ? 'Fora' : 'Casa', tem ? t.gn : '', tem ? t.ga : '',
      tem ? (t.gn > t.ga ? 'V' : t.gn < t.ga ? 'D' : 'E') : '', an.minSrc, an.acoesSrc, off.map(c => CATEGORIAS[c].lbl).join(', ')]);
    const R = vazio('remates'), P2 = vazio('perdas'), F2 = vazio('faltas');
    totRows.push([j.data || '', j.adversario || '', tem ? t.gn : '', tem ? t.ga : '', R ? '' : t.rn, R ? '' : t.ra, R ? '' : t.enq, P2 ? '' : t.perd, P2 ? '' : t.recup, F2 ? '' : t.fn, F2 ? '' : t.fa, t.cantos]);

    for (const a of cat.golos ? an.ajustes : []) ajRows.push([j.data || '', j.adversario || '', numK(a.k, an.info), nomeK(a.k, an.info).replace(/^\S+\s/, ''), a.v > 0 ? '+1' : '−1', a.desc]);
    for (const go of cat.golos ? an.golos : []) {
      const on = go.on || [];
      const quart = on.slice(1).filter(Boolean).map(k => numK(k, an.info)).sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999)).join('-');
      golRows.push([j.data || '', j.adversario || '', go.parte, ms(go.t), go.nos ? 'Marcado' : 'Sofrido', go.by ? nomeK(go.by, an.info) : '', go.ast ? nomeK(go.ast, an.info) : '',
        on[0] ? nomeK(on[0], an.info) : '', quart, on.filter(Boolean).map(k => nomeK(k, an.info)).join(', '), go.fonte]);
    }
    for (const q of cat.golos ? an.quartetos : []) {
      const a = qAgg[q.k] ||= {nums: q.nums, seg: 0, gm: 0, gs: 0, jogos: new Set()};
      a.seg += q.seg; a.gm += q.gm; a.gs += q.gs; a.jogos.add(gi);
    }
    for (const e of [...an.events].sort((a, b) => a.parte - b.parte || a.t - b.t)) {
      if (STRUCT.includes(e.type) || e.type === 'passe' || !LBL[e.type]) continue;
      const extra = e.assist ? `${e.assist.n} ${e.assist.nome || ''}`.trim() : e.sofreu ? `sofrida por ${e.sofreu.n} ${e.sofreu.nome || ''}`.trim() : '';
      evRows.push([j.data || '', j.adversario || '', an.acoesSrc, e.parte, ms(e.t), e.type === 'lance' ? `Lance (${ms(e.t)}–${ms(e.fim)})` : LBL[e.type],
        e.team === 'B' ? 'Adversário' : e.team === 'A' ? nos : '', e.jog?.n ?? '', e.jog?.nome ?? '', ZN[e.zona] || e.zona || '', extra, e.nota || '']);
    }
  });

  const ks = Object.keys(season).filter(k => { const s = season[k]; return s.conv || s.seg || s.mais || s.menos || s.rem || s.pc || s.fcMD + s.fcMO + s.fsMD + s.fsMO; })
    .sort((a, b) => byNum({num: numK(a, meta)}, {num: numK(b, meta)}));
  const statRows = [['Nº', 'Jogador', 'Posição', 'Convocado', 'Jogos com minutos', 'Minutos', 'Golos', 'Assistências', '+', '−', '+/−', '+ ajuste', '− ajuste',
    'Em campo golo marcado', 'Em campo golo sofrido', 'Faltas cometidas MD', 'Faltas cometidas MO', 'Faltas sofridas MD', 'Faltas sofridas MO', 'Amarelos', 'Vermelhos',
    'Remates', 'Enquadrados', 'Passes certos', 'Passes falhados', '% passe', 'Perdas', 'Recuperações',
    'Golos /40', '+/− /40', 'Remates /40', 'Recuperações /40', 'Perdas /40', 'Nota média']];
  for (const k of ks) {
    const s = season[k];
    statRows.push([numK(k, meta), nomeK(k, meta).replace(/^\S+\s/, ''), atById[k]?.posicao || meta[k]?.posicao || '', s.conv, s.jogos, min1(s.seg), s.gol, s.ast, s.mais, s.menos, s.mais - s.menos, s.ajMais, s.ajMenos,
      s.gmCampo, s.gsCampo, s.fcMD, s.fcMO, s.fsMD, s.fsMO, s.am, s.verm, s.rem, s.enq, s.pc, s.pf, pct(s.pc, s.pf), s.perd, s.recup,
      ...(r => [per40(r.g.gol || 0, r.g.seg), per40((r.g.mais || 0) - (r.g.menos || 0), r.g.seg), per40(r.r.rem || 0, r.r.seg), per40(r.p.recup || 0, r.p.seg), per40(r.p.perd || 0, r.p.seg)])(
        {g: s.r40.golos || {seg: 0}, r: s.r40.remates || {seg: 0}, p: s.r40.perdas || {seg: 0}}),
      s.notas.length ? Math.round(10 * s.notas.reduce((a, b) => a + b, 0) / s.notas.length) / 10 : '']);
  }
  const minRows = [['Nº', 'Jogador', ...colJogos, 'Total (min)']];
  for (const k of ks) minRows.push([numK(k, meta), nomeK(k, meta).replace(/^\S+\s/, ''), ...colJogos.map((_, gi) => season[k].porJogo[gi] ? min1(season[k].porJogo[gi]) : ''), min1(season[k].seg)]);
  const qRows = [['Quarteto', 'Jogos', 'Minutos', 'Golos marcados', 'Golos sofridos', 'Saldo', 'Saldo /40']];
  for (const q of Object.values(qAgg).sort((a, b) => b.seg - a.seg)) qRows.push([q.nums.join('-'), q.jogos.size, min1(q.seg), q.gm, q.gs, q.gm - q.gs, per40(q.gm - q.gs, q.seg)]);

  return {
    'Jogos': jogosRows, 'Estatísticas por jogador': statRows, 'Por jogador e jogo': pjRows, 'Golos': golRows, 'Quartetos': qRows,
    'Minutos': minRows, 'Totais por jogo': totRows, 'Eventos': evRows, 'Ajustes +-': ajRows,
    'Notas': [['Como ler'], ['+ : cada golo ou assistência vale +1. − : cada golo sofrido com o jogador em campo vale −1. +/− = + menos −.'],
      ['Os ajustes do treinador no pós-jogo (+1 ou −1 com descrição) entram no + e no −; a folha "Ajustes +-" lista cada um.'],
      ['Faltas MD/MO tal como marcadas, do nosso ponto de vista (MD = no nosso meio-campo defensivo).'], ['O GR conta como qualquer jogador: leva − nos golos sofridos em que está em campo.'], ['Minutos em tempo útil quando o jogo foi marcado no banco.'],
      ['Quarteto: os quatro jogadores de campo, sem o GR.'],
      ['Cada jogo só conta nas estatísticas que tem (ver "Não conta para a época" na folha Jogos): um jogo sem passes marcados não conta como 0 passes. Os valores /40 usam só os minutos dos jogos que têm essa estatística.']],
  };
}
