// public/js/engine/simulate.js
import { clamp, avg, setEq, r, ALIGNMENT_EFFECT, normAlign } from '../util.js';
import { storyBonus } from './story.js';
import { getChem, bumpChem } from './relationships.js';
import { champObj, acclimateChamp, setChampionFlags } from './champions.js';
import { rateSinglesLikeTV } from './ratings.js';
import {
  onTagTeammatesResult,
  onSinglesFaceOff,
  relationshipChemBonus,
  getPairView,
  relMatchRatingDelta
} from './relationships.js';
import { applyAttrDelta, getAttr } from './attr_ledger.js';

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

function normName(n){
  return String(n || '').toLowerCase().trim();
}

// Ledger-backed stat bump (records *actual* delta after clamps)
function bumpAttrLedger(state, wObj, key, delta, effectsMap, why, ref){
  if (!wObj || !delta) return;
  const before = getAttr(wObj, key);
  applyAttrDelta(state, state.week, wObj, key, delta, why, ref);
  const after = getAttr(wObj, key);
  const actual = Math.round(after - before);
  if (actual) addDelta(effectsMap, wObj.name, key, actual);
}

/* ---------------- Relationship scaler (match-level) ----------------
   This turns your "trust/respect/pressure" idea into:
   - chemDelta: affects match rating (positive/negative)
   - moraleDeltaEach: hint to apply in runShow (small)
   - inboxPos/inboxNeg: hint weights for inbox event bias
-------------------------------------------------------------------- */
export function relScalarForPair(state, aName, bName){
  const p = (typeof getPairView === "function") ? getPairView(state, aName, bName) : null;

  // legacy fallback (edge-list relationship bonus only)
  if (!p) {
    const legacy = (typeof relationshipChemBonus === "function")
      ? relationshipChemBonus(state, aName, bName)
      : 0;

    const chemDelta = clamp(Math.round(legacy), -8, +8);

    let moraleDeltaEach = 0;
    if (chemDelta >= +4) moraleDeltaEach = +1;
    if (chemDelta <= -4) moraleDeltaEach = -1;

    return {
      chemDelta,
      moraleDeltaEach,
      inboxPos: legacy > 0 ? Math.min(3, Math.ceil(legacy/2)) : 0,
      inboxNeg: legacy < 0 ? Math.min(3, Math.ceil(Math.abs(legacy)/2)) : 0,
      dbg: { mode: "legacy", rapport: 0, pressure: 0 }
    };
  }

  // ✅ DB-first view:
  // p.effective.rapport is already "DB rapport + liveΔ + traitΔ" (your relationships.js does this)
  const rapport  = Number(p?.effective?.rapport ?? 0);      // -50..+50
  const pressure = Number(p?.effective?.pressureRaw ?? 0);  // 0..100 (0 may mean "unset", handled downstream)

  // If you want "respect" as a second axis, derive it from rapport+pressure.
  // (Keep this as your temporary model.)
  const pseudoRespect = clamp(Math.round(rapport + (pressure - 30) * 0.25), -50, +50);

  // ✅ Core chem delta (ratings-facing) from the proper function signature
  let chemDelta = 0;
  if (typeof relMatchRatingDelta === "function") {
    chemDelta += relMatchRatingDelta(state, aName, bName);
  }

  // Pressure is only “good heat” if they don’t personally dislike each other.
  if (pressure >= 35) chemDelta += (rapport >= 0) ? +2 : -3;

  // Rapport bands (replaces old trust bands)
  if (rapport >= 18) chemDelta += +2;
  else if (rapport >= 8) chemDelta += +1;
  else if (rapport <= -25) chemDelta += -4;
  else if (rapport <= -10) chemDelta += -2;

  chemDelta = clamp(Math.round(chemDelta), -8, +8);

  // Morale hint: small, meant for runShow to apply
  let moraleDeltaEach = 0;
  if (chemDelta >= +4) moraleDeltaEach = +1;
  if (chemDelta <= -4) moraleDeltaEach = -1;
  if (rapport < 0 && chemDelta <= -4) moraleDeltaEach -= 1;

  // Inbox bias: more "good" events when pseudoRespect is high, more "bad" when low
  const inboxPos = pseudoRespect >= 15 ? 2 : pseudoRespect >= 5 ? 1 : 0;
  const inboxNeg = pseudoRespect <= -20 ? 3 : pseudoRespect <= -8 ? 2 : pseudoRespect < 0 ? 1 : 0;

  return {
    chemDelta,
    moraleDeltaEach,
    inboxPos,
    inboxNeg,
    dbg: {
      mode: "dbfirst",
      rapport,
      pressure,
      pseudoRespect,
      derivedState: p?.derivedState || null,
      flags: p?.db?.flags || null
    }
  };
}

/* ---------------- Core simulate ---------------- */
export function simulateMatch(state, participants, slotKey, titleObj, brand, isTag=false){
  let A=[], B=[];
  if(isTag){ A=[participants[0],participants[1]]; B=[participants[2],participants[3]]; }
  else { A=[participants[0]]; B=[participants[1]]; }

  const refBase = {
    src: 'simulateMatch',
    brand,
    slotKey,
    isTag: !!isTag,
    title: titleObj?.title || null
  };

  // For winner selection only (NOT the show rating — that's ratings.js)
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

  const matchNames = [...A,...B].map(w=>w.name);
  const sBonus = storyBonus(state, brand, matchNames);

  // Momentum deltas are calculated here for explain/UI,
  // but applied in runShow.js (avoid double-stacking).
  const momentumDelta = {};
  winners.forEach(w=>{ momentumDelta[w.name] = r(4,8); });
  losers.forEach(w=>{ momentumDelta[w.name] = r(-5,-2); });

  // Base chemistry between opponents (+ legacy relationship bonus for explain)
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

  // --- Relationship-derived match scaler across ALL unique pairs (tag partners + opponents) ---
  const all = [...A, ...B].filter(Boolean);
  const pairSet = new Set();
  let relChem = 0;
  let moraleHint = 0;
  let inboxPos = 0;
  let inboxNeg = 0;

  for (let i = 0; i < all.length; i++){
    for (let j = i+1; j < all.length; j++){
      const n1 = all[i].name, n2 = all[j].name;
      const key = [n1, n2].sort().join("::");
      if (pairSet.has(key)) continue;
      pairSet.add(key);

      const sc = relScalarForPair(state, n1, n2);
      relChem += sc.chemDelta;
      moraleHint += sc.moraleDeltaEach;
      inboxPos += sc.inboxPos;
      inboxNeg += sc.inboxNeg;
    }
  }

  // cap so it matters but doesn't dominate
  relChem = clamp(relChem, -10, +10);
  moraleHint = clamp(moraleHint, -4, +4);
  inboxPos = clamp(inboxPos, 0, 6);
  inboxNeg = clamp(inboxNeg, 0, 6);

  // Final chem points into ratings:
  // baseChem uses a sqrt curve so high chemistry (20+) gives ~8 pts, not linear.
  // relChem (from rapport/pressure) adds up to +-10 on top.
  // Combined cap raised to +-14 to reward long programs.
  const baseChemContrib = Math.sign(baseChem) * Math.round(Math.sqrt(Math.abs(baseChem)) * 1.6);
  const chemPts = clamp(Math.round(baseChemContrib + relChem), -14, +14);

  // ---------- Titles (PRECHECK so ratings/title bump is legitimate) ----------
  let titleName = null;
  let champBefore = null;     // string or array
  let champPresent = false;   // champion actually in this match (or champ team for tag)
  let safeTitleForRating = null;

  if (titleObj) {
    titleName = titleObj.title;
    champBefore = champObj(state, brand, titleName);

    const champ = champBefore;
    const allNames = matchNames;

    champPresent = (() => {
      if (!champ) return false;

      if (titleName === "Tag" && Array.isArray(champ)) {
        const champSet = new Set(champ);
        const sideASet = new Set(A.map(w=>w.name));
        const sideBSet = new Set(B.map(w=>w.name));
        return setEq(champSet, sideASet) || setEq(champSet, sideBSet);
      }

      // singles titles
      const namesLC = allNames.map(n=> normName(n));
      const champLC = normName(champ);
      return namesLC.includes(champLC);
    })();

    safeTitleForRating = champPresent ? titleName : null;
  }

  // ---------- Rating ---------- (capture alignment penalty % for explain)
  let rating, alignPct = 0;
  if(isTag){
    const p1 = rateSinglesLikeTV(A[0], B[0], slotKey, null, sBonus, chemPts);
    const p2 = rateSinglesLikeTV(A[1], B[1], slotKey, null, sBonus, chemPts);
    const pre = Math.round((p1+p2)/2 + r(-2,2));
    const post = applyTagAlignment(pre, A, B);
    rating = post;
    alignPct = pre>0 ? (pre - post) / pre : 0;
  } else {
    // ✅ FIX: only pass a title into rating if champ is actually present
    const pre = rateSinglesLikeTV(A[0], B[0], slotKey, safeTitleForRating, sBonus, chemPts);
    const post = applySinglesAlignment(pre, A[0], B[0]);
    rating = post;
    alignPct = pre>0 ? (pre - post) / pre : 0;
  }
  rating = clamp(rating, 30, 99);

  /* ---------- Permanent post-match attribute effects (ledger-backed) ---------- */
  const attrEffects = {};

  // Upset detection & opponent star averages
  const oppStarAvgForWinners = avg(losers.map(w=>w.starpower ?? 60));
  const upsetWin = (aWins ? probA < 0.45 : (1 - probA) < 0.45);

  // ---------- Titles ----------
  let tags=[], defense=null, titleApplied=false, titleChanged=false;
  const champBeforeLocal = champBefore;

  if(titleObj && champPresent){
    const title = titleObj.title;
    const champ = champBeforeLocal;
    const winnersNames = winners.map(w=>w.name);

    titleApplied = true;

    // Ensure structure exists (defensive)
    state.champs = state.champs || {};
    state.champs[brand] = state.champs[brand] || {};

    if(title==="Tag"){
      if(Array.isArray(champ)){
        const champSet = new Set(champ);
        const winSet = new Set(winnersNames);
        const retained = setEq(champSet, winSet);

        if(retained){
          tags.push("title defense");
          defense={brand,title,holder:champ};
          acclimateChamp(winners);
        } else {
          state.champs[brand][title] = [winnersNames[0], winnersNames[1]];
          setChampionFlags(state);
          tags.push("title change!");
          titleChanged=true;
        }
      } else {
        // weird legacy safety: tag champ stored as string
        if (winnersNames.includes(champ)) {
          tags.push("title defense");
          defense={brand,title,holder:champ};
          acclimateChamp(winners);
        } else {
          state.champs[brand][title] = [winnersNames[0], winnersNames[1]];
          setChampionFlags(state);
          tags.push("title change!");
          titleChanged=true;
        }
      }
    } else {
      if(winnersNames.includes(champ)){
        tags.push("title defense");
        defense={brand,title,holder:champ};
        acclimateChamp(winners);
      } else {
        state.champs[brand][title] = winners[0].name;
        setChampionFlags(state);
        tags.push("title change!");
        titleChanged=true;
      }
    }
  }

  // ---------- Title fallout ----------
  // IMPORTANT: do NOT apply momentum here (runShow owns momentum/morale).
  // Do apply starpower/reputation here (ledger-backed) so “aura” shifts show up.
  if (titleObj && titleChanged && champBeforeLocal) {
    const title = titleName || titleObj.title;

    const TITLE_W = {
      World: 3,
      Tag: 2,
      Women: 2,
      Intercontinental: 1,
      "United States": 1,
      Cruiserweight: 1
    };
    const wgt = TITLE_W[title] ?? 1;

    const oldHolders = Array.isArray(champBeforeLocal)
      ? champBeforeLocal.slice().filter(Boolean)
      : [champBeforeLocal].filter(Boolean);

    const oldSet = new Set(oldHolders.map(n => normName(n)));

    // punish outgoing champs (only if they were actually champs and are on losing side)
    for (const l of losers) {
      if (!oldSet.has(normName(l.name))) continue;
      bumpAttrLedger(state, l, 'reputation', -2 * wgt, attrEffects, `Lost title reputation hit (${title})`, { ...refBase, evt:'titleLoss' });
      bumpAttrLedger(state, l, 'starpower',  -1 * wgt, attrEffects, `Lost title starpower hit (${title})`, { ...refBase, evt:'titleLoss' });
    }

    // reward new champs
    for (const win of winners) {
      bumpAttrLedger(state, win, 'reputation', +2 * wgt, attrEffects, `Won title reputation bump (${title})`, { ...refBase, evt:'titleWin' });
      bumpAttrLedger(state, win, 'starpower',  +1 * wgt, attrEffects, `Won title starpower bump (${title})`, { ...refBase, evt:'titleWin' });
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
  // Better matches build more chemistry. Awful matches hurt it.
  // Great matches (90+) give +3, good (82+) give +2, poor (<=58) -1, awful (<=45) -2.
  const chemBump = rating >= 90 ? +3 : rating >= 82 ? +2 : rating <= 45 ? -2 : rating <= 58 ? -1 : 0;
  if(!isTag){
    if (chemBump) bumpChem(state, A[0].name, B[0].name, chemBump);
  } else {
    const pairings = [[A[0],B[0]], [A[1],B[1]]];
    pairings.forEach(([p1,p2])=>{
      if (chemBump) bumpChem(state, p1.name, p2.name, chemBump);
    });
  }

  // ---------- Non-title development ----------
  // Winners get small permanent boosts; losers get small knocks in specific cases.
  winners.forEach(w=>{
    // Mirror momentum delta into attrEffects for UI (but do not apply here)
    addDelta(attrEffects, w.name, 'momentum', momentumDelta[w.name] || 0);

    const starGain =
      (oppStarAvgForWinners >= 80 ? 1 : 0) +
      (hot ? 1 : 0) +
      (upsetWin ? 1 : 0);

    const repGain =
      (titleChanged ? 2 : 0) +
      (upsetWin ? 1 : 0) +
      (hot ? 1 : 0) +
      (oppStarAvgForWinners >= 80 ? 1 : 0);

    const likeGain =
      (w.alignment === 'face' ? (hot ? 1 : 0) : 0);

    if (starGain > 0) bumpAttrLedger(state, w, 'starpower',   clamp(starGain, 1, 2), attrEffects, 'Match win starpower growth', { ...refBase, evt:'win' });
    if (likeGain)     bumpAttrLedger(state, w, 'likeability', likeGain,              attrEffects, 'Match win likeability bump',   { ...refBase, evt:'win' });
    if (repGain > 0)  bumpAttrLedger(state, w, 'reputation',  clamp(repGain, 1, 3),  attrEffects, 'Match win reputation bump',   { ...refBase, evt:'win' });

    // sustained quality improves “consistency”; exceptional matches help psychology a bit
    if (rating >= 85) bumpAttrLedger(state, w, 'consistency', +1, attrEffects, 'High quality match consistency', { ...refBase, evt:'quality' });
    if (rating >= 92) bumpAttrLedger(state, w, 'psychology',  +1, attrEffects, 'Elite match psychology growth',  { ...refBase, evt:'quality' });
  });

  const losersRepKnock = upsetWin ? -1 : 0;
  losers.forEach(l=>{
    addDelta(attrEffects, l.name, 'momentum', momentumDelta[l.name] || 0);
    if (losersRepKnock) bumpAttrLedger(state, l, 'reputation', losersRepKnock, attrEffects, 'Upset loss reputation knock', { ...refBase, evt:'loss' });
    if (rating <= 58)   bumpAttrLedger(state, l, 'consistency', -1,            attrEffects, 'Cold match consistency hit',    { ...refBase, evt:'loss' });
  });

  const text =
    `${winners.map(w=>w.name).join(" & ")} defeat ${losers.map(w=>w.name).join(" & ")}.` +
    (titleApplied ? " (Title bout)" : "");

  const explain = {
    aSideScore: aS,
    bSideScore: bS,
    probA,
    winners: winners.map(w=>w.name),
    losers: losers.map(w=>w.name),
    storyBonus: sBonus,
    baseChem,
    relBonus,                 // legacy-only, kept for debugging
    chemPts,                  // final chem fed to ratings.js
    alignmentPenaltyPct: Math.max(0, alignPct),
    titleApplied,
    titleChanged,
    momentumDelta,            // reported here, applied in runShow
    repeatPenalty: 0,         // runShow fills this
    hotMatch: hot,
    upsetWin,
    relMeta: {
      chemPts,
      moraleHint,
      inboxPos,
      inboxNeg,
    },
    oppStarAvgForWinners,
    attrEffects,
    title: titleName,
    champBefore: champBeforeLocal
  };

  return {
    rating,
    text,
    tags,
    defense,
    namesArr: matchNames,
    winners: winners.map(w=>w.name),
    losers: losers.map(w=>w.name),
    explain
  };
}
