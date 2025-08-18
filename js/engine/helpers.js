// js/engine/helpers.js
import { RAW, SD, r, clamp } from '../util.js';
import { TITLES, buildFixedRoster, ATTR_OVERRIDES } from '../data.js';

// ---------- small utils ----------
export const keyFromNames = (namesArr) =>
  [...namesArr].sort((a, b) => a.localeCompare(b)).join(' | ');

export const uniqSorted = (arr) =>
  [...new Set(arr)].sort((a, b) => a.localeCompare(b));

// Lookups
export const byBrand          = (state, b) => state.roster.filter(w => w.brand === b);
export const availableByBrand = (state, b) =>
  state.roster.filter(w => w.brand === b && w.injuryWeeks === 0 && !w.retired);
export const men              = list => list.filter(w => w.gender === 'M');
export const women            = list => list.filter(w => w.gender === 'F');
export const getW             = (state, n) => state.roster.find(w => w.name === n);

// Cruiserweight helper
export function cruisers(list){
  return (list || []).filter(w =>
    w.gender === 'M' &&
    (w.styleTags || []).some(t => /cruiser|high flyer/i.test(String(t)))
  );
}

// Simple AI helpers
const scoreForTop = w => w.starpower * 1.2 + w.momentum + r(-10, 10);

export function pickTop(list, offset = 0){
  if (!list.length) return null;
  const s = [...list].map(w => ({ w, s: scoreForTop(w) })).sort((a, b) => b.s - a.s);
  return s[Math.min(offset, s.length - 1)].w.name;
}

export function pairForTag(list){
  if (list.length < 2) return null;
  const a = pickTop(list, 0);
  const b = pickTop(list.filter(x => x.name !== a), 0);
  return a && b ? [a, b] : null;
}

// UI color for scores
export function scoreColor(score) {
  if (score >= 90) return '#5dade2'; // light blue
  if (score >= 75) return '#2ecc71'; // green
  if (score >= 60) return '#e67e22'; // orange/yellow
  return '#e74c3c';                  // red
}

// ---------- Headshots (Pages-safe) ----------
const HEADSHOT_DIR = 'img/wrestlers';
const EXT_ORDER_DEFAULT = ['webp', 'png', 'jpg', 'jpeg'];

export function slugifyName(name){
  return String(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function headshotUrl(name, preferExt = 'webp'){
  return `${HEADSHOT_DIR}/${slugifyName(name)}.${preferExt}`;
}

export function setHeadshot(imgEl, nameOrSlug, exts = EXT_ORDER_DEFAULT){
  const isSlug = /^[a-z0-9-]+$/.test(String(nameOrSlug));
  const slug = isSlug ? String(nameOrSlug) : slugifyName(nameOrSlug);

  let i = 0;
  const tryNext = () => {
    if (i >= exts.length) {
      imgEl.onerror = null;
      return;
    }
    imgEl.src = `${HEADSHOT_DIR}/${slug}.${exts[i++]}`;
  };

  imgEl.onerror = tryNext;
  tryNext();
}

export function headshotImg(name, opts = {}){
  const { className = 'avatar', width = 48, height = 48, alt } = opts;
  const img = document.createElement('img');
  img.className = className;
  img.width = width;
  img.height = height;
  img.alt = alt || name;
  setHeadshot(img, name);
  return img;
}

// ---------- re-exports ----------
export {
  RAW, SD, TITLES, buildFixedRoster, ATTR_OVERRIDES, r, clamp
};
