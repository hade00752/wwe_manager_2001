import { RAW, SD, clamp, r } from '../util.js';
import { TITLES } from '../data.js';
import { getW } from './helpers.js';

export function setChampionFlags(state){
  state.roster.forEach(w=>w.championOf=null);
  for(const brand of [RAW,SD]){
    const t = state.champs[brand];
    for(const title in t){
      const holder = t[title]; if(!holder) continue;
      const names = Array.isArray(holder)? holder : [holder];
      for(const n of names){ const w=getW(state,n); if(w) w.championOf = (w.championOf? w.championOf+", ":"")+`${brand} ${title}`; }
    }
  }
}

export function stripCrossBrandTitles(state){
  for (const brand of [RAW,SD]){
    for (const title of TITLES[brand]){
      const holder = state.champs[brand][title];
      if(!holder) continue;
      const names = Array.isArray(holder)? holder : [holder];
      const valid = names.every(n => getW(state,n)?.brand === brand);
      if(!valid) state.champs[brand][title] = null;
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
    for(const n of names){ const w=getW(state,n); if(w){ avgLike+=w.likeability; avgMom+=w.momentum; avgCon+= (w.consistency ?? 70); avgSP+= w.starpower; } }
    avgLike/=names.length; avgMom/=names.length; avgCon/=names.length; avgSP/=names.length;

    // weak champ aura => ratings drag; fans acclimate slowly
    const auraScore = (avgSP*0.5 + avgCon*0.25 + avgLike*0.15 + avgMom*0.10);
    if(auraScore < 70){
      const pen = Math.max(0, Math.round((70 - auraScore) * 0.15));
      totalPenalty += pen;
      for(const n of names){ const w=getW(state,n); if(w){ w.likeability=clamp(w.likeability+1,0,99); w.momentum=clamp(w.momentum+1,0,99); } }
    }
  }
  return { totalPenalty };
}
