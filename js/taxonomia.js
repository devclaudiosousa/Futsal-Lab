// Taxonomia do marcador: tipos de evento, teclas, descrições rápidas de lances e sugestões.
// Os tipos de base têm significado estatístico fixo (remate, enquadrado, golo…): só se muda o nome, a tecla
// ou se se esconde. Os tipos novos ("extras") aparecem na marcação, no CSV, no Excel e nos clips, sem entrar nos totais de remates.
// Guardado no registo "taxonomia" do armazém sincronizado "definicoes".
import {db} from './db.js';

export const BASE = [
  {code: 'KeyR', key: 'R', id: 'remate_enquadrado', label: 'Remate enquadrado', short: 'Enquadrado', shot: 1, on: 1, zonas: ['D10', 'F10']},
  {code: 'KeyF', key: 'F', id: 'remate_fora', label: 'Remate fora', short: 'Fora', shot: 1, zonas: ['D10', 'F10']},
  {code: 'KeyB', key: 'B', id: 'remate_bloqueado', label: 'Remate bloqueado', short: 'Bloqueado', shot: 1, zonas: ['D10', 'F10']},
  {code: 'KeyG', key: 'G', id: 'golo', label: 'Golo', short: 'Golo', shot: 1, on: 1, zonas: ['D10', 'F10']},
  {code: 'KeyP', key: 'P', id: 'perda', label: 'Perda de bola', short: 'Perda', zonas: ['MD', 'MO']},
  {code: 'KeyU', key: 'U', id: 'recuperacao', label: 'Recuperação', short: 'Recuperação', zonas: ['MD', 'MO']},
  {code: 'KeyC', key: 'C', id: 'canto', label: 'Canto', short: 'Canto'},
  {code: 'KeyL', key: 'L', id: 'falta', label: 'Falta', short: 'Falta', who: 1, zonas: ['MD', 'MO']},
  {code: 'KeyY', key: 'Y', id: 'amarelo', label: 'Cartão amarelo', short: 'Amarelo', who: 1},
  {code: 'KeyV', key: 'V', id: 'vermelho', label: 'Cartão vermelho', short: 'Vermelho', who: 1},
  {code: 'KeyX', key: 'X', id: 'marca', label: 'Marcador livre', short: 'Marcador'},
];
export const RAPIDAS_BASE = ['pll construcao', 'pll finalizacao', 'pll circulacao', 'defesa saida baliza', 'defesa bola saida', 'bola saida', 'canto', 'defesa canto', 'livre'];
export const SUGESTOES_BASE = ['organizacao ofensiva', 'defesa transicao', 'defesa pll construcao', 'defesa pll organizacao'];
export const ZONAS = {D10: {short: 'D10M', label: 'dentro dos 10 m'}, F10: {short: 'F10M', label: 'fora dos 10 m'},
  MD: {short: 'MD', label: 'meio campo defensivo'}, MO: {short: 'MO', label: 'meio campo ofensivo'}};
export const ZONAS_GRUPOS = {remate: ['D10', 'F10'], campo: ['MD', 'MO']};

// Teclas de comando do marcador (não podem ser usadas por eventos)
export const RESERVADAS = ['A', 'S', 'Z', 'H', 'Q', 'W', 'T'];
export const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function aplicar(def = {}) {
  const tipos = BASE.map(t => ({...t, ...pick(def.tipos?.[t.id], ['label', 'short', 'key', 'ativo'])}))
    .concat((def.extras || []).map(x => ({...x, extra: 1, zonas: x.zonas ? ZONAS_GRUPOS[x.zonas] : undefined})));
  const TYPES = tipos.filter(t => t.ativo !== false).map(t => ({...t, code: t.key ? 'Key' + t.key : null}));
  const rapidas = Array.from({length: 9}, (_, i) => (def.rapidas?.[i] ?? RAPIDAS_BASE[i] ?? '').trim());
  return {TYPES, TODOS: tipos, RAPIDAS: rapidas, SUGESTOES_BASE: def.sugestoes?.length ? def.sugestoes : SUGESTOES_BASE, ZONAS};
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o && o[k] !== undefined && o[k] !== '').map(k => [k, o[k]]));

// Lista de problemas (vazia = válida)
export function validar(def) {
  const {TYPES} = aplicar(def);
  const out = [];
  const usadas = {};
  for (const t of TYPES) {
    if (!t.key) continue;
    if (RESERVADAS.includes(t.key)) out.push(`${t.label}: a tecla ${t.key} é de comando`);
    if (usadas[t.key]) out.push(`${t.label} e ${usadas[t.key]} usam a tecla ${t.key}`);
    usadas[t.key] = t.label;
  }
  for (const t of TYPES) if (!t.label?.trim()) out.push('Há um evento sem nome');
  return out;
}

export async function carregar() {
  try { return (await db.get('definicoes', 'taxonomia')) || {}; } catch (e) { return {}; }
}
export async function guardar(def) {
  const {id, createdAt, updatedAt, _dirty, ...rest} = def;
  return db.put('definicoes', {...rest, id: 'taxonomia'});
}
export const slugExtra = label => 'x_' + (label || 'evento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
