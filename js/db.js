// Armazenamento local (IndexedDB). Cada registo tem id, updatedAt e, quando apagado, deleted:true (lápide para a sincronização).
// _dirty marca o que ainda não foi enviado ao servidor.
const DB_NAME = 'banco-futsal';
const VERSION = 2;
// definicoes: registos da equipa partilhados entre aparelhos (taxonomia do marcador, presets das situações)
export const STORES = ['atletas', 'exercicios', 'treinos', 'jogos', 'definicoes'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, {keyPath: 'id'});
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Base de dados bloqueada por outro separador'));
  });
  return dbp;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    let out;
    Promise.resolve(fn(t.objectStore(store))).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export function uid() {
  try { return crypto.randomUUID(); } catch (e) {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

// Avisa os outros separadores (app ↔ marcador) e a própria página
const chan = (() => { try { return new BroadcastChannel('banco-futsal'); } catch (e) { return null; } })();
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(info, remote = false) {
  listeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
  if (!remote && chan) try { chan.postMessage(info); } catch (e) {}
}
if (chan) chan.onmessage = e => emit({...e.data, remote: true}, true);

// Relógio monotónico: dois registos gravados no mesmo milissegundo não empatam
let lastTs = 0;
const stamp = () => (lastTs = Math.max(Date.now(), lastTs + 1));

export const db = {
  async all(store) {
    const rows = await tx(store, 'readonly', s => req(s.getAll()));
    return rows.filter(r => !r.deleted);
  },
  async allRaw(store) { return tx(store, 'readonly', s => req(s.getAll())); },
  async get(store, id) {
    if (!id) return null;
    const r = await tx(store, 'readonly', s => req(s.get(id)));
    return r && !r.deleted ? r : null;
  },
  async getRaw(store, id) { return tx(store, 'readonly', s => req(s.get(id))); },
  async put(store, obj) {
    const rec = {...obj, id: obj.id || uid(), updatedAt: stamp(), _dirty: 1};
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    await tx(store, 'readwrite', s => req(s.put(rec)));
    emit({store, id: rec.id});
    return rec;
  },
  async del(store, id) {
    const old = await tx(store, 'readonly', s => req(s.get(id)));
    if (!old) return;
    const rec = {id, deleted: true, updatedAt: stamp(), _dirty: 1};
    await tx(store, 'readwrite', s => req(s.put(rec)));
    emit({store, id, deleted: true});
  },
  // Escrita vinda da sincronização: não fica "suja" e não mexe no updatedAt
  async putRaw(store, rec) {
    await tx(store, 'readwrite', s => req(s.put(rec)));
  },
  async clearDirty(store, id, updatedAt) {
    await tx(store, 'readwrite', async s => {
      const r = await req(s.get(id));
      if (r && r.updatedAt === updatedAt && r._dirty) { delete r._dirty; await req(s.put(r)); }
    });
  },
  async meta(key, val) {
    if (val === undefined) return tx('meta', 'readonly', s => req(s.get(key)));
    await tx('meta', 'readwrite', s => req(s.put(val, key)));
    return val;
  },
  emit,
  async exportAll() {
    const out = {app: 'futsal-lab', v: 1, exportedAt: new Date().toISOString()};
    for (const s of STORES) out[s] = (await this.allRaw(s)).map(({_dirty, ...r}) => r);
    out.config = await this.meta('config') || {};
    return out;
  },
  // Importa um backup: fica o mais recente de cada registo
  async importAll(data) {
    let n = 0;
    for (const s of STORES) {
      for (const rec of data[s] || []) {
        if (!rec?.id) continue;
        const cur = await this.getRaw(s, rec.id);
        if (!cur || (rec.updatedAt || 0) > (cur.updatedAt || 0)) { await this.putRaw(s, {...rec, _dirty: 1}); n++; }
      }
    }
    if (data.config && !(await this.meta('config'))) await this.meta('config', data.config);
    emit({store: '*'});
    return n;
  },
};

// Nome da equipa e época: registo "equipa" do armazém sincronizado (antes ficava só no aparelho, em meta)
export async function config() {
  let eq = null;
  try { eq = await db.get('definicoes', 'equipa'); } catch (e) {}
  const {id, createdAt, updatedAt, _dirty, ...rest} = eq || {};
  return {clube: 'Nós', ...(await db.meta('config') || {}), ...rest};
}
export async function setConfig(patch) {
  const {clube, epoca} = {...await config(), ...patch};
  return db.put('definicoes', {...(await db.get('definicoes', 'equipa') || {}), id: 'equipa', clube, epoca: epoca || ''});
}
