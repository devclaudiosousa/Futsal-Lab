import {esc, dayBox, weekday} from '../ui.js';
import {mins, resultado, placar, desfecho, jogoTitulo} from '../data.js';

export function agendaItem(ev, clube) {
  if (ev.kind === 'treino') {
    const m = mins(ev), n = (ev.blocos || []).length;
    const pres = Object.values(ev.presencas || {}).filter(v => v === 'P').length;
    return `<a class="item" href="#/treino/${ev.id}">${dayBox(ev.data)}<div class="main"><b>${esc(ev.titulo || 'Treino')}</b>
      <span>${weekday(ev.data)} · ${esc(ev.hora || '')} · ${n ? `${n} exercícios · ${m} min` : 'sem exercícios'}${pres ? ` · ${pres} presentes` : ''}</span></div>
      <span class="pill">Treino</span></a>`;
  }
  const r = resultado(ev), d = desfecho(r);
  return `<a class="item" href="#/jogo/${ev.id}">${dayBox(ev.data, true)}<div class="main"><b>${esc(jogoTitulo(ev, clube))}</b>
    <span>${weekday(ev.data)} · ${esc(ev.hora || '')}${ev.competicao ? ' · ' + esc(ev.competicao) : ''}${ev.local ? ' · ' + esc(ev.local) : ''}</span></div>
    ${r ? `<span class="pill ${d[1]}">${d[0]} ${placar(ev, r)}</span>` : '<span class="pill acc">Jogo</span>'}</a>`;
}

export const field = (id, label, value, attrs = '', wide = false) =>
  `<label class="f${wide ? ' wide' : ''}" for="${id}"><span>${label}</span><input id="${id}" name="${id}" value="${esc(value ?? '')}" ${attrs}></label>`;
