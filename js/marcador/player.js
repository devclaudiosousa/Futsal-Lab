// Leitor do marcador: a mesma interface (currentTime, duration, paused, play, pause, playbackRate, eventos)
// para um ficheiro do aparelho (<video>) ou para um vídeo do YouTube (IFrame Player API).
// O resto do marcador não precisa de saber de onde vem o vídeo.

const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// Aceita links de watch, youtu.be, shorts, live, embed, ou só o ID (11 caracteres). Devolve {id, t} ou null.
export function parseYouTube(s) {
  s = String(s || '').trim();
  if (/^[\w-]{11}$/.test(s)) return {id: s, t: 0};
  let u; try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1, 12);
  else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})/) || [])[1] || null;
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
  return {id, t: m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0};
}

let apiP = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiP ||= new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiP = null; rej(new Error('Sem ligação ao YouTube')); };
    document.head.append(s);
  });
  return apiP;
}

export function createPlayer(videoEl, ytBox) {
  const listeners = {};
  let kind = 'file', yt = null, ytReady = false, rate = 1, tick = null, lastT = 0;
  const emit = n => (listeners[n] || []).slice().forEach(({fn, once}) => { fn(); if (once) off(n, fn); });
  const off = (n, fn) => { listeners[n] = (listeners[n] || []).filter(l => l.fn !== fn); };
  // eventos do <video> passam pelo mesmo canal
  for (const n of ['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked', 'click'])
    videoEl.addEventListener(n, () => { if (kind === 'file') emit(n); });

  const ytState = () => (ytReady ? yt.getPlayerState() : -1);
  const startTick = () => { clearInterval(tick); tick = setInterval(() => { const t = api.currentTime; if (t !== lastT) { lastT = t; emit('timeupdate'); } }, 250); };

  const api = {
    get kind() { return kind; },
    get currentTime() { return kind === 'yt' ? (ytReady ? yt.getCurrentTime() || 0 : 0) : videoEl.currentTime; },
    set currentTime(t) {
      if (kind === 'yt') { if (ytReady) { yt.seekTo(t, true); lastT = t; setTimeout(() => emit('seeked'), 50); emit('timeupdate'); } }
      else videoEl.currentTime = t;
    },
    get duration() { return kind === 'yt' ? (ytReady ? yt.getDuration() || 0 : 0) : videoEl.duration; },
    get paused() { return kind === 'yt' ? ytState() !== 1 && ytState() !== 3 : videoEl.paused; },
    play() { if (kind === 'yt') { ytReady && yt.playVideo(); return Promise.resolve(); } return videoEl.play(); },
    pause() { if (kind === 'yt') ytReady && yt.pauseVideo(); else videoEl.pause(); },
    get playbackRate() { return kind === 'yt' ? rate : videoEl.playbackRate; },
    set playbackRate(r) {
      if (kind === 'yt') { rate = YT_RATES.reduce((b, x) => Math.abs(x - r) < Math.abs(b - r) ? x : b, 1); if (ytReady) yt.setPlaybackRate(rate); }
      else videoEl.playbackRate = r;
    },
    set src(s) { api.useFile(); videoEl.src = s; },
    addEventListener(n, fn, opts) { (listeners[n] ||= []).push({fn, once: !!opts?.once}); },
    removeEventListener: off,
    set hidden(h) { videoEl.hidden = h || kind !== 'file'; ytBox.hidden = h || kind !== 'yt'; },

    useFile() {
      if (kind === 'yt') { clearInterval(tick); try { yt?.destroy(); } catch (e) {} yt = null; ytReady = false; ytBox.innerHTML = ''; }
      kind = 'file'; ytBox.hidden = true;
    },
    // Abre um vídeo do YouTube; resolve quando está pronto a tocar
    async useYouTube(id, start = 0) {
      const YT = await loadApi();
      videoEl.pause(); videoEl.removeAttribute('src'); videoEl.hidden = true;
      if (yt) { try { yt.destroy(); } catch (e) {} }
      kind = 'yt'; ytReady = false; ytBox.hidden = false;
      ytBox.innerHTML = '<div></div>';
      await new Promise((res, rej) => {
        yt = new YT.Player(ytBox.firstChild, {
          videoId: id, width: '100%', height: '100%',
          playerVars: {playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(start) || undefined},
          events: {
            onReady: () => { ytReady = true; yt.setPlaybackRate(rate); startTick(); emit('loadedmetadata'); res(); },
            onStateChange: ev => { if (ev.data === 1) emit('play'); if (ev.data === 2 || ev.data === 0) emit('pause'); },
            onError: ev => rej(new Error({2: 'Link inválido', 5: 'O vídeo não toca neste leitor', 100: 'Vídeo não encontrado ou privado', 101: 'O dono do vídeo não deixa ver fora do YouTube', 150: 'O dono do vídeo não deixa ver fora do YouTube'}[ev.data] || 'Erro do YouTube ' + ev.data)),
          },
        });
      });
    },
  };
  return api;
}
