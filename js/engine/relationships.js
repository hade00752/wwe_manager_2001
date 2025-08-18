// relationships.js — dynamic graph of wrestler relationships (2000–2002 era seed)
// Types: "friend", "tag", "stable", "rival", "romance", "family", "heat" (backstage tension)
//
// level: -100..100 (soft-capped during ops); positive = closer, negative = animosity
// flags: { kayfabe?:true, backstage?:true } to separate on-screen vs real/backstage
//
// Effects (recommended):
//  - Chemistry baseline: friend/tag/stable/romance +1..+4, rival +2..+5, heat -2..-8
//  - Morale: teaming with friend +1 morale tick, being kept apart from partner/stable too long -1
//  - Inbox. Use this data to spawn story beats (breakups, “we want a shot”, “locker room issue”)

import { clamp } from '../util.js';
import { getW } from './helpers.js';

export const REL = {
  FRIEND:   "friend",
  TAG:      "tag",
  STABLE:   "stable",
  RIVAL:    "rival",
  ROMANCE:  "romance",
  FAMILY:   "family",
  HEAT:     "heat",
};

const CAP = 100;
const STEP = {
  TEAM_WIN:     +6,
  TEAM_LOSS:    +2,
  FACE_OFF:     +3,
  TITLE_TAKE:   +6,
  TITLE_LOSE:   -4,
  HOT_MATCH:    +4, // mutual respect
  INJURY_CAUSE: -12,
  BACKSTAGE_T:  -6
};

export function defaultRelationships(){
  return []; // we’ll seed with seedEra2000 later
}

// store is an array of { a, b, type, level, kayfabe?, backstage? }
export function getRel(state, a, b, type = null){
  if(!state.relationships) state.relationships = [];
  const [x,y] = [a,b].sort();
  const arr = state.relationships.filter(r => r.a===x && r.b===y);
  if(type) return arr.find(r => r.type===type) || null;
  return arr;
}

export function getRelLevel(state, a, b){
  // combined net (sum of all edges)
  const rs = getRel(state,a,b);
  return rs.reduce((sum,r)=> sum + (r.level||0), 0);
}

export function setRel(state, a, b, type, level, flags={}){
  if(!state.relationships) state.relationships = [];
  const [x,y] = [a,b].sort();
  let edge = state.relationships.find(r => r.a===x && r.b===y && r.type===type);
  if(!edge){
    edge = { a:x, b:y, type, level:0, ...flags };
    state.relationships.push(edge);
  }
  edge.level = clamp(level, -CAP, CAP);
  if(flags.kayfabe !== undefined) edge.kayfabe = flags.kayfabe;
  if(flags.backstage !== undefined) edge.backstage = flags.backstage;
  return edge;
}

export function bumpRel(state, a, b, type, delta){
  const e = getRel(state, a, b, type) || setRel(state, a, b, type, 0);
  e.level = clamp(e.level + delta, -CAP, CAP);
  return e.level;
}

// chemistry baseline derived from relationships
// returns integer bonus (can be negative)
export function relationshipChemBonus(state, a, b){
  const sum = (t,scale)=> (getRel(state,a,b,t)?.level || 0) * scale;
  // Positive drivers
  const pos =
    sum(REL.ROMANCE,  0.04) +   // up to +4
    sum(REL.FRIEND,   0.03) +   // up to +3
    sum(REL.TAG,      0.04) +   // up to +4
    sum(REL.STABLE,   0.02) +   // up to +2
    sum(REL.RIVAL,    0.05);    // hot rivalries can really pop: up to +5
  // Negative driver (backstage heat drags)
  const neg = (getRel(state,a,b,REL.HEAT)?.level || 0) * -0.08; // up to -8
  // family: slight, because kayfabe family doesn’t always help workrate
  const fam = (getRel(state,a,b,REL.FAMILY)?.level || 0) * 0.01; // up to +1
  return Math.round(pos + neg + fam);
}

// weekly decay toward 0 (keeps graph lively)
export function decayRelationships(state){
  if(!state.relationships) return;
  const DECAY = 2; // per week toward 0
  state.relationships.forEach(e=>{
    if(e.level > 0) e.level = Math.max(0, e.level-DECAY);
    else if(e.level < 0) e.level = Math.min(0, e.level+DECAY);
  });
  // prune near-zero noise
  state.relationships = state.relationships.filter(e => Math.abs(e.level) >= 1);
}

// ===== Hooks the engine should call during results =====

export function onTagTeammatesResult(state, A, B, win, hot){
  bumpRel(state, A.name, B.name, REL.TAG, win ? STEP.TEAM_WIN : STEP.TEAM_LOSS);
  if(hot) bumpRel(state, A.name, B.name, REL.FRIEND, STEP.HOT_MATCH);
}
export function onSinglesFaceOff(state, A, B, hot, titleChanged){
  bumpRel(state, A.name, B.name, REL.RIVAL, STEP.FACE_OFF);
  if(hot) bumpRel(state, A.name, B.name, REL.RIVAL, STEP.HOT_MATCH);
  if(titleChanged) {
    bumpRel(state, A.name, B.name, REL.RIVAL, STEP.TITLE_TAKE);
    bumpRel(state, A.name, B.name, REL.FRIEND, STEP.TITLE_LOSE * -1); // small dip in respect
  }
}
export function onDangerSpot(state, causeName, victimName){
  bumpRel(state, causeName, victimName, REL.HEAT, STEP.INJURY_CAUSE);
}

// ===== Era-accurate(ish) seeds for 2000–2002 (kayfabe/backstage noted) =====
export function seedEra2000(state){
  const K = { kayfabe:true }, B = { backstage:true };
  const add = (a,b,type,level,flags={})=> setRel(state,a,b,type,level,flags);

  // Tag teams / stables
  add(state, "Edge","Christian",       REL.TAG,    85, K);
  add(state, "Matt Hardy","Jeff Hardy",REL.TAG,    90, B);  // brothers
  add(state, "Bubba Ray Dudley","D-Von Dudley", REL.TAG, 88, K);
  add(state, "Bradshaw","Faarooq",     REL.TAG,    80, K);
  add(state, "Kane","The Undertaker",  REL.STABLE, 70, K);
  add(state, "Kurt Angle","Chris Benoit", REL.RIVAL, 70, K);
  add(state, "The Rock","Triple H",    REL.RIVAL,  75, K);
  add(state, "The Rock","Stone Cold Steve Austin", REL.RIVAL, 80, K);
  add(state, "Trish Stratus","Lita",   REL.RIVAL,  65, K);

  // McMahon family (kayfabe + backstage)
  add(state, "Vince McMahon","Shane McMahon",   REL.FAMILY, 80, B);
  add(state, "Vince McMahon","Stephanie McMahon", REL.FAMILY, 80, B);
  add(state, "Shane McMahon","Stephanie McMahon", REL.FAMILY, 70, B);
  add(state, "Triple H","Stephanie McMahon", REL.ROMANCE, 65, B); // era-adjacent

  // Known friends / road buddies (soft backstage)
  add(state, "Chris Jericho","Lance Storm", REL.FRIEND, 60, B);
  add(state, "Edge","Christian",            REL.FRIEND, 75, B);
  add(state, "Chris Benoit","Eddie Guerrero", REL.FRIEND, 65, B);

  // On-screen relationships
  add(state, "Trish Stratus","Vince McMahon", REL.ROMANCE, 40, K);
  add(state, "Chyna","Triple H",              REL.RIVAL,   60, K);

  // Light friction (backstage heat where historically rumored—kept mild)
  add(state, "Chris Jericho","Triple H", REL.HEAT, 20, B);
}
