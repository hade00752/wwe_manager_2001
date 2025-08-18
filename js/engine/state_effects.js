// public/js/engine/state_effects.js
import { BAL } from './balance.js';
import { clamp } from '../util.js';

const byName = (state, n)=> (state.roster||[]).find(w=>w.name===n);

export function applyPostMatchEffects(state, ctx){
  const { names=[], winners=[], isTitle=false, longMatch=false } = ctx;

  // 1) Momentum
  const losers = names.filter(n => !winners.includes(n));
  winners.forEach(n => bump(state, n, 'momentum', BAL.MOMENTUM.win));
  losers.forEach(n  => bump(state, n, 'momentum', BAL.MOMENTUM.loss));

  // Upset bonus (winner avg starpower << loser avg starpower)
  const avg = (arr,k)=> arr.length ? Math.round(arr.reduce((a,n)=> a + (byName(state,n)?.[k]??60),0)/arr.length) : 60;
  const wSp = avg(winners,'starpower'), lSp = avg(losers,'starpower');
  if (wSp + 12 <= lSp) winners.forEach(n => bump(state, n, 'momentum', BAL.MOMENTUM.bigUpset));

  // 2) Title prestige bump
  if (isTitle && winners.length){
    const marquee = lSp >= 85; // beat a marquee opponent/team
    const inc = marquee ? BAL.TITLE_PRESTIGE.marquee : BAL.TITLE_PRESTIGE.normal;
    winners.forEach(n => {
      bump(state, n, 'starpower',  inc.sp);
      bump(state, n, 'reputation', inc.rep);
      bump(state, n, 'consistency',inc.con);
    });
  }

  // 3) Fatigue
  const fGain = BAL.FATIGUE.baseGain + (longMatch ? BAL.FATIGUE.longMatchExtra : 0);
  names.forEach(n => bump(state, n, 'fatigue', +fGain, 0, 100));

  // 4) Injury rolls
  rollInjuries(state, names, { longMatch });
}

function bump(state, name, key, delta, min=1, max=99){
  const w = byName(state, name); if(!w) return;
  const base = key==='fatigue' ? (w[key] ?? 0) : (w[key] ?? 60);
  w[key] = clamp(Math.round(base + delta), min, max);
}

function rollInjuries(state, names, { longMatch }){
  for (const n of names){
    const w = byName(state, n); if(!w) continue;
    const dur = w.durability ?? 70;
    const fat = w.fatigue ?? 0;

    // Unsafe opponent risk factor (max of others’ lack of ring safety)
    const oppUnsafe = Math.max(...names.filter(x=>x!==n).map(x => {
      const o = byName(state, x); return o ? Math.max(0, 70 - (o.ringSafety ?? 70)) : 0;
    }), 0);

    let p =
      BAL.INJURY.basePct +
      Math.max(0, 70 - dur) * BAL.INJURY.durFactor +
      (oppUnsafe)         * BAL.INJURY.safetyOppFactor +
      Math.floor(fat/20)  * BAL.INJURY.fatigueFactor +
      (longMatch ? BAL.INJURY.longMatchFactor : 0);

    // Clamp to a sane cap (e.g., 10%)
    p = Math.min(p, 0.10);

    if (Math.random() < p){
      w.injuryWeeks = Math.max(w.injuryWeeks||0, randInt(BAL.INJURY.minWeeks, BAL.INJURY.maxWeeks));
    }
  }
}

function randInt(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }

