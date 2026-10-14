import assert from 'node:assert/strict';
import {makeDrive, exchange} from '../js/sync/onedrive.js';

// Graph falso: approot com ficheiros {path: {body, eTag}}
const files = new Map(); let n = 0; let calls = [];
const json = (o, status = 200) => ({ok: status < 300, status, headers: {get: () => null}, json: async () => o});
async function fakeFetch(url, opt = {}) {
  calls.push((opt.method || 'GET') + ' ' + url);
  const u = new URL(url);
  if (u.host === 'dl') { const f = files.get(u.pathname.slice(1)); return json(JSON.parse(f.body)); }
  assert.equal(opt.headers.Authorization, 'Bearer T');
  let m = u.pathname.match(/approot:\/data\/(\w+):\/children$/);
  if (m) {
    const items = [...files].filter(([k]) => k.startsWith(`data/${m[1]}/`));
    if (!items.length) return json({error: 'nf'}, 404);
    return json({value: items.map(([k, f]) => ({name: k.split('/').pop(), eTag: f.eTag, file: {}, '@microsoft.graph.downloadUrl': 'https://dl/' + k}))});
  }
  m = u.pathname.match(/approot:\/(data\/\w+\/[^:]+):\/content$/);
  if (m && opt.method === 'PUT') { const k = decodeURIComponent(m[1]); const f = {body: opt.body, eTag: 'e' + (++n)}; files.set(k, f); return json({eTag: f.eTag}); }
  throw new Error('rota inesperada ' + url);
}
const drive = makeDrive({getToken: async () => 'T', fetchFn: fakeFetch, base: 'https://g/v1.0'});
const S = ['atletas', 'jogos'];

// Aparelho A envia 2 registos para um OneDrive vazio
let A = await exchange(drive, {stores: S, changes: [{store: 'atletas', rec: {id: 'a1', nome: 'Melo', updatedAt: 10}}, {store: 'jogos', rec: {id: 'j1', adversario: 'X', updatedAt: 10}}]});
assert.equal(A.sent.length, 2); assert.equal(A.incoming.length, 0); assert.equal(files.size, 2);
// Aparelho B (vazio) recebe os 2
let B = await exchange(drive, {stores: S, changes: []});
assert.equal(B.incoming.length, 2);
// A volta a sincronizar sem mudanças: não descarrega nada (eTags conhecidos)
calls = []; let A2 = await exchange(drive, {stores: S, changes: [], index: A.index});
assert.equal(A2.incoming.length, 0); assert.ok(!calls.some(c => c.includes('//dl/')));
// B edita j1 (mais recente); A edita j1 com hora mais antiga → ganha a de B, A não envia
B = await exchange(drive, {stores: S, changes: [{store: 'jogos', rec: {id: 'j1', adversario: 'Y', updatedAt: 30}}], index: B.index});
A2 = await exchange(drive, {stores: S, changes: [{store: 'jogos', rec: {id: 'j1', adversario: 'Z', updatedAt: 20}}], index: A2.index});
assert.equal(A2.sent.length, 0); assert.equal(A2.incoming[0].rec.adversario, 'Y');
assert.equal(JSON.parse(files.get('data/jogos/j1.json').body).adversario, 'Y');
// A edita depois (40) → envia e B recebe
A2 = await exchange(drive, {stores: S, changes: [{store: 'jogos', rec: {id: 'j1', adversario: 'W', updatedAt: 40}}], index: A2.index});
assert.equal(A2.sent.length, 1);
B = await exchange(drive, {stores: S, changes: [], index: B.index});
assert.equal(B.incoming.length, 1); assert.equal(B.incoming[0].rec.adversario, 'W');
console.log('onedrive ok');
