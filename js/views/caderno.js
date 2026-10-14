import {db} from '../db.js';
import {esc, debounce} from '../ui.js';
import {thumb, newQuadro} from '../prancheta.js';

export const TIPOS = {exercicio: 'Exercício', jogada: 'Jogada', bola_parada: 'Bola parada'};
let tipo = '', tag = '', q = '';

export async function render(main, params, ctx) {
  ctx.title('Caderno');
  const exs = (await db.all('exercicios')).sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
  const tags = [...new Set(exs.flatMap(e => e.tags || []))].sort();
  if (tag && !tags.includes(tag)) tag = '';

  main.innerHTML = `
    <div class="row between"><button class="primary" id="nv">+ Novo</button>
      <div class="seg" role="group" aria-label="Tipo"><button data-t="">Tudo</button>${Object.entries(TIPOS).map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div></div>
    <input id="cq" placeholder="Procurar por título, objetivo ou etiqueta" value="${esc(q)}" aria-label="Procurar">
    ${tags.length ? `<div class="chips">${tags.map(t => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    <div id="grid"></div>`;
  const draw = () => {
    main.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === tipo)));
    main.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
    const ql = q.toLowerCase();
    const list = exs.filter(e => (!tipo || e.tipo === tipo) && (!tag || (e.tags || []).includes(tag)) &&
      (!ql || [e.titulo, e.objetivo, e.descricao, ...(e.tags || [])].join(' ').toLowerCase().includes(ql)));
    main.querySelector('#grid').innerHTML = list.length ? `<div class="cards">${list.map(e => `<a class="card" href="#/exercicio/${e.id}">${thumb(e.quadro, e.titulo)}
      <b>${esc(e.titulo || 'Sem título')}</b><span class="small muted">${esc(TIPOS[e.tipo] || 'Exercício')} · ${e.duracao || '–'} min${e.jogadores ? ' · ' + esc(e.jogadores) : ''}${(e.quadro?.frames?.length || 0) > 1 ? ` · ${e.quadro.frames.length} passos` : ''}</span>
      ${e.objetivo ? `<span class="small">${esc(e.objetivo)}</span>` : ''}</a>`).join('')}</div>`
      : `<div class="empty">${exs.length ? 'Nada com estes filtros.' : 'O caderno está vazio. Desenha o primeiro exercício, jogada ou bola parada.'}</div>`;
  };
  main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tipo = b.dataset.t; draw(); });
  main.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { tag = tag === b.dataset.tag ? '' : b.dataset.tag; draw(); });
  main.querySelector('#cq').oninput = debounce(e => { q = e.target.value; draw(); }, 200);
  main.querySelector('#nv').onclick = async () => {
    const e = await db.put('exercicios', {titulo: '', tipo: tipo || 'exercicio', objetivo: '', duracao: 10, jogadores: '', tags: [], descricao: '', quadro: newQuadro()});
    ctx.go('#/exercicio/' + e.id);
  };
  draw();
}
