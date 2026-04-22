// public/js/engine/state_effects.js
import { BAL } from './balance.js';
import { clamp } from '../util.js';
import { getW } from './helpers.js';
import { getPair } from './relationships.js';
import { applyAttrDelta } from './attr_ledger.js';
import { titleWeight } from './champions.js';

const byName = (state, n)=> (state.roster||[]).find(w=>w.name===n);

// ======================================================================
// 🔥 unified effect interpreter (NOW LEDGER-AWARE)
// ======================================================================
// applyEffects(state, effects, meta?)
// meta: { why?:string, ref?:any, week?:number }
export function applyEffects(state, effects = [], meta = {}) {
  if (!effects) return;
  const arr = Array.isArray(effects) ? effects : [effects];

  // storage for creative promises
  state.promises ||= []; // [{type, brand, names[], dueWeek, onKeep, onBreak, open:true}]

  const week = Number(meta.week || state.week || 1);
  const whyBase = String(meta.why || 'Effect');
  const refBase = (meta.ref != null) ? meta.ref : null;

  for (const eff of arr) {
    if (!eff || typeof eff !== 'object') continue;

    switch (eff.kind) {
      case 'w': { // wrestler stat delta (LEDGER-AWARE)
        const w = getW(state, eff.name);
        if (!w) break;
        const stat = String(eff.stat || '').trim();
        if (!stat) break;

        const d = Math.round(Number(eff.delta || 0));
        if (!d) break;

        // Apply via attr ledger so we always write state.attrLedger + clamp centrally
        applyAttrDelta(
          state,
          week,
          w,
          stat,
          d,
          `${whyBase}: ${eff.label || stat}`,
          { ...asRef(refBase), source: 'applyEffects', kind: 'w', name: eff.name, stat }
        );
        break;
      }

      case 'injury': {
        const w = getW(state, eff.name);
        if (w) w.injuryWeeks = Math.max(w.injuryWeeks||0, eff.weeks||1);
        break;
      }

      case 'fatigue': { // treat as attr delta for ledger
        const w = getW(state, eff.name);
        if (!w) break;
        const d = Math.round(Number(eff.delta || 0));
        if (!d) break;
        applyAttrDelta(
          state,
          week,
          w,
          'fatigue',
          d,
          `${whyBase}: fatigue`,
          { ...asRef(refBase), source: 'applyEffects', kind: 'fatigue', name: eff.name }
        );
        break;
      }

      case 'brand': {
        const w = getW(state, eff.name);
        if (w) w.brand = eff.to;
        break;
      }

      case 'rel': {
        const p = getPair(state, eff.a, eff.b);
        const stat = String(eff.stat || 'trust');
        const d = Number(eff.delta || 0);
        if (!d) break;

        if (stat === 'chemistry') {
          p.chemistry = clamp((p.chemistry||0) + d, -20, 20);
        } else if (stat === 'pressure') {
          p.pressure = clamp((p.pressure||0) + d, 0, 100);
        } else {
          p.trust = clamp((p.trust||0) + d, -100, 100);
        }
        break;
      }

      // store a creative promise to be resolved by runShow next week
      case 'promise': {
        const weeks = Math.max(1, (eff.weeks|0) || 1);
        const dueWeek = (state.week|0) + weeks;
        state.promises.push({
          type: eff.type,
          brand: eff.brand || null,
          names: Array.isArray(eff.names) ? eff.names.slice() : [],
          createdWeek: state.week | 0,
          dueWeek,
          onKeep: eff.onKeep || null,
          onBreak: eff.onBreak || null,
          open: true
        });
        break;
      }

      default:
        if (eff.morale || eff.momentum || eff.trust || eff.chemistry) {
          applyDynamicEffects(state, eff, { week, whyBase, refBase });
        }
    }
  }
}

function asRef(refBase){
  if (!refBase) return null;
  if (refBase && typeof refBase === 'object') return refBase;
  return { ref: refBase };
}

export function applyOutcomeSideEffects(state, winners, losers, finish, markMoraleTouched, ref, direction = 'clean') {
  // direction takes precedence over legacy finish flag when present
  const dir = (direction && direction !== 'clean') ? direction : finish;

  const winMom  = BAL.MOMENTUM.win[dir]  ?? BAL.MOMENTUM.win.clean;
  const loseMom = BAL.MOMENTUM.loss[dir] ?? BAL.MOMENTUM.loss.clean;
  const repHit  = (dir === 'dirty') ? -2 : 0;

  const winMor  = BAL.MORALE.win[dir]  ?? BAL.MORALE.win.clean;
  const loseMor = BAL.MORALE.loss[dir] ?? BAL.MORALE.loss.clean;

  for (const n of winners) {
    const w = getW(state, n);
    if (!w) continue;

    applyAttrDelta(state, state.week, w, 'momentum', winMom, `Match win (${finish})`, ref);

    if (finish === 'dirty') {
      applyAttrDelta(state, state.week, w, 'reputation', repHit, 'Dirty finish reputation hit', ref);
    }

    const before = (w.morale ?? 65);
    applyAttrDelta(state, state.week, w, 'morale', winMor, `Match win morale (${finish})`, ref);
    if ((w.morale ?? 65) !== before && typeof markMoraleTouched === 'function') markMoraleTouched(w.name);
  }

  for (const n of losers) {
    const w = getW(state, n);
    if (!w) continue;

    applyAttrDelta(state, state.week, w, 'momentum', loseMom, `Match loss (${finish})`, ref);

    const before = (w.morale ?? 65);
    applyAttrDelta(state, state.week, w, 'morale', loseMor, `Match loss morale (${finish})`, ref);
    if ((w.morale ?? 65) !== before && typeof markMoraleTouched === 'function') markMoraleTouched(w.name);
  }
}

export function applyChampionLeftOffShowPenalty(state, brand, w, markMoraleTouched) {
  if (!state || !w || !w.name) return;

  const champs = state.champs?.[brand] || {};
  const heldTitles = [];

  for (const [title, holder] of Object.entries(champs)) {
    if (!holder) continue;

    if (typeof holder === 'string' && holder === w.name) heldTitles.push(title);
    else if (Array.isArray(holder) && holder.includes(w.name)) heldTitles.push(title);
  }

  if (!heldTitles.length) return;

  const weightSum = heldTitles.reduce((a, t) => a + (titleWeight(t) || 1), 0);

  // World(3)->morale -5, Tag(2)->-4, Mid(1)->-3 (capped)
  const moraleHit   = -Math.min(6, 2 + weightSum);
  const momentumHit = -Math.min(5, 1 + Math.ceil(weightSum * 0.8));

  const ref = { brand, week: state.week, evt: 'champOffShow', titles: heldTitles.slice() };

  const beforeM = (w.morale ?? 65);
  applyAttrDelta(state, state.week, w, 'morale', moraleHit, `Champion left off show (${heldTitles.join(', ')})`, ref);
  applyAttrDelta(state, state.week, w, 'momentum', momentumHit, `Champion left off show momentum hit (${heldTitles.join(', ')})`, ref);

  if ((w.morale ?? 65) !== beforeM && typeof markMoraleTouched === 'function') markMoraleTouched(w.name);
}

export function computeChampionOffShowRatingPenalty(state, brand, bookedSet) {
  const champs = state?.champs?.[brand] || {};
  if (!champs || typeof champs !== 'object') {
    return { penalty: 0, omittedTitles: [], omittedNames: [] };
  }

  const omittedTitles = [];
  const omittedNames = new Set();
  const wasBooked = (name) => bookedSet && bookedSet.has(name);

  for (const [title, holder] of Object.entries(champs)) {
    if (!holder) continue;

    const holders = Array.isArray(holder) ? holder.filter(Boolean) : [holder].filter(Boolean);

    // omitted if NONE of the holders were booked
    if (holders.some(n => wasBooked(n))) continue;

    omittedTitles.push(title);
    holders.forEach(n => omittedNames.add(n));
  }

  if (!omittedTitles.length) {
    return { penalty: 0, omittedTitles: [], omittedNames: [] };
  }

  const weightSum = omittedTitles.reduce((a, t) => a + (titleWeight(t) || 1), 0);

  // gentle showScore penalty, capped
  let penalty = -Math.round(3 + weightSum * 1.8);
  if (omittedTitles.length >= 2) penalty -= 2;
  penalty = clamp(penalty, -18, 0);

  return { penalty, omittedTitles, omittedNames: [...omittedNames] };
}
// --- helper for inbox_dynamic style (NOW LEDGER-AWARE for morale/momentum) ---
function applyDynamicEffects(state, eff, ctx) {
  const week = Number(ctx?.week || state.week || 1);
  const whyBase = String(ctx?.whyBase || 'Dynamic');
  const refBase = ctx?.refBase ?? null;

  if (eff.morale) {
    const { actor, target, global } = eff.morale;

    if (Number.isFinite(actor)) {
      const w = getW(state, eff.vars?.actor);
      if (w) applyAttrDelta(
        state, week, w, 'morale', Math.round(actor),
        `${whyBase}: morale (actor)`,
        { ...asRef(refBase), source:'applyDynamicEffects', kind:'morale', scope:'actor', actor: eff.vars?.actor }
      );
    }
    if (Number.isFinite(target)) {
      const w = getW(state, eff.vars?.target);
      if (w) applyAttrDelta(
        state, week, w, 'morale', Math.round(target),
        `${whyBase}: morale (target)`,
        { ...asRef(refBase), source:'applyDynamicEffects', kind:'morale', scope:'target', target: eff.vars?.target }
      );
    }
    if (Number.isFinite(global)) {
      (state.roster||[]).forEach(w=>{
        if (!w) return;
        applyAttrDelta(
          state, week, w, 'morale', Math.round(global),
          `${whyBase}: morale (global)`,
          { ...asRef(refBase), source:'applyDynamicEffects', kind:'morale', scope:'global' }
        );
      });
    }
  }

  if (eff.momentum) {
    const { actor, target } = eff.momentum;

    if (Number.isFinite(actor)) {
      const w = getW(state, eff.vars?.actor);
      if (w) applyAttrDelta(
        state, week, w, 'momentum', Math.round(actor),
        `${whyBase}: momentum (actor)`,
        { ...asRef(refBase), source:'applyDynamicEffects', kind:'momentum', scope:'actor', actor: eff.vars?.actor }
      );
    }
    if (Number.isFinite(target)) {
      const w = getW(state, eff.vars?.target);
      if (w) applyAttrDelta(
        state, week, w, 'momentum', Math.round(target),
        `${whyBase}: momentum (target)`,
        { ...asRef(refBase), source:'applyDynamicEffects', kind:'momentum', scope:'target', target: eff.vars?.target }
      );
    }
  }

  if (eff.trust && Array.isArray(eff.trust.pair)) {
    const [a,b,d] = eff.trust.pair;
    const p = getPair(state,a,b);
    p.trust = clamp((p.trust||0)+Number(d),-100,100);
  }
  if (eff.chemistry && Array.isArray(eff.chemistry.pair)) {
    const [a,b,d] = eff.chemistry.pair;
    const p = getPair(state,a,b);
    p.chemistry = clamp((p.chemistry||0)+Number(d),-20,20);
  }
}
