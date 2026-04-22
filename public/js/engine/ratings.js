// public/js/engine/ratings.js
import { clamp, r } from '../util.js';
import { BAL, HOT, CROWD } from './balance.js';

// BAL.MORALE is now the single source. No local fallback needed.
const MORALE = BAL.MORALE;

function moraleBumpValue(m){
  if (m >= MORALE.HI2) return MORALE.BONUS2;
  if (m >= MORALE.HI1) return MORALE.BONUS1;
  if (m <= MORALE.LO2) return MORALE.MALUS2;
  if (m <= MORALE.LO1) return MORALE.MALUS1;
  return 0;
}

function sideMoraleTerm(wrestlers){
  if (!Array.isArray(wrestlers) || wrestlers.length === 0) return 0;
  const avgMorale = wrestlers.reduce((a, w) => a + (w?.morale ?? 65), 0) / wrestlers.length;
  return (avgMorale - 50) * MORALE.SIDE_WEIGHT;
}

function pairMoraleDelta(A, B){
  const mA = A?.morale ?? 65;
  const mB = B?.morale ?? 65;
  const base = moraleBumpValue(mA) + moraleBumpValue(mB);
  const synergy =
    (mA >= MORALE.HI1 && mB >= MORALE.HI1) ? +0.5 :
    (mA <= MORALE.LO1 && mB <= MORALE.LO1) ? -0.5 : 0;
  return Math.round((base + synergy) * MORALE.MATCH_WEIGHT);
}

// REMOVED: sideStrength      — only used by dead matchBaseScore
// REMOVED: matchBaseScore     — never called anywhere
// REMOVED: relChemPtsFromPair — superseded by simulate.js relScalarForPair

export const rateToBlurb = r10 =>
  r10 >= 9 ? "Molten. Fans buzzing."              :
  r10 >= 8 ? "Strong show. Momentum building."    :
  r10 >= 7 ? "Solid TV. Some peaks, some dips."   :
  r10 >= 6 ? "Mid. Lukewarm spots."               : "Cold. Time to shake the card.";

export function computeAfterglowTVBump(segments){
  const byKey = new Map(segments.map(s => [s.seg, s]));
  const get   = (k) => byKey.get(k);

  const me     = get("MainEvent");
  const match  = get("Match");
  const opener = get("Opener");

  const close    = [match, me].filter(Boolean);
  const closeAvg = close.length ? close.reduce((a, s) => a + s.score, 0) / close.length : 0;
  const cardAvg  = segments.length ? segments.reduce((a, s) => a + s.score, 0) / segments.length : 0;

  let bump = 0, note = "";

  if (close.length >= 1) {
    if      (closeAvg >= 88) { bump = Math.max(bump, +0.6); note = "The closing stretch sent fans home buzzing."; }
    else if (closeAvg >= 82) { bump = Math.max(bump, +0.4); note = "Strong finish lifted the whole card."; }
    else if (closeAvg >= 78) { bump = Math.max(bump, +0.25); note = "Good finish helped the show's perception."; }
  }

  if (me) {
    const diff = cardAvg - me.score;
    if      (me.score < 70 && diff >= 5) { bump = Math.min(bump, -0.6); note = "Flat main event cooled an otherwise decent night."; }
    else if (diff >= 8)                  { bump = Math.min(bump, -0.4); note = "Underwhelming main event hurt the overall feel."; }
    else if (diff >= 5)                  { bump = Math.min(bump, -0.25); note = "Main event didn't quite live up to the build."; }
  }

  if (bump >= 0 && opener && opener.score >= 84) {
    bump = Math.min(bump + 0.1, 0.7);
    if (!note) note = "Hot opener set a great pace.";
  }

  return { bump, note };
}

export function matchSummary(score, namesArr, tags){
  const names = namesArr.join(" vs ");
  if (score >= 90) return `${names} tore the house down.`;
  if (score >= 80) return `${names} delivered a great match.`;
  if (score >= 70) return `${names} put on a solid performance.`;
  if (score >= 60) return `${names} kept the crowd interested.`;
  return `${names} struggled to connect with the crowd.`;
}

export function expectedSinglesBase(A, B){
  const W = BAL.WEIGHTS;
  const promo = ((A.charisma + A.mic) / 2 + (B.charisma + B.mic) / 2) / 2;
  const ath   = ((A.athleticism ?? 65) + (B.athleticism ?? 65)) / 2;
  const base  =
    ((A.workrate    + B.workrate)    / 2) * W.workrate   +
    ((A.psychology ?? 70) + (B.psychology ?? 70)) / 2 * W.psychology +
    ((A.starpower   + B.starpower)   / 2) * W.starpower  +
    promo * W.promo +
    ((A.likeability + B.likeability) / 2) * W.like       +
    ((A.momentum    + B.momentum)    / 2) * W.momentum   +
    ath * W.athleticism;
  return clamp(Math.round(base), 30, 92);
}

export function isHotSingles(A, B, score){
  const expected = expectedSinglesBase(A, B);
  return score >= HOT.ABSOLUTE || score >= (expected + HOT.RELATIVE);
}

export function isHotTag(A1, A2, B1, B2, score){
  const e1 = expectedSinglesBase(A1, B1);
  const e2 = expectedSinglesBase(A2, B2);
  const expected = Math.round((e1 + e2) / 2);
  return score >= HOT.ABSOLUTE || score >= (expected + HOT.RELATIVE);
}

export function promoScoreFor(w, storyBonus = 0){
  const base   = (w.charisma + w.mic) / 2;
  const rep    = w.reputation   ?? 60;
  const pro    = w.professionalism ?? 70;
  const morale = w.morale ?? 65;

  let s = base * 0.60 + w.starpower * 0.18 + w.likeability * 0.10 + w.momentum * 0.07;
  s += (rep - 60) * 0.08;
  s += (pro - 70) * 0.04;
  s += storyBonus;

  if      (morale <= MORALE.LO2) s += -6 * MORALE.PROMO_WEIGHT;
  else if (morale <= MORALE.LO1) s += -3 * MORALE.PROMO_WEIGHT;
  else if (morale >= MORALE.HI2) s += +3 * MORALE.PROMO_WEIGHT;
  else if (morale >= MORALE.HI1) s += +1.5 * MORALE.PROMO_WEIGHT;

  s += r(-4, 6);
  return clamp(Math.round(s / 1.25), 55, 90);
}

export function rateSinglesLikeTV(A, B, slotKey, maybeTitle, storyBonusPts, chemPts){
  const W     = BAL.WEIGHTS;
  const promo = ((A.charisma + A.mic) / 2 + (B.charisma + B.mic) / 2) / 2;
  const ath   = ((A.athleticism ?? 65) + (B.athleticism ?? 65)) / 2;
  const alignBonus = (A.alignment !== B.alignment) ? BAL.ALIGN_BONUS : 0;

  let base =
    ((A.workrate    + B.workrate)    / 2) * W.workrate   +
    ((A.psychology ?? 70) + (B.psychology ?? 70)) / 2 * W.psychology +
    ((A.starpower   + B.starpower)   / 2) * W.starpower  +
    promo * W.promo +
    ((A.likeability + B.likeability) / 2) * W.like       +
    ((A.momentum    + B.momentum)    / 2) * W.momentum   +
    ath * W.athleticism +
    alignBonus;

  // slot / title / story / chem
  base += BAL.SLOT[slotKey] ?? BAL.SLOT.default;
  if (maybeTitle) base += BAL.TITLE_BUMP;
  base += storyBonusPts ?? 0;
  base += chemPts ?? 0;

  // fatigue penalty
  const fatigueAvg = ((A.fatigue ?? 0) + (B.fatigue ?? 0)) / 2;
  base -= Math.max(0, Math.round((fatigueAvg - BAL.FATIGUE_THRESH) * BAL.FATIGUE_RATE));

  // variance (once)
  base += r(BAL.VARIANCE.lo, BAL.VARIANCE.hi);

  base += pairMoraleDelta(A, B);

  // soft cap
  const elite  = (w) => w.starpower >= 90 && w.workrate >= 85 && (w.psychology ?? 80) >= 82;
  const heroic = elite(A) && elite(B) && (storyBonusPts ?? 0) >= 6 && (chemPts ?? 0) >= 3;
  const cap    = heroic ? 95 : 92;

  return clamp(Math.round(base), 30, cap);
}
