import assert from 'node:assert/strict';
import * as L from '../js/live/engine.js';
import {buildEpoca} from '../js/epoca-excel.js';
const atletas = [['a','1','GR','Tiago Melo'],['b','3','Fixo','Diogo Ávila'],['c','5','Ala','Marco Leal'],['d','7','Ala','Bruno Sá'],['e','8','Pivô','Hugo Pires'],['f','9','Ala','Luís Borges'],['g','12','GR','Rui Pacheco']].map(([id,num,posicao,nome])=>({id,num,posicao,nome,ativo:true}));
const T = s => 1e6 + s*1000;
// Jogo 1 (só banco): Leal marca com assistência de Sá aos 5'; Leal sai aos 10' para Borges; golo sofrido aos 15'
let live = L.newLive({plantel: atletas.map(a=>({id:a.id,num:a.num,nome:a.nome,pos:a.posicao}))});
live = L.push(live,{type:'kickoff'},T(0));
live = L.push(live,{type:'goal',team:'nos'},T(300)); live = L.setGoalAuthors(live, live.events.at(-1).id, {by:'c', ast:'d'});
live = L.push(live,{type:'sub',off:'c',on:'f'},T(600));
live = L.push(live,{type:'goal',team:'adv'},T(900)); live = L.push(live,{type:'break'},T(1200));
const j1 = {id:'j1', data:'2026-10-04', adversario:'Angrense', competicao:'Campeonato', casa:true, convocados:atletas.map(a=>a.id), notas:{c:7}, aovivo:live};
// Jogo 2 (só vídeo): golo de Leal (assist. Sá), 2 sofridos; faltas cometida (Ávila MO) e sofrida (Pires; adversário em MD → nosso MO)
const P = n => ({n, nome:''});
const ev = [{type:'golo',team:'A',jog:P('5'),assist:P('7'),parte:1,t:65,zona:'D10'},{type:'remate_fora',team:'A',jog:P('5'),parte:1,t:70},
  {type:'falta',team:'A',jog:P('3'),zona:'MO',parte:1,t:80},{type:'falta',team:'B',sofreu:P('8'),zona:'MD',parte:1,t:90},{type:'amarelo',team:'A',jog:P('3'),parte:1,t:95},
  {type:'perda',team:'A',jog:P('9'),parte:2,t:3725,zona:'MO'},{type:'golo',team:'B',parte:2,t:100},{type:'golo',team:'B',parte:2,t:200}];
const j2 = {id:'j2', data:'2026-10-11', adversario:'Lusitânia', competicao:'Taça', casa:false, convocados:['a','b','c','d','e'], notas:{}, marcador:{video:{events:ev}}};
const sh = buildEpoca({jogos:[j2,j1], atletas, cfg:{clube:'ADRC'}});
assert.deepEqual(Object.keys(sh), ['Jogos','Estatísticas por jogador','Por jogador e jogo','Golos','Quartetos','Minutos','Totais por jogo','Eventos','Ajustes +-','Notas']);
const st = sh['Estatísticas por jogador'], H = st[0], row = n => st.find(r => r[0]==n), c = (r, h) => r[H.indexOf(h)];
const leal = row('5');
assert.equal(c(leal,'Minutos'), 10); assert.equal(c(leal,'Golos'), 2); assert.equal(c(leal,'+'), 2); assert.equal(c(leal,'−'), 0);
assert.equal(c(row('7'),'Assistências'), 2); assert.equal(c(row('7'),'+'), 2); assert.equal(c(row('7'),'−'), 1);   // em campo no golo sofrido do jogo 1
assert.equal(c(row('9'),'−'), 1); assert.equal(c(row('9'),'+/−'), -1);
assert.equal(c(row('1'),'Em campo golo marcado'), 1); assert.equal(c(row('1'),'Em campo golo sofrido'), 1);
assert.equal(c(row('3'),'Faltas cometidas MO'), 1); assert.equal(c(row('3'),'Amarelos'), 1);
assert.equal(c(row('8'),'Faltas sofridas MD'), 1);   // como marcado, sem inversão
const pj = sh['Por jogador e jogo'], PH = pj[0];
const lealJ1 = pj.find(r => r[0]==='2026-10-04' && r[2]==='5'); assert.equal(lealJ1[PH.indexOf('+/−')], 1);
assert.equal(lealJ1[PH.indexOf('Nota')], 7);
const pachecoJ1 = pj.find(r => r[0]==='2026-10-04' && r[2]==='12'); assert.equal(pachecoJ1[PH.indexOf('Minutos')], 0);   // convocado sem jogar
const gol = sh['Golos']; const sofJ1 = gol.find(r => r[0]==='2026-10-04' && r[4]==='Sofrido');
assert.equal(sofJ1[8], 'Ávila · Sá · Pires · Borges'); assert.equal(sofJ1[7], '1 Tiago Melo');
const marcJ1 = gol.find(r => r[0]==='2026-10-04' && r[4]==='Marcado'); assert.equal(marcJ1[5], '5 Marco Leal'); assert.equal(marcJ1[6], '7 Bruno Sá');
const q = sh['Quartetos']; assert.ok(q.some(r => r[0]==='Ávila · Leal · Sá · Pires' && r[3]===1 && r[4]===0)); assert.ok(q.some(r => r[0]==='Ávila · Sá · Pires · Borges' && r[4]===1));
assert.equal(sh['Eventos'].find(r => r[5]==='Perda de bola')[4], '62,05');
console.log('epoca ok');
// remates com autor no banco, faltas sem inversão
{
  let lv = L.newLive({plantel: atletas.map(a=>({id:a.id,num:a.num,nome:a.nome,pos:a.posicao}))});
  lv = L.push(lv,{type:'kickoff'},T(0)); lv = L.push(lv,{type:'shot',team:'nos'},T(60)); lv = L.setGoalAuthors(lv, lv.events.at(-1).id, {by:'e'});
  lv = L.push(lv,{type:'goal',team:'nos'},T(90)); lv = L.setGoalAuthors(lv, lv.events.at(-1).id, {by:'e'}); lv = L.push(lv,{type:'break'},T(1200));
  const s2 = buildEpoca({jogos:[{id:'j3', data:'2026-10-20', adversario:'X', convocados:[], aovivo:lv}], atletas, cfg:{}});
  const H2 = s2['Estatísticas por jogador'][0], pires = s2['Estatísticas por jogador'].find(r => r[0]==='8');
  assert.equal(pires[H2.indexOf('Remates')], 2); assert.equal(pires[H2.indexOf('Golos')], 1);
  const s3 = buildEpoca({jogos:[j2], atletas, cfg:{}}); const H3 = s3['Estatísticas por jogador'][0];
  assert.equal(s3['Estatísticas por jogador'].find(r => r[0]==='8')[H3.indexOf('Faltas sofridas MD')], 1);
  console.log('epoca 2 ok');
}
{
  let lv = L.newLive({plantel: atletas.map(a=>({id:a.id,num:a.num,nome:a.nome,pos:a.posicao}))});
  lv = L.push(lv,{type:'kickoff'},T(0)); lv = L.push(lv,{type:'foul',team:'nos',by:'b',zona:'MO'},T(60)); lv = L.push(lv,{type:'foul',team:'nos',by:'b',zona:'MD'},T(70)); lv = L.push(lv,{type:'break'},T(1200));
  const s = buildEpoca({jogos:[{id:'j4', data:'2026-10-21', adversario:'Y', convocados:[], aovivo:lv}], atletas, cfg:{}});
  const H = s['Estatísticas por jogador'][0], avila = s['Estatísticas por jogador'].find(r => r[0]==='3');
  assert.equal(avila[H.indexOf('Faltas cometidas MO')], 1); assert.equal(avila[H.indexOf('Faltas cometidas MD')], 1);
  assert.equal(s['Totais por jogo'][1][9], 2);
  console.log('epoca faltas banco ok');
}
