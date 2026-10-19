// Intervalo / resumo do jogo ao vivo: 4 gráficos para ler em 30 segundos.
// Abre sozinho no fim de cada parte; também se chega lá pelo botão "Gráficos" do Ao vivo.
import {db, config} from '../db.js';
import {esc} from '../ui.js';
import {dadosGraficos, svgRemates, htmlQuartetos, svgFaltas, htmlMinutos} from '../graficos.js';
import {clock} from '../live/engine.js';

export async function render(main, [id, amb], ctx) {
  const j = await db.get('jogos', id);
  ctx.title('Intervalo', '#/aovivo/' + id);
  if (!j?.aovivo?.events?.some(e => e.type === 'kickoff')) {
    main.innerHTML = `<div class="empty">Ainda não há jogo ao vivo marcado.<a class="btn" href="#/aovivo/${esc(id)}">Ir para o Ao vivo</a></div>`; return;
  }
  const cfg = await config();
  let ambito = amb === 'jogo' ? 'jogo' : 'parte';
  const draw = async () => {
    const live = (await db.get('jogos', id))?.aovivo || j.aovivo;
    const G = dadosGraficos(live, Date.now(), ambito), d = G.d;
    const W = main.clientWidth < 600 ? 380 : 640;   // no telemóvel o desenho é mais estreito para o texto não ficar minúsculo
    const nos = cfg.clube || 'Nós', adv = (j.adversario || 'Adversário').trim();
    main.innerHTML = `<div class="graf">
      <div class="g-top">
        <div class="g-score"><span class="us">${esc(nos)}</span><b>${d.score.nos}–${d.score.adv}</b><span>${esc(adv)}</span></div>
        <div class="seg" role="group" aria-label="Mostrar"><button data-amb="parte" aria-pressed="${ambito === 'parte'}">Esta parte</button><button data-amb="jogo" aria-pressed="${ambito === 'jogo'}">Jogo todo</button></div>
        <a class="btn primary" href="#/aovivo/${esc(id)}">← Voltar ao Ao vivo</a>
      </div>
      <div class="g-kpis">
        <div><span>Remates</span><b><i class="c-nos">${G.tot.rNos}</i> – <i class="c-adv">${G.tot.rAdv}</i></b></div>
        <div><span>Faltas</span><b><i class="c-nos">${G.faltas.reduce((s, f) => s + f.nos.length, 0)}</i> – <i class="c-adv">${G.faltas.reduce((s, f) => s + f.adv.length, 0)}</i></b></div>
        <div><span>Golos</span><b><i class="c-nos">${G.blocos.reduce((s, b) => s + b.gNos, 0)}</i> – <i class="c-adv">${G.blocos.reduce((s, b) => s + b.gAdv, 0)}</i></b></div>
        <div><span>Mostra</span><b class="sm">${esc(G.lblParte)}</b></div>
      </div>
      <section class="panel g-card wide"><h2>Quando rematamos e quando sofremos remates</h2><p class="small muted">Blocos de 5 minutos de tempo útil. Para cima os nossos, para baixo os do adversário.</p>${svgRemates(G, W)}</section>
      <section class="panel g-card"><h2>Quartetos em campo</h2><p class="small muted">Minutos juntos e remates feitos/sofridos com cada quarteto (sem o GR).</p>${htmlQuartetos(G)}</section>
      <section class="panel g-card"><h2>Minutos por jogador</h2><p class="small muted">Tempo útil ${ambito === 'jogo' ? 'no jogo' : 'nesta parte'}. ● em campo agora.</p>${htmlMinutos(G)}</section>
      <section class="panel g-card wide"><h2>Faltas acumuladas</h2>${G.faltas.map(f => `${G.faltas.length > 1 ? `<h3 class="small">${{'1H': '1.ª parte', '2H': '2.ª parte', ET1: 'Prolongamento 1', ET2: 'Prolongamento 2'}[f.lbl] || f.lbl}</h3>` : ''}${svgFaltas(f, W)}`).join('')}</section>
      <p class="small muted">Atualizado às ${new Date().toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'})} · tempo útil ${clock(d.eff)} ${d.phase === 'live' ? '(a decorrer)' : ''}</p>
    </div>`;
    main.querySelectorAll('[data-amb]').forEach(b => b.onclick = () => { ambito = b.dataset.amb; draw(); });
  };
  await draw();
  const iv = setInterval(draw, 15000);       // se o jogo continuar noutro aparelho/ecrã, vai atualizando
  return () => clearInterval(iv);
}
