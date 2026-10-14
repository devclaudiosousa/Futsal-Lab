// Sincronização pelo OneDrive pessoal (Microsoft Graph), sem servidor próprio.
//
// Login: OAuth 2.0 com PKCE, como aplicação de página única (SPA) registada no Microsoft Entra.
// Só pede acesso à pasta da app (Files.ReadWrite.AppFolder): no OneDrive aparece em Aplicações/<nome da app>.
// Nota: para SPAs a Microsoft limita o refresh token a 24 h. Quando expira, a app continua a gravar no
// aparelho e pede para voltar a entrar (normalmente é só um toque, sem palavra-passe).
//
// Ficheiros: data/<store>/<id>.json, um por registo (atleta, exercício, treino, jogo).
// Conflitos: por registo, fica o que tiver updatedAt mais recente — o mesmo que o servidor do Banco fazia.

const AUTH = 'https://login.microsoftonline.com';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'Files.ReadWrite.AppFolder offline_access';
const K = {pkce: 'od:pkce', tok: 'od:token'};

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const ls = {get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};

export const redirectUri = () => location.origin + location.pathname.replace(/[^/]*$/, '');

// ---------- login

export async function login(cfg) {
  if (!cfg.clientId) throw new Error('Falta o ID da aplicação (Mais → Sincronização).');
  const verifier = rnd(48), state = rnd(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  ls.set(K.pkce, {verifier, state, back: location.hash || '#/mais'});
  const q = new URLSearchParams({client_id: cfg.clientId, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPE,
    code_challenge: challenge, code_challenge_method: 'S256', state, response_mode: 'query', prompt: 'select_account'});
  location.assign(`${AUTH}/${cfg.tenant || 'consumers'}/oauth2/v2.0/authorize?${q}`);
}

// Chamado no arranque da app: se voltámos do login com ?code=, troca-o por tokens.
export async function handleRedirect(cfg) {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const pk = ls.get(K.pkce);
  ls.set(K.pkce, null);
  const clean = () => history.replaceState(null, '', location.pathname + (pk?.back || '#/mais'));
  if (q.has('error')) { clean(); throw new Error(q.get('error_description') || q.get('error')); }
  if (!pk || q.get('state') !== pk.state) { clean(); throw new Error('Resposta de login inesperada. Tenta outra vez.'); }
  const tok = await tokenRequest(cfg, {grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: pk.verifier});
  clean();
  return tok;
}

async function tokenRequest(cfg, params) {
  const r = await fetch(`${AUTH}/${cfg.tenant || 'consumers'}/oauth2/v2.0/token`, {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: cfg.clientId, scope: SCOPE, ...params}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error_description?.split('\r\n')[0] || `Login falhou (${r.status})`);
    e.auth = true; throw e;
  }
  const tok = {access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000};
  ls.set(K.tok, tok);
  return tok;
}

export function signedIn() { return !!ls.get(K.tok)?.refresh; }
export function logout() { ls.set(K.tok, null); }

export async function accessToken(cfg) {
  const t = ls.get(K.tok);
  if (!t) { const e = new Error('Entra na conta Microsoft para sincronizar.'); e.auth = true; throw e; }
  if (t.access && t.exp > Date.now()) return t.access;
  try { return (await tokenRequest(cfg, {grant_type: 'refresh_token', refresh_token: t.refresh})).access; }
  catch (e) { if (e.auth) { ls.set(K.tok, null); e.message = 'A sessão Microsoft expirou. Volta a entrar para sincronizar.'; } throw e; }
}

// ---------- ficheiros (independente do login, para se poder testar com um Graph falso)

export function makeDrive({getToken, fetchFn = (...a) => fetch(...a), base = GRAPH}) {
  async function call(method, path, body, headers = {}, retry = true) {
    const r = await fetchFn(path.startsWith('http') ? path : base + path, {method, body,
      headers: {Authorization: 'Bearer ' + await getToken(), ...headers}});
    if ((r.status === 429 || r.status === 503) && retry) {
      await new Promise(res => setTimeout(res, Math.min(30, +(r.headers.get('Retry-After') || 2)) * 1000));
      return call(method, path, body, headers, false);
    }
    if (r.status === 401) { const e = new Error('A sessão Microsoft expirou. Volta a entrar para sincronizar.'); e.auth = true; throw e; }
    return r;
  }
  return {
    // Lista os ficheiros de data/<store>/ → [{name, eTag, url}]
    async list(store) {
      const out = [];
      let next = `/me/drive/special/approot:/data/${store}:/children?$top=999`;
      while (next) {
        const r = await call('GET', next);
        if (r.status === 404) return out;            // pasta ainda não existe
        if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} ao listar ${store}`);
        const j = await r.json();
        for (const it of j.value || []) if (it.file && it.name.endsWith('.json')) out.push({name: it.name, eTag: it.eTag, url: it['@microsoft.graph.downloadUrl']});
        next = j['@odata.nextLink'] || null;
      }
      return out;
    },
    async download(item) {
      // o downloadUrl já traz autorização e não aceita o cabeçalho Authorization
      const r = await fetchFn(item.url);
      if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} a descarregar ${item.name}`);
      return r.json();
    },
    async uploadFile(path, blob, type) {
      const r = await call('PUT', `/me/drive/special/approot:/${path.split('/').map(encodeURIComponent).join('/')}:/content`, blob, {'Content-Type': type});
      if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} a gravar ${path}`);
      return (await r.json()).webUrl;
    },
    async upload(store, rec) {
      const r = await call('PUT', `/me/drive/special/approot:/data/${store}/${encodeURIComponent(rec.id)}.json:/content`,
        JSON.stringify(rec), {'Content-Type': 'application/json'});
      if (!r.ok) throw new Error(`OneDrive respondeu ${r.status} a gravar ${store}/${rec.id}`);
      return (await r.json()).eTag;
    },
  };
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// Troca de alterações. index = {"store/id": eTag} do que já se conhece do OneDrive (guardado entre sincronizações).
// changes = registos locais por enviar. Devolve {incoming, index}.
export async function exchange(drive, {stores, changes, index = {}}) {
  index = {...index};
  const incoming = [];
  const remoteUpd = {};
  for (const store of stores) {
    const items = await drive.list(store);
    const fresh = items.filter(it => index[`${store}/${it.name.slice(0, -5)}`] !== it.eTag);
    const recs = await pool(fresh, 6, it => drive.download(it).catch(() => null));
    fresh.forEach((it, k) => {
      const rec = recs[k];
      if (!rec?.id) return;
      index[`${store}/${rec.id}`] = it.eTag;
      remoteUpd[`${store}/${rec.id}`] = rec.updatedAt || 0;
      incoming.push({store, rec});
    });
  }
  // Envia só o que é mais recente do que a versão que acabou de chegar (senão ganha a remota)
  const toSend = changes.filter(({store, rec}) => !((remoteUpd[`${store}/${rec.id}`] || 0) > (rec.updatedAt || 0)));
  const sent = [];
  await pool(toSend, 4, async c => { index[`${c.store}/${c.rec.id}`] = await drive.upload(c.store, c.rec); sent.push(c); });
  return {incoming, index, sent};
}
