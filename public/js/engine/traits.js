// public/js/engine/traits.js
// Traits catalog + light hooks (data-first).
// Designed to coexist with relationships/chemistry/story without heavy coupling.

import { clamp } from '../util.js';

export const TRAIT_CATS = {
  CORE: "core",
  STATUS: "status",
  RARE: "rare",
};

/* =============================== CATALOG =============================== */
export const TRAIT_EFFECTS = {
  /* ===================== CORE PERSONALITY / WORK (≈35–40) ===================== */
  CompanyGuy:           { cat: "core", hooks:{ morale:{ jobbingLossMultiplier:0.5 }, respectVs:{ Politicker:-10, LockerRoomLeader:+10 } } },
  Politicker:           { cat: "core", hooks:{ momentum:{ gainPct:+0.05 }, respectVs:{ Politicker:+10, CompanyGuy:-15, Workhorse:-10 }, event:{ complaintWeight:+1 } } },
  LockerRoomLeader:     { cat: "core", hooks:{ aura:{ allyMoraleAura:+4 }, dislikeVs:{ LazyConditioningHeat:-15, Unreliable:-10 }, trustBase:+3 } },
  HeatMagnet:           { cat: "core", hooks:{ trustBase:-5, event:{ complaintWeight:+2 }, respectVs:{ Politicker:+10 } } },
  Workhorse:            { cat: "core", hooks:{ momentum:{ longMatchGainPct:+0.05 }, respectVs:{ LockerRoomLeader:+10, Veteran:+10, Politicker:-10 } } },
  LazyConditioningHeat: { cat: "core", hooks:{ momentum:{ gainPct:-0.10 }, respectFrom:{ LockerRoomLeader:-15, Workhorse:-10 } } },
  Unreliable:           { cat: "core", hooks:{ weeklyTrustDecayIfUnbooked:-3, respectFrom:{ LockerRoomLeader:-10, CompanyGuy:-10 } } },
  Diva:                 { cat: "core", hooks:{ morale:{ mainEventBonus:+10, offShowPenalty:-15 }, respectFrom:{ Veteran:-10 } } },
  BulldogEnforcer:      { cat: "core", hooks:{ rookieStartRespect:-15, respectVs:{ LockerRoomLeader:+10 } } },
  FanFavorite:          { cat: "core", hooks:{ momentum:{ winMultiplier:2.0 }, trustBase:+5, respectVs:{ Politicker:-5 } } },
  Showman:              { cat: "core", hooks:{ momentum:{ charismaScaling:+0.10 }, respectFrom:{ Workhorse:-5 } } },
  Opportunist:          { cat: "core", hooks:{ event:{ betrayalWeight:+3 }, respectVs:{ Politicker:+10, LockerRoomLeader:-10 } } },
  Veteran:              { cat: "core", hooks:{ respectBase:+10, respectRules:[{ifOtherHas:"Veteran",delta:+10},{ifOtherHas:"LockerRoomLeader",delta:+10},{ifOtherHas:"Rookie",delta:-10}] } },
  Rookie:               { cat: "core", hooks:{ morale:{ volatilityPct:+0.20 }, respectFrom:{ Veteran:-10 }, trustGainWith:{ Workhorse:+15 } } },
  BatteredBody:         { cat: "core", hooks:{ injury:{ selfRiskMultiplier:2.0 }, respectVs:{ Workhorse:+10 }, morale:{ longMatchPenalty:-10 } } },

  // Additional core traits
  Hothead:              { cat: "core", hooks:{ event:{ complaintWeight:+1 }, morale:{ volatilityPct:+0.10 } } },
  ProfessionalRivalSeeker:{ cat:"core", hooks:{ event:{ rivalrySeek:+2 }, respectVs:{ Workhorse:+5 } } },
  CharismaBlackHole:    { cat: "core", hooks:{ momentum:{ charismaScaling:-0.10 } } },
  SafeWorker:           { cat: "core", hooks:{ injury:{ opponentRiskPct:-10 }, respectFromPeers:+5 } },
  StiffWorker:          { cat: "core", hooks:{ injury:{ opponentRiskPct:+5 }, respectVs:{ BulldogEnforcer:+5, Workhorse:+3 } } },
  RingGeneral:          { cat: "core", hooks:{ momentum:{ longMatchGainPct:+0.03 }, respectFromPeers:+5, trustBase:+2 } },
  SpotMonkey:           { cat: "core", hooks:{ momentum:{ highSpotBonus:+8 }, injury:{ selfRiskPct:+6 }, respectFrom:{ Workhorse:-3 } } },
  TechnicalAce:         { cat: "core", hooks:{ respectVs:{ Workhorse:+5, Veteran:+3 }, momentum:{ longMatchGainPct:+0.02 } } },
  Shooter:              { cat: "core", hooks:{ respectVs:{ Workhorse:+3, RingGeneral:+3 }, trustBase:+1 } },
  BrawlerCore:          { cat: "core", hooks:{ respectVs:{ BulldogEnforcer:+5 }, momentum:{ gainPct:+0.01 } } },
  PowerhouseCore:       { cat: "core", hooks:{ momentum:{ gainPct:+0.01 }, respectFrom:{ TechnicalAce:-2 } } },
  HighFlyerCore:        { cat: "core", hooks:{ momentum:{ highSpotBonus:+6 }, injury:{ selfRiskPct:+5 } } },
  GiantFrame:           { cat: "core", hooks:{ momentum:{ gainPct:+0.01 }, respectFromPeers:+3 } },
  Innovator:            { cat: "core", hooks:{ event:{ creativeIdeas:+2 }, respectFromPeers:+3 } },
  Comedian:             { cat: "core", hooks:{ morale:{ offShowPenalty:-5 }, aura:{ allyMoraleAura:+2 } } },
  SeriousPro:           { cat: "core", hooks:{ trustBase:+2, respectFromPeers:+2 } },
  Trainer:              { cat: "core", hooks:{ rookieTrustGain:+10, respectFrom:{ Rookie:+10 } } },
  TeamPlayer:           { cat: "core", hooks:{ trustBase:+3, aura:{ allyMoraleAura:+2 } } },
  LoneWolf:             { cat: "core", hooks:{ aura:{ allyMoraleAura:-2 }, trustBase:-2 } },
  CloutChaser:          { cat: "core", hooks:{ respectVs:{ CourtFavorite:+5, Politicker:+5 }, event:{ betrayalWeight:+1 } } },
  MediaFriendly:        { cat: "core", hooks:{ fanReactions:+5 } },
  StraightEdge:         { cat: "core", hooks:{ trustBase:+2, respectFrom:{ LockerRoomLeader:+2 } } },
  Partier:              { cat: "core", hooks:{ trustBase:-2, event:{ complaintWeight:+1 } } },
  NoShowRisk:           { cat: "core", hooks:{ availability:{ noShowChance:+2 }, trustBase:-3 } },
  Prankster:            { cat: "core", hooks:{ aura:{ allyMoraleAura:+1 }, respectFrom:{ LockerRoomLeader:-2 } } },

  /* ============================= STATUS (≈20–25) ============================= */
  Champion:             { cat: "status", hooks:{ morale:{ flat:+10 }, respectBase:+5, jealousyFromOthers:-5 } },
  FormerChampion:       { cat: "status", hooks:{ respectBase:+5 } },
  Married:              { cat: "status", hooks:{ romance:{ lockTrust:true, sharedMoraleWithSpouse:true } } },
  Lovers:               { cat: "status", hooks:{ romance:{ bookedTogetherBonus:+10, breakupPenalty:-15 } } },
  Injured:              { cat: "status", hooks:{ availability:{ canBook:false }, trustFromMgmt:-5 } },
  Suspended:            { cat: "status", hooks:{ availability:{ canBook:false }, heatIfMagnet:+20 } },
  RetiringSoon:         { cat: "status", hooks:{ respectFrom:{ Rookie:+10 }, morale:{ flat:-10 } } },
  OnProbation:          { cat: "status", hooks:{ respectFrom:{ LockerRoomLeader:-10, Veteran:-10 } } },
  Manager:              { cat: "status", hooks:{ allyBoost:{ momentumGainPct:+0.10 } } },
  TagTeamSpecialist:    { cat: "status", hooks:{ morale:{ tagMatchBonus:+10, singlesLossPenalty:-5 } } },
  StableMember:         { cat: "status", hooks:{ aura:{ allyMoraleAura:+1 } } },
  AuthorityFigure:      { cat: "status", hooks:{ bookingBias:{ pushBias:+10 }, respectFromPeers:-5 } },
  PartTime:             { cat: "status", hooks:{ availability:{ bookFreq:-50 }, fanReactions:+5 } },
  ComebackTour:         { cat: "status", hooks:{ fanReactions:+8, morale:{ flat:+5 } } },
  Developmental:        { cat: "status", hooks:{ respectFrom:{ Veteran:-5 }, rookieTrustGain:+10 } },
  CallUp:               { cat: "status", hooks:{ morale:{ volatilityPct:+0.15 }, respectFrom:{ Veteran:-5 } } },
  OnLoan:               { cat: "status", hooks:{ availability:{ crossBrand:true } } },
  BrandCaptain:         { cat: "status", hooks:{ aura:{ allyMoraleAura:+3 }, respectFromPeers:+3 } },
  FreeAgent:            { cat: "status", hooks:{ trustBase:-2, bookingBias:{ pushBias:+5 } } },
  DraftProtected:       { cat: "status", hooks:{ trustFromMgmt:+3 } },

  /* =========================== RARE / EVENT (≈25–30) =========================== */
  HotStreak:            { cat: "rare", hooks:{ momentum:{ winMultiplier:2.0 }, ttlWeeks:4 } },
  ColdStreak:           { cat: "rare", hooks:{ morale:{ decayMultiplier:2.0 }, ttlWeeks:4 } },
  Betrayer:             { cat: "rare", hooks:{ trustPermanentVictimPenalty:-20, respectVs:{ Opportunist:+10 } } },
  WellnessStrike:       { cat: "rare", hooks:{ availability:{ canBook:false }, heatIfMagnet:+10 } },
  CourtFavorite:        { cat: "rare", hooks:{ bookingBias:{ pushBias:+20 }, respectFromPeers:-10 } },
  ProblemCase:          { cat: "rare", hooks:{ event:{ complaintWeight:+3 } } },
  CultFavorite:         { cat: "rare", hooks:{ momentum:{ lossPenaltyMultiplier:0.5 }, fanReactions:+10 } },
  Overachiever:         { cat: "rare", hooks:{ momentum:{ vsHigherStarpowerMultiplier:2.0 } } },
  Underachiever:        { cat: "rare", hooks:{ momentum:{ vsLowerStarpowerMultiplier:0.5 } } },
  FlashyRiskTaker:      { cat: "rare", hooks:{ momentum:{ highSpotBonus:+10 }, injury:{ selfRiskPct:+10 }, respectVs:{ Workhorse:+5, LockerRoomLeader:-5 } } },
  UnsafeWorker:         { cat: "rare", hooks:{ injury:{ opponentRiskPct:+20 }, trustBase:-15, respectFromPeers:-15 } },
  Mentor:               { cat: "rare", hooks:{ rookieTrustGain:+15, respectFrom:{ Veteran:+10 } } },
  ClutchPerformer:      { cat: "rare", hooks:{ morale:{ mainEventBonus:+10 }, respectFrom:{ LockerRoomLeader:+5 } } },
  BigMatchChoker:       { cat: "rare", hooks:{ morale:{ mainEventPenalty:-15 }, respectFrom:{ LockerRoomLeader:-5 } } },
  MediaScandal:         { cat: "rare", hooks:{ trustBase:-8, bookingBias:{ pushBias:-10 }, ttlWeeks:6 } },
  LegalIssue:           { cat: "rare", hooks:{ availability:{ canBook:false }, trustFromMgmt:-8, ttlWeeks:8 } },
  PRNightmare:          { cat: "rare", hooks:{ respectFromPeers:-8, fanReactions:-8, ttlWeeks:4 } },
  SurpriseReturn:       { cat: "rare", hooks:{ fanReactions:+12, momentum:{ winMultiplier:1.25 }, ttlWeeks:4 } },
  CreativeFreedom:      { cat: "rare", hooks:{ event:{ creativeIdeas:+3 }, bookingBias:{ pushBias:+5 }, ttlWeeks:6 } },
  CreativePunishment:   { cat: "rare", hooks:{ bookingBias:{ pushBias:-10 }, morale:{ flat:-5 }, ttlWeeks:4 } },
  FanBacklash:          { cat: "rare", hooks:{ fanReactions:-10, momentum:{ winMultiplier:0.75 }, ttlWeeks:4 } },
  FanGroundswell:       { cat: "rare", hooks:{ fanReactions:+10, momentum:{ lossPenaltyMultiplier:0.7 }, ttlWeeks:4 } },
  InjuryReturnPop:      { cat: "rare", hooks:{ fanReactions:+10, morale:{ flat:+5 }, ttlWeeks:3 } },
  NoSellControversy:    { cat: "rare", hooks:{ respectFromPeers:-6, event:{ complaintWeight:+2 }, ttlWeeks:3 } },
  BotchNight:           { cat: "rare", hooks:{ trustBase:-3, fanReactions:-5, ttlWeeks:2 } },
  WorkrateBuzz:         { cat: "rare", hooks:{ respectFromPeers:+6, momentum:{ gainPct:+0.03 }, ttlWeeks:3 } },
  Sandbagger:           { cat: "rare", hooks:{ trustBase:-8, respectFromPeers:-8, ttlWeeks:4 } },
  ShootIncident:        { cat: "rare", hooks:{ respectFromPeers:-6, event:{ complaintWeight:+3 }, ttlWeeks:4 } },
  WalkoutRisk:          { cat: "rare", hooks:{ trustFromMgmt:-6, availability:{ noShowChance:+3 }, ttlWeeks:6 } },
};

/* =============================== HELPERS =============================== */

const byName = (state, name) => (state.roster || []).find(w => w && w.name === name);

export function getWorker(state, name) {
  const w = byName(state, name);
  if (!w) return null;

  w.traits = w.traits || { core: [], status: [], rare: [] };

  if (!Number.isFinite(Number(w.morale))) w.morale = 70;
  w.morale = clamp(Number(w.morale), 0, 100);

  return w;
}

function getOrCreateWorker(state, name) {
  state.roster = Array.isArray(state.roster) ? state.roster : [];
  let w = byName(state, name);
  if (!w) {
    w = { name, morale: 70, traits: { core: [], status: [], rare: [] } };
    state.roster.push(w);
  }
  w.traits = w.traits || { core: [], status: [], rare: [] };
  if (!Number.isFinite(Number(w.morale))) w.morale = 70;
  w.morale = clamp(Number(w.morale), 0, 100);
  return w;
}

function allTraits(worker){
  return [
    ...(worker?.traits?.core || []),
    ...(worker?.traits?.status || []),
    ...(worker?.traits?.rare || []),
  ];
}

/* =============================== PUBLIC API =============================== */

export function setTraits(state, name, traitsByCat) {
  const w = getOrCreateWorker(state, name);
  if (traitsByCat?.core)   w.traits.core   = [...new Set(traitsByCat.core)];
  if (traitsByCat?.status) w.traits.status = [...new Set(traitsByCat.status)];
  if (traitsByCat?.rare)   w.traits.rare   = [...new Set(traitsByCat.rare)];
  return w.traits;
}

// Pairwise trait-driven deltas to layer on top of relationship graph values
export function computeTraitPairDelta(aTraits, bTraits) {
  const allA = [...(aTraits?.core||[]), ...(aTraits?.status||[]), ...(aTraits?.rare||[])];
  const allB = [...(bTraits?.core||[]), ...(bTraits?.status||[]), ...(bTraits?.rare||[])];

  let respectDelta = 0;
  let trustDelta = 0;

  const hooks = (k)=>TRAIT_EFFECTS[k]?.hooks||{};

  for (const a of allA) {
    const h = hooks(a);
    if (h.respectVs) for (const b of allB) if (h.respectVs[b]!=null) respectDelta += h.respectVs[b];
    if (h.dislikeVs) for (const b of allB) if (h.dislikeVs[b]!=null) respectDelta += h.dislikeVs[b];
    if (h.trustBase) trustDelta += h.trustBase;
  }
  for (const b of allB) {
    const hb = hooks(b);
    if (hb.respectFrom) for (const a of allA) if (hb.respectFrom[a]!=null) respectDelta += hb.respectFrom[a];
  }
  if (allA.includes("Veteran")) {
    for (const r of (hooks("Veteran").respectRules||[])) if (allB.includes(r.ifOtherHas)) respectDelta += r.delta;
  }
  return { respectDelta, trustDelta };
}

/**
 * Morale hooks per booking/show tick.
 * Context:
 *  - jobbed (bool), jobLoss (number, usually negative)
 *  - mainEvented (bool)
 *  - offShow (bool)
 *  - longMatch (bool)
 *  - isTag (bool) and isSingles (bool) (optional)
 *  - weeklyDecay (number, usually negative, optional)
 *  - randomSwing (number, e.g. -5..+5, optional)
 */
export function applyMoraleHooks(worker, context = {}) {
  if (!worker) return 0;

  const all = allTraits(worker);
  let delta = 0;

  for (const t of all) {
    const h = TRAIT_EFFECTS[t]?.hooks || {};
    const m = h.morale || {};

    // Jobbing / loss sensitivity
    if (context.jobbed && m.jobbingLossMultiplier && context.jobLoss != null) {
      // Example: base jobLoss = -2; multiplier 0.5 means "half as bad"
      delta += context.jobLoss * (m.jobbingLossMultiplier - 1);
    }

    // Main event swings
    if (context.mainEvented && m.mainEventBonus)   delta += m.mainEventBonus;
    if (context.mainEvented && m.mainEventPenalty) delta += m.mainEventPenalty;

    // Off-show frustration
    if (context.offShow && m.offShowPenalty) delta += m.offShowPenalty;

    // Match shape penalties
    if (context.longMatch && m.longMatchPenalty) delta += m.longMatchPenalty;

    // Tag/singles specialty
    if (context.isTag && m.tagMatchBonus) delta += m.tagMatchBonus;
    if (context.isSingles && m.singlesLossPenalty && context.jobbed) delta += m.singlesLossPenalty;

    // Flat always-on tweaks
    if (m.flat) delta += m.flat;

    // Weekly decay scaling (for cold streak etc)
    if (m.decayMultiplier && context.weeklyDecay) {
      delta += context.weeklyDecay * (m.decayMultiplier - 1);
    }

    // Volatility: amplify random swing
    if (m.volatilityPct && context.randomSwing) {
      delta += Math.round(context.randomSwing * m.volatilityPct);
    }
  }

  worker.morale = clamp((worker.morale ?? 70) + delta, 0, 100);
  return delta;
}

// Momentum multiplier + optional flat bonus accumulation
export function momentumGainMultiplier(worker, context = {}) {
  const all = allTraits(worker);
  let mult = 1.0;

  for (const t of all) {
    const h = TRAIT_EFFECTS[t]?.hooks || {};
    const m = h.momentum || {};

    if (context.win && m.winMultiplier) mult *= m.winMultiplier;
    if (context.longMatch && m.longMatchGainPct) mult *= (1 + m.longMatchGainPct);
    if (m.gainPct) mult *= (1 + m.gainPct);

    if (context.highSpots && m.highSpotBonus) {
      context.momentumFlatBonus = (context.momentumFlatBonus || 0) + m.highSpotBonus;
    }

    if (context.loss && m.lossPenaltyMultiplier) mult *= m.lossPenaltyMultiplier;
    if (context.vsHigherStar && m.vsHigherStarpowerMultiplier) mult *= m.vsHigherStarpowerMultiplier;
    if (context.vsLowerStar && m.vsLowerStarpowerMultiplier) mult *= m.vsLowerStarpowerMultiplier;
  }

  return mult;
}
