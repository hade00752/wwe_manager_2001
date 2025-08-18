// public/js/engine/simulate.js
import { clamp, avg, setEq, r, ALIGNMENT_EFFECT, normAlign } from '../util.js';
// import { getW } from './helpers.js'; // not used here
import { storyBonus } from './story.js';
import { getChem, bumpChem } from './chemistry.js';
import { champObj, acclimateChamp, setChampionFlags } from './champions.js';
import { rateSinglesLikeTV } from './ratings.js';
import { onTagTeammatesResult, onSinglesFaceOff, relationshipChemBonus } from './relationships.js';

/* ---------------- Alignment helpers ---------------- */
function applySinglesAlignment(score, a, b){
  const A = normAlign(a?.alignment);
  const B = normAlign(b?.alignment);
  if (A !== B) return score;

  // same-alignment penalty (heels a bit harsher; neutrals softened)
  let pct = ALIGNMENT_EFFECT.SINGLES_SAME; // base 5%
  if (A === 'heel') {
    pct += ALIGNMENT_EFFECT.SINGLES_SAME_HEEL_BONUS; // +2%
  } else if (A === 'neutral') {
    pct = Math.max(0, pct - ALIGNMENT_EFFECT.SINGLES_BOTH_NEUTRAL_REDUCTION); // -2%
  }
  return score * (1 - pct);
}

function applyTagAlignment(score, teamA, teamB){
  const [a1, a2] = teamA;
  const [b1, b2] = teamB;

  const a1A = normAlign(a1?.alignment);
  const a2A = normAlign(a2?.alignment);
  const b1A = normAlign(b1?.alignment);
  const b2A = normAlign(b2?.alignment);

  const teamAMixed = a1A !== a2A;
  const teamBMixed = b1A !== b2A;

  let out = score;

  // each mixed team gets dinged
  if (teamAMixed) out *= (1 - ALIGNMENT_EFFECT.TAG_MIXED_TEAM);
  if (teamBMixed) out *= (1 - ALIGNMENT_EFFECT.TAG_MIXED_TEAM);

  // if both teams are uniform AND same alignment, small ding
  if (!teamAMixed && !teamBMixed && a1A === b1A) {
    out *= (1 - ALIGNMENT_EFFECT.TAG_TEAMS_SAME);
  }

  return out;
}

/* ---------------- helpers for post-match effects ---------------- */
function addDelta(map, name, key, d){
  if (!d) return;
  map[name] = map[name] || {};
  map[name][key] = (map[name][key] || 0) + d;
}
function bumpAttr(w, key, d, effectsMap){
  if (!d) return;
  const before = Number(w[key] ?? 60);
  const after = clamp(before + d, 0, 99);
  if (after !== before){
    w[key] = after;
    addDelta(effectsMap, w.name, key, d);
  }
}

/* ---------------- Core simulate ---------------- */
export function simulateMatch(state, participants, slotKey, titleObj, brand, isTag=false){
  let A=[], B=[];
  if(isTag){ A=[participants[0],participants[1]]; B=[participants[2],participants[3]]; }
  else { A=[participants[0]]; B=[participants[1]]; }

  const sideScore = (side)=> {
    const like=avg(side.map(w=>w.likeability));
    const wrk =avg(side.map(w=>w.workrate));
    const star=avg(side.map(w=>w.starpower));
    const mom =avg(side.map(w=>w.momentum));
    const psy =avg(side.map(w=>w.psychology ?? 70));
    const hf = (side.some(w=>w.alignment==="heel") && side.some(w=>w.alignment==="face")) ? 1 : 0;
    return wrk*0.38 + star*0.22 + mom*0.12 + psy*0.16 + like*0.08 + hf + r(-6,6);
  };

  const aS = sideScore(A), bS = sideScore(B);
  const probA = 1/(1+Math.pow(10,(bS-aS)/28));
  const aWins = Math.random()<probA;
  const winners = aWins? A : B;
  const losers  = aWins? B : A;

  // momentum deltas (for report)
  const momentumDelta = {};
  winners.forEach(w=>{ const d=r(4,8); w.momentum = clamp(w.momentum + d, 0, 99); momentumDelta[w.name]=d; });
  losers.forEach(w=>{ const d=r(-5,-2); w.momentum = clamp(w.momentum + d, 0, 99); momentumDelta[w.name]=d; });

  const matchNames = [...A,...B].map(w=>w.name);
  const sBonus = storyBonus(state, brand, matchNames);

  // Base chemistry between opponents (+ relationship bonus if defined)
  const baseChem = isTag
    ? (getChem(state, A[0].name, B[0].name) + getChem(state, A[1].name, B[1].name)) / 2
    :  getChem(state, A[0].name, B[0].name);

  const relBonus =
    typeof relationshipChemBonus === 'function'
      ? (isTag
          ? Math.round((relationshipChemBonus(state, A[0].name, B[0].name) +
                        relationshipChemBonus(state, A[1].name, B[1].name)) / 2)
          : relationshipChemBonus(state, A[0].name, B[0].name))
      : 0;

  const chemPts = Math.round(baseChem * 0.6 + relBonus);

  // ---------- Rating ---------- (capture alignment penalty % for explain)
  let rating, alignPct = 0;
  if(isTag){
    const p1 = rateSinglesLikeTV(A[0], B[0], slotKey, null, sBonus, chemPts);
    const p2 = rateSinglesLikeTV(A[1], B[1], slotKey, null, sBonus, chemPts);
    const pre = Math.round((p1+p2)/2 + r(-2,2));
    const post = applyTagAlignment(pre, A, B);     // alignment effect for tags
    rating = post;
    alignPct = pre>0 ? (pre - post) / pre : 0;
  } else {
    const pre = rateSinglesLikeTV(A[0], B[0], slotKey, titleObj?.title, sBonus, chemPts);
    const post = applySinglesAlignment(pre, A[0], B[0]); // alignment effect for singles
    rating = post;
    alignPct = pre>0 ? (pre - post) / pre : 0;
  }
  rating = clamp(rating, 30, 99);

  // ---------- Titles ----------
  let tags=[], defense=null, titleApplied=false, titleChanged=false;
  if(titleObj){
    const title = titleObj.title;
    const champ = champObj(state, brand, title);
    const winnersNames = winners.map(w=>w.name);
    const allNames = matchNames;

    const champPresent = (() => {
      if(!champ) return false;
      if(title==="Tag" && Array.isArray(champ)){
        const champSet = new Set(champ);
        const sideASet = new Set(A.map(w=>w.name));
        const sideBSet = new Set(B.map(w=>w.name));
        return setEq(champSet, sideASet) || setEq(champSet, sideBSet);
      } else {
        const namesLC = allNames.map(n=> String(n).toLowerCase().trim());
        const champLC = String(champ).toLowerCase().trim();
        return namesLC.includes(champLC);
      }
    })();

    if(champPresent){
      rating = clamp(rating + 3, 30, 99); // title adds a little heat
      titleApplied = true;
      if(title==="Tag"){
        if(Array.isArray(champ)){
          const champSet = new Set(champ);
          const winSet = new Set(winnersNames);
          const retained = setEq(champSet, winSet);
          if(retained){ tags.push("title defense"); defense={brand,title,holder:champ}; acclimateChamp(winners); }
          else { state.champs[brand][title] = [winnersNames[0], winnersNames[1]]; setChampionFlags(state); tags.push("title change!"); titleChanged=true; }
        }
      } else {
        if(winnersNames.includes(champ)){ tags.push("title defense"); defense={brand,title,holder:champ}; acclimateChamp(winners); }
        else { state.champs[brand][title] = winners[0].name; setChampionFlags(state); tags.push("title change!"); titleChanged=true; }
      }
    }
  }

  // ---------- Relationship events ----------
  const hot = rating >= 82;
  if(isTag){
    if (winners.length === 2) onTagTeammatesResult(state, winners[0], winners[1], true,  hot);
    if (losers.length  === 2) onTagTeammatesResult(state, losers[0],  losers[1],  false, hot);
  } else {
    onSinglesFaceOff(state, A[0], B[0], hot, titleChanged);
  }

  // ---------- Chemistry learning ----------
  if(!isTag){
    if(rating >= 82) bumpChem(state, A[0].name, B[0].name, +1);
    else if(rating <= 58) bumpChem(state, A[0].name, B[0].name, -1);
  } else {
    const pairings = [[A[0],B[0]], [A[1],B[1]]];
    pairings.forEach(([p1,p2])=>{
      if (rating >= 82) bumpChem(state, p1.name, p2.name, +1);
      else if (rating <= 58) bumpChem(state, p1.name, p2.name, -1);
    });
  }

  /* ---------- NEW: permanent post-match attribute effects ---------- */
  const attrEffects = {};
  // roll-upset detection & opponent star averages
  const oppStarAvgForWinners = avg(losers.map(w=>w.starpower ?? 60));
  const upsetWin = (aWins ? probA < 0.45 : (1 - probA) < 0.45); // winner was a clear underdog

  // winners get small permanent boosts; scale with context
  winners.forEach(w=>{
    // Momentum already applied — mirror that into attrEffects so UI can show it
    addDelta(attrEffects, w.name, 'momentum', momentumDelta[w.name] || 0);

    const starGain =
      (oppStarAvgForWinners >= 80 ? 1 : 0) +
      (hot ? 1 : 0) +
      (upsetWin ? 1 : 0);
    const repGain =
      1 + (oppStarAvgForWinners >= 80 ? 1 : 0) + (titleChanged ? 1 : 0) + (upsetWin ? 1 : 0);
    const likeGain =
      (w.alignment === 'face' ? (hot ? 1 : 0) : 0);

    bumpAttr(w, 'starpower', clamp(starGain, 0, 2), attrEffects);
    bumpAttr(w, 'reputation', clamp(repGain, 1, 3), attrEffects);
    if (likeGain) bumpAttr(w, 'likeability', likeGain, attrEffects);

    // sustained quality improves “consistency”; exceptional main events help psychology a bit
    if (rating >= 85) bumpAttr(w, 'consistency', 1, attrEffects);
    if (rating >= 92) bumpAttr(w, 'psychology', 1, attrEffects);
  });

  // losers: minor rep knock on an upset or weak showing (no star drain unless really cold)
  const losersRepKnock = upsetWin ? -1 : 0;
  losers.forEach(l=>{
    addDelta(attrEffects, l.name, 'momentum', momentumDelta[l.name] || 0);
    if (losersRepKnock) bumpAttr(l, 'reputation', losersRepKnock, attrEffects);
    if (rating <= 58) bumpAttr(l, 'consistency', -1, attrEffects);
  });

  const text =
    `${winners.map(w=>w.name).join(" & ")} defeat ${losers.map(w=>w.name).join(" & ")}.` +
    (titleApplied ? " (Title bout)" : "");

  // Explain payload for Match Details page.
  const explain = {
    aSideScore: aS,
    bSideScore: bS,
    probA,
    winners: winners.map(w=>w.name),
    storyBonus: sBonus,
    baseChem,
    relBonus,
    chemPts,
    alignmentPenaltyPct: Math.max(0, alignPct),
    titleApplied,
    titleChanged,
    momentumDelta,
    repeatPenalty: 0, // runShow will fill this when it applies repeat-penalty
    // NEW meta for narration
    hotMatch: hot,
    upsetWin,
    oppStarAvgForWinners,
    // NEW: per-wrestler permanent attribute deltas
    attrEffects
  };

  return { rating, text, tags, defense, namesArr: matchNames, explain };
}
