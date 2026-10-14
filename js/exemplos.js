// Dados de exemplo, todos com exemplo:true para se apagarem de uma vez.
import {db, STORES, uid} from './db.js';
import {today, addDays} from './ui.js';

const NOMES = [['1', 'Tiago Melo', 'GR'], ['12', 'Rui Pacheco', 'GR'], ['3', 'Diogo Ávila', 'Fixo'], ['4', 'Nuno Faria', 'Fixo'], ['5', 'Marco Leal', 'Ala'],
  ['6', 'Filipe Rosa', 'Ala'], ['7', 'Bruno Sá', 'Ala'], ['8', 'Hugo Pires', 'Pivô'], ['9', 'Luís Borges', 'Pivô'], ['10', 'André Couto', 'Universal'], ['11', 'Paulo Brum', 'Ala'], ['14', 'João Vieira', 'Universal']];

// peças: [k, n, [[x,y] por passo]]
function quadro(pecas, draws = []) {
  const ps = pecas.map(([k, n, pos]) => ({id: uid(), k, n, pos}));
  const nf = Math.max(...ps.map(p => p.pos.length));
  return {
    pieces: ps.map(({id, k, n}) => ({id, k, n})),
    frames: Array.from({length: nf}, (_, f) => ({
      pos: Object.fromEntries(ps.map(p => [p.id, p.pos[Math.min(f, p.pos.length - 1)]])),
      draws: (draws[f] || []).map(([k, pts, t]) => ({id: uid(), k, pts, t})),
    })),
  };
}

export async function carregarExemplos() {
  const ex = true;
  const at = [];
  for (const [num, nome, posicao] of NOMES) at.push(await db.put('atletas', {num, nome, posicao, ativo: true, exemplo: ex}));

  const e1 = await db.put('exercicios', {exemplo: ex, titulo: 'Saída de pressão 3:1 com rutura do ala', tipo: 'jogada', duracao: 15, jogadores: '4 + GR vs 4',
    objetivo: 'Sair a jogar contra pressão alta e encontrar o ala em rutura nas costas', tags: ['organização ofensiva', '3:1', 'saída de pressão'],
    descricao: 'GR joga no fixo. Fixo conduz para atrair o pressionante e solta no ala do lado da bola.\nO ala do lado contrário dá linha de passe no corredor central e o ala da bola rompe nas costas.\nCorrigir: corpo aberto na receção, passe ao pé contrário ao defensor.',
    quadro: quadro([
      ['gr', 'GR', [[25, 110], [25, 110], [25, 110]]], ['a', '3', [[80, 110], [110, 120], [118, 125]]], ['a', '5', [[120, 40], [140, 35], [235, 40]]],
      ['a', '7', [[120, 180], [165, 150], [170, 130]]], ['a', '8', [[230, 110], [250, 95], [260, 110]]],
      ['b', '1', [[150, 110], [125, 112], [130, 118]]], ['b', '2', [[175, 55], [160, 50], [200, 50]]], ['b', '3', [[175, 165], [180, 150], [180, 140]]], ['b', '4', [[260, 110], [265, 100], [255, 100]]],
      ['bola', '', [[33, 110], [118, 120], [148, 40]]],
    ], [[['pass', [[33, 110], [80, 110]]], ['cond', [[80, 110], [110, 120]]]], [['pass', [[118, 125], [140, 35]]], ['mov', [[140, 35], [235, 40]]], ['mov', [[165, 150], [170, 130]]]], [['text', [[300, 30]], 'rutura!']]])});
  const e2 = await db.put('exercicios', {exemplo: ex, titulo: 'Rondo 4x2 em meio campo', tipo: 'exercicio', duracao: 12, jogadores: '4x2',
    objetivo: 'Circulação rápida a 2 toques e orientação do corpo antes de receber', tags: ['aquecimento', 'posse'],
    descricao: '4 por fora, 2 ao meio. Quem perde a bola troca com o defensor que a recuperou. Séries de 2 min.',
    quadro: quadro([['a', '1', [[150, 50]]], ['a', '2', [[270, 50]]], ['a', '3', [[150, 170]]], ['a', '4', [[270, 170]]], ['b', '1', [[195, 100]]], ['b', '2', [[225, 125]]], ['bola', '', [[158, 56]]], ['cone', '', [[130, 30]]], ['cone', '', [[290, 30]]], ['cone', '', [[130, 190]]], ['cone', '', [[290, 190]]]],
      [[['zone', [[130, 30], [290, 190]]], ['pass', [[150, 50], [270, 50]]], ['pass', [[270, 50], [270, 170]]]]])});
  const e3 = await db.put('exercicios', {exemplo: ex, titulo: 'Canto · bloqueio ao segundo poste', tipo: 'bola_parada', duracao: 10, jogadores: '4 vs 4 + GR',
    objetivo: 'Libertar o pivô para remate ao segundo poste', tags: ['canto', 'bola parada ofensiva'],
    descricao: 'O 8 bloqueia o defensor do 10. O 10 ataca o segundo poste. O 3 fica na entrada da área para a segunda bola.',
    quadro: quadro([['a', '5', [[408, 12], [408, 12]]], ['a', '8', [[330, 95], [362, 118]]], ['a', '10', [[300, 130], [385, 128]]], ['a', '3', [[260, 110], [280, 110]]],
      ['b', '1', [[340, 105], [355, 112]]], ['b', '2', [[310, 135], [340, 135]]], ['gr', 'GR', [[405, 110], [405, 110]]], ['bola', '', [[404, 15], [385, 128]]]],
      [[['mov', [[330, 95], [362, 118]]], ['mov', [[300, 130], [385, 128]]], ['pass', [[404, 15], [385, 128]]]]])});

  const pres = Object.fromEntries(at.map((a, i) => [a.id, i === 9 ? 'L' : i === 11 ? 'F' : 'P']));
  await db.put('treinos', {exemplo: ex, data: addDays(today(), -2), hora: '19:30', titulo: 'Saída de pressão', objetivo: 'Sair a jogar contra pressão alta', rpe: 6, presencas: pres,
    blocos: [{ex: e2.id, min: 12}, {ex: e1.id, min: 20}, {ex: e3.id, min: 10}]});
  await db.put('treinos', {exemplo: ex, data: addDays(today(), 1), hora: '19:30', titulo: 'Bolas paradas e finalização', objetivo: 'Cantos ofensivos e defensivos', rpe: '', presencas: {},
    blocos: [{ex: e2.id, min: 10}, {ex: e3.id, min: 15}]});

  // Jogo marcado ao vivo, com substituições
  const P = Object.fromEntries(at.map(a => [a.num, {n: a.num, nome: a.nome}]));
  const L = (...nums) => nums.map(n => P[n]);
  let id = 1;
  const evs = [];
  const add = (parte, t, o) => evs.push({id: id++, t, parte, ref: 'vivo', hora: '', team: '', nota: '', ...o});
  const linhas = {
    1: [[0, L('1', '3', '5', '7', '8')], [300, L('1', '4', '6', '11', '9')], [610, L('1', '3', '5', '7', '8')], [930, L('1', '4', '10', '11', '9')], [1210, L('1', '3', '5', '7', '8')]],
    2: [[0, L('1', '3', '5', '7', '8')], [330, L('1', '4', '6', '11', '9')], [640, L('1', '3', '5', '10', '8')], [980, L('12', '4', '6', '11', '9')], [1260, L('1', '3', '5', '7', '8')]],
  };
  for (const p of [1, 2]) {
    add(p, 0, {type: 'ini_parte'});
    for (const [t, court] of linhas[p]) add(p, t, {type: 'linha', court});
    add(p, 1500, {type: 'fim_parte'});
  }
  const A = (p, t, type, n, extra = {}) => add(p, t, {type, team: 'A', ...(n ? {jog: P[n]} : {}), ...extra});
  const B = (p, t, type, extra = {}) => add(p, t, {type, team: 'B', ...extra});
  A(1, 95, 'remate_fora', '8', {zona: 'F10'}); A(1, 180, 'golo', '8', {zona: 'D10', assist: P['5']}); B(1, 260, 'remate_enquadrado', {zona: 'F10'});
  A(1, 350, 'perda', '6', {zona: 'MD'}); B(1, 356, 'golo', {zona: 'D10'}); A(1, 420, 'recuperacao', '4', {zona: 'MD'}); A(1, 505, 'remate_bloqueado', '9', {zona: 'D10'});
  A(1, 700, 'golo', '7', {zona: 'D10', assist: P['3']}); B(1, 800, 'remate_fora', {zona: 'F10'}); A(1, 980, 'passe_falhado', '10'); B(1, 985, 'golo', {zona: 'D10'});
  A(1, 1300, 'remate_enquadrado', '5', {zona: 'F10'}); A(1, 1380, 'recuperacao', '3', {zona: 'MO'});
  A(2, 120, 'golo', '5', {zona: 'F10'}); B(2, 400, 'remate_enquadrado', {zona: 'D10'}); A(2, 470, 'falta', '11', {zona: 'MD'}); A(2, 700, 'remate_fora', '10', {zona: 'F10'});
  A(2, 760, 'golo', '8', {zona: 'D10', assist: P['10']}); A(2, 1020, 'perda', '9', {zona: 'MO'}); B(2, 1030, 'golo', {zona: 'F10', nota: 'transição após perda'}); A(2, 1350, 'remate_enquadrado', '7', {zona: 'D10'});
  const passes = [['3', '5'], ['5', '8'], ['8', '7'], ['7', '3'], ['3', '7'], ['4', '6'], ['6', '9'], ['9', '11'], ['4', '11'], ['10', '9']];
  for (let k = 0; k < 60; k++) { const [a, b] = passes[k % passes.length]; const p = k < 30 ? 1 : 2; add(p, 30 + (k % 30) * 48, {type: 'passe', team: 'A', jog: P[a], rec: P[b], rut: k % 9 === 0}); }
  for (let k = 0; k < 8; k++) A(k < 4 ? 1 : 2, 60 + (k % 4) * 330, 'passe_falhado', ['3', '6', '9', '7'][k % 4]);
  await db.put('jogos', {exemplo: ex, data: addDays(today(), -4), hora: '18:30', adversario: 'CF Estrela do Norte', competicao: 'Campeonato · exemplo', local: 'Pavilhão Municipal', casa: true, concentracao: 60,
    convocados: at.map(a => a.id), notas: Object.fromEntries(at.slice(0, 11).map((a, i) => [a.id, [7, 6, 8, 6, 7, 5, 8, 8, 6, 6, 6][i]])),
    marcador: {vivo: {events: evs, parte: 2, a: 'Nós', b: 'CF Estrela do Norte', live: {starts: {1: null, 2: null}, date: addDays(today(), -4)}}}});
  await db.put('jogos', {exemplo: ex, data: addDays(today(), 5), hora: '17:00', adversario: 'GD Ribeira Alta', competicao: 'Campeonato · exemplo', local: 'Pavilhão da Ribeira Alta', casa: false, concentracao: 75,
    convocados: at.slice(0, 11).map(a => a.id), notas: {}, marcador: {}});
}

export async function apagarExemplos() {
  let n = 0;
  for (const s of STORES) for (const r of await db.all(s)) if (r.exemplo) { await db.del(s, r.id); n++; }
  return n;
}
