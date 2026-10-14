import assert from 'node:assert/strict';
import * as L from '../js/live/engine.js';
import {eventosNoVideo, paraVideo} from '../js/marcador/acerto.js';
const plantel = [['a','1','GR'],['b','3','Fixo'],['c','5','Ala'],['d','7','Ala'],['e','8','Pivô'],['f','9','Ala']].map(([id,num,pos]) => ({id, num, nome: 'J'+num, pos}));
const T = s => 1_700_000_000_000 + s * 1000;
let live = L.newLive({plantel});
live = L.push(live, {type:'kickoff'}, T(0));
live = L.push(live, {type:'pause'}, T(100)); live = L.push(live, {type:'pause'}, T(160));   // pausa de 60 s: o vídeo continua a gravar
live = L.push(live, {type:'sub', off:'c', on:'f'}, T(200));
live = L.push(live, {type:'goal', team:'nos'}, T(260)); live = L.setGoalAuthors(live, live.events.at(-1).id, {by:'f', ast:'d'});
live = L.push(live, {type:'foul', team:'nos', by:'b', zona:'MO'}, T(300));
live = L.push(live, {type:'break'}, T(1500));
live = L.push(live, {type:'kickoff'}, T(2400)); live = L.push(live, {type:'goal', team:'adv'}, T(2430));
// sem o início da parte no vídeo, não há tempos
let r = eventosNoVideo(live, {});
assert.ok(r.itens.every(i => i.vt == null)); assert.deepEqual(r.partes, [1, 2]);
// 1.ª parte começa aos 95 s do vídeo; 2.ª aos 1520 s, com ajuste de −3 s
r = eventosNoVideo(live, {1: 95, 2: 1520}, {2: -3});
const g = r.itens.find(i => i.tipo === 'golo' && i.team === 'A');
assert.equal(g.vt, 95 + 260); assert.equal(g.jog.n, '9'); assert.equal(g.assist.n, '7');
assert.deepEqual(g.on.map(x => x.n), ['1', '3', '9', '7', '8']);
assert.equal(r.itens.find(i => i.tipo === 'falta').vt, 395);
assert.equal(r.itens.find(i => i.tipo === 'golo' && i.team === 'B').vt, 1520 + 30 - 3);
const lin = r.itens.find(i => i.tipo === 'linha'); assert.equal(lin.vt, 295); assert.equal(lin.sub.entra.n, '9');
// para o Vídeo: sem duplicar o golo já marcado a 8 s de distância
const existentes = [{type:'golo', team:'A', parte:1, t:350}];
const novos = paraVideo(r.itens, existentes);
assert.ok(!novos.some(e => e.type === 'golo' && e.team === 'A'));
assert.ok(novos.some(e => e.type === 'golo' && e.team === 'B' && e.parte === 2));
assert.ok(novos.some(e => e.type === 'falta' && e.zona === 'MO' && e.jog.n === '3'));
assert.equal(novos.filter(e => e.type === 'ini_parte').length, 2);
assert.equal(novos.filter(e => e.type === 'linha').length, 3);       // início 1H, substituição, início 2H
assert.ok(novos.some(e => e.type === 'fim_parte' && e.parte === 1 && e.t === 95 + 1500));
// repetir não duplica
assert.equal(paraVideo(r.itens, [...existentes, ...novos]).length, 0);
console.log('acerto ok');
