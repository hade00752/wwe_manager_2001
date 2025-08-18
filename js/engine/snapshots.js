// public/js/engine/snapshots.js
// Save a per-wrestler baseline once per week so profiles can show deltas “since last week”.
import { nsKey } from "./state_mgmt.js"; // or from "./engine.js" if re-exported

const ATTR_KEYS = [
  'workrate','psychology','charisma','mic','chemistry',
  'starpower','reputation','likeability','consistency','momentum',
  'stamina','durability','strengthPower','agility','athleticism'
];

function makeSnapOf(w){
  const out = {};
  ATTR_KEYS.forEach(k => out[k] = Number(w[k] ?? 60));
  return out;
}

// Call this ONCE at the start of each week’s simulation (before progression/mentorship changes)
export function snapshotWeekBaseline(state){
  const week = state.week; // baseline is “this week before changes”
  try{
    state.roster.forEach(w => {
      const key = `wwf_attr_snap_v1::${w.name}`;
      const pack = { week, values: makeSnapOf(w) };
      localStorage.setItem(nsKey(`snap::${key}`), JSON.stringify(pack));
    });
  }catch{}
}
// === add at the bottom of snapshots.js ===
export function snapshotWeekBaselineOnce(state) {
  state.snapshots = state.snapshots || {};
  if (state.snapshots.weekBaselineWeek === state.week) return; // already done this week
  snapshotWeekBaseline(state);
  state.snapshots.weekBaselineWeek = state.week;
}

