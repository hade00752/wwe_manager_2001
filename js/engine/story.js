import { RAW, SD, clamp } from '../util.js';
import { keyFromNames, uniqSorted } from './helpers.js';
import { STORY_DECAY, STORY_HEAT_ON_HOT, STORY_MAX_BONUS } from '../util.js';
import { REL, bumpRel } from './relationships.js';

const byName = (state, name) => (state.roster || []).find(w => w.name === name);

function adjustMorale(state, name, delta) {
  if (!delta) return 0;
  const w = byName(state, name);
  if (!w) return 0;
  const before = Number.isFinite(w.morale) ? w.morale : 65;
  const after = clamp(Math.round(before + delta), 0, 100);
  if (after === before) return 0;
  w.morale = after;
  return after - before;
}

function heatDeltaFromRating(rating) {
  if (!Number.isFinite(rating)) return 0;
  if (rating >= 92) return 9;
  if (rating >= 86) return 7;
  if (rating >= 80) return 5;
  if (rating >= 74) return 3;
  if (rating >= 68) return 2;
  if (rating >= 62) return 1;
  if (rating >= 55) return -2;
  return -4;
}

function ensureStory(state, brand, names) {
  const arr = state.storylines[brand] ||= [];
  let story = getStory(state, brand, names);
  if (!story) {
    story = { names: uniqSorted(names), heat: 0, weeks: 0, lastScore: 0, lastDelta: 0 };
    arr.push(story);
  }
  return story;
}

export function storyHeatTier(heat) {
  if (!Number.isFinite(heat)) return 0;
  return Math.max(0, Math.round(heat / 12));
}

export function applyStoryProgression(state, brand, namesArr, { rating = 0, hot = false, repeatPenalty = 0 } = {}) {
  const names = uniqSorted(namesArr);
  if (names.length < 2) return null;

  const baseDelta = heatDeltaFromRating(rating);
  const hotBonus = hot ? Math.round(STORY_HEAT_ON_HOT * 0.5) : 0;
  const repeatDrag = repeatPenalty > 0 ? -Math.max(1, Math.round(repeatPenalty / 10)) : 0;
  const appliedDelta = clamp(baseDelta + hotBonus + repeatDrag, -10, 12);

  if (!state.storylines) state.storylines = { [RAW]: [], [SD]: [] };

  // Only spin up a new story if we actually have upward momentum.
  if (!getStory(state, brand, names) && appliedDelta <= 0) {
    return null;
  }

  const story = ensureStory(state, brand, names);
  const before = story.heat || 0;
  const after = clamp(before + appliedDelta, 0, 100);
  story.heat = after;
  story.weeks = 0;
  story.lastScore = Math.round(rating || 0);
  story.lastDelta = appliedDelta;

  return { story, before, after, delta: after - before, appliedDelta };
}

export function applyStoryEcosystemEffects(state, brand, progress, { rating = 0, winners = [], participants = [], pairings = [] } = {}) {
  if (!progress || !progress.story) return null;

  const heat = progress.story.heat || 0;
  const tier = storyHeatTier(heat);
  const previousTier = storyHeatTier(progress.before || 0);
  const tierDelta = tier - previousTier;

  const winnersSet = new Set(winners);
  const losers = participants.filter(n => !winnersSet.has(n));

  const moraleChanges = {};

  const winBase = rating >= 90 ? 4 : rating >= 82 ? 3 : rating >= 74 ? 2 : rating >= 68 ? 1 : 0;
  const loseBase = rating >= 82 ? 0 : rating >= 72 ? -1 : rating >= 64 ? -2 : -3;
  const heatWinBonus = Math.max(0, Math.floor(heat / 25));
  const heatLosePenalty = tier >= 4 ? -1 : 0;
  const slipPenalty = progress.delta < 0 ? Math.max(-2, Math.round(progress.delta / 2)) : 0;
  const tierMomentum = tierDelta > 0 ? 1 : 0;

  winners.forEach(name => {
    const applied = adjustMorale(state, name, winBase + heatWinBonus + tierMomentum);
    if (applied) moraleChanges[name] = (moraleChanges[name] || 0) + applied;
  });

  losers.forEach(name => {
    const applied = adjustMorale(state, name, loseBase + heatLosePenalty + slipPenalty);
    if (applied) moraleChanges[name] = (moraleChanges[name] || 0) + applied;
  });

  const rivalryChanges = {};
  const rivalryBoost = tier > 0 ? Math.max(1, Math.floor(heat / 20)) : 0;
  const rivalrySlip = progress.delta < 0 ? Math.max(-3, progress.delta) : 0;

  pairings.forEach(([a, b]) => {
    if (!a || !b) return;
    if (rivalryBoost) {
      bumpRel(state, a, b, REL.RIVAL, rivalryBoost);
      rivalryChanges[`${a}↔${b}`] = (rivalryChanges[`${a}↔${b}`] || 0) + rivalryBoost;
    }
    if (rivalrySlip) {
      bumpRel(state, a, b, REL.RIVAL, rivalrySlip);
      rivalryChanges[`${a}↔${b}`] = (rivalryChanges[`${a}↔${b}`] || 0) + rivalrySlip;
    }
  });

  return { tier, tierDelta, moraleChanges, rivalryChanges, heat };
}

export function getStory(state, brand, namesArr){
  const key = keyFromNames(namesArr);
  const arr = state.storylines[brand] || [];
  return arr.find(s => keyFromNames(s.names) === key) || null;
}
export function addOrBoostStory(state, brand, namesArr, amount){
  const names = uniqSorted(namesArr);
  if(names.length<2) return;
  let s = getStory(state, brand, names);
  if(!s){ s = { names, heat:0, weeks:0, lastScore:0, lastDelta:0 }; (state.storylines[brand] ||= []).push(s); }
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
