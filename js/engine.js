// public/js/engine.js
// Barrel: re-export commonly used engine pieces in one place.

export {
  // state & lifecycle
  defaultState,
  loadState,
  saveState,
  ensureInitialised,
  newSeason,
  // sim clock
  simNow,
  simDateString,
  advanceSimWeek,
  // namespacing for temp/local keys
  nsKey,
} from './engine/state_mgmt.js';

export { aiBooking } from './engine/ai.js';
export { runShow } from './engine/runShow.js';
export { applyWeeklyProgression } from './engine/progression.js';
export { processRetirements }    from './engine/retirement.js';
export { snapshotWeekBaselineOnce } from './engine/snapshots.js';

// Helpers (UI + engine bits)
export {
  byBrand,
  availableByBrand,
  men,
  women,
  getW,
  keyFromNames,
  uniqSorted,
  headshotUrl,
  headshotImg,
  slugifyName,
  scoreColor,
  pickTop,
  pairForTag,
} from './engine/helpers.js';

// Optional shared constants used around the app (safe to export)
export { HOT, CROWD } from './engine/constants.js';
export { BAL } from './engine/balance.js';// public/js/engine.js
// Barrel: re-export commonly used engine pieces in one place.

export {
  // state & lifecycle
  defaultState,
  loadState,
  saveState,
  ensureInitialised,
  newSeason,
  // sim clock
  simNow,
  simDateString,
  advanceSimWeek,
  // namespacing for temp/local keys
  nsKey,
} from './engine/state_mgmt.js';

export { aiBooking } from './engine/ai.js';
export { runShow } from './engine/runShow.js';
export { applyWeeklyProgression } from './engine/progression.js';
export { processRetirements }    from './engine/retirement.js';
export { snapshotWeekBaselineOnce } from './engine/snapshots.js';

// Helpers (UI + engine bits)
export {
  byBrand,
  availableByBrand,
  men,
  women,
  getW,
  keyFromNames,
  uniqSorted,
  headshotUrl,
  headshotImg,
  slugifyName,
  scoreColor,
  pickTop,
  pairForTag,
} from './engine/helpers.js';

// Optional shared constants used around the app (safe to export)
export { HOT, CROWD } from './engine/constants.js';
export { BAL } from './engine/balance.js';
