import assert from 'node:assert/strict';
import {lerTabela, casar, lerTempo} from '../js/importar-tempos.js';
import {buildEpoca} from '../js/epoca-excel.js';
const TXT = `Rui Pacheco	Redes	28	10
Tomás Leite	Redes	12	15
Nuno Frade	Redes	0	15
Ivo Lemos	Fixo	0	0
Hugo Pires	FIxo	15:38	15:34
Hugo Sá	Fixo	26:19	19:36
José Antão	Ala	0	0
Luís Mota	Ala	13:57	0
Gil Câmara	Ala	11:27	17:36
Marco Leal	Ala	9:44	29:23
Filipe Rosa	Ala	8:40	0
Zezinho	Ala	21:08	19:09
Pipoca	Ala	15:35	24:23
Duarte Brum	Ala	11:13	0
Luís Faria	Ala	0	0
Tomás Vaz	Pivot	10:02	20:12
Toninho	Pivot	0	0
Kiko	Pivot	14:07	14:07
Paulo Medeiros	Ala	0	0`;
const {linhas, colunas} = lerTabela(TXT);
assert.equal(linhas.length, 19); assert.equal(colunas, 2);
assert.deepEqual(linhas[0], {nome: 'Rui Pacheco', pos: 'GR', tempos: [1680, 600]});
assert.equal(linhas[4].pos, 'Fixo'); assert.equal(linhas[15].pos, 'Pivô');
assert.equal(lerTempo('15:38'), 938); assert.equal(lerTempo('0'), 0); assert.equal(lerTempo('x'), null);
const tot = c => linhas.reduce((s, l) => s + l.tempos[c], 0);
assert.equal(tot(1), 200 * 60);
// plantel como está na app (nomes do Control-Stats)
const ats = ['4 Hugo Pires', '7 Hugo Sá', '8 Marco Leal', '9 Kiko', '10 Zezinho', '11 Duarte', '12 Rui Pacheco', '15 Nuno Frade', '20 Toninho', '27 Jose Antao', '29 Filipe Rosa', '77 Tomás Vaz', '87 Pipoca']
  .map(s => { const [num, ...n] = s.split(' '); return {id: 'a' + num, num, nome: n.join(' ')}; });
const m = Object.fromEntries(linhas.map(l => [l.nome, casar(l.nome, ats)]));
assert.equal(m['Duarte Brum'], 'a11'); assert.equal(m['José Antão'], 'a27'); assert.equal(m['Tomás Vaz'], 'a77'); assert.equal(m['Nuno Frade'], 'a15');
for (const n of ['Tomás Leite', 'Ivo Lemos', 'Luís Mota', 'Gil Câmara', 'Luís Faria', 'Paulo Medeiros']) assert.equal(m[n], null, n);
// Excel da época com tempos à mão
const minutos = {}; linhas.forEach(l => { if (m[l.nome] && l.tempos[0]) minutos[m[l.nome]] = l.tempos[0]; });
const sh = buildEpoca({jogos: [{id: 'j1', data: '2026-09-20', adversario: 'Posto Santo', competicao: 'Supertaça', minutos, convocados: Object.keys(minutos)}], atletas: ats});
const est = sh['Estatísticas por jogador'], h = est[0];
const nunes = est.find(r => r[1] === 'Hugo Pires');
assert.equal(nunes[h.indexOf('Minutos')], 15.6); assert.equal(nunes[h.indexOf('Jogos com minutos')], 1);
assert.equal(sh['Jogos'][1][7], 'Tempos à mão');
console.log('tempos ok');
// jogo antigo à mão: golos com os 5 em campo, cartões, faltas e ajustes do treinador
{
  const A = ['a12', 'a4', 'a7', 'a8', 'a9'];   // GR Pacheco + Pires, Sá, Leal, Kiko
  const j = {id: 'j2', data: '2026-10-11', adversario: 'Fonte Bastardo', convocados: ats.map(a => a.id), minutos: {a4: 900},
    manual: {golos: [{id: 'g1', nos: true, parte: 1, min: 5, by: 'a8', ast: 'a4', on: A}, {id: 'g2', nos: false, parte: 2, on: A}, {id: 'g3', nos: true, parte: 2, by: 'a10', on: ['a12', 'a4', 'a7', 'a10', 'a11']}],
      atletas: {a4: {am: 1, fcMO: 2}, a9: {verm: 1, fcMD: 1}}},
    ajustes: [{atleta: 'a9', v: 1, desc: 'boa transição defensiva'}, {atleta: 'a7', v: -1, desc: 'podia ter passado e não passou'}]};
  const sh = buildEpoca({jogos: [j], atletas: ats});
  const st = sh['Estatísticas por jogador'], H = st[0], r = n => st.find(x => x[0] == n), c = (x, h) => x[H.indexOf(h)];
  assert.equal(c(r('4'), '+'), 1); assert.equal(c(r('4'), '−'), 1); assert.equal(c(r('4'), 'Amarelos'), 1); assert.equal(c(r('4'), 'Faltas cometidas MO'), 2);
  assert.equal(c(r('8'), '+/−'), 0);                               // marcou (+1), em campo no sofrido (−1)
  assert.equal(c(r('9'), '+/−'), 0); assert.equal(c(r('9'), '+ ajuste'), 1); assert.equal(c(r('9'), 'Vermelhos'), 1);
  assert.equal(c(r('7'), '+/−'), -2); assert.equal(c(r('7'), '− ajuste'), 1);
  assert.equal(c(r('12'), 'Em campo golo sofrido'), 1); assert.equal(c(r('12'), 'Em campo golo marcado'), 2);
  assert.deepEqual(sh['Jogos'][1].slice(4, 7), [2, 1, 'V']);
  assert.ok(sh['Quartetos'].some(q => q[0] === 'Pires · Sá · Leal · Kiko' && q[3] === 1 && q[4] === 1));
  assert.equal(sh['Ajustes +-'][1][5], 'boa transição defensiva');
  assert.equal(sh['Totais por jogo'][1][9], 3);
}
console.log('estatística à mão ok');
// contar por jogo: sem passes no jogo → célula vazia e fora do /40; desligar à mão
{
  const P = n => ({n, nome: ''});
  const ev = [{type: 'linha', parte: 1, t: 0, court: [P('12'), P('4'), P('7'), P('8'), P('9')]}, {type: 'golo', team: 'A', jog: P('8'), parte: 1, t: 600}, {type: 'recuperacao', team: 'A', jog: P('8'), parte: 1, t: 700},
    {type: 'fim_parte', parte: 1, t: 1200}];
  const jv = {id: 'v', data: '2026-10-01', adversario: 'Vídeo FC', convocados: ['a8'], marcador: {video: {events: ev}}};
  const jm = {id: 'm', data: '2026-10-02', adversario: 'À mão FC', convocados: ['a8'], minutos: {a8: 1200}, manual: {golos: [{id: 'x', nos: true, parte: 1, by: 'a8', on: ['a12', 'a4', 'a7', 'a8', 'a9']}]}};
  let sh = buildEpoca({jogos: [jv, jm], atletas: ats});
  let st = sh['Estatísticas por jogador'], H = st[0], r = st.find(x => x[0] == '8'), c = h => r[H.indexOf(h)];
  assert.equal(c('Minutos'), 40); assert.equal(c('Golos'), 2); assert.equal(c('Golos /40'), 2);
  assert.equal(c('Recuperações'), 1); assert.equal(c('Recuperações /40'), 2);   // só os 20' do jogo com vídeo
  assert.match(sh['Jogos'][2][9], /Passes/); assert.match(sh['Jogos'][2][9], /Perdas/);
  const pj = sh['Por jogador e jogo'], PH = pj[0];
  assert.equal(pj.find(x => x[1] === 'À mão FC' && x[2] === '8')[PH.indexOf('Faltas cometidas MD')], '');
  sh = buildEpoca({jogos: [jv, {...jm, contar: {golos: false}}], atletas: ats});
  st = sh['Estatísticas por jogador']; r = st.find(x => x[0] == '8');
  assert.equal(c('Golos'), 1); assert.equal(c('Minutos'), 40); assert.equal(c('Golos /40'), 2);
}
console.log('contar por jogo ok');
// minutos por parte: à mão (com prolongamento) e do Ao vivo
{
  const jm = {id: 'm', data: '2026-10-02', adversario: 'Partes FC', convocados: ['a8', 'a4'], minutos: {a8: 1500, a4: 600}, minutosP: {a8: [600, 600, 180, 120]}};
  const sh = buildEpoca({jogos: [jm], atletas: ats});
  const pj = sh['Por jogador e jogo'], H = pj[0], r = n => pj.find(x => x[2] === n), c = (x, h) => x[H.indexOf(h)];
  assert.deepEqual(['Minutos 1.ª parte', 'Minutos 2.ª parte', 'Minutos prolongamento 1', 'Minutos prolongamento 2', 'Minutos'].map(h => c(r('8'), h)), [10, 10, 3, 2, 25]);
  assert.deepEqual(['Minutos 1.ª parte', 'Minutos prolongamento 1', 'Minutos'].map(h => c(r('4'), h)), ['', '', 10]);   // só o total
}
{
  const L = await import('../js/live/engine.js');
  const T = s => 1e6 + s * 1000;
  const pl = ats.slice(0, 7).map(a => ({id: a.id, num: a.num, nome: a.nome, pos: ''}));
  let live = L.newLive({plantel: pl});
  live = L.push(live, {type: 'kickoff'}, T(0)); live = L.push(live, {type: 'break'}, T(600));
  live = L.push(live, {type: 'kickoff'}, T(700)); live = L.push(live, {type: 'sub', off: live.court0.pivo, on: pl[5].id}, T(1000)); live = L.push(live, {type: 'break'}, T(1300));
  const sh = buildEpoca({jogos: [{id: 'l', data: '2026-10-03', adversario: 'Vivo', convocados: pl.map(p => p.id), aovivo: live}], atletas: ats});
  const st = sh['Estatísticas por jogador'], H = st[0], piv = st.find(x => x[0] == pl[4].num), ent = st.find(x => x[0] == pl[5].num);
  assert.deepEqual([piv[H.indexOf('Minutos 1.ª parte')], piv[H.indexOf('Minutos 2.ª parte')], piv[H.indexOf('Minutos')]], [10, 5, 15]);
  assert.deepEqual([ent[H.indexOf('Minutos 1.ª parte')], ent[H.indexOf('Minutos 2.ª parte')]], [0, 5]);
}
console.log('minutos por parte ok');
