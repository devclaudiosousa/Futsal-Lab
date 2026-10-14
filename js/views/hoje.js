import {db} from '../db.js';
import {esc, today, addDays, longDate, toast} from '../ui.js';
import {agenda, atletas, mins, novoTreino, novoJogo, resultado, placar, desfecho, jogoTitulo, config} from '../data.js';
import {agendaItem} from './common.js';
import {carregarExemplos} from '../exemplos.js';

export async function render(main, params, ctx) {
  ctx.title('Hoje');
  const [ag, at, ex, cfg] = await Promise.all([agenda(), atletas(), db.all('exercicios'), config()]);
  const hoje = today();

  if (!ag.length && !at.length && !ex.length) {
    main.innerHTML = `
      <div class="hero"><span class="kick">Primeiro passo</span><h3>A equipa inteira, neste aparelho</h3>
        <p class="muted">Põe o plantel, desenha os exercícios no caderno e monta os treinos. Cada jogo tem o Ao vivo para o banco e o Vídeo para a análise. Tudo funciona sem rede.</p>
        <div class="row"><a class="btn primary" href="#/plantel">Pôr o plantel</a><a class="btn" href="#/caderno">Abrir o caderno</a></div></div>
      <div class="panel"><h2>Ver primeiro com dados</h2>
        <p class="muted">Carrega um plantel, três exercícios, um treino e um jogo marcado, todos assinalados como exemplo. Apagas tudo de uma vez em Mais.</p>
        <div class="row"><button class="primary" id="ex">Carregar exemplos</button><a class="btn" href="#/mais">Ligar a sincronização</a></div></div>`;
    main.querySelector('#ex').onclick = async () => { await carregarExemplos(); toast('Exemplos carregados'); ctx.rerender(); };
    return;
  }

  const prox = ag.find(e => e.data >= hoje);
  const semana = ag.filter(e => e.data >= hoje && e.data <= addDays(hoje, 7) && e !== prox);
  const ult = [...ag].reverse().find(e => e.kind === 'jogo' && e.data <= hoje && resultado(e));

  let hero = '';
  if (prox) {
    const quando = prox.data === hoje ? 'Hoje' : prox.data === addDays(hoje, 1) ? 'Amanhã' : longDate(prox.data);
    if (prox.kind === 'treino') {
      hero = `<div class="hero"><span class="kick">Próximo treino · ${quando}, ${esc(prox.hora || '')}</span>
        <h3>${esc(prox.titulo || 'Treino')}</h3>
        <p class="muted">${(prox.blocos || []).length} exercícios · ${mins(prox)} min${prox.objetivo ? ' · ' + esc(prox.objetivo) : ''}</p>
        <div class="row"><a class="btn primary" href="#/campo/${prox.id}">Treino no campo</a><a class="btn" href="#/treino/${prox.id}">Abrir</a></div></div>`;
    } else {
      hero = `<div class="hero"><span class="kick">Próximo jogo · ${quando}, ${esc(prox.hora || '')}</span>
        <h3>${esc(jogoTitulo(prox, cfg.clube))}</h3>
        <p class="muted">${(prox.convocados || []).length ? (prox.convocados || []).length + ' convocados' : 'Convocatória por fazer'}${prox.local ? ' · ' + esc(prox.local) : ''}</p>
        <div class="row"><a class="btn primary" href="#/aovivo/${prox.id}">Ao vivo</a><a class="btn" href="#/jogo/${prox.id}">Abrir</a></div></div>`;
    }
  } else {
    hero = `<div class="hero"><span class="kick">Agenda vazia</span><h3>Sem treinos nem jogos marcados</h3><p class="muted">Junta o próximo treino ou jogo para o veres aqui.</p></div>`;
  }

  const r = ult && resultado(ult), d = desfecho(r);
  main.innerHTML = `${hero}
    <div class="row"><button id="nt">+ Treino hoje</button><button id="nj">+ Jogo</button></div>
    <section class="stack"><h2>Próximos 7 dias</h2>
      ${semana.length ? `<div class="list">${semana.map(e => agendaItem(e, cfg.clube)).join('')}</div>` : '<p class="muted">Nada mais esta semana.</p>'}</section>
    ${ult ? `<section class="stack"><h2>Último jogo</h2><a class="panel" href="#/jogo/${ult.id}" style="text-decoration:none;color:inherit">
      <div class="row between"><div class="stack" style="gap:2px"><b>${esc(jogoTitulo(ult, cfg.clube))}</b><span class="small muted">${longDate(ult.data)}</span></div>
      <span class="row"><span class="score">${placar(ult, r)}</span><span class="pill ${d[1]}">${d[0]}</span></span></div></a></section>` : ''}`;
  main.querySelector('#nt').onclick = async () => { const t = await novoTreino(); ctx.go('#/treino/' + t.id); };
  main.querySelector('#nj').onclick = async () => { const j = await novoJogo(addDays(hoje, 1)); ctx.go('#/jogo/' + j.id); };
}
