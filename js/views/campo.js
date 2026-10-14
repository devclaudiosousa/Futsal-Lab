import {db} from '../db.js';
import {esc} from '../ui.js';
import {Board} from '../prancheta.js';

const fmt = s => { const neg = s < 0; s = Math.abs(Math.round(s)); return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export async function render(main, [id], ctx) {
  const t = await db.get('treinos', id);
  ctx.title('Treino no campo', '#/treino/' + id);
  if (!t || !(t.blocos || []).length) { main.innerHTML = `<div class="empty">Este treino ainda não tem exercícios.<a class="btn" href="#/treino/${id}">Montar o treino</a></div>`; return; }
  const exs = Object.fromEntries((await db.all('exercicios')).map(e => [e.id, e]));
  const bl = t.blocos;
  let i = 0, running = false, endAt = 0, left = (+bl[0].min || 0) * 60, beeped = false, audio = null, board = null, wake = null;

  const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {} };
  const beep = () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, .35, .7].forEach(d => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination); g.gain.setValueAtTime(.25, audio.currentTime + d); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + d + .3); o.start(audio.currentTime + d); o.stop(audio.currentTime + d + .3); });
    } catch (e) {}
    try { navigator.vibrate?.([300, 150, 300]); } catch (e) {}
  };

  const load = () => {
    const b = bl[i], ex = exs[b.ex];
    left = (+b.min || 0) * 60; running = false; beeped = false;
    const rest = bl.slice(i + 1).reduce((s, x) => s + (+x.min || 0), 0);
    main.innerHTML = `<div class="campo">
      <div class="row between"><span class="pill acc">${i + 1} de ${bl.length}</span><span class="small muted">Depois deste: ${rest} min</span></div>
      <h3 style="font-size:26px">${esc(ex?.titulo || 'Exercício')}</h3>
      ${ex?.objetivo ? `<p class="muted">${esc(ex.objetivo)}</p>` : ''}
      <div class="clock" id="clk">${fmt(left)}</div>
      <div class="bar"><i id="bar" style="width:0%"></i></div>
      <div class="ctl"><button id="prev" ${i === 0 ? 'disabled' : ''}>◀ Anterior</button><button class="primary" id="go">Iniciar</button><button id="next" ${i === bl.length - 1 ? 'disabled' : ''}>Seguinte ▶</button></div>
      <div id="bd"></div>
      ${ex?.descricao ? `<div class="panel"><h2>Como funciona</h2><p style="white-space:pre-wrap">${esc(ex.descricao)}</p></div>` : ''}
    </div>`;
    board?.stop?.();
    board = ex?.quadro ? new Board(main.querySelector('#bd'), structuredClone(ex.quadro), {loop: true}) : null;
    if (board && board.q.frames.length > 1) board.play();
    main.querySelector('#prev').onclick = () => { if (i > 0) { i--; load(); } };
    main.querySelector('#next').onclick = () => { if (i < bl.length - 1) { i++; load(); } };
    main.querySelector('#go').onclick = toggle;
    tick();
  };
  const toggle = () => {
    if (running) { left = (endAt - Date.now()) / 1000; running = false; }
    else { endAt = Date.now() + left * 1000; running = true; keepAwake(); if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } }
    main.querySelector('#go').textContent = running ? 'Pausa' : 'Continuar';
  };
  const tick = () => {
    const total = (+bl[i].min || 0) * 60;
    const s = running ? (endAt - Date.now()) / 1000 : left;
    const c = main.querySelector('#clk'); if (!c) return;
    c.textContent = fmt(s); c.classList.toggle('over', s < 0);
    main.querySelector('#bar').style.width = total ? Math.min(100, 100 * (1 - s / total)) + '%' : '0%';
    if (running && s <= 0 && !beeped) { beeped = true; beep(); }
  };
  const iv = setInterval(tick, 250);
  const vis = () => { if (document.visibilityState === 'visible' && running) keepAwake(); };
  document.addEventListener('visibilitychange', vis);
  load();
  return () => { clearInterval(iv); board?.stop?.(); document.removeEventListener('visibilitychange', vis); try { wake?.release(); } catch (e) {} };
}
