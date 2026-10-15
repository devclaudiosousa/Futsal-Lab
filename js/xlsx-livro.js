// Livro .xlsx com formatação completa (estilos por célula, células unidas, tempos mm:ss, impressão A4 deitada).
// Sem bibliotecas: gera o XML e junta tudo num zip (zipStore de xlsx-lite.js).
//
// folha = {nome, linhas: [[célula…]…], larguras: [n…], unir: ['A1:F1'…], alturas: {linha(0-based): pontos},
//          fixar: {linhas, colunas}, filtro: 'A3:K20', escondida, grelha: false}
// célula = valor | {v, s: estilo}; estilo = {b, i, sz, cor, fundo, borda: 'baixo'|'cima'|'caixa', fmt: 'tempo'|'pct'|'1dec',
//          alinhar: 'centro'|'dir'|'esq', quebra}
// Tempos: passar segundos em {v: s / 86400, s: {fmt: 'tempo'}} (formato [m]:ss, soma e médias funcionam no Excel).
import {zipStore, colName} from './xlsx-lite.js';

const FMT = {tempo: [164, '[m]:ss'], pct: [9, null], '1dec': [165, '0.0']};
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const rgb = c => 'FF' + String(c).replace('#', '').toUpperCase();

function registo() {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
  const cache = new Map();
  const id = s => {
    if (!s) return 0;
    const k = JSON.stringify(s);
    if (cache.has(k)) return cache.get(k);
    const f = idx(fonts, `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}<sz val="${s.sz || 11}"/>${s.cor ? `<color rgb="${rgb(s.cor)}"/>` : ''}<name val="Calibri"/></font>`);
    const fi = s.fundo ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(s.fundo)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const ln = c => `<color rgb="${rgb(c || '#9CA3AF')}"/>`;
    const bo = s.borda === 'baixo' ? idx(borders, `<border><left/><right/><top/><bottom style="thin">${ln(s.corBorda)}</bottom><diagonal/></border>`)
      : s.borda === 'cima' ? idx(borders, `<border><left/><right/><top style="thin">${ln(s.corBorda)}</top><bottom/><diagonal/></border>`)
      : s.borda === 'caixa' ? idx(borders, `<border><left style="thin">${ln(s.corBorda)}</left><right style="thin">${ln(s.corBorda)}</right><top style="thin">${ln(s.corBorda)}</top><bottom style="thin">${ln(s.corBorda)}</bottom><diagonal/></border>`) : 0;
    const nf = s.fmt ? FMT[s.fmt][0] : 0;
    const al = s.alinhar || s.quebra || s.vcentro !== false ? `<alignment${s.alinhar ? ` horizontal="${{centro: 'center', dir: 'right', esq: 'left'}[s.alinhar]}"` : ''} vertical="center"${s.quebra ? ' wrapText="1"' : ''}/>` : '';
    xfs.push(`<xf numFmtId="${nf}" fontId="${f}" fillId="${fi}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''} applyFont="1"${fi ? ' applyFill="1"' : ''}${bo ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1"' : ''}>${al}</xf>`);
    cache.set(k, xfs.length - 1);
    return xfs.length - 1;
  };
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="[m]:ss"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return {id, xml};
}

function folhaXml(f, reg) {
  const rows = f.linhas || [];
  const ncol = Math.max(1, rows.reduce((m, r) => Math.max(m, r.length), 0), (f.larguras || []).length);
  const fx = f.fixar || {};
  let pane = '';
  if (fx.linhas || fx.colunas) {
    const p = fx.linhas && fx.colunas ? 'bottomRight' : fx.linhas ? 'bottomLeft' : 'topRight';
    pane = `<pane ${fx.colunas ? `xSplit="${fx.colunas}" ` : ''}${fx.linhas ? `ySplit="${fx.linhas}" ` : ''}topLeftCell="${colName(fx.colunas || 0)}${(fx.linhas || 0) + 1}" activePane="${p}" state="frozen"/><selection pane="${p}"/>`;
  }
  const o = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr>${f.cor ? `<tabColor rgb="${rgb(f.cor)}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"${f.grelha === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/>`];
  if (f.larguras?.length) o.push(`<cols>${f.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  o.push('<sheetData>');
  rows.forEach((r, ri) => {
    const cells = [];
    r.forEach((c, ci) => {
      const cel = c && typeof c === 'object' && !Array.isArray(c) ? c : {v: c};
      const s = reg.id(cel.s), ref = colName(ci) + (ri + 1), sa = s ? ` s="${s}"` : '';
      const v = cel.v;
      if (v == null || v === '') { if (s) cells.push(`<c r="${ref}"${sa}/>`); return; }
      if (typeof v === 'number' && isFinite(v)) cells.push(`<c r="${ref}"${sa}><v>${v}</v></c>`);
      else cells.push(`<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
    });
    const h = f.alturas?.[ri];
    o.push(`<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  });
  o.push('</sheetData>');
  if (f.filtro) o.push(`<autoFilter ref="${f.filtro}"/>`);
  if (f.unir?.length) o.push(`<mergeCells count="${f.unir.length}">${f.unir.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
  o.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  o.push('</worksheet>');
  void ncol;
  return o.join('');
}

export function livroFicheiros(folhas) {
  const reg = registo();
  const nomes = [];
  for (const f of folhas) { let n = String(f.nome).replace(/[\\/?*[\]:]/g, '-').slice(0, 31), k = 2; while (nomes.includes(n)) n = n.slice(0, 28) + ' ' + k++; nomes.push(n); }
  const sheets = folhas.map(f => folhaXml(f, reg));
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}"${folhas[i].escondida ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>${
      folhas.some(f => f.filtro) ? `<definedNames>${folhas.map((f, i) => f.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nomes[i]).replace(/'/g, "''")}'!${f.filtro.split(':').map(x => x.replace(/([A-Z]+)(\d+)/, '$$$1$$$2')).join(':')}</definedName>` : '').join('')}</definedNames>` : ''}</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': reg.xml(),
  };
  sheets.forEach((x, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = x; });
  return files;
}
export const livroBytes = folhas => zipStore(livroFicheiros(folhas));
