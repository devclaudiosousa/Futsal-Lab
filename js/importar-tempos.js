// Tempos de jogo de jogos antigos, colados de uma tabela (Excel, notas…).
// Cada linha: nome [posição] tempo1 tempo2 …   (separado por tabs ou espaços)
// Tempo: "15:38" = 15 min 38 s; "28" = 28 min; "0" ou vazio = não jogou.
const POS = {redes: 'GR', gr: 'GR', 'guarda-redes': 'GR', guardaredes: 'GR', fixo: 'Fixo', ala: 'Ala', pivot: 'Pivô', pivo: 'Pivô', 'pivô': 'Pivô', universal: 'Universal'};
const TEMPO = /^\d{1,3}([:.,']\d{1,2})?'?$/;

export const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function lerTempo(t) {
  t = String(t ?? '').trim().replace(/'$/, '');
  if (!t || t === '-' || t === '–') return 0;
  const m = /^(\d{1,3})(?:[:.,'](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return +m[1] * 60 + (m[2] ? +m[2].padEnd(2, '0') : 0);
}

export function lerTabela(txt) {
  const linhas = [], avisos = [];
  let colunas = 0;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const tok = raw.trim().split(/\t+|\s+/).filter(Boolean);
    if (!tok.length) continue;
    const tempos = [];
    while (tok.length > 1 && TEMPO.test(tok[tok.length - 1])) tempos.unshift(lerTempo(tok.pop()));
    if (!tempos.length) { avisos.push(`Sem tempos, ignorada: "${raw.trim()}"`); continue; }
    let pos = '';
    if (tok.length > 1 && POS[norm(tok[tok.length - 1])]) pos = POS[norm(tok.pop())];
    linhas.push({nome: tok.join(' '), pos, tempos});
    colunas = Math.max(colunas, tempos.length);
  }
  for (const l of linhas) while (l.tempos.length < colunas) l.tempos.push(0);
  return {linhas, colunas, avisos};
}

// Liga cada nome colado a um atleta do plantel: nome igual (sem acentos), ou um nome contido no outro
// ("Bernardo" ↔ "Bernardo Brasil") desde que só haja um candidato. Sem certeza fica null (= criar novo).
export function casar(nome, atletas) {
  const n = norm(nome), tn = n.split(' ');
  const vivos = atletas.filter(a => !a.deleted);
  const igual = vivos.filter(a => norm(a.nome) === n);
  if (igual.length === 1) return igual[0].id;
  if (igual.length > 1) return null;
  const contido = vivos.filter(a => {
    const ta = norm(a.nome).split(' ').filter(Boolean);
    if (!ta.length || ta[0] !== tn[0]) return false;
    const [curto, longo] = ta.length <= tn.length ? [ta, tn] : [tn, ta];
    return curto.every(w => longo.includes(w));
  });
  return contido.length === 1 ? contido[0].id : null;
}
