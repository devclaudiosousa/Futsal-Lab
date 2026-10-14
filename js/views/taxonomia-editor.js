// Editor da taxonomia do marcador (Mais → Eventos e lances). Fica sincronizado entre aparelhos.
import * as TAX from '../taxonomia.js';
import {esc, toast} from '../ui.js';

export async function renderTaxonomia(el) {
  let def = structuredClone(await TAX.carregar());
  def.tipos ||= {}; def.extras ||= []; def.rapidas ||= [...TAX.RAPIDAS_BASE];

  const keyOpts = cur => `<option value="">—</option>` + TAX.LETRAS.filter(l => !TAX.RESERVADAS.includes(l)).map(l => `<option${l === cur ? ' selected' : ''}>${l}</option>`).join('');
  const draw = () => {
    const {TODOS, RAPIDAS} = TAX.aplicar(def);
    const erros = TAX.validar(def);
    el.innerHTML = `
      <p class="small muted">Nomes e teclas dos eventos do Vídeo. Os eventos de base contam nas estatísticas (remates, golos, faltas…); os novos aparecem na marcação, no CSV, no Excel e nos clips. Teclas de comando reservadas: ${TAX.RESERVADAS.join(' ')}.</p>
      <div class="tw"><table class="taxtab"><thead><tr><th>Evento</th><th>Botão</th><th>Tecla</th><th>Zonas</th><th>Ativo</th><th></th></tr></thead><tbody>
      ${TODOS.map(t => `<tr data-id="${t.id}">
        <td><input data-f="label" value="${esc(t.label)}" maxlength="30" aria-label="Nome"></td>
        <td><input data-f="short" value="${esc(t.short || '')}" maxlength="14" aria-label="Nome curto do botão"></td>
        <td><select data-f="key" aria-label="Tecla">${keyOpts(t.key)}</select></td>
        <td class="small muted">${t.extra ? `<select data-f="zonas"><option value="">—</option><option value="remate"${def.extras.find(x => x.id === t.id)?.zonas === 'remate' ? ' selected' : ''}>D10M/F10M</option><option value="campo"${def.extras.find(x => x.id === t.id)?.zonas === 'campo' ? ' selected' : ''}>MD/MO</option></select>` : (t.zonas || []).map(z => TAX.ZONAS[z].short).join('/')}</td>
        <td><input type="checkbox" data-f="ativo" ${t.ativo !== false ? 'checked' : ''} aria-label="Ativo"></td>
        <td>${t.extra ? '<button class="ghost danger" data-rm title="Apagar evento">✕</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row"><input id="newEv" placeholder="Novo evento, ex.: Duelo ganho" maxlength="30" style="flex:1"><button id="addEv">Juntar evento</button></div>
      <h2 style="margin-top:8px">Descrições rápidas de lances (Shift+1…9)</h2>
      <div class="fields">${RAPIDAS.map((r, i) => `<label class="f"><span>${i + 1}</span><input data-rap="${i}" value="${esc(r)}" maxlength="40"></label>`).join('')}</div>
      ${erros.length ? `<div class="banner">${erros.map(esc).join('<br>')}</div>` : ''}
      <div class="row"><button class="primary" id="saveTax" ${erros.length ? 'disabled' : ''}>Guardar</button><button class="ghost" id="resetTax">Repor os de origem</button></div>
      <p class="small muted">O Vídeo aplica as mudanças da próxima vez que abrir.</p>`;
    wire();
  };
  const upd = (id, f, v) => {
    const ex = def.extras.find(x => x.id === id);
    if (ex) { if (f === 'zonas') ex.zonas = v || undefined; else ex[f] = v; }
    else def.tipos[id] = {...def.tipos[id], [f]: v};
  };
  const wire = () => {
    el.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      tr.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { upd(id, i.dataset.f, i.type === 'checkbox' ? i.checked : i.value.trim()); draw(); });
      const rm = tr.querySelector('[data-rm]'); if (rm) rm.onclick = () => { def.extras = def.extras.filter(x => x.id !== id); draw(); };
    });
    el.querySelectorAll('[data-rap]').forEach(i => i.onchange = () => { def.rapidas[+i.dataset.rap] = i.value.trim(); });
    el.querySelector('#addEv').onclick = () => {
      const label = el.querySelector('#newEv').value.trim(); if (!label) return;
      let id = TAX.slugExtra(label); while (TAX.aplicar(def).TODOS.some(t => t.id === id)) id += '_';
      const usadas = new Set(TAX.aplicar(def).TYPES.map(t => t.key));
      const key = TAX.LETRAS.find(l => !TAX.RESERVADAS.includes(l) && !usadas.has(l)) || '';
      def.extras.push({id, label, short: label.slice(0, 14), key});
      draw();
    };
    el.querySelector('#saveTax').onclick = async () => { def = await TAX.guardar(def); toast('Eventos guardados'); draw(); };
    el.querySelector('#resetTax').onclick = () => { if (confirm('Repor nomes, teclas e descrições de origem? Os eventos novos são apagados.')) { def = {...def, tipos: {}, extras: [], rapidas: [...TAX.RAPIDAS_BASE]}; draw(); } };
  };
  draw();
}
