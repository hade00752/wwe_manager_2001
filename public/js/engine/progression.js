// public/js/engine/progression.js
import { clamp, r } from '../util.js';
import { byBrand } from './helpers.js';

// --- Weekly status effects (injuries, fatigue, morale drift) ---
export function applyWeeklyStatusEffects(state){
  if (!state || !Array.isArray(state.roster)) return;

  for (const w of state.roster){
    if (!w) continue;

    const c100 = (x)=>clamp(Math.round(x), 0, 100);
    const c99  = (x)=>clamp(Math.round(x), 1, 99);

    if (Number(w.injuryWeeks||0) > 0){
      w.morale   = c100((w.morale ?? 60)   - 3);
      w.momentum = c99( (w.momentum ?? 60) - 4);
      w.stamina    = c99((w.stamina ?? 70)    - 1);
      w.durability = c99((w.durability ?? 70) - 1);
      w.fatigue = c100((w.fatigue ?? 0) + 3);
    } else {
      const baseMor = (w.moraleBase ?? 65);
      const baseMom = (w.momentumBase ?? 60);
      const mor = Number(w.morale ?? baseMor);
      const mom = Number(w.momentum ?? baseMom);
      const pullMor = clamp(Math.round((baseMor - mor) * 0.12), -2, +2);
      const pullMom = clamp(Math.round((baseMom - mom) * 0.10), -2, +2);
      w.morale   = c100(mor + pullMor);
      w.momentum = c99(mom + pullMom);
      w.fatigue  = c100((w.fatigue ?? 0) - 2);
    }

    if (!Number.isFinite(w.morale))   w.morale   = 60;
    if (!Number.isFinite(w.momentum)) w.momentum = 60;
    if (!Number.isFinite(w.fatigue))  w.fatigue  = 0;
  }
}

/**
 * Weekly progression -- arc-aware.
 *
 * Gate probability is momentum-weighted: high-momentum wrestlers progress
 * more often, inactive wrestlers stagnate/decline. Arc streak (_arcStreak)
 * compounds over consecutive weeks so a breakout feels earned and a fade
 * feels gradual, not random.
 *
 * _arcStreak: +1..+6 = hot run, -1..-6 = cold/idle run
 */
const pick = (arr) => arr[r(0, arr.length - 1)];
const applyAttr = (w, key, delta) => {
  const base = (key === 'morale') ? (w[key] ?? 65) : (w[key] ?? 60);
  const hi   = (key === 'morale') ? 100 : 99;
  const lo   = (key === 'morale') ? 0   : 1;
  w[key] = clamp(Math.round(base + delta), lo, hi);
};

export function applyWeeklyProgression(state, brand, results, appearedList) {
  const appearedSet = new Set((appearedList || []).filter(Boolean));
  const roster = byBrand(state, brand);

  const bestScoreFor = (name) => {
    let best = null;
    for (const seg of results || []) {
      if (!seg?.names) continue;
      if (seg.names.includes(name)) best = Math.max(best ?? 0, seg.score ?? 0);
    }
    return best;
  };

  for (const w of roster) {
    if (!w || w.retired) continue;

    // --- Appearance tracking ---
    const appeared = appearedSet.has(w.name);
    w.weeksInactive = appeared ? 0 : (w.weeksInactive || 0) + 1;

    const best   = appeared ? (bestScoreFor(w.name) ?? 0) : null;
    const usedOK = best !== null && best >= 75;
    const usedHi = best !== null && best >= 85;

    // --- Arc streak: compound over weeks, capped at +-6 ---
    // Positive = hot run (good bookings), Negative = cold run (invisible/poor)
    const prevArc = w._arcStreak || 0;
    if (appeared && usedHi) {
      w._arcStreak = Math.min(prevArc + 1, 6);
    } else if (appeared && usedOK) {
      w._arcStreak = clamp(prevArc + 1, -6, 3);  // good but not breakout, cap lower
    } else if (!appeared) {
      w._arcStreak = Math.max(prevArc - 1, -6);
    } else {
      // appeared but poor score -- slight cool-down
      w._arcStreak = Math.max(prevArc - 1, -2);
    }
    const arc = w._arcStreak;

    // --- Age advancement ---
    w.ageWeeks = (w.ageWeeks || 0) + 1;
    if (w.ageWeeks >= 52) { w.ageWeeks -= 52; w.age = (w.age || 30) + 1; }

    const age  = w.age || 30;
    const pro  = (w.professionalism ?? 70);
    const ada  = (w.adaptability   ?? 65);
    const cons = (w.consistency    ?? 72);
    const fat  = (w.fatigue        ?? 0);
    const mom  = (w.momentum       ?? 60);
    const inac = w.weeksInactive   || 0;

    const candidates = [];

    const add = (key, delta, weight = 1) => {
      // High consistency wrestlers resist change (dampens variance, not direction)
      const damp = 1 - Math.max(0, (cons - 70)) * 0.006;
      const d = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) * damp));
      candidates.push({ key, delta: d, weight: Math.max(0.1, weight) });
    };

    // ----------------------------------------------------------------
    // AGE < 28: Rising stars -- hot arc accelerates breakout
    // ----------------------------------------------------------------
    if (age < 28) {
      const bonus = (ada - 60) * 0.004 + (usedOK ? 0.10 : 0);
      if (Math.random() < 0.30 + bonus) {
        add(pick(['workrate','athleticism','stamina','psychology']), +1, 1.2);
      }
      if (usedHi && Math.random() < 0.25) {
        add(pick(['charisma','mic']), +1, 1.0);
      }
      // Hot arc: potential breakout -- starpower/momentum push
      if (arc >= 3 && usedHi && Math.random() < 0.45) {
        add(pick(['starpower','momentum','charisma']), +1, 1.4);
      }
      // Two consecutive great weeks: bonus stat tick
      if (arc >= 2 && usedOK && Math.random() < 0.30) {
        add(pick(['workrate','psychology']), +1, 1.1);
      }

    // ----------------------------------------------------------------
    // AGE 28-36: Peak performers -- sustain or drift
    // ----------------------------------------------------------------
    } else if (age <= 36) {
      if (usedOK && Math.random() < 0.35) {
        add(pick(['workrate','psychology','chemistry']), +1, 1.1);
      }
      if (usedHi && Math.random() < 0.25) {
        add(pick(['charisma','mic']), +1, 1.0);
      }
      // Sustained hot run: peak performer solidifies their ceiling
      if (arc >= 3 && usedHi && Math.random() < 0.35) {
        add(pick(['starpower','psychology','charisma']), +1, 1.2);
      }
      // Inactivity drift starts after 3 weeks
      if (inac >= 3 && Math.random() < 0.30) {
        add('momentum', r(-3, -1), 0.9);
      }

    // ----------------------------------------------------------------
    // AGE 36+: Veterans -- decline accelerates with inactivity
    // ----------------------------------------------------------------
    } else {
      const soften   = 1 - Math.max(0, (pro - 60)) * 0.012;
      // Inactivity doubles the decline rate for veterans
      const decayMult = inac >= 2 ? 1.6 : 1.0;
      if (Math.random() < 0.35 * decayMult) {
        add(pick(['athleticism','stamina']), Math.round(-1 * soften), 1.1);
      }
      if (Math.random() < 0.20 * decayMult) {
        add('durability', Math.round(r(-1, 0) * soften), 1.0);
      }
      if (usedOK && Math.random() < 0.30) {
        add('psychology', +1, 1.0);        // vets can still grow in ring smarts
      }
      // Fading star: sustained inactivity kills starpower
      if (inac >= 3 && Math.random() < 0.35) {
        add('starpower', -1, 1.1);
      }
      // Deep cold arc: the audience forgets them
      if (arc <= -4 && Math.random() < 0.40) {
        add(pick(['starpower','charisma']), -1, 1.2);
      }
    }

    // ----------------------------------------------------------------
    // Cross-age: cold streak -- prolonged inactivity decays momentum
    // ----------------------------------------------------------------
    if (inac >= 4 && Math.random() < 0.50) {
      add('momentum', r(-4, -2), 1.4);
    } else if (inac >= 2 && Math.random() < 0.25) {
      add('momentum', -1, 0.9);
    }

    // Fatigue-driven attrition
    if (fat >= 70 && Math.random() < 0.30) {
      add(pick(['stamina','athleticism','durability']), -1, 1.2);
    }

    // Professionalism: slow ringSafety growth
    if (Math.random() < (pro / 450)) add('ringSafety', +1, 0.8);

    if (!candidates.length) continue;

    // ----------------------------------------------------------------
    // Momentum-weighted gate probability
    // Base: 55%. High momentum adds up to +20%, low subtracts up to -15%.
    // Each week inactive costs -5%, capped at -20%.
    // Result clamped 25% -- 85%.
    // ----------------------------------------------------------------
    const inacPenalty = Math.min(inac * 0.05, 0.20);
    const momBonus    = clamp((mom - 60) * 0.005, -0.15, +0.20);
    const gateProb    = clamp(0.55 + momBonus - inacPenalty, 0.25, 0.85);

    if (Math.random() >= gateProb) continue;

    // ----------------------------------------------------------------
    // Budget: hot arc wrestlers get more stat ticks per week
    // ----------------------------------------------------------------
    const hotStreak = arc >= 3 && appeared && usedHi;
    const budget = hotStreak
      ? (Math.random() < 0.45 ? 3 : 2)   // breakout weeks: 2-3 ticks
      : (Math.random() < 0.20 ? 2 : 1);  // normal: usually 1

    const takeOne = () => {
      const sum = candidates.reduce((a, c) => a + c.weight, 0);
      let t = Math.random() * sum;
      for (let i = 0; i < candidates.length; i++) {
        t -= candidates[i].weight;
        if (t <= 0) return candidates.splice(i, 1)[0];
      }
      return candidates.shift();
    };

    for (let i = 0; i < budget && candidates.length; i++) {
      const c = takeOne();
      applyAttr(w, c.key, c.delta);
    }
  }
}
