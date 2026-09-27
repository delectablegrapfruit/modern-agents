// The end-of-episode screen: the morning paper, the ratings, and every call you made against how good the acts
// really were.
import { escapeHtml } from './util.js';

const pct = (v) => `${Math.round(v * 100)}%`;

// Viewers over the episode: a single line with an area fill, faint grid, the last value marked, and a hover readout.
export function viewersChart(history, peak) {
  const W = 640;
  const H = 120;
  const padL = 34;
  const padR = 44;
  const padT = 10;
  const padB = 18;
  const n = history.length;
  const min = Math.max(0, Math.floor(Math.min(...history) - 0.5));
  const max = Math.ceil(Math.max(...history, peak) + 0.3);
  const x = (i) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / Math.max(0.01, max - min)) * (H - padT - padB);
  const pts = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(n - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`;
  const ticks = [];
  const step = max - min > 6 ? 2 : 1;
  for (let v = min; v <= max; v += step) ticks.push(v);
  const lastV = history[n - 1];
  const minutes = Math.round((n * 2) / 60);
  return `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Viewers across the episode, from ${history[0].toFixed(1)} to ${lastV.toFixed(1)} million">
    <defs><linearGradient id="vfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc53d" stop-opacity="0.35"/><stop offset="1" stop-color="#ffc53d" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,0.08)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#aaa2cf" font-family="DM Mono, monospace">${v}M</text>`).join('')}
    <text x="${padL}" y="${H - 3}" font-size="11" fill="#aaa2cf">Start</text>
    <text x="${W - padR}" y="${H - 3}" font-size="11" fill="#aaa2cf" text-anchor="end">${minutes ? `${minutes} min` : 'End'}</text>
    <path d="${area}" fill="url(#vfill)"/>
    <path d="${line}" fill="none" stroke="#ffc53d" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(n - 1)}" cy="${y(lastV)}" r="4.5" fill="#ffc53d" stroke="#16122b" stroke-width="2"/>
    <text x="${x(n - 1) + 8}" y="${y(lastV) + 4}" font-size="12" fill="#f6f2ff" font-family="DM Mono, monospace">${lastV.toFixed(1)}M</text>
    <g class="hover" visibility="hidden"><line class="hx" y1="${padT}" y2="${H - padB}" stroke="rgba(255,255,255,0.35)"/><circle class="hc" r="4" fill="#ffc53d" stroke="#16122b" stroke-width="2"/><rect class="hb" width="64" height="20" rx="4" fill="#221c40" stroke="rgba(255,255,255,0.2)"/><text class="ht" font-size="12" fill="#f6f2ff" font-family="DM Mono, monospace"></text></g>
    <rect class="hit" x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" data-n="${n}" data-min="${min}" data-max="${max}"/>
  </svg>`;
}

// Hover readout for the chart above.
export function bindChart(root, history) {
  const svg = root.querySelector('.chart svg');
  if (!svg) return;
  const hit = svg.querySelector('.hit');
  const g = svg.querySelector('.hover');
  const n = history.length;
  const min = Number(hit.dataset.min);
  const max = Number(hit.dataset.max);
  const x0 = Number(hit.getAttribute('x'));
  const w = Number(hit.getAttribute('width'));
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * 640;
    const i = Math.max(0, Math.min(n - 1, Math.round(((sx - x0) / w) * (n - 1))));
    const v = history[i];
    const px = x0 + (i / Math.max(1, n - 1)) * w;
    const py = 10 + (1 - (v - min) / Math.max(0.01, max - min)) * (120 - 28);
    g.setAttribute('visibility', 'visible');
    g.querySelector('.hx').setAttribute('x1', px);
    g.querySelector('.hx').setAttribute('x2', px);
    g.querySelector('.hc').setAttribute('cx', px);
    g.querySelector('.hc').setAttribute('cy', py);
    const bx = Math.min(px + 8, 640 - 70);
    g.querySelector('.hb').setAttribute('x', bx);
    g.querySelector('.hb').setAttribute('y', Math.max(0, py - 26));
    const t = g.querySelector('.ht');
    t.setAttribute('x', bx + 8);
    t.setAttribute('y', Math.max(0, py - 26) + 14);
    t.textContent = `${v.toFixed(2)}M`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
}

export function renderSummary(hud, s, { again, menu }) {
  const el = document.getElementById('results');
  const stars = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= s.stars ? '' : 'off'}">★</span>`).join('');
  const rows = s.log
    .map((l) => {
      const call = l.golden ? '<span class="pill gold">Golden</span>' : `<span class="pill ${l.yes ? 'yes' : 'no'}">${l.yes ? 'Yes' : 'No'}</span>`;
      const crowd = l.crowd > 0.45 ? 'Loved it' : l.crowd > 0.1 ? 'Liked it' : l.crowd > -0.25 ? 'Lukewarm' : 'Hated it';
      const flags = [l.rushed ? 'rushed' : '', l.stopped === 'buzzers' ? 'buzzed off' : l.stopped === 'player' ? 'you stopped it' : ''].filter(Boolean).join(', ');
      return `<tr><td><b>${escapeHtml(l.name)}</b><br><small>${escapeHtml(l.label)}${flags ? ` · ${flags}` : ''}</small></td><td>${call}</td><td>${crowd}</td><td><span class="bar" style="width:${Math.round(l.talent * 60)}px"></span>${pct(l.talent)}</td></tr>`;
    })
    .join('');
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  el.innerHTML = `
    <div class="paper"><div class="mast"><span>The Daily Spotlight</span><span>${escapeHtml(date)}</span></div><h3>${escapeHtml(s.headline)}</h3></div>
    <div><div class="stars" aria-label="${s.stars} out of 5 stars">${stars}</div><p class="verdict-line">${escapeHtml(s.verdict)}</p></div>
    <div class="tiles">
      <div class="tile"><span>Viewers</span><b>${s.viewers.toFixed(1)}M</b><small>Peak ${s.peak.toFixed(1)}M</small></div>
      <div class="tile"><span>Crowd approval</span><b>${s.approval}%</b><small>How the room felt about you</small></div>
      <div class="tile"><span>Panel respect</span><b>${s.respect}%</b><small>${s.judges.map((j) => `${escapeHtml(j.name.split(' ')[0])} ${j.respect}%`).join(' · ')}</small></div>
      <div class="tile"><span>Talent eye</span><b>${s.eye}%</b><small>Calls that matched real talent</small></div>
    </div>
    <div class="chart"><h4>Viewers at home, millions</h4>${viewersChart(s.history, s.peak)}</div>
    <div><h4>Your calls — and how good they really were</h4><div class="table-wrap"><table class="log"><thead><tr><th>Act</th><th>Your call</th><th>Crowd</th><th>Real talent</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="buttons"><button type="button" class="go" id="r-again">Another episode</button><button type="button" class="ghost" id="r-menu">Menu</button></div>`;
  bindChart(el, s.history);
  el.querySelector('#r-again').onclick = again;
  el.querySelector('#r-menu').onclick = menu;
  hud.showScreen('screen-results');
  document.getElementById('screen-results').scrollTop = 0;
}
