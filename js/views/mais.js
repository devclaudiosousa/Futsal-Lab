import {db, STORES, setConfig} from '../db.js';
import {esc, toast, download, today} from '../ui.js';
import {syncCfg, saveSyncCfg, ping, syncNow, onSync, loginOneDrive, logoutOneDrive, oneDriveSignedIn, oneDriveRedirectUri} from '../sync.js';
import {copy} from '../ui.js';
import {config} from '../data.js';
import {apagarExemplos} from '../exemplos.js';
import {importarMarcadorAntigo, marcadorAntigoDisponivel} from '../importar.js';
import {field} from './common.js';
import {renderTaxonomia} from './taxonomia-editor.js';

const tema = () => { try { return localStorage.getItem('tema') || 'auto'; } catch (e) { return 'auto'; } };

export async function render(main, params, ctx) {
  ctx.title('Mais');
  const [cfg, sc] = await Promise.all([config(), syncCfg()]);
  const counts = {};
  for (const s of STORES) counts[s] = (await db.all(s)).length;
  const nEx = (await Promise.all(STORES.map(s => db.all(s)))).flat().filter(r => r.exemplo).length;
  const antigo = marcadorAntigoDisponivel();
  const sameOrigin = location.protocol.startsWith('http') ? location.origin : '';

  main.innerHTML = `
    <section class="panel"><h2>Equipa</h2><div class="fields">
      ${field('clube', 'Nome da equipa', cfg.clube, 'maxlength="30" placeholder="ADRC Casa da Ribeira"')}
      ${field('epoca', 'Época', cfg.epoca, 'maxlength="12" placeholder="2026/27"')}
    </div></section>

    <section class="panel"><h2>Aspeto</h2>
      <div class="seg" role="group" aria-label="Tema">${[['auto', 'Automático'], ['light', 'Dia'], ['dark', 'Noite']].map(([v, l]) => `<button data-tema="${v}" aria-pressed="${tema() === v}">${l}</button>`).join('')}</div>
      <p class="small muted">Dia: fundo branco. Noite: fundo preto. Automático segue o modo claro/escuro do aparelho. Fica guardado só neste aparelho.</p>
    </section>

    <section class="panel"><h2>Sincronização</h2>
      <p class="muted">Tudo fica guardado neste aparelho e funciona sem rede. A sincronização passa as alterações para os outros aparelhos quando há ligação.</p>
      <div class="seg" role="group" aria-label="Onde sincronizar"><button data-prov="onedrive" aria-pressed="${sc.provider === 'onedrive'}">OneDrive</button><button data-prov="server" aria-pressed="${sc.provider === 'server'}">Servidor próprio</button></div>
      ${sc.provider === 'onedrive' ? `
        <div class="fields">${field('odcid', 'ID da aplicação (Microsoft Entra)', sc.clientId || '', 'autocomplete="off" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000"', true)}</div>
        <p class="small muted">Endereço de redirecionamento a registar no Entra (tipo "Aplicação de página única"): <code class="mono" id="redir">${esc(oneDriveRedirectUri())}</code> <button class="ghost" id="copyRedir" style="min-height:28px;padding:2px 8px">Copiar</button></p>
        <div class="row">${oneDriveSignedIn() ? '<button class="primary" id="snow">Sincronizar agora</button><button class="ghost" id="odout">Sair da conta</button>' : '<button class="primary" id="odin">Guardar e entrar na conta Microsoft</button>'}</div>
        <p class="small muted">Os dados ficam no teu OneDrive em Aplicações › (o nome com que registaste a app no Entra) › data. A Microsoft pede para voltar a entrar ao fim de 24 h; até lá, e depois, nada se perde.</p>`
      : `
        <div class="fields">
          ${field('surl', 'Endereço do servidor', sc.url || '', `type="url" inputmode="url" placeholder="${sameOrigin || 'https://servidor.tailnet.ts.net'}"`, true)}
          ${field('stok', 'Código de acesso', sc.token || '', 'type="password" autocomplete="off"', true)}
        </div>
        <div class="row">${sameOrigin && !sc.url ? '<button id="useHere">Usar este endereço</button>' : ''}<button class="primary" id="stest">Guardar e ligar</button><button id="snow" ${sc.url ? '' : 'disabled'}>Sincronizar agora</button>${sc.url ? '<button class="ghost" id="soff">Desligar</button>' : ''}</div>`}
      <p class="small" id="smsg" aria-live="polite"></p>
      <p class="small muted">Conflitos: por registo, fica a versão alterada mais recentemente. Evita editar o mesmo jogo em dois aparelhos ao mesmo tempo.</p>
    </section>

    <details class="panel" id="taxDet"><summary><h2 style="display:inline">Eventos e lances do Vídeo</h2></summary><div id="taxBox" class="stack"></div></details>

    <section class="panel"><h2>Cópia de segurança</h2>
      <p class="muted">${counts.atletas} atletas · ${counts.exercicios} exercícios · ${counts.treinos} treinos · ${counts.jogos} jogos neste aparelho.</p>
      <div class="row"><button id="exp">Guardar cópia (JSON)</button><label class="btn" for="imp">Abrir cópia<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    </section>

    ${antigo ? `<section class="panel"><h2>Marcador de vídeo antigo</h2>
      <p class="muted">Encontrei ${antigo.jogos} jogo${antigo.jogos === 1 ? '' : 's'} guardado${antigo.jogos === 1 ? '' : 's'} pelo marcador de vídeo antigo neste browser${antigo.plantel ? ' e um plantel' : ''}.</p>
      <div class="row"><button class="primary" id="impOld">Trazer para a app</button></div></section>` : ''}

    ${nEx ? `<section class="panel"><h2>Exemplos</h2><p class="muted">${nEx} registos de exemplo.</p><div class="row"><button class="danger" id="delEx">Apagar exemplos</button></div></section>` : ''}

    <section class="panel"><h2>Instalar</h2>
      <p class="muted">No Android, abre o menu do Chrome e escolhe <b>Adicionar ao ecrã principal</b>. A app abre sem barra do browser e funciona sem rede depois de aberta uma vez.</p>
      <p class="small muted">Os dados ficam no browser deste aparelho. Limpar os dados do site apaga-os; mantém a sincronização ligada ou guarda cópias.</p>
      <p class="small muted">Versão instalada: <b id="appVer">—</b></p>
    </section>`;
  caches?.keys?.().then(k => { const v = k.filter(x => x.startsWith('futsal-lab-')).sort().pop(); const el = main.querySelector('#appVer'); if (el && v) el.textContent = v.replace('futsal-lab-', ''); }).catch(() => {});

  main.querySelectorAll('[data-tema]').forEach(b => b.onclick = () => {
    const v = b.dataset.tema;
    try { if (v === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', v); } catch (e) {}
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
    main.querySelectorAll('[data-tema]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  const saveCfg = async () => { await setConfig({clube: main.querySelector('#clube').value.trim() || 'Nós', epoca: main.querySelector('#epoca').value.trim()}); };
  ['clube', 'epoca'].forEach(k => main.querySelector('#' + k).onchange = saveCfg);

  const msg = main.querySelector('#smsg');
  const off = onSync(s => { msg.textContent = s.msg; msg.style.color = s.status === 'err' ? 'var(--crit)' : s.status === 'ok' ? 'var(--ok)' : 'var(--muted)'; });
  const uh = main.querySelector('#useHere'); if (uh) uh.onclick = () => { main.querySelector('#surl').value = sameOrigin; };
  main.querySelectorAll('[data-prov]').forEach(b => b.onclick = async () => { await saveSyncCfg({provider: b.dataset.prov}); ctx.rerender(); });
  const odin = main.querySelector('#odin');
  if (odin) odin.onclick = async () => {
    const id = main.querySelector('#odcid').value.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) { msg.textContent = 'O ID da aplicação tem o formato 00000000-0000-0000-0000-000000000000.'; msg.style.color = 'var(--crit)'; return; }
    await saveSyncCfg({clientId: id, provider: 'onedrive'});
    try { await loginOneDrive(); } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--crit)'; }
  };
  const cid = main.querySelector('#odcid'); if (cid && oneDriveSignedIn()) cid.onchange = () => saveSyncCfg({clientId: cid.value.trim()});
  const odout = main.querySelector('#odout'); if (odout) odout.onclick = async () => { await logoutOneDrive(); ctx.rerender(); };
  const cr = main.querySelector('#copyRedir'); if (cr) cr.onclick = async () => toast(await copy(oneDriveRedirectUri()) ? 'Copiado' : 'Não deu para copiar');
  const st = main.querySelector('#stest');
  if (st) st.onclick = async () => {
    const url = main.querySelector('#surl').value.trim().replace(/\/+$/, ''), token = main.querySelector('#stok').value.trim();
    if (!url || !token) { msg.textContent = 'Preenche o endereço e o código.'; return; }
    if (location.protocol === 'https:' && url.startsWith('http:')) { msg.textContent = 'A app está em https e o servidor em http: o browser bloqueia. Usa o endereço https do servidor (Tailscale ou proxy).'; msg.style.color = 'var(--crit)'; return; }
    msg.textContent = 'A ligar…'; msg.style.color = 'var(--muted)';
    try {
      const r = await ping(url, token);
      await saveSyncCfg({url, token, rev: sc.url === url ? sc.rev : 0});
      msg.textContent = `Ligado. O servidor tem ${r.records} registos.`;
      await syncNow(); ctx.rerender();
    } catch (e) { msg.textContent = (e.message === 'Failed to fetch' ? 'Não consegui chegar ao servidor. Confirma o endereço e se está a correr.' : e.message); msg.style.color = 'var(--crit)'; }
  };
  const sn = main.querySelector('#snow'); if (sn) sn.onclick = () => syncNow();
  const so = main.querySelector('#soff'); if (so) so.onclick = async () => { await saveSyncCfg({url: '', token: '', rev: 0}); await syncNow(); toast('Sincronização desligada'); ctx.rerender(); };

  main.querySelector('#taxDet').ontoggle = e => { if (e.target.open && !main.querySelector('#taxBox').childElementCount) renderTaxonomia(main.querySelector('#taxBox')); };
  main.querySelector('#exp').onclick = async () => { download(`futsal-lab-${today()}.json`, JSON.stringify(await db.exportAll())); toast('Cópia guardada'); };
  main.querySelector('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await db.importAll(JSON.parse(await f.text())); toast(`${n} registos importados`); ctx.rerender(); }
    catch (err) { toast('Esse ficheiro não é uma cópia do Futsal Lab'); }
  };
  const io = main.querySelector('#impOld'); if (io) io.onclick = async () => { const r = await importarMarcadorAntigo(); toast(`${r.jogos} jogos e ${r.atletas} atletas importados`); ctx.rerender(); };
  const de = main.querySelector('#delEx'); if (de) de.onclick = async () => { const n = await apagarExemplos(); toast(`${n} exemplos apagados`); ctx.rerender(); };
  void esc;
  return off;
}
