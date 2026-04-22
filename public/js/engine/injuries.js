// public/js/engine/injuries.js
// Injury system (FM-style): rare baseline, fatigue-driven risk, severity/weeks,
// morale hit (amplified by negative traits), and relationship resentment spillover.
// No title logic. No long-term story logic. Just: resentment + morale + availability.
//
// Expected existing helpers/modules:
// - clamp, r (random int/float helper) from ../util.js
// - getW from ./helpers.js
// - getPair from ./relationships.js
// - applyAttrDelta from ./attr_ledger.js
// - pushInbox from ./inbox.js (optional; you can pass a custom notify fn)
//
// This file is safe to import in Node (no DOM usage).

import { clamp, r } from '../util.js';
import { getW } from './helpers.js';
import { getPair, onDangerSpot } from './relationships.js';
import { applyAttrDelta } from './attr_ledger.js';

/* ---------------------------------------------------------------------- */
/* Config                                                                  */
/* ---------------------------------------------------------------------- */

export const INJURY_CFG = {
  // Overall match-level baseline. With default ramps, injuries remain "rare but real".
  basePct: 0.008,           // 0.8%

  // Fatigue curve: starts meaningfully at ~35 fatigue; ramps hard near 100.
  fatigue: {
    start: 35,
    maxAddPct: 0.10,        // up to +10% from fatigue alone
    exponent: 2.0           // quadratic ramp
  },

  // Durability: lower durability increases risk.
  durability: {
    pivot: 70,              // below this increases risk
    factor: 0.0010          // (pivot - dur) * factor (e.g. dur 40 => +3%)
  },

  // Opponent ring safety: unsafe opponents increase your risk.
  // We take the *worst* unsafe value among opponents.
  ringSafety: {
    pivot: 70,
    factor: 0.0009          // (pivot - safety) * factor
  },

  // Match context bumps
  context: {
    longMatchAddPct: 0.015, // +1.5%
    dirtyAddPct: 0.008      // +0.8%
  },

  // Hard cap to prevent nonsense.
  hardCapPct: 0.18,

  // Weeks from severity bands
  weeks: {
    band1: { maxSev: 30, min: 1,  max: 2  },
    band2: { maxSev: 55, min: 2,  max: 5  },
    band3: { maxSev: 75, min: 5,  max: 10 },
    band4: { maxSev: 100, min: 10, max: 20 }
  },

  // Morale impact
  morale: {
    // base morale hit derived from weeks:
    // hit = -(2 + ceil(weeks*1.2)) capped to 18
    maxHit: 18,

    // trait multiplier clamp
    minMult: 1.0,
    maxMult: 1.8,

    // extra bump if current morale is already low
    lowMoraleThreshold: 45,
    lowMoraleAdd: 0.15
  },

  // Relationship fallout
  relations: {
    // victim -> injurer trust hit based on weeks:
    // hit = clamp(-(10 + weeks*2), -35, -12)
    minHit: -35,
    maxHit: -12,

    // friend spillover
    friendTrustThreshold: 40, // "friend" if trust >= this
    spillChanceBase: 0.15,
    spillChancePerWeek: 0.03,
    spillChanceMax: 0.55,

    // spill hit is 25% of victim hit, clamped
    spillFrac: 0.25,
    spillMin: -10,
    spillMax: -3
  },

  // Labels used in inbox + refs
  labels: {
    minor: ['Sprain', 'Bruised ribs', 'Stinger', 'Knee tweak', 'Minor cut'],
    moderate: ['Concussion', 'Shoulder strain', 'Torn muscle', 'Bad ankle sprain', 'Back strain'],
    major: ['ACL tear', 'Broken arm', 'Fractured ribs', 'Severe concussion', 'Dislocated shoulder']
  }
};

/* ---------------------------------------------------------------------- */
/* Public API                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Rolls whether `victimName` gets injured in a match context, and if so applies:
 * - injuryWeeks (availability)
 * - morale hit (ledger-backed)
 * - resentment relationships (victim + possible friends)
 * - optional inbox notify via `notify` callback
 *
 * Returns an injury event object if injury happens, else null.
 *
 * @param {object} state
 * @param {string} victimName
 * @param {object} ctx
 * @param {string} ctx.brand
 * @param {string} [ctx.matchId]
 * @param {string} [ctx.seg]
 * @param {string} [ctx.finish]  // 'clean' | 'dirty' | 'nocontest' etc
 * @param {boolean} [ctx.longMatch]
 * @param {string[]} [ctx.opponents] // names of opponent(s)
 * @param {string} [ctx.injurerName] // if you already know who caused it; else inferred
 * @param {function} [notify] // (state, brand, messageObj) => void
 */
export function rollAndApplyMatchInjury(state, victimName, ctx = {}, notify = null) {
  const w = getW(state, victimName);
  if (!state || !w) return null;

  // Already injured? don’t chain new injuries on top for now.
  if ((w.injuryWeeks | 0) > 0) return null;

  const event = rollMatchInjury(state, victimName, ctx);
  if (!event) return null;

  applyInjuryEvent(state, event, ctx, notify);
  return event;
}

/**
 * Roll only: returns an event object if injury triggers, else null.
 * No mutation.
 */
export function rollMatchInjury(state, victimName, ctx = {}) {
  const w = getW(state, victimName);
  if (!state || !w) return null;

  const opponents = Array.isArray(ctx.opponents) ? ctx.opponents.filter(Boolean) : [];
  const oppObjs = opponents.map(n => getW(state, n)).filter(Boolean);

  const fatigue = Number(w.fatigue ?? 0);
  const durability = Number(w.durability ?? 70);

  const fatiguePressure = computeFatiguePressure(fatigue, INJURY_CFG.fatigue.start);
  const fatigueRisk = INJURY_CFG.fatigue.maxAddPct * Math.pow(fatiguePressure, INJURY_CFG.fatigue.exponent);

  const durRisk = Math.max(0, (INJURY_CFG.durability.pivot - durability)) * INJURY_CFG.durability.factor;

  const oppUnsafe = worstUnsafeOpponent(oppObjs);
  const oppUnsafeRisk = oppUnsafe * INJURY_CFG.ringSafety.factor;

  const longMatchAdd = ctx.longMatch ? INJURY_CFG.context.longMatchAddPct : 0;
  const dirtyAdd = (String(ctx.finish || '').toLowerCase() === 'dirty') ? INJURY_CFG.context.dirtyAddPct : 0;

  const p = clamp(
    INJURY_CFG.basePct + fatigueRisk + durRisk + oppUnsafeRisk + longMatchAdd + dirtyAdd,
    0,
    INJURY_CFG.hardCapPct
  );

  if (Math.random() >= p) return null;

  const sev = computeSeverity({
    fatiguePressure,
    durability
  });

  const weeks = severityToWeeks(sev);
  const injKey = pickInjuryLabel(sev);

  // injurer: if provided, use it; else choose a random opponent (or null)
  const injurerName = ctx.injurerName
    ? String(ctx.injurerName)
    : (opponents.length ? opponents[Math.floor(Math.random() * opponents.length)] : null);

  return {
    kind: 'injury',
    victim: w.name,
    injurer: injurerName,
    weeks,
    severity: sev,
    injury: injKey,
    probability: p,
    factors: {
      fatigue,
      durability,
      oppUnsafe,
      longMatch: !!ctx.longMatch,
      dirty: (String(ctx.finish || '').toLowerCase() === 'dirty')
    }
  };
}

/**
 * Apply an already-generated injury event.
 * Mutates state.
 */
export function applyInjuryEvent(state, event, ctx = {}, notify = null) {
  if (!state || !event || event.kind !== 'injury') return null;

  const victim = getW(state, event.victim);
  if (!victim) return null;

  const brand = ctx.brand || victim.brand || 'RAW';
  const week = Number(state.week || 1);

  // Availability
  victim.injuryWeeks = Math.max(victim.injuryWeeks || 0, Number(event.weeks || 1));

  // Morale hit (ledger-backed)
  const baseHit = -Math.min(
    INJURY_CFG.morale.maxHit,
    2 + Math.ceil((Number(event.weeks || 1) * 1.2))
  );

  const mult = injuryMoraleMultiplier(victim);
  const moraleHit = Math.round(baseHit * mult);

  const ref = {
    brand,
    week,
    evt: 'injury',
    matchId: ctx.matchId || null,
    seg: ctx.seg || null,
    victim: victim.name,
    injurer: event.injurer || null,
    injury: event.injury,
    weeks: event.weeks,
    severity: event.severity
  };

  applyAttrDelta(
    state,
    week,
    victim,
    'morale',
    moraleHit,
    `Injured (${event.injury}, ${event.weeks}w)`,
    ref
  );

  // Relationship fallout (resentment only)
  if (event.injurer) {
    applyInjuryResentment(state, victim.name, event.injurer, event.weeks, ref);
  }

  // Optional inbox notification (only if you pass notify; avoids importing DOM stuff here)
  if (typeof notify === 'function') {
    notify(state, brand, buildInjuryInboxMessage(state, brand, event, moraleHit));
  }

  return event;
}

/**
 * Weekly tick: decrement injuryWeeks; optionally notify on return.
 * Returns array of names who returned this week.
 *
 * @param {object} state
 * @param {string} [brand] // if provided, only ticks that brand roster (optional)
 * @param {function} [notify] // (state, brand, msgObj) => void
 */
export function tickInjuriesWeekly(state, brand = null, notify = null) {
  if (!state) return [];
  const week = Number(state.week || 1);

  const roster = Array.isArray(state.roster) ? state.roster.filter(Boolean) : [];
  const affected = brand ? roster.filter(w => (w.brand || '') === brand) : roster;

  const returned = [];

  for (const w of affected) {
    const iw = Number(w.injuryWeeks || 0);
    if (iw <= 0) continue;

    w.injuryWeeks = Math.max(0, iw - 1);

    if (iw > 0 && w.injuryWeeks === 0) {
      returned.push(w.name);

      if (typeof notify === 'function') {
        const b = brand || w.brand || 'RAW';
        notify(state, b, {
          from: 'Medical',
          title: 'Cleared to Return',
          body: `${w.name} is cleared to compete again.`,
          names: [w.name],
          atWeek: week
        });
      }
    }
  }

  return returned;
}

/* ---------------------------------------------------------------------- */
/* Internals                                                               */
/* ---------------------------------------------------------------------- */

function computeFatiguePressure(fatigue, start) {
  const f = clamp(Number(fatigue || 0), 0, 100);
  if (f <= start) return 0;
  return clamp((f - start) / (100 - start), 0, 1);
}

function worstUnsafeOpponent(oppObjs) {
  if (!oppObjs || !oppObjs.length) return 0;
  // unsafe = max(0, pivot - ringSafety)
  const pivot = INJURY_CFG.ringSafety.pivot;
  let worst = 0;
  for (const o of oppObjs) {
    const rs = Number(o.ringSafety ?? 70);
    const unsafe = Math.max(0, pivot - rs);
    if (unsafe > worst) worst = unsafe;
  }
  return worst;
}

function computeSeverity({ fatiguePressure, durability }) {
  // severity 10..95
  const dur = Number(durability ?? 70);
  const base = 20 + Math.round(r(0, 50));
  const fat = Math.round(fatiguePressure * 25);
  const durAdd = Math.round(Math.max(0, (70 - dur)) * 0.4);
  return clamp(base + fat + durAdd, 10, 95);
}

function severityToWeeks(sev) {
  const s = Number(sev || 10);

  const { band1, band2, band3, band4 } = INJURY_CFG.weeks;
  if (s < band1.maxSev) return randInt(band1.min, band1.max);
  if (s < band2.maxSev) return randInt(band2.min, band2.max);
  if (s < band3.maxSev) return randInt(band3.min, band3.max);
  return randInt(band4.min, band4.max);
}

function pickInjuryLabel(sev) {
  const s = Number(sev || 10);
  if (s < 35) return pick(INJURY_CFG.labels.minor);
  if (s < 70) return pick(INJURY_CFG.labels.moderate);
  return pick(INJURY_CFG.labels.major);
}

function pick(arr) {
  if (!Array.isArray(arr) || !arr.length) return 'Injury';
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(a, b) {
  const A = Math.floor(Number(a));
  const B = Math.floor(Number(b));
  const lo = Math.min(A, B);
  const hi = Math.max(A, B);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Morale multiplier based on negative traits.
 * You can adapt this to your real trait schema without changing callers.
 */
export function injuryMoraleMultiplier(w) {
  const t = w?.traits || {};
  const traits = [
    ...(Array.isArray(t.core) ? t.core : []),
    ...(Array.isArray(t.status) ? t.status : []),
    ...(Array.isArray(t.rare) ? t.rare : []),
  ];

  let mult = 1.0;

  // Map to YOUR trait keys
  if (traits.includes('BatteredBody')) mult += 0.35;          // bigger injury morale hit
  if (traits.includes('Hothead'))      mult += 0.15;
  if (traits.includes('ProblemCase'))  mult += 0.20;
  if (traits.includes('HeatMagnet'))   mult += 0.15;
  if (traits.includes('Diva'))         mult += 0.15;

  const m = Number(w?.morale ?? 65);
  if (m < INJURY_CFG.morale.lowMoraleThreshold) mult += INJURY_CFG.morale.lowMoraleAdd;

  return clamp(mult, INJURY_CFG.morale.minMult, INJURY_CFG.morale.maxMult);
}

/**
 * Resentment model:
 * - victim dislikes injurer (trust hit)
 * - victim’s friends may also dislike injurer (smaller hit, probabilistic)
 *
 * Friend detection:
 * - Uses relationships trust threshold: trust >= friendTrustThreshold means “friend”
 */
export function applyInjuryResentment(state, victimName, injurerName, weeks, ref = null) {
  if (!state || !victimName || !injurerName) return;

  const wk = Number(weeks || 1);

  const hit = clamp(
    -(10 + Math.round(wk * 2)),
    INJURY_CFG.relations.minHit,
    INJURY_CFG.relations.maxHit
  );

  // victim -> injurer
  const pv = getPair(state, victimName, injurerName);
  pv.trust = clamp((pv.trust || 0) + hit, -50, 50);

  // Identify friends of victim
  const friends = findFriendsOf(state, victimName);

  const chance = clamp(
    INJURY_CFG.relations.spillChanceBase + wk * INJURY_CFG.relations.spillChancePerWeek,
    INJURY_CFG.relations.spillChanceBase,
    INJURY_CFG.relations.spillChanceMax
  );

  const spill = clamp(
    Math.round(hit * INJURY_CFG.relations.spillFrac),
    INJURY_CFG.relations.spillMin,
    INJURY_CFG.relations.spillMax
  );

  try { onDangerSpot(state, injurerName, victimName); } catch {}

  for (const f of friends) {
    if (f === injurerName) continue;
    if (Math.random() >= chance) continue;

    const pf = getPair(state, f, injurerName);
    pf.trust = clamp((pf.trust || 0) + spill, -50, 50);
  }

  // Optional: you could log this to a lightweight state journal later
  // without changing gameplay.
  return { victim: victimName, injurer: injurerName, hit, spill, friendsCount: friends.length };
}

function findFriendsOf(state, name) {
  // If you have a dedicated relationships array, try to mine it.
  // Otherwise, fall back to "no friends".
  const out = new Set();

  // If your state.relationships is an array like [{a,b,trust,chemistry,...}]
  // you can adapt this easily. We’ll handle a few common shapes.
  const rels = Array.isArray(state.relationships) ? state.relationships : null;

  if (rels) {
    for (const rel of rels) {
      if (!rel) continue;
      const a = rel.a || rel.A;
      const b = rel.b || rel.B;
      if (!a || !b) continue;

      // Determine trust field name
      const t = Number(
        rel.trust ?? rel.v ?? rel.value ?? 0
      );

      if (t < INJURY_CFG.relations.friendTrustThreshold) continue;

      if (a === name) out.add(b);
      else if (b === name) out.add(a);
    }
  } else {
    // If you don't store a relationships array, we can’t enumerate friends reliably.
    // That’s fine — this feature becomes active once relationships are enumerable.
  }

  return [...out];
}

/**
 * Build a medical inbox message object (UI consumes this).
 * Caller decides how to push it (engine inbox store, UI inbox, etc.).
 */
export function buildInjuryInboxMessage(state, brand, event, moraleHit) {
  const victim = event.victim;
  const injurer = event.injurer;
  const who = injurer ? `${victim} was hurt in a match involving ${injurer}.` : `${victim} suffered an injury.`;

  const moraleLine = (moraleHit && moraleHit !== 0)
    ? `Morale impact: ${moraleHit}.\n`
    : '';

  return {
    from: 'Medical',
    title: 'Injury Report',
    body:
      `${who}\n` +
      `Diagnosis: ${event.injury}\n` +
      `Out: ~${event.weeks} week(s)\n` +
      moraleLine +
      `Note: Injury risk increases with fatigue.`,
    names: injurer ? [victim, injurer] : [victim],
    atWeek: Number(state?.week || 1),
    brand: brand || 'RAW'
  };
}
