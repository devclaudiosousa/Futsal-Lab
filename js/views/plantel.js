import {db} from '../db.js';
import {esc, toast} from '../ui.js';
import {atletas} from '../data.js';
import {importarExcelEquipa} from '../importar-excel.js';

export const POSICOES = ['GR', 'Fixo', 'Ala', 'Pivô', 'Universal'];

export async function render(main, params, ctx) {
  ctx.title('Plantel');
  let showPaste = false;
  const draw = async () => {
    const all = await atletas(true);
    const ativos = all.filter(a => a.ativo !== false), inativos = all.filter(a => a.ativo === false);
    const row = a => `<a class="item" href="#/atleta/${a.id}"><span class="num${a.posicao === 'GR' ? ' gr' : ''}">${esc(a.num || '?')}</span>
      <div class="main"><b>${esc(a.nome || 'Sem nome')}</b><span>${esc(a.posicao || 'Posição por definir')}</span></div>${a.exemplo ? '<span class="pill">exemplo</span>' : ''}</a>`;
    main.innerHTML = `
      <form class="panel" id="add"><h2>Juntar atleta</h2>
        <div class="row" style="flex-wrap:nowrap"><input id="an" placeholder="Nº" inputmode="numeric" maxlength="3" style="width:64px;flex:none" aria-label="Número">
          <input id="anome" placeholder="Nome" maxlength="30" aria-label="Nome">
          <select id="apos" aria-label="Posição" style="width:110px;flex:none"><option value="">Posição</option>${POSICOES.map(p => `<option>${p}</option>`).join('')}</select>
          <button class="primary" type="submit">Juntar</button></div>
        <div class="row"><button type="button" class="ghost" id="tp">${showPaste ? 'Fechar lista' : 'Colar uma lista de nomes'}</button>
          <label class="btn ghost" for="xlsTeam">Importar Excel do Control-Stats<input type="file" id="xlsTeam" accept=".xlsx,.xls" hidden></label></div>
        ${showPaste ? `<textarea id="paste" placeholder="Um por linha: número e nome\n10 João Silva\n7 Pedro Costa"></textarea><button type="button" id="doPaste">Juntar todos</button>` : ''}
      </form>
      <section class="stack"><h2>${ativos.length} atletas</h2>${ativos.length ? `<div class="list">${ativos.map(row).join('')}</div>` : '<p class="muted">Ainda ninguém. Junta o primeiro em cima.</p>'}</section>
      ${inativos.length ? `<section class="stack"><h2>Fora do plantel</h2><div class="list">${inativos.map(row).join('')}</div></section>` : ''}`;
    main.querySelector('#add').onsubmit = async e => {
      e.preventDefault();
      const num = main.querySelector('#an').value.trim(), nome = main.querySelector('#anome').value.trim();
      if (!num && !nome) return;
      if (num && all.some(a => a.ativo !== false && a.num === num)) { toast(`Já há um atleta com o nº ${num}`); return; }
      await db.put('atletas', {num, nome, posicao: main.querySelector('#apos').value, ativo: true});
      await draw(); main.querySelector('#an').focus();
    };
    main.querySelector('#tp').onclick = () => { showPaste = !showPaste; draw(); };
    main.querySelector('#xlsTeam').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const r = await importarExcelEquipa(f);
        toast(`${r.novos} atletas novos, ${r.atualizados} atualizados${r.presets ? `, ${r.presets} presets de situações` : ''}`);
        if (r.avisos.length) alert('Presets ignorados:\n\n' + r.avisos.join('\n'));
        draw();
      } catch (err) { toast('Não consegui ler esse Excel: ' + err.message); }
    };
    const dp = main.querySelector('#doPaste');
    if (dp) dp.onclick = async () => {
      const lines = main.querySelector('#paste').value.split('\n').map(l => l.trim()).filter(Boolean);
      let n = 0;
      for (const l of lines) { const m = /^(\d{1,3})[\s.\-–:]+(.+)$/.exec(l); await db.put('atletas', {num: m ? m[1] : '', nome: m ? m[2] : l, posicao: '', ativo: true}); n++; }
      showPaste = false; toast(`${n} atletas juntados`); draw();
    };
  };
  await draw();
}
