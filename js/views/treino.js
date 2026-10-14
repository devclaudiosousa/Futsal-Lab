import {db} from '../db.js';
import {esc, debounce, toast, addDays, longDate} from '../ui.js';
import {atletas, mins} from '../data.js';
import {thumb} from '../prancheta.js';
import {field} from './common.js';

const TIPOS = {exercicio: 'Exercício', jogada: 'Jogada', bola_parada: 'Bola parada'};
const CICLO = ['', 'P', 'F', 'J', 'L'];
const PRES_LBL = {P: 'Presente', F: 'Faltou', J: 'Falta justificada', L: 'Lesionado'};

export async function render(main, [id], ctx) {
  let t = await db.get('treinos', id);
  if (!t) { main.innerHTML = '<div class="empty">Este treino já não existe.<a class="btn" href="#/epoca">Voltar à época</a></div>'; ctx.title('Treino', '#/epoca'); return; }
  ctx.title('Treino', '#/epoca');
  const [ats, exs] = await Promise.all([atletas(), db.all('exercicios')]);
  const exById = Object.fromEntries(exs.map(e => [e.id, e]));
  let q = '', picker = false, confirmDel = false;

  let pend = null;
  const save = async () => { clearTimeout(pend); pend = null; t = await db.put('treinos', t); };
  const saveLater = () => { clearTimeout(pend); pend = setTimeout(save, 400); };

  const blocosHTML = () => {
    const bl = t.blocos || [];
    if (!bl.length) return '<div class="empty">Ainda sem exercícios. Junta-os a partir do caderno.</div>';
    return bl.map((b, i) => {
      const ex = exById[b.ex];
      return `<div class="bloco">
        <div class="ord"><button data-up="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button><button data-down="${i}" aria-label="Descer" ${i === bl.length - 1 ? 'disabled' : ''}>▼</button></div>
        <div class="stack" style="gap:2px;min-width:0"><b>${esc(ex?.titulo || 'Exercício apagado')}</b><span class="small muted">${esc(TIPOS[ex?.tipo] || '')}${ex?.objetivo ? ' · ' + esc(ex.objetivo) : ''}</span></div>
        <div class="mins"><input id="min-${i}" data-min="${i}" type="number" inputmode="numeric" min="1" max="120" value="${esc(b.min)}" aria-label="Minutos"><span class="small muted">min</span><button class="icon ghost" data-rm="${i}" aria-label="Tirar do treino">✕</button></div>
      </div>`;
    }).join('');
  };
  const pickerHTML = () => {
    const used = new Set((t.blocos || []).map(b => b.ex));
    const list = exs.filter(e => !q || (e.titulo + ' ' + (e.objetivo || '') + ' ' + (e.tags || []).join(' ')).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
    return `<div class="panel"><div class="row between"><h2>Juntar exercício</h2><button class="ghost" id="closeP">Fechar</button></div>
      <input id="pq" placeholder="Procurar no caderno" value="${esc(q)}">
      ${list.length ? `<div class="cards">${list.map(e => `<div class="card">${thumb(e.quadro, e.titulo)}<b>${esc(e.titulo || 'Sem título')}</b>
        <span class="small muted">${esc(TIPOS[e.tipo] || '')} · ${e.duracao || 10} min${used.has(e.id) ? ' · já está no treino' : ''}</span>
        <button class="primary" data-join="${e.id}">Juntar</button></div>`).join('')}</div>`
        : `<div class="empty">${exs.length ? 'Nada encontrado.' : 'O caderno está vazio.'}<a class="btn" href="#/caderno">Ir ao caderno</a></div>`}</div>`;
  };
  const presHTML = () => ats.length ? `<div class="pres">${ats.map(a => { const v = (t.presencas || {})[a.id] || ''; return `<button data-pres="${a.id}" data-v="${v}" title="${PRES_LBL[v] || 'Por marcar'}"><span class="num${a.posicao === 'GR' ? ' gr' : ''}" style="width:26px;height:26px;font-size:13px">${esc(a.num)}</span>${esc(a.nome || '')}<span class="st">${v}</span></button>`; }).join('')}</div>`
    : '<p class="muted">Sem atletas no plantel. <a href="#/plantel">Pôr o plantel</a></p>';

  const draw = () => {
    const m = mins(t), rpe = +t.rpe || 0;
    const pres = Object.values(t.presencas || {});
    main.innerHTML = `
      <div class="panel"><div class="fields">
        ${field('data', 'Data', t.data, 'type="date"')}${field('hora', 'Hora', t.hora, 'type="time"')}
        ${field('titulo', 'Título', t.titulo, 'placeholder="ex.: Saída de pressão" maxlength="60"', true)}
        ${field('objetivo', 'Objetivo', t.objetivo, 'placeholder="O que queres ver no fim do treino" maxlength="140"', true)}
        ${field('rpe', 'Esforço da sessão (1–10)', t.rpe, 'type="number" inputmode="numeric" min="1" max="10"')}
      </div></div>
      <section class="panel"><div class="row between"><h2>Unidade de treino</h2>
        <span class="small muted mono" id="tot">${m} min${rpe ? ` · carga ${m * rpe} UA` : ''}</span></div>
        <div class="list">${blocosHTML()}</div>
        <div class="row"><button id="openP">+ Juntar exercício</button><a class="btn primary" href="#/campo/${t.id}" ${t.blocos?.length ? '' : 'aria-disabled="true"'}>Treino no campo</a></div>
      </section>
      ${picker ? pickerHTML() : ''}
      <section class="panel"><div class="row between"><h2>Presenças</h2><span class="small muted">${pres.filter(v => v === 'P').length}/${ats.length} presentes</span></div>
        <p class="small muted">Toca para mudar: P presente · F faltou · J justificada · L lesionado.</p>
        ${presHTML()}
        ${ats.length ? '<div class="row"><button id="allP">Todos presentes</button><button id="clrP" class="ghost">Limpar</button></div>' : ''}
      </section>
      <div class="row"><button id="dup">Duplicar para ${longDate(addDays(t.data, 7))}</button><button class="danger" id="del">Apagar treino</button></div>
      ${confirmDel ? '<div class="confirm">Apagar este treino? <button id="delY" class="primary" style="background:var(--crit);border-color:var(--crit)">Apagar</button><button id="delN">Cancelar</button></div>' : ''}`;
    wire();
  };

  const wire = () => {
    ['data', 'hora', 'titulo', 'objetivo', 'rpe'].forEach(k => main.querySelector('#' + k).oninput = e => {
      t[k] = e.target.value; saveLater();
      if (k === 'rpe') { const m = mins(t), r = +t.rpe || 0; main.querySelector('#tot').textContent = `${m} min${r ? ` · carga ${m * r} UA` : ''}`; }
    });
    main.querySelectorAll('[data-min]').forEach(inp => inp.oninput = e => {
      t.blocos[+e.target.dataset.min].min = Math.max(0, +e.target.value || 0); saveLater();
      const m = mins(t), r = +t.rpe || 0; main.querySelector('#tot').textContent = `${m} min${r ? ` · carga ${m * r} UA` : ''}`;
    });
    main.querySelector('#openP').onclick = () => { picker = true; draw(); main.querySelector('#pq')?.focus(); };
    const cp = main.querySelector('#closeP'); if (cp) cp.onclick = () => { picker = false; draw(); };
    const pq = main.querySelector('#pq'); if (pq) pq.oninput = debounce(e => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = main.querySelector('#pq'); n.focus(); n.setSelectionRange(pos, pos); }, 250);
    main.querySelector('#del').onclick = () => { confirmDel = true; draw(); };
    const dy = main.querySelector('#delY'); if (dy) dy.onclick = async () => { await db.del('treinos', t.id); toast('Treino apagado'); ctx.go('#/epoca'); };
    const dn = main.querySelector('#delN'); if (dn) dn.onclick = () => { confirmDel = false; draw(); };
    main.querySelector('#dup').onclick = async () => {
      const {id, createdAt, updatedAt, _dirty, presencas, rpe, ...rest} = t;
      const n = await db.put('treinos', {...rest, data: addDays(t.data, 7), presencas: {}, rpe: '', blocos: (t.blocos || []).map(b => ({...b}))});
      toast('Treino duplicado'); ctx.go('#/treino/' + n.id);
    };
    const allP = main.querySelector('#allP'); if (allP) allP.onclick = async () => { t.presencas = Object.fromEntries(ats.map(a => [a.id, 'P'])); await save(); draw(); };
    const clrP = main.querySelector('#clrP'); if (clrP) clrP.onclick = async () => { t.presencas = {}; await save(); draw(); };
  };

  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const bl = t.blocos || (t.blocos = []);
    if (b.dataset.up) { const i = +b.dataset.up; [bl[i - 1], bl[i]] = [bl[i], bl[i - 1]]; await save(); draw(); }
    else if (b.dataset.down) { const i = +b.dataset.down; [bl[i + 1], bl[i]] = [bl[i], bl[i + 1]]; await save(); draw(); }
    else if (b.dataset.rm) { bl.splice(+b.dataset.rm, 1); await save(); draw(); }
    else if (b.dataset.join) { const ex = exById[b.dataset.join]; bl.push({ex: ex.id, min: +ex.duracao || 10}); await save(); toast(`${ex.titulo || 'Exercício'} juntado`); draw(); }
    else if (b.dataset.pres) {
      const cur = (t.presencas || {})[b.dataset.pres] || '';
      t.presencas = {...t.presencas, [b.dataset.pres]: CICLO[(CICLO.indexOf(cur) + 1) % CICLO.length]};
      if (!t.presencas[b.dataset.pres]) delete t.presencas[b.dataset.pres];
      b.dataset.v = t.presencas[b.dataset.pres] || ''; b.querySelector('.st').textContent = b.dataset.v; b.title = PRES_LBL[b.dataset.v] || 'Por marcar';
      saveLater();
    }
  };
  draw();
  return () => { main.onclick = null; if (pend) save(); };
}
