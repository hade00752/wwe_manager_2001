// public/js/mainmenu.js
import { RAW, SD } from './util.js';
import { boot, bootOrNull, saveState, newSeason } from './engine.js';
import { mountMenuSelector } from './ui/menu_selector.js';

const listEl = document.getElementById('menuList');
const footerEl = document.getElementById('menuFooter');

const titleEl = document.getElementById('mmTitle');
const subtitleEl = document.getElementById('mmSubtitle');

// menu_selector expects portrait elements; we’re not using portraits.
const dummyPortraitImgEl = { style: { display: 'none' }, src: '' };
const dummyPortraitQEl   = { style: { display: 'none' } };

init();

function init() {
  const state = bootOrNull(); // may be null

  // Make header feel more “alive”
  if (titleEl) titleEl.textContent = 'WWF GM';
  if (subtitleEl) subtitleEl.textContent = state ? 'Continue your universe' : 'Start a new universe';

  const items = [
    {
      label: 'START NEW — RAW',
      labelHtml: `START NEW — <span style="color:rgba(255,90,90,.95); text-shadow:0 0 12px rgba(255,70,70,.22);">RAW</span>`,
      action: () => startFresh(RAW),
      dim: false
    },
    {
      label: 'START NEW — SMACKDOWN',
      labelHtml: `START NEW — <span style="color:rgba(120,190,255,.95); text-shadow:0 0 12px rgba(120,190,255,.18);">SMACKDOWN</span>`,
      action: () => startFresh(SD),
      dim: false
    },
    state
      ? {
          label: 'CONTINUE CURRENT SAVE',
          action: () => go('./booking.html'),
          dim: false
        }
      : {
          label: 'CONTINUE CURRENT SAVE',
          action: null,
          dim: true
        },
    {
      label: 'DELETE SAVE',
      action: () => { wipeAllSaves(); location.reload(); },
      dim: false
    }
  ];

  renderFooterBadges(state);

  mountMenuSelector({
    listEl,
    portraitImgEl: dummyPortraitImgEl,
    portraitQEl: dummyPortraitQEl,
    items,
    startIndex: getRememberedIndex(items.length),
    onConfirm: (item, idx) => {
      rememberIndex(idx);
      if (!item || typeof item.action !== 'function') return; // disabled
      item.action();
    }
  });

  attachDimObserver(listEl, items);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      initSoftReset();
      e.preventDefault();
    }
  }, { once: true });
}

function initSoftReset() {
  const state = bootOrNull();
  renderFooterBadges(state);
  if (subtitleEl) subtitleEl.textContent = state ? 'Continue your universe' : 'Start a new universe';
}

/* ------------------------- footer UI ------------------------- */

function renderFooterBadges(state) {
  if (!footerEl) return;
  footerEl.innerHTML = '';

  if (state) {
    footerEl.appendChild(makePill(`Week ${state.week} — ${state.startDate || '01-04-2001'}`));

    const isRaw = String(state.brand).toUpperCase().includes('RAW');
    const isSd  = String(state.brand).toUpperCase().includes('SMACK');

    footerEl.appendChild(makePill(`Brand: ${state.brand}`, {
      tone: isRaw ? 'raw' : (isSd ? 'sd' : 'neutral')
    }));
  } else {
    footerEl.appendChild(makePill('No save found'));
  }
}

function makePill(text, opts = {}) {
  const tone = opts.tone || 'neutral';

  const span = document.createElement('span');
  span.style.padding = '8px 12px';
  span.style.borderRadius = '999px';
  span.style.fontSize = '12px';
  span.style.letterSpacing = '.08em';
  span.style.textTransform = 'uppercase';
  span.style.fontWeight = '800';

  span.style.background = 'rgba(10,40,70,.20)';

  if (tone === 'raw') {
    span.style.color = 'rgba(255,210,210,.95)';
    span.style.border = '1px solid rgba(255,90,90,.35)';
    span.style.boxShadow = '0 0 18px rgba(255,70,70,.12)';
  } else if (tone === 'sd') {
    span.style.color = 'rgba(210,235,255,.95)';
    span.style.border = '1px solid rgba(120,190,255,.30)';
    span.style.boxShadow = '0 0 18px rgba(120,190,255,.10)';
  } else {
    span.style.color = 'rgba(220,240,255,.85)';
    span.style.border = '1px solid rgba(140,240,255,.25)';
    span.style.boxShadow = '0 0 18px rgba(120,240,255,.10)';
  }

  span.textContent = text;
  return span;
}

/* ------------------------- dim / disabled styling ------------------------- */

function attachDimObserver(listEl, items) {
  const apply = () => {
    const nodes = [...listEl.querySelectorAll('.menu-item')];
    nodes.forEach((node, i) => {
      const it = items[i];
      if (it?.dim) node.classList.add('is-dim');
      else node.classList.remove('is-dim');
    });
  };

  apply();

  const mo = new MutationObserver(() => apply());
  mo.observe(listEl, { childList: true, subtree: true });
}

/* ------------------------- navigation + persistence ------------------------- */

function go(path) {
  location.href = path;
}

function getRememberedIndex(maxLen) {
  const n = Number(localStorage.getItem('mainmenu_index'));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxLen - 1, n));
}

function rememberIndex(idx) {
  try { localStorage.setItem('mainmenu_index', String(idx)); } catch {}
}

/* ------------------------- original helpers preserved ------------------------- */

function wipeAllSaves() {
  try { localStorage.removeItem('wwf_sim_state_v1'); } catch {}
  try { localStorage.removeItem('wwf_state'); } catch {}
  try { localStorage.removeItem('wwf_booking_payload'); } catch {}
  try { sessionStorage.removeItem('wwf_last_sim_token'); } catch {}
}

function startFresh(brand) {
  wipeAllSaves();

  let fresh = newSeason(brand);
  fresh = boot({ forceNew: true, brand });
  fresh.week = 1;
  fresh.history = [];
  saveState(fresh);

  location.href = './booking.html';
}
