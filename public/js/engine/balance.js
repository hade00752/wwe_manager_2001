// public/js/engine/balance.js
// Single source of truth for all tunable numbers.
// Every system that was hardcoding values must import from here.

export const BAL = {

  // ── Match rating weights ─────────────────────────────────────────────
  // Used by rateSinglesLikeTV. Must sum to ~1 (ath is additive, small).
  WEIGHTS: {
    workrate:    0.26,
    psychology:  0.16,
    starpower:   0.20,
    promo:       0.10,   // avg of charisma+mic for both wrestlers
    like:        0.08,
    momentum:    0.06,
    athleticism: 0.05,
  },

  // ── Match rating bonuses ─────────────────────────────────────────────
  SLOT:            { MainEvent: +6, Opener: +3, default: 0 },
  TITLE_BUMP:      +4,
  ALIGN_BONUS:     +3,   // face vs heel matchup
  FATIGUE_THRESH:  40,   // fatigue above this starts penalising rating
  FATIGUE_RATE:    0.15, // penalty per point above threshold
  VARIANCE:        { lo: -4, hi: +6 },

  // ── Chemistry ────────────────────────────────────────────────────────
  // Applied once, inside simulate.js → rateSinglesLikeTV.
  // baseChem now uses a sqrt curve (not a flat multiplier); stored cap is +-25.
  // Sticky decay: only decays when |chem| > 8, so earned chemistry persists.
  CHEM_STORED_CAP: 25,   // max stored chemistry value (was 10)
  CHEM_REL_CAP:    10,   // cap on relationship-derived chem delta
  CHEM_FINAL_CAP:  14,   // cap on total chemPts passed to rateSinglesLikeTV (was 12)

  // ── Momentum deltas by finish type ───────────────────────────────────
  MOMENTUM: {
    win:  { clean: +8, dirty: +4, squash: +12, protect: +2 },
    loss: { clean: -4, dirty: -2, squash:  -6, protect: -1 },
    titleWin: +2,
    bigUpset: +1,
  },

  // ── Morale deltas by finish type ─────────────────────────────────────
  MORALE: {
    // Rating thresholds for the morale bump applied to individual match ratings
    HI2: 92, HI1: 82, LO1: 48, LO2: 32,
    BONUS2: +2, BONUS1: +1, MALUS1: -1, MALUS2: -3,
    SIDE_WEIGHT:  0.03,  // morale → sideStrength weight
    MATCH_WEIGHT: 0.65,  // damps morale bump in match rating
    PROMO_WEIGHT: 0.60,  // morale matters more in promos

    // Post-match morale change (winner / loser)
    win:  { clean: +1, dirty:  0, squash: +2, protect:  0 },
    loss: { clean: -1, dirty: -2, squash: -4, protect: -1 },
  },

  // ── Match direction score modifiers ──────────────────────────────────
  // Applied to segScore in runShow after simulate returns.
  DIRECTION: {
    clean:   { score:  0 },
    dirty:   { score:  0 },
    squash:  { score: +3 }, // decisive = crowd satisfied
    protect: { score: -4 }, // no clean finish = crowd flat
  },

  // ── Fatigue & injury ─────────────────────────────────────────────────
  FATIGUE: { baseGain: 6, longMatchExtra: 3, backToBack: 4 },
  INJURY: {
    basePct:          0.003,
    durFactor:        0.006,
    safetyOppFactor:  0.004,
    fatigueFactor:    0.002,
    longMatchFactor:  0.002,
    minWeeks: 1, maxWeeks: 6,
  },

  // ── Promo ────────────────────────────────────────────────────────────
  PROMO: { mic: 0.55, charisma: 0.45, momentumBoost: +1 },

  // ── Title prestige on change ─────────────────────────────────────────
  TITLE_PRESTIGE: {
    normal:  { sp: 2, rep: 2, con: 1 },
    marquee: { sp: 3, rep: 3, con: 1 },
  },

  // ── Age decline ──────────────────────────────────────────────────────
  AGE: { start: 36, staminaStep: -1, durabilityStep: -1, everyNWeeks: 6 },
};

// ── Constants (merged from constants.js) ─────────────────────────────
export const STORE_KEY      = 'wwf_sim_state_v1';
export const MAIN_EVENT_KEY = 'MainEvent';

export const HOT = {
  ABSOLUTE: 85,
  RELATIVE: 12,
  TTL:       1,
};

export const CROWD = {
  AFTERGLOW_TTL: 2,
  HOT_SEG:      85,
  VERY_HOT_SEG: 90,
  BOOST:         5,
  BIG_BOOST:     8,
};

export const MAIN_EVENT = {
  UNDERWHELM_DELTA:  6,
  FLAT_FLOOR:       70,
  PENALTY:          -8,
};

// Weekly TV fatigue tick (distinct from BAL.FATIGUE which covers match gain).
export const FATIGUE = {
  WRESTLE_BASE_INC: [10, 16],
  REST_DEC:         [8,  12],
  SLOT_MULT: { PreShow: 0.8, Opener: 1.0, Tag: 1.0, Match: 1.0, MainEvent: 1.3 },
  CAP: 100,
};

export const INJURY = {
  BASE:         0.01,
  PER_FATIGUE:  0.0015,
  CAP:          0.25,
  DUR_LIGHT:    [1, 3],
  DUR_MED:      [2, 6],
  DUR_HEAVY:    [4, 8],
  HEAVY_AT:     85,
  MED_AT:       70,
};
