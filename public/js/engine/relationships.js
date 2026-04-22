// public/js/engine/relationships.js
import { clamp } from '../util.js';
import { getW } from './helpers.js';
import { computeTraitPairDelta } from './traits.js';

/* ───────────────────────────── Feature flags ───────────────────────────── */

const ENABLE_LEGACY_EDGE_LIST = false; // kept only for old saves/migrations
const ALLOW_LEGACY_SEEDS      = false; // keep false in DB-first mode

// Transient decay toward 0 each week (deltas only)
const DELTA_DECAY_RAPPORT  = 1; // per week toward 0
const DELTA_DECAY_PRESSURE = 2; // per week toward 0

// Caps for transient deltas (they are modifiers, not canon)
const CAP_DRAPPORT  = 25;  // keep small on purpose
const CAP_DPRESSURE = 40;  // keep small on purpose

/* ───────────────────── Legacy edge-list (quarantined) ───────────────────── */

export const REL = {
  FRIEND:  "friend",
  TAG:     "tag",
  STABLE:  "stable",
  RIVAL:   "rival",
  ROMANCE: "romance",
  FAMILY:  "family",
  HEAT:    "heat",
};

const CAP = 100;

export function defaultRelationships(){
  if (!ENABLE_LEGACY_EDGE_LIST) return [];
  return [];
}

export function getRel(state, a, b, type = null){
  if (!ENABLE_LEGACY_EDGE_LIST) return null;
  if(!state.relationships) state.relationships = [];
  const [x,y] = [a,b].sort();
  const arr = state.relationships.filter(r => r.a===x && r.b===y);
  if(type) return arr.find(r => r.type===type) || null;
  return arr;
}

export function peekPair(state, a, b){
  const store = (state && state.relPairs && typeof state.relPairs === 'object') ? state.relPairs : null;
  if (!store) return null;
  const key = pairKey(a,b);
  const p = store[key];
  if (!p) return null;
  return (p instanceof PairRel) ? p : new PairRel(p);
}

export function getRelLevel(state, a, b){
  if (!ENABLE_LEGACY_EDGE_LIST) return 0;
  const rs = getRel(state,a,b) || [];
  return rs.reduce((sum,r)=> sum + (r.level||0), 0);
}

export function setRel(state, a, b, type, level, flags={}){
  if (!ENABLE_LEGACY_EDGE_LIST) return null;
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
  if (!ENABLE_LEGACY_EDGE_LIST) return 0;
  const e = getRel(state, a, b, type) || setRel(state, a, b, type, 0);
  if (!e) return 0;
  e.level = clamp((e.level||0) + delta, -CAP, CAP);
  return e.level;
}

// legacy only
export function relationshipChemBonus(state, a, b){
  if (!ENABLE_LEGACY_EDGE_LIST) return 0;
  const sum = (t,scale)=> (getRel(state,a,b,t)?.level || 0) * scale;
  const pos =
    sum(REL.ROMANCE,  0.04) +
    sum(REL.FRIEND,   0.03) +
    sum(REL.TAG,      0.04) +
    sum(REL.STABLE,   0.02) +
    sum(REL.RIVAL,    0.05);
  const neg = (getRel(state,a,b,REL.HEAT)?.level || 0) * -0.08;
  const fam = (getRel(state,a,b,REL.FAMILY)?.level || 0) * 0.01;
  return Math.round(pos + neg + fam);
}

/* ───────────────────── DB-first PairRel (deltas only) ───────────────────── */

export const REL_STATES = {
  Neutral: "Neutral",
  Liked: "Liked",
  CloseFriends: "CloseFriends",
  ProfessionalRivals: "ProfessionalRivals",
  TenseRivals: "TenseRivals",
  Dislike: "Dislike",
  Hatred: "Hatred",
};

// Minimal transient record (serialized in saves)
export class PairRel {
  constructor({
    w1,
    w2,

    // transient deltas (DO NOT store canon rapport/pressure here)
    dRapport = 0,   // -25..+25 (cap kept small on purpose)
    dPressure = 0,  // -40..+40 (cap kept small on purpose)

    history4w = { matches: 0, wl_diff: 0, main_events: 0, titles: 0 },
    romance = { lovers: false, married: false },
    last_contact_weeks = 0
  } = {}) {
    this.w1 = w1; this.w2 = w2;

    this.dRapport  = Number(dRapport || 0);
    this.dPressure = Number(dPressure || 0);

    this.history4w = { ...history4w };
    this.romance = { ...romance };
    this.last_contact_weeks = Number(last_contact_weeks || 0);

    this._dwellCounter = 0; // internal helper
  }
}

export function ensureRelPairs(s){
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    console.warn('ensureRelPairs called with non-state:', s);
    return {};
  }
  if (!s.relPairs || typeof s.relPairs !== 'object' || Array.isArray(s.relPairs)) {
    s.relPairs = {};
  }
  return s.relPairs;
}

export function pairKey(a,b){ return [String(a),String(b)].sort().join('::'); }

export function getPair(state, a, b, init = {}){
  const store = ensureRelPairs(state);
  const key = pairKey(a,b);

  if (!store[key]) {
    const [x,y] = [String(a),String(b)].sort();
    store[key] = new PairRel({ w1:x, w2:y, ...init });
  }

  // Rehydrate if loaded from JSON (plain object)
  const p = store[key];
  if (!(p instanceof PairRel)) store[key] = new PairRel(p);

  // Back-compat defaults (older saves)
  const out = store[key];
  if (typeof out.dRapport !== 'number') out.dRapport = 0;
  if (typeof out.dPressure !== 'number') out.dPressure = 0;
  if (typeof out.last_contact_weeks !== 'number') out.last_contact_weeks = 0;
  if (!out.history4w) out.history4w = { matches: 0, wl_diff: 0, main_events: 0, titles: 0 };
  if (!out.romance) out.romance = { lovers:false, married:false };

  return out;
}

// Guarded legacy seeding (should remain off)
export function seedAdd(w1, w2, relState, trust, simState) {
  if (!ALLOW_LEGACY_SEEDS) return null;
  if (!simState?.debug?.allowLegacySeeds) return null;

  // In DB-first, legacy "trust" becomes a one-time delta rapport
  const pair = getPair(simState, w1, w2);
  pair.dRapport = clamp(Number(pair.dRapport || 0) + clamp(Number(trust || 0), -10, +10), -CAP_DRAPPORT, +CAP_DRAPPORT);
  return pair;
}

/* ───────────────────────────── DB row resolver ───────────────────────────── */

function getDbRow(state, a, b){
  const key = pairKey(a,b);
  const src =
    (state && state.relDbPairs && state.relDbPairs[key]) ||
    (state && state.dbRelPairs && state.dbRelPairs[key]) ||
    (state && state.relDB && state.relDB[key]) ||
    null;

  if (!src || typeof src !== 'object') return null;
  return src;
}

function numOr(v, fallback=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pressureEff(p){
  const v = numOr(p, 0);
  // 0 in DB often means "unset" -> treat as neutral 50 for derived chemistry
  return (v === 0) ? 50 : clamp(v, 0, 100);
}

// ✅ Local roster accessor (prevents getW(undefined).find crash paths)
function rosterOf(state){
  return Array.isArray(state?.roster) ? state.roster : [];
}

// DB is the base. relPairs contributes only deltas.
export function resolvePairNumbers({ dbRow, livePair }){
  const baseRap = clamp(numOr(dbRow?.rapport, 0), -50, +50);
  const basePr  = clamp(numOr(dbRow?.pressure, 0), 0, 100);

  const dRap = clamp(numOr(livePair?.dRapport, 0), -CAP_DRAPPORT, +CAP_DRAPPORT);
  const dPr  = clamp(numOr(livePair?.dPressure, 0), -CAP_DPRESSURE, +CAP_DPRESSURE);

  const rapport = clamp(baseRap + dRap, -50, +50);
  const pressureRaw = clamp(basePr + dPr, 0, 100);

  return { rapport, pressureRaw };
}

// Trait overlay (presentation-only) — NEVER mutates stored pair
function traitOverlayDelta(state, aName, bName){
  try{
    const roster = rosterOf(state);
    const a = getW(roster, aName);
    const b = getW(roster, bName);
    if (!a || !b) return { trustDelta:0, respectDelta:0, rapportDelta:0 };

    const aT = a?.traits || { core:[], status:[], rare:[] };
    const bT = b?.traits || { core:[], status:[], rare:[] };
    const d = computeTraitPairDelta(aT, bT) || {};
    const trustDelta = numOr(d.trustDelta, 0);
    const respectDelta = numOr(d.respectDelta, 0);
    const rapportDelta = trustDelta + respectDelta;
    return { trustDelta, respectDelta, rapportDelta };
  } catch {
    return { trustDelta:0, respectDelta:0, rapportDelta:0 };
  }
}

/* ───────────────────────── Derived “state” label (optional) ───────────────────────── */

export function deriveRelStateFromNumbers(rapport, pressure){
  const rap = numOr(rapport, 0);
  const p   = pressureEff(pressure); // 0 => 50 neutral

  const presHigh = p >= 70;
  const presMed  = p >= 60;

  if (rap <= -35) return REL_STATES.Hatred;
  if (rap <= -18) return presHigh ? REL_STATES.Hatred : REL_STATES.TenseRivals;
  if (rap <= -8)  return presHigh ? REL_STATES.TenseRivals : REL_STATES.Dislike;

  if (rap >= 35) return REL_STATES.CloseFriends;
  if (rap >= 22) return REL_STATES.CloseFriends;
  if (rap >= 10) return presHigh ? REL_STATES.ProfessionalRivals : REL_STATES.Liked;

  if (presHigh) return REL_STATES.ProfessionalRivals;
  if (presMed)  return REL_STATES.ProfessionalRivals;

  return REL_STATES.Neutral;
}

/* ───────────────────── Profile view adapter (collector) ───────────────────── */

export function collectPairsFor(state, name) {
  const rows = [];

  // 1) DB map source if present
  const dbStore = (state && (state.relDbPairs || state.dbRelPairs || state.relDB)) || null;
  if (dbStore && typeof dbStore === 'object') {
    for (const k of Object.keys(dbStore)) {
      const r = dbStore[k];
      if (!r || typeof r !== 'object') continue;

      const w1 = String(r.w1 ?? r.a ?? (k.split('::')[0] || ''));
      const w2 = String(r.w2 ?? r.b ?? (k.split('::')[1] || ''));
      if (!w1 || !w2) continue;

      if (w1 !== name && w2 !== name) continue;
      const other = (w1 === name) ? w2 : w1;

      const live = peekPair(state, w1, w2);
      const traitDelta = traitOverlayDelta(state, w1, w2);
      const effectiveBase = resolvePairNumbers({ dbRow: r, livePair: live });

      const rapportWithTraits = clamp(effectiveBase.rapport + numOr(traitDelta.rapportDelta, 0), -50, +50);
      const derivedState = deriveRelStateFromNumbers(rapportWithTraits, effectiveBase.pressureRaw);

      rows.push({
        other,
        pair: {
          db: {
            rapport: numOr(r.rapport, 0),
            pressure: numOr(r.pressure, 0),
            flags: Array.isArray(r.flags) ? r.flags.slice() : [],
          },
          live: live ? {
            dRapport: numOr(live?.dRapport, 0),
            dPressure: numOr(live?.dPressure, 0),
            // ✅ FIX: live can be null; never deref live.last_contact_weeks without optional chaining
            last_contact_weeks: numOr(live?.last_contact_weeks, 0),
            history4w: { ...((live?.history4w) || {}) },
            romance: { ...((live?.romance) || {}) },
          } : {
            dRapport: 0,
            dPressure: 0,
            last_contact_weeks: 0,
            history4w: { matches: 0, wl_diff: 0, main_events: 0, titles: 0 },
            romance: { lovers: false, married: false },
          },
          traitDelta,
          effective: {
            rapport: rapportWithTraits,
            pressureRaw: effectiveBase.pressureRaw
          },
          derivedState
        }
      });
    }
  }

  // 2) Include live-only pairs too
  const store = (state && state.relPairs && typeof state.relPairs === 'object') ? state.relPairs : {};
  for (const k of Object.keys(store)) {
    const raw = store[k];
    if (!raw || typeof raw !== 'object') continue;
    const p = raw instanceof PairRel ? raw : new PairRel(raw);

    if (p.w1 !== name && p.w2 !== name) continue;

    const other = String(p.w1 === name ? p.w2 : p.w1);

    // Don’t duplicate if already present from DB
    if (rows.some(r => r.other === other)) continue;

    const traitDelta = traitOverlayDelta(state, p.w1, p.w2);

    rows.push({
      other,
      pair: {
        db: null,
        live: {
          dRapport: numOr(p.dRapport, 0),
          dPressure: numOr(p.dPressure, 0),
          last_contact_weeks: numOr(p.last_contact_weeks, 0),
          history4w: { ...(p.history4w || {}) },
          romance: { ...(p.romance || {}) },
        },
        traitDelta,
        effective: {
          rapport: clamp(numOr(p.dRapport, 0) + numOr(traitDelta.rapportDelta, 0), -50, +50),
          pressureRaw: clamp(numOr(p.dPressure, 0), 0, 100)
        },
        derivedState: deriveRelStateFromNumbers(
          numOr(p.dRapport, 0) + numOr(traitDelta.rapportDelta, 0),
          numOr(p.dPressure, 0)
        )
      }
    });
  }

  // 3) Sort by “interesting”
  rows.sort((A, B) => {
    const s = (x) => {
      const effRap = Math.abs(numOr(x.pair?.effective?.rapport, 0));
      const effPr  = Math.abs(pressureEff(numOr(x.pair?.effective?.pressureRaw, 0)) - 50);
      const flags  = Array.isArray(x.pair?.db?.flags) ? x.pair.db.flags.length : 0;
      const deltaMag = Math.abs(numOr(x.pair?.live?.dRapport,0)) + Math.abs(numOr(x.pair?.live?.dPressure,0));
      const stateBoost = (x.pair?.derivedState && x.pair.derivedState !== REL_STATES.Neutral) ? 50 : 0;
      return stateBoost + effRap + effPr + (flags * 6) + deltaMag;
    };
    return s(B) - s(A);
  });

  return rows;
}

// “view” for a specific pair
// “view” for a specific pair (NO-CREATE READ)
export function getPairView(state, a, b){
  const dbRow = getDbRow(state, a, b);

  // ✅ do not create a live pair on read
  const live = peekPair(state, a, b);

  const traitDelta = traitOverlayDelta(state, a, b);

  const eff = resolvePairNumbers({ dbRow, livePair: live });
  const rapportWithTraits = clamp(eff.rapport + numOr(traitDelta.rapportDelta, 0), -50, +50);

  return {
    db: dbRow ? {
      rapport: numOr(dbRow.rapport, 0),
      pressure: numOr(dbRow.pressure, 0),
      flags: Array.isArray(dbRow.flags) ? dbRow.flags.slice() : [],
    } : null,
    live: live ? {
      dRapport: numOr(live.dRapport, 0),
      dPressure: numOr(live.dPressure, 0),
      last_contact_weeks: numOr(live.last_contact_weeks, 0),
      history4w: { ...(live.history4w || {}) },
      romance: { ...(live.romance || {}) },
    } : null,
    traitDelta,
    effective: {
      rapport: rapportWithTraits,
      pressureRaw: eff.pressureRaw
    },
    derivedState: deriveRelStateFromNumbers(rapportWithTraits, eff.pressureRaw)
  };
}

/* ───────────────────────────── Weekly decay ───────────────────────────── */

export function decayRelationships(state){
  // Legacy decay (optional)
  if (ENABLE_LEGACY_EDGE_LIST && Array.isArray(state.relationships)) {
    const DECAY = 2;
    state.relationships.forEach(e=>{
      if (!e) return;
      const lvl = Number(e.level||0);
      if (lvl > 0) e.level = Math.max(0, lvl - DECAY);
      if (lvl < 0) e.level = Math.min(0, lvl + DECAY);
    });
  }

  // Transient delta decay
  if (!state || typeof state !== 'object') return;
  const store = ensureRelPairs(state);

  for (const k of Object.keys(store)) {
    const raw = store[k];
    if (!raw || typeof raw !== 'object') continue;
    const p = raw instanceof PairRel ? raw : (store[k] = new PairRel(raw));

    // decay deltas toward 0
    const dr = numOr(p.dRapport, 0);
    if (dr > 0) p.dRapport = Math.max(0, dr - DELTA_DECAY_RAPPORT);
    if (dr < 0) p.dRapport = Math.min(0, dr + DELTA_DECAY_RAPPORT);

    const dp = numOr(p.dPressure, 0);
    if (dp > 0) p.dPressure = Math.max(0, dp - DELTA_DECAY_PRESSURE);
    if (dp < 0) p.dPressure = Math.min(0, dp + DELTA_DECAY_PRESSURE);

    // last contact drifts up unless reset by match hooks
    p.last_contact_weeks = numOr(p.last_contact_weeks, 0) + 1;

    // prune boring empty pairs to keep saves tidy
    const empty =
      numOr(p.dRapport,0) === 0 &&
      numOr(p.dPressure,0) === 0 &&
      numOr(p.last_contact_weeks,0) >= 8 &&
      !(p.romance?.lovers || p.romance?.married);

    if (empty) delete store[k];
  }
}

/**
 * ✅ Export expected by state_mgmt.js
 * In DB-first mode this is just the weekly delta decay sweep.
 */

/* ───────────────────── Mutators (deltas only) ───────────────────── */

function capDeltaRapport(x){ return clamp(Math.round(numOr(x, 0)), -CAP_DRAPPORT, +CAP_DRAPPORT); }
function capDeltaPressure(x){ return clamp(Math.round(numOr(x, 0)), -CAP_DPRESSURE, +CAP_DPRESSURE); }

export function bumpPairDeltas(state, a, b, { dRapport=0, dPressure=0, contacted=false } = {}){
  if (!state || !a || !b) return null;
  const A = (a.name || a);
  const B = (b.name || b);

  const pair = getPair(state, A, B);

  pair.dRapport = capDeltaRapport(numOr(pair.dRapport, 0) + numOr(dRapport, 0));
  pair.dPressure = capDeltaPressure(numOr(pair.dPressure, 0) + numOr(dPressure, 0));

  if (contacted) pair.last_contact_weeks = 0;

  return pair;
}

/* ───────────────────── Match hooks (deltas only) ───────────────────── */

export function onSinglesFaceOff(state, A, B, hot=false, titleChanged=false){
  if (!state || !A || !B) return null;

  const a = A.name || A;
  const b = B.name || B;

  const dRapport = hot ? +2 : +1;
  const dPressure = titleChanged ? +6 : +3;

  return bumpPairDeltas(state, a, b, { dRapport, dPressure, contacted:true });
}

export function onDangerSpot(state, causer, victim, severity = 1){
  if (!state || !causer || !victim) return null;

  const a = causer.name || causer;
  const b = victim.name || victim;

  const sev = clamp(Number(severity || 1), 1, 5);

  const dRapport  = -2 * sev;
  const dPressure = +3 * sev;

  return bumpPairDeltas(state, a, b, { dRapport, dPressure, contacted:true });
}

export function onTagTeammatesResult(state, A, B, won=false, hot=false){
  if (!state || !A || !B) return null;

  const a = A.name || A;
  const b = B.name || B;

  const dRapport = (won ? 3 : 1) + (hot ? 1 : 0);
  const dPressure = hot ? +1 : 0;

  return bumpPairDeltas(state, a, b, { dRapport, dPressure, contacted:true });
}

/* ───────────────────── Ratings integration (derived) ───────────────────── */

function countOverlap(a=[], b=[]){
  const setB = new Set(b || []);
  let n = 0;
  for (const x of (a || [])) if (setB.has(x)) n++;
  return n;
}

function dynamicChemFromContext({ rapport, pressure, selfStyleTags=[], otherStyleTags=[], traitDelta=null, alignmentA=null, alignmentB=null }){
  const rap = clamp(numOr(rapport, 0), -50, 50);
  const p = pressureEff(pressure);

  let score = 0;

  score += rap * 1.6;

  const shared = countOverlap(selfStyleTags, otherStyleTags);
  score += clamp(shared, 0, 3) * 8;

  if (traitDelta) score += numOr(traitDelta.rapportDelta, 0) * 1.0;

  const pres = (p - 50) / 50;
  const hasSignal = (rap !== 0) || (p !== 50) || shared > 0 || !!traitDelta;
  if (hasSignal) score += pres * (rap < 0 ? -28 : +18);

  if (alignmentA && alignmentB && alignmentA !== alignmentB) score += 2;

  return clamp(Math.round(score), -100, 100);
}

export function relMatchRatingDelta(state, a, b){
  const A = (a?.name || a);
  const B = (b?.name || b);

  const live = getPair(state, A, B);
  const dbRow = getDbRow(state, A, B);

  const traitDelta = traitOverlayDelta(state, A, B);
  const { rapport, pressureRaw } = resolvePairNumbers({ dbRow, livePair: live });

  const rapportDisplay = clamp(rapport + numOr(traitDelta.rapportDelta, 0), -50, +50);

  // ✅ Always look up from a real roster array to avoid undefined.find crashes
  const roster = rosterOf(state);
  const wa = getW(roster, A);
  const wb = getW(roster, B);

  // If either wrestler can’t be resolved, relationships can’t contribute.
  if (!wa || !wb) return 0;

  const dynChem = dynamicChemFromContext({
    rapport: rapportDisplay,
    pressure: pressureRaw,
    selfStyleTags: wa?.styleTags || [],
    otherStyleTags: wb?.styleTags || [],
    traitDelta,
    alignmentA: wa?.alignment,
    alignmentB: wb?.alignment
  });

  const rapTerm  = clamp(Math.round(rapportDisplay / 12), -4, +4);
  const chemTerm = clamp(Math.round(dynChem / 25), -4, +4);
  const presTerm = clamp(Math.round((pressureEff(pressureRaw) - 50) / 25), -2, +2);

  return Math.round(rapTerm + chemTerm - (rapportDisplay < 0 ? presTerm : 0));
}

export function refusalRisk(pairViewOrPair, professionalismAvg){
  const derivedState =
    pairViewOrPair?.derivedState ||
    deriveRelStateFromNumbers(
      pairViewOrPair?.effective?.rapport ?? pairViewOrPair?.rapport ?? 0,
      pairViewOrPair?.effective?.pressureRaw ?? pairViewOrPair?.pressureRaw ?? 0
    );

  let risk = 0;
  if (derivedState === REL_STATES.TenseRivals) risk += 6;
  if (derivedState === REL_STATES.Hatred)      risk += 15;
  risk -= (Number(professionalismAvg || 0) / 20);
  return Math.max(0, risk);
}

/* ───────────────────── OPTIONAL: pressure-from-stats helpers ───────────────────── */

const _avg = (a,b)=> (Number(a||0)+Number(b||0))/2;
const _norm01 = (x, lo, hi) => clamp((Number(x||0)-lo) / Math.max(1, (hi-lo)), 0, 1);

export function powerScore01(state, name){
  const roster = rosterOf(state);
  const w = getW(roster, name);
  if (!w) return 0;
  const sp = Number(w.starpower ?? 60);
  const mo = Number(w.momentum  ?? 60);

  const spN = _norm01(sp, 40, 95);
  const moN = _norm01(mo, 40, 95);

  return clamp(spN * 0.65 + moN * 0.35, 0, 1);
}

export function calcPressureFromPower({ aScore01, bScore01, sameTitleScene=false, bothChampLevel=false }){
  const dist = Math.abs(aScore01 - bScore01);
  const similarity = 1 - dist;
  const baseline = 100 * _avg(aScore01, bScore01) * similarity;

  let bonus = 0;
  if (sameTitleScene)  bonus += 15;
  if (bothChampLevel)  bonus += 10;

  return clamp(Math.round(baseline + bonus), 0, 100);
}

export function derivePressureFromStats(state, A, B){
  const roster = rosterOf(state);

  const a01 = powerScore01(state, A);
  const b01 = powerScore01(state, B);

  const brand = getW(roster, A)?.brand || getW(roster, B)?.brand;
  const genderA = getW(roster, A)?.gender;

  const top = roster
    .filter(w => w.brand === brand && w.gender === genderA)
    .map(w => ({ n:w.name, s: powerScore01(state, w.name) }))
    .sort((x,y)=>y.s - x.s)
    .slice(0,3)
    .map(x=>x.n);

  const bothTop3 = top.includes(A) && top.includes(B);

  const champs = (state.champs?.[brand]) || {};
  const worldHolder = champs.World;
  const inSameScene =
    (Array.isArray(worldHolder) ? worldHolder.includes(A)||worldHolder.includes(B)
                                : (worldHolder===A||worldHolder===B));

  return calcPressureFromPower({
    aScore01:a01, bScore01:b01,
    sameTitleScene: !!inSameScene,
    bothChampLevel: bothTop3
  });
}

export function pruneRelPairs(state, { maxKeep = 900 } = {}){
  if (!state || typeof state !== 'object') return 0;
  const store = ensureRelPairs(state);

  const keys = Object.keys(store);
  if (keys.length <= maxKeep) return 0;

  // Score: keep “interesting” ones
  const scored = keys.map(k => {
    const p = store[k];
    const dr = numOr(p?.dRapport, 0);
    const dp = numOr(p?.dPressure, 0);
    const lc = numOr(p?.last_contact_weeks, 0);
    const romance = (p?.romance?.lovers || p?.romance?.married) ? 1 : 0;
    const mag = Math.abs(dr) + Math.abs(dp) + romance * 50 - lc * 0.25;
    return { k, mag };
  }).sort((a,b)=> b.mag - a.mag);

  const keep = new Set(scored.slice(0, maxKeep).map(x=>x.k));

  let removed = 0;
  for (const k of keys){
    if (!keep.has(k)) { delete store[k]; removed++; }
  }
  return removed;
}

/* ───────────────────── Compatibility exports (old callers) ─────────────────────
   Some older modules still import these.
   In DB-first mode, weeklyPressureSweep is effectively "decay transient deltas".
   transitionState becomes a helper that nudges deltas toward a target derived state.
------------------------------------------------------------------------------- */

export function weeklyPressureSweep(state){
  // In DB-first: do NOT rewrite DB pressure.
  // We only decay transient deltas + age contact counters.
  return decayRelationships(state);
}

// Map a target derived “state” to a rough desired (rapport, pressure) anchor.
// These are *targets* for the effective numbers; we implement it by nudging deltas.
function _targetNumsForState(target){
  switch (target) {
    case REL_STATES.Hatred:             return { rapport: -40, pressure: 80 };
    case REL_STATES.TenseRivals:        return { rapport: -22, pressure: 70 };
    case REL_STATES.Dislike:            return { rapport: -12, pressure: 60 };
    case REL_STATES.ProfessionalRivals: return { rapport: 0,   pressure: 70 };
    case REL_STATES.CloseFriends:       return { rapport: 30,  pressure: 50 };
    case REL_STATES.Liked:              return { rapport: 12,  pressure: 50 };
    case REL_STATES.Neutral:
    default:                            return { rapport: 0,   pressure: 50 };
  }
}

/**
 * transitionState(state, aName, bName, targetState, opts?)
 * Nudges transient deltas so the *effective* numbers drift toward the target.
 * Does NOT overwrite DB values.
 */
export function transitionState(state, aName, bName, targetState, { strength = 0.35 } = {}){
  if (!state || !aName || !bName) return null;

  const A = String(aName);
  const B = String(bName);

  const live = getPair(state, A, B);
  const dbRow = getDbRow(state, A, B); // may be null if you haven't hydrated a DB map

  const eff = resolvePairNumbers({ dbRow, livePair: live });
  const target = _targetNumsForState(targetState);

  // How far away are we?
  const dRapWanted = clamp(Math.round((target.rapport - eff.rapport) * strength), -8, +8);
  const dPrWanted  = clamp(Math.round((target.pressure - eff.pressureRaw) * strength), -10, +10);

  return bumpPairDeltas(state, A, B, { dRapport: dRapWanted, dPressure: dPrWanted, contacted: true });
}

export function applyCalculatedPressureDelta(state, A, B, { strength=0.15 } = {}){
  if (!state || !A || !B) return null;
  const a = A.name || A;
  const b = B.name || B;

  const fresh = derivePressureFromStats(state, a, b); // 0..100

  const db = getDbRow(state, a, b);
  const base = numOr(db?.pressure, 0);
  if (base === 0) {
    const target = fresh;
    const desiredDelta = clamp(Math.round((target - 50) * strength), -CAP_DPRESSURE, +CAP_DPRESSURE);
    return bumpPairDeltas(state, a, b, { dPressure: desiredDelta, contacted:false });
  }

  return getPair(state, a, b);
}

// Debug hooks (safe)
if (typeof window !== 'undefined') {
  window.__rel = window.__rel || {};
  window.__rel.getPairView = getPairView;
  window.__rel.relMatchRatingDelta = relMatchRatingDelta;
  window.__rel.pairKey = pairKey;
}

// ── Chemistry (merged from chemistry.js) ────────────────────────────
// Separate key format (__ not ::) preserves existing localStorage data.
//
// Cap raised to ±25 so long programs can deepen meaningfully.
// Decay is "sticky": chemistry in the ±1..±8 band doesn't decay
// (earned chemistry persists). Only extremes decay back toward the band.
const chemKey = (a, b) => {
  const [x, y] = [String(a), String(b)].sort((m, n) => m.localeCompare(n));
  return `${x}__${y}`;
};
export function getChem(state, a, b) {
  return (state.chemistry ?? {})[chemKey(a, b)] ?? 0;
}
export function bumpChem(state, a, b, amt) {
  state.chemistry ||= {};
  const k = chemKey(a, b);
  state.chemistry[k] = clamp((state.chemistry[k] ?? 0) + amt, -25, 25);
}
export function decayAllChemistry(state) {
  if (!state.chemistry) return;
  for (const k in state.chemistry) {
    const v = state.chemistry[k];
    if (v === 0) { delete state.chemistry[k]; continue; }
    // Sticky zone: |chem| <= 8 doesn't decay — earned trust persists.
    // Above 8: nudge down by 1 each week so runaway ceiling can't stack forever.
    const abs = Math.abs(v);
    if (abs <= 8) continue;
    state.chemistry[k] = v > 0 ? v - 1 : v + 1;
  }
}
