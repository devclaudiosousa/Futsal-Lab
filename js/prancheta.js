// Prancheta: campo de futsal 40×20 m (1 m = 10 unidades), peças por passo, setas e animação entre passos.
// quadro = {pieces:[{id,k,n}], frames:[{pos:{id:[x,y]}, draws:[{id,k,pts,t}]}]}
// k das peças: a (nós), gr (nosso GR), b (adversário), bola, cone
// k dos desenhos: mov (movimento), pass (passe), cond (condução), pen (caneta), zone (zona), text
import {uid, } from './db.js';
import {esc} from './ui.js';

const W = 420, H = 220;
const PASS = '#F2C94C';
const PIECE = {
  a: {fill: 'var(--team-a)', ink: '#fff', r: 9},
  gr: {fill: '#E7B04A', ink: '#16211D', r: 9},
  b: {fill: 'var(--team-b)', ink: '#fff', r: 9},
  bola: {fill: '#fff', ink: '#000', r: 4.5},
  cone: {fill: '#FF8A3D', ink: '#000', r: 6},
};

export function newQuadro() {
  const p = (k, n, x, y) => ({id: uid(), k, n, x, y});
  const list = [p('gr', 'GR', 25, 110), p('a', '2', 95, 110), p('a', '3', 150, 50), p('a', '4', 150, 170), p('a', '5', 215, 110), p('bola', '', 104, 110)];
  return {pieces: list.map(({x, y, ...r}) => r), frames: [{pos: Object.fromEntries(list.map(o => [o.id, [o.x, o.y]])), draws: []}]};
}

function posAt(q, fi, id) {
  for (let i = fi; i >= 0; i--) { const v = q.frames[i]?.pos?.[id]; if (v) return v; }
  for (const f of q.frames) if (f.pos?.[id]) return f.pos[id];
  return [W / 2, H / 2];
}

function field(u) {
  const L = 'var(--court-line)';
  return `<defs>
    <marker id="ar-${u}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${L}"/></marker>
    <marker id="ap-${u}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${PASS}"/></marker>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="var(--court)"/>
  <g fill="none" stroke="${L}" stroke-width="1.6" opacity=".9">
    <rect x="10" y="10" width="400" height="200"/>
    <line x1="210" y1="10" x2="210" y2="210"/>
    <circle cx="210" cy="110" r="30"/>
    <path d="M10 35A60 60 0 0 1 70 95L70 125A60 60 0 0 1 10 185"/>
    <path d="M410 35A60 60 0 0 0 350 95L350 125A60 60 0 0 0 410 185"/>
    <rect x="2" y="95" width="8" height="30"/><rect x="410" y="95" width="8" height="30"/>
  </g>
  <g fill="${L}" opacity=".9"><circle cx="210" cy="110" r="1.8"/><circle cx="70" cy="110" r="1.5"/><circle cx="110" cy="110" r="1.5"/><circle cx="350" cy="110" r="1.5"/><circle cx="310" cy="110" r="1.5"/></g>`;
}

function wavy(a, b) {
  const [x1, y1] = a, [x2, y2] = b, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 14) return `M${x1} ${y1}L${x2} ${y2}`;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, waveLen = len - 10;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let s = 2; s <= waveLen; s += 2) {
    const off = Math.sin(s / 12 * Math.PI * 2) * 3.5;
    d += `L${(x1 + ux * s + nx * off).toFixed(1)} ${(y1 + uy * s + ny * off).toFixed(1)}`;
  }
  return d + `L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function drawSVG(d, u) {
  const L = 'var(--court-line)';
  const pts = d.pts || [];
  let shape = '', hit = '';
  if (['mov', 'pass', 'cond'].includes(d.k) && pts.length >= 2) {
    const path = d.k === 'cond' ? wavy(pts[0], pts[1]) : `M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}`;
    const col = d.k === 'pass' ? PASS : L;
    shape = `<path d="${path}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" ${d.k === 'mov' ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#${d.k === 'pass' ? 'ap' : 'ar'}-${u})"/>`;
    hit = `<path d="M${pts[0][0]} ${pts[0][1]}L${pts[1][0]} ${pts[1][1]}" stroke="transparent" stroke-width="16" fill="none"/>`;
  } else if (d.k === 'pen' && pts.length >= 2) {
    const path = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    shape = `<path d="${path}" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    hit = `<path d="${path}" stroke="transparent" stroke-width="16" fill="none"/>`;
  } else if (d.k === 'zone' && pts.length >= 2) {
    const x = Math.min(pts[0][0], pts[1][0]), y = Math.min(pts[0][1], pts[1][1]);
    const w = Math.abs(pts[1][0] - pts[0][0]), h = Math.abs(pts[1][1] - pts[0][1]);
    shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${PASS}" fill-opacity=".18" stroke="${PASS}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  } else if (d.k === 'text' && pts.length) {
    shape = `<text x="${pts[0][0]}" y="${pts[0][1]}" font-family="IBM Plex Sans,system-ui,sans-serif" font-size="11" font-weight="600" fill="#fff" stroke="#0B100E" stroke-width="3" paint-order="stroke" text-anchor="middle">${esc(d.t)}</text>`;
  }
  return `<g data-did="${d.id}" class="dr">${hit}${shape}</g>`;
}

function pieceSVG(p, [x, y]) {
  const s = PIECE[p.k] || PIECE.a;
  let body;
  if (p.k === 'cone') body = `<path d="M0 -7L6.5 5.5H-6.5Z" fill="${s.fill}" stroke="#000" stroke-width=".8"/>`;
  else if (p.k === 'bola') body = `<circle r="${s.r}" fill="#fff" stroke="#000" stroke-width="1"/><circle r="1.6" fill="#000"/>`;
  else body = `<circle r="${s.r}" fill="${s.fill}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>` +
    (p.n ? `<text y="3.6" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="700" font-size="${String(p.n).length > 2 ? 8 : 10.5}" fill="${s.ink}">${esc(p.n)}</text>` : '');
  return `<g data-pid="${p.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${body}</g>`;
}

export function boardSVG(q, fi = 0, {u = 'b' + Math.random().toString(36).slice(2, 7), cls = 'court', label = 'Prancheta', positions = null, hideDraws = false} = {}) {
  const f = q.frames[fi] || {draws: []};
  return `<svg class="${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${field(u)}
    <g class="draws"${hideDraws ? ' opacity="0"' : ''}>${(f.draws || []).map(d => drawSVG(d, u)).join('')}</g>
    <g class="pieces">${q.pieces.filter(p => p.k !== 'bola').concat(q.pieces.filter(p => p.k === 'bola')).map(p => pieceSVG(p, positions?.[p.id] || posAt(q, fi, p.id))).join('')}</g>
  </svg>`;
}
export const thumb = (q, label) => boardSVG(q || newQuadro(), 0, {cls: 'thumb', label: label || 'Desenho do exercício'});

const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// Componente editável ou só de visualização
export class Board {
  constructor(el, q, {editable = false, onChange = () => {}, loop = false} = {}) {
    this.el = el; this.q = q && q.frames?.length ? q : newQuadro();
    this.editable = editable; this.onChange = onChange; this.loop = loop;
    this.fi = 0; this.tool = 'move'; this.u = 'k' + Math.random().toString(36).slice(2, 7);
    this.playing = false; this.drag = null;
    this.render();
  }
  changed() { this.onChange(this.q); }
  render() {
    const ed = this.editable;
    const T = [['move', 'Mover'], ['mov', 'Movimento'], ['pass', 'Passe'], ['cond', 'Condução'], ['pen', 'Caneta'], ['zone', 'Zona'], ['text', 'Texto'], ['del', 'Apagar']];
    this.el.innerHTML = `<div class="board">
      ${ed ? `<div class="tools" role="toolbar" aria-label="Ferramentas">${T.map(([k, l]) => `<button type="button" data-tool="${k}" aria-pressed="${this.tool === k}">${l}</button>`).join('')}</div>
      <div class="tools" aria-label="Juntar peças"><button type="button" data-add="a">+ Nós</button><button type="button" data-add="gr">+ GR</button><button type="button" data-add="b">+ Adv.</button><button type="button" data-add="bola">+ Bola</button><button type="button" data-add="cone">+ Cone</button><button type="button" data-act="clearDraws">Limpar setas</button></div>` : ''}
      <div class="svgw"></div>
      ${ed ? `<div class="textin" hidden><input id="txt-${this.u}" placeholder="Texto a escrever no campo" maxlength="40"><button type="button" class="primary" data-act="txtOk">Pôr</button><button type="button" data-act="txtNo">✕</button></div>` : ''}
      <div class="frames">
        <button type="button" class="primary" data-act="play" aria-label="Animar">▶ Animar</button>
        <span class="small muted">Passo</span>
        <span class="fl"></span>
        ${ed ? `<button type="button" data-act="addFrame" title="Novo passo: copia as posições do atual">+ Passo</button><button type="button" data-act="delFrame">− Passo</button>` : ''}
      </div>
      ${ed ? `<p class="small muted hint"></p>` : ''}
    </div>`;
    this.svgw = this.el.querySelector('.svgw');
    this.el.onclick = e => this.click(e);
    if (ed) this.el.querySelector(`#txt-${this.u}`).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); this.textOk(); } if (e.key === 'Escape') this.textNo(); };
    this.paint();
  }
  paint(opts = {}) {
    this.svgw.innerHTML = boardSVG(this.q, this.fi, {u: this.u, ...opts});
    this.svg = this.svgw.firstElementChild;
    if (this.editable) {
      this.svg.onpointerdown = e => this.down(e);
      this.svg.onpointermove = e => this.move(e);
      this.svg.onpointerup = this.svg.onpointercancel = e => this.up(e);
    }
    const fl = this.el.querySelector('.fl');
    fl.innerHTML = this.q.frames.map((_, i) => `<button type="button" class="fr" data-fr="${i}" aria-current="${i === this.fi}">${i + 1}</button>`).join('');
    const hint = this.el.querySelector('.hint');
    if (hint) hint.textContent = {
      move: 'Arrasta as peças. Cada passo guarda as suas posições; a animação move-as de um passo para o seguinte.',
      mov: 'Arrasta para desenhar um movimento sem bola (tracejado). Começa em cima de um jogador para partir dele.',
      pass: 'Arrasta para desenhar um passe.', cond: 'Arrasta para desenhar uma condução de bola.',
      pen: 'Desenha à mão livre.', zone: 'Arrasta para marcar uma zona.', text: 'Toca no campo onde queres o texto.',
      del: 'Toca numa seta, zona, texto ou peça para apagar.',
    }[this.tool];
  }
  pt(e) {
    const m = this.svg.getScreenCTM().inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [Math.max(2, Math.min(W - 2, p.x)), Math.max(2, Math.min(H - 2, p.y))];
  }
  nearest(p, r = 16) {
    let best = null, bd = r;
    for (const pc of this.q.pieces) {
      const [x, y] = posAt(this.q, this.fi, pc.id), d = Math.hypot(x - p[0], y - p[1]);
      if (d <= bd) { bd = d; best = pc; }
    }
    return best;
  }
  frame() { return this.q.frames[this.fi]; }
  down(e) {
    if (this.playing) this.stop();
    const p = this.pt(e);
    if (this.tool === 'del') {
      const g = e.target.closest('[data-did],[data-pid]');
      if (g?.dataset.did) { this.frame().draws = this.frame().draws.filter(d => d.id !== g.dataset.did); }
      else if (g?.dataset.pid || this.nearest(p, 10)) {
        const id = g?.dataset.pid || this.nearest(p, 10).id;
        this.q.pieces = this.q.pieces.filter(x => x.id !== id);
        this.q.frames.forEach(f => delete f.pos[id]);
      } else return;
      this.paint(); this.changed(); return;
    }
    if (this.tool === 'text') { this.textAt = p; const ti = this.el.querySelector('.textin'); ti.hidden = false; ti.querySelector('input').focus(); return; }
    this.svg.setPointerCapture?.(e.pointerId);
    if (this.tool === 'move') {
      const pc = this.nearest(p);
      if (pc) { const [x, y] = posAt(this.q, this.fi, pc.id); this.drag = {k: 'piece', id: pc.id, off: [x - p[0], y - p[1]]}; }
      return;
    }
    let start = p;
    if (['mov', 'pass', 'cond'].includes(this.tool)) { const pc = this.nearest(p, 14); if (pc) start = [...posAt(this.q, this.fi, pc.id)]; }
    this.drag = {k: 'draw', d: {id: uid(), k: this.tool, pts: [start, p]}};
  }
  move(e) {
    if (!this.drag) return;
    const p = this.pt(e);
    if (this.drag.k === 'piece') {
      const np = [p[0] + this.drag.off[0], p[1] + this.drag.off[1]].map((v, i) => Math.max(4, Math.min(i ? H - 4 : W - 4, v)));
      this.frame().pos[this.drag.id] = np;
      const g = this.svg.querySelector(`[data-pid="${this.drag.id}"]`);
      if (g) g.setAttribute('transform', `translate(${np[0].toFixed(1)} ${np[1].toFixed(1)})`);
      return;
    }
    const d = this.drag.d;
    if (d.k === 'pen') { const last = d.pts[d.pts.length - 1]; if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 3) d.pts.push(p); }
    else d.pts[1] = p;
    let tmp = this.svg.querySelector('.tmp');
    if (!tmp) { tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g'); tmp.setAttribute('class', 'tmp'); this.svg.querySelector('.draws').after(tmp); }
    tmp.innerHTML = drawSVG(d, this.u);
  }
  up() {
    const dr = this.drag; this.drag = null;
    if (!dr) return;
    if (dr.k === 'piece') { this.changed(); return; }
    const d = dr.d, a = d.pts[0], b = d.pts[d.pts.length - 1];
    if (d.k === 'pen' ? d.pts.length > 2 : Math.hypot(a[0] - b[0], a[1] - b[1]) > 10) {
      d.pts = d.pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]);
      this.frame().draws.push(d); this.changed();
    }
    this.paint();
  }
  textOk() {
    const inp = this.el.querySelector('.textin input'), t = inp.value.trim();
    if (t && this.textAt) { this.frame().draws.push({id: uid(), k: 'text', pts: [this.textAt.map(v => +v.toFixed(1))], t}); this.changed(); }
    this.textNo(); this.paint();
  }
  textNo() { const ti = this.el.querySelector('.textin'); ti.hidden = true; ti.querySelector('input').value = ''; this.textAt = null; }
  click(e) {
    const b = e.target.closest('button'); if (!b || !this.el.contains(b)) return;
    if (b.dataset.tool) { this.tool = b.dataset.tool; this.el.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.paint(); return; }
    if (b.dataset.fr != null) { this.stop(); this.fi = +b.dataset.fr; this.paint(); return; }
    if (b.dataset.add) {
      const k = b.dataset.add, n = k === 'a' || k === 'b' ? String(this.q.pieces.filter(p => p.k === k).length + (k === 'a' ? 2 : 1)) : k === 'gr' ? 'GR' : '';
      const id = uid();
      this.q.pieces.push({id, k, n});
      const x = k === 'b' ? 260 + Math.random() * 60 : 120 + Math.random() * 60;
      this.frame().pos[id] = [+x.toFixed(1), +(60 + Math.random() * 100).toFixed(1)];
      this.paint(); this.changed(); return;
    }
    const act = b.dataset.act;
    if (act === 'play') return this.playing ? this.stop() : this.play();
    if (act === 'addFrame') {
      const cur = this.frame();
      const pos = Object.fromEntries(this.q.pieces.map(p => [p.id, [...posAt(this.q, this.fi, p.id)]]));
      this.q.frames.splice(this.fi + 1, 0, {pos, draws: []});
      this.fi++; this.paint(); this.changed();
      void cur; return;
    }
    if (act === 'delFrame') {
      if (this.q.frames.length < 2) return;
      this.q.frames.splice(this.fi, 1); this.fi = Math.max(0, this.fi - 1); this.paint(); this.changed(); return;
    }
    if (act === 'clearDraws') { this.frame().draws = []; this.paint(); this.changed(); return; }
    if (act === 'txtOk') return this.textOk();
    if (act === 'txtNo') return this.textNo();
  }
  stop() {
    this.playing = false; cancelAnimationFrame(this.raf); clearTimeout(this.tmo);
    const pb = this.el.querySelector('[data-act="play"]'); if (pb) pb.textContent = '▶ Animar';
    this.paint();
  }
  play() {
    if (this.q.frames.length < 2) { this.fi = 0; this.paint(); return; }
    this.playing = true;
    this.el.querySelector('[data-act="play"]').textContent = '■ Parar';
    const n = this.q.frames.length;
    const step = i => {
      if (!this.playing) return;
      this.fi = i; this.paint();
      this.el.querySelector('[data-act="play"]').textContent = '■ Parar';
      if (i >= n - 1) {
        this.tmo = setTimeout(() => { if (!this.playing) return; if (this.loop) step(0); else this.stop(); }, 1500);
        return;
      }
      this.tmo = setTimeout(() => {
        if (!this.playing) return;
        if (reduce()) { step(i + 1); return; }
        const from = {}, to = {};
        for (const p of this.q.pieces) { from[p.id] = posAt(this.q, i, p.id); to[p.id] = posAt(this.q, i + 1, p.id); }
        const els = {}; this.svg.querySelectorAll('[data-pid]').forEach(g => els[g.dataset.pid] = g);
        const dr = this.svg.querySelector('.draws');
        const t0 = performance.now(), D = 1100;
        const frame = now => {
          if (!this.playing) return;
          const k = Math.min(1, (now - t0) / D), e = ease(k);
          if (dr) dr.setAttribute('opacity', String(Math.max(0, 1 - k * 2.5)));
          for (const id in els) {
            const a = from[id], b = to[id]; if (!a || !b) continue;
            els[id].setAttribute('transform', `translate(${(a[0] + (b[0] - a[0]) * e).toFixed(1)} ${(a[1] + (b[1] - a[1]) * e).toFixed(1)})`);
          }
          if (k < 1) this.raf = requestAnimationFrame(frame); else step(i + 1);
        };
        this.raf = requestAnimationFrame(frame);
      }, 900);
    };
    step(0);
  }
  destroy() { this.stop(); this.el.innerHTML = ''; }
}
