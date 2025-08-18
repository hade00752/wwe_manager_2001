import { RAW, SD, clamp } from '../util.js';
import { keyFromNames, uniqSorted } from './helpers.js';
import { STORY_DECAY, STORY_MAX_BONUS } from '../util.js';

export function getStory(state, brand, namesArr){
  const key = keyFromNames(namesArr);
  const arr = state.storylines[brand] || [];
  return arr.find(s => keyFromNames(s.names) === key) || null;
}
export function addOrBoostStory(state, brand, namesArr, amount){
  const names = uniqSorted(namesArr);
  if(names.length<2) return;
  let s = getStory(state, brand, names);
  if(!s){ s = { names, heat:0, weeks:0 }; (state.storylines[brand] ||= []).push(s); }
  s.heat = clamp(s.heat + amount, 0, 100);
  s.weeks = 0;
}
export function decayStories(state){
  for(const brand of [RAW,SD]){
    const arr = state.storylines[brand] || [];
    arr.forEach(s=>{ s.heat = clamp(s.heat - STORY_DECAY, 0, 100); s.weeks += 1; });
    state.storylines[brand] = arr.filter(s=> s.heat>0);
  }
}
export function storyBonus(state, brand, namesArr){
  const s = getStory(state, brand, namesArr);
  if(!s) return 0;
  return Math.round(Math.min(STORY_MAX_BONUS, s.heat / 12));
}
export function inAnyStory(state, brand, name){
  return (state.storylines[brand]||[]).some(s => s.heat>0 && s.names.includes(name));
}
