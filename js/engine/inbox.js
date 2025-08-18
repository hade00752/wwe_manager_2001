// engine/inbox.js — safe inbox event generator
import { getW } from './helpers.js';
import { clamp, r } from '../util.js';

/** Rebuild a safe name->wrestler index on each call */
function buildIndex(state) {
  const roster = Array.isArray(state?.roster) ? state.roster : [];
  const idx = Object.create(null);
  for (const w of roster) if (w && w.name) idx[w.name] = w;
  return idx;
}
function wByName(state, name, idx) {
  return (idx && idx[name]) || getW(state, name) || null;
}

/** Simple anti-spam throttle: one ping per wrestler per week */
function canPing(state, name) {
  if (!name) return false;
  state._lastPings ||= Object.create(null);
  const wk = state.week ?? 1;
  const last = state._lastPings[name];
  if (typeof last === 'number' && last >= wk) return false; // already pinged this week
  state._lastPings[name] = wk;
  return true;
}

/**
 * Generate inbox events from the show results.
 * Always safe: will never throw on missing/unknown wrestlers.
 */
export function generateInboxEvents(state, brand, results, appeared) {
  try {
    const idx = buildIndex(state);
    state.inbox ||= [];

    // 1) Wrestlers who appeared: low-momentum “asking for a push”
    const seen = new Set();
    (appeared || []).forEach(w => {
      const name = w?.name;
      if (!name || seen.has(name)) return;
      seen.add(name);

      const ww = wByName(state, name, idx);
      if (!ww) return;                 // guard: not on roster anymore
      if (!canPing(state, name)) return;

      if ((ww.momentum ?? 50) <= 35) {
        state.inbox.push({
          atWeek: state.week,
          from: name,
          title: 'Wants a push',
          body: `${name}: "Boss, I’m ice cold out there. Can I get something to heat me up?"`
        });
      }
    });

    // 2) Segment tags: title change announcements (just a simple example)
    (results || []).forEach(seg => {
      if (!seg || !Array.isArray(seg.tags)) return;
      const didChange = seg.tags.some(t => String(t).toLowerCase().includes('title change'));
      if (didChange) {
        state.inbox.push({
          atWeek: state.week,
          from: 'Office',
          title: 'Championship Update',
          body: `Result: ${seg.text || 'Title changed hands.'}`
        });
      }
    });

  } catch (err) {
    // Never let inbox generation take the show down
    console.warn('[inbox] generateInboxEvents failed (soft):', err);
  }
}
