// Gráficos do Ao vivo (intervalo e fim do jogo): SVG/HTML simples, sem bibliotecas.
// Cores: nós = laranja do clube, adversário = azul (par validado para daltonismo, claro e escuro) — ver css (--g-nos/--g-adv).
import {derive, SLOTS, clock} from './live/engine.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const LBL = {'1H': '1.ª', '2H': '2.ª', ET1: 'P1', ET2: 'P2'};
const ult = p => p?.curto || (p?.nome || '').trim().split(/\s+/).pop() || String(p?.num ?? '?');

// partes a mostrar: 'parte' = a última jogada (ou a atual); 'jogo' = todas as jogadas
export function dadosGraficos(live, now, ambito = 'parte') {
  const d = derive(live, now);
  const ultima = Math.max(0, d.per);
  const pers = ambito === 'jogo' ? live.periods.map((_, i) => i).filter(i => i <= ultima) : [ultima];
  const byId = d.byId;

  // 1. remates e golos por blocos de 5 min de tempo útil
  const blocos = [];
  for (const per of pers) {
    const dur = live.periods[per].min * 60;
    for (let de = 0; de < dur; de += 300) blocos.push({per, lbl: LBL[live.periods[per].lbl] || '', de, ate: Math.min(dur, de + 300), nos: 0, adv: 0, gNos: 0, gAdv: 0});
  }
  for (const s of d.shotList) {
    const b = blocos.find(b => b.per === s.per && s.eff >= b.de && (s.eff < b.ate || b.ate === live.periods[b.per].min * 60 && s.eff >= b.de))
      || [...blocos].reverse().find(b => b.per === s.per);       // tempo extra (útil acima dos 20') fica no último bloco
    if (!b) continue;
    b[s.team]++;
    if (s.golo) b[s.team === 'nos' ? 'gNos' : 'gAdv']++;
  }

  // 2. quartetos (4 de campo, sem o GR): minutos juntos e remates feitos/sofridos
  const segs = d.segments.filter(sg => pers.includes(sg.per));
  const quart = new Map();
  const chave = court => SLOTS.slice(1).map(s => court[s]).filter(Boolean).sort().join('|');
  for (const sg of segs) {
    const k = chave(sg.court); if (k.split('|').length < 4) continue;
    const q = quart.get(k) || {ids: k.split('|'), seg: 0, rf: 0, rs: 0, gm: 0, gs: 0};
    q.seg += sg.e - sg.s; quart.set(k, q);
  }
  for (const s of d.shotList) {
    if (!pers.includes(s.per)) continue;
    const sg = segs.find(sg => sg.per === s.per && s.eff >= sg.s && s.eff <= sg.e);
    if (!sg) continue;
    const q = quart.get(chave(sg.court)); if (!q) continue;
    if (s.team === 'nos') { q.rf++; if (s.golo) q.gm++; } else { q.rs++; if (s.golo) q.gs++; }
  }
  const quartetos = [...quart.values()].filter(q => q.seg >= 20 || q.rf + q.rs)
    .map(q => ({...q, nomes: q.ids.map(id => byId[id]).sort((a, b) => (parseInt(a?.num) || 99) - (parseInt(b?.num) || 99)).map(ult)}))
    .sort((a, b) => b.seg - a.seg);

  // 3. faltas acumuladas por parte (as faltas contam por parte)
  const faltas = pers.map(per => ({per, lbl: live.periods[per].lbl, min: live.periods[per].min,
    nos: d.fouls.filter(f => f.per === per).map(f => f.eff).sort((a, b) => a - b),
    adv: d.foulsAdv.filter(f => f.per === per).map(f => f.eff).sort((a, b) => a - b)}));

  // 4. minutos por jogador (tempo útil)
  const minutos = d.players.map(p => ({nome: `${p.num} ${ult(p)}`, seg: pers.reduce((s, i) => s + (p.play[i] || 0), 0), on: p.active}))
    .filter(x => x.seg > 0).sort((a, b) => b.seg - a.seg);

  const tot = {rNos: blocos.reduce((s, b) => s + b.nos, 0), rAdv: blocos.reduce((s, b) => s + b.adv, 0)};
  return {d, pers, blocos, quartetos, faltas, minutos, tot, ambito, lblParte: pers.length === 1 ? LBL[live.periods[pers[0]].lbl] + ' parte' : 'jogo todo'};
}

// ---------- 1. remates por blocos de 5 min (nós para cima, adversário para baixo)
export function svgRemates(G, W = 640) {
  const n = G.blocos.length; if (!n) return '';
  const H = 260, top = 34, bot = 44, mid = top + (H - top - bot) / 2, half = (H - top - bot) / 2 - 14;
  const max = Math.max(3, ...G.blocos.map(b => Math.max(b.nos, b.adv)));
  const bw = Math.min(56, (W - 40) / n - 10), x0 = 20, step = (W - 40) / n;
  const out = [`<svg viewBox="0 0 ${W} ${H}" class="gsvg" role="img" aria-label="Remates por blocos de 5 minutos: nossos para cima, do adversário para baixo">`,
    `<line x1="${x0}" x2="${W - 20}" y1="${mid}" y2="${mid}" class="g-base"/>`,
    `<g class="g-leg"><rect x="${x0}" y="6" width="12" height="12" rx="3" fill="var(--g-nos)"/><text x="${x0 + 18}" y="16">Nossos ▲ ${G.tot.rNos}</text>`,
    `<rect x="${x0 + 130}" y="6" width="12" height="12" rx="3" fill="var(--g-adv)"/><text x="${x0 + 148}" y="16">Adversário ▼ ${G.tot.rAdv}</text>`,
    `${W >= 500 ? `<text x="${x0 + 290}" y="16">⚽ golo</text>` : ''}</g>`];
  let perAnt = null;
  G.blocos.forEach((b, i) => {
    const cx = x0 + step * i + step / 2, hN = b.nos / max * half, hA = b.adv / max * half;
    if (perAnt !== null && b.per !== perAnt) out.push(`<line x1="${x0 + step * i}" x2="${x0 + step * i}" y1="${top}" y2="${H - bot + 6}" class="g-sep"/>`);
    perAnt = b.per;
    const tip = `${Math.floor(b.de / 60)}–${Math.ceil(b.ate / 60)}': ${b.nos} nossos${b.gNos ? ` (${b.gNos} golo${b.gNos > 1 ? 's' : ''})` : ''}, ${b.adv} do adversário${b.gAdv ? ` (${b.gAdv} golo${b.gAdv > 1 ? 's' : ''})` : ''}`;
    out.push(`<g class="g-hit"><title>${esc(tip)}</title><rect x="${cx - step / 2}" y="${top}" width="${step}" height="${H - top - bot}" fill="transparent"/>`);
    if (b.nos) out.push(`<path d="M${cx - bw / 2},${mid} v${-hN + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${hN - 4} z" fill="var(--g-nos)"/><text x="${cx}" y="${mid - hN - 5}" class="g-val">${b.nos}${b.gNos ? ' ' + '⚽'.repeat(Math.min(3, b.gNos)) : ''}</text>`);
    if (b.adv) out.push(`<path d="M${cx - bw / 2},${mid} v${hA - 4} q0,4 4,4 h${bw - 8} q4,0 4,-4 v${-hA + 4} z" fill="var(--g-adv)"/><text x="${cx}" y="${mid + hA + 15}" class="g-val">${b.adv}${b.gAdv ? ' ' + '⚽'.repeat(Math.min(3, b.gAdv)) : ''}</text>`);
    out.push(`<text x="${cx}" y="${H - bot + 22}" class="g-ax">${G.pers.length > 1 && b.de === 0 ? b.lbl + ' ' : ''}${Math.floor(b.de / 60)}–${Math.ceil(b.ate / 60)}'</text></g>`);
  });
  out.push('</svg>');
  return out.join('');
}

// ---------- 2. quartetos: minutos juntos e remates feitos/sofridos (barras divergentes)
export function htmlQuartetos(G) {
  if (!G.quartetos.length) return '<p class="muted small">Ainda sem quartetos com tempo de jogo.</p>';
  const max = Math.max(1, ...G.quartetos.map(q => Math.max(q.rf, q.rs)));
  return `<div class="gq"><div class="gq-h"><span>Quarteto (sem o GR)</span><span>Min.</span><span class="r">Sofridos</span><span>Feitos</span></div>${G.quartetos.map(q => {
    const sd = q.rf - q.rs;
    return `<div class="gq-r" title="${esc(q.nomes.join(' · '))}: ${clock(q.seg)} juntos, ${q.rf} remates feitos, ${q.rs} sofridos${q.gm + q.gs ? `, golos ${q.gm}–${q.gs}` : ''}">
      <span class="nm">${esc(q.nomes.join(' · '))}</span><span class="mono">${clock(q.seg)}</span>
      <span class="bar l"><i style="width:${q.rs / max * 100}%"></i><b>${q.rs}${q.gs ? ' ⚽' + (q.gs > 1 ? q.gs : '') : ''}</b></span>
      <span class="bar r"><i style="width:${q.rf / max * 100}%"></i><b>${q.rf}${q.gm ? ' ⚽' + (q.gm > 1 ? q.gm : '') : ''}</b></span>
      <span class="sd ${sd > 0 ? 'pos' : sd < 0 ? 'neg' : ''}">${sd > 0 ? '+' : ''}${sd}</span></div>`;
  }).join('')}</div>`;
}

// ---------- 3. faltas acumuladas na parte (linha de degraus), com a 5.ª marcada
export function svgFaltas(f, W = 640) {
  const H = 170, l = 30, r = 20, top = 28, bot = 28;
  const ymax = Math.max(6, f.nos.length, f.adv.length) + 0.5, xmax = f.min * 60;
  const X = t => l + Math.min(t, xmax) / xmax * (W - l - r), Y = v => H - bot - v / ymax * (H - top - bot);
  const linha = (ts, cor, nome) => {
    let p = `M${X(0)},${Y(0)}`; ts.forEach((t, i) => { p += ` H${X(t)} V${Y(i + 1)}`; });
    p += ` H${X(xmax)}`;
    return `<path d="${p}" fill="none" stroke="${cor}" stroke-width="2.5"/>${ts.map((t, i) => `<circle cx="${X(t)}" cy="${Y(i + 1)}" r="4" fill="${cor}" stroke="var(--surface)" stroke-width="2"><title>${nome}: ${i + 1}.ª falta aos ${clock(t)}</title></circle>`).join('')}`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" class="gsvg" role="img" aria-label="Faltas acumuladas na parte">
    <g class="g-leg"><rect x="${l}" y="6" width="12" height="12" rx="3" fill="var(--g-nos)"/><text x="${l + 18}" y="16">Nossas ${f.nos.length}</text>
    <rect x="${l + 110}" y="6" width="12" height="12" rx="3" fill="var(--g-adv)"/><text x="${l + 128}" y="16">Adversário ${f.adv.length}</text></g>
    <line x1="${l}" x2="${W - r}" y1="${Y(5)}" y2="${Y(5)}" class="g-lim"/><text x="${W - r}" y="${Y(5) - 5}" class="g-limt">${W >= 500 ? '5.ª falta · a seguinte dá livre de 10 m' : '5.ª → livre de 10 m'}</text>
    <line x1="${l}" x2="${W - r}" y1="${Y(0)}" y2="${Y(0)}" class="g-base"/>
    ${[0, 5, 10, 15, 20].filter(m => m <= f.min).map(m => `<text x="${X(m * 60)}" y="${H - 8}" class="g-ax">${m}'</text>`).join('')}
    ${[1, 2, 3, 4, 5, 6].filter(v => v <= ymax).map(v => `<text x="${l - 8}" y="${Y(v) + 4}" class="g-ax r">${v}</text>`).join('')}
    ${linha(f.adv, 'var(--g-adv)', 'Adversário')}${linha(f.nos, 'var(--g-nos)', 'Nós')}</svg>`;
}

// ---------- 4. minutos por jogador (barras horizontais, mais jogado em cima)
export function htmlMinutos(G) {
  if (!G.minutos.length) return '<p class="muted small">Ainda sem minutos.</p>';
  const max = Math.max(...G.minutos.map(m => m.seg));
  return `<div class="gm">${G.minutos.map(m => `<div class="gm-r" title="${esc(m.nome)}: ${clock(m.seg)} de tempo útil${m.on ? ' · em campo agora' : ''}">
    <span class="nm">${esc(m.nome)}${m.on ? ' <i class="dot" aria-label="em campo"></i>' : ''}</span><span class="bar"><i style="width:${m.seg / max * 100}%"></i></span><span class="mono">${clock(m.seg)}</span></div>`).join('')}</div>`;
}
