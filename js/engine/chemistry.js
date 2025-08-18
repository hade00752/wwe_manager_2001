import { clamp } from '../util.js';

export const pairKey = (a,b)=> {
  const [x,y] = [a,b].sort((m,n)=> m.localeCompare(n));
  return `${x}__${y}`;
};
export function getChem(state, a, b){ return state.chemistry[pairKey(a,b)] ?? 0; } // -10..+10
export function bumpChem(state, a, b, amt){
  const k = pairKey(a,b);
  const v = (state.chemistry[k] ?? 0) + amt;
  state.chemistry[k] = clamp(v, -10, 10);
}
export function decayAllChemistry(state){
  for(const k in state.chemistry){
    const v = state.chemistry[k];
    if(v===0) continue;
    state.chemistry[k] = v > 0 ? v-1 : v+1;
    if (Math.abs(state.chemistry[k]) < 1) delete state.chemistry[k];
  }
}
