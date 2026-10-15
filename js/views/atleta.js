import {db} from '../db.js';
import {esc, toast, dayBox} from '../ui.js';
import {marcadorSet, jogoTitulo, config} from '../data.js';
import {playerStats, mmss} from '../stats.js';
import {POSICOES} from './plantel.js';
import {field} from './common.js';

export async function render(main, [id], ctx) {
  let a = await db.get('atletas', id);
  let usos = 0, outros = [];
  ctx.title('Atleta', '#/plantel');
  if (!a) { main.innerHTML = '<div class="empty">Este atleta já não existe.<a class="btn" href="#/plantel">Voltar ao plantel</a></div>'; return; }
  const [treinos, jogos, cfg] = await Promise.all([db.all('treinos'), db.all('jogos'), config()]);
  let confirmDel = false, pend = null;
  const save = async () => { clearTimeout(pend); pend = null; a = await db.put('atletas', a); };
  const saveLater = () => { clearTimeout(pend); pend = setTimeout(save, 400); };

  const draw = () => {
    const marc = treinos.filter(t => (t.presencas || {})[a.id]);
    const pres = marc.filter(t => t.presencas[a.id] === 'P').length;
    const lesoes = marc.filter(t => t.presencas[a.id] === 'L').length;
    const jConv = jogos.filter(j => (j.convocados || []).includes(a.id)).sort((x, y) => (y.data || '').localeCompare(x.data || ''));
    const notas = jConv.map(j => (j.notas || {})[a.id]).filter(Boolean);
    let seg = 0, gol = 0, ast = 0, rem = 0;
    const porJogo = jConv.map(j => {
      const p = playerStats(marcadorSet(j).events).find(x => x.n === a.num);
      if (p) { seg += p.seg; gol += p.gol; ast += p.ast; rem += p.rem; }
      return {j, p, nota: (j.notas || {})[a.id]};
    });
    main.innerHTML = `
      <div class="hero"><div class="row"><span class="num${a.posicao === 'GR' ? ' gr' : ''}" style="width:48px;height:48px;font-size:22px">${esc(a.num || '?')}</span>
        <div class="stack" style="gap:2px"><h3>${esc(a.nome || 'Sem nome')}</h3><span class="muted small">${esc(a.posicao || 'Posição por definir')}${a.ativo === false ? ' · fora do plantel' : ''}</span></div></div></div>
      <div class="tw"><table><thead><tr><th>Treinos</th><th>Jogos</th><th>Nota média</th><th>Tempo</th><th>Golos</th><th>Assist.</th><th>Remates</th></tr></thead>
        <tbody><tr><td>${marc.length ? `${pres}/${marc.length} · ${Math.round(100 * pres / marc.length)}%` : '–'}${lesoes ? ` <span class="pill">${lesoes} lesionado</span>` : ''}</td><td>${jConv.length}</td>
        <td>${notas.length ? (notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(1).replace('.', ',') : '–'}</td><td>${seg ? mmss(seg) : '–'}</td><td>${gol}</td><td>${ast}</td><td>${rem}</td></tr></tbody></table></div>
      ${porJogo.length ? `<section class="stack"><h2>Jogos</h2><div class="list">${porJogo.map(({j, p, nota}) => `<a class="item" href="#/jogo/${j.id}">${dayBox(j.data, true)}<div class="main"><b>${esc(jogoTitulo(j, cfg.clube))}</b>
        <span>${p ? `${p.seg ? mmss(p.seg) + ' em campo · ' : ''}${p.gol} golos · ${p.rem} remates` : 'Sem marcações deste atleta'}</span></div>${nota ? `<span class="pill acc">nota ${nota}</span>` : ''}</a>`).join('')}</div></section>` : ''}
      <section class="panel"><h2>Ficha</h2><div class="fields">
        ${field('num', 'Número', a.num, 'inputmode="numeric" maxlength="3"')}${field('nome', 'Nome', a.nome, 'maxlength="30"')}
        <label class="f"><span>Posição</span><select id="posicao"><option value="">—</option>${POSICOES.map(p => `<option${a.posicao === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
        ${field('nascimento', 'Data de nascimento', a.nascimento, 'type="date"')}
        ${field('contacto', 'Contacto (atleta ou encarregado)', a.contacto, 'maxlength="60"', true)}
        <label class="f wide"><span>Observações</span><textarea id="obs" maxlength="2000">${esc(a.obs || '')}</textarea></label>
        <label class="check wide"><input type="checkbox" id="ativo" ${a.ativo !== false ? 'checked' : ''}> No plantel desta época</label>
      </div><p class="small muted">O número liga o atleta às marcações do vídeo. Se o mudares a meio da época, os jogos antigos ficam com o número antigo.</p></section>
      <div class="row"><button class="danger" id="del">Apagar atleta</button></div>
      ${confirmDel ? `<div class="confirm stack" style="gap:8px">${usos ? `<span>Este atleta aparece em <b>${usos}</b> jogo${usos > 1 ? 's' : ''}. Se é repetido, passa os dados (tempos, golos, convocatórias) para a ficha certa antes de apagar:</span>
        <label class="f"><span>Passar os dados para</span><select id="delTo"><option value="">Ninguém (os dados deste atleta deixam de contar)</option>${outros.map(o => `<option value="${o.id}">${esc(o.num || '–')} ${esc(o.nome || '')}</option>`).join('')}</select></label>` : '<span>Apagar a ficha?</span>'}
        <div class="row"><button id="delY" class="primary" style="background:var(--crit);border-color:var(--crit)">Apagar</button><button id="delN">Cancelar</button></div></div>` : ''}`;
    ['num', 'nome', 'nascimento', 'contacto', 'obs'].forEach(k => main.querySelector('#' + k).oninput = e => { a[k] = e.target.value.trim(); saveLater(); });
    main.querySelector('#posicao').onchange = async e => { a.posicao = e.target.value; await save(); draw(); };
    main.querySelector('#ativo').onchange = async e => { a.ativo = e.target.checked; await save(); draw(); };
    main.querySelector('#del').onclick = async () => {
      usos = (await db.all('jogos')).filter(j => JSON.stringify(j).includes(a.id)).length;
      outros = (await db.all('atletas')).filter(o => o.id !== a.id).sort((x, y) => (parseInt(x.num) || 999) - (parseInt(y.num) || 999));
      confirmDel = true; draw();
    };
    const dy = main.querySelector('#delY'); if (dy) dy.onclick = async () => {
      const to = main.querySelector('#delTo')?.value;
      if (to) for (const j of await db.all('jogos')) {   // os ids são únicos: troca-se em todo o registo do jogo
        const txt = JSON.stringify(j);
        if (!txt.includes(a.id)) continue;
        const nj = JSON.parse(txt.split(a.id).join(to));
        if (nj.convocados) nj.convocados = [...new Set(nj.convocados)];
        await db.put('jogos', nj);
      }
      await db.del('atletas', a.id); toast(to ? 'Dados passados e atleta apagado' : 'Atleta apagado'); ctx.go('#/plantel');
    };
    const dn = main.querySelector('#delN'); if (dn) dn.onclick = () => { confirmDel = false; draw(); };
  };
  draw();
  return () => { if (pend) save(); };
}
