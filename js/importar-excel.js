// Importa o Excel de equipa do Control-Stats (BAFutsal_TeamRosterTemplate):
//  - folha 1 (TeamSheet): plantel nas linhas 14–29 → Número | Nº camisola | Nome | Apelido | Posição (GK/DF/MD/FW)
//  - folha "Situações" (opcional): situação | GR | FIXO | ALA | ALA | PIVÔ, com números de camisola
// Os presets ficam guardados por número de camisola e passam a valer para os jogos ao vivo seguintes.
import {db, config, setConfig} from './db.js';
import {loadXLSX} from './live/excel.js';
import {SITUACOES, SLOTS, slotsFor} from './live/engine.js';

const POS = {GK: 'GR', GR: 'GR', DF: 'Fixo', FIXO: 'Fixo', MD: 'Ala', ALA: 'Ala', FW: 'Pivô', PIVO: 'Pivô', 'PIVÔ': 'Pivô'};
const norm = t => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

export function lerExcelEquipa(XLSX, wb) {
  const sh = wb.Sheets[wb.SheetNames[0]];
  const v = ref => { const c = sh[ref]; return c && c.v != null ? c.v : ''; };
  const info = {};
  for (let i = 1; i < 11; i++) { const k = v('A' + i); if (k !== '') info[k] = v('B' + i); }
  const jogadores = [];
  for (let i = 14; i < 30; i++) {
    const num = String(v('B' + i)).trim(), nome = [v('C' + i), v('D' + i)].map(x => String(x).trim()).filter(Boolean).join(' ');
    if (!num && !nome) continue;
    jogadores.push({num, nome, posicao: POS[String(v('E' + i)).trim().toUpperCase()] || ''});
  }
  const presets = {}, avisos = [];
  const sname = wb.SheetNames.find(n => norm(n) === 'situacoes');
  if (sname) {
    const nums = new Set(jogadores.map(j => j.num));
    XLSX.utils.sheet_to_json(wb.Sheets[sname], {header: 1, defval: ''}).forEach((r, n) => {
      const lbl = norm(r[0]);
      if (!lbl || lbl === 'situacao') return;
      const sit = SITUACOES.find(s => norm(s.label) === lbl || s.id === lbl);
      if (!sit) { avisos.push(`Linha ${n + 1}: situação desconhecida "${r[0]}"`); return; }
      const vals = {}, usados = new Set(); let cheios = 0, erro = null;
      for (const s of slotsFor(sit)) {
        const x = String(r[1 + SLOTS.indexOf(s)]).trim();
        if (!x || x === '—' || x === '-') continue;
        cheios++;
        if (!nums.has(x)) { erro ||= `nº ${x} não está no plantel`; continue; }
        if (usados.has(x)) { erro ||= `nº ${x} repetido`; continue; }
        usados.add(x); vals[s] = x;
      }
      if (!cheios) return;
      if (erro) { avisos.push(`${sit.label}: ${erro}`); return; }
      if (cheios < slotsFor(sit).length) { avisos.push(`${sit.label}: faltam lugares (${cheios}/${slotsFor(sit).length})`); return; }
      presets[sit.id] = vals;
    });
  }
  return {info, jogadores, presets, avisos};
}

export async function importarExcelEquipa(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
  const r = lerExcelEquipa(XLSX, wb);
  const atuais = await db.all('atletas');
  let novos = 0, atualizados = 0;
  for (const j of r.jogadores) {
    const a = atuais.find(x => x.ativo !== false && j.num && x.num === j.num);
    if (a) { await db.put('atletas', {...a, nome: j.nome || a.nome, posicao: j.posicao || a.posicao}); atualizados++; }
    else { await db.put('atletas', {num: j.num, nome: j.nome, posicao: j.posicao, ativo: true}); novos++; }
  }
  if (Object.keys(r.presets).length) await db.put('definicoes', {id: 'presets', porNumero: r.presets});
  const cfg = await config();
  if ((!cfg.clube || cfg.clube === 'Nós') && r.info['Team Analyzed']) await setConfig({clube: String(r.info['Team Analyzed'])});
  return {novos, atualizados, presets: Object.keys(r.presets).length, avisos: r.avisos};
}
