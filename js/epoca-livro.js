// Excel da época para LER: Resumo, Jogadores, Jogo a jogo, Minutos, Golos, Quartetos (+ Eventos e Ajustes quando
// houver) e, no fim, "Dados" (uma linha por jogador e jogo, para filtrar e fazer tabelas dinâmicas).
// Os números vêm de analisarJogo / buildEpoca (epoca-excel.js); aqui só se organiza e formata.
import {analisarJogo, categorias, buildEpoca} from './epoca-excel.js';
import {colName} from './xlsx-lite.js';

// cores do clube e tons suaves para ler bem
const C = {preto: '#0B0B0B', laranja: '#FF6B1A', laranjaTxt: '#C24E0A', branco: '#FFFFFF', cinza: '#6B7280', zero: '#B8B8B8',
  cab: '#EDEBE7', zebra: '#F7F6F3', verde: '#DCF2E3', verdeTxt: '#1E6B3A', verm: '#FBE1E1', vermTxt: '#9B2C2C', amar: '#FDF3D0', amarTxt: '#7A5B00'};
const HEAT = ['#FFF4EC', '#FFE3D1', '#FFC9A6', '#FFAD7A', '#FF9150'];
const POS = {GR: 0, Fixo: 1, Universal: 2, Ala: 3, 'Pivô': 4};
const MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const T = s => (s > 0 ? s / 86400 : '');                     // segundos → tempo do Excel
const dCurta = d => { const [y, m, dd] = (d || '').split('-'); return y ? `${+dd} ${MES[+m - 1]}` : 'sem data'; };
const dNum = d => { const [, m, dd] = (d || '').split('-'); return m ? `${dd}/${m}` : ''; };
const mmss = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// estilos
const S = {
  banda: {b: true, sz: 16, cor: C.laranja, fundo: C.preto},
  bandaSub: {i: true, sz: 10, cor: '#D1D5DB', fundo: C.preto},
  secao: {b: true, sz: 12, cor: C.branco, fundo: C.laranja},
  secaoVerde: {b: true, sz: 12, cor: C.verdeTxt, fundo: C.verde},
  secaoVerm: {b: true, sz: 12, cor: C.vermTxt, fundo: C.verm},
  grupo: {b: true, sz: 10, cor: C.branco, fundo: '#3A3A3A', alinhar: 'centro'},
  cab: {b: true, sz: 10, fundo: C.cab, borda: 'baixo', quebra: true, alinhar: 'centro'},
  cabEsq: {b: true, sz: 10, fundo: C.cab, borda: 'baixo', quebra: true},
  nota: {i: true, sz: 9, cor: C.cinza},
  kpiLbl: {sz: 9, cor: C.cinza, alinhar: 'centro', fundo: '#FAFAF8', borda: 'cima', corBorda: '#E5E3DE'},
  total: {b: true, fundo: C.cab, borda: 'cima'},
};
const st = (base, extra) => ({...base, ...extra});

// célula numérica: zero a cinzento claro; cor por significado
function num(v, {tipo, zebra, fmt} = {}) {
  const z = zebra ? {fundo: C.zebra} : {};
  if (v === '' || v == null) return {v: '', s: zebra ? z : undefined};
  if (!v) return {v, s: {...z, cor: C.zero, alinhar: 'centro', ...(fmt ? {fmt} : {})}};
  const base = {...z, alinhar: 'centro', ...(fmt ? {fmt} : {})};
  if (tipo === 'bom') return {v, s: {...base, fundo: C.verde, cor: C.verdeTxt, b: true}};
  if (tipo === 'mau') return {v, s: {...base, fundo: C.verm, cor: C.vermTxt, b: true}};
  if (tipo === 'sinal') return {v, s: v > 0 ? {...base, fundo: C.verde, cor: C.verdeTxt, b: true} : {...base, fundo: C.verm, cor: C.vermTxt, b: true}};
  return {v, s: base};
}
const txt = (v, zebra, extra = {}) => ({v, s: {...(zebra ? {fundo: C.zebra} : {}), ...extra}});

export function livroEpoca({jogos, atletas, cfg = {}, filtro = {}, agora = new Date()}) {
  const clube = cfg.clube || 'Nós', epoca = cfg.epoca || '';
  const ats = atletas.filter(a => !a.deleted);
  const atById = Object.fromEntries(ats.map(a => [a.id, a]));
  const atByNum = {}; for (const a of ats) if (a.num && (a.ativo !== false || !atByNum[a.num])) atByNum[String(a.num)] = a;
  const ult = a => (a?.nome || '').trim().split(/\s+/).pop() || '';
  const conta = {}; for (const a of ats) conta[ult(a)] = (conta[ult(a)] || 0) + 1;
  const curto = a => (a ? a.curto?.trim() || (conta[ult(a)] > 1 ? a.nome.trim() : ult(a)) || String(a.num || '?') : '');
  const nomeDe = (k, info) => (atById[k] ? atById[k].nome || '' : info?.[k]?.nome || String(k || '').replace('#', ''));
  const curtoDe = (k, info) => (atById[k] ? curto(atById[k]) : atByNum[String(info?.[k]?.num ?? String(k).replace('#', ''))] ? curto(atByNum[String(info?.[k]?.num ?? String(k).replace('#', ''))]) : nomeDe(k, info));
  const posDe = (k, info) => atById[k]?.posicao || info?.[k]?.posicao || '';
  const numDe = (k, info) => atById[k]?.num ?? info?.[k]?.num ?? String(k || '').replace('#', '');
  const ordem = (a, b, info) => ((POS[posDe(a, info)] ?? 5) - (POS[posDe(b, info)] ?? 5)) || ((parseInt(numDe(a, info)) || 999) - (parseInt(numDe(b, info)) || 999));

  const sel = jogos.filter(j => !j.deleted && (!filtro.de || (j.data || '') >= filtro.de) && (!filtro.ate || (j.data || '') <= filtro.ate)
    && (!filtro.competicao || j.competicao === filtro.competicao)).sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // ---------- análise por jogo
  const J = sel.map(j => {
    const an = analisarJogo(j, {atById, atByNum});
    const cat = categorias(j);
    const t = an.totais, tem = t.gn != null;
    const prol = !!j.prolongamento || Object.values(an.P).some(x => x.s3 || x.s4);
    const duracao = 2400 + (prol ? 600 : 0);
    return {j, an, cat, tem, gn: t.gn, ga: t.ga, res: tem ? (t.gn > t.ga ? 'V' : t.gn < t.ga ? 'D' : 'E') : '', prol, duracao};
  });
  const jogados = J.filter(x => x.tem);
  const V = jogados.filter(x => x.res === 'V').length, E = jogados.filter(x => x.res === 'E').length, D = jogados.filter(x => x.res === 'D').length;
  const GM = jogados.reduce((s, x) => s + x.gn, 0), GS = jogados.reduce((s, x) => s + x.ga, 0);

  // ---------- totais da época por atleta (só as estatísticas que cada jogo conta)
  const Z = () => ({conv: 0, jogos: 0, seg: 0, possivel: 0, gol: 0, ast: 0, rem: 0, mais: 0, menos: 0, ajMais: 0, ajMenos: 0, fcMD: 0, fcMO: 0, fsMD: 0, fsMO: 0,
    am: 0, verm: 0, pc: 0, pf: 0, perd: 0, recup: 0, notas: []});
  const ep = {}, info = {};
  const tem = {remates: false, passes: false, perdas: false, faltasSofridas: false, ajustes: false, notas: false, faltas: false, cartoes: false};
  for (const g of J) {
    Object.assign(info, g.an.info);
    const conv = new Set((g.j.convocados || []).filter(id => atById[id]));
    for (const k of new Set([...conv, ...Object.keys(g.an.P)])) {
      const x = g.an.P[k] || {}, s = ep[k] ||= Z(), c = g.cat;
      if (conv.has(k)) s.conv++;
      if (c.minutos && x.seg > 0) { s.jogos++; s.seg += x.seg; s.possivel += g.duracao; }
      if (c.golos) for (const f of ['gol', 'ast', 'mais', 'menos', 'ajMais', 'ajMenos']) s[f] += x[f] || 0;
      if (c.remates) { s.rem += x.rem || 0; tem.remates = true; }
      if (c.faltas) { for (const f of ['fcMD', 'fcMO', 'fsMD', 'fsMO']) s[f] += x[f] || 0; tem.faltas = true; }
      if (c.cartoes) { s.am += x.am || 0; s.verm += x.verm || 0; tem.cartoes = true; }
      if (c.passes) { s.pc += x.pc || 0; s.pf += x.pf || 0; tem.passes = true; }
      if (c.perdas) { s.perd += x.perd || 0; s.recup += x.recup || 0; tem.perdas = true; }
      const n = g.j.notas?.[k]; if (n) { s.notas.push(+n); tem.notas = true; }
    }
  }
  for (const s of Object.values(ep)) { if (s.fsMD || s.fsMO) tem.faltasSofridas = true; if (s.ajMais || s.ajMenos) tem.ajustes = true; }
  const chaves = Object.keys(ep).filter(k => { const s = ep[k]; return s.conv || s.seg || s.mais || s.menos || s.am || s.verm || s.fcMD + s.fcMO; })
    .sort((a, b) => ordem(a, b, info));
  const titulo = `${clube.toUpperCase()}${epoca ? ' · ÉPOCA ' + epoca : ''}`;
  const gerado = `Gerado a ${agora.toLocaleDateString('pt-PT')} às ${agora.toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'})} · ${sel.length} jogo${sel.length === 1 ? '' : 's'}${filtro.competicao ? ' · ' + filtro.competicao : ''}`;
  const banda = (linhas, unir, n, texto, sub) => {
    linhas.push([{v: texto, s: S.banda}, ...Array(n - 1).fill({v: '', s: S.banda})]); unir.push(`A${linhas.length}:${colName(n - 1)}${linhas.length}`);
    linhas.push([{v: sub, s: S.bandaSub}, ...Array(n - 1).fill({v: '', s: S.bandaSub})]); unir.push(`A${linhas.length}:${colName(n - 1)}${linhas.length}`);
  };
  const secao = (linhas, unir, n, texto, estilo = S.secao) => { linhas.push([{v: texto, s: estilo}, ...Array(n - 1).fill({v: '', s: estilo})]); unir.push(`A${linhas.length}:${colName(n - 1)}${linhas.length}`); };
  const folhas = [];

  // ================= 1. RESUMO
  {
    const n = 7, L = [], U = [], H = {0: 30, 1: 18};
    banda(L, U, n, titulo, gerado);
    L.push([]);
    const kpis = [['Jogos', jogados.length], ['Vitórias', V, 'bom'], ['Empates', E], ['Derrotas', D, 'mau'], ['Golos marcados', GM, 'bom'], ['Golos sofridos', GS, 'mau'], ['Diferença', GM - GS, 'sinal']];
    L.push(kpis.map(([l]) => ({v: l, s: S.kpiLbl})));
    L.push(kpis.map(([, v, t]) => { const c = num(v, {tipo: t}); return {v, s: {...(c.s || {}), sz: 20, b: true, alinhar: 'centro', ...(v ? {} : {cor: '#9CA3AF'})}}; }));
    H[L.length - 1] = 34;
    L.push([]);
    secao(L, U, n, 'JOGOS');
    L.push(['Data', 'Competição', 'Adversário', 'Casa / Fora', clube, 'Adversário', 'Resultado'].map((v, i) => ({v, s: i < 3 ? S.cabEsq : S.cab})));
    J.forEach((g, i) => {
      const z = i % 2 === 1, r = g.res;
      L.push([txt(dCurta(g.j.data), z), txt(g.j.competicao || '', z), txt((g.j.adversario || '').trim(), z, {b: true}), txt(g.j.casa === false ? 'Fora' : 'Casa', z, {alinhar: 'centro'}),
        g.tem ? num(g.gn, {tipo: 'bom', zebra: z}) : txt('', z), g.tem ? num(g.ga, {tipo: 'mau', zebra: z}) : txt('', z),
        r ? {v: {V: 'Vitória', E: 'Empate', D: 'Derrota'}[r], s: {b: true, alinhar: 'centro', fundo: {V: C.verde, E: C.amar, D: C.verm}[r], cor: {V: C.verdeTxt, E: C.amarTxt, D: C.vermTxt}[r]}} : txt('por jogar', z, {cor: C.zero, alinhar: 'centro', i: true})]);
    });
    L.push([]);
    secao(L, U, n, 'MELHORES DA ÉPOCA');
    L.push(['', 'Minutos', 'Golos', 'Assistências', '+/−'].map((v, i) => ({v, s: i ? S.cabEsq : S.cab})));
    const top = (f, fmt) => chaves.filter(k => f(ep[k]) > 0).sort((a, b) => f(ep[b]) - f(ep[a])).slice(0, 5).map(k => `${nomeDe(k, info)} — ${fmt ? fmt(f(ep[k])) : f(ep[k])}`);
    const tops = [top(s => s.seg, mmss), top(s => s.gol), top(s => s.ast), top(s => s.mais - s.menos, v => (v > 0 ? '+' : '') + v)];
    for (let i = 0; i < 5; i++) { const z = i % 2 === 1; L.push([txt(`${i + 1}.º`, z, {b: true, alinhar: 'centro', cor: C.laranjaTxt}), ...tops.map(t => txt(t[i] || '', z))]); }
    L.push([]);
    L.push([{v: '+/− : cada golo ou assistência vale +1; cada golo sofrido com o atleta em campo vale −1 (o GR conta como os outros). Minutos em tempo útil quando o jogo foi marcado no Ao vivo.', s: S.nota}]);
    U.push(`A${L.length}:G${L.length}`);
    folhas.push({nome: 'Resumo', linhas: L, unir: U, larguras: [10, 30, 26, 22, 18, 12, 14], alturas: H, grelha: false, cor: C.laranja});
  }

  // ================= 2. JOGADORES
  {
    const grupos = [['Atleta', [['Nº', 5], ['Nome', 22], ['Posição', 10]]], ['Presença', [['Convocado', 10], ['Jogou', 8]]],
      ['Tempo', [['Total', 10], ['Média por jogo', 10], ['% do tempo', 9]]],
      ['Ataque', [['Golos', 8], ['Assist.', 8], ...(tem.remates ? [['Remates', 9]] : [])]],
      ['+/−', [['+', 6], ['−', 6], ['Saldo', 8], ...(tem.ajustes ? [['dos quais ajustes', 10]] : [])]],
      ...(tem.faltas || tem.cartoes ? [['Disciplina', [...(tem.faltas ? [['Faltas MD', 8], ['Faltas MO', 8]] : []), ...(tem.faltasSofridas ? [['Sofridas MD', 9], ['Sofridas MO', 9]] : []), ...(tem.cartoes ? [['Amarelos', 9], ['Vermelhos', 9]] : [])]]] : []),
      ...(tem.passes || tem.perdas ? [['Vídeo', [...(tem.passes ? [['Passes certos', 9], ['Passes falhados', 9], ['% passe', 8]] : []), ...(tem.perdas ? [['Perdas', 8], ['Recuperações', 11]] : [])]]] : []),
      ...(tem.notas ? [['Nota', [['Média', 8]]]] : [])];
    const cols = grupos.flatMap(([, c]) => c), n = cols.length, L = [], U = [];
    banda(L, U, n, `JOGADORES · ${titulo}`, gerado);
    const lg = []; let c0 = 0;
    for (const [g, c] of grupos) { lg.push({v: g, s: S.grupo}, ...Array(c.length - 1).fill({v: '', s: S.grupo})); if (c.length > 1) U.push(`${colName(c0)}3:${colName(c0 + c.length - 1)}3`); c0 += c.length; }
    L.push(lg);
    L.push(cols.map(([h], i) => ({v: h, s: i === 1 ? S.cabEsq : S.cab})));
    const tot = Z();
    chaves.forEach((k, i) => {
      const s = ep[k], z = i % 2 === 1, r = [];
      for (const f of Object.keys(tot)) if (f !== 'notas') tot[f] += s[f];
      for (const [h] of cols) {
        r.push(({
          'Nº': () => txt(numDe(k, info), z, {alinhar: 'centro', b: true}), 'Nome': () => txt(nomeDe(k, info), z, {b: true}), 'Posição': () => txt(posDe(k, info), z, {cor: C.cinza}),
          'Convocado': () => num(s.conv, {zebra: z}), 'Jogou': () => num(s.jogos, {zebra: z}),
          'Total': () => num(T(s.seg) || 0, {zebra: z, fmt: 'tempo'}), 'Média por jogo': () => num(s.jogos ? T(s.seg / s.jogos) : 0, {zebra: z, fmt: 'tempo'}),
          '% do tempo': () => num(s.possivel ? s.seg / s.possivel : 0, {zebra: z, fmt: 'pct'}),
          'Golos': () => num(s.gol, {tipo: 'bom', zebra: z}), 'Assist.': () => num(s.ast, {tipo: 'bom', zebra: z}), 'Remates': () => num(s.rem, {zebra: z}),
          '+': () => num(s.mais, {tipo: 'bom', zebra: z}), '−': () => num(s.menos, {tipo: 'mau', zebra: z}), 'Saldo': () => num(s.mais - s.menos, {tipo: 'sinal', zebra: z}),
          'dos quais ajustes': () => num(s.ajMais - s.ajMenos, {tipo: 'sinal', zebra: z}),
          'Faltas MD': () => num(s.fcMD, {zebra: z}), 'Faltas MO': () => num(s.fcMO, {zebra: z}), 'Sofridas MD': () => num(s.fsMD, {zebra: z}), 'Sofridas MO': () => num(s.fsMO, {zebra: z}),
          'Amarelos': () => num(s.am, {zebra: z}), 'Vermelhos': () => num(s.verm, {tipo: 'mau', zebra: z}),
          'Passes certos': () => num(s.pc, {zebra: z}), 'Passes falhados': () => num(s.pf, {zebra: z}), '% passe': () => num(s.pc + s.pf ? s.pc / (s.pc + s.pf) : '', {zebra: z, fmt: 'pct'}),
          'Perdas': () => num(s.perd, {zebra: z}), 'Recuperações': () => num(s.recup, {zebra: z}),
          'Média': () => num(s.notas.length ? Math.round(10 * s.notas.reduce((a, b) => a + b, 0) / s.notas.length) / 10 : '', {zebra: z, fmt: '1dec'}),
        })[h]());
      }
      L.push(r);
    });
    const somaCols = new Set(['Golos', 'Assist.', 'Remates', 'Faltas MD', 'Faltas MO', 'Sofridas MD', 'Sofridas MO', 'Amarelos', 'Vermelhos', 'Passes certos', 'Passes falhados', 'Perdas', 'Recuperações']);
    const mapa = {'Golos': 'gol', 'Assist.': 'ast', 'Remates': 'rem', 'Faltas MD': 'fcMD', 'Faltas MO': 'fcMO', 'Sofridas MD': 'fsMD', 'Sofridas MO': 'fsMO', 'Amarelos': 'am', 'Vermelhos': 'verm', 'Passes certos': 'pc', 'Passes falhados': 'pf', 'Perdas': 'perd', 'Recuperações': 'recup'};
    L.push(cols.map(([h], i) => (i === 1 ? {v: 'Total da equipa', s: S.total} : somaCols.has(h) ? {v: tot[mapa[h]], s: {...S.total, alinhar: 'centro'}} : {v: '', s: S.total})));
    L.push([]);
    L.push([{v: 'Ordenados por posição e número. Zeros a cinzento claro. % do tempo = minutos jogados ÷ tempo dos jogos em que jogou (40 min, ou 50 com prolongamento). Cada jogo só conta nas estatísticas que tem (ver "Contar na época" no jogo).', s: S.nota}]);
    U.push(`A${L.length}:${colName(n - 1)}${L.length}`);
    folhas.push({nome: 'Jogadores', linhas: L, unir: U, larguras: cols.map(([, w]) => w), alturas: {0: 30, 1: 18, 3: 30}, fixar: {linhas: 4, colunas: 2}, grelha: false,
      filtro: chaves.length ? `A4:${colName(n - 1)}${4 + chaves.length}` : undefined});
  }

  // ================= 3. JOGO A JOGO
  {
    const cols = [['Nº', 5], ['Atleta', 22], ['Posição', 10], ['1.ª parte', 9], ['2.ª parte', 9], ['Prol.', 8], ['Total', 9], ['Golos', 7], ['Assist.', 7], ['+/−', 7], ['Faltas MD', 8], ['Faltas MO', 8], ['Cartões', 9], ['Nota', 7]];
    const n = cols.length, L = [], U = [], H = {0: 30, 1: 18};
    banda(L, U, n, `JOGO A JOGO · ${titulo}`, gerado);
    for (const g of J) {
      L.push([]);
      const {j, an, cat} = g;
      const res = g.tem ? `${g.gn}–${g.ga}  ${g.res}` : 'por jogar';
      const head = `${dCurta(j.data)} · ${(j.competicao || 'Jogo').toUpperCase()} · ${(j.adversario || '').trim()} (${j.casa === false ? 'fora' : 'casa'})`;
      const rs = g.res ? {b: true, sz: 13, alinhar: 'centro', fundo: {V: C.verde, E: C.amar, D: C.verm}[g.res], cor: {V: C.verdeTxt, E: C.amarTxt, D: C.vermTxt}[g.res]} : {i: true, cor: C.zero, fundo: C.preto, alinhar: 'centro'};
      L.push([{v: head, s: {b: true, sz: 12, cor: C.branco, fundo: C.preto}}, ...Array(n - 4).fill({v: '', s: {fundo: C.preto}}), {v: res, s: rs}, {v: '', s: rs}, {v: '', s: rs}]);
      U.push(`A${L.length}:${colName(n - 4)}${L.length}`, `${colName(n - 3)}${L.length}:${colName(n - 1)}${L.length}`); H[L.length - 1] = 22;
      const off = Object.entries(cat).filter(([, v]) => !v).map(([c]) => ({minutos: 'minutos', golos: 'golos e +/−', remates: 'remates', passes: 'passes', perdas: 'perdas/recuperações', faltas: 'faltas', cartoes: 'cartões'}[c]));
      L.push([{v: [j.local && `Local: ${j.local}`, an.minSrc && `Minutos: ${an.minSrc.toLowerCase()}`, off.length && `Não conta: ${off.join(', ')}`].filter(Boolean).join('   ·   '), s: S.nota}]);
      U.push(`A${L.length}:${colName(n - 1)}${L.length}`);
      L.push(cols.map(([h], i) => ({v: h, s: i === 1 ? S.cabEsq : S.cab})));
      const conv = new Set((j.convocados || []).filter(id => atById[id]));
      const ks = [...new Set([...conv, ...Object.keys(an.P)])].filter(k => { const x = an.P[k]; return conv.has(k) || (x && (x.seg || x.gol || x.ast || x.mais || x.menos || x.am || x.verm || x.fcMD + x.fcMO)); }).sort((a, b) => ordem(a, b, an.info));
      ks.forEach((k, i) => {
        const x = an.P[k] || {}, z = i % 2 === 1, nao = cat.minutos && !(x.seg > 0);
        const b = (on, f) => (on ? f() : txt('', z));
        const partes = (x.s1 || 0) + (x.s2 || 0) + (x.s3 || 0) + (x.s4 || 0) > 0;
        const cart = [x.am ? '🟨'.repeat(Math.min(2, x.am)) : '', x.verm ? '🟥' : ''].join('');
        L.push([txt(numDe(k, an.info), z, {alinhar: 'centro', b: true}), txt(nomeDe(k, an.info), z, nao ? {cor: C.zero} : {b: true}), txt(posDe(k, an.info), z, {cor: C.cinza}),
          b(cat.minutos && partes, () => num(T(x.s1) || 0, {zebra: z, fmt: 'tempo'})), b(cat.minutos && partes, () => num(T(x.s2) || 0, {zebra: z, fmt: 'tempo'})),
          b(cat.minutos && g.prol && partes, () => num(T((x.s3 || 0) + (x.s4 || 0)) || 0, {zebra: z, fmt: 'tempo'})),
          cat.minutos ? (nao ? txt('não jogou', z, {i: true, cor: C.zero, alinhar: 'centro'}) : {v: T(x.seg), s: {...(z ? {fundo: C.zebra} : {}), fmt: 'tempo', b: true, alinhar: 'centro'}}) : txt('', z),
          b(cat.golos, () => num(x.gol || 0, {tipo: 'bom', zebra: z})), b(cat.golos, () => num(x.ast || 0, {tipo: 'bom', zebra: z})), b(cat.golos, () => num((x.mais || 0) - (x.menos || 0), {tipo: 'sinal', zebra: z})),
          b(cat.faltas, () => num(x.fcMD || 0, {zebra: z})), b(cat.faltas, () => num(x.fcMO || 0, {zebra: z})), txt(cat.cartoes ? cart : '', z, {alinhar: 'centro'}),
          num(j.notas?.[k] ? +j.notas[k] : '', {zebra: z})]);
      });
      // golos do jogo
      if (cat.golos && an.golos.length) {
        for (const go of an.golos) {
          const on = go.on || [], gr = on[0] ? curtoDe(on[0], an.info) : '?';
          const quart = on.slice(1).filter(Boolean).map(k => curtoDe(k, an.info)).join(' · ');
          const quem = go.nos ? `${go.by ? nomeDe(go.by, an.info) : 'Marcador por indicar'}${go.ast ? ` (assist. ${nomeDe(go.ast, an.info)})` : ''}` : 'Golo sofrido';
          const s = go.nos ? {fundo: C.verde, cor: C.verdeTxt} : {fundo: C.verm, cor: C.vermTxt};
          const min = `${go.parte > 2 ? 'P' + (go.parte - 2) : go.parte + '.ª'}${go.t ? ' · ' + Math.floor(go.t / 60) + "'" : ''}`;
          L.push([{v: go.nos ? '⚽' : '✕', s: {...s, alinhar: 'centro'}}, {v: `${quem}`, s: {...s, b: true}}, {v: min, s: {...s, alinhar: 'centro'}},
            {v: on.some(Boolean) ? `Em campo: GR ${gr}${quart ? ' · ' + quart : ''}` : 'Sem registo de quem estava em campo', s}, ...Array(n - 4).fill({v: '', s})]);
          U.push(`D${L.length}:${colName(n - 1)}${L.length}`);
        }
      }
      const aj = an.ajustes || [];
      for (const a of cat.golos ? aj : []) {
        L.push([{v: a.v > 0 ? '+1' : '−1', s: {alinhar: 'centro', b: true, cor: a.v > 0 ? C.verdeTxt : C.vermTxt}}, {v: nomeDe(a.k, an.info), s: S.nota}, {v: 'ajuste', s: S.nota}, {v: a.desc || '', s: S.nota}]);
        U.push(`D${L.length}:${colName(n - 1)}${L.length}`);
      }
    }
    L.push([]);
    L.push([{v: 'Tempos em minutos:segundos. "não jogou" = convocado sem minutos. ⚽ golo marcado · ✕ golo sofrido · +1/−1 ajustes do treinador.', s: S.nota}]);
    U.push(`A${L.length}:${colName(n - 1)}${L.length}`);
    folhas.push({nome: 'Jogo a jogo', linhas: L, unir: U, larguras: cols.map(([, w]) => w), alturas: H, fixar: {linhas: 2}, grelha: false});
  }

  // ================= 4. MINUTOS (grelha atleta × jogo, pintada pelos minutos)
  {
    const comMin = J.filter(g => g.cat.minutos && Object.values(g.an.P).some(x => x.seg > 0));
    const n = 3 + comMin.length + 2, L = [], U = [];
    banda(L, U, n, `MINUTOS · ${titulo}`, gerado);
    L.push(['Nº', 'Atleta', 'Posição', ...comMin.map(g => `${dNum(g.j.data)} ${(g.j.adversario || '').trim()}`), 'Total', 'Média'].map((v, i) => ({v, s: i === 1 ? S.cabEsq : S.cab})));
    const ks = chaves.filter(k => ep[k].seg > 0);
    ks.forEach((k, i) => {
      const z = i % 2 === 1;
      L.push([txt(numDe(k, info), z, {alinhar: 'centro', b: true}), txt(nomeDe(k, info), z, {b: true}), txt(posDe(k, info), z, {cor: C.cinza}),
        ...comMin.map(g => { const s = g.an.P[k]?.seg || 0; if (!s) return txt('', z); const lv = Math.min(4, Math.floor(5 * s / g.duracao)); return {v: T(s), s: {fmt: 'tempo', alinhar: 'centro', fundo: HEAT[lv], ...(lv >= 3 ? {b: true} : {})}}; }),
        {v: T(ep[k].seg), s: {fmt: 'tempo', b: true, alinhar: 'centro', fundo: C.cab}}, {v: ep[k].jogos ? T(ep[k].seg / ep[k].jogos) : '', s: {fmt: 'tempo', alinhar: 'centro', fundo: C.cab}}]);
    });
    L.push([]);
    L.push([{v: 'Quanto mais escuro o laranja, mais tempo jogou nesse jogo (escala sobre 40 min). Total e média só com os jogos que contam minutos.', s: S.nota}]);
    U.push(`A${L.length}:${colName(Math.max(n - 1, 6))}${L.length}`);
    folhas.push({nome: 'Minutos', linhas: L, unir: U, larguras: [5, 22, 10, ...comMin.map(() => 12), 10, 10], alturas: {0: 30, 1: 18, 2: 42}, fixar: {linhas: 3, colunas: 2}, grelha: false});
  }

  // ================= 5. GOLOS
  {
    const n = 8, L = [], U = [];
    banda(L, U, n, `GOLOS · ${titulo}`, gerado);
    const todos = J.filter(g => g.cat.golos).flatMap(g => g.an.golos.map(go => ({g, go})));
    const linha = ({g, go}, z, nos) => {
      const on = go.on || [], an = g.an;
      const quart = on.slice(1).filter(Boolean).map(k => curtoDe(k, an.info)).join(' · ');
      const base = [txt(dCurta(g.j.data), z), txt((g.j.adversario || '').trim(), z), txt(go.parte > 2 ? 'Prol. ' + (go.parte - 2) : go.parte + '.ª', z, {alinhar: 'centro'}), txt(go.t ? Math.floor(go.t / 60) + "'" : '', z, {alinhar: 'centro'})];
      return nos ? [...base, txt(go.by ? nomeDe(go.by, an.info) : 'por indicar', z, {b: true, ...(go.by ? {} : {cor: C.zero, i: true})}), txt(go.ast ? nomeDe(go.ast, an.info) : '', z), txt(on[0] ? curtoDe(on[0], an.info) : '', z), txt(quart, z)]
        : [...base, txt(on[0] ? curtoDe(on[0], an.info) : '', z, {b: true}), txt(quart, z), txt('', z), txt('', z)];
    };
    const marc = todos.filter(x => x.go.nos), sof = todos.filter(x => !x.go.nos);
    L.push([]);
    secao(L, U, n, `MARCADOS (${marc.length})`, S.secaoVerde);
    L.push(['Data', 'Adversário', 'Parte', 'Min.', 'Marcador', 'Assistência', 'GR', 'Quarteto em campo'].map((v, i) => ({v, s: [2, 3].includes(i) ? S.cab : S.cabEsq})));
    marc.forEach((x, i) => L.push(linha(x, i % 2 === 1, true)));
    if (!marc.length) L.push([{v: 'Sem golos marcados com detalhe (marcador / em campo).', s: S.nota}]);
    L.push([]);
    secao(L, U, n, `SOFRIDOS (${sof.length})`, S.secaoVerm);
    L.push(['Data', 'Adversário', 'Parte', 'Min.', 'GR', 'Quarteto em campo', '', ''].map((v, i) => ({v, s: [2, 3].includes(i) ? S.cab : S.cabEsq})));
    sof.forEach((x, i) => L.push(linha(x, i % 2 === 1, false)));
    if (!sof.length) L.push([{v: 'Sem golos sofridos com detalhe.', s: S.nota}]);
    L.push([]);
    L.push([{v: 'Só os jogos com golos detalhados (Ao vivo, Vídeo ou Estatística à mão). Quarteto pelo último nome; o nome todo quando há dois iguais.', s: S.nota}]);
    U.push(`A${L.length}:H${L.length}`);
    folhas.push({nome: 'Golos', linhas: L, unir: U, larguras: [10, 20, 8, 7, 22, 20, 14, 40], alturas: {0: 30, 1: 18}, fixar: {linhas: 2}, grelha: false});
  }

  // ================= 6. QUARTETOS
  {
    const agg = {};
    for (const [gi, g] of J.entries()) {
      if (!g.cat.golos) continue;
      for (const q of g.an.quartetos) {
        const nomes = q.nums.map(x => (atByNum[String(x)] ? curto(atByNum[String(x)]) : String(x)));
        const a = agg[q.k] ||= {nomes, seg: 0, gm: 0, gs: 0, jogos: new Set()};
        a.seg += q.seg; a.gm += q.gm; a.gs += q.gs; a.jogos.add(gi);
      }
    }
    const qs = Object.values(agg).sort((a, b) => (b.gm - b.gs) - (a.gm - a.gs) || b.seg - a.seg || b.gm - a.gm);
    const n = 7, L = [], U = [];
    banda(L, U, n, `QUARTETOS · ${titulo}`, gerado);
    L.push(['Quarteto (sem o GR)', 'Jogos', 'Minutos juntos', 'Golos marcados', 'Golos sofridos', 'Saldo', 'Saldo por 40 min'].map((v, i) => ({v, s: i ? S.cab : S.cabEsq})));
    qs.forEach((q, i) => { const z = i % 2 === 1, sd = q.gm - q.gs;
      L.push([txt(q.nomes.join(' · '), z, {b: true}), num(q.jogos.size, {zebra: z}), q.seg ? num(T(q.seg), {zebra: z, fmt: 'tempo'}) : txt('–', z, {cor: C.zero, alinhar: 'centro'}),
        num(q.gm, {tipo: 'bom', zebra: z}), num(q.gs, {tipo: 'mau', zebra: z}), num(sd, {tipo: 'sinal', zebra: z}),
        q.seg >= 60 ? num(Math.round(10 * sd * 2400 / q.seg) / 10, {tipo: 'sinal', zebra: z, fmt: '1dec'}) : txt('', z)]); });
    if (!qs.length) L.push([{v: 'Sem quartetos: precisa de golos com quem estava em campo.', s: S.nota}]);
    L.push([]);
    L.push([{v: 'Ordenados pelo saldo. "Minutos juntos" só existe quando as substituições foram marcadas (Ao vivo ou Vídeo); nos jogos à mão só há os golos.', s: S.nota}]);
    U.push(`A${L.length}:G${L.length}`);
    folhas.push({nome: 'Quartetos', linhas: L, unir: U, larguras: [44, 8, 12, 11, 11, 9, 12], alturas: {0: 30, 1: 18, 2: 30}, fixar: {linhas: 3}, grelha: false,
      filtro: qs.length ? `A3:G${3 + qs.length}` : undefined});
  }

  // ================= extra: Eventos e Ajustes (só se houver) e Dados (planos, para filtrar)
  const plano = buildEpoca({jogos, atletas, cfg, filtro});
  const simples = (nome, rows, cor) => {
    const [h, ...resto] = rows;
    const larg = h.map((_, c) => Math.min(Math.max(...rows.slice(0, 300).map((r, i) => String(r[c] ?? '').length * (i ? 1 : 0.8)), 6) + 2, 40));
    return {nome, cor, linhas: [h.map(v => ({v, s: S.cab})), ...resto.map((r, i) => r.map(v => ({v, s: i % 2 ? {fundo: C.zebra} : undefined})))], larguras: larg, alturas: {0: 30},
      fixar: {linhas: 1, colunas: nome === 'Dados' ? 4 : 0}, filtro: resto.length ? `A1:${colName(h.length - 1)}${rows.length}` : undefined};
  };
  if (plano['Eventos'].length > 1) folhas.push(simples('Eventos', plano['Eventos']));
  if (plano['Ajustes +-'].length > 1) folhas.push(simples('Ajustes', plano['Ajustes +-']));
  folhas.push(simples('Dados', plano['Por jogador e jogo'], '#9CA3AF'));
  return folhas;
}
