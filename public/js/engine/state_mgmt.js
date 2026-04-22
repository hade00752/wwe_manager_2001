// public/js/engine/state_mgmt.js
import { RAW, SD, r, clamp } from '../util.js';
import * as Data from '../data.js';
// Inline storage helpers (previously state.js — consolidated here)
const _mem = new Map();

function _canUse(s) {
  try { s.setItem('__t', '1'); s.removeItem('__t'); return true; } catch (e) { return false; }
}

const _HAS_LS = typeof localStorage !== 'undefined' && _canUse(localStorage);

function _store() { return _HAS_LS ? localStorage : null; }

function getJSON(key, def) {
  if (def === undefined) def = null;
  try {
    const s = _store();
    const v = s ? s.getItem(key) : _mem.get(key);
    return v ? JSON.parse(v) : def;
  } catch (e) { return def; }
}

function setJSON(key, val) {
  const seen = new WeakSet();
  const s = JSON.stringify(val, function(k, v) {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
  const store = _store();
  if (store) store.setItem(key, s); else _mem.set(key, s);
}

import { setChampionFlags, stripCrossBrandTitles } from './champions.js';
import { men, women, pickTop, pairForTag, uniqSorted, byBrand } from './helpers.js';
import { defaultRelationships, pruneRelPairs, weeklyPressureSweep } from './relationships.js';
import { pushMail } from './inbox_store.js';
import { applyWeeklyStatusEffects } from './progression.js';
import { TRAIT_EFFECTS } from './traits.js';

/* ------------------------------------------------------------------ */
/* Data module (safe bindings)                                        */
/* ------------------------------------------------------------------ */

// Use whatever exists in ../data.js without hard-failing the module loader
const TITLES = Data.TITLES || { [RAW]: [], [SD]: [] };

// Fallbacks so the sim can still boot even if data exports are mid-refactor
const buildFixedRoster =
  typeof Data.buildFixedRoster === 'function' ? Data.buildFixedRoster : (() => []);

const ATTR_OVERRIDES =
  (Data.ATTR_OVERRIDES && typeof Data.ATTR_OVERRIDES === 'object') ? Data.ATTR_OVERRIDES : {};

// IMPORTANT: only treat DB roster loader as present if actually exported
const HAS_DB_ROSTER_LOADER = (typeof Data.loadRosterFromDb === 'function');
const loadRosterFromDb =
  HAS_DB_ROSTER_LOADER ? Data.loadRosterFromDb : null;

const seedPairExceptions =
  typeof Data.seedPairExceptions === 'function' ? Data.seedPairExceptions : null;

/* ------------------------------------------------------------------ */
/* Storage keys                                                       */
/* ------------------------------------------------------------------ */
export const STORAGE_KEYS = {
  primary: 'wwf_sim_state_v1',
  legacy:  'wwf_state',
};

// Clear absolutely everything for a new save
export function clearAllSimStorage(){
  try { localStorage.removeItem(STORAGE_KEYS.primary); } catch {}
  try { localStorage.removeItem(STORAGE_KEYS.legacy);  } catch {}
  try { localStorage.removeItem('wwf_booking_payload'); } catch {}
  try { sessionStorage.removeItem('wwf_last_sim_token'); } catch {}

  // ✅ ALSO clear per-worker baseline snapshots / ledgers so "new save" is actually new
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('wwf_attr_snap_v1::') ||
        k.startsWith('wwf_attr_ledger_v1') ||
        k.startsWith('wwf_attr_delta_v1')
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

/* ------------------------------------------------------------------ */
/* DB-backed roster hydration (non-breaking, background)              */
/* ------------------------------------------------------------------ */

function parseYearFromStartDate(s){
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(String(s||''));
  return m ? Number(m[3]) : null;
}

function normalizeBrandFromApi(b){
  if (!b) return b;
  const s = String(b).trim();
  if (s.toLowerCase() === 'free agency') return 'FA';
  if (s.toLowerCase() === 'freeagent') return 'FA';
  if (s.toUpperCase() === RAW) return RAW;
  if (s.toUpperCase() === SD) return SD;
  if (s.toLowerCase() === 'smackdown') return SD;
  return s;
}

function bucketTraits(traitIds){
  const out = { core:[], status:[], rare:[] };
  const ids = Array.isArray(traitIds) ? traitIds : [];
  for (const id of ids){
    const cat = TRAIT_EFFECTS?.[id]?.cat;
    if (cat === 'core') out.core.push(id);
    else if (cat === 'status') out.status.push(id);
    else if (cat === 'rare') out.rare.push(id);
    else out.status.push(id);
  }
  out.core   = [...new Set(out.core)];
  out.status = [...new Set(out.status)];
  out.rare   = [...new Set(out.rare)];
  return out;
}

async function hydrateRoster(state){
  // ✅ If DB loader doesn't exist, DO NOT touch roster (prevents wipe -> flicker)
  if (!HAS_DB_ROSTER_LOADER || typeof loadRosterFromDb !== 'function') return;

  const era = Number(state?.era || 200404);

  let roster = null;
  try { roster = await loadRosterFromDb(era); } catch (e) {
    console.warn('loadRosterFromDb failed', e);
    return;
  }

  // ✅ Only adopt roster if it is a non-empty array (never wipe a good roster)
  if (Array.isArray(roster) && roster.length) {
    state.roster = roster;
  }
}

function apiRowToWorker(row){
  const brand = normalizeBrandFromApi(row.brand);

  const w = {
    name: row.name,
    gender: row.gender || 'M',
    birthday: row.birthday || null,
    brand,
    alignment: row.alignment || 'neutral',
    contractAnnual: row.contractAnnual ?? null,

    starpower:  row.starpower  ?? 65,
    workrate:   row.workrate   ?? 64,
    charisma:   row.charisma   ?? 66,
    mic:        row.mic        ?? 66,
    psychology: row.psychology ?? 72,

    stamina:     row.stamina     ?? 70,
    durability:  row.durability  ?? 70,
    consistency: row.consistency ?? 70,
    likeability: row.likeability ?? 70,
    momentum:    row.momentum    ?? 60,
    morale:      row.morale      ?? 65,

    // Extended physical & personality attributes from DB
    athleticism:     row.athleticism     ?? 60,
    agility:         row.agility         ?? 60,
    strengthPower:   row.strengthPower   ?? 60,
    adaptability:    row.adaptability    ?? 65,
    professionalism: row.professionalism ?? 65,
    ringSafety:      row.ringSafety      ?? 65,
    reputation:      row.reputation      ?? 60,

    styleTags: Array.isArray(row.styleTags) ? row.styleTags : [],
    traits: bucketTraits(row.traitIds),

    fatigue: r(5,18),
    injuryWeeks: 0,
    retired: false,
    push: 50,
  };

  return w;
}

let __rosterHydrateInFlight = false;

function hydrateRosterFromApi(state, { force=false } = {}){
  if (__rosterHydrateInFlight) return;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  const era = Number(state?.era || parseYearFromStartDate(state?.startDate) || 200404);
  if (!era || !Number.isFinite(era)) return;

  state._hydratedEra ||= null;
  if (!force && state._hydratedEra === era) return;

  __rosterHydrateInFlight = true;

  fetch(`/api/era/${era}/roster_full`, { cache:'no-store' })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      // Server returns { ok, era, rows: [...] } — unwrap correctly
      const rows = Array.isArray(data) ? data
                 : Array.isArray(data?.rows) ? data.rows
                 : null;
      // ✅ do NOT wipe roster if API returns empty
      if (!rows || !rows.length) return;

      state.roster = rows.map(apiRowToWorker);

      try { normalizeBrandsForTitles(state); } catch {}
      try { stripCrossBrandTitles(state); } catch (e) { console.warn('stripCrossBrandTitles failed', e); }
      try { setChampionFlags(state); } catch (e) { console.warn('setChampionFlags failed', e); }

      state.era = era;
      state._hydratedEra = era;

      try { saveState(state); } catch(e) { console.warn('saveState failed', e); }
      try { window.dispatchEvent(new CustomEvent('wwf:roster-updated', { detail:{ era } })); } catch {}
    })
    .catch(()=>{})
    .finally(()=>{ __rosterHydrateInFlight = false; });
}

/* ------------------------------------------------------------------ */
/* DB-backed relationships hydration (background, non-breaking)        */
/* ------------------------------------------------------------------ */

let __relsHydrateInFlight = false;

function hydrateRelDbPairsFromApi(state, { force=false } = {}){
  if (__relsHydrateInFlight) return;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  const era = Number(state?.era || parseYearFromStartDate(state?.startDate) || 200404);
  if (!era || !Number.isFinite(era)) return;

  state._relsHydratedEra ||= null;
  if (!force && state._relsHydratedEra === era) return;

  __relsHydrateInFlight = true;

  fetch(`/api/era/${era}/relationships_map`, { cache:'no-store' })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      const pairs = data?.pairs;
      if (!pairs || typeof pairs !== 'object') return;

      state.relDbPairs = pairs;
      state._relsHydratedEra = era;

      try { saveState(state); } catch(e){ console.warn('saveState failed', e); }
      try { window.dispatchEvent(new CustomEvent('wwf:rels-updated', { detail:{ era } })); } catch {}
    })
    .catch(()=>{})
    .finally(()=>{ __relsHydrateInFlight = false; });
}

/** Force-refresh DB relationship pairs from the API (for pages that need fresh data). */
export function forceHydrateRelPairs(state){
  if (!state) return;
  state._relsHydratedEra = null; // clear cache flag so hydration re-runs
  hydrateRelDbPairsFromApi(state, { force: true });
}

/* ------------------------------------------------------------------ */
/* Default State Shape                                                */
/* ------------------------------------------------------------------ */
export function defaultState(brand = RAW){
  return {
    week: 1,
    brand,
    era: 200404,
    startDate: '01-04-2004',
    roster: buildFixedRoster(),
    champs: { [RAW]:{}, [SD]:{} },
    history: [],
    matches: {},
    matchHistory: { [RAW]:[], [SD]:[] },
    segIndex: {},
    snapshots: { weekBaseline: {} },
    lastWeekKeys: { [RAW]:[], [SD]:[] },
    storylines: { [RAW]:[], [SD]:[] },
    chemistry: {},
    relationships: defaultRelationships(),
    inbox: [],
    inboxAll: [],
    afterglow: { [RAW]:0, [SD]:0, ttl:{ [RAW]:0, [SD]:0 } },
    ppvHistory: [],
    socialGroups:   { RAW: [], SD: [] },
    groupRivalries: [],
    _grpMailSeen:   {},
    hotMatches: {},
    flags: { welcomeSent:false },
    mentorships: {
      slots: [
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] }
      ]
    },
    _mailSeq: 1,
    _hydratedEra: null,
    _relsHydratedEra: null,
  };
}

/* ------------------------------------------------------------------ */
/* Champion Seed                                                      */
/* ------------------------------------------------------------------ */
// ✅ Prefer CHAMPION_SEED from data.js if it exists, otherwise fallback
export const CHAMPION_SEED = (Data.CHAMPION_SEED && typeof Data.CHAMPION_SEED === 'object')
  ? Data.CHAMPION_SEED
  : ({
      [RAW]: {
        "World":            "Triple H",
        "Intercontinental": "Kane",
        "Tag":              ["Chris Jericho", "Christian"],
        "Women":            "Chyna",
      },
      [SD]: {
        "World":         "Kurt Angle",
        "United States": "Big Show",
        "Tag":           ["Eddie Guerrero", "Edge"],
        "Cruiserweight": "Billy Kidman",
      }
    });

function normalizeBrandsForTitles(state){
  if (!state || !Array.isArray(state.roster)) return;
  state.roster.forEach(w=>{
    const b = String(w?.brand ?? '').trim().toLowerCase();
    if (b === 'free agency' || b === 'freeagent') w.brand = 'FA';
    else if (b === 'smackdown') w.brand = SD;
    else if (b === 'raw') w.brand = RAW;
  });
}

function calcOverall(w) {
  const promoLike = ((w.charisma ?? w.promo ?? 60) + (w.mic ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons  = w.consistency ?? 60;
  const o = Math.round(
    (w.workrate  ?? 60) * 0.30 +
    (w.starpower ?? 60) * 0.25 +
    promoLike * 0.15 +
    (w.momentum  ?? 60) * 0.10 +
    psych * 0.10 +
    cons * 0.10
  );
  return Math.max(1, Math.min(99, o));
}

export function applyFixedChampions(state, seed = CHAMPION_SEED){
  state.champs = { [RAW]:{}, [SD]:{} };
  for (const brand of [RAW, SD]){
    const m = seed[brand] || {};
    for (const [title, holder] of Object.entries(m)){
      state.champs[brand][title] = holder;
    }
  }
}

function needsChampionSeed(state){
  const c = state?.champs;
  if (!c || typeof c !== 'object') return true;
  const r = c[RAW], s = c[SD];
  if (!r || !s) return true;

  // If someone saved {RAW:{}, SD:{}} or missing keys → seed
  if (Object.keys(r).length === 0 || Object.keys(s).length === 0) return true;

  // If all configured titles are null/empty → seed
  const rawTitles = Array.isArray(TITLES?.[RAW]) ? TITLES[RAW] : [];
  const sdTitles  = Array.isArray(TITLES?.[SD])  ? TITLES[SD]  : [];

  const allVacant = (brand, titles) => titles.length
    ? titles.every(t => !c?.[brand]?.[t])
    : false;

  if (allVacant(RAW, rawTitles) || allVacant(SD, sdTitles)) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/* Mail helpers (ID hardening)                                        */
/* ------------------------------------------------------------------ */
function djb2Hash(str){
  let h = 5381;
  const s = String(str || '');
  for (let i=0; i<s.length; i++){
    h = ((h << 5) + h) + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

function mailSig(m){
  if (!m || typeof m !== 'object') return 'null';
  const wk = String(m.week ?? '');
  const br = String(m.brand ?? '');
  const t  = String(m.title ?? m.subject ?? '');
  const bo = String(m.body ?? m.text ?? '');
  const f  = String(m.from ?? m.actor ?? m.sender ?? '');
  return `${wk}::${br}::${t}::${bo}::${f}`;
}

function ensureMailIds(state){
  const all = Array.isArray(state.inboxAll) ? state.inboxAll : [];
  if (!all.length) return;

  if (!Number.isFinite(Number(state._mailSeq))) state._mailSeq = 1;

  const counts = new Map();

  for (let i=0; i<all.length; i++){
    const m = all[i];
    if (!m || typeof m !== 'object') continue;

    if (m.week == null) m.week = state.week || 1;
    if (!m.brand) m.brand = state.brand || RAW;

    const id = m.id;
    if (typeof id !== 'string' || !id.trim()){
      const sig = mailSig(m);
      const base = djb2Hash(sig);
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);

      const season = String(state._seasonId || 'S');
      m.id = `mail:${season}:${base}:${n}`;

      if (!m.id) {
        m.id = `mail:${season}:${Date.now()}:${state._mailSeq++}`;
      }
    }
  }

  if (!Array.isArray(state.inbox)) state.inbox = [];
}

/* ------------------------------------------------------------------ */
/* State reconciliation (primary ↔ legacy)                            */
/* ------------------------------------------------------------------ */
function scoreProgress(s){
  const hist = Array.isArray(s?.history) ? s.history.length : 0;
  const week = Number(s?.week || 1);
  return hist * 1000 + week;
}

function pickLonger(a, b){
  if (Array.isArray(a) && Array.isArray(b)) return (b.length > a.length) ? b : a;
  return Array.isArray(a) ? a : (Array.isArray(b) ? b : []);
}

function mergeMatchHistory(aMH = {}, bMH = {}){
  const out = {};
  for (const brand of [RAW, SD]){
    const A = Array.isArray(aMH[brand]) ? aMH[brand] : [];
    const B = Array.isArray(bMH[brand]) ? bMH[brand] : [];
    out[brand] = pickLonger(A, B);
  }
  return out;
}

function mergeSnapshots(a = {}, b = {}){
  const out = { ...a, ...b };
  out.weekBaseline = { ...(a?.weekBaseline||{}), ...(b?.weekBaseline||{}) };
  return out;
}

function mergeInboxAll(aAll, bAll){
  const A = Array.isArray(aAll) ? aAll : [];
  const B = Array.isArray(bAll) ? bAll : [];

  if (!A.length && B.length) return B.slice();
  if (!B.length && A.length) return A.slice();
  if (!A.length && !B.length) return [];

  const seen = new Set();
  const out = [];

  for (const m of [...B, ...A]){
    if (!m || typeof m !== 'object') continue;
    const k = mailSig(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }

  return out;
}

function reconcileStates(a, b){
  if (!a && !b) return null;
  if (a && !b)  return a;
  if (!a && b)  return b;

  const newer  = scoreProgress(a) >= scoreProgress(b) ? a : b;
  const older  = newer === a ? b : a;

  const merged = Object.assign({}, older, newer);

  const histA = Array.isArray(a.history) ? a.history : [];
  const histB = Array.isArray(b.history) ? b.history : [];
  merged.history = histA.length >= histB.length ? histA : histB;

  merged.week = Math.max(Number(a.week || 1), Number(b.week || 1));

  const inboxA = Array.isArray(a.inbox) ? a.inbox : [];
  const inboxB = Array.isArray(b.inbox) ? b.inbox : [];
  const sig = (m) => {
    if (!m || typeof m !== 'object') return 'NULL_MSG';
    const t = (m.title ?? m.subject ?? '').toString();
    const bo = (m.body ?? m.text ?? '').toString();
    const f = (m.from ?? m.sender ?? '').toString();
    return `${t}::${bo}::${f}`;
  };
  const seen = new Set();
  merged.inbox = [...inboxA, ...inboxB]
    .filter(m => m && typeof m === 'object')
    .filter(m => {
      const k = sig(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  merged.inboxAll = mergeInboxAll(a?.inboxAll, b?.inboxAll);

  merged.flags = Object.assign({}, a.flags||{}, b.flags||{});
  const sameSeason =
    (a?._seasonId && b?._seasonId && a._seasonId === b._seasonId) ||
    (!a?._seasonId && !b?._seasonId);
  if (sameSeason && (a?.flags?.welcomeSent || b?.flags?.welcomeSent)) {
    merged.flags.welcomeSent = true;
  }

  merged.matches      = { ...(a?.matches||{}), ...(b?.matches||{}), ...(merged?.matches||{}) };
  merged.matchHistory = mergeMatchHistory(a?.matchHistory, b?.matchHistory);
  merged.segIndex     = { ...(a?.segIndex||{}), ...(b?.segIndex||{}), ...(merged?.segIndex||{}) };
  merged.snapshots    = mergeSnapshots(a?.snapshots, b?.snapshots);

  merged._seasonId = a?._seasonId || b?._seasonId || merged._seasonId;

  try { ensureMailIds(merged); } catch {}

  return merged;
}

/* ------------------------------------------------------------------ */
/* Load / Save                                                        */
/* ------------------------------------------------------------------ */
export function loadState(){
  const primary = getJSON(STORAGE_KEYS.primary);
  const legacy  = getJSON(STORAGE_KEYS.legacy);
  const merged  = reconcileStates(primary, legacy);

  if (merged) {
    try { setJSON(STORAGE_KEYS.primary, merged); } catch {}
    try { setJSON(STORAGE_KEYS.legacy,  merged); } catch {}
  }
  return merged || null;
}

export function saveState(next){
  let out = null;
  try{
    const disk = loadState();
    out = { ...(disk||{}), ...(next||{}) };

    const diskAll = Array.isArray(disk?.inboxAll) ? disk.inboxAll : [];
    const nextAll = Array.isArray(next?.inboxAll) ? next.inboxAll : [];
    out.inboxAll = (nextAll.length >= diskAll.length) ? nextAll : diskAll;

    if (disk && typeof disk.week === 'number' && typeof next?.week === 'number') {
      if (next.week < disk.week) {
        out.week = disk.week;
        if (disk.startDate && next.startDate) out.startDate = disk.startDate;
      }
    }

    if (disk && disk._seasonId && !out._seasonId) out._seasonId = disk._seasonId;

    if (Array.isArray(disk?.history) && Array.isArray(next?.history)) {
      out.history = (next.history.length >= disk.history.length) ? next.history : disk.history;
    }

    out.matches = { ...(disk?.matches||{}), ...(next?.matches||{}), ...(out?.matches||{}) };

    const mh = mergeMatchHistory(disk?.matchHistory, next?.matchHistory);
    out.matchHistory = Object.keys(mh).length ? mh : (out.matchHistory || { [RAW]:[], [SD]:[] });

    out.segIndex  = { ...(disk?.segIndex||{}), ...(next?.segIndex||{}), ...(out?.segIndex||{}) };

    const snap = mergeSnapshots(disk?.snapshots, next?.snapshots);
    out.snapshots = Object.keys(snap).length ? snap : (out.snapshots || { weekBaseline: {} });

    out.inboxAll = mergeInboxAll(disk?.inboxAll, next?.inboxAll);
    if (!Array.isArray(out.inboxAll)) out.inboxAll = [];
    if (!Array.isArray(out.inbox)) out.inbox = Array.isArray(disk?.inbox) ? disk.inbox : [];

    try { ensureMailIds(out); } catch(e){ console.warn('ensureMailIds failed', e); }

    setJSON(STORAGE_KEYS.primary, out);
    try { setJSON(STORAGE_KEYS.legacy, out); } catch {}
  } catch (e){
    console.warn('saveState failed', e);
  }

  try {
    if (out && typeof out === 'object') {
      weeklyPressureSweep(out);
      try { applyWeeklyStatusEffects(out); } catch (e) { console.warn('applyWeeklyStatusEffects failed', e); }
    }
  } catch (e) {
    console.warn('weeklyPressureSweep failed', e);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Sim clock helpers                                                  */
/* ------------------------------------------------------------------ */
function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
function addDays(d, days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }

export function simNow(state){
  const base = parseDDMMYYYY(state?.startDate || '01-04-2004') || new Date(2004,3,1);
  const weeks = Math.max(0, (state?.week||1)-1);
  return addDays(base, weeks*7);
}
export function simDateString(state){
  const d = simNow(state);
  const pad=n=>String(n).padStart(2,'0');
  return `Week ${state?.week||1} — ${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
}
export function advanceSimWeek(state, n=1){
  state.week = Math.max(1,(state.week||1)+n);
}

/* ------------------------------------------------------------------ */
/* Storyline normaliser                                               */
/* ------------------------------------------------------------------ */
function normalizeStory(s){
  if(!s) return null;
  if(s.set && s.set instanceof Set){
    s = { names:[...s.set], heat:s.heat||0, weeks:s.weeks||0 };
  }
  if(Array.isArray(s.names)) s.names = uniqSorted(s.names);
  return s;
}

/* ------------------------------------------------------------------ */
/* New Season bootstrap                                               */
/* ------------------------------------------------------------------ */
export function newSeason(brand = RAW, { useChampionSeed=true } = {}){
  const state = defaultState(brand);

  normalizeBrandsForTitles(state);

  if (useChampionSeed) {
    applyFixedChampions(state, CHAMPION_SEED);
  } else {
    const cruisersSD = men(byBrand(state, SD))
      .filter(w => (w.styleTags||[]).some(t => /cruiser/i.test(t)));
    state.champs = {
      [RAW]: {
        "World":            pickTop(men(byBrand(state, RAW))),
        "Intercontinental": pickTop(men(byBrand(state, RAW)), 1),
        "Tag":              pairForTag(men(byBrand(state, RAW))),
        "Women":            pickTop(women(byBrand(state, RAW)))
      },
      [SD]: {
        "World":         pickTop(men(byBrand(state, SD))),
        "United States": pickTop(men(byBrand(state, SD)), 1),
        "Tag":           pairForTag(men(byBrand(state, SD))),
        "Cruiserweight": pickTop(cruisersSD.length?cruisersSD:men(byBrand(state, SD)))
      }
    };
  }

  stripCrossBrandTitles(state);
  weeklyPressureSweep(state);

  try { seedPairExceptions?.(state); } catch {}

  if (!state._seasonId) state._seasonId = "S" + Date.now();

  // Vince’s welcome email
  state.flags = state.flags || {};
  if (!state.flags.welcomeSent) {
    const other = brand === RAW ? SD : RAW;
    const top3 = [...byBrand(state, brand)]
      .map(w=>({n:w.name,ov:calcOverall(w)}))
      .sort((a,b)=>b.ov-a.ov).slice(0,3);

    const body = [
      `Welcome, manager of ${brand}.`,
      ``,
      `Your aim this season is simple: beat ${other} in ratings and revenue.`,
      `Top stars to build around:`,
      `• ${top3[0]?.n ?? '—'} (OVR ${top3[0]?.ov ?? '—'})`,
      `• ${top3[1]?.n ?? '—'} (OVR ${top3[1]?.ov ?? '—'})`,
      `• ${top3[2]?.n ?? '—'} (OVR ${top3[2]?.ov ?? '—'})`,
      ``,
      `Current champions:`,
      ...(TITLES[brand] || []).map(t =>
        `• ${t}: ${Array.isArray(state.champs[brand][t]) ? state.champs[brand][t].join(' & ') : (state.champs[brand][t]||'Vacant')}`
      )
    ].join('\n');

    pushMail(state, { title:`Season Briefing — ${brand}`, from:'Vince McMahon', body });
    state.flags.welcomeSent = true;
  }

  try { ensureMailIds(state); } catch {}

  try { hydrateRosterFromApi(state); } catch {}
  try { hydrateRelDbPairsFromApi(state); } catch {}

  return state;
}

/* ------------------------------------------------------------------ */
/* Ensure state initialised                                           */
/* ------------------------------------------------------------------ */
export async function ensureInitialised(state){
  state = (state && typeof state==='object') ? state : {};

  // ✅ crucial: this will no-op unless DB loader exists AND returns non-empty roster
  await hydrateRoster(state);

  try { seedPairExceptions?.(state); } catch {}

  if (state.week==null) state.week=1;
  if (!state.startDate) state.startDate='01-04-2004';
  if (!state.era) state.era = Number(parseYearFromStartDate(state.startDate) || 200404);
  if (!state._seasonId) state._seasonId="S"+Date.now();

  // 🔧 Ensure viewer-critical containers always exist
  if (!state.matches || typeof state.matches !== 'object' || Array.isArray(state.matches)) {
    state.matches = {};
  }
  if (!state.matchHistory || typeof state.matchHistory !== 'object' || Array.isArray(state.matchHistory)) {
    state.matchHistory = { [RAW]:[], [SD]:[] };
  } else {
    state.matchHistory[RAW] = Array.isArray(state.matchHistory[RAW]) ? state.matchHistory[RAW] : [];
    state.matchHistory[SD]  = Array.isArray(state.matchHistory[SD])  ? state.matchHistory[SD]  : [];
  }
  if (!state.segIndex || typeof state.segIndex !== 'object' || Array.isArray(state.segIndex)) {
    state.segIndex = {};
  }
  if (!state.snapshots || typeof state.snapshots !== 'object' || Array.isArray(state.snapshots)) {
    state.snapshots = { weekBaseline: {} };
  } else if (!state.snapshots.weekBaseline || typeof state.snapshots.weekBaseline !== 'object'){
    state.snapshots.weekBaseline = {};
  }

  // Relationships (legacy edges) must be an ARRAY
  if (!Array.isArray(state.relationships)) {
    state.relationships = defaultRelationships();
  }

  // Pair model container must be a POJO
  if (!state.relPairs || typeof state.relPairs !== 'object' || Array.isArray(state.relPairs)) {
    state.relPairs = {};
  }

  try { pruneRelPairs(state, { maxKeep: 900 }); } catch {}

  // ✅ FIX: if champs exist but are empty/vacant, seed them (do NOT require full newSeason)
  if (needsChampionSeed(state)) {
    try { applyFixedChampions(state, CHAMPION_SEED); } catch {}
  }

  // If champs containers are *missing entirely*, do full bootstrap
  if (!state.champs || !state.champs[RAW] || !state.champs[SD]) {
    const bootstrap=newSeason(state.brand||RAW,{useChampionSeed:true});
    const preserved={
      week:state.week,
      startDate:state.startDate,
      era: state.era || bootstrap.era,
      history:Array.isArray(state.history)?state.history:[],
      matches: state.matches || {},
      matchHistory: state.matchHistory || { [RAW]:[], [SD]:[] },
      segIndex: state.segIndex || {},
      snapshots: state.snapshots || { weekBaseline: {} },
      brand:state.brand||bootstrap.brand,
      roster:Array.isArray(state.roster)?state.roster:bootstrap.roster,
      inbox:Array.isArray(state.inbox)?state.inbox:[],
      inboxAll: Array.isArray(state.inboxAll) ? state.inboxAll : [],
      flags:(state.flags&&typeof state.flags==='object')?state.flags:(bootstrap.flags||{}),
      _seasonId:state._seasonId||bootstrap._seasonId,
      _mailSeq: Number.isFinite(Number(state._mailSeq)) ? state._mailSeq : (bootstrap._mailSeq || 1),
      _hydratedEra: state._hydratedEra ?? bootstrap._hydratedEra ?? null,
      _relsHydratedEra: state._relsHydratedEra ?? bootstrap._relsHydratedEra ?? null,
    };
    state=Object.assign({},bootstrap,state,preserved);
  }

  state.history=Array.isArray(state.history)?state.history:[];
  state.flags=(state.flags&&typeof state.flags==='object')?state.flags:{};
  state.lastWeekKeys=(state.lastWeekKeys&&typeof state.lastWeekKeys==='object')?state.lastWeekKeys:{[RAW]:[],[SD]:[]};
  state.storylines=(state.storylines&&typeof state.storylines==='object')?state.storylines:{[RAW]:[],[SD]:[]};
  state.storylines[RAW]=(state.storylines[RAW]||[]).map(normalizeStory);
  state.storylines[SD]=(state.storylines[SD]||[]).map(normalizeStory);
  state.chemistry=(state.chemistry&&typeof state.chemistry==='object')?state.chemistry:{};
  state.hotMatches=(state.hotMatches&&typeof state.hotMatches==='object')?state.hotMatches:{};
  state.afterglow=(state.afterglow&&typeof state.afterglow==='object')?state.afterglow:{[RAW]:0,[SD]:0,ttl:{[RAW]:0,[SD]:0}};
  if(!state.afterglow.ttl) state.afterglow.ttl={[RAW]:0,[SD]:0};
  if(!Array.isArray(state.inbox)) state.inbox=[];
  if (!Array.isArray(state.inboxAll)) state.inboxAll = [];

  try { ensureMailIds(state); } catch(e){ console.warn('ensureMailIds failed', e); }

  if (!state.mentorships || !Array.isArray(state.mentorships.slots)) {
    state.mentorships=defaultState(state.brand||RAW).mentorships;
  } else {
    state.mentorships.slots=state.mentorships.slots.map(s=>({
      mentor:s?.mentor??null,
      mentees:Array.isArray(s?.mentees)?s.mentees.slice(0,3).filter(Boolean):[]
    }));
    while(state.mentorships.slots.length<5) state.mentorships.slots.push({mentor:null,mentees:[]});
    if(state.mentorships.slots.length>5) state.mentorships.slots=state.mentorships.slots.slice(0,5);
  }

  state.roster=Array.isArray(state.roster)?state.roster:[];
  state.roster.forEach(w=>{
    if(typeof w.fatigue!=='number')w.fatigue=r(5,18);
    if(typeof w.injuryWeeks!=='number')w.injuryWeeks=0;
    if(typeof w.retired!=='boolean')w.retired=false;

    const rawMorale = w.morale;
    const m = Number(rawMorale);
    if (!Number.isFinite(m)) w.morale = 65;
    else w.morale = clamp(m, 0, 100);

    const o = ATTR_OVERRIDES[w.name];
    if(o){
      if(typeof w.charisma!=='number')w.charisma=o.charisma;
      if(typeof w.mic!=='number')w.mic=o.mic;
      if(typeof w.psychology!=='number')w.psychology=o.psychology;
      if(typeof w.stamina!=='number')w.stamina=o.stamina;
      if(typeof w.durability!=='number')w.durability=o.durability;
      if(typeof w.consistency!=='number')w.consistency=o.consistency;
    }else{
      if(typeof w.charisma!=='number')w.charisma=66;
      if(typeof w.mic!=='number')w.mic=66;
      if(typeof w.psychology!=='number')w.psychology=72;
      if(typeof w.stamina!=='number')w.stamina=70;
      if(typeof w.durability!=='number')w.durability=70;
      if(typeof w.consistency!=='number')w.consistency=70;
    }

    if(typeof w.starpower!=='number')w.starpower=65;
    if(typeof w.momentum!=='number')w.momentum=60;
    if(typeof w.workrate!=='number')w.workrate=64;
    if(typeof w.push!=='number')w.push=50;

    if (!w.traits || typeof w.traits !== 'object') w.traits = { core:[], status:[], rare:[] };
    if (!Array.isArray(w.traits.core)) w.traits.core = [];
    if (!Array.isArray(w.traits.status)) w.traits.status = [];
    if (!Array.isArray(w.traits.rare)) w.traits.rare = [];
  });

  try { normalizeBrandsForTitles(state); } catch {}
  try { stripCrossBrandTitles(state); } catch {}
  try { setChampionFlags(state); } catch {}
  try { hydrateRosterFromApi(state); } catch {}
  try { hydrateRelDbPairsFromApi(state); } catch {}
  return state;
}
