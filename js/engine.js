// WWF/WWE Booking Engine — barrel to preserve public API

export {
  defaultState,
  loadState,
  saveState,
  ensureInitialised,
  newSeason,
  // expose fixed-champs controls for menus/tests
  CHAMPION_SEED,
  applyFixedChampions
} from './engine/state_mgmt.js';

export { aiBooking } from './engine/ai.js';
export { runShow } from './engine/runShow.js';
export { applyWeeklyProgression } from './engine/progression.js';
export { processRetirements }    from './engine/retirement.js';
export { simNow, simDateString, advanceSimWeek } from './engine/state_mgmt.js';

// In case other pages import helpers
export {
  byBrand, availableByBrand, men, women, getW,
  keyFromNames, uniqSorted, scoreColor, pickTop, pairForTag,
  headshotUrl, headshotImg, slugifyName
} from './engine/helpers.js';

// Optional: expose internals if you were using them elsewhere (unchanged names)
export {
  computeAfterglowTVBump,
  rateToBlurb,
  matchSummary,
  expectedSinglesBase,
  isHotSingles,
  isHotTag,
  promoScoreFor,
  rateSinglesLikeTV
} from './engine/ratings.js';

// Optional convenience (keep if you want one import path for snapshots):
export { snapshotWeekBaselineOnce } from './engine/snapshots.js';

