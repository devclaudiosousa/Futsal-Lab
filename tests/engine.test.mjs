import assert from 'node:assert/strict';
import * as L from '../js/live/engine.js';

const plantel = [['a','1','GR'],['b','3','Fixo'],['c','5','Ala'],['d','7','Ala'],['e','8','Pivô'],['f','9','Ala'],['g','12','GR']]
  .map(([id,num,pos]) => ({id, num, nome: 'J'+num, pos}));
let live = L.newLive({plantel});
assert.equal(live.court0.gr, 'a');
const T = s => 1_000_000 + s * 1000;
live = L.push(live, {type:'kickoff'}, T(0));
live = L.push(live, {type:'stop'}, T(60));       // paragem: 60 s úteis
live = L.push(live, {type:'stop'}, T(90));       // retoma: 30 s corridos sem tempo útil
live = L.push(live, {type:'sub', off:'c', on:'f'}, T(120));   // 90 s úteis
live = L.push(live, {type:'goal', team:'nos'}, T(150));
live = L.push(live, {type:'pause'}, T(200));
live = L.push(live, {type:'pause'}, T(260));     // pausa: nenhum relógio anda
let d = L.derive(live, T(300));
assert.equal(Math.round(d.run), 240);            // 300 - 60 de pausa
assert.equal(Math.round(d.eff), 210);            // - 30 de paragem
assert.equal(Math.round(d.byId.c.play[0]), 90);
assert.equal(Math.round(d.byId.f.play[0]), 120);
assert.equal(Math.round(d.byId.c.rest[0]), 120);
assert.equal(d.byId.f.slot, 'ala1');             // herda o lugar
assert.equal(d.byId.f.rot[0], 1);
assert.equal(d.score.nos, 1); assert.equal(d.shots.nos, 1);
assert.deepEqual(d.goals[0].on, ['a','b','f','d','e']);
// ecrã bloqueado: sem eventos durante 10 min continua certo
d = L.derive(live, T(900)); assert.equal(Math.round(d.eff), 810);
// desfazer substituição
let u = L.undoLineupChange(live); d = L.derive(u, T(300));
assert.equal(d.byId.c.active, true); assert.equal(Math.round(d.byId.c.play[0]), 210);
// presets + repor
live.presets = {'4x3': {fixo:'b', ala1:'f', ala2:'g', pivo:'e'}};
let r = L.runSituation(live, L.sitById('4x3'), T(310));
assert.ok(!r.error);
d = L.derive(r.live, T(320));
assert.equal(d.states.num, '4x3');
assert.deepEqual(['fixo','ala1','ala2','pivo'].map(s => d.court[s]), ['b','f','g','e']);
assert.equal(d.court.gr, 'a');
assert.equal(d.byId.d.active, false); assert.equal(d.byId.g.rot[0], 1);
let rp = L.repor(r.live, T(330)); d = L.derive(rp, T(340));
assert.equal(d.court.ala2, 'd'); assert.equal(d.snapshot, null);
// GR do preset em conflito
live.presets['3-1'] = {fixo:'a', ala1:'b', ala2:'d', pivo:'e'};
assert.ok(L.runSituation(live, L.sitById('3-1'), T(310)).error);
// fim de parte fecha estados, 2.ª parte
let b = L.push(r.live, {type:'break'}, T(400)); d = L.derive(b, T(500));
assert.equal(d.phase, 'break'); assert.equal(d.states.num, null); assert.equal(d.nextPeriod, '2H');
b = L.push(b, {type:'kickoff'}, T(600)); d = L.derive(b, T(660));
assert.equal(d.per, 1); assert.equal(Math.round(d.eff), 60);
assert.ok(L.toBancoEvents(b, T(660)).some(e => e.type === 'linha' && e.parte === 2));
console.log('engine ok');
{
  let f = L.newLive({plantel}); f = L.push(f,{type:'kickoff'},T(0));
  for (let i = 0; i < 5; i++) f = L.push(f,{type:'foul',team:'nos',by:'b',zona:i%2?'MO':'MD'},T(10+i));
  let d = L.derive(f, T(20)); assert.equal(d.foulsNow, 5); assert.equal(d.fouls.filter(x=>x.zona==='MD').length, 3);
  f = L.undoFoul(f); assert.equal(L.derive(f, T(20)).foulsNow, 4);
  f = L.push(f,{type:'break'},T(30)); f = L.push(f,{type:'kickoff'},T(40)); assert.equal(L.derive(f, T(50)).foulsNow, 0);  // nova parte começa a zero
  console.log('faltas ok');
}
