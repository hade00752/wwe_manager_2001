// public/js/ui/wrestler_selector.js

import { el } from '../util.js';
import { headshotImg } from '../engine.js';

export function openWrestlerSelector({
  roster,
  side = 'A',
  onSelect,
  lockedName = null
}) {
  const overlay = el('div', { class: 'ws-overlay' });
  const frame   = el('div', { class: 'ws-frame ws-' + side });

  let selectedIndex = roster.findIndex(w => w.name === lockedName);
  if (selectedIndex < 0) selectedIndex = 0;

  const left = el('div', { class: 'ws-card ws-left' });
  const right = el('div', { class: 'ws-card ws-right' });

  const vs = el('div', { class: 'ws-vs', text: 'VS' });

  frame.append(left, vs, right);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  function render() {
    renderCard(left, roster[selectedIndex], '1P');
    renderCard(
      right,
      roster[(selectedIndex + 1) % roster.length],
      'COM'
    );
  }

  function renderCard(root, w, tag) {
    root.innerHTML = '';

    root.appendChild(el('div', { class: 'ws-tag', text: tag }));

    const img = headshotImg(w.name, { className: 'ws-portrait' });
    img.onerror = () => img.replaceWith(el('div', {
      class: 'ws-portrait fallback',
      text: w.name.split(' ').map(n=>n[0]).join('')
    }));

    root.appendChild(img);

    root.appendChild(el('div', { class: 'ws-name', text: w.name }));

    const stats = el('div', { class: 'ws-stats' });
    stats.append(
      statRow('OVERALL', w.overall ?? '—'),
      statRow('FATIGUE', w.fatigue ?? 0),
      statRow('STATUS', w?.status?.champion ? 'CHAMPION' : 'ACTIVE')
    );

    root.appendChild(stats);
  }

  function statRow(label, value) {
    const r = el('div', { class: 'ws-stat' });
    r.append(
      el('span', { text: label }),
      el('strong', { text: value })
    );
    return r;
  }

  function cleanup() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function confirm() {
    cleanup();
    onSelect(roster[selectedIndex]);
  }

  function onKey(e) {
    if (e.key === 'ArrowLeft') {
      selectedIndex = (selectedIndex - 1 + roster.length) % roster.length;
      render();
    }
    if (e.key === 'ArrowRight') {
      selectedIndex = (selectedIndex + 1) % roster.length;
      render();
    }
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cleanup();
  }

  overlay.onclick = (e) => {
    if (e.target === overlay) cleanup();
  };

  document.addEventListener('keydown', onKey);
  render();
}
