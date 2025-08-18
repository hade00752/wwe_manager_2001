import { RAW, SD, FA, clamp } from '../util.js';
import { setChampionFlags } from './champions.js';

// role: "active" | "manager" | "mentor" | "personality" | "retired"
export function setRole(w, role){
  const allowed = new Set(["active","manager","mentor","personality","retired"]);
  w.role = allowed.has(role) ? role : "retired";
}

export function signToBrand(state, name, brand, role="manager"){
  const w = state.roster.find(x => x.name === name);
  if(!w) return false;
  if(![RAW,SD,FA].includes(brand)) return false;

  // If they were champions somewhere, vacate (defensive)
  for (const b of [RAW,SD]) {
    for (const t in (state.champs[b]||{})) {
      const holder = state.champs[b][t];
      if (Array.isArray(holder) ? holder.includes(name) : holder === name) {
        state.champs[b][t] = null;
      }
    }
  }

  w.brand = brand;
  // If we sign them to an active brand but they are retired, keep them non-wrestling by default:
  if (w.retired && role === "active") role = "manager";
  setRole(w, role);
  setChampionFlags(state);
  return true;
}

export function releaseToFA(state, name){
  const w = state.roster.find(x => x.name === name);
  if(!w) return false;
  w.brand = FA;
  setRole(w, w.retired ? "retired" : (w.role || "retired"));
  // belts already handled elsewhere, but be safe:
  for (const b of [RAW,SD]) {
    for (const t in (state.champs[b]||{})) {
      const holder = state.champs[b][t];
      if (Array.isArray(holder) ? holder.includes(name) : holder === name) {
        state.champs[b][t] = null;
      }
    }
  }
  setChampionFlags(state);
  return true;
}
