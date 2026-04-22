// public/js/engine/engine.js
// WWF/WWE Booking Engine — barrel to preserve public API

import {
  loadState,
  saveState,
  ensureInitialised,
  newSeason,
  defaultState
} from './state_mgmt.js';

/* ------------------------------------------------------------------ */
/* Internal: async-safe initialiser wrapper                            */
/* ------------------------------------------------------------------ */

function isPromiseLike(x){
  return !!x && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function';
}

/**
 * initState(state, {save})
 * - Calls ensureInitialised(state)
 * - If ensureInitialised is async, runs it in background
 * - Keeps API sync: returns the original state object immediately
 * - When async completes, saves + notifies UI
 */
function initState(state, { save=true } = {}){
  // ensureInitialised may be sync OR async (Promise)
  let ret = null;
  try { ret = ensureInitialised(state); } catch (e) {
    console.warn('ensureInitialised threw', e);
    return state;
  }

  if (!isPromiseLike(ret)) {
    // sync path: ret is the state (or mutated state)
    return ret || state;
  }

  // async path: DO NOT replace state with a Promise
  ret.then((s)=>{
      // s should be the same object or a merged object
      const out = s || state;

      // persist so DB hydration/repairs stick
      try { if (save) saveState(out); } catch {}

      // notify pages to re-render lists
      try { window.dispatchEvent(new CustomEvent('wwf:state-initialised', { detail:{ era: out?.era } })); } catch {}
      // roster page likely already listens for roster-updated; this gives you another hook
      try { window.dispatchEvent(new CustomEvent('wwf:roster-updated', { detail:{ era: out?.era } })); } catch {}
    })
    .catch((e)=> console.warn('ensureInitialised async failed', e));

  return state;
}

/* ------------------------------------------------------------------ */
/* Canonical boot helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * boot()
 * - Use this on almost every interactive page.
 * - Guarantees a valid, initialised state.
 * - Persists to localStorage (so hydration/repairs stick).
 *
 * NOTE: API remains synchronous (returns state object),
 * even if ensureInitialised is async internally.
 */
export function boot({ brand = null, forceNew = false, save = true } = {}) {
  let state = null;

  // Hard reset: new season
  if (forceNew) {
    state = newSeason(brand || 'RAW', { useChampionSeed: true });
    try { if (save) saveState(state); } catch {}

    // ---- compat: keep older UI code working ----
    state.roster = Array.isArray(state.roster) ? state.roster : [];
    if (!Array.isArray(state.wrestlers) || state.wrestlers.length === 0) {
      state.wrestlers = state.roster;
    }
    for (const w of state.roster) {
      if (!w) continue;
      if (!w.brand) w.brand = "FA";
      if (!w.alignment) w.alignment = "neutral";
      if (!w.role) w.role = "wrestler";
    }
    if (!state.brand) state.brand = (state.roster.some(w=>w.brand==="RAW") ? "RAW" : "SD");

    // run init (sync or async-safe) AFTER compat normalization
    state = initState(state, { save });

    return state;
  }

  state = loadState();

  // No save yet -> create one (minimal) then initialise
  if (!state) {
    state = defaultState(brand || 'RAW');
    state = initState(state, { save });
    try { if (save) saveState(state); } catch {}
    return state;
  }

  // ---- compat: keep older UI code working ----
  state.roster = Array.isArray(state.roster) ? state.roster : [];
  if (!Array.isArray(state.wrestlers) || state.wrestlers.length === 0) {
    state.wrestlers = state.roster;
  }

  // hard defaults so pickers/filters don't "skip" people
  for (const w of state.roster) {
    if (!w) continue;
    if (!w.brand) w.brand = 'FA';
    if (!w.alignment) w.alignment = 'neutral';
    if (!w.role) w.role = 'wrestler';
  }

  // if brand missing, derive something safe
  if (!state.brand) state.brand = (state.roster.some(w=>w.brand==='RAW') ? 'RAW' : 'SD');

  // Normal path: hydrate/repair (may mutate; may be async)
  state = initState(state, { save });

  // Persist (default) so DB-era hydration / repairs stick
  try { if (save) saveState(state); } catch {}

  return state;
}

/**
 * bootOrNull()
 * - Read-only friendly. Returns null if no save exists.
 * - Does NOT persist by default.
 * - Good for nav bars / pills / display-only widgets.
 */
export function bootOrNull({ save = false } = {}) {
  const state = loadState();
  if (!state) return null;

  const s = initState(state, { save });
  try { if (save) saveState(s); } catch {}
  return s;
}

/**
 * bootOrNew()
 * - Returns a valid state.
 * - If no save exists, creates a new season.
 * - Does NOT persist by default unless it had to create one.
 */
export function bootOrNew({ brand = null, save = true } = {}) {
  const state = loadState();

  // If missing, create & (by default) save
  if (!state) {
    return boot({ brand, forceNew: true, save });
  }

  // If present, initialise; may be async internally, but return sync state
  const s = initState(state, { save });
  try { if (save) saveState(s); } catch {}
  return s;
}

/**
 * bootReadOnly()
 * - Convenience alias: "give me initialised state but don't write".
 * - Useful when you want hydration logic but zero persistence.
 */
export function bootReadOnly(opts = {}) {
  return boot({ ...opts, save: false });
}

/* ------------------------------------------------------------------ */
/* Re-exports (public API stays stable)                               */
/* ------------------------------------------------------------------ */

export {
  defaultState,
  loadState,
  saveState,
  ensureInitialised,
  newSeason
} from './state_mgmt.js';

export { aiBooking } from './ai.js';
export { runShow } from './runShow.js';
export { simNow, simDateString, advanceSimWeek } from './state_mgmt.js';

// helpers others rely on
export {
  byBrand,
  availableByBrand,
  men,
  women,
  getW,
  keyFromNames,
  uniqSorted,
  scoreColor,
  pickTop,
  pairForTag,
  headshotUrl,
  headshotImg,
  slugifyName
} from './helpers.js';

// optional internals
export {
  setChampionFlags,
  stripCrossBrandTitles,
  champObj,
  acclimateChamp,
  applyChampionAuraDrift
} from './champions.js';

export {
  computeAfterglowTVBump,
  rateToBlurb,
  matchSummary,
  expectedSinglesBase,
  isHotSingles,
  isHotTag,
  promoScoreFor,
  rateSinglesLikeTV
} from './ratings.js';
