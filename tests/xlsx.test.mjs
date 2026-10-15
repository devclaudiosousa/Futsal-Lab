import assert from 'node:assert/strict';
import {xlsxFicheiros, xlsxBytes, colName} from '../js/xlsx-lite.js';
import {folhasEpoca} from '../js/epoca-excel.js';
assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(701), 'ZZ');
const sheets = {'Golos': [['Data', 'Golo', 'Assistência'], ['2026-10-10', 'Marcado', ''], ['2026-10-11', 'Sofrido', 'x']],
  'Estatísticas por jogador': [['Nº', 'Jogador', 'Golos', '−', '+/−'], ['4', 'A & B <c>', 2, 1, -1], ['7', 'C', 0, 0, 0]]};
const f = xlsxFicheiros(folhasEpoca(sheets, 'Nós'));
const g = f['xl/worksheets/sheet1.xml'], e = f['xl/worksheets/sheet2.xml'];
assert.match(g, /<c r="C2" s="2"\/>/);                 // célula vazia pintada na linha do golo marcado
assert.match(g, /<c r="A3" s="3" t="inlineStr">/);       // golo sofrido a vermelho
assert.match(e, /<c r="C2" s="2"><v>2<\/v><\/c>/); assert.match(e, /<c r="D2" s="3"><v>1<\/v><\/c>/); assert.match(e, /<c r="E2" s="3"><v>-1<\/v><\/c>/);
assert.match(e, /<c r="C3"><v>0<\/v><\/c>/);              // zeros sem cor
assert.match(e, /A &amp; B &lt;c&gt;/); assert.match(e, /xSplit="2" ySplit="1"/);
const z = xlsxBytes(folhasEpoca(sheets, 'Nós'));
assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b);
const dv = new DataView(z.buffer), end = z.length - 22;
assert.equal(dv.getUint32(end, true), 0x06054b50); assert.equal(dv.getUint16(end + 10, true), Object.keys(f).length);
console.log('xlsx ok');
