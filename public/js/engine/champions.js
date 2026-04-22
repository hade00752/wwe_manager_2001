import { RAW, SD, clamp, r } from '../util.js';
import { TITLES } from '../data.js';
import { getW } from './helpers.js';

export function titleWeight(title) {
    const t = String(title || '').trim().toLowerCase();
    if (!t) return 0;
    if (t === 'world') return 3;
    if (t === 'tag') return 2;
    if (t === 'women' || t === "women's" || t === 'womens') return 2;
    if (t === 'intercontinental') return 1;
    if (t === 'united states' || t === 'us') return 1;
    if (t === 'cruiserweight') return 1;
    return 1;
}

function computeChampPresentForForced(title, champ, namesArr) {
  if (!champ) return false;

  if (title === "Tag" && Array.isArray(champ)) {
    const champSet = new Set(champ);
    const sideASet = new Set([namesArr[0], namesArr[1]]);
    const sideBSet = new Set([namesArr[2], namesArr[3]]);

    const sameSet = (A, B) => {
      if (A.size !== B.size) return false;
      for (const v of A) if (!B.has(v)) return false;
      return true;
    };

    return sameSet(champSet, sideASet) || sameSet(champSet, sideBSet);
  }

  const champLC = String(champ).toLowerCase().trim();
  const namesLC = (namesArr || []).map(n => String(n).toLowerCase().trim());
  return namesLC.includes(champLC);
}

export function isTitleTagChange(tags) {
    if (!Array.isArray(tags)) return false;
    return tags.includes('title change!') || tags.includes('title change');
}

export function isTitleTagDefense(tags) {
    if (!Array.isArray(tags)) return false;
    return tags.includes('title defense') || tags.includes('defense');
}

export function capNeg(n, floor) {
    return Math.max(floor, n);
}

export function applyForcedOutcome(namesArr, outcomeCode, isTag) {
    if (!outcomeCode || outcomeCode === 'ENG') return null;
    if (outcomeCode === 'NC') return {
        winners: [],
        losers: [],
        nocontest: true
    };
    if (!isTag) {
        return (outcomeCode === 'A') ? {
            winners: [namesArr[0]],
            losers: [namesArr[1]]
        } : {
            winners: [namesArr[1]],
            losers: [namesArr[0]]
        };
    }
    const teamA = [namesArr[0], namesArr[1]];
    const teamB = [namesArr[2], namesArr[3]];
    const code = String(outcomeCode).trim();
    if (code === 'TeamA' || code === 'A') return {
        winners: teamA,
        losers: teamB
    };
    if (code === 'TeamB' || code === 'B') return {
        winners: teamB,
        losers: teamA
    };
    return null;
}

export function applyForcedTitleResult({
    state,
    brand,
    title,
    champsBefore,
    namesArr,
    winners,
    tags,
    det
}) {
    if (!title || !champsBefore) return tags;
    state.champs = champsBefore;
    const champ = state.champs?.[brand]?.[title] ?? null;
    if (!champ) return tags;
    const champPresent = computeChampPresentForForced(title, champ, namesArr);
    tags = (tags || []).filter(t => !/^title\b/i.test(t) && t !== 'title change!');
    if (!champPresent) return tags;
    det.titleApplied = true;
    if (title === "Tag") {
        const winSet = new Set(winners);
        const champSet = Array.isArray(champ) ? new Set(champ) : new Set();
        let retained = false;
        if (Array.isArray(champ) && champSet.size === winSet.size) {
            retained = true;
            for (const v of champSet)
                if (!winSet.has(v)) {
                    retained = false;
                    break;
                }
        }
        if (retained) {
            tags.push("title defense");
            det.titleChanged = false;
            det.titleDefense = true;
        } else {
            state.champs[brand][title] = [winners[0], winners[1]];
            setChampionFlags(state);
            tags.push("title change!");
            det.titleChanged = true;
            det.titleDefense = false;
        }
    } else {
        const retained = (String(champ).trim() === String(winners[0]).trim());
        if (retained) {
            tags.push("title defense");
            det.titleChanged = false;
            det.titleDefense = true;
        } else {
            state.champs[brand][title] = winners[0];
            setChampionFlags(state);
            tags.push("title change!");
            det.titleChanged = true;
            det.titleDefense = false;
        }
    }
    return tags;
}

export function setChampionFlags(state){
  // ✅ harden
  if (!state || !Array.isArray(state.roster)) return;
  state.roster.forEach(w => { if (w) w.championOf = null; });

  if (!state.champs) return;

  for(const brand of [RAW,SD]){
    const t = state.champs?.[brand] || {};
    for(const title in t){
      const holder = t[title]; if(!holder) continue;
      const names = Array.isArray(holder)? holder : [holder];
      for(const n of names){
        const w = getW(state, n);
        if(w) w.championOf = (w.championOf ? w.championOf + ", " : "") + `${brand} ${title}`;
      }
    }
  }
}

export function stripCrossBrandTitles(state){
  // ✅ guard: if roster isn't ready, DO NOT VACATE TITLES
  if (!state || !state.champs || !Array.isArray(state.roster)) return;
  if (state.roster.length === 0) return;

  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const normBrand = (b) => {
    const x = String(b ?? '').trim().toUpperCase();
    if (x === 'SMACKDOWN') return SD;
    if (x === 'RAW') return RAW;
    if (x === 'FA' || x === 'FREE AGENCY' || x === 'FREEAGENCY') return 'FA';
    if (x === 'SD') return SD;
    return x;
  };

  // ✅ if brands haven't been normalized yet (e.g. everyone is FA or blank), skip stripping
  const hasSomeBranding = state.roster.some(w => {
    const wb = normBrand(w?.brand);
    return wb === RAW || wb === SD;
  });
  if (!hasSomeBranding) return;

  // safer resolver than getW for name weirdness
  const findByName = (name) => {
    const key = norm(name);
    if (!key) return null;

    // try exact first
    let w = getW(state, name);
    if (w) return w;

    // fallback: case/trim match over roster
    return (state.roster || []).find(x => norm(x?.name) === key) || null;
  };

  for (const brand of [RAW, SD]) {
    const titles = Array.isArray(TITLES?.[brand]) ? TITLES[brand] : [];
    state.champs[brand] = state.champs[brand] || {};

    // ✅ if roster has nobody on this brand yet, don't strip this brand's titles
    const brandRosterCount = state.roster.filter(w => normBrand(w?.brand) === brand).length;
    if (brandRosterCount === 0) continue;

    for (const title of titles) {
      const holder = state.champs[brand][title];
      if (!holder) continue;

      const names = Array.isArray(holder) ? holder : [holder];

      // Vacant if any holder missing OR brand mismatch OR holder is FA
      const valid = names.every(n => {
        const w = findByName(n);
        if (!w) return false;
        const wb = normBrand(w.brand);
        if (wb === 'FA') return false;
        return wb === brand; // must be exactly RAW or SD
      });

      if (!valid) state.champs[brand][title] = null;
    }
  }

  setChampionFlags(state);
}

export const champObj = (state,brand,title)=> state.champs[brand]?.[title] ?? null;

export function acclimateChamp(winners){
  winners.forEach(w=>{
    w.likeability = clamp(w.likeability + r(2,4), 0, 99);
    w.momentum    = clamp(w.momentum + r(2,5), 0, 99);
  });
}

export function applyChampionAuraDrift(state, brand){
  let totalPenalty=0;
  for(const t of TITLES[brand]){
    const holder = state.champs[brand][t];
    if(!holder) continue;
    const names = Array.isArray(holder) ? holder : [holder];
    let avgLike=0, avgMom=0, avgCon=0, avgSP=0;
    for(const n of names){
      const w=getW(state,n);
      if(w){
        avgLike+=w.likeability;
        avgMom+=w.momentum;
        avgCon+= (w.consistency ?? 70);
        avgSP+= w.starpower;
      }
    }
    avgLike/=names.length; avgMom/=names.length; avgCon/=names.length; avgSP/=names.length;

    // weak champ aura => ratings drag; fans acclimate slowly
    const auraScore = (avgSP*0.5 + avgCon*0.25 + avgLike*0.15 + avgMom*0.10);
    if(auraScore < 70){
      const pen = Math.max(0, Math.round((70 - auraScore) * 0.15));
      totalPenalty += pen;
      for (const n of names) {
        const w = getW(state, n);
        if (w) {
          w.likeability = clamp(w.likeability + 1, 0, 99);
          // momentum should be match/booked push, not passive acclimation
        }
      }
    }
  }
  return { totalPenalty };
}
