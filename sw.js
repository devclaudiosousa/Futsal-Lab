// Funciona sem rede: guarda a app em cache e serve-a da cache; atualiza em segundo plano.
// Uma versão nova (VERSION diferente) instala-se sozinha e a página recarrega (ver app.js).
const VERSION = 'futsal-lab-v20';
const SHELL = [
  './', 'index.html', 'marcador.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/sync.js', 'js/sync/onedrive.js', 'js/live/engine.js', 'js/live/excel.js', 'js/views/aovivo.js', 'js/ui.js', 'js/data.js', 'js/stats.js', 'js/prancheta.js', 'js/exemplos.js', 'js/importar.js', 'js/importar-excel.js', 'js/importar-cs.js', 'js/importar-tempos.js', 'js/xlsx-lite.js', 'js/xlsx-livro.js', 'js/epoca-livro.js', 'js/epoca-excel.js', 'js/taxonomia.js', 'js/views/taxonomia-editor.js', 'js/marcador/main.js', 'js/marcador/player.js', 'js/marcador/acerto.js', 'css/marcador.css',
  'js/views/common.js', 'js/views/hoje.js', 'js/views/epoca.js', 'js/views/treino.js', 'js/views/campo.js', 'js/views/jogo.js', 'js/views/jogo-manual.js',
  'js/views/plantel.js', 'js/views/atleta.js', 'js/views/caderno.js', 'js/views/exercicio.js', 'js/views/mais.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

// cache: 'reload' para não aproveitar ficheiros velhos da cache HTTP do browser (o GitHub Pages guarda 10 min)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.includes('/api/')) return;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const key = url.origin === location.origin ? new Request(url.origin + url.pathname) : req;   // ignora ?jogo=… na cache
    const hit = await cache.match(key);
    const net = fetch(url.origin === location.origin ? new Request(url.href, {cache: 'no-cache'}) : req).then(res => { if (res.ok || res.type === 'opaque') cache.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match(new Request(new URL('index.html', self.registration.scope)))) || Response.error();
    return Response.error();
  }));
});
