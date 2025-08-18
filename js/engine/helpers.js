// public/js/engine/helpers.js
import { RAW, SD, r, clamp } from '../util.js';
import { TITLES, buildFixedRoster, ATTR_OVERRIDES } from '../data.js';

export const keyFromNames = (namesArr) =>
  [...namesArr].sort((a,b)=>a.localeCompare(b)).join(" | ");
export const uniqSorted = (arr) =>
  [...new Set(arr)].sort((a,b)=>a.localeCompare(b));

// Lookups
export const byBrand          = (state,b)=> state.roster.filter(w=>w.brand===b);
export const availableByBrand = (state,b)=>
  state.roster.filter(w=> w.brand===b && w.injuryWeeks===0 && !w.retired);
export const men              = list => list.filter(w=>w.gender==="M");
export const women            = list => list.filter(w=>w.gender==="F");
export const getW             = (state,n)=> state.roster.find(w=>w.name===n);

// Add this near your other helpers/exports
export function cruisers(list){
  return (list || []).filter(w =>
    w.gender === 'M' &&
    (w.styleTags || []).some(t => /cruiser|high flyer/i.test(String(t)))
  );
}

// Simple AI helpers
const scoreForTop = w => w.starpower*1.2 + w.momentum + r(-10,10);
export function pickTop(list, offset=0){
  if(!list.length) return null;
  const s=[...list].map(w=>({w, s:scoreForTop(w)})).sort((a,b)=>b.s-a.s);
  return s[Math.min(offset, s.length-1)].w.name;
}
export function pairForTag(list){
  if(list.length<2) return null;
  const a=pickTop(list,0);
  const b=pickTop(list.filter(x=>x.name!==a),0);
  return a&&b?[a,b]:null;
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
  return String(name)
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
  img.alt = alt || name;

  let i = 0;
  const tryNextExt = () => {
    if (i >= exts.length) {
      // All attempts failed — leave blank or set a transparent data URI if desired
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

// SINGLE export aggregator — make sure this appears ONLY ONCE in this file.
export {
  RAW, SD, TITLES, buildFixedRoster, ATTR_OVERRIDES, r, clamp
};
