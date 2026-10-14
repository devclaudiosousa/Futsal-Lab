import assert from 'node:assert/strict';
import {lerTabela, casar, lerTempo} from '../js/importar-tempos.js';
import {buildEpoca} from '../js/epoca-excel.js';
const TXT = `Jorge Borges	Redes	28	10
Simão Terra	Redes	12	15
Miguel Brasil	Redes	0	15
Joel Bento	Fixo	0	0
Pedro Nunes	FIxo	15:38	15:34
Pedro Sales	Fixo	26:19	19:36
João Marques	Ala	0	0
Diogo Dias	Ala	13:57	0
Tiago Lourenço	Ala	11:27	17:36
Miguel Rocha	Ala	9:44	29:23
Darcio Sousa	Ala	8:40	0
Carlinhos	Ala	21:08	19:09
Batata	Ala	15:35	24:23
Bernardo Brasil	Ala	11:13	0
Diogo Martins	Ala	0	0
Simão Carina	Pivot	10:02	20:12
Jorginho	Pivot	0	0
Pintex	Pivot	14:07	14:07
Rafael Emilio	Ala	0	0`;
const {linhas, colunas} = lerTabela(TXT);
assert.equal(linhas.length, 19); assert.equal(colunas, 2);
assert.deepEqual(linhas[0], {nome: 'Jorge Borges', pos: 'GR', tempos: [1680, 600]});
assert.equal(linhas[4].pos, 'Fixo'); assert.equal(linhas[15].pos, 'Pivô');
assert.equal(lerTempo('15:38'), 938); assert.equal(lerTempo('0'), 0); assert.equal(lerTempo('x'), null);
const tot = c => linhas.reduce((s, l) => s + l.tempos[c], 0);
assert.equal(tot(1), 200 * 60);
// plantel como está na app (nomes do Control-Stats)
const ats = ['4 Pedro Nunes', '7 Pedro Sales', '8 Miguel Rocha', '9 Pintex', '10 Carlinhos', '11 Bernardo', '12 Jorge Borges', '15 Miguel Brasil', '20 Jorginho', '27 Joao Marques', '29 Darcio Sousa', '77 Simão Carina', '87 Batata']
  .map(s => { const [num, ...n] = s.split(' '); return {id: 'a' + num, num, nome: n.join(' ')}; });
const m = Object.fromEntries(linhas.map(l => [l.nome, casar(l.nome, ats)]));
assert.equal(m['Bernardo Brasil'], 'a11'); assert.equal(m['João Marques'], 'a27'); assert.equal(m['Simão Carina'], 'a77'); assert.equal(m['Miguel Brasil'], 'a15');
for (const n of ['Simão Terra', 'Joel Bento', 'Diogo Dias', 'Tiago Lourenço', 'Diogo Martins', 'Rafael Emilio']) assert.equal(m[n], null, n);
// Excel da época com tempos à mão
const minutos = {}; linhas.forEach(l => { if (m[l.nome] && l.tempos[0]) minutos[m[l.nome]] = l.tempos[0]; });
const sh = buildEpoca({jogos: [{id: 'j1', data: '2026-09-20', adversario: 'Posto Santo', competicao: 'Supertaça', minutos, convocados: Object.keys(minutos)}], atletas: ats});
const est = sh['Estatísticas por jogador'], h = est[0];
const nunes = est.find(r => r[1] === 'Pedro Nunes');
assert.equal(nunes[h.indexOf('Minutos')], 15.6); assert.equal(nunes[h.indexOf('Jogos com minutos')], 1);
assert.equal(sh['Jogos'][1][7], 'Tempos à mão');
console.log('tempos ok');
