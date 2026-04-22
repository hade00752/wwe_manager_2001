// js/engine/attr_ledger.js
// Full attribute ledger + weekly snapshots for charts.
//
// Ledger: state.attrLedger[week][wrestlerName] = [{ attr, delta, why, ref, at }]
// History: state.attrHistory[week][wrestlerName] = { values:{...}, at }
//
// Backwards compatible: if missing, created lazily.

import { clamp } from '../util.js';

export const ATTR_KEYS = [
  'workrate','psychology','charisma','mic','chemistry',
  'starpower','reputation','likeability','consistency',
  'momentum','morale',
  'stamina','durability','strengthPower','agility','athleticism',
  'ringSafety','fatigue'
];

export function ensureAttrStores(state){
  state.attrLedger  = (state.attrLedger  && typeof state.attrLedger  === 'object') ? state.attrLedger  : {};
  state.attrHistory = (state.attrHistory && typeof state.attrHistory === 'object') ? state.attrHistory : {};
}

function numberOr(v, fb){
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function getAttr(w, key){
  if (key === 'fatigue') return numberOr(w.fatigue, 0);
  if (key === 'morale')  return numberOr(w.morale, 65);
  return numberOr(w[key], 60);
}

function clampAttr(key, v){
  // Centralized ranges. Keep this authoritative.
  if (key === 'fatigue') return clamp(numberOr(v, 0), 0, 100);
  if (key === 'morale')  return clamp(numberOr(v, 65), 0, 100);
  return clamp(numberOr(v, 60), 0, 99);
}

export function setAttr(w, key, v){
  if (!w) return;
  if (key === 'fatigue') w.fatigue = clampAttr(key, v);
  else if (key === 'morale') w.morale = clampAttr(key, v);
  else w[key] = clampAttr(key, v);
}

export function logAttr(state, week, name, attr, delta, why, ref){
  ensureAttrStores(state);
  const w = Number(week || state.week || 1);

  if (!state.attrLedger[w]) state.attrLedger[w] = {};
  if (!Array.isArray(state.attrLedger[w][name])) state.attrLedger[w][name] = [];

  state.attrLedger[w][name].push({
    attr,
    delta: Math.round(Number(delta || 0)),
    why: String(why || '').slice(0, 240),
    ref: (ref && typeof ref === 'object') ? ref : (ref != null ? { ref } : null),
    at: Date.now()
  });
}

export function applyAttrDelta(state, week, wObj, attr, delta, why, ref){
  if (!wObj) return;
  const d = Math.round(Number(delta || 0));
  if (!d) return;

  const before = getAttr(wObj, attr);
  setAttr(wObj, attr, before + d);

  // Only log if it actually changed (clamps can flatten it)
  const final = getAttr(wObj, attr);
  const actual = Math.round(final - before);
  if (actual) logAttr(state, week, wObj.name, attr, actual, why, ref);
}

export function captureWeeklySnapshot(state, week){
  ensureAttrStores(state);
  if (!Array.isArray(state.roster)) return;

  const w = Number(week || state.week || 1);
  if (!state.attrHistory[w]) state.attrHistory[w] = {};

  for (const p of state.roster){
    if (!p || !p.name) continue;
    const values = {};
    for (const k of ATTR_KEYS) values[k] = getAttr(p, k);
    state.attrHistory[w][p.name] = { values, at: Date.now() };
  }
}

// ── Week-baseline snapshot (merged from snapshots.js) ───────────────
// Writes to state.snapshots.weekBaseline for profile delta views,
// and also to per-wrestler localStorage for older UI pages.
function makeSnapOf(w) {
  const out = {};
  ATTR_KEYS.forEach(k => {
    if (k === 'morale')  out[k] = Number(w[k] ?? 65);
    else if (k === 'fatigue') out[k] = Number(w[k] ?? 0);
    else out[k] = Number(w[k] ?? 60);
  });
  return out;
}

export function getBaselineValues(state, name) {
  const map = state.snapshots?.weekBaseline;
  if (map?.[name]?.values) return { ...map[name].values };
  try {
    const raw = localStorage.getItem(`wwf_attr_snap_v1::${name}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj?.values) return { ...obj.values };
  } catch {}
  return null;
}

export function computeAttrDeltas(w, base) {
  if (!base) return {};
  const d = {};
  const fb = (k) => (k === 'morale') ? 65 : 60;
  for (const k of ATTR_KEYS) {
    const now  = (k === 'fatigue') ? Number(w.fatigue ?? 0) : Number(w[k] ?? fb(k));
    const then = Number(base[k]);
    if (!Number.isFinite(then)) continue;
    const diff = Math.round(now - then);
    if (diff !== 0) d[k] = diff;
  }
  return d;
}

export function snapshotWeekBaseline(state) {
  if (!state || !Array.isArray(state.roster)) return;
  state.snapshots = state.snapshots || {};
  const week = state.week;
  const memMap = {};

  try {
    state.roster.forEach(w => {
      const values = makeSnapOf(w);
      try { localStorage.setItem(`wwf_attr_snap_v1::${w.name}`, JSON.stringify({ week, values })); } catch {}
      memMap[w.name] = { values };
    });
  } catch {}

  state.snapshots.weekBaseline     = memMap;
  state.snapshots.weekBaselineWeek = week;
}

export function snapshotWeekBaselineOnce(state) {
  state.snapshots = state.snapshots || {};
  if (state.snapshots.weekBaselineWeek === state.week &&
      state.snapshots.weekBaseline &&
      Object.keys(state.snapshots.weekBaseline).length) return;
  snapshotWeekBaseline(state);
}

// Convenience: return a wrestler series for one attr across weeks
export function seriesFor(state, name, attr){
  ensureAttrStores(state);
  const out = [];
  const weeks = Object.keys(state.attrHistory).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  for (const w of weeks){
    const rec = state.attrHistory[w]?.[name]?.values;
    if (!rec) continue;
    out.push({ week: w, value: numberOr(rec[attr], null) });
  }
  return out;
}
