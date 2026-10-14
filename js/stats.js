// Estatística a partir dos eventos do marcador. Partilhado pela app e pelo marcador.
// Eventos estruturais: 'linha' (quem está em campo: court = 5 posições, 0 = GR), 'ini_parte', 'fim_parte'.
export const SHOTS = ['remate_enquadrado', 'remate_fora', 'remate_bloqueado', 'golo'];
export const STRUCT = ['linha', 'ini_parte', 'fim_parte'];

// Segmentos de tempo com o mesmo cinco em campo
export function segments(events) {
  const out = [];
  for (const p of [1, 2]) {
    const evs = events.filter(e => e.parte === p).sort((a, b) => a.t - b.t);
    const linhas = evs.filter(e => e.type === 'linha' && Array.isArray(e.court));
    if (!linhas.length) continue;
    const ini = evs.find(e => e.type === 'ini_parte');
    const fim = [...evs].reverse().find(e => e.type === 'fim_parte');
    const start = ini ? ini.t : Math.min(linhas[0].t, ...evs.map(e => e.t));
    const end = fim ? fim.t : Math.max(...evs.map(e => Math.max(e.t, e.fim || 0)));
    linhas.forEach((l, i) => {
      const s = i === 0 ? Math.min(start, l.t) : l.t;    // o primeiro cinco vale desde o início da parte
      const e = i + 1 < linhas.length ? linhas[i + 1].t : end;
      if (e > s) out.push({parte: p, s, e, court: l.court});
    });
  }
  return out;
}

const quartetKey = court => court.slice(1).filter(Boolean).map(j => j.n).sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999)).join('-');
const inSeg = (seg, e) => e.parte === seg.parte && e.t >= seg.s && (e.t < seg.e || (e.t === seg.e && e.type !== 'linha'));

export function quartets(events) {
  const segs = segments(events);
  const m = new Map();
  for (const seg of segs) {
    const k = quartetKey(seg.court);
    if (!k || k.split('-').length < 4) continue;
    if (!m.has(k)) m.set(k, {k, nums: k.split('-'), nomes: {}, seg: 0, gm: 0, gs: 0, rm: 0, rs: 0, rec: 0, perd: 0, pc: 0, pf: 0});
    const q = m.get(k);
    seg.court.slice(1).forEach(j => { if (j) q.nomes[j.n] = j.nome; });
    q.seg += seg.e - seg.s;
    for (const e of events) {
      if (!inSeg(seg, e)) continue;
      if (e.type === 'golo') e.team === 'A' ? q.gm++ : q.gs++;
      if (SHOTS.includes(e.type)) e.team === 'A' ? q.rm++ : q.rs++;
      if (e.team === 'A' && e.type === 'recuperacao') q.rec++;
      if (e.team === 'A' && e.type === 'perda') q.perd++;
      if (e.team === 'A' && e.type === 'passe') q.pc++;
      if (e.team === 'A' && e.type === 'passe_falhado') q.pf++;
    }
  }
  return [...m.values()].sort((a, b) => b.seg - a.seg);
}

// Minutos por jogador (pelos segmentos)
export function minutes(events) {
  const m = {};
  for (const seg of segments(events)) for (const j of seg.court) if (j) m[j.n] = (m[j.n] || 0) + (seg.e - seg.s);
  return m;
}

export function playerStats(events) {
  const m = new Map();
  const g = j => { if (!m.has(j.n)) m.set(j.n, {n: j.n, nome: j.nome || '', gol: 0, ast: 0, rem: 0, enq: 0, pc: 0, pf: 0, perd: 0, recup: 0, falta: 0, am: 0, verm: 0, seg: 0}); const o = m.get(j.n); if (j.nome) o.nome = j.nome; return o; };
  for (const e of events) {
    if (e.team !== 'A') continue;
    if (e.type === 'passe' && e.jog) { g(e.jog).pc++; continue; }
    if (!e.jog) continue;
    const o = g(e.jog);
    if (e.type === 'passe_falhado') o.pf++;
    if (e.type === 'golo') o.gol++;
    if (SHOTS.includes(e.type)) o.rem++;
    if (e.type === 'remate_enquadrado' || e.type === 'golo') o.enq++;
    if (e.type === 'perda') o.perd++;
    if (e.type === 'recuperacao') o.recup++;
    if (e.type === 'falta') o.falta++;
    if (e.type === 'amarelo') o.am++;
    if (e.type === 'vermelho') o.verm++;
    if (e.type === 'golo' && e.assist) g(e.assist).ast++;
  }
  for (const seg of segments(events)) for (const j of seg.court) if (j) g(j).seg += seg.e - seg.s;
  return [...m.values()].sort((a, b) => (parseInt(a.n) || 999) - (parseInt(b.n) || 999));
}

export function score(events) {
  return {a: events.filter(e => e.type === 'golo' && e.team === 'A').length, b: events.filter(e => e.type === 'golo' && e.team === 'B').length};
}

const ZN = {D10: 'dentro dos 10 m', F10: 'fora dos 10 m', MD: 'meio campo defensivo', MO: 'meio campo ofensivo'};
const LBL = {perda: 'perda de bola', passe_falhado: 'passe falhado', falta: 'falta', canto: 'canto', remate_fora: 'remate nosso fora', remate_bloqueado: 'remate nosso bloqueado', remate_enquadrado: 'remate nosso enquadrado'};

// Como sofremos os golos: quem estava em campo, zona do remate e o que fizemos nos 12 s anteriores
export function goalsAgainst(events) {
  const segs = segments(events);
  return events.filter(e => e.type === 'golo' && e.team === 'B').sort((a, b) => a.parte - b.parte || a.t - b.t).map(g => {
    const seg = segs.find(s => inSeg(s, g));
    const prev = events.filter(e => e.parte === g.parte && e.team === 'A' && e.t <= g.t && e.t >= g.t - 12 && LBL[e.type]).sort((a, b) => b.t - a.t)[0];
    const lance = events.find(e => e.type === 'lance' && e.parte === g.parte && e.fim != null && g.t >= e.t - 1 && g.t <= e.fim + 1);
    return {
      parte: g.parte, t: g.t,
      gr: seg?.court?.[0]?.n || null,
      quarteto: seg ? quartetKey(seg.court) : null,
      zona: g.zona ? ZN[g.zona] || g.zona : null,
      antes: prev ? LBL[prev.type] + (prev.jog ? ` de #${prev.jog.n}` : '') + (prev.zona ? ` (${ZN[prev.zona] || prev.zona})` : '') : null,
      lance: lance?.nota || null,
      nota: g.nota || '',
    };
  });
}

export const mmss = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const minLabel = s => `${Math.round((s || 0) / 60)}'`;
