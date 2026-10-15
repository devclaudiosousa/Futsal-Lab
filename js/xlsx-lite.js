// Escritor de .xlsx mínimo, com estilos (cores, negrito, larguras, cabeçalho fixo, filtros), sem bibliotecas:
// um .xlsx é um zip de ficheiros XML. Funciona sem rede.
//
// folhas: [{nome, linhas: [[valor…]…], estilo?: (linha, coluna, valor, cabeçalho[], linha[]) => 'chave' | undefined,
//           larguras?: [n…], fixar?: {linhas: 1, colunas: 2}, filtro?: true}]
// Chaves de estilo: 'cab' (cabeçalho), 'bom' (verde suave), 'mau' (vermelho suave), 'neutro' (amarelo suave),
// 'bomF' / 'mauF' (só o texto a verde/vermelho), 'nota' (itálico cinzento), 'titulo' (negrito).
const ESTILOS = ['', 'cab', 'bom', 'mau', 'neutro', 'bomF', 'mauF', 'nota', 'titulo'];

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF1E6B3A"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF9B2C2C"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF7A5B00"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><name val="Calibri"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCF2E3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBE1E1"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3D0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const nomeFolha = n => String(n).replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Folha';

function sheetXml(f) {
  const rows = f.linhas || [], head = rows[0] || [];
  const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const larg = f.larguras || Array.from({length: ncol}, (_, c) => {
    const len = Math.max(...rows.slice(0, 400).map((r, i) => { const v = r[c]; const s = v == null ? '' : String(v); return i === 0 ? Math.min(s.length, 18) : s.length; }), 4);
    return Math.min(Math.max(len + 2, 6), 48);
  });
  const fx = f.fixar || {linhas: 1, colunas: 0};
  let pane = '';
  if (fx.linhas || fx.colunas) {
    const tl = colName(fx.colunas || 0) + ((fx.linhas || 0) + 1);
    const p = fx.linhas && fx.colunas ? 'bottomRight' : fx.linhas ? 'bottomLeft' : 'topRight';
    pane = `<pane ${fx.colunas ? `xSplit="${fx.colunas}" ` : ''}${fx.linhas ? `ySplit="${fx.linhas}" ` : ''}topLeftCell="${tl}" activePane="${p}" state="frozen"/><selection pane="${p}"/>`;
  }
  const out = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${f.semGrelha ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`];
  if (larg.length) out.push(`<cols>${larg.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  rows.forEach((r, ri) => {
    const cells = [];
    Array.from({length: Math.max(r.length, ri ? head.length : 0)}, (_, i) => r[i]).forEach((v, ci) => {
      if (v == null || v === '') {   // vazia: só leva estilo se a linha for pintada (ex.: golo marcado/sofrido)
        const key = ri === 0 && !f.semCabecalho ? 'cab' : f.estilo?.(ri, ci, '', head, r);
        const st = Math.max(0, ESTILOS.indexOf(key || ''));
        if (st) cells.push(`<c r="${colName(ci)}${ri + 1}" s="${st}"/>`);
        return;
      }
      const key = ri === 0 && !f.semCabecalho ? 'cab' : f.estilo?.(ri, ci, v, head, r);
      const s = Math.max(0, ESTILOS.indexOf(key || ''));
      const ref = colName(ci) + (ri + 1), sa = s ? ` s="${s}"` : '';
      if (typeof v === 'number' && isFinite(v)) cells.push(`<c r="${ref}"${sa}><v>${v}</v></c>`);
      else cells.push(`<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
    });
    out.push(`<row r="${ri + 1}"${ri === 0 && !f.semCabecalho ? ' ht="32" customHeight="1"' : ''}>${cells.join('')}</row>`);
  });
  out.push('</sheetData>');
  if (f.filtro !== false && !f.semCabecalho && rows.length > 1 && ncol) out.push(`<autoFilter ref="A1:${colName(ncol - 1)}${rows.length}"/>`);
  out.push('</worksheet>');
  return out.join('');
}

export function xlsxFicheiros(folhas) {
  const nomes = [];
  for (const f of folhas) { let n = nomeFolha(f.nome), k = 2; while (nomes.includes(n)) n = nomeFolha(f.nome).slice(0, 28) + ' ' + k++; nomes.push(n); }
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${
      folhas.some(f => f.filtro !== false && !f.semCabecalho && (f.linhas || []).length > 1) ? `<definedNames>${folhas.map((f, i) => {
        const nc = (f.linhas || []).reduce((m, r) => Math.max(m, r.length), 0);
        return f.filtro !== false && !f.semCabecalho && f.linhas.length > 1 && nc ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nomes[i]).replace(/'/g, "''")}'!$A$1:$${colName(nc - 1)}$${f.linhas.length}</definedName>` : '';
      }).join('')}</definedNames>` : ''}</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${folhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES_XML,
  };
  folhas.forEach((f, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(f); });
  return files;
}

// zip sem compressão (STORE): simples e aceite pelo Excel, LibreOffice, Numbers e Google Sheets
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, txt] of Object.entries(files)) {
    const nm = enc.encode(name), data = typeof txt === 'string' ? enc.encode(txt) : txt, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

export const xlsxBytes = folhas => zipStore(xlsxFicheiros(folhas));
