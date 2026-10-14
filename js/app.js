import {db, onChange} from './db.js';
import {startAutoSync, onSync, syncNow, finishLogin} from './sync.js';
import {$, ICONS} from './ui.js';

const ROUTES = {
  hoje: () => import('./views/hoje.js'),
  epoca: () => import('./views/epoca.js'),
  treino: () => import('./views/treino.js'),
  campo: () => import('./views/campo.js'),
  jogo: () => import('./views/jogo.js'),
  aovivo: () => import('./views/aovivo.js'),
  plantel: () => import('./views/plantel.js'),
  atleta: () => import('./views/atleta.js'),
  caderno: () => import('./views/caderno.js'),
  exercicio: () => import('./views/exercicio.js'),
  mais: () => import('./views/mais.js'),
};
const TABS = [['hoje', 'Hoje'], ['epoca', 'Época'], ['plantel', 'Plantel'], ['caderno', 'Caderno'], ['mais', 'Mais']];
const TAB_OF = {treino: 'epoca', jogo: 'epoca', aovivo: 'epoca', campo: 'epoca', atleta: 'plantel', exercicio: 'caderno'};

document.querySelector('nav.tabs').innerHTML = TABS.map(([k, l]) => `<a href="#/${k}" data-tab="${k}">${ICONS[k]}<span>${l}</span></a>`).join('');

const main = $('main');

// No iPad/iPhone, o Safari apaga os dados de sites não usados durante 7 dias; a app instalada não tem esse limite
(() => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  let fechado = false; try { fechado = sessionStorage.getItem('aviso-ios') === '1'; } catch (e) {}
  if (!ios || instalada || fechado) return;
  const b = document.createElement('div');
  b.className = 'banner ios-banner';
  b.innerHTML = '<span><b>Instala a app neste aparelho:</b> Partilhar → Adicionar ao ecrã principal. Aberta no Safari, os dados podem ser apagados ao fim de 7 dias sem uso.</span><button class="ghost" aria-label="Fechar">✕</button>';
  b.querySelector('button').onclick = () => { b.remove(); try { sessionStorage.setItem('aviso-ios', '1'); } catch (e) {} };
  document.body.append(b);
})();
let cleanup = null, current = null, stale = false;

export const ctx = {
  go: h => { location.hash = h; },
  title(t, back) {
    $('#title').textContent = t;
    document.title = t === 'Hoje' ? 'Futsal Lab' : `${t} · Futsal Lab`;
    $('#back').hidden = !back;
    $('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = back));
  },
  rerender: () => route(true),
};

async function route(keepScroll = false) {
  const [name = 'hoje', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const key = ROUTES[name] ? name : 'hoje';
  const y = window.scrollY;
  try { cleanup?.(); } catch (e) {}
  cleanup = null; stale = false;
  current = {key, params};
  document.querySelectorAll('nav.tabs a').forEach(a => a.toggleAttribute('aria-current', false));
  document.querySelector(`nav.tabs a[data-tab="${TAB_OF[key] || key}"]`)?.setAttribute('aria-current', 'page');
  try {
    const mod = await ROUTES[key]();
    if (current?.key !== key) return;
    const c = await mod.render(main, params, ctx);
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="panel"><h3>Algo correu mal</h3><p class="muted">${String(e.message || e)}</p><a class="btn" href="#/hoje">Voltar ao início</a></div>`;
  }
  window.scrollTo(0, keepScroll ? y : 0);
}
window.addEventListener('hashchange', () => route());

// Alterações vindas de outro separador (marcador) ou da sincronização: volta a desenhar sem perder o que se está a escrever
const editing = () => { const a = document.activeElement; return a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
let rt;
const externalChange = () => { clearTimeout(rt); rt = setTimeout(() => { if (editing()) stale = true; else route(true); }, 300); };
// as alterações feitas neste separador já foram desenhadas pela própria vista
onChange(info => { if (info?.fromSync || info?.remote) externalChange(); });
main.addEventListener('focusout', () => setTimeout(() => { if (stale && !editing()) route(true); }, 50));

// Estado da sincronização no topo
onSync(s => {
  const b = $('#sync');
  b.dataset.s = s.status;
  b.querySelector('span').textContent = {ok: 'Sincronizado', busy: 'A sincronizar', err: 'Offline', off: 'Só neste aparelho'}[s.status];
  b.title = s.msg;
});
$('#sync').onclick = async () => { const c = await db.meta('sync'); if (c?.url) syncNow(); else location.hash = '#/mais'; };

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(reg => {
    // procura versão nova ao abrir e sempre que a app volta ao ecrã
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(e => console.warn('SW', e));
  // versão nova ativa: recarrega já, exceto a meio do Ao vivo (aí recarrega ao sair desse ecrã)
  let had = !!navigator.serviceWorker.controller, pend = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) { had = true; return; }
    if (location.hash.startsWith('#/aovivo')) pend = true; else location.reload();
  });
  addEventListener('hashchange', () => { if (pend && !location.hash.startsWith('#/aovivo')) location.reload(); });
}
try { navigator.storage?.persist?.(); } catch (e) {}

finishLogin().finally(() => { route(); startAutoSync(); });
