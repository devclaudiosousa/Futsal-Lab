import {db, config} from './db.js';
import {today, byNum} from './ui.js';
import {score} from './stats.js';
import {toBancoEvents} from './live/engine.js';

export async function agenda() {
  const [treinos, jogos] = await Promise.all([db.all('treinos'), db.all('jogos')]);
  return [...treinos.map(t => ({...t, kind: 'treino'})), ...jogos.map(j => ({...j, kind: 'jogo'}))]
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.hora || '').localeCompare(b.hora || ''));
}
export async function atletas(all = false) {
  const list = (await db.all('atletas')).sort(byNum);
  return all ? list : list.filter(a => a.ativo !== false);
}
export const mins = t => (t.blocos || []).reduce((s, b) => s + (+b.min || 0), 0);

// Eventos a usar para estatística. Fontes: 'video' (marcador sobre vídeo), 'banco' (jogo ao vivo no banco,
// em tempo útil) e 'vivo' (modo ao vivo antigo do marcador). Por defeito: vídeo, depois banco, depois o antigo.
export const FONTES = {video: 'Vídeo', banco: 'Ao vivo', vivo: 'Ao vivo antigo'};
export function fontes(j) {
  const out = {};
  const v = j?.marcador?.video?.events || [], l = j?.marcador?.vivo?.events || [];
  if (v.length) out.video = v;
  if (j?.aovivo?.events?.some(e => e.type === 'kickoff')) out.banco = toBancoEvents(j.aovivo, Date.now());
  if (l.length) out.vivo = l;
  return out;
}
export function marcadorSet(j, pref) {
  const f = fontes(j);
  const src = pref && f[pref] ? pref : Object.keys(f)[0] || null;
  return {src, events: src ? f[src] : [], fontes: Object.keys(f)};
}
export function resultado(j) {
  if (j.golosNos != null && j.golosNos !== '' && j.golosEles != null && j.golosEles !== '') return {a: +j.golosNos, b: +j.golosEles, manual: true};
  const {events} = marcadorSet(j);
  if (!events.length) {
    const g = j.manual?.golos || [];
    return g.length ? {a: g.filter(x => x.nos).length, b: g.filter(x => !x.nos).length, manual: true} : null;
  }
  return {...score(events), manual: false};
}
export function jogoTitulo(j, clube = 'Nós') {
  const adv = j.adversario || 'Adversário';
  return j.casa === false ? `${adv} – ${clube}` : `${clube} – ${adv}`;
}
export function placar(j, r) {
  if (!r) return '';
  return j.casa === false ? `${r.b}–${r.a}` : `${r.a}–${r.b}`;
}
export const desfecho = r => !r ? null : r.a > r.b ? ['V', 'ok'] : r.a < r.b ? ['D', 'crit'] : ['E', 'warn'];
export async function novoTreino(data = today()) {
  return db.put('treinos', {data, hora: '19:00', titulo: '', objetivo: '', blocos: [], presencas: {}, rpe: ''});
}
export async function novoJogo(data = today()) {
  return db.put('jogos', {data, hora: '18:30', adversario: '', competicao: '', local: '', casa: true, concentracao: 60, convocados: [], notas: {}, marcador: {}});
}
export {config};
