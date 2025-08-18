import { TITLES } from '../data.js';
import { RAW } from '../util.js';
import { availableByBrand, getW, keyFromNames, byBrand } from './helpers.js';
import { pairKey } from './chemistry.js';
import { getStory } from './story.js';
import { getRelLevel, REL } from './relationships.js';

/* -------------------- SMARTER AI v2 (strict single-use, star floors, divisions, better promos) -------------------- */
export function aiBooking(state, brand){
  const CHANCE_WORLD_DEFENSE = 0.40;
  const CHANCE_WOMEN_DEFENSE = 0.35;
  const CHANCE_TAG_DEFENSE   = 0.35;

  const FLOOR = {
    MAIN_AVG_STAR:     80,
    MAIN_WOMEN_STAR:   72,
    OPENER_AVG_WORK:   74,
    MID_AVG_STAR:      62
  };

  const roster     = availableByBrand(state, brand);
  const menOnly    = roster.filter(w=>w.gender==="M");
  const womenOnly  = roster.filter(w=>w.gender==="F");
  const lastKeys   = new Set(state.lastWeekKeys[brand] || []);
  const champs     = state.champs[brand] || {};
  const titles     = TITLES[brand];

  const used = new Set();
  const usedPairs = new Set();

  const starScore = w => w.starpower*0.6 + w.likeability*0.25 + w.momentum*0.15 + (w.championOf ? 10 : 0);
  const workScore = w => w.workrate*0.60 + (w.psychology ?? 70)*0.30 + (w.consistency ?? 72)*0.10;

  const byStar = (arr)=> [...arr].sort((a,b)=> starScore(b)-starScore(a));
  const byWork = (arr)=> [...arr].sort((a,b)=> workScore(b)-workScore(a));

  const get    = (name)=> roster.find(w=>w.name===name);
  const free   = (n)=> n && !used.has(n);
  const mark   = (...ns)=> ns.forEach(n=> used.add(n));

  const legalSingles = (A,B)=> A&&B && A.gender===B.gender && free(A.name) && free(B.name) && !usedPairs.has(pairKey(A.name,B.name));
  const addSingles   = (A,B)=> { mark(A.name,B.name); usedPairs.add(pairKey(A.name,B.name)); return {type:"singles", a:A.name, b:B.name}; };

  const avgStar = (A,B)=> (starScore(A)+starScore(B))/2;
  const avgWork = (A,B)=> (workScore(A)+workScore(B))/2;
  const rivalryBoost = (A,B) => Math.max(0, getRelLevel(state, A.name, B.name)); // positive rivalry adds interest

  const preferNonRepeatPair = (pairs)=> {
    const hotEnough = (A,B)=>{
      const s = getStory(state, brand, [A.name,B.name]);
      return s && s.heat >= 28;
    };
    for(const [A,B] of pairs){
      const k = keyFromNames([A.name,B.name]);
      const immune = !!(state.hotMatches && state.hotMatches[k]);
      if(!lastKeys.has(k) || hotEnough(A,B) || immune) return [A,B];
    }
    return null;
  };

  const tagAffinity = (A,B) => Math.max(
    0,
    (getRelLevel(state, A.name, B.name)) // friend/tag/stable positive helps
  );

  const pickSinglesByStar = (pool, minAvgStar)=> {
    const src = byStar(pool);
    const pairs = [];
    for(let i=0;i<src.length;i++){
      for(let j=i+1;j<src.length;j++){
        const A=src[i], B=src[j];
        if(!legalSingles(A,B)) continue;
        if(avgStar(A,B) < minAvgStar) continue;
        pairs.push([A,B]);
      }
    }
    const p = preferNonRepeatPair(pairs);
    return p ? addSingles(p[0],p[1]) : null;
  };

  const pickSinglesByWork = (pool, minAvgWork)=> {
    const src = byWork(pool);
    const pairs = [];
    for(let i=0;i<src.length;i++){
      for(let j=i+1;j<src.length;j++){
        const A=src[i], B=src[j];
        if(!legalSingles(A,B)) continue;
        if(avgWork(A,B) < minAvgWork) continue;
        pairs.push([A,B]);
      }
    }
    const p = preferNonRepeatPair(pairs);
    return p ? addSingles(p[0],p[1]) : null;
  };

  const pickAnySingles = (pool)=> {
    const src = byStar(pool);
    for(let i=0;i<src.length;i++){
      for(let j=i+1;j<src.length;j++){
        const A=src[i], B=src[j];
        if(legalSingles(A,B)) return addSingles(A,B);
      }
    }
    return null;
  };

  const pickTagFrom = (pool)=>{
    const src = byWork(pool);
    for(let i=0;i<src.length-3;i++){
      for(let j=i+1;j<src.length-2;j++){
        for(let k=j+1;k<src.length-1;k++){
          for(let l=k+1;l<src.length;l++){
            const A=src[i], B=src[j], C=src[k], D=src[l];
            if([A,B,C,D].some(x=>used.has(x.name))) continue;
            if([B,C,D].some(x=>x.gender!==A.gender)) continue;
            const k1=pairKey(A.name,C.name), k2=pairKey(B.name,D.name);
            if(usedPairs.has(k1) || usedPairs.has(k2)) continue;
            mark(A.name,B.name,C.name,D.name);
            usedPairs.add(k1); usedPairs.add(k2);
            return {type:"tag", teams:[[A.name,B.name],[C.name,D.name]]};
          }
        }
      }
    }
    return null;
  };

  const hotStories = (state.storylines[brand]||[])
    .filter(s=> s.heat>=22)
    .sort((a,b)=> b.heat-a.heat);

  const firstViableStory = ()=>{
    for(const s of hotStories){
      const names = s.names.map(n=>get(n)).filter(Boolean);
      if(names.length===2 && legalSingles(names[0],names[1])) return {kind:"singles", A:names[0], B:names[1], heat:s.heat};
      if(names.length===4 && names.every(n=>!used.has(n.name)) && names.every(n=>n.gender===names[0].gender)){
        return {kind:"tag", A:names[0],B:names[1],C:names[2],D:names[3], heat:s.heat};
      }
    }
    return null;
  };

  const segs = { PreShow:null, Opener:null, Promo1:null, Tag:null, Promo2:null, Match:null, MainEvent:null };

  (()=> {
    const vs = firstViableStory();
    if(vs && vs.kind==="singles" && avgStar(vs.A,vs.B) >= FLOOR.MAIN_AVG_STAR){
      segs.MainEvent = addSingles(vs.A,vs.B);
      return;
    }

    const world = champs.World;
    if(typeof world==="string" && Math.random()<CHANCE_WORLD_DEFENSE){
      const champ = get(world);
      if(champ){
        const pool = roster.filter(w=> w.gender===champ.gender && w.name!==champ.name && free(w.name));
        const contender = byStar(pool).find(x=>free(x.name));
        if(contender && legalSingles(champ, contender) && avgStar(champ,contender) >= FLOOR.MAIN_AVG_STAR){
          segs.MainEvent = {...addSingles(champ, contender), championship:"World"};
          return;
        }
      }
    }

    if(titles.includes("Women")){
      const wHolder = champs.Women;
      if(typeof wHolder==="string"){
        const champ = get(wHolder);
        const pool = womenOnly.filter(w=> w.name!==wHolder && free(w.name));
        const contender = byStar(pool).find(x=>free(x.name));
        if(champ && contender && legalSingles(champ, contender) && avgStar(champ,contender) >= FLOOR.MAIN_WOMEN_STAR){
          if(Math.random() < 0.15){
            segs.MainEvent = {...addSingles(champ, contender), championship:"Women"};
            return;
          }
        }
      }
    }

    const top = pickSinglesByStar(menOnly.length>=2?menOnly:roster, FLOOR.MAIN_AVG_STAR);
    if(top){ segs.MainEvent = top; return; }

    segs.MainEvent = pickSinglesByStar(roster, FLOOR.MAIN_AVG_STAR-5) || pickAnySingles(roster);
  })();

  (()=> {
    const pool = roster.filter(w=>!used.has(w.name));
    segs.Opener = pickSinglesByWork(pool, FLOOR.OPENER_AVG_WORK)
               || pickSinglesByWork(pool, FLOOR.OPENER_AVG_WORK-4)
               || pickAnySingles(pool);
  })();

  (()=> {
    const tagHolder = champs.Tag;
    if(Array.isArray(tagHolder) && tagHolder.every(n=>get(n)) && Math.random()<CHANCE_TAG_DEFENSE){
      const [h1,h2] = tagHolder.map(n=>get(n));
      if(free(h1.name) && free(h2.name)){
        const g = h1.gender;
        const oppPool = roster.filter(w=> w.gender===g && ![h1.name,h2.name].includes(w.name) && free(w.name));
        const oppTag = pickTagFrom(oppPool);
        if(oppTag){
          segs.Tag = { type:"tag", teams:[[h1.name,h2.name],[oppTag.teams[1][0], oppTag.teams[1][1]]], championship:"Tag" };
          return;
        }
      }
    }
    const vs = firstViableStory();
    if(!segs.Tag && vs && vs.kind==="tag"){
      if([vs.A,vs.B,vs.C,vs.D].every(x=>free(x.name))){
        mark(vs.A.name,vs.B.name,vs.C.name,vs.D.name);
        segs.Tag = {type:"tag", teams:[[vs.A.name,vs.B.name],[vs.C.name,vs.D.name]]};
        return;
      }
    }
    segs.Tag = pickTagFrom(roster.filter(w=>!used.has(w.name)));
  })();

  let womenBooked = false;
  (()=> {
    const poolW = womenOnly.filter(w=>!used.has(w.name));
    if(poolW.length>=2){
      const wTitle = titles.includes("Women") ? champs.Women : null;
      if(typeof wTitle==="string" && Math.random()<CHANCE_WOMEN_DEFENSE){
        const champ = get(wTitle);
        const opp = byStar(poolW).find(w=> w.name!==champ?.name && free(w.name));
        if(champ && opp && legalSingles(champ, opp)){
          const bout = {...addSingles(champ, opp), championship:"Women"};
          if(!segs.PreShow) segs.PreShow = bout;
          else segs.Match = segs.Match ?? bout;
          womenBooked = true;
          return;
        }
      }
      if(!womenBooked){
        const bout = pickSinglesByStar(poolW, 55) || pickAnySingles(poolW);
        if(bout){
          if(!segs.PreShow) segs.PreShow = bout;
          else segs.Match = segs.Match ?? bout;
          womenBooked = true;
        }
      }
    }
  })();

  if(!segs.Match){
    const pool = roster.filter(w=>!used.has(w.name));
    const styleScore = (w)=> ({
      flyer: (w.workrate >= 70 && (w.stamina ?? 60) >= 65) ? 1 : 0,
      big:   (w.durability ?? 60) >= 70 ? 1 : 0,
      tech:  (w.psychology ?? 60) >= 70 ? 1 : 0
    });

    const src = byStar(pool);
    let picked = null;
    for(let i=0;i<src.length;i++){
      for(let j=i+1;j<src.length;j++){
        const A=src[i], B=src[j];
        if(!legalSingles(A,B)) continue;
        const a = styleScore(A), b = styleScore(B);
        const complement =
          (a.flyer && b.tech) || (b.flyer && a.tech) ||
          (a.big && !b.big)   || (!a.big && b.big);
        if(complement){ picked = addSingles(A,B); break; }
      }
      if(picked) break;
    }
    segs.Match = picked || pickSinglesByStar(pool, FLOOR.MID_AVG_STAR) || pickAnySingles(pool);
  }

  const talkScore = w => ((w.charisma ?? 60) + (w.mic ?? 60))/2;
  const inMainEvent = new Set(
    (segs.MainEvent?.type==="singles")
      ? [segs.MainEvent.a, segs.MainEvent.b]
      : []
  );

  const isStoryName = (n)=> (state.storylines[brand]||[]).some(s=>s.heat>0 && s.names.includes(n));
  const isChamp = (w)=> !!w.championOf;
  const minPromo = 70;

  const pickSpeaker = (preferME=false)=>{
    let pool = roster.filter(w=>!used.has(w.name)).sort((a,b)=> talkScore(b)-talkScore(a));
    let strong = pool.filter(w=> talkScore(w) >= minPromo);

    const pickFrom = (arr)=>{
      if(preferME){
        const me = arr.find(w=> inMainEvent.has(w.name));
        if(me) return me;
      }
      return arr.find(isChamp) || arr.find(w=> isStoryName(w.name)) || arr[0] || null;
    };

    const choice = pickFrom(strong) || pickFrom(pool);
    if(choice){ used.add(choice.name); return choice.name; }
    return null;
  };

  const sp1 = pickSpeaker(true);  if(sp1) segs.Promo1 = {type:"promo", speaker:sp1};
  const sp2 = pickSpeaker(false); if(sp2) segs.Promo2 = {type:"promo", speaker:sp2};

  const fixSingles = (slotKey)=>{
    const s=segs[slotKey];
    if(!s){
      const pool = roster.filter(w=>!used.has(w.name));
      segs[slotKey] = pickAnySingles(pool);
      return;
    }
    if(s.type!=="singles") return;
    const A=get(s.a), B=get(s.b);
    if(!(A&&B) || A.gender!==B.gender){
      const pool = roster.filter(w=>!used.has(w.name));
      segs[slotKey] = pickAnySingles(pool);
    }
  };
  ["PreShow","Opener","Match","MainEvent"].forEach(fixSingles);

  if(segs.Tag && segs.Tag.type==="tag"){
    const t=segs.Tag.teams;
    const ok = t && t.length===2 && t[0].length===2 && t[1].length===2;
    if(!ok) segs.Tag = pickTagFrom(roster.filter(w=>!used.has(w.name)));
  } else if(!segs.Tag){
    segs.Tag = pickTagFrom(roster.filter(w=>!used.has(w.name)));
  }

  for(const k of ["PreShow","Opener","Match","MainEvent"]){
    const s=segs[k];
    if(s?.type==="singles"){
      const A=get(s.a), B=get(s.b);
      if(A && B && A.gender!==B.gender){
        const pool = roster.filter(w=>!used.has(w.name) && w.gender===A.gender);
        segs[k] = pickAnySingles(pool) || pickAnySingles(roster.filter(w=>!used.has(w.name)));
      }
    }
  }

  return segs;
}
