// Acerto entre o Ao vivo (banco) e o Vídeo.
// No Ao vivo, cada toque tem a hora real (ms). Uma gravação contínua também anda em tempo real (pausas e
// paragens incluídas), por isso basta saber em que segundo do vídeo foi o apito inicial de cada parte:
//   tempo no vídeo = início da parte no vídeo + (hora do toque − hora do início da parte no Ao vivo) + ajuste
// O ajuste (± segundos, por parte) corrige pequenos desvios, por exemplo se o vídeo foi cortado.
import {derive, SLOTS} from '../live/engine.js';

// inicios = {parte: segundo do vídeo}; ajustes = {parte: segundos}
export function eventosNoVideo(live, inicios = {}, ajustes = {}) {
  if (!live?.events?.length) return {itens: [], partes: []};
  const d = derive(live);
  const pl = Object.fromEntries((live.plantel || []).map(p => [p.id, p]));
  const snap = id => (pl[id] ? {n: String(pl[id].num), nome: pl[id].nome || ''} : null);
  const kick = {}; let per = -1;
  for (const e of live.events) if (e.type === 'kickoff') kick[++per + 1] = e.t;
  const partes = Object.keys(kick).map(Number);
  // em que parte está cada evento (pela ordem da lista)
  const parteDe = {}; per = 0;
  for (const e of live.events) { if (e.type === 'kickoff') per++; parteDe[e.id] = per; }
  const vt = e => {
    const p = parteDe[e.id];
    if (inicios[p] == null || kick[p] == null) return null;
    return Math.max(0, inicios[p] + (e.t - kick[p]) / 1000 + (+ajustes[p] || 0));
  };
  const golo = Object.fromEntries(d.goals.map(g => [g.id, g]));
  const itens = [];
  // cinco em campo depois de cada mudança, para levar para o Vídeo como "linha"
  const court = {...(live.court0 || {})};
  for (const e of live.events) {
    const p = parteDe[e.id];
    if (e.type === 'sub') { const s = SLOTS.find(x => court[x] === e.off); if (s) court[s] = e.on; }
    if (e.type === 'pos') { const from = SLOTS.find(s => court[s] === e.p); if (from) { court[from] = court[e.slot] ?? null; court[e.slot] = e.p; } }
    if (e.type === 'lineup') Object.assign(court, e.court);
    const base = {id: e.id, parte: p, vt: vt(e)};
    if (e.type === 'kickoff') itens.push({...base, tipo: 'inicio', court: SLOTS.map(s => snap(court[s]))});
    else if (e.type === 'break') itens.push({...base, tipo: 'fim'});
    else if (e.type === 'goal') itens.push({...base, tipo: 'golo', team: e.team === 'nos' ? 'A' : 'B', jog: snap(e.by), assist: snap(e.ast), on: (golo[e.id]?.on || []).map(snap)});
    else if (e.type === 'foul') itens.push({...base, tipo: 'falta', team: 'A', jog: snap(e.by), zona: e.zona || ''});
    else if (e.type === 'shot' && e.team === 'nos') itens.push({...base, tipo: 'remate', team: 'A', jog: snap(e.by)});
    else if (['sub', 'lineup', 'pos'].includes(e.type) && p > 0) itens.push({...base, tipo: 'linha', court: SLOTS.map(s => snap(court[s])), sub: e.type === 'sub' ? {sai: snap(e.off), entra: snap(e.on)} : null});
  }
  return {itens, partes};
}

// Eventos do marcador de vídeo a criar a partir dos itens (sem duplicar: golos e faltas já marcados no
// vídeo, da mesma equipa, a menos de `janela` segundos, ficam de fora). Os remates não vêm porque o Ao vivo
// não sabe se foram enquadrados, fora ou bloqueados.
export function paraVideo(itens, existentes, janela = 20) {
  const perto = (tipo, team, vt, parte) => existentes.some(x => x.type === tipo && x.team === team && x.parte === parte && Math.abs(x.t - vt) <= janela);
  const out = [];
  for (const it of itens) {
    if (it.vt == null) continue;
    if (it.tipo === 'inicio' || it.tipo === 'linha') {
      if (it.tipo === 'inicio' && !existentes.some(x => x.type === 'ini_parte' && x.parte === it.parte)) out.push({type: 'ini_parte', parte: it.parte, t: it.vt, src: 'aovivo'});
      if (!existentes.some(x => x.type === 'linha' && x.parte === it.parte && Math.abs(x.t - it.vt) < 2)) out.push({type: 'linha', parte: it.parte, t: it.vt, court: it.court, src: 'aovivo'});
    } else if (it.tipo === 'fim') {
      if (!existentes.some(x => x.type === 'fim_parte' && x.parte === it.parte)) out.push({type: 'fim_parte', parte: it.parte, t: it.vt, src: 'aovivo'});
    } else if (it.tipo === 'golo') {
      if (perto('golo', it.team, it.vt, it.parte)) continue;
      out.push({type: 'golo', team: it.team, parte: it.parte, t: it.vt, ...(it.jog ? {jog: it.jog} : {}), ...(it.assist ? {assist: it.assist} : {}), src: 'aovivo'});
    } else if (it.tipo === 'falta') {
      if (perto('falta', 'A', it.vt, it.parte)) continue;
      out.push({type: 'falta', team: 'A', parte: it.parte, t: it.vt, ...(it.jog ? {jog: it.jog} : {}), ...(it.zona ? {zona: it.zona} : {}), src: 'aovivo'});
    }
  }
  return out;
}
