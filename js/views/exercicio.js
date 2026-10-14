import {db} from '../db.js';
import {esc, toast} from '../ui.js';
import {Board, newQuadro} from '../prancheta.js';
import {TIPOS} from './caderno.js';
import {field} from './common.js';

export async function render(main, [id], ctx) {
  let ex = await db.get('exercicios', id);
  ctx.title('Exercício', '#/caderno');
  if (!ex) { main.innerHTML = '<div class="empty">Este exercício já não existe.<a class="btn" href="#/caderno">Voltar ao caderno</a></div>'; return; }
  const treinos = (await db.all('treinos')).filter(t => (t.blocos || []).some(b => b.ex === ex.id));
  let pend = null, confirmDel = false, board = null;
  const save = async () => { clearTimeout(pend); pend = null; ex = await db.put('exercicios', ex); if (board) board.q = ex.quadro; };
  const saveLater = (ms = 500) => { clearTimeout(pend); pend = setTimeout(save, ms); };

  main.innerHTML = `
    <div class="panel"><div class="fields">
      ${field('titulo', 'Título', ex.titulo, 'maxlength="60" placeholder="ex.: Saída de pressão 3:1 com rutura"', true)}
      <label class="f"><span>Tipo</span><select id="tipo">${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}"${ex.tipo === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${field('duracao', 'Minutos', ex.duracao, 'type="number" inputmode="numeric" min="1" max="120"')}
      ${field('jogadores', 'Jogadores', ex.jogadores, 'maxlength="20" placeholder="4x4 + GR"')}
      ${field('objetivo', 'Objetivo', ex.objetivo, 'maxlength="140"', true)}
      ${field('tags', 'Etiquetas (separadas por vírgula)', (ex.tags || []).join(', '), 'maxlength="120" placeholder="organização ofensiva, 3:1, sub-17"', true)}
    </div></div>
    <section class="panel"><h2>Prancheta</h2><div id="bd"></div></section>
    <section class="panel"><h2>Como funciona</h2><textarea id="descricao" maxlength="4000" placeholder="Regras, variantes, pontos-chave a corrigir">${esc(ex.descricao || '')}</textarea></section>
    <p class="small muted">${treinos.length ? `Usado em ${treinos.length} treino${treinos.length > 1 ? 's' : ''}.` : 'Ainda não está em nenhum treino.'}</p>
    <div class="row"><button id="dup">Duplicar</button><button class="danger" id="del">Apagar</button></div>
    <div id="cf"></div>`;

  board = new Board(main.querySelector('#bd'), ex.quadro || (ex.quadro = newQuadro()), {editable: true, onChange: qd => { ex.quadro = qd; saveLater(700); }});
  ['titulo', 'duracao', 'jogadores', 'objetivo', 'descricao'].forEach(k => main.querySelector('#' + k).oninput = e => { ex[k] = k === 'duracao' ? +e.target.value || '' : e.target.value; saveLater(); });
  main.querySelector('#tags').oninput = e => { ex.tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean); saveLater(); };
  main.querySelector('#tipo').onchange = e => { ex.tipo = e.target.value; save(); };
  main.querySelector('#dup').onclick = async () => {
    const {id: _i, createdAt, updatedAt, _dirty, ...rest} = ex;
    const n = await db.put('exercicios', {...structuredClone(rest), titulo: (ex.titulo || 'Exercício') + ' (cópia)'});
    toast('Duplicado'); ctx.go('#/exercicio/' + n.id);
  };
  const cf = main.querySelector('#cf');
  main.querySelector('#del').onclick = () => {
    cf.innerHTML = `<div class="confirm">Apagar${treinos.length ? ` (está em ${treinos.length} treino${treinos.length > 1 ? 's' : ''})` : ''}? <button id="delY" class="primary" style="background:var(--crit);border-color:var(--crit)">Apagar</button><button id="delN">Cancelar</button></div>`;
    cf.querySelector('#delY').onclick = async () => { clearTimeout(pend); pend = null; await db.del('exercicios', ex.id); toast('Exercício apagado'); ctx.go('#/caderno'); };
    cf.querySelector('#delN').onclick = () => { cf.innerHTML = ''; };
  };
  void confirmDel;
  return () => { board?.stop?.(); if (pend) save(); };
}
