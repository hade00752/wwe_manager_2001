// public/js/engine/balance.js
export const BAL = {
  // Match score weights
  WEIGHTS: {
    workrate:   0.38,
    psychology: 0.16,
    starpower:  0.22,
    momentum:   0.12,
    like:       0.08,
  },
  // Score modifiers
  CHEM_BASE_MULT: 0.6,        // baseChem * 0.6 + relBonus
  HOT_MATCH_BONUS: 6,         // tag/feud/hype flag bump
  TITLE_BUMP: 3,              // title on the line
  SEGMENT_WEIGHT: { MainEvent: 1.3, Opener: 1.15, default: 1 },

  // Momentum
  MOMENTUM: { win:+2, loss:-1, titleWin:+2, bigUpset:+1 },

  // Fatigue & injury
  FATIGUE: { baseGain: 6, longMatchExtra: 3, backToBack: 4 },
  INJURY: {
    basePct: 0.003,             // 0.3%
    durFactor: 0.006,            // each point below 70 adds risk
    safetyOppFactor: 0.004,      // unsafe opponent adds
    fatigueFactor: 0.002,        // per 20 fatigue
    longMatchFactor: 0.002,      // long match flag
    minWeeks: 1, maxWeeks: 6
  },

  // Promo
  PROMO: { mic: 0.55, charisma: 0.45, momentumBoost: +1 },

  // Prestige bump on title changes
  TITLE_PRESTIGE: { normal: {sp:2, rep:2, con:1}, marquee: {sp:3, rep:3, con:1} },

  // Age decline (optional hook in progression)
  AGE: { start: 36, staminaStep:-1, durabilityStep:-1, everyNWeeks: 6 },
};

