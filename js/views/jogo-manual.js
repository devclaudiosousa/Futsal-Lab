// Estatística escrita à mão, para jogos sem Ao vivo nem Vídeo (jogos antigos):
// golos marcados/sofridos com marcador, assistência e os 5 em campo, e por atleta cartões e faltas MD/MO.
// Guarda em j.manual = {golos: [{id, nos, parte, min, by, ast, on: [GR, c1, c2, c3, c4]}], atletas: {id: {am, verm, fcMD, fcMO}}}
import {esc} from '../ui.js';

let form = null;   // golo em edição: {id?, nos, parte, min, by, ast, on}

const nome = a => `${a.num ? a.num + ' ' : ''}${(a.nome || '').trim().split(/\s+/).slice(-1)[0] || ''}`;

export function manualHtml(j, lista, {soCartoes}) {
  const byId = Object.fromEntries(lista.map(a => [a.id, a]));
  const man = j.manual || {}, golos = man.golos || [], at = man.atletas || {};
  const n = id => (byId[id] ? esc(nome(byId[id])) : '–');
  const gm = golos.filter(g => g.nos).length, gs = golos.length - gm;
  const pm = {};
  for (const g of golos) {
    if (g.nos) { if (g.by) pm[g.by] = (pm[g.by] || 0) + 1; if (g.ast) pm[g.ast] = (pm[g.ast] || 0) + 1; }
    else for (const id of g.on || []) if (id) pm[id] = (pm[id] || 0) - 1;
  }
  const num = (id, k) => `<input type="number" min="0" max="${k === 'am' ? 2 : k === 'verm' ? 1 : 30}" inputmode="numeric" data-mst="${id}" data-k="${k}" value="${+at[id]?.[k] || ''}" placeholder="0" style="width:56px;min-height:34px;padding:4px">`;
  return `<details class="panel" id="mstDet"${form ? ' open' : ''}><summary><h2 style="display:inline">Estatística à mão</h2> <span class="small muted">${soCartoes ? 'cartões' : `${gm}:${gs} em golos`}</span></summary>
    <p class="small muted">${soCartoes ? 'Este jogo tem Ao vivo ou Vídeo: daqui só contam os cartões (o Ao vivo não os marca).' : 'Para jogos sem Ao vivo nem Vídeo. Cada golo com os 5 em campo dá o +/− de cada atleta e os quartetos no Excel da época.'}</p>
    ${soCartoes ? '' : `
    <h3>Golos</h3>
    ${golos.length ? `<div class="list">${golos.map(g => `<div class="item"><span class="pill ${g.nos ? 'ok' : 'crit'}">${g.nos ? 'Marcado' : 'Sofrido'} · ${g.parte}.ª${g.min ? ' · ' + g.min + "'" : ''}</span>
      <div class="main"><b>${g.nos ? `${n(g.by)}${g.ast ? ' (ast. ' + n(g.ast) + ')' : ''}` : 'Golo do adversário'}</b><span>Em campo: ${(g.on || []).filter(Boolean).map(n).join(' · ') || '–'}</span></div>
      <button class="ghost" data-gedit="${g.id}">Editar</button></div>`).join('')}</div>` : '<p class="small muted">Sem golos.</p>'}
    ${form ? golForm(form, lista) : `<div class="row"><button data-gnew="1">+ Golo marcado</button><button data-gnew="0">+ Golo sofrido</button></div>`}`}
    <h3>Por atleta</h3>
    <div class="tw"><table><thead><tr><th>Atleta</th>${soCartoes ? '' : '<th>+/− golos</th>'}<th>Amarelos</th><th>Vermelhos</th>${soCartoes ? '' : '<th>Faltas MD</th><th>Faltas MO</th>'}</tr></thead><tbody>
      ${lista.map(a => `<tr><td>${esc(nome(a))}</td>${soCartoes ? '' : `<td class="${pm[a.id] > 0 ? 'pos' : pm[a.id] < 0 ? 'neg' : ''}">${pm[a.id] > 0 ? '+' : ''}${pm[a.id] || 0}</td>`}<td>${num(a.id, 'am')}</td><td>${num(a.id, 'verm')}</td>${soCartoes ? '' : `<td>${num(a.id, 'fcMD')}</td><td>${num(a.id, 'fcMO')}</td>`}</tr>`).join('')}
    </tbody></table></div>
    <p class="small" id="mstMsg" aria-live="polite"></p>
  </details>`;
}

function golForm(f, lista) {
  const opt = (sel, vazio) => `<option value="">${vazio}</option>` + lista.map(a => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(nome(a))}</option>`).join('');
  const gr = f.on?.[0] || '', campo = new Set((f.on || []).slice(1).filter(Boolean));
  return `<div class="panel" style="margin:0;border:1px solid var(--line)"><b>${f.id ? 'Editar golo' : f.nos ? 'Novo golo marcado' : 'Novo golo sofrido'}</b>
    <div class="fields">
      <label class="f"><span>Golo</span><select id="gfNos"><option value="1"${f.nos ? ' selected' : ''}>Marcado</option><option value="0"${f.nos ? '' : ' selected'}>Sofrido</option></select></label>
      <label class="f"><span>Parte</span><select id="gfParte">${[1, 2, 3, 4].map(p => `<option value="${p}"${+f.parte === p ? ' selected' : ''}>${p}.ª${p > 2 ? ' (prol.)' : ''}</option>`).join('')}</select></label>
      <label class="f"><span>Minuto (opcional)</span><input id="gfMin" type="number" min="0" max="40" inputmode="numeric" value="${f.min || ''}"></label>
      ${f.nos ? `<label class="f"><span>Marcador</span><select id="gfBy">${opt(f.by, 'Não sei')}</select></label>
      <label class="f"><span>Assistência</span><select id="gfAst">${opt(f.ast, 'Sem assistência')}</select></label>` : ''}
      <label class="f"><span>GR em campo</span><select id="gfGr">${opt(gr, '—')}</select></label>
    </div>
    <span class="small muted">Os 4 de campo (${campo.size}/4):</span>
    <div class="chips">${lista.filter(a => a.id !== gr).map(a => `<button class="chip" data-gfon="${a.id}" aria-pressed="${campo.has(a.id)}">${esc(nome(a))}</button>`).join('')}</div>
    <div class="row"><button class="primary" id="gfOk">Guardar golo</button>${f.id ? '<button class="danger" id="gfDel">Apagar</button>' : ''}<button class="ghost" id="gfNo">Cancelar</button></div></div>`;
}

// liga os controlos; set(manual) grava o jogo e redesenha
export function manualWire(main, j, set, redraw) {
  const man = () => j.manual || {golos: [], atletas: {}};
  const msg = t => { const m = main.querySelector('#mstMsg'); if (m) { m.textContent = t; m.style.color = 'var(--crit)'; } };
  main.querySelectorAll('[data-mst]').forEach(inp => inp.onchange = () => {
    const m = man(), id = inp.dataset.mst, k = inp.dataset.k, v = Math.max(0, parseInt(inp.value) || 0);
    const a = {...(m.atletas?.[id] || {})};
    if (v) a[k] = v; else delete a[k];
    const atletas = {...(m.atletas || {})};
    if (Object.keys(a).length) atletas[id] = a; else delete atletas[id];
    set({...m, atletas}, false);
  });
  main.querySelectorAll('[data-gnew]').forEach(b => b.onclick = () => {
    const ult = [...(man().golos || [])].pop();
    form = {nos: b.dataset.gnew === '1', parte: ult?.parte || 1, min: '', by: '', ast: '', on: ult?.on ? [...ult.on] : []};   // começa com os 5 do golo anterior
    redraw();
  });
  main.querySelectorAll('[data-gedit]').forEach(b => b.onclick = () => { form = {...man().golos.find(g => g.id === b.dataset.gedit)}; form.on = [...(form.on || [])]; redraw(); });
  if (!form) return;
  const ler = () => {
    form.nos = main.querySelector('#gfNos').value === '1';
    form.parte = +main.querySelector('#gfParte').value;
    form.min = main.querySelector('#gfMin').value;
    form.by = main.querySelector('#gfBy')?.value || '';
    form.ast = main.querySelector('#gfAst')?.value || '';
    const gr = main.querySelector('#gfGr').value;
    form.on = [gr, ...(form.on || []).slice(1).filter(id => id && id !== gr)];
  };
  ['#gfNos', '#gfGr'].forEach(s => main.querySelector(s).onchange = () => { ler(); redraw(); });
  main.querySelectorAll('[data-gfon]').forEach(b => b.onclick = () => {
    ler();
    const c = form.on.slice(1), id = b.dataset.gfon, i = c.indexOf(id);
    if (i >= 0) c.splice(i, 1); else if (c.length < 4) c.push(id); else { msg('Já tens 4 de campo: tira um primeiro.'); return; }
    form.on = [form.on[0] || '', ...c];
    redraw();
  });
  main.querySelector('#gfNo').onclick = () => { form = null; redraw(); };
  const del = main.querySelector('#gfDel');
  if (del) del.onclick = () => { const m = man(), id = form.id; form = null; set({...m, golos: (m.golos || []).filter(g => g.id !== id)}); };
  main.querySelector('#gfOk').onclick = () => {
    ler();
    if (form.by && form.by === form.ast) { msg('O marcador e a assistência são o mesmo atleta.'); return; }
    const m = man(), g = {id: form.id || (crypto.randomUUID?.() || String(Date.now())), nos: form.nos, parte: form.parte, min: form.min ? +form.min : '',
      by: form.nos ? form.by || null : null, ast: form.nos ? form.ast || null : null, on: form.on.filter((x, i) => i === 0 || x)};
    const golos = (m.golos || []).filter(x => x.id !== g.id).concat(g).sort((a, b) => a.parte - b.parte || (+a.min || 0) - (+b.min || 0));
    form = null;
    set({...m, golos});
  };
}
export const fecharManual = () => { form = null; };

// Ajustes do treinador no pós-jogo: +1 ou −1 com descrição, por atleta (j.ajustes = [{id, atleta, v, desc}]).
// Valem em qualquer jogo (Ao vivo, Vídeo ou à mão) e entram no + e no − do Excel da época.
export function ajustesHtml(j, lista) {
  const byId = Object.fromEntries(lista.map(a => [a.id, a]));
  const aj = j.ajustes || [];
  return `<details class="panel" id="ajDet"><summary><h2 style="display:inline">Ajustes do +/−</h2> <span class="small muted">${aj.length ? `${aj.filter(a => a.v > 0).length} + · ${aj.filter(a => a.v < 0).length} −` : 'pós-jogo'}</span></summary>
    <p class="small muted">O que viste depois do jogo e a estatística não apanha: um + por uma boa transição defensiva, um − por um passe que não fez. Entram no +/− do atleta.</p>
    ${aj.length ? `<div class="list">${aj.map(a => `<div class="item"><span class="pill ${a.v > 0 ? 'ok' : 'crit'}">${a.v > 0 ? '+1' : '−1'}</span>
      <div class="main"><b>${byId[a.atleta] ? esc(nome(byId[a.atleta])) : 'Atleta removido'}</b><span>${esc(a.desc || 'sem descrição')}</span></div>
      <button class="ghost" data-ajdel="${a.id}" aria-label="Apagar ajuste">✕</button></div>`).join('')}</div>` : ''}
    <div class="fields">
      <label class="f"><span>Atleta</span><select id="ajAt"><option value="">—</option>${lista.map(a => `<option value="${a.id}">${esc(nome(a))}</option>`).join('')}</select></label>
      <label class="f"><span>Descrição</span><input id="ajDesc" maxlength="80" placeholder="ex.: boa transição defensiva"></label>
    </div>
    <div class="row"><button class="primary" data-ajadd="1">+1</button><button data-ajadd="-1">−1</button></div>
    <p class="small" id="ajMsg" aria-live="polite"></p>
  </details>`;
}
export function ajustesWire(main, j, set) {
  main.querySelectorAll('[data-ajadd]').forEach(b => b.onclick = () => {
    const at = main.querySelector('#ajAt').value, desc = main.querySelector('#ajDesc').value.trim();
    if (!at) { const m = main.querySelector('#ajMsg'); m.textContent = 'Escolhe o atleta.'; m.style.color = 'var(--crit)'; return; }
    set([...(j.ajustes || []), {id: crypto.randomUUID?.() || String(Date.now()), atleta: at, v: +b.dataset.ajadd, desc}]);
  });
  main.querySelectorAll('[data-ajdel]').forEach(b => b.onclick = () => set((j.ajustes || []).filter(a => a.id !== b.dataset.ajdel)));
}
