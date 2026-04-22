// public/js/engine/helpers.js
import { RAW, SD, r, clamp } from '../util.js';
import { TITLES } from '../data.js';

export const keyFromNames = (namesArr) =>
  [...(namesArr || [])].sort((a,b)=>String(a).localeCompare(String(b))).join(" | ");

export const uniqSorted = (arr) =>
  [...new Set(arr || [])].sort((a,b)=>String(a).localeCompare(String(b)));

// Lookups (SAFE: never assume state.roster exists)
export const byBrand = (state, b) =>
  (state?.roster || []).filter(w => w?.brand === b);

export const availableByBrand = (state, b) =>
  (state?.roster || []).filter(w => w?.brand === b && (w?.injuryWeeks || 0) === 0 && !w?.retired);

export const men   = (list) => (list || []).filter(w => w?.gender === "M");
export const women = (list) => (list || []).filter(w => w?.gender === "F");

// ✅ Robust wrestler lookup.
// Accepts either (rosterArray, name) OR (stateObject, name).
export function getW(rosterOrState, name){
  if (!name) return null;

  const roster =
    Array.isArray(rosterOrState) ? rosterOrState
    : Array.isArray(rosterOrState?.roster) ? rosterOrState.roster
    : Array.isArray(rosterOrState?.all) ? rosterOrState.all
    : [];

  if (!Array.isArray(roster) || roster.length === 0) return null;

  const key = String(name);

  // exact by name OR id
  let w = roster.find(x => x && (x.name === key || String(x.id ?? '') === key));
  if (w) return w;

  // case-insensitive name
  const low = key.toLowerCase();
  w = roster.find(x => x?.name && String(x.name).toLowerCase() === low);
  return w || null;
}

// Tags
export function cruisers(list){
  return (list || []).filter(w =>
    w?.gender === 'M' &&
    (w?.styleTags || []).some(t => /cruiser|high flyer/i.test(String(t)))
  );
}

// Simple AI helpers
const scoreForTop = w => (w?.starpower || 0) * 1.2 + (w?.momentum || 0) + r(-10, 10);

export function pickTop(list, offset=0){
  const arr = list || [];
  if (!arr.length) return null;
  const s = [...arr]
    .map(w => ({ w, s: scoreForTop(w) }))
    .sort((a,b)=> b.s - a.s);
  return s[Math.min(offset, s.length-1)]?.w?.name || null;
}

export function pairForTag(list){
  const arr = list || [];
  if (arr.length < 2) return null;
  const a = pickTop(arr, 0);
  const b = pickTop(arr.filter(x => x?.name !== a), 0);
  return a && b ? [a, b] : null;
}

// UI color for scores
export function scoreColor(score) {
  if (score >= 90) return "#5dade2"; // light blue
  if (score >= 75) return "#2ecc71"; // green
  if (score >= 60) return "#e67e22"; // orange/yellow
  return "#e74c3c";                  // red
}

// ---- Headshot helpers ----
const HEADSHOT_DIR = '/img/wrestlers';
const EXT_ORDER_DEFAULT = ['webp','png','jpg','jpeg'];

export function slugifyName(name){
  return String(name || '')
    .toLowerCase()
    .replace(/&/g,'and')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}

// Simple URL (no probing). Good for servers where you know the ext.
export function headshotUrl(name, preferExt='webp'){
  return `${HEADSHOT_DIR}/${slugifyName(name)}.${preferExt}`;
}

// Create an <img> that automatically falls back through extensions.
export function headshotImg(name, opts={}) {
  const { className='avatar', width=48, height=48, exts=EXT_ORDER_DEFAULT, alt } = opts;
  const slug = slugifyName(name);
  const img = document.createElement('img');
  img.className = className;
  img.width = width;
  img.height = height;
  img.alt = alt || String(name || '');

  let i = 0;
  const tryNextExt = () => {
    if (i >= exts.length) {
      img.src = '';
      img.onerror = null;
      return;
    }
    img.src = `${HEADSHOT_DIR}/${slug}.${exts[i++]}`;
  };

  img.onerror = tryNextExt;
  tryNextExt();
  return img;
}

// ✅ If you want a tiny “barrel export”, only export what exists in this module
export {
  RAW, SD, TITLES, r, clamp
};
