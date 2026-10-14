// Marcador de vídeo e ao vivo. A lista de eventos e as descrições rápidas vêm da taxonomia (Mais → Eventos e lances).
import {db} from '../db.js';
import {startAutoSync} from '../sync.js';
import {quartets, mmss, STRUCT} from '../stats.js';
import * as TAX from '../taxonomia.js';
import {createPlayer, parseYouTube} from './player.js';
import {eventosNoVideo, paraVideo} from './acerto.js';
(async () => {
// ================================================================ config
const {TYPES, TODOS, RAPIDAS, SUGESTOES_BASE, ZONAS} = TAX.aplicar(await TAX.carregar());
const SLOT_LBL = ['GR', '2', '3', '4', '5'];
const byId = Object.fromEntries(TODOS.map(t => [t.id, t]));   // inclui tipos escondidos, para os eventos antigos
const byCode = Object.fromEntries(TYPES.filter(t => t.code).map(t => [t.code, t]));
const $ = id => document.getElementById(id);
const vid = createPlayer($('vid'), $('yt'));   // ficheiro do aparelho ou YouTube, com a mesma interface
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
// ---------------- ligação à app (marcador.html?jogo=<id>)
const QS = new URLSearchParams(location.search);
const JOGO_ID = QS.get('jogo');
let jogo = null, atletasDB = [], CFG = {};
try {
  CFG = await db.meta('config') || {};
  if (JOGO_ID) jogo = await db.get('jogos', JOGO_ID);
  if (jogo) {
    const conv = new Set(jogo.convocados || []);
    atletasDB = (await db.all('atletas')).filter(a => conv.size ? conv.has(a.id) : a.ativo !== false)
      .sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999));
  }
} catch (e) { console.warn('Sem acesso à base de dados da app', e); }
const ligado = () => !!jogo;
let persistT = null;
function persistJogo(now) {
  if (!jogo) return;
  clearTimeout(persistT);
  const run = async () => {
    persistT = null;
    try {
      const cur = await db.get('jogos', jogo.id) || jogo;          // não apaga o que a app mudou entretanto (notas, convocatória…)
      cur.marcador = {...(cur.marcador || {}), ...jogo.marcador};
      if (jogo.videoUrl) cur.videoUrl = jogo.videoUrl;
      jogo = await db.put('jogos', cur);
    } catch (e) { console.warn(e); }
  };
  if (now) run(); else persistT = setTimeout(run, 800);
}
function jogoRoster() {
  const players = atletasDB.map((a, i) => ({id: i + 1, num: String(a.num || ''), nome: a.nome || ''}));
  const nums = jogo.marcador?.court;
  let court;
  if (Array.isArray(nums)) court = nums.map(n => players.find(p => p.num === n)?.id ?? null);
  else {
    const gr = atletasDB.findIndex(a => a.posicao === 'GR');
    const rest = players.filter((p, i) => i !== gr).slice(0, 4).map(p => p.id);
    court = [gr >= 0 ? players[gr].id : (players[0]?.id ?? null), ...(gr >= 0 ? rest : players.slice(1, 5).map(p => p.id))];
  }
  while (court.length < 5) court.push(null);
  return {players, court: court.slice(0, 5)};
}
const K = {vista: 'futsal-marcador:vista2', vel: 'futsal-marcador:velocidades', plantel: 'futsal-marcador:plantel', vivo: 'futsal-marcador:vivo', desc: 'futsal-marcador:descricoes', pad: 'futsal-marcador:pad', modo: 'futsal-marcador:modo'};

// ================================================================ state
let mode = 'sample';            // sample | video | live
let events = [], parte = 1, nextId = 1, storeKey = null, gameName = 'jogo';
let live = {starts: {1: null, 2: null}, date: ''};
let holder = null, rutNext = false, padTeam = 'A';
let lastPass = null;   // último passe certo, para saber quem assistiu o remate
let roster = jogo && atletasDB.length ? jogoRoster() : (LS.get(K.plantel, null) || defaultRoster());
const sampleDuration = 2700;

function defaultRoster() {
  const players = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n, i) => ({id: i + 1, num: String(n), nome: ''}));
  return {players, court: players.slice(0, 5).map(p => p.id)};
}
const saveRoster = () => {
  if (jogo && atletasDB.length) { jogo.marcador = {...(jogo.marcador || {}), court: roster.court.map(id => pById(id)?.num ?? null)}; persistJogo(); }
  else LS.set(K.plantel, roster);
};
const pById = id => roster.players.find(p => p.id === id) || null;
const pByNum = n => roster.players.find(p => p.num === String(n)) || null;
const snap = p => ({n: p.num, nome: p.nome || ''});
const pLabel = j => j ? `#${j.n}${j.nome ? ' ' + j.nome : ''}` : '';

// ================================================================ helpers
const isLance = e => e.type === 'lance';
const fmt = (s, dec = true) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = dec ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + ss;
};
// m,ss sem horas (70,12 = 1h10m12s) e segundos com 2 dígitos, como na folha
const fmtMS = s => { s = Math.max(0, s); return `${Math.floor(s / 60)},${String(s % 60).padStart(2, '0')}`; };
const iniMS = e => fmtMS(Math.floor(e.t));
const fimMS = e => fmtMS(Math.ceil(e.fim));
const teamName = t => (t === 'A' ? $('teamA').value : $('teamB').value) || (t === 'A' ? 'Equipa A' : 'Equipa B');
const color = t => t === 'A' ? 'var(--team-a)' : t === 'B' ? 'var(--team-b)' : 'var(--accent)';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const evName = e => e.type === 'linha' ? 'Em campo: ' + (e.court || []).map((j, i) => j ? (i === 0 ? 'GR ' : '') + j.n : '–').join(' · ') : e.type === 'ini_parte' ? 'Início da parte' : e.type === 'fim_parte' ? 'Fim da parte' : isLance(e) ? 'Lance' : e.type === 'passe' ? 'Passe' : e.type === 'passe_falhado' ? 'Passe falhado' : (byId[e.type]?.label || e.type);
const liveElapsed = p => live.starts[p] ? ((live.ends?.[p] || Date.now()) - live.starts[p]) / 1000 : 0;
const dur = () => mode === 'video' ? (isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0)
  : mode === 'live' ? Math.max(liveElapsed(parte) * 1.05, 1500) : sampleDuration;
const today = () => new Date().toISOString().slice(0, 10);

let videoFileName = '';
let ytId = null;          // vídeo do YouTube aberto (null = ficheiro)
let acerto = {inicios: {}, ajustes: {}};   // onde começa cada parte no vídeo, para alinhar o Ao vivo
function save() {
  if (mode === 'sample' || !storeKey) return;
  const d = {events, parte, a: $('teamA').value, b: $('teamB').value, live, ts: Date.now()};
  if (mode === 'video') { d.nome = videoFileName; d.pos = +vid.currentTime.toFixed(1); d.yt = ytId || undefined; d.acerto = acerto; }
  LS.set(storeKey, d);
  if (jogo) { jogo.marcador = {...(jogo.marcador || {}), [mode === 'live' ? 'vivo' : 'video']: d}; persistJogo(); }
}
// Jogos guardados neste aparelho (para saber que vídeo voltar a abrir depois de um refresh)
const CONFIG_KEYS = /:(plantel|descricoes|pad|pad2|modo|velocidades|vista2?)$/;
function savedGames() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('futsal-marcador:') || CONFIG_KEYS.test(k) || k.startsWith('futsal-marcador:jogo:')) continue;
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (!d?.events?.length) continue;
      const nome = k === K.vivo ? 'Jogo ao vivo' : (d.nome || k.replace(/^futsal-marcador:/, '').replace(/:\d+$/, ''));
      out.push({nome, n: d.events.length, ts: d.ts || 0, pos: d.pos, vivo: k === K.vivo});
    }
  } catch (e) {}
  return out.sort((a, b) => b.ts - a.ts);
}
function renderSaved() {
  if (jogo) { renderJogo(); return; }
  const g = savedGames().slice(0, 4);
  const fmtTs = ts => ts ? new Date(ts).toLocaleString('pt-PT', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '';
  $('savedList').innerHTML = !lsOk
    ? '<b>Atenção:</b> este browser não está a guardar as marcações. Exporta o CSV com frequência, ou usa o Chrome.'
    : g.length ? '<b>Guardado neste aparelho</b> · para continuar, abre o mesmo vídeo:<br>' + g.map(x =>
      `${esc(x.nome)} · ${x.n} eventos${x.pos ? ' · parado em ' + fmt(x.pos, false) : ''}${x.ts ? ' · ' + fmtTs(x.ts) : ''}`).join('<br>') : '';
  $('savedList').hidden = !$('savedList').innerHTML;
}
let lsOk = true;
try { localStorage.setItem('futsal-marcador:teste', '1'); lsOk = localStorage.getItem('futsal-marcador:teste') === '1'; localStorage.removeItem('futsal-marcador:teste'); } catch (e) { lsOk = false; }

let flashTimer;
function flash(txt, team) {
  $('flashTxt').textContent = txt;
  $('flashDot').style.background = color(team);
  $('flash').style.opacity = 1;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => $('flash').style.opacity = 0, 1400);
}

// ================================================================ marking core
function nowT() {
  if (mode === 'video') return +vid.currentTime.toFixed(2);
  if (mode === 'live') return live.starts[parte] ? +liveElapsed(parte).toFixed(1) : null;
  return null;
}
function markT() {
  if (mode === 'sample') { flash('Carrega um vídeo ou marca ao vivo'); return null; }
  const t = nowT();
  if (t == null) { flash(`Inicia a ${parte}.ª parte primeiro`); return null; }
  return t;
}
function push(o, t) {
  const e = {id: nextId++, t, parte, ref: mode === 'live' ? 'vivo' : 'video',
    hora: mode === 'live' ? new Date().toTimeString().slice(0, 8) : '', team: '', nota: '', ...o};
  events.push(e);
  return e;
}
function commit() { save(); renderAll(); }

let pendingWho = null;   // falta/cartão da nossa equipa à espera de "de quem?" (ou falta do adversário à espera de "quem sofreu?")
let pendingField = 'jog';
function openWho(ev, field = 'jog') {
  pendingWho = ev; pendingField = field;
  const ids = roster.court.filter(Boolean);
  $('whoQ').textContent = `${evName(ev)} · ${field === 'sofreu' ? 'quem sofreu?' : 'de quem?'}`;
  $('whoCourt').innerHTML = roster.court.map((id, i) => { const p = pById(id); return p ? `<button class="court" data-who="${p.id}"><kbd>${i + 1}</kbd>${esc(p.num)}${p.nome ? ' ' + esc(p.nome) : ''}</button>` : ''; }).join('');
  $('whoBench').innerHTML = roster.players.filter(p => !ids.includes(p.id)).sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999))
    .map(p => `<button data-who="${p.id}">${esc(p.num)}${p.nome ? ' ' + esc(p.nome) : ''}</button>`).join('');
  $('whoBox').hidden = false;
}
function closeWho() { pendingWho = null; $('whoBox').hidden = true; }
function assignWho(p) {
  const ev = pendingWho, field = pendingField; closeWho(); pendingField = field;
  if (!ev || !p || !events.includes(ev)) return;
  ev[pendingField === 'sofreu' ? 'sofreu' : 'jog'] = snap(p);
  flash(`${evName(ev)} · ${pendingField === 'sofreu' ? 'sofrida por ' : ''}${pLabel(snap(p))}`, pendingField === 'sofreu' ? 'B' : 'A');
  commit();
}

let lastZoneEv = null;   // último evento que aceita zona (Q / W)
function setZona(which) {
  const ev = pendingWho || lastZoneEv;
  if (!ev || !events.includes(ev) || !byId[ev.type]?.zonas) { flash('Sem evento para dar zona'); return; }
  ev.zona = byId[ev.type].zonas[which];
  flash(`${evName(ev)} · ${ZONAS[ev.zona].short}`, ev.team);
  save(); renderAll();
}
function addEvent(type, team, zona = '') {
  const t = markT(); if (t == null) return;
  if (pendingWho) closeWho();
  const o = {type: type.id, team};
  if (zona) o.zona = zona;
  if (team === 'A' && type.who) {                 // quem faz a falta raramente tem a bola: pergunta
    const ev = push(o, t);
    lastZoneEv = type.zonas ? ev : null;
    if (type.id === 'falta') { holder = null; lastPass = null; rutNext = false; }
    flash(`${type.label}${zona ? ' ' + ZONAS[zona].short : ''} · ${teamName(team)}`, team);
    commit(); openWho(ev);
    return;
  }
  if (team === 'B' && type.id === 'falta') {      // falta do adversário: pergunta quem a sofreu (falta sofrida)
    const ev = push(o, t);
    lastZoneEv = type.zonas ? ev : null;
    holder = null; lastPass = null; rutNext = false;
    flash(`${type.label}${zona ? ' ' + ZONAS[zona].short : ''} · ${teamName(team)}`, team);
    commit(); openWho(ev, 'sofreu');
    return;
  }
  if (team === 'A' && holder != null) { const h = pById(holder); if (h) o.jog = snap(h); }
  if (type.shot && o.jog && lastPass && lastPass.rec?.n === o.jog.n && events.includes(lastPass)) o.assist = {...lastPass.jog};
  const ev = push(o, t);
  lastZoneEv = type.zonas ? ev : null;
  if (type.shot) lastPass = null;
  if (team === 'B' || type.shot || type.id === 'perda') { holder = null; rutNext = false; }
  flash(`${type.label}${zona ? ' ' + ZONAS[zona].short : ''}${o.jog ? ' · ' + pLabel(o.jog) : ''}${o.assist ? ' (passe de #' + o.assist.n + ')' : ''} · ${teamName(team)}`, team);
  commit();
}

function tapPlayer(slot, rut) {
  const p = pById(roster.court[slot]);
  if (!p) { flash('Posição vazia: escolhe o jogador no plantel'); return; }
  const t = markT(); if (t == null) return;
  const h = holder != null ? pById(holder) : null;
  const r = !!(rut || rutNext);
  if (h && h.id !== p.id) {
    lastPass = push({type: 'passe', team: 'A', jog: snap(h), rec: snap(p), rut: r}, t);
    flash(`Passe ${h.num} → ${p.num}${r ? ' · rutura' : ''}`, 'A');
  } else { if (!h || h.id !== p.id) lastPass = null; flash(`Bola: ${pLabel(snap(p))}`, 'A'); }
  holder = p.id; rutNext = false;
  commit();
}

function failPass() {
  const h = holder != null ? pById(holder) : null;
  if (!h) { holder = null; flash('Ninguém tem a bola: toca primeiro no jogador'); renderPad(); return; }
  const t = markT(); if (t == null) return;
  push({type: 'passe_falhado', team: 'A', jog: snap(h)}, t);
  holder = null; rutNext = false; lastPass = null;
  flash(`Passe falhado · ${pLabel(snap(h))}`, 'A');
  commit();
}

function stopBall() { holder = null; rutNext = false; lastPass = null; flash('Bola parada'); renderPad(); }

function undo() {
  const marks = events.filter(e => !STRUCT.includes(e.type));
  if (mode === 'sample' || !marks.length) return;
  const last = marks.reduce((a, b) => a.id > b.id ? a : b);
  events = events.filter(e => e !== last);
  lastPass = null;
  if (pendingWho === last) closeWho();
  if (last.jog && ['passe', 'passe_falhado', 'perda'].includes(last.type)) { const p = pByNum(last.jog.n); holder = p ? p.id : null; }
  flash(`Apagado: ${evName(last)}`);
  commit();
}

// ---------------- lances A → S
const usadas = () => LS.get(K.desc, []);
const registar = d => LS.set(K.desc, [d, ...usadas().filter(x => x !== d)].slice(0, 300));
const aberto = () => events.find(e => isLance(e) && e.fim == null);
let fimPendente = null, retomar = false;

function abrirLance() {
  const t = markT(); if (t == null) return;
  const a = aberto();
  if (a) { a.t = t; flash(`Início corrigido · ${iniMS(a)}`); }
  else { push({type: 'lance', fim: null}, t); flash(`Lance aberto · ${fmtMS(Math.floor(t))}`); }
  commit();
}
function fecharLance(desc) {
  if (mode === 'sample') { flash('Carrega um vídeo ou marca ao vivo'); return; }
  const a = aberto();
  if (!a) { flash('Sem lance aberto (Início)'); return; }
  const t = nowT(); if (t == null) return;
  const fim = Math.max(a.t, t);
  if (desc) { a.fim = fim; a.nota = desc; registar(desc); flash(`${iniMS(a)} → ${fimMS(a)} · ${desc}`); commit(); return; }
  fimPendente = fim;
  retomar = mode === 'video' && !vid.paused; if (retomar) vid.pause();
  $('descList').innerHTML = [...new Set([...usadas(), ...RAPIDAS, ...SUGESTOES_BASE])].map(d => `<option value="${esc(d)}"></option>`).join('');
  $('descIn').value = '';
  $('descBox').hidden = false;
  $('descIn').focus();
}
function fecharCaixa() {
  $('descBox').hidden = true; $('descIn').blur(); fimPendente = null;
  if (retomar) vid.play();
  retomar = false;
}
function confirmarDesc() {
  const d = $('descIn').value.trim(), a = aberto();
  if (!d) return;
  if (a && fimPendente != null) { a.fim = fimPendente; a.nota = d; registar(d); flash(`${iniMS(a)} → ${fimMS(a)} · ${d}`); save(); }
  fecharCaixa(); renderAll();
}

// ---------------- playback / parte
function seekTo(t) { if (mode !== 'video') return; vid.currentTime = Math.max(0, Math.min(dur() || 0, t)); renderClock(); }
function togglePlay() { if (mode === 'video') vid.paused ? vid.play() : vid.pause(); }
function setSpeed(v) { $('speed').value = String(v); if (!holding) vid.playbackRate = +v; saveSpeeds(); flash(`Velocidade ${String(v).replace('.', ',')}×`); }

// ---------------- Espaço / ▶: toque = play/pausa; segurar = acelera enquanto estiver premido
const HOLD_MS = 250;
let holdTimer = null, holding = false, spaceDown = false;
const rateTxt = v => String(v).replace('.', ',') + '×';
const saveSpeeds = () => LS.set(K.vel, {n: $('speed').value, h: $('holdSpeed').value});
function holdStart() {
  if (mode !== 'video') return;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holding = true;
    vid.playbackRate = +$('holdSpeed').value;
    if (vid.paused) vid.play();
    flash(`▶▶ ${rateTxt($('holdSpeed').value)}`);
  }, HOLD_MS);
}
function holdEnd(tap = true) {
  clearTimeout(holdTimer); holdTimer = null;
  if (holding) {                 // largou depois de segurar: volta à velocidade normal e continua
    holding = false;
    vid.playbackRate = +$('speed').value;
    flash(`▶ ${rateTxt($('speed').value)}`);
  } else if (tap) togglePlay();
}
function stepSpeed(dir) {
  const opts = [...$('speed').options].map(o => o.value);
  setSpeed(opts[Math.max(0, Math.min(opts.length - 1, opts.indexOf($('speed').value) + dir))]);
}
function toggleParte() { parte = parte === 1 ? 2 : 1; holder = null; lastPass = null; flash(`${parte}.ª parte`); commit(); }

// ---------------- sources
function loadGame(d) {
  events = d?.events || []; parte = d?.parte || 1;
  acerto = {inicios: {...(d?.acerto?.inicios || {})}, ajustes: {...(d?.acerto?.ajustes || {})}};
  if (d?.a) $('teamA').value = d.a;
  if (d?.b) $('teamB').value = d.b;
  nextId = events.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  holder = null; rutNext = false;
}
function openVideo(file) {
  if (!file) return;
  ytId = null;
  vid.src = URL.createObjectURL(file);
  gameName = file.name.replace(/\.[^.]+$/, '') || 'jogo';
  videoFileName = file.name;
  storeKey = jogo ? 'futsal-marcador:jogo:' + jogo.id + ':video' : 'futsal-marcador:' + file.name + ':' + file.size;
  mode = 'video';
  const d = jogo ? (jogo.marcador?.video || null) : LS.get(storeKey, null);
  loadGame(d);
  nomesJogo();
  vid.playbackRate = +$('speed').value;
  if (d?.pos > 3) vid.addEventListener('loadedmetadata', () => { vid.currentTime = d.pos; renderClock(); }, {once: true});
  flash(d?.events?.length ? `Retomado: ${d.events.length} eventos${d.pos > 3 ? ' · em ' + fmt(d.pos, false) : ''}` : 'Vídeo carregado');
  renderAll();
}
// YouTube: o link fica guardado no jogo; as marcações são as mesmas do vídeo (mesma linha de tempo)
async function openYouTube(link) {
  const yt = parseYouTube(link);
  const msg = t => { $('ytMsg').textContent = t || ''; $('ytMsg').hidden = !t; };
  if (!yt) { msg('Isso não parece um link do YouTube.'); return; }
  msg('');
  const d = jogo ? (jogo.marcador?.video || null) : LS.get('futsal-marcador:yt:' + yt.id, null);
  const start = d?.pos > 3 && d?.yt === yt.id ? d.pos : yt.t;
  flash('A abrir o YouTube…');
  try { await vid.useYouTube(yt.id, start); }
  catch (e) {
    msg(`${e.message}. Alternativa: descarrega o vídeo no PC (python futsal_clips.py download "<link>") e abre o ficheiro aqui; as marcações são as mesmas.`);
    vid.useFile(); renderAll(); return;
  }
  ytId = yt.id;
  gameName = jogo ? `${jogo.data || ''}_${jogo.adversario || 'jogo'}` : 'youtube_' + yt.id;
  videoFileName = 'YouTube ' + yt.id;
  storeKey = jogo ? 'futsal-marcador:jogo:' + jogo.id + ':video' : 'futsal-marcador:yt:' + yt.id;
  mode = 'video';
  loadGame(d);
  nomesJogo();
  vid.playbackRate = +$('speed').value;
  if (jogo && jogo.videoUrl !== link) { jogo.videoUrl = link; persistJogo(); }
  flash(d?.events?.length ? `Retomado: ${d.events.length} eventos${start > 3 ? ' · em ' + fmt(start, false) : ''}` : 'Vídeo do YouTube carregado');
  renderAll();
}
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (mode === 'live' && document.visibilityState === 'visible') keepAwake(); });
function startLive() {
  mode = 'live'; storeKey = jogo ? 'futsal-marcador:jogo:' + jogo.id + ':vivo' : K.vivo;
  const d = jogo ? (jogo.marcador?.vivo || null) : LS.get(K.vivo, null);
  loadGame(d);
  nomesJogo();
  live = d?.live || {starts: {1: null, 2: null}, date: today()};
  gameName = 'ao_vivo_' + (live.date || today());
  vid.pause();
  keepAwake();
  flash(d?.events?.length ? `Retomado: ${d.events.length} eventos` : 'Modo ao vivo');
  renderAll();
}
function startHalf(p) {
  if (live.starts[p]) return;
  if (!live.date) live.date = today();
  parte = p; live.starts[p] = Date.now(); holder = null;
  push({type: 'ini_parte'}, 0); logLinha(0);
  gameName = 'ao_vivo_' + live.date;
  flash(`${p}.ª parte a contar`); keepAwake();
  commit();
}
function newLive() {
  events = []; parte = 1; nextId = 1; holder = null;
  live = {starts: {1: null, 2: null}, date: today()};
  gameName = 'ao_vivo_' + live.date;
  $('liveNewConfirm').hidden = true;
  commit();
}
function exitLive() {
  save(); mode = 'sample'; storeKey = null; events = makeSample(); holder = null; renderSaved();
  try { wakeLock?.release(); } catch (e) {}
  renderAll();
}

// ================================================================ sample data (clearly flagged)
function makeSample() {
  const ev = []; let id = 1;
  const add = o => ev.push({id: id++, ref: 'video', hora: '', team: '', nota: '', ...o, parte: o.t < 1350 ? 1 : 2});
  const ps = roster.court.map(pById).filter(Boolean);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = () => ps[Math.floor(rnd() * ps.length)];
  [[95,'A','remate_fora'],[180,'B','perda'],[212,'A','remate_enquadrado'],[340,'B','falta'],[402,'B','remate_bloqueado'],
   [455,'A','recuperacao'],[470,'A','golo'],[610,'B','remate_enquadrado'],[690,'A','falta'],[760,'A','canto'],[800,'B','falta'],
   [905,'A','perda'],[930,'B','remate_fora'],[1040,'B','falta'],[1110,'A','remate_bloqueado'],[1190,'B','falta'],[1230,'B','falta'],
   [1402,'B','golo'],[1500,'A','remate_enquadrado'],[1580,'A','remate_fora'],[1655,'B','recuperacao'],[1720,'A','golo'],
   [1810,'A','falta'],[1812,'A','amarelo'],[1950,'B','remate_enquadrado'],[2080,'A','remate_enquadrado'],[2210,'B','perda'],[2300,'A','remate_fora']]
    .forEach(([t, team, type]) => add({t, team, type, ...(team === 'A' && ps.length && type !== 'canto' ? {jog: snap(pick())} : {})}));
  [[300, 318, 'bola saida'], [1150, 1172, 'defesa pll construcao'], [1990, 2004, 'canto']].forEach(([t, fim, nota]) => add({t, fim, type: 'lance', nota}));
  if (ps.length >= 2) {
    for (let c = 0; c < 28; c++) {
      let t = 40 + c * 88 + rnd() * 30, cur = pick();
      const len = 2 + Math.floor(rnd() * 6);
      let prev = null;
      for (let k = 0; k < len; k++) {
        let nx; do { nx = pick(); } while (nx === cur);
        t += 2 + rnd() * 4;
        add({t: +t.toFixed(1), type: 'passe', team: 'A', jog: snap(cur), rec: snap(nx), rut: rnd() < 0.12});
        prev = cur; cur = nx;
      }
      const r = rnd();
      if (r < 0.4) add({t: +(t + 3).toFixed(1), type: 'passe_falhado', team: 'A', jog: snap(cur)});
      else if (r < 0.7) add({t: +(t + 2).toFixed(1), type: ['remate_enquadrado', 'remate_fora', 'remate_bloqueado', 'golo'][Math.floor(rnd() * 4)],
        team: 'A', jog: snap(cur), assist: snap(prev)});
    }
  }
  return ev;
}

// ================================================================ rendering
function renderStatic() {
  $('keys').innerHTML = TYPES.map(t => `<div class="key"><kbd>${t.key}</kbd>${esc(t.label)}</div>`).join('');
  $('fType').insertAdjacentHTML('beforeend', TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join(''));
  $('ptabHead').innerHTML = '<th>Jogador</th>' + PCOLS.map(([l, sh]) => `<th title="${esc(l)}">${esc(sh)}</th>`).join('');
  $('rapidas').innerHTML = RAPIDAS.map((d, i) => `<span title="${esc(d)}"><kbd>⇧${i + 1}</kbd>${esc(d)}</span>`).join('');
  $('padPlayers').innerHTML = SLOT_LBL.map((l, i) => `<button class="pl" data-slot="${i}" id="slot${i}"><b></b><span></span></button>`).join('');
  $('padEvents').innerHTML = TYPES.map(t => `<div class="evg"><button class="evb" data-ev="${t.id}">${esc(t.short)}</button>` +
    (t.zonas ? `<div class="zn">${t.zonas.map(z => `<button data-ev="${t.id}" data-zona="${z}" title="${esc(t.label)} · ${ZONAS[z].label}">${ZONAS[z].short}</button>`).join('')}</div>` : '') + `</div>`).join('');
  $('padChips').innerHTML = RAPIDAS.map((d, i) => `<button class="chip" data-chip="${i}">${esc(d)}</button>`).join('');
  $('qChips').innerHTML = RAPIDAS.map((d, i) => `<button data-chip="${i}">${esc(d)}</button>`).join('');
}

function renderStage() {
  vid.hidden = mode !== 'video';
  $('drop').hidden = mode !== 'sample';
  $('liveBox').hidden = mode !== 'live';
  $('stage').classList.toggle('live', mode === 'live');
  $('transport').hidden = mode === 'live';
  $('sampleBanner').hidden = mode !== 'sample';
  if (mode === 'live') renderLive();
}

function courtSnap() { return roster.court.map(id => { const p = pById(id); return p ? snap(p) : null; }); }
function logLinha(t) { push({type: 'linha', court: courtSnap()}, t); }
function endHalf() {
  const p = parte;
  if (!live.starts[p] || live.ends?.[p]) return;
  const t = +liveElapsed(p).toFixed(1);
  live.ends = {...(live.ends || {}), [p]: Date.now()};
  push({type: 'fim_parte'}, t);
  if (p === 1) { parte = 2; holder = null; lastPass = null; }
  flash(`Fim da ${p}.ª parte · ${fmt(t, false)}`); commit();
}
function videoParte(kind) {
  const t = markT(); if (t == null) return;
  if (kind === 'ini') { push({type: 'ini_parte'}, t); logLinha(t); flash(`Início da ${parte}.ª parte · ${fmt(t, false)}`); }
  else { push({type: 'fim_parte'}, t); flash(`Fim da ${parte}.ª parte · ${fmt(t, false)}`); }
  commit();
}
function nomesJogo() {
  if (!jogo) return;
  $('teamA').value = CFG.clube || $('teamA').value || 'Nós';
  if (jogo.adversario) $('teamB').value = jogo.adversario;
}
function renderJogo() {
  const tit = `${CFG.clube || 'Nós'} – ${jogo.adversario || 'Adversário'}`;
  document.title = tit + ' · Vídeo · Futsal Lab';
  $('backApp').href = 'index.html#/jogo/' + jogo.id;
  $('subTxt').hidden = true; $('jogoSub').hidden = false;
  const v = jogo.marcador?.video, l = jogo.marcador?.vivo;
  $('jogoSub').textContent = `${tit} · ${jogo.data || ''}${atletasDB.length ? ' · plantel da app (' + atletasDB.length + ' atletas)' : ''}`;
  if (atletasDB.length && !$('rosterApp')) { const det = $('rosterDet'); det.hidden = true; det.insertAdjacentHTML('afterend', '<p class="note" id="rosterApp">Os jogadores vêm da convocatória deste jogo. Para mudar números ou nomes, usa o Plantel da app.</p>'); }
  const parts = [];
  if (v?.events?.length) parts.push(`<b>Vídeo:</b> ${v.events.length} eventos${v.nome ? ' em ' + esc(v.nome) : ''}${v.pos ? ' · parado em ' + fmt(v.pos, false) : ''}. ${v.yt ? 'Continua no YouTube em baixo.' : 'Abre o mesmo vídeo para continuar.'}`);
  const link = jogo.videoUrl || (v?.yt ? 'https://youtu.be/' + v.yt : '');
  if (link && !$('ytIn').value) $('ytIn').value = link;
  if (l?.events?.length) parts.push(`<b>Ao vivo:</b> ${l.events.length} eventos.`);
  $('savedList').innerHTML = parts.join('<br>'); $('savedList').hidden = !parts.length;
}
// ---------------- Ao vivo → Vídeo
const AV_LBL = {inicio: 'Início da parte', fim: 'Fim da parte', golo: 'Golo', falta: 'Falta', remate: 'Remate', linha: 'Substituição'};
function iniciosEfetivos() {
  const out = {...acerto.inicios};
  for (const e of events) if (e.type === 'ini_parte' && out[e.parte] == null) out[e.parte] = e.t;
  return out;
}
function renderAcerto() {
  const live = jogo?.aovivo;
  const on = mode === 'video' && live?.events?.some(e => e.type === 'kickoff');
  $('avPanel').hidden = !on;
  if (!on) return;
  const ini = iniciosEfetivos();
  const {itens, partes} = eventosNoVideo(live, ini, acerto.ajustes);
  const plbl = p => live.periods?.[p - 1]?.lbl || p + '.ª';
  $('avPartes').innerHTML = partes.map(p => `<div class="avp"><b>${esc(plbl(p))}</b>
    ${ini[p] != null ? `começa aos <button class="link" data-avgo="${ini[p]}">${fmt(ini[p], false)}</button>` : '<span class="muted">início por marcar</span>'}
    <button data-avset="${p}">Começa agora</button>
    ${ini[p] != null ? `<span class="adj">ajuste <button data-avadj="${p}" data-d="-1">−1 s</button><b>${(+acerto.ajustes[p] || 0) > 0 ? '+' : ''}${+acerto.ajustes[p] || 0} s</b><button data-avadj="${p}" data-d="1">+1 s</button></span>` : ''}</div>`).join('');
  const falta = partes.filter(p => ini[p] == null);
  $('avNote').textContent = falta.length
    ? `Para veres no vídeo o que marcaste no banco: vai ao apito inicial da ${plbl(falta[0])} e carrega em "Começa agora".`
    : 'Toca num momento para saltar para lá (4 s antes). Se tudo estiver desfasado, usa o ajuste dessa parte.';
  const nome = j => (j ? `${j.n}${j.nome ? ' ' + j.nome : ''}` : '');
  const vis = itens.filter(i => i.tipo !== 'inicio' && i.tipo !== 'fim' && i.vt != null);
  $('avList').innerHTML = vis.length ? vis.map(i => `<button class="avi" data-avgo="${Math.max(0, i.vt - 4)}"><span class="t">${fmt(i.vt, false)}</span>
    <span class="dot" style="background:${color(i.team || '')}"></span><span>${AV_LBL[i.tipo]}${i.tipo === 'golo' ? (i.team === 'A' ? ' marcado' : ' sofrido') : ''}${i.zona ? ' ' + i.zona : ''}</span>
    <span class="muted">${i.tipo === 'linha' && i.sub ? `sai ${esc(nome(i.sub.sai))}, entra ${esc(nome(i.sub.entra))}` : esc([nome(i.jog), i.assist ? 'assist. ' + nome(i.assist) : ''].filter(Boolean).join(' · '))}</span></button>`).join('')
    : '<p class="note">Marca o início das partes para ver aqui os golos, faltas e substituições do Ao vivo.</p>';
  const novos = paraVideo(itens, events);
  $('avTrazer').disabled = !novos.length;
  const nGF = novos.filter(e => e.type === 'golo' || e.type === 'falta').length, nL = novos.filter(e => e.type === 'linha').length;
  $('avTrazer').textContent = novos.length ? `Trazer para o Vídeo: ${[nGF && `${nGF} golo${nGF > 1 ? 's' : ''}/falta${nGF > 1 ? 's' : ''}`, nL && `quem esteve em campo (${nL} momento${nL > 1 ? 's' : ''})`].filter(Boolean).join(' e ')}` : 'Já está tudo no Vídeo';
}
$('avPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.avgo != null) { if (vid.paused === false) vid.pause(); seekTo(+b.dataset.avgo); return; }
  if (b.dataset.avset) { acerto.inicios[b.dataset.avset] = +vid.currentTime.toFixed(1); save(); renderAcerto(); flash(`Início da parte aos ${fmt(vid.currentTime, false)}`); return; }
  if (b.dataset.avadj) { const p = b.dataset.avadj; acerto.ajustes[p] = (+acerto.ajustes[p] || 0) + +b.dataset.d; save(); renderAcerto(); return; }
  if (b.id === 'avTrazer') {
    const {itens} = eventosNoVideo(jogo.aovivo, iniciosEfetivos(), acerto.ajustes);
    const novos = paraVideo(itens, events);
    for (const n of novos) push(n, n.t);
    events.sort((a, b) => a.parte - b.parte || a.t - b.t);
    flash(`${novos.length} registos trazidos do Ao vivo`);
    commit();
  }
});
function renderQuartets() {
  const qs = mode === 'sample' ? [] : quartets(events);
  if (!qs.length) {
    $('qt').innerHTML = '';
    $('qtNote').textContent = mode === 'sample' ? 'Aparece quando marcares um jogo.' : 'Escolhe os cinco em campo no Plantel antes de começar e troca-os a cada substituição. Cada troca fica registada com o tempo.';
    return;
  }
  $('qt').innerHTML = `<table class="ptab qt"><thead><tr><th>Quarteto</th><th>Tempo</th><th>Golos</th><th>Saldo</th><th>Remates</th><th>Recup.</th><th>Perdas</th></tr></thead><tbody>` +
    qs.map(q => { const s = q.gm - q.gs; return `<tr><td><b>${q.nums.map(esc).join(' · ')}</b></td><td>${mmss(q.seg)}</td><td>${q.gm}:${q.gs}</td><td class="${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}">${s > 0 ? '+' : ''}${s}</td><td>${q.rm}:${q.rs}</td><td>${q.rec}</td><td>${q.perd}</td></tr>`; }).join('') + '</tbody></table>';
  $('qtNote').textContent = 'Sem o GR. ' + (mode === 'live' ? 'Tempo real desde o apito, com paragens.' : 'Tempo do vídeo; usa "Início da parte" e "Fim da parte" para as contas ficarem certas.');
}
function renderLive() {
  const s = live.starts[parte];
  $('liveLbl').textContent = `${parte}.ª parte${s ? (live.ends?.[parte] ? ' · terminada' : '') : ' · por iniciar'}`;
  $('liveEnd').disabled = !s || !!live.ends?.[parte];
  $('liveEnd').textContent = `Terminar ${parte}.ª parte`;
  $('liveClock').textContent = fmt(liveElapsed(parte), false);
  [1, 2].forEach(p => {
    const b = $('start' + p), st = live.starts[p];
    b.disabled = !!st;
    b.textContent = st ? `${p}.ª parte iniciada às ${new Date(st).toTimeString().slice(0, 5)}` : `Iniciar ${p}.ª parte`;
  });
}

function renderPad() {
  roster.court.forEach((id, i) => {
    const p = pById(id), b = $('slot' + i);
    b.querySelector('b').textContent = p ? p.num : '–';
    b.querySelector('span').textContent = p ? (p.nome || (i === 0 ? 'GR' : `tecla ${i + 1}`)) : 'vazio';
    b.classList.toggle('has', p != null && p.id === holder);
    b.classList.toggle('empty', !p);
    b.title = `Tecla ${i + 1}`;
  });
  const h = holder != null ? pById(holder) : null;
  $('holderTxt').innerHTML = h ? `Bola com <b>${esc(pLabel(snap(h)))}</b>` : 'Bola: <b>ninguém</b> · toca em quem a tem';
  $('pRut').setAttribute('aria-pressed', String(rutNext));
  $('tA').setAttribute('aria-pressed', String(padTeam === 'A'));
  $('tB').setAttribute('aria-pressed', String(padTeam === 'B'));
  $('tA').textContent = teamName('A'); $('tB').textContent = teamName('B');
  $('pad').classList.toggle('teamB', padTeam === 'B');
  const la = aberto();
  $('pFim').classList.toggle('lance-open', !!la);
  $('qFim').classList.toggle('lance-open', !!la);
  $('qIni').textContent = la ? `Corrigir início (${iniMS(la)})` : 'Início';
  $('pIni').textContent = la ? `Corrigir início (${iniMS(la)})` : 'Início do lance';
}

function renderStats() {
  const cnt = (team, f) => events.filter(e => e.team === team && f(e)).length;
  const zz = (team, f, z1, z2) => `${cnt(team, e => f(e) && e.zona === z1)} / ${cnt(team, e => f(e) && e.zona === z2)}`;
  const eff = t => { const s = cnt(t, e => byId[e.type]?.shot); return s ? Math.round(100 * cnt(t, e => e.type === 'golo') / s) + '%' : '–'; };
  const pc = cnt('A', e => e.type === 'passe'), pf = cnt('A', e => e.type === 'passe_falhado');
  const rows = [
    ['Remates', cnt('A', e => byId[e.type]?.shot), cnt('B', e => byId[e.type]?.shot)],
    ['Dentro / fora 10 m', zz('A', e => byId[e.type]?.shot, 'D10', 'F10'), zz('B', e => byId[e.type]?.shot, 'D10', 'F10')],
    ['Enquadrados', cnt('A', e => byId[e.type]?.on), cnt('B', e => byId[e.type]?.on)],
    ['Fora', cnt('A', e => e.type === 'remate_fora'), cnt('B', e => e.type === 'remate_fora')],
    ['Bloqueados', cnt('A', e => e.type === 'remate_bloqueado'), cnt('B', e => e.type === 'remate_bloqueado')],
    ['Golos', cnt('A', e => e.type === 'golo'), cnt('B', e => e.type === 'golo')],
    ['Eficácia', eff('A'), eff('B')],
    ['Passes certos', pc, '–'],
    ['Passes falhados', pf, '–'],
    ['Acerto de passe', pc + pf ? Math.round(100 * pc / (pc + pf)) + '%' : '–', '–'],
    ['Perdas de bola', cnt('A', e => e.type === 'perda'), cnt('B', e => e.type === 'perda')],
    ['Perdas MD / MO', zz('A', e => e.type === 'perda', 'MD', 'MO'), zz('B', e => e.type === 'perda', 'MD', 'MO')],
    ['Recuperações', cnt('A', e => e.type === 'recuperacao'), cnt('B', e => e.type === 'recuperacao')],
    ['Recuperações MD / MO', zz('A', e => e.type === 'recuperacao', 'MD', 'MO'), zz('B', e => e.type === 'recuperacao', 'MD', 'MO')],
    ['Cantos', cnt('A', e => e.type === 'canto'), cnt('B', e => e.type === 'canto')],
  ];
  let html = rows.map(([l, a, b]) => `<tr><td>${l}</td><td class="n ca">${a}</td><td class="n cb">${b}</td></tr>`).join('');
  const foulCell = (t, p) => {
    const n = cnt(t, e => e.type === 'falta' && e.parte === p);
    const pill = n >= 6 ? '<span class="pill crit">livres 10 m</span>' : n === 5 ? '<span class="pill warn">próxima: 10 m</span>' : '';
    return `<td class="n ${t === 'A' ? 'ca' : 'cb'}">${n}${pill}</td>`;
  };
  html += `<tr><td>Faltas 1.ª parte</td>${foulCell('A', 1)}${foulCell('B', 1)}</tr><tr><td>Faltas 2.ª parte</td>${foulCell('A', 2)}${foulCell('B', 2)}</tr>`;
  html += `<tr><td>Faltas MD / MO</td><td class="n ca">${zz('A', e => e.type === 'falta', 'MD', 'MO')}</td><td class="n cb">${zz('B', e => e.type === 'falta', 'MD', 'MO')}</td></tr>`;
  const card = t => `${cnt(t, e => e.type === 'amarelo')} / ${cnt(t, e => e.type === 'vermelho')}`;
  html += `<tr><td>Amarelos / vermelhos</td><td class="n ca">${card('A')}</td><td class="n cb">${card('B')}</td></tr>`;
  $('stats').innerHTML = html;
}

function playerStats() {
  const m = new Map();
  const g = j => { if (!m.has(j.n)) m.set(j.n, {n: j.n, nome: j.nome, pc: 0, pf: 0, rut: 0, rec: 0, perd: 0, recup: 0, rem: 0, enq: 0, fora: 0, bloq: 0, gol: 0, ast: 0, ppr: 0, falta: 0, am: 0, verm: 0, z: {}}); const o = m.get(j.n); if (j.nome) o.nome = j.nome; return o; };
  const pairs = new Map();
  for (const e of events) {
    if (e.team !== 'A') continue;
    if (e.type === 'passe' && e.jog && e.rec) {
      const o = g(e.jog); o.pc++; if (e.rut) o.rut++; g(e.rec).rec++;
      const k = e.jog.n + '>' + e.rec.n; pairs.set(k, (pairs.get(k) || 0) + 1);
    } else if (e.type === 'passe_falhado' && e.jog) g(e.jog).pf++;
    else if (e.jog) {
      const o = g(e.jog);
      if (e.type === 'perda') o.perd++;
      if (e.type === 'recuperacao') o.recup++;
      if (byId[e.type]?.shot) o.rem++;
      if (byId[e.type]?.on) o.enq++;
      if (e.type === 'remate_fora') o.fora++;
      if (e.type === 'remate_bloqueado') o.bloq++;
      if (e.type === 'golo') o.gol++;
      if (e.zona) o.z[e.type + '_' + e.zona] = (o.z[e.type + '_' + e.zona] || 0) + 1;
      if (e.type === 'falta') o.falta++;
      if (e.type === 'amarelo') o.am++;
      if (e.type === 'vermelho') o.verm++;
      if (e.assist && byId[e.type]?.shot) { const a = g(e.assist); a.ppr++; if (e.type === 'golo') a.ast++; }
    }
  }
  const list = [...m.values()].sort((a, b) => (parseInt(a.n) || 999) - (parseInt(b.n) || 999));
  return {list, pairs};
}

// Colunas por jogador: [cabeçalho do ficheiro, cabeçalho curto da tabela, valor, tipo]
const zc = (o, types, z) => types.reduce((s, t) => s + (o.z[t + '_' + z] || 0), 0);
const SHOTS_ALL = ['remate_enquadrado', 'remate_fora', 'remate_bloqueado', 'golo'];
const frac = (a, b) => b ? a / b : null;
const PCOLS = [
  ['Passes', 'Passes', o => o.pc + o.pf], ['Certos', 'Certos', o => o.pc], ['Falhados', 'Falh.', o => o.pf],
  ['% acerto', 'Acerto', o => frac(o.pc, o.pc + o.pf), 'pct'], ['Ruturas', 'Rutura', o => o.rut], ['Receções', 'Receç.', o => o.rec],
  ['Perdas', 'Perdas', o => o.perd], ['Perdas MD', 'Perd. MD', o => zc(o, ['perda'], 'MD')], ['Perdas MO', 'Perd. MO', o => zc(o, ['perda'], 'MO')],
  ['Recuperações', 'Recup.', o => o.recup], ['Recup. MD', 'Rec. MD', o => zc(o, ['recuperacao'], 'MD')], ['Recup. MO', 'Rec. MO', o => zc(o, ['recuperacao'], 'MO')],
  ['Remates', 'Rem.', o => o.rem], ['Remates D10M', 'Rem. D10', o => zc(o, SHOTS_ALL, 'D10')], ['Remates F10M', 'Rem. F10', o => zc(o, SHOTS_ALL, 'F10')],
  ['Enquadrados', 'Enq.', o => o.enq], ['Enquadrados D10M', 'Enq. D10', o => zc(o, ['remate_enquadrado', 'golo'], 'D10')], ['Enquadrados F10M', 'Enq. F10', o => zc(o, ['remate_enquadrado', 'golo'], 'F10')],
  ['Fora', 'Fora', o => o.fora], ['Fora D10M', 'Fora D10', o => zc(o, ['remate_fora'], 'D10')], ['Fora F10M', 'Fora F10', o => zc(o, ['remate_fora'], 'F10')],
  ['Bloqueados', 'Bloq.', o => o.bloq], ['Bloqueados D10M', 'Bloq. D10', o => zc(o, ['remate_bloqueado'], 'D10')], ['Bloqueados F10M', 'Bloq. F10', o => zc(o, ['remate_bloqueado'], 'F10')],
  ['Golos', 'Golos', o => o.gol], ['Golos D10M', 'Gol. D10', o => zc(o, ['golo'], 'D10')], ['Golos F10M', 'Gol. F10', o => zc(o, ['golo'], 'F10')],
  ['% eficácia', 'Efic.', o => frac(o.gol, o.rem), 'pct'], ['Assistências', 'Assist.', o => o.ast], ['Passes p/ remate', 'P. p/ rem.', o => o.ppr],
  ['Faltas', 'Faltas', o => o.falta], ['Faltas MD', 'Falt. MD', o => zc(o, ['falta'], 'MD')], ['Faltas MO', 'Falt. MO', o => zc(o, ['falta'], 'MO')],
  ['Amarelos', 'Amar.', o => o.am], ['Vermelhos', 'Verm.', o => o.verm],
];

function renderPlayers() {
  const {list, pairs} = playerStats();
  $('pjTeam').textContent = teamName('A');
  if (!list.length) {
    $('ptab').innerHTML = `<tr><td colspan="${PCOLS.length + 1}" class="empty">Ainda sem ações por jogador. Toca nos jogadores nos botões ou usa as teclas 1–5.</td></tr>`;
  } else {
    $('ptab').innerHTML = list.map(o => `<tr><td><b>${esc(o.n)}</b>${esc(o.nome)}</td>` + PCOLS.map(([, , f, k]) => {
      const v = f(o);
      if (k !== 'pct') return `<td>${v}</td>`;
      if (v == null) return '<td>–</td>';
      const p = Math.round(100 * v);
      return `<td><span class="acc"><i style="--w:${p}%"></i>${p}%</span></td>`;
    }).join('') + '</tr>').join('');
  }
  // matriz passador → recetor
  const ns = [...new Set([...pairs.keys()].flatMap(k => k.split('>')))].sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999));
  if (!ns.length) { $('mx').innerHTML = '<p class="note">Sem passes marcados.</p>'; $('mxTop').textContent = ''; return; }
  const max = Math.max(...pairs.values());
  let h = `<table class="mx"><thead><tr><th class="corner">de ↓ · para →</th>${ns.map(n => `<th>${esc(n)}</th>`).join('')}<th>Tot.</th></tr></thead><tbody>`;
  for (const a of ns) {
    let tot = 0;
    h += `<tr><th>${esc(a)}</th>` + ns.map(b => {
      const c = pairs.get(a + '>' + b) || 0; tot += c;
      if (!c) return `<td></td>`;
      const pct = Math.round(12 + 70 * c / max);
      return `<td style="background:color-mix(in srgb,var(--accent) ${pct}%,transparent);color:${pct > 50 ? 'var(--accent-ink)' : 'var(--ink)'}" title="#${esc(a)} → #${esc(b)}: ${c}">${c}</td>`;
    }).join('') + `<td class="tot">${tot}</td></tr>`;
  }
  $('mx').innerHTML = h + '</tbody></table>';
  const top = [...pairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, c]) => `#${k.replace('>', ' → #')} (${c})`);
  $('mxTop').textContent = 'Ligações mais usadas: ' + top.join(' · ');
}

function renderCourt() {
  const opts = id => `<option value="">—</option>` + roster.players.slice().sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999))
    .map(p => `<option value="${p.id}"${p.id === id ? ' selected' : ''}>${esc(p.num)}${p.nome ? ' ' + esc(p.nome) : ''}</option>`).join('');
  $('court').innerHTML = roster.court.map((id, i) => `<label>${SLOT_LBL[i]} · tecla ${i + 1}<select id="court${i}" data-court="${i}">${opts(id)}</select></label>`).join('');
  $('rosterN').textContent = roster.players.length;
}
function renderRoster() {
  $('roster').innerHTML = roster.players.map(p => `<div class="rrow">
    <input id="rn-${p.id}" data-rn="${p.id}" value="${esc(p.num)}" inputmode="numeric" maxlength="3" aria-label="Número">
    <input id="rnome-${p.id}" data-rnome="${p.id}" value="${esc(p.nome)}" placeholder="nome" maxlength="20" aria-label="Nome">
    <button data-rdel="${p.id}" aria-label="Remover jogador">✕</button></div>`).join('');
}

function filtered() {
  const ft = $('fTeam').value, fy = $('fType').value;
  return events.filter(e => (!ft || e.team === ft) &&
    (fy === '_all' ? true : fy === '' ? e.type !== 'passe' : fy === '_shots' ? byId[e.type]?.shot : e.type === fy));
}

function renderLog() {
  const all = filtered().sort((a, b) => (b.parte - a.parte) || (b.t - a.t));
  const list = all.slice(0, 400);
  $('count').textContent = `(${events.length})`;
  if (!list.length) { $('log').innerHTML = `<tr><td class="empty">${events.length ? 'Nenhum evento com este filtro.' : 'Ainda sem eventos.'}</td></tr>`; return; }
  $('log').innerHTML = list.map(e => {
    let time, seek, sw, lbl;
    if (isLance(e)) { time = `${iniMS(e)} → ${e.fim == null ? '…' : fimMS(e)}`; seek = e.t; sw = color(''); lbl = e.fim == null ? 'Lance aberto' : 'Lance'; }
    else {
      time = fmt(e.t); seek = e.t - 4; sw = color(e.team);
      lbl = e.type === 'passe' ? `Passe ${esc(pLabel(e.jog))} → ${esc(pLabel(e.rec))}${e.rut ? '<span class="pill ok">rutura</span>' : ''}`
        : esc(evName(e)) + (e.jog ? ` · ${esc(pLabel(e.jog))}` : '') + (e.zona && ZONAS[e.zona] ? ` <span class="pill ok">${ZONAS[e.zona].short}</span>` : '') + (e.assist ? ` <span class="pill ok">passe de #${esc(e.assist.n)}</span>` : '');
    }
    return `<tr data-id="${e.id}">
      <td><button class="t" data-seek="${seek}" title="${mode === 'video' ? 'Saltar para este momento' : e.hora ? 'Hora: ' + e.hora : ''}">${time}</button></td>
      <td><span class="ev"><i class="sw" style="background:${sw}"></i>${lbl}</span></td>
      <td class="pt">${e.parte}.ª P</td>
      <td style="width:100%"><input id="note-${e.id}" data-note="${e.id}" value="${esc(e.nota)}" placeholder="${isLance(e) ? 'descrição' : 'nota'}" aria-label="Nota"></td>
      <td><button class="del" data-del="${e.id}" aria-label="Apagar">✕</button></td></tr>`;
  }).join('') + (all.length > list.length ? `<tr><td colspan="5" class="empty">Mais ${all.length - list.length} eventos. Usa os filtros.</td></tr>` : '');
}

function renderTicks() {
  const d = dur();
  if (!d) { $('ticks').innerHTML = ''; return; }
  const src = filtered().filter(e => e.type !== 'passe' && !STRUCT.includes(e.type) && (mode !== 'live' || e.parte === parte));
  let html = '';
  if (mode !== 'live') {
    const half = events.filter(e => e.parte === 2).reduce((m, e) => Math.min(m, e.t), Infinity);
    if (isFinite(half)) html += `<div class="half" style="left:${(half / d * 100).toFixed(3)}%"></div>`;
  }
  html += src.map(e => isLance(e)
    ? `<div class="tick lance" style="left:${(e.t / d * 100).toFixed(3)}%;width:${(((e.fim ?? e.t) - e.t) / d * 100).toFixed(3)}%" title="${iniMS(e)} → ${e.fim == null ? '…' : fimMS(e)} · ${esc(e.nota || 'lance')}"></div>`
    : `<div class="tick ${e.team === 'B' ? 'b' : 'a'}${e.type === 'golo' ? ' goal' : ''}" style="left:${(e.t / d * 100).toFixed(3)}%" title="${fmt(e.t)} · ${esc(evName(e))}"></div>`).join('');
  $('ticks').innerHTML = html;
}

function renderNames() {
  $('thA').textContent = $('lgA').textContent = teamName('A');
  $('thB').textContent = $('lgB').textContent = teamName('B');
  $('fTeam').options[1].textContent = teamName('A');
  $('fTeam').options[2].textContent = teamName('B');
}

function renderHead() {
  const d = dur(), t = mode === 'video' ? vid.currentTime || 0 : mode === 'live' ? liveElapsed(parte) : 0;
  $('head').style.left = d ? Math.min(100, t / d * 100) + '%' : '0';
}
function renderClock() {
  if (mode === 'live') return;
  const d = dur(), t = vid.currentTime || 0;
  $('clock').innerHTML = `${fmt(t)} <small>/ ${fmt(mode === 'sample' ? sampleDuration : d, false)}</small>`;
  if (d && document.activeElement !== $('seek')) $('seek').value = Math.round(t / d * 1000);
  $('play').textContent = vid.paused ? '▶' : '❚❚';
  renderHead();
}

function renderAll() {
  renderStage(); renderNames(); renderStats(); renderPlayers(); renderQuartets(); renderLog(); renderTicks(); renderPad(); renderHead(); renderAcerto();
  $('vIni').hidden = $('vFim').hidden = mode !== 'video';
  $('parte').textContent = parte + '.ª parte';
}

// ================================================================ CSV
const CSV_HEAD = ['n', 'ref', 'tempo_s', 'fim_s', 'tempo', 'parte', 'hora', 'equipa_cod', 'equipa', 'evento', 'evento_nome',
  'jogador_num', 'jogador', 'recetor_num', 'recetor', 'rutura', 'nota', 'assist_num', 'assist', 'zona'];
const cell = v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function toCSV() {
  const rows = events.filter(e => !STRUCT.includes(e.type) && (!isLance(e) || e.fim != null)).sort((a, b) => (a.parte - b.parte) || (a.t - b.t)).map((e, i) => [
    i + 1, e.ref || 'video', e.t.toFixed(2), isLance(e) ? e.fim.toFixed(2) : '', isLance(e) ? `${iniMS(e)} → ${fimMS(e)}` : fmt(e.t),
    e.parte, e.hora || '', e.team || '', e.team ? teamName(e.team) : '', e.type, evName(e),
    e.jog?.n ?? '', e.jog?.nome ?? '', e.rec?.n ?? '', e.rec?.nome ?? '', e.type === 'passe' ? (e.rut ? 1 : 0) : '', e.nota || '', e.assist?.n ?? '', e.assist?.nome ?? '', e.zona ? ZONAS[e.zona]?.short || e.zona : '',
  ].map(cell).join(';'));
  return [CSV_HEAD.join(';'), ...rows].join('\r\n') + '\r\n';
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  const col = (r, k) => { const i = head.indexOf(k); return i >= 0 ? (r[i] ?? '') : ''; };
  const num = v => parseFloat(String(v ?? '').replace(',', '.'));
  return rows.filter(r => r.length > 1).map((r, i) => {
    const type = col(r, 'evento') || 'marca', t = num(col(r, 'tempo_s')) || 0, code = col(r, 'equipa_cod');
    const e = {id: i + 1, t, type, parte: +col(r, 'parte') === 2 ? 2 : 1, nota: col(r, 'nota'), ref: col(r, 'ref') || 'video', hora: col(r, 'hora'),
      team: code === 'B' ? 'B' : code === 'A' ? 'A' : type === 'lance' ? '' : 'A'};
    if (type === 'lance') { const f = num(col(r, 'fim_s')); e.fim = isNaN(f) ? t : f; }
    if (col(r, 'jogador_num')) e.jog = {n: col(r, 'jogador_num'), nome: col(r, 'jogador')};
    if (col(r, 'recetor_num')) e.rec = {n: col(r, 'recetor_num'), nome: col(r, 'recetor')};
    if (type === 'passe') e.rut = col(r, 'rutura') === '1';
    if (col(r, 'assist_num')) e.assist = {n: col(r, 'assist_num'), nome: col(r, 'assist')};
    const zs = col(r, 'zona'); if (zs) e.zona = Object.keys(ZONAS).find(k => ZONAS[k].short === zs || k === zs) || '';
    return e;
  });
}

const dlReady = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(undefined);
function showText(txt, msg) { $('csvOut').hidden = false; $('csvOut').value = txt; $('expMsg').textContent = msg; }
async function saveText(filename, text) {
  const data = '﻿' + text;   // BOM: o Excel abre os acentos certos
  const dl = await dlReady;
  if (dl === undefined) { // fora do claude.ai (ficheiro local ou GitHub Pages)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], {type: 'text/csv'}));
    a.download = filename; a.click();
    $('expMsg').textContent = `Guardado como ${filename}.`;
    return;
  }
  if (!dl) { showText(text, 'Aqui não é possível guardar ficheiros. Copia o texto abaixo para um ficheiro .csv.'); return; }
  try { await dl.save({filename, data}); $('expMsg').textContent = `Guardado como ${filename}.`; }
  catch (e) { if (e?.code === 'declined') $('expMsg').textContent = 'Gravação cancelada.'; else showText(text, 'Não foi possível guardar. Copia o texto abaixo para um ficheiro .csv.'); }
}
async function exportCSV() {
  if (mode === 'sample' || !events.length) { $('expMsg').textContent = 'Não há eventos para exportar.'; return; }
  await saveText(gameName + '_eventos.csv', toCSV());
}
function resumoCSV() {
  const rows = playerStats().list.map(o => [o.n, o.nome, ...PCOLS.map(([, , f, k]) => {
    const v = f(o); return k === 'pct' ? (v == null ? '' : Math.round(100 * v) + '%') : v;
  })].map(cell).join(';'));
  return [['Nº', 'Nome', ...PCOLS.map(c => c[0])].join(';'), ...rows].join('\r\n') + '\r\n';
}
async function exportResumo() {
  if (mode === 'sample' || !playerStats().list.length) { $('expMsg').textContent = 'Ainda não há ações por jogador neste jogo.'; return; }
  await saveText(gameName + '_jogadores.csv', resumoCSV());
}
async function copyCSV() {
  if (mode === 'sample' || !events.length) { $('expMsg').textContent = 'Não há eventos para copiar.'; return; }
  const csv = toCSV();
  try { await navigator.clipboard.writeText(csv); $('expMsg').textContent = 'CSV copiado.'; }
  catch (e) { showText(csv, 'Seleciona o texto abaixo e copia.'); $('csvOut').select(); }
}
async function copiarExcel() {
  const ls = events.filter(e => isLance(e) && e.fim != null).sort((a, b) => (a.parte - b.parte) || (a.t - b.t));
  if (mode === 'sample' || !ls.length) { $('expMsg').textContent = 'Não há lances fechados (Início … Fim) para copiar.'; return; }
  const limpa = v => String(v).replace(/[\t\r\n]+/g, ' ');
  const txt = [['', '', gameName], ...ls.map(e => [iniMS(e), fimMS(e), e.nota || ''])].map(r => r.map(limpa).join('\t')).join('\n');
  try { await navigator.clipboard.writeText(txt); $('expMsg').textContent = `${ls.length} lances copiados. Cola na célula A1.`; }
  catch (e) { showText(txt, 'Seleciona o texto abaixo, copia e cola na célula A1.'); $('csvOut').select(); }
}

// ================================================================ wiring
renderStatic();

$('file').addEventListener('change', e => openVideo(e.target.files[0]));
$('ytGo').addEventListener('click', () => openYouTube($('ytIn').value));
$('ytIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openYouTube($('ytIn').value); } });
const stage = $('stage');
['dragenter', 'dragover'].forEach(n => stage.addEventListener(n, e => { if (mode === 'live') return; e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(n => stage.addEventListener(n, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
stage.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith('video') && mode !== 'live') openVideo(f); });
vid.addEventListener('click', togglePlay);
['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked'].forEach(n => vid.addEventListener(n, () => { renderClock(); if (n === 'loadedmetadata') renderTicks(); }));
// guarda a posição do vídeo de 5 em 5 s e sempre que pausa ou a página fica escondida
let lastPosSave = 0;
vid.addEventListener('timeupdate', () => { if (mode === 'video' && Date.now() - lastPosSave > 5000) { lastPosSave = Date.now(); save(); } });
vid.addEventListener('pause', () => save());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { save(); persistJogo(true); } });
window.addEventListener('pagehide', () => { save(); persistJogo(true); });
let playPtr = false;
$('play').addEventListener('pointerdown', e => { if (e.button !== 0) return; playPtr = true; $('play').setPointerCapture?.(e.pointerId); holdStart(); });
$('play').addEventListener('pointerup', () => { if (!playPtr) return; playPtr = false; holdEnd(true); });
$('play').addEventListener('pointercancel', () => { if (!playPtr) return; playPtr = false; holdEnd(false); });
$('play').addEventListener('contextmenu', e => e.preventDefault());
$('play').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); togglePlay(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space' && spaceDown) { spaceDown = false; e.preventDefault(); holdEnd(true); } }, true);
window.addEventListener('blur', () => { if (spaceDown || playPtr) { spaceDown = playPtr = false; holdEnd(false); } });
$('back').addEventListener('click', () => seekTo(vid.currentTime - 3));
$('fwd').addEventListener('click', () => seekTo(vid.currentTime + 3));
$('seek').addEventListener('input', e => seekTo(e.target.value / 1000 * dur()));
$('speed').addEventListener('change', e => { if (!holding) vid.playbackRate = +e.target.value; saveSpeeds(); e.target.blur(); });
$('holdSpeed').addEventListener('change', e => { if (holding) vid.playbackRate = +e.target.value; saveSpeeds(); e.target.blur(); });
{ const v = LS.get(K.vel, null); if (v) { $('speed').value = v.n; $('holdSpeed').value = v.h; if (!$('speed').value) $('speed').value = '1'; if (!$('holdSpeed').value) $('holdSpeed').value = '2'; } }
$('parte').addEventListener('click', toggleParte);
$('timeline').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width * dur()); });

$('goLive').addEventListener('click', startLive);
$('start1').addEventListener('click', () => startHalf(1));
$('start2').addEventListener('click', () => startHalf(2));
$('liveNew').addEventListener('click', () => { $('liveNewConfirm').hidden = false; });
$('liveNewNo').addEventListener('click', () => { $('liveNewConfirm').hidden = true; });
$('liveNewYes').addEventListener('click', newLive);
$('liveExit').addEventListener('click', exitLive);
$('liveEnd').addEventListener('click', endHalf);
$('vIni').addEventListener('click', () => videoParte('ini'));
$('vFim').addEventListener('click', () => videoParte('fim'));
setInterval(() => { if (mode === 'live') { renderLive(); renderHead(); } }, 250);

// pad
$('undoBtn').addEventListener('click', undo);
const setView = (v, guardar) => { $('padView').value = v; $('qView').value = v; document.querySelector('.side').dataset.view = v; document.body.dataset.view = v; if (guardar) LS.set(K.vista, v); };
setView(LS.get(K.vista, window.matchMedia?.('(max-width: 980px) and (orientation: portrait)').matches ? 'lances' : 'tudo'));
$('padView').addEventListener('change', e => { setView(e.target.value, true); e.target.blur(); });
$('padPlayers').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (b) tapPlayer(+b.dataset.slot, false); });
$('pFail').addEventListener('click', failPass);
$('pStop').addEventListener('click', stopBall);
$('pRut').addEventListener('click', () => { rutNext = !rutNext; renderPad(); });
$('tA').addEventListener('click', () => { padTeam = 'A'; renderPad(); });
$('tB').addEventListener('click', () => { padTeam = 'B'; renderPad(); });
$('padEvents').addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (b) addEvent(byId[b.dataset.ev], padTeam, b.dataset.zona || ''); });
$('pIni').addEventListener('click', abrirLance);
$('qIni').addEventListener('click', abrirLance);
$('qUndo').addEventListener('click', undo);
$('qSub').addEventListener('click', () => { setView('lev', true); requestAnimationFrame(() => $('court').scrollIntoView({behavior: 'smooth', block: 'center'})); });
$('qFim').addEventListener('click', () => fecharLance());
$('qChips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b) fecharLance(RAPIDAS[+b.dataset.chip]); });
$('qView').addEventListener('change', e => { setView(e.target.value, true); e.target.blur(); });
$('pFim').addEventListener('click', () => fecharLance());
$('padChips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b) fecharLance(RAPIDAS[+b.dataset.chip]); });
$('descOk').addEventListener('click', confirmarDesc);
$('descIn').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); confirmarDesc(); }
  else if (e.key === 'Escape') { e.preventDefault(); fecharCaixa(); }
});

// plantel
$('court').addEventListener('change', e => {
  const i = +e.target.dataset.court; if (isNaN(i)) return;
  const id = e.target.value ? +e.target.value : null, old = roster.court[i];
  const j = roster.court.indexOf(id);
  if (id != null && j >= 0 && j !== i) roster.court[j] = old;   // troca de posições
  roster.court[i] = id;
  if (holder != null && !roster.court.includes(holder)) holder = null;
  saveRoster(); renderCourt(); renderPad(); e.target.blur();
  if (mode === 'sample') { events = makeSample(); renderAll(); }
  else { const t = nowT(); if (t != null) { logLinha(t); flash(evName(events[events.length - 1])); commit(); } }
});
$('roster').addEventListener('input', e => {
  const idn = e.target.dataset.rn, idm = e.target.dataset.rnome;
  const p = pById(+(idn || idm)); if (!p) return;
  if (idn) p.num = e.target.value.trim(); else p.nome = e.target.value.trim();
  saveRoster(); renderCourt(); renderPad();
});
$('roster').addEventListener('click', e => {
  const d = e.target.closest('[data-rdel]'); if (!d) return;
  const id = +d.dataset.rdel;
  roster.players = roster.players.filter(p => p.id !== id);
  roster.court = roster.court.map(c => c === id ? null : c);
  if (holder === id) holder = null;
  saveRoster(); renderRoster(); renderCourt(); renderPad();
});
$('addP').addEventListener('click', () => {
  const id = roster.players.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  roster.players.push({id, num: '', nome: ''});
  saveRoster(); renderRoster(); renderCourt();
  $('rn-' + id).focus();
});

['teamA', 'teamB'].forEach(id => $(id).addEventListener('input', () => { renderNames(); renderPad(); save(); }));
['fTeam', 'fType'].forEach(id => $(id).addEventListener('change', e => { renderLog(); renderTicks(); e.target.blur(); }));
$('log').addEventListener('click', e => {
  const s = e.target.closest('[data-seek]'); if (s) { seekTo(+s.dataset.seek); return; }
  const d = e.target.closest('[data-del]');
  if (d && mode !== 'sample') { events = events.filter(x => x.id !== +d.dataset.del); commit(); }
});
$('log').addEventListener('input', e => {
  const id = e.target.dataset.note; if (!id) return;
  const ev = events.find(x => x.id === +id); if (ev) { ev.nota = e.target.value; save(); }
});
$('exp').addEventListener('click', exportCSV);
$('copy').addEventListener('click', copyCSV);
$('expPJ').addEventListener('click', exportResumo);
$('whoBox').addEventListener('click', e => {
  const b = e.target.closest('[data-who]'); if (b) { assignWho(pById(+b.dataset.who)); return; }
  if (e.target.closest('#whoNone')) closeWho();
});
$('copyXL').addEventListener('click', copiarExcel);
$('imp').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  if (mode === 'sample') { $('expMsg').textContent = 'Carrega primeiro o vídeo (ou entra no modo ao vivo), depois abre o CSV desse jogo.'; e.target.value = ''; return; }
  try {
    events = parseCSV(await f.text()); nextId = events.length + 1; holder = null;
    parte = events.reduce((m, x) => Math.max(m, x.parte), 1);
    $('expMsg').textContent = `${events.length} eventos importados de ${f.name}.`;
    commit();
  } catch (err) { $('expMsg').textContent = 'Não consegui ler esse CSV. Tem de ter as colunas tempo_s e evento.'; }
  e.target.value = '';
});
$('clear').addEventListener('click', () => { if (mode !== 'sample' && events.length) $('confirmClear').hidden = false; });
$('clearNo').addEventListener('click', () => $('confirmClear').hidden = true);
$('clearYes').addEventListener('click', () => { events = []; holder = null; $('confirmClear').hidden = true; commit(); });

// Evita que Espaço/teclas reativem o último botão clicado com o rato
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

window.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if ((tag === 'INPUT' && e.target.type !== 'range') || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // tecla mantida premida: não repetir marcações (só as setas e o frame a frame repetem)
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'Comma', 'Period'].includes(e.code)) { if (e.code === 'Space' || byCode[e.code]) e.preventDefault(); return; }
  const type = byCode[e.code];
  const dig = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (pendingWho) {                                   // à espera de "de quem?"
    if (dig && !e.shiftKey && +dig[1] >= 1 && +dig[1] <= 5) { e.preventDefault(); const p = pById(roster.court[+dig[1] - 1]); if (p) assignWho(p); return; }
    if (e.code === 'Escape') { e.preventDefault(); closeWho(); return; }
    if (e.code === 'KeyQ' || e.code === 'KeyW') { e.preventDefault(); setZona(e.code === 'KeyQ' ? 0 : 1); return; }
    closeWho();                                        // outra tecla: fica sem jogador e segue
  }
  let handled = true;
  if (type) addEvent(type, e.shiftKey ? 'B' : 'A');
  else if (dig && e.shiftKey) { const d = RAPIDAS[dig[1] - 1]; if (d) fecharLance(d); else handled = false; }
  else if (dig) {
    const n = +dig[1];
    if (n >= 1 && n <= 5) tapPlayer(n - 1, false);
    else if (n === 0) failPass();
    else handled = false;
  }
  else switch (e.code) {
    case 'Space': if (!spaceDown) { spaceDown = true; holdStart(); if (mode !== 'video') spaceDown = false; } break;
    case 'ArrowLeft': seekTo(vid.currentTime - (e.shiftKey ? 10 : 3)); break;
    case 'ArrowRight': seekTo(vid.currentTime + (e.shiftKey ? 10 : 3)); break;
    case 'Comma': if (mode === 'video') { vid.pause(); seekTo(vid.currentTime - 1 / 25); } break;
    case 'Period': if (mode === 'video') { vid.pause(); seekTo(vid.currentTime + 1 / 25); } break;
    case 'Minus': case 'NumpadSubtract': stepSpeed(-1); break;
    case 'Equal': case 'NumpadAdd': case 'BracketRight': stepSpeed(1); break;
    case 'KeyH': toggleParte(); break;
    case 'KeyZ': undo(); break;
    case 'KeyQ': setZona(0); break;
    case 'KeyW': setZona(1); break;
    case 'KeyA': abrirLance(); break;
    case 'KeyS': fecharLance(); break;
    case 'KeyT': rutNext = !rutNext; flash(rutNext ? 'Próximo passe: rutura' : 'Rutura desligada', 'A'); renderPad(); break;
    case 'Backspace': stopBall(); break;
    default: handled = false;
  }
  if (handled) e.preventDefault();
}, true);

// ================================================================ boot
renderCourt(); renderRoster(); renderSaved();
events = makeSample();
renderAll(); renderClock();
if (QS.get('vivo') === '1') startLive();
startAutoSync();
})();
