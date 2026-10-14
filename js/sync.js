// Sincronização entre aparelhos. A app trabalha sempre no IndexedDB; isto só troca alterações.
// Fornecedores: 'onedrive' (por defeito, sem servidor) e 'server' (o servidor próprio em server/sync_server.py,
// para quando houver uma máquina sempre ligada). Mudar de um para o outro não mexe no resto da app.
// Conflitos: por registo, fica a versão com updatedAt mais recente.
import {db, STORES, onChange, uid} from './db.js';
import * as od from './sync/onedrive.js';

const state = {status: 'off', msg: 'Só neste aparelho', last: 0};
const subs = new Set();
export function onSync(fn) { subs.add(fn); fn(state); return () => subs.delete(fn); }
function set(status, msg) { Object.assign(state, {status, msg}); subs.forEach(f => f(state)); }

export async function syncCfg() {
  const c = await db.meta('sync') || {};
  if (!c.device) { c.device = uid(); await db.meta('sync', c); }
  if (!c.provider) c.provider = c.url ? 'server' : 'onedrive';   // instalações antigas do Banco usavam o servidor
  return c;
}
export async function saveSyncCfg(patch) {
  const c = {...await syncCfg(), ...patch};
  await db.meta('sync', c);
  return c;
}

// ---------- fornecedores

const providers = {
  onedrive: {
    ready: c => !!c.clientId && od.signedIn(),
    off: c => !c.clientId ? 'OneDrive por configurar' : 'Entra na conta Microsoft para sincronizar',
    async exchange(c, changes) {
      const drive = od.makeDrive({getToken: () => od.accessToken(c)});
      const out = await od.exchange(drive, {stores: STORES, changes, index: c.odIndex || {}});
      return {incoming: out.incoming, sent: out.sent, patch: {odIndex: out.index}};
    },
  },
  server: {
    ready: c => !!(c.url && c.token),
    off: () => 'Servidor por configurar',
    async exchange(c, changes) {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 20000);
      try {
        const res = await fetch(c.url.replace(/\/+$/, '') + '/api/sync', {
          method: 'POST', signal: ctl.signal, cache: 'no-store',
          headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + c.token},
          body: JSON.stringify({since: c.rev || 0, device: c.device, changes}),
        });
        if (res.status === 401) throw new Error('Código de acesso errado');
        if (!res.ok) throw new Error('Servidor respondeu ' + res.status);
        const out = await res.json();
        return {incoming: out.changes || [], sent: changes, patch: {rev: out.rev}};
      } finally { clearTimeout(to); }
    },
  },
};

export async function ping(url, token) {
  const r = await fetch(url.replace(/\/+$/, '') + '/api/ping', {headers: {Authorization: 'Bearer ' + token}, cache: 'no-store'});
  if (r.status === 401) throw new Error('Código de acesso errado');
  if (!r.ok) throw new Error('O servidor respondeu ' + r.status);
  return r.json();
}

// Volta do login da Microsoft (o URL traz ?code=…). Chamado uma vez no arranque.
export async function finishLogin() {
  const c = await syncCfg();
  try {
    const tok = await od.handleRedirect(c);
    if (tok) { await saveSyncCfg({provider: 'onedrive'}); set('busy', 'Ligado ao OneDrive. A sincronizar…'); return true; }
  } catch (e) { set('err', e.message); }
  return false;
}
export const loginOneDrive = async () => od.login(await syncCfg());
export const logoutOneDrive = async () => { od.logout(); await saveSyncCfg({odIndex: {}}); set('off', 'Saíste da conta Microsoft'); };
export const oneDriveSignedIn = () => od.signedIn();
// Grava um ficheiro (ex.: Excel da época) em Aplicações/<app>/exportacoes/ quando o OneDrive está ligado
export async function guardarNoOneDrive(nome, blob, type) {
  const c = await syncCfg();
  if (c.provider !== 'onedrive' || !providers.onedrive.ready(c) || !navigator.onLine) return null;
  return od.makeDrive({getToken: () => od.accessToken(c)}).uploadFile('exportacoes/' + nome, blob, type);
}
export const oneDriveRedirectUri = () => od.redirectUri();

// ---------- troca

let pending = null;
export function syncNow() {
  if (pending) return pending;
  pending = doSync().finally(() => { pending = null; });
  return pending;
}
async function doSync() {
  const c = await syncCfg();
  const p = providers[c.provider];
  if (!p || !p.ready(c)) { set('off', p ? p.off(c) : 'Só neste aparelho'); return {skipped: true}; }
  if (!navigator.onLine) { set('err', 'Sem rede · fica guardado neste aparelho'); return {offline: true}; }
  set('busy', 'A sincronizar…');
  try {
    const changes = [];
    for (const s of STORES) for (const r of await db.allRaw(s)) if (r._dirty) { const {_dirty, ...rec} = r; changes.push({store: s, rec}); }
    const out = await p.exchange(c, changes);
    let got = 0;
    for (const {store, rec} of out.incoming) {
      if (!STORES.includes(store) || !rec?.id) continue;
      const cur = await db.getRaw(store, rec.id);
      if (!cur || rec.updatedAt > cur.updatedAt || (rec.updatedAt === cur.updatedAt && !cur._dirty)) {
        if (!cur || rec.updatedAt !== cur.updatedAt) got++;
        await db.putRaw(store, rec);
      }
    }
    for (const {store, rec} of out.sent) await db.clearDirty(store, rec.id, rec.updatedAt);
    await saveSyncCfg({...out.patch, last: Date.now()});
    state.last = Date.now();
    if (got) db.emit({store: '*', fromSync: true});
    const where = c.provider === 'onedrive' ? 'OneDrive' : 'servidor';
    set('ok', `Sincronizado com o ${where} às ${new Date().toTimeString().slice(0, 5)}` + (out.sent.length || got ? ` · ${out.sent.length} enviados, ${got} recebidos` : ''));
    return {sent: out.sent.length, got};
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Servidor não respondeu' : e.message === 'Failed to fetch' ? 'Sem ligação' : e.message;
    set(e.auth ? 'off' : 'err', msg + ' · fica guardado neste aparelho');
    return {error: e};
  }
}

// Sincroniza ao abrir, ao voltar a ter rede, 5 s depois de cada alteração e de 2 em 2 minutos com a app visível
let debounce = null;
export function startAutoSync() {
  syncNow();
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  onChange(info => {
    if (info?.fromSync || info?.remote) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, 5000);
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 120000);
}
