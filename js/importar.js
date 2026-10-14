// Traz para a app o que o Marcador de Futsal antigo guardou no localStorage deste browser (mesmo endereço).
import {db} from './db.js';
import {today} from './ui.js';

const CONFIG_KEYS = /:(plantel|descricoes|pad|pad2|modo|velocidades|vista2?|teste)$/;

function oldGames() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('futsal-marcador:') || CONFIG_KEYS.test(k) || k.startsWith('futsal-marcador:jogo:')) continue;
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d?.events?.length) out.push({k, d});
    }
  } catch (e) {}
  return out;
}
function oldRoster() { try { return JSON.parse(localStorage.getItem('futsal-marcador:plantel') || 'null'); } catch (e) { return null; } }

export function marcadorAntigoDisponivel() {
  let done = [];
  try { done = JSON.parse(localStorage.getItem('banco:importados') || '[]'); } catch (e) {}
  const jogos = oldGames().filter(g => !done.includes(g.k)).length;
  const pl = oldRoster(), plantel = !!pl?.players?.some(p => p.nome) && !done.includes('plantel');
  return jogos || plantel ? {jogos, plantel} : null;
}

export async function importarMarcadorAntigo() {
  let done = [];
  try { done = JSON.parse(localStorage.getItem('banco:importados') || '[]'); } catch (e) {}
  let jogos = 0, atletas = 0;
  const pl = oldRoster();
  if (pl?.players && !done.includes('plantel')) {
    const have = new Set((await db.all('atletas')).map(a => a.num));
    for (const p of pl.players) if (p.num && !have.has(p.num)) { await db.put('atletas', {num: p.num, nome: p.nome || '', posicao: '', ativo: true}); atletas++; }
    done.push('plantel');
  }
  for (const {k, d} of oldGames()) {
    if (done.includes(k)) continue;
    const vivo = k === 'futsal-marcador:vivo';
    const data = vivo && d.live?.date ? d.live.date : d.ts ? new Date(d.ts).toISOString().slice(0, 10) : today();
    const slot = {events: d.events, parte: d.parte || 1, a: d.a, b: d.b, ...(vivo ? {live: d.live} : {nome: d.nome || k.split(':')[1], pos: d.pos || 0})};
    await db.put('jogos', {data, hora: '', adversario: d.b && d.b !== 'Adversário' ? d.b : (d.nome || '').replace(/\.[^.]+$/, ''), competicao: '', local: '', casa: true,
      concentracao: 0, convocados: [], notas: {}, marcador: vivo ? {vivo: slot} : {video: slot}});
    done.push(k); jogos++;
  }
  try { localStorage.setItem('banco:importados', JSON.stringify(done)); } catch (e) {}
  return {jogos, atletas};
}
