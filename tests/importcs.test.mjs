import assert from 'node:assert/strict';
import fs from 'node:fs';
import {derive} from '../js/live/engine.js';
const {converterControlStats} = await import('../js/importar-cs.js');
const cs = JSON.parse(fs.readFileSync(new URL('./fixtures/control-stats-save.txt', import.meta.url)));
let n = 0;
const {jogo, novos} = converterControlStats(cs, [{id: 'x5', num: '5', nome: 'Marco Leal', posicao: 'Ala', ativo: true}], () => 'n' + (++n));
assert.equal(novos.length, 7);                       // 8 jogadores com nome, 1 já existia
assert.equal(jogo.data, '2026-09-27'); assert.equal(jogo.adversario, 'GD Angrense'); assert.equal(jogo.casa, true);
const d = derive(jogo.aovivo);
// tempos por jogador e parte: iguais aos do próprio Control-Stats
const nums = cs.team.players.map(p => String(p.pno));
for (const per of [0, 1]) for (const p of d.players) {
  const i = nums.indexOf(p.num);
  assert.equal(Math.round(p.play[per]), cs.tbl_period['Play Time'][per][i], `play ${p.num} parte ${per + 1}`);
  assert.equal(p.rot[per], cs.tbl_period.Rotations[per][i], `rotações ${p.num} parte ${per + 1}`);
}
assert.deepEqual(d.score, {nos: cs.match.score[0], adv: cs.match.score[1]});
assert.deepEqual(d.shots, {nos: cs.match.shots[0], adv: cs.match.shots[1]});
const marc = d.goals.find(g => g.team === 'nos');
assert.equal(jogo.aovivo.plantel.find(p => p.id === marc.on[0]).num, '1');        // GR em campo no golo
assert.equal(d.phase, 'break');
console.log('import control-stats ok');
process.exit(0);
