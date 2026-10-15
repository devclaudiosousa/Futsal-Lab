import assert from 'node:assert/strict';
import {livroEpoca} from '../js/epoca-livro.js';
import {livroFicheiros, livroBytes} from '../js/xlsx-livro.js';
const ats = ['12 Rui Pacheco GR', '4 Hugo Pires Fixo', '7 Hugo Sá Ala', '8 Marco Leal Ala', '9 Kiko Pivô', '10 Zezinho Ala', '11 Duarte Leal Ala']
  .map(s => { const t = s.split(' '); return {id: 'a' + t[0], num: t[0], nome: t.slice(1, -1).join(' '), posicao: t.at(-1), ativo: true}; });
ats[1].curto = 'Hugo';
const on = ['a12', 'a4', 'a7', 'a8', 'a9'];
const jogos = [
  {id: 'j1', data: '2026-10-10', adversario: 'Barbarense B', competicao: 'Taça', casa: true, convocados: ats.map(a => a.id), minutos: {a12: 2400, a4: 1200, a7: 1500, a8: 1300, a9: 900, a10: 0},
    minutosP: {a4: [600, 600, 0, 0]}, manual: {golos: [{id: 'g1', nos: true, parte: 1, min: 3, by: 'a8', ast: 'a4', on}, {id: 'g2', nos: false, parte: 2, min: 20, on}]}},
  {id: 'j2', data: '2026-10-17', adversario: 'Moitense', competicao: 'Taça de Portugal', casa: false, convocados: []},
];
const F = livroEpoca({jogos, atletas: ats, cfg: {clube: 'ADRC', epoca: '2026/27'}, agora: new Date('2026-10-15T19:00:00')});
assert.deepEqual(F.map(f => f.nome), ['Resumo', 'Jogadores', 'Jogo a jogo', 'Minutos', 'Golos', 'Quartetos', 'Dados']);
const v = c => (c && typeof c === 'object' ? c.v : c);
const R = F[0].linhas;
assert.deepEqual(R[4].map(v), [1, 0, 1, 0, 1, 1, 0]);                     // jogos, V, E, D, GM, GS, diferença
assert.ok(R.some(r => v(r[2]) === 'Moitense' && v(r[6]) === 'por jogar'));
const Jg = F[1].linhas, cab = Jg[3].map(v), leal = Jg.find(r => v(r[1]) === 'Marco Leal');
assert.equal(v(leal[cab.indexOf('Total')]), 1300 / 86400); assert.equal(v(leal[cab.indexOf('Saldo')]), 0); assert.equal(v(leal[cab.indexOf('Golos')]), 1);
assert.ok(!cab.includes('Passes certos') && !cab.includes('Amarelos'));     // só colunas com dados
assert.equal(v(Jg[4][1]), 'Rui Pacheco');                                   // GR primeiro
const Q = F[5].linhas; assert.equal(v(Q[3][0]), 'Hugo · Sá · Marco Leal · Kiko');   // nome curto da ficha; dois "Leal" → nome todo
const G = F[4].linhas; assert.ok(G.some(r => v(r[4]) === 'Marco Leal' && v(r[5]) === 'Hugo Pires'));
const JJ = F[2].linhas, sa = JJ.find(r => v(r[1]) === 'Hugo Sá');
assert.equal(v(sa[3]), ''); assert.equal(v(sa[6]), 1500 / 86400);            // sem partes: 1.ª/2.ª em branco
const fx = livroFicheiros(F);
assert.match(fx['xl/styles.xml'], /formatCode="\[m\]:ss"/); assert.match(fx['xl/worksheets/sheet1.xml'], /<mergeCell ref="A1:G1"\/>/);
assert.match(fx['xl/workbook.xml'], /_xlnm._FilterDatabase/);
const z = livroBytes(F); assert.equal(z[0], 0x50);
console.log('livro ok');
