// public/js/engine/snapshots.js
import { nsKey, SAVE_KEY } from './state_mgmt.js';

/**
 * Take one baseline snapshot of all roster attributes for the current week.
 * Idempotent: if a baseline exists for this week, does nothing.
 * Stores:
 *   - state.snapshots.weekBaseline[name] = { values: { ...15 stats..., ringSafety? }, week }
 *   - localStorage[nsKey('attr::<name>')] = { values, week, takenAt }
 */
export function snapshotWeekBaselineOnce(state){
  if (!state) return;
  state.snapshots = state.snapshots || {};
  const wk = Number(state.week || 1);

  // If we already have a baseline tagged with this week, keep it.
  const have = state.snapshots.weekBaseline && state.snapshots.weekBaseline.__week === wk;
  if (have) return;

  const packAll = {};
  const now = Date.now();

  (state.roster || []).forEach(w => {
    const values = {
      workrate:        Number(w.workrate       ?? 60),
      psychology:      Number(w.psychology     ?? 60),
      charisma:        Number(w.charisma ?? w.promo ?? 60),
      mic:             Number(w.mic      ?? w.promo ?? 60),
      chemistry:       Number(w.chemistry      ?? 60),

      starpower:       Number(w.starpower      ?? 60),
      reputation:      Number(w.reputation     ?? 60),
      likeability:     Number(w.likeability    ?? 60),
      consistency:     Number(w.consistency    ?? 60),
      momentum:        Number(w.momentum       ?? 60),

      stamina:         Number(w.stamina        ?? 60),
      durability:      Number(w.durability     ?? 60),
      strengthPower:   Number(w.strengthPower  ?? 60),
      agility:         Number(w.agility        ?? 60),
      athleticism:     Number(w.athleticism    ?? 60),

      // optional (used on profile deltas if present)
      ringSafety:      (typeof w.ringSafety === 'number') ? Number(w.ringSafety) : undefined,
    };

    packAll[w.name] = { values, week: wk };

    // Persist a per-wrestler copy under the **namespaced** key for profile.js
    try {
      localStorage.setItem(nsKey(`attr::${w.name}`), JSON.stringify({
        values, week: wk, takenAt: now
      }));
    } catch {}
  });

  state.snapshots.weekBaseline = packAll;
  state.snapshots.weekBaseline.__week = wk;

  // write back whole state (so profile.js can read weekBaseline)
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}
