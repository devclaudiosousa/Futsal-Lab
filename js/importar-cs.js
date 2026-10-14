// Importa um jogo guardado pelo Control-Stats (Save Match, ficheiro .txt com JSON) para um jogo da app,
// reconstruindo o jogo ao vivo (eventos) de forma a dar os mesmos tempos.
//
// Particularidades do ficheiro:
//  - min_eff/sec_eff guardam o PLAY TIME a descer (20:00 → 19:56 = 4 s jogados);
//  - as paragens não são eventos: deduzem-se da diferença entre tempo corrido e tempo útil entre linhas;
//  - as linhas "lineup" depois do intervalo trazem a hora antiga; contam como estando no início da parte.
import {newLive, push, SITUACOES, SLOTS} from './live/engine.js';
import {db} from './db.js';

const POS = {GK: 'GR', DF: 'Fixo', MD: 'Ala', FW: 'Pivô'};
const segs = (m, s) => { const neg = String(m).trim().startsWith('-'); const v = Math.abs(parseInt(m) || 0) * 60 + (parseInt(s) || 0); return neg ? -v : v; };
const norm = t => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const placeholder = p => !p || (p.nfirst === 'Player' && /^[A-Z][a-z]+$/.test(p.nlast || ''));

function dataISO(d) {
  if (Array.isArray(d)) return d[0] ? `${d[0]}-${String(d[1]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}` : '';
  const m = String(d || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

// Conversão pura. atletas = plantel atual da app; devolve o jogo, o jogo ao vivo e os atletas a criar.
export function converterControlStats(cs, atletas, novoId = () => crypto.randomUUID()) {
  const tm = cs.tbl_match, players = cs.team?.players || [];
  const perMin = cs.general?.per_time || [20, 20, 5, 5];
  const perLbl = cs.general?.per_lbl || ['1H', '2H', 'ET1', 'ET2'];
  const byNum = Object.fromEntries(atletas.filter(a => a.num).map(a => [String(a.num), a]));
  const novos = [];
  const idDoNum = {};
  for (const p of players) {
    if (placeholder(p) || p.pno === '' || p.pno == null) continue;
    const num = String(p.pno).trim();
    let a = byNum[num];
    if (!a) { a = {id: novoId(), num, nome: [p.nfirst, p.nlast].filter(Boolean).join(' ').trim(), posicao: POS[String(p.position).toUpperCase()] || '', ativo: true}; novos.push(a); byNum[num] = a; }
    idDoNum[num] = a.id;
  }
  const idx = i => { const p = players[i]; return p && idDoNum[String(p.pno).trim()]; };
  const pid = n => (n == null || +n === -1 || n === '' ? null : idDoNum[String(n).trim()] || null);

  // linhas por parte
  const rows = [];
  for (let i = 0; i < (tm?.index?.length || 0); i++) rows.push(Object.fromEntries(Object.keys(tm).map(k => [k, tm[k][i]])));
  const porParte = {};
  for (const r of rows) { const p = parseInt(r.period); if (p >= 1) (porParte[p] ||= []).push(r); }

  const plantelIds = new Set(Object.values(idDoNum));
  const jogadores = [...plantelIds].map(id => { const a = Object.values(byNum).find(x => x.id === id); return {id, num: a.num, nome: a.nome, pos: a.posicao}; })
    .sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
  let live = newLive({plantel: jogadores, periods: perLbl.map((lbl, i) => ({lbl, min: perMin[i] ?? 5}))});

  const data = dataISO(cs.match?.date);
  const base = (Date.parse(data || '2000-01-01') || 0) + 12 * 3600e3;
  let court = null;                       // ids em campo, por lugar
  const nossos = cs.team?.tgl_home == 1 ? 0 : 1;
  const golos = {nos: 0, adv: 0};
  let fimUltima = base;

  const partes = Object.keys(porParte).map(Number).sort((a, b) => a - b);
  for (const p of partes) {
    const rs = porParte[p];
    const t0 = base + (p - 1) * 3600e3;
    const ko = rs.find(r => r.result === 'kick off');
    // cinco no início da parte (linhas lineup)
    const ini = rs.filter(r => r.result === 'lineup').map(r => pid(r.player_no1)).filter(Boolean);
    if (ini.length) {
      if (!court) {
        const gr = ini.find(id => jogadores.find(j => j.id === id)?.pos === 'GR') || ini[0];
        const resto = ini.filter(id => id !== gr);
        court = Object.fromEntries(SLOTS.map((s, k) => [s, k === 0 ? gr : resto[k - 1] ?? null]));
        live = {...live, court0: {...court}};
      } else {                            // trocas feitas no intervalo (o Control-Stats não as regista)
        const atual = SLOTS.map(s => court[s]).filter(Boolean);
        const sai = atual.filter(id => !ini.includes(id)), entra = ini.filter(id => !atual.includes(id));
        sai.forEach((off, k) => { if (entra[k]) { live = push(live, {type: 'sub', off, on: entra[k]}, t0 - 1000); const s = SLOTS.find(x => court[x] === off); court[s] = entra[k]; } });
      }
    }
    if (!ko) continue;
    live = push(live, {type: 'kickoff'}, t0);
    let prevRun = 0, prevEff = 0, prevT = t0;
    const corpo = rs.slice(rs.indexOf(ko) + 1);
    for (const r of corpo) {
      const run = segs(r.min_run, r.sec_run);
      const eff = perMin[p - 1] * 60 - segs(r.min_eff, r.sec_eff);
      const t = t0 + run * 1000;
      const parado = (run - prevRun) - (eff - prevEff);
      if (parado > 0.5) {                 // houve paragem neste intervalo
        live = push(live, {type: 'stop'}, prevT);
        live = push(live, {type: 'stop'}, prevT + parado * 1000);
      }
      prevRun = run; prevEff = eff; prevT = t;
      const res = String(r.result || '');
      const n = norm(res);
      if (res === 'substitution') {
        const off = pid(r.player_no1), on = pid(r.player_no2);
        if (off && on) { live = push(live, {type: 'sub', off, on}, t); const s = SLOTS.find(x => court?.[x] === off); if (s) court[s] = on; }
      } else if (n === 'golo marcado' || n === 'goal for' || n === 'golo sofrido' || n === 'goal against') {
        const team = n === 'golo marcado' || n === 'goal for' ? 'nos' : 'adv';
        golos[team]++;
        live = push(live, {type: 'goal', team}, t);
      } else if (res === 'break') {
        live = push(live, {type: 'break'}, t); fimUltima = t;
      } else if (res === 'Repor') {
        live = push(live, {type: 'repor'}, t);
      } else {
        const lbl = n.replace(/ (inicio|fim)$/, '');
        const sit = SITUACOES.find(s => norm(s.label) === lbl);
        if (sit) live = push(live, {type: 'sit', sid: sit.id}, t);
      }
    }
  }
  // remates: o ficheiro só tem totais (com os golos incluídos); ficam no fim da última parte
  const shots = cs.match?.shots;
  if (Array.isArray(shots)) {
    const extra = {nos: Math.max(0, (shots[nossos] || 0) - golos.nos), adv: Math.max(0, (shots[1 - nossos] || 0) - golos.adv)};
    const evs = [];
    for (const team of ['nos', 'adv']) for (let k = 0; k < extra[team]; k++) evs.push({id: novoId(), t: fimUltima - 1, type: 'shot', team});
    const ib = live.events.findLastIndex(e => e.type === 'break');
    live = {...live, events: ib >= 0 ? [...live.events.slice(0, ib), ...evs, ...live.events.slice(ib)] : [...live.events, ...evs]};
  }
  // presets das situações (no ficheiro são índices de jogadores)
  const pr = cs.situacoes?.presets || {};
  live.presets = Object.fromEntries(Object.entries(pr).map(([sid, v]) => [sid, Object.fromEntries(Object.entries(v).map(([s, i]) => [s, idx(i)]))])
    .filter(([, v]) => Object.values(v).every(Boolean)));

  const teams = cs.match?.teams || [];
  const jogo = {
    data, hora: Array.isArray(cs.match?.kickoff) ? '' : String(cs.match?.kickoff || '').replace('h', ''),
    adversario: teams[1 - nossos] || '', competicao: cs.match?.competition && cs.match.competition !== 'Competition' ? cs.match.competition : '',
    local: cs.match?.location && cs.match.location !== 'Stadium' ? cs.match.location : '', jornada: cs.match?.stage && cs.match.stage !== 'Stage' ? cs.match.stage : '',
    casa: nossos === 0, concentracao: 0, convocados: jogadores.map(j => j.id), notas: {}, marcador: {}, aovivo: live, origem: 'Control-Stats',
  };
  return {jogo, novos};
}

export async function importarControlStats(file) {
  const cs = JSON.parse(await file.text());
  if (!cs?.tbl_match || !cs?.team) throw new Error('não é um ficheiro do Control-Stats (Save Match)');
  const {jogo, novos} = converterControlStats(cs, await db.all('atletas'));
  for (const a of novos) await db.put('atletas', a);
  const j = await db.put('jogos', jogo);
  return {jogo: j, novos: novos.length};
}
