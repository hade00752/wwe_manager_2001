// Persist keys and tunables extracted from engine.js

export const STORE_KEY = "wwf_sim_state_v1";

/* -------------------- Fatigue/Injury tuning -------------------- */
export const FATIGUE = {
  WRESTLE_BASE_INC: [10,16],        // per appearance, scaled by slot below
  REST_DEC: [8,12],                  // if they did NOT wrestle this week (their brand)
  SLOT_MULT: { PreShow:0.8, Opener:1.0, Tag:1.0, Match:1.0, MainEvent:1.3 },
  CAP: 100
};
export const INJURY = {
  BASE: 0.01,            // 1% base
  PER_FATIGUE: 0.0015,   // +0.15% per fatigue point (fatigue 80 -> +12%)
  CAP: 0.25,             // max 25%
  DUR_LIGHT: [1,3],
  DUR_MED: [2,6],
  DUR_HEAVY: [4,8],
  HEAVY_AT: 85,
  MED_AT: 70
};

export const HOT = {
  ABSOLUTE: 85,   // absolute fan score that auto-marks a match as "hot"
  RELATIVE: 12,   // overperformance above expected that also marks "hot"
  TTL: 1          // weeks of penalty immunity
};

// --- Crowd & ME vibe tuning ---
export const CROWD = {
  AFTERGLOW_TTL: 2,          // weeks to linger
  HOT_SEG: 85,               // a segment >= this counts as "hot"
  VERY_HOT_SEG: 90,
  BOOST: 5,                  // base crowd boost per level
  BIG_BOOST: 8
};
export const MAIN_EVENT = {
  UNDERWHELM_DELTA: 6,       // if ME is this many points below avg of other matches -> penalty
  FLAT_FLOOR: 70,            // or simply <70 also counts as underwhelming
  PENALTY: -8
};
