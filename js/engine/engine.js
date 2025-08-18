// WWF/WWE Booking Engine — barrel to preserve public API

export { defaultState, loadState, saveState, ensureInitialised, newSeason } from './state_mgmt.js';
export { aiBooking } from './ai.js';
export { runShow } from './runShow.js';
export { simNow, simDateString, advanceSimWeek, nsKey } from './state_mgmt.js';

// helpers others rely on
export {
  byBrand, availableByBrand, men, women, getW,
  keyFromNames, uniqSorted, scoreColor, pickTop, pairForTag,
  headshotUrl, slugifyName
} from './helpers.js';

// optional internals
export {
  setChampionFlags, stripCrossBrandTitles, champObj, acclimateChamp, applyChampionAuraDrift
} from './champions.js';

export {
  computeAfterglowTVBump, rateToBlurb, matchSummary, expectedSinglesBase,
  isHotSingles, isHotTag, promoScoreFor, rateSinglesLikeTV
} from './ratings.js';
