import { clamp, r } from '../util.js';
import { HOT, CROWD } from './constants.js';

import { BAL } from './balance.js';

export function sideStrength(wrestlers) {
  if (!wrestlers.length) return 0;
  const avg = (k, d=60)=> wrestlers.reduce((a,w)=> a + (w?.[k] ?? d), 0) / wrestlers.length;
  const wrk  = avg('workrate');
  const psy  = avg('psychology', 70);
  const star = avg('starpower');
  const mom  = avg('momentum');
  const like = avg('likeability');
  const heelFaceMix = (wrestlers.some(w=>w.alignment==='heel') && wrestlers.some(w=>w.alignment==='face')) ? 1 : 0;

  const s = wrk*BAL.WEIGHTS.workrate +
            star*BAL.WEIGHTS.starpower +
            mom*BAL.WEIGHTS.momentum +
            psy*BAL.WEIGHTS.psychology +
            like*BAL.WEIGHTS.like +
            heelFaceMix;

  return Math.round(s);
}

export function winProbA(aSideScore, bSideScore){
  // Elo-like
  return 1 / (1 + Math.pow(10, (bSideScore - aSideScore) / 28));
}

export function matchBaseScore({ A, B, flags }) {
  // A/B are arrays of wrestlers (singles/tag)
  const aScore = sideStrength(A);
  const bScore = sideStrength(B);
  const pA = winProbA(aScore, bScore);

  let base = Math.round((aScore + bScore) / 2);

  // chemistry (already computed elsewhere? then feed in numbers)
  const chem = (flags?.chemBase ?? 0) * BAL.CHEM_BASE_MULT + (flags?.relBonus ?? 0);
  base += Math.round(chem);

  if (flags?.hot)     base += BAL.HOT_MATCH_BONUS;
  if (flags?.isTitle) base += BAL.TITLE_BUMP;

  const segW = flags?.segment === 'MainEvent'
    ? BAL.SEGMENT_WEIGHT.MainEvent
    : flags?.segment === 'Opener'
      ? BAL.SEGMENT_WEIGHT.Opener
      : BAL.SEGMENT_WEIGHT.default;

  base = Math.round(base * segW);

  return { baseScore: base, aScore, bScore, pA };
}

export const rateToBlurb = r10 => r10>=9 ? "Molten. Fans buzzing." :
                             r10>=8 ? "Strong show. Momentum building." :
                             r10>=7 ? "Solid TV. Some peaks, some dips." :
                             r10>=6 ? "Mid. Lukewarm spots." : "Cold. Time to shake the card.";

export function computeAfterglowTVBump(segments){
  const byKey = new Map(segments.map(s => [s.seg, s]));
  const get  = (k)=> byKey.get(k);

  const me   = get("MainEvent");
  const match = get("Match");
  const opener = get("Opener");

  const close = [match, me].filter(Boolean);
  const closeAvg = close.length ? (close.reduce((a,s)=>a+s.score,0) / close.length) : 0;
  const cardAvg  = segments.length ? (segments.reduce((a,s)=>a+s.score,0) / segments.length) : 0;

  let bump = 0;    // in TV points, not raw rating
  let note = "";

  if (close.length >= 1) {
    if (closeAvg >= 88) { bump = Math.max(bump, +0.6); note = "The closing stretch sent fans home buzzing."; }
    else if (closeAvg >= 82) { bump = Math.max(bump, +0.4); note = "Strong finish lifted the whole card."; }
    else if (closeAvg >= 78) { bump = Math.max(bump, +0.25); note = "Good finish helped the show’s perception."; }
  }

  if (me) {
    const diff = cardAvg - me.score;
    if (me.score < 70 && diff >= 5) {
      bump = Math.min(bump, -0.6);
      note = "Flat main event cooled an otherwise decent night.";
    } else if (diff >= 8) {
      bump = Math.min(bump, -0.4);
      note = "Underwhelming main event hurt the overall feel.";
    } else if (diff >= 5) {
      bump = Math.min(bump, -0.25);
      note = "Main event didn’t quite live up to the build.";
    }
  }

  if (bump >= 0 && opener && opener.score >= 84) {
    bump = Math.min(bump + 0.1, 0.7);
    if (!note) note = "Hot opener set a great pace.";
  }

  return { bump, note };
}

export function matchSummary(score, namesArr, tags) {
  const [first, ...rest] = namesArr;
  const names = namesArr.join(" vs ");
  if (score >= 90) return `${names} tore the house down.`;
  if (score >= 80) return `${names} delivered a great match.`;
  if (score >= 70) return `${names} put on a solid performance.`;
  if (score >= 60) return `${names} kept the crowd interested.`;
  return `${names} struggled to connect with the crowd.`;
}

function expectedSinglesBase(A, B){
  const work  = (A.workrate + B.workrate)/2;
  const psych = ((A.psychology ?? 70) + (B.psychology ?? 70))/2;
  const star  = (A.starpower + B.starpower)/2;
  const promo = ((A.charisma + A.mic)/2 + (B.charisma + B.mic)/2)/2;
  const like  = (A.likeability + B.likeability)/2;
  const mom   = (A.momentum + B.momentum)/2;
  const ath   = ((A.athleticism ?? 65) + (B.athleticism ?? 65))/2; // NEW
  let base = work*0.26 + psych*0.16 + star*0.20 + promo*0.10 + like*0.08 + mom*0.06 + ath*0.05;
  return clamp(Math.round(base), 30, 92);
}
export { expectedSinglesBase };

export function isHotSingles(A, B, score){
  const expected = expectedSinglesBase(A,B);
  return score >= HOT.ABSOLUTE || score >= (expected + HOT.RELATIVE);
}
export function isHotTag(A1, A2, B1, B2, score){
  const e1 = expectedSinglesBase(A1,B1);
  const e2 = expectedSinglesBase(A2,B2);
  const expected = Math.round((e1+e2)/2);
  return score >= HOT.ABSOLUTE || score >= (expected + HOT.RELATIVE);
}

// Promo now considers reputation/professionalism a bit
export function promoScoreFor(w, storyBonus=0){
  const base = (w.charisma + w.mic)/2;     // 0..99
  const rep  = (w.reputation ?? 60);
  const pro  = (w.professionalism ?? 70);
  let s = base*0.60 + (w.starpower*0.18) + (w.likeability*0.10) + (w.momentum*0.07);
  s += (rep-60)*0.08;      // small boon for respected voices
  s += (pro-70)*0.04;      // polish
  s += storyBonus;         // 0..~6
  s += r(-4, 6);
  return clamp(Math.round(s / 1.25), 55, 90);
}


export function rateSinglesLikeTV(A, B, slotKey, maybeTitle, storyBonusPts, chemPts){
  const work  = (A.workrate + B.workrate)/2;
  const psych = ((A.psychology ?? 70) + (B.psychology ?? 70))/2;
  const star  = (A.starpower + B.starpower)/2;
  const promo = ((A.charisma + A.mic)/2 + (B.charisma + B.mic)/2)/2;
  const like  = (A.likeability + B.likeability)/2;
  const mom   = (A.momentum + B.momentum)/2;
  const ath   = ((A.athleticism ?? 65) + (B.athleticism ?? 65))/2; // NEW
  const alignBonus = (A.alignment !== B.alignment) ? 3 : 0;

  let base = work*0.26 + psych*0.16 + star*0.20 + promo*0.10 + like*0.08 + mom*0.06 + ath*0.05 + alignBonus;

  // slot/title/story/chem modifiers
  base += (slotKey==="MainEvent" ? 6 : slotKey==="Opener" ? 3 : 0);
  if (maybeTitle) base += 4;
  base += (storyBonusPts ?? 0);
  base += (chemPts ?? 0);

  // fatigue + variance (once)
  const fatigueAvg = (A.fatigue + B.fatigue)/2;
  base -= Math.max(0, Math.round((fatigueAvg - 40) * 0.15));
  base += r(-4, 6);

  // soft cap logic
  const elite = (w)=> w.starpower>=90 && w.workrate>=85 && (w.psychology ?? 80)>=82;
  const heroic = elite(A) && elite(B) && (storyBonusPts ?? 0) >= 6 && (chemPts ?? 0) >= 3;
  const cap = heroic ? 95 : 92;

  return clamp(Math.round(base), 30, cap);
}
