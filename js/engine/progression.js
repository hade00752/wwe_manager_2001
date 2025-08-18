// public/js/engine/progression.js
import { RAW, SD, clamp, r } from '../util.js';
import { byBrand, getW } from './helpers.js';

/**
 * Usage/age-based development. Called once per brand per week after a show.
 * - Appeared wrestlers reset weeksInactive; non-appeared +1.
 * - Young (<28): gradual growth; prime (28–36): usage-based small gains; veteran (>=37): mild physical decline.
 * - Adaptability speeds gains; Professionalism softens declines; Consistency dampens volatility.
 */
export function applyWeeklyProgression(state, brand, results, appearedList){
  const appearedSet = new Set(appearedList.map(w => w.name));
  const roster = byBrand(state, brand);

  // quick lookup: best segment score a worker was involved in this show
  const bestScoreFor = (name) => {
    let best = null;
    for(const seg of results || []){
      if(!seg || !Array.isArray(seg.names)) continue;
      if(seg.names.includes(name)) best = Math.max(best ?? 0, seg.score ?? 0);
    }
    return best;
  };

  roster.forEach(w => {
    if (w.retired) return;

    // mark inactivity
    if (appearedSet.has(w.name)) w.weeksInactive = 0;
    else w.weeksInactive = (w.weeksInactive || 0) + 1;

    // annualize age counter (ageWeeks -> age)
    w.ageWeeks = (w.ageWeeks || 0) + 1;
    if (w.ageWeeks >= 52){ w.ageWeeks -= 52; w.age = (w.age||30) + 1; }

    const age = w.age || 30;
    const pro = (w.professionalism ?? 70);
    const ada = (w.adaptability ?? 65);
    const con = (w.consistency ?? 72);

    // usage signal
    const best = appearedSet.has(w.name) ? (bestScoreFor(w.name) ?? 0) : null;
    const usedWell   = best !== null && best >= 78;
    const usedElite  = best !== null && best >= 88;

    // helper to nudge with clamping and consistency dampening
    const nudge = (key, delta) => {
      const damp = 1 - Math.max(0, (con - 70)) * 0.007; // up to ~ -0.21
      const d = Math.round(delta * damp);
      w[key] = clamp(Math.round((w[key] ?? 60) + d), 1, 99);
    };

    // --- Development by age band ---
    if (age < 28){
      // natural growth; faster if adaptable and booked
      const speed = 1 + (ada-60)*0.01 + (usedWell? 0.25:0);
      if (appearedSet.has(w.name)){
        nudge('workrate',     r(0,2) * speed);
        nudge('psychology',   r(0,1) * speed);
        nudge('athleticism',  r(0,2) * speed);
        nudge('stamina',      r(0,2) * speed);
        nudge('promo',        r(0,1) * speed);
        nudge('charisma',     r(0,1) * speed);
      } else {
        // slow baseline drift
        if (Math.random() < 0.35) nudge('workrate', r(0,1)*speed);
        if (Math.random() < 0.30) nudge('athleticism', r(0,1)*speed);
      }
    } else if (age <= 36){
      // prime: usage based micro-gains; small fall if idle too long
      if (usedWell)  { nudge('workrate', r(0,2)); nudge('psychology', r(0,1)); }
      if (usedElite) { nudge('promo', r(0,1)); nudge('charisma', r(0,1)); }
      if (w.weeksInactive >= 3 && Math.random() < 0.4){
        nudge('momentum', r(-4,-1));
        nudge('workrate', r(-1,0));
      }
    } else {
      // veteran: physical softening; ring IQ may climb; pro buffers losses
      const soften = 1 - Math.max(0,(pro-60))*0.012; // pro 90 → ~0.64
      if (appearedSet.has(w.name)){
        nudge('athleticism', Math.round(r(-2,-1) * soften));
        nudge('stamina',     Math.round(r(-2,-1) * soften));
        nudge('durability',  Math.round(r(-1, 0) * soften));
        // ring savvy
        if (Math.random() < 0.35) nudge('psychology', r(0,1));
      } else {
        if (Math.random() < 0.6) nudge('stamina', Math.round(-1 * soften));
      }
    }

    // morale-ish soft effects
    if (!appearedSet.has(w.name) && w.weeksInactive >= 4){
      if (Math.random() < 0.55) nudge('likeability', r(-2,-1));
      if (Math.random() < 0.35) nudge('momentum',    r(-3,-1));
    }

    // small chance to polish safety via professionalism
    if (Math.random() < (pro/400)) nudge('ringSafety', 1);
  });
}
