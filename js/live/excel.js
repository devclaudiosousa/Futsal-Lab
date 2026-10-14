// Excel do jogo ao vivo, com as mesmas folhas e colunas do Control-Stats:
// Match Info, Team Info, Match Events, Playing Stats.
import * as L from './engine.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  loading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => { loading = null; rej(new Error('sem rede para carregar o gerador de Excel')); };
    document.head.append(s);
  });
  return loading;
}

const mmss = s => { s = Math.floor(Math.max(0, s)); return [String(Math.floor(s / 60)).padStart(2, '0'), String(s % 60).padStart(2, '0')]; };

export function sheetsJogoAoVivo(j, live, cfg) {
  const d = L.derive(live);
  const nos = cfg.clube || 'Nós', adv = j.adversario || 'Adversário';
  const casa = j.casa !== false;
  const [home, away] = casa ? [nos, adv] : [adv, nos];
  const ini = s => (s || '').replace(/[^A-Za-zÀ-ú0-9]/g, '').slice(0, 3).toUpperCase();
  const gH = casa ? d.score.nos : d.score.adv, gA = casa ? d.score.adv : d.score.nos;

  const info = [['Team Analyzed', 'Date', 'Location', 'Competition', 'Stage', 'KickOff', 'Home Team', 'Away Team', 'Home Initials', 'Away Initials', 'Goals (Home)', 'Goals (Away)', 'Remates feitos', 'Remates sofridos'],
    [nos, j.data || '', j.local || '', j.competicao || '', j.jornada || '', j.hora || '', home, away, ini(home), ini(away), gH, gA, d.shots.nos, d.shots.adv]];

  const team = [['Player ID', 'Player No', 'First Name', 'Last Name', 'Position']];
  live.plantel.forEach((p, i) => { const parts = (p.nome || '').trim().split(/\s+/); team.push([i + 1, p.num, parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '', parts.length > 1 ? parts.at(-1) : '', p.pos || '']); });

  const byId = Object.fromEntries(live.plantel.map(p => [p.id, p]));
  const last = id => { const p = byId[id]; if (!p) return ''; const parts = (p.nome || '').trim().split(/\s+/); return parts.at(-1) || ''; };
  const cell = id => { const p = byId[id]; return p ? `${p.num} ${last(id)}`.trim() : ''; };
  const ev = [['index', 'period', 'min_run', 'sec_run', 'min_eff', 'sec_eff', 'result', 'player_no1', 'last_name1', 'player_no2', 'last_name2', 'on_gr', 'on_fixo', 'on_ala1', 'on_ala2', 'on_pivo']];
  d.rows.forEach((r, i) => {
    const [mr, sr] = mmss(r.run), [me, se] = mmss(r.eff);
    ev.push([i + 1, r.per + 1, mr, sr, me, se, r.result,
      r.p1 != null ? byId[r.p1]?.num ?? -1 : -1, r.p1 != null ? last(r.p1) : '',
      r.p2 != null ? byId[r.p2]?.num ?? -1 : -1, r.p2 != null ? last(r.p2) : '',
      ...(r.on ? r.on.map(cell) : ['', '', '', '', ''])]);
  });

  const met = ['Rotations', 'Play Time', 'Rest Time', 'W/R Ratio', '% Total Time'];
  const stats = [['Jersey #', 'Display Name', ...live.periods.flatMap(p => met.map(m => `${p.lbl}_${m}`)), 'TOTAL_Play Time', 'TOTAL_Rest Time']];
  for (const p of d.players) {
    stats.push([p.num, last(p.id), ...live.periods.flatMap((_, i) => [p.rot[i], Math.round(p.play[i]), Math.round(p.rest[i]), p.wr[i], p.pct[i]]), Math.round(p.totalPlay), Math.round(p.totalRest)]);
  }
  return {'Match Info': info, 'Team Info': team, 'Match Events': ev, 'Playing Stats': stats};
}

export async function exportJogoAoVivo(j, live, cfg) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheetsJogoAoVivo(j, live, cfg))) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const nome = `${(cfg.clube || 'Nos')}_${j.adversario || 'Adversario'}_${j.data || ''}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-');
  XLSX.writeFile(wb, nome);
}
