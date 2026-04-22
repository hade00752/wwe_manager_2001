// public/js/engine/inbox_dynamic.js
import { clamp } from '../util.js';
import { pushInbox } from './inbox_store.js';
import { applyEffects } from './state_effects.js';

// --- Config
const MAX_LEFT_OFF_PER_WEEK = 3;
const MAX_RELATIONSHIP_MAILS = 4;
const POOR_MATCH_THRESHOLD = 55;
const HOT_MATCH_TAG = 'hot match';

// ── Promise resolution ───────────────────────────────────────────────
// Called at the START of each show so promises from last week are checked
// before new inbox events fire.
export function resolveOpenPromises(state, brand, results) {
  if (!Array.isArray(state.promises) || !state.promises.length) return;

  const week = state.week | 0;
  const appearedNames = appearedNamesFrom(results);

  for (const p of state.promises) {
    if (!p.open) continue;
    if ((p.brand && p.brand !== brand) || week < p.dueWeek) continue;

    p.open = false; // close regardless of outcome

    const names = Array.isArray(p.names) ? p.names : [];

    // Kept = every promised name appeared this week
    const kept = names.length > 0 && names.every(n => appearedNames.has(n));

    const effect = kept ? p.onKeep : p.onBreak;
    if (!effect) continue;

    // Apply the effect
    applyNow(state, [effect], kept ? 'Promise kept' : 'Promise broken', { brand, week });

    // Only inbox on break (kept = silent reward; broken = visible consequence)
    if (!kept && names.length) {
      const name = names[0];
      pushInbox(state, brand, {
        from: name,
        title: kept ? 'Promise Kept -- Thank You' : 'You Broke Your Promise',
        body: kept
          ? `${name} appreciated that you followed through.`
          : `${name} remembers you promised something that never happened. Trust is taking a hit.`,
        names,
        tags: [kept ? 'promise-kept' : 'promise-broken']
      }, 'brand');
    }
  }

  // Prune resolved promises older than 4 weeks to stop state bloat
  state.promises = state.promises.filter(p => p.open || (p.dueWeek ?? 0) >= week - 4);
}

// ------------ helpers -------------
function appearedNamesFrom(results){
  return new Set((results||[]).flatMap(r => r.names || []));
}
function singlesCountThisWeek(results){
  const map = {};
  for (const seg of (results || [])) {
    if (seg?.type === 'singles') {
      (seg.names||[]).forEach(n => { map[n] = (map[n]||0) + 1; });
    }
  }
  return map;
}
function wasInTagThisWeek(results, name){
  return (results||[]).some(seg => seg?.type === 'tag' && (seg.names||[]).includes(name));
}
function hasTag(seg, needle){
  return Array.isArray(seg?.tags) && seg.tags.some(t => String(t).toLowerCase().includes(needle));
}
function winnersOf(seg){
  return Array.isArray(seg?.explain?.winners) ? seg.explain.winners.slice() : [];
}
function losersOf(seg){
  if (Array.isArray(seg?.explain?.losers)) return seg.explain.losers.slice();
  const names = seg?.names || [];
  const W = new Set(winnersOf(seg));
  return names.filter(n => !W.has(n));
}
function isSingles(seg){ return seg?.type === 'singles' && Array.isArray(seg.names) && seg.names.length === 2; }
function isTag(seg){ return seg?.type === 'tag' && Array.isArray(seg.names) && seg.names.length === 4; }

// ------------ per-week dedupe -------------
function markSeen(state, key){
  state._mailSeenWeek ||= {};
  const wk = state.week|0;
  state._mailSeenWeek[wk] ||= new Set();
  state._mailSeenWeek[wk].add(key);
}
function wasSeen(state, key){
  const wk = state.week|0;
  return !!state._mailSeenWeek?.[wk]?.has(key);
}
function pairKey(a,b){ return [a,b].sort().join(' · '); }

// ------------ effect helpers (NO DIRECT MUTATION) -------------
function relEff(a, b, stat, delta){
  return { kind:'rel', a, b, stat, delta: Math.round(delta) };
}
function applyNow(state, effects, why, ref){
  if (!effects || !effects.length) return;
  applyEffects(state, effects, { why, ref, week: state.week });
}

// ------------------- main -------------------
export function processDynamicInboxEvents(state, brand, results){
  // Strict brand scoping
  const roster = (state.roster || []).filter(w => w.brand === brand);
  const appearedNames = appearedNamesFrom(results);

  // ---------- "Left off the show" -- with compounding streak tracking ----------
  state._leftOffStreak ||= {};

  const leftOffPool = roster.filter(w =>
    !appearedNames.has(w.name) &&
    !(w.injuryWeeks > 0) &&
    w.active !== false
  );

  // Increment streak for everyone left off, reset for everyone who appeared
  for (const w of roster) {
    if (appearedNames.has(w.name)) {
      state._leftOffStreak[w.name] = 0;
    } else if (!(w.injuryWeeks > 0)) {
      state._leftOffStreak[w.name] = ((state._leftOffStreak[w.name] || 0) + 1);
    }
  }

  const leftOffComplainers = leftOffPool
    .filter(w => (w.starpower >= 65 || w.momentum >= 60) && (w.morale|0) <= 60)
    .sort((a,b) => (b.starpower + b.momentum) - (a.starpower + a.momentum))
    .slice(0, MAX_LEFT_OFF_PER_WEEK);

  for (const w of leftOffComplainers) {
    const key = `leftoff:${brand}:${w.name}`;
    if (wasSeen(state, key)) continue;

    const streak = state._leftOffStreak[w.name] || 1;

    // Silent morale drain that stacks - no inbox needed for streak=1
    const silentDrain = streak === 1 ? -1 : streak === 2 ? -2 : -3;
    applyNow(state, [{ kind:'w', name:w.name, stat:'morale', delta: silentDrain }],
      `Left off show (streak ${streak})`, { brand, week: state.week });

    // Escalating message tone
    let title, body;
    if (streak <= 1) {
      title = 'Left Off The Show';
      body  = `I wasn't used on this week's ${brand} show. I need TV time.`;
    } else if (streak <= 3) {
      title = 'Still Not Being Used';
      body  = `This is the ${streak === 2 ? 'second' : 'third'} week in a row I haven't been on ${brand}. What's going on?`;
    } else {
      title = 'Seriously Considering My Options';
      body  = `${streak} weeks off TV. I'm a ${w.starpower >= 75 ? 'top-level' : 'featured'} talent and I'm invisible. This can't continue.`;
    }

    // Escalating actions and consequences
    const moralePromiseBoost = streak >= 4 ? +4 : +2;
    const moraleKeepBoost    = streak >= 4 ? +10 : +6;
    const moraleBreakHit     = streak >= 4 ? -15 : -8;
    const moraleStandFirmHit = streak >= 4 ? -8  : -4;

    pushInbox(state, brand, {
      from: w.name,
      title,
      body,
      names: [w.name],
      tags: streak >= 4 ? ['escalated', 'contract-risk'] : ['left-off'],
      actions: [
        { key:'PROMISE_MATCH', label: streak >= 4 ? 'PROMISE FEATURED SPOT + APOLOGY' : 'PROMISE A MATCH NEXT WEEK',
          effects:[
            { kind:'w', name:w.name, stat:'morale', delta: moralePromiseBoost },
            { kind:'promise', type:'matchNextWeek', brand, names:[w.name], weeks:1,
              onKeep:  { kind:'w', name:w.name, stat:'morale', delta: moraleKeepBoost },
              onBreak: { kind:'w', name:w.name, stat:'morale', delta: moraleBreakHit  }
            }
          ]
        },
        { key:'EXPLAIN_ROTATION', label: streak >= 3 ? 'OFFER WRITTEN EXPLANATION' : 'EXPLAIN ROTATION',
          effects:[{ kind:'w', name:w.name, stat:'morale', delta: streak >= 3 ? +2 : +1 }]
        },
        ...(streak >= 3 ? [{
          key: 'STAND_FIRM',
          label: 'STAND FIRM -- DEAL WITH IT',
          effects: [{ kind:'w', name:w.name, stat:'morale', delta: moraleStandFirmHit }]
        }] : [])
      ]
    }, 'brand');

    markSeen(state, key);
  }

  // ---------- Praise (only people who actually appeared) ----------
  const praised = roster
    .filter(w => appearedNames.has(w.name))
    .sort((a,b) => (b.momentum|0) - (a.momentum|0))
    .slice(0, 2);

  for (const w of praised) {
    const key = `praise:${brand}:${w.name}`;
    if (wasSeen(state, key)) continue;

    pushInbox(state, brand, {
      from: 'Coaches Room',
      title: 'Work Ethic Praised',
      body: `Coaches praised ${w.name}'s work ethic this week.`,
      names: [w.name]
    }, 'brand');

    markSeen(state, key);
  }

  // ---------- Tag specialist gripe (only if booked in singles) ----------
  const singlesCount = singlesCountThisWeek(results);
  const tagSpecialists = roster.filter(w =>
    Array.isArray(w.traits?.status) &&
    w.traits.status.includes('TagTeamSpecialist') &&
    (singlesCount[w.name] || 0) >= 1 &&
    !wasInTagThisWeek(results, w.name)
  );

  tagSpecialists.slice(0, 2).forEach(w=>{
    const key = `wantstag:${brand}:${w.name}`;
    if (wasSeen(state, key)) return;

    pushInbox(state, brand, {
      from: w.name,
      title: 'Wants More Tag Matches',
      body: `I'm a tag-first worker. Can I get back to teaming soon?`,
      names: [w.name],
      actions: [
        { key:'PROMISE_TAG', label:'PROMISE TAG NEXT WEEK',
          effects:[
            { kind:'w', name:w.name, stat:'morale', delta:+2 },
            { kind:'promise', type:'tagNextWeek', brand, names:[w.name], weeks:1,
              onKeep:{ kind:'w', name:w.name, stat:'morale', delta:+6 },
              onBreak:{ kind:'w', name:w.name, stat:'morale', delta:-8 }
            }
          ]
        },
        { key:'DECLINE', label:'EXPLAIN CREATIVE', effects:[] }
      ]
    }, 'brand');

    markSeen(state, key);
  });

  // ===================== Post-match relationship pulses =====================
  let relMailCount = 0;

  for (const seg of (results || [])) {
    if (!(Array.isArray(seg.names) && seg.names.length >= 2)) continue;
    const rating = Number(seg.score || 0);

    // Singles pulses
    if (isSingles(seg)) {
      const [a, b] = seg.names;
      const clean = hasTag(seg, 'clean');
      const dirty = hasTag(seg, 'dirty');
      const pk = pairKey(a,b);

      if (clean) {
        // ✅ apply via unified effects (no direct getPair mutation)
        applyNow(state, [relEff(a,b,'trust', +2)], 'Dynamic inbox: clean respect', { brand, seg: seg.seg, pair: pk });

        const key = `respect:${brand}:${state.week}:${pk}`;
        if (!wasSeen(state, key) && relMailCount < MAX_RELATIONSHIP_MAILS) {
          const loser = losersOf(seg)[0] || b;
          pushInbox(state, brand, {
            from: loser,
            title: 'Good Match -- Respect',
            body: `Good work out there with ${a === loser ? b : a}. Respect.`,
            names: [a, b]
          }, 'brand');
          markSeen(state, key);
          relMailCount++;
        }
      }

      if (dirty) {
        applyNow(state, [relEff(a,b,'trust', -2)], 'Dynamic inbox: dirty finish beef', { brand, seg: seg.seg, pair: pk });

        const key = `dirty:${brand}:${state.week}:${pk}`;
        if (!wasSeen(state, key) && relMailCount < MAX_RELATIONSHIP_MAILS) {
          const target = losersOf(seg)[0] || b;
          pushInbox(state, brand, {
            from: target,
            title: 'Not Cool',
            body: `That finish didn't feel right. We need to keep it professional.`,
            names: [a, b]
          }, 'brand');
          markSeen(state, key);
          relMailCount++;
        }
      }

      if (Array.isArray(seg.tags) && seg.tags.includes(HOT_MATCH_TAG)) {
        applyNow(state, [relEff(a,b,'chemistry', +1)], 'Dynamic inbox: hot match chem', { brand, seg: seg.seg, pair: pk });
      }

      if (rating && rating < POOR_MATCH_THRESHOLD) {
        applyNow(
          state,
          [relEff(a,b,'chemistry', -1), relEff(a,b,'trust', -1)],
          'Dynamic inbox: off night',
          { brand, seg: seg.seg, pair: pk, rating }
        );

        const key = `off:${brand}:${state.week}:${pk}`;
        if (!wasSeen(state, key) && relMailCount < MAX_RELATIONSHIP_MAILS) {
          const sender = losersOf(seg)[0] || b;
          pushInbox(state, brand, {
            from: sender,
            title: 'Off Night',
            body: `That didn't click with ${a === sender ? b : a}. We should review the plan.`,
            names: [a, b]
          }, 'brand');
          markSeen(state, key);
          relMailCount++;
        }
      }
    }

    // Tag pulses
    if (isTag(seg)) {
      const [a1, a2, b1, b2] = seg.names;
      const kA = pairKey(a1,a2), kB = pairKey(b1,b2);

      if (Array.isArray(seg.tags) && seg.tags.includes(HOT_MATCH_TAG)) {
        applyNow(state, [
          relEff(a1,a2,'trust', +2),
          relEff(b1,b2,'trust', +2),
          relEff(a1,a2,'chemistry', +1),
          relEff(b1,b2,'chemistry', +1),
        ], 'Dynamic inbox: hot tag synergy', { brand, seg: seg.seg, teamA: kA, teamB: kB });
      }

      if (hasTag(seg, 'dirty')) {
        // opponents "not cool" pulse (light)
        applyNow(state, [
          relEff(a1,b1,'trust', -1),
          relEff(a2,b2,'trust', -1),
        ], 'Dynamic inbox: dirty tag finish', { brand, seg: seg.seg });
      }

      const ratingNum = Number(seg.score || 0);
      if (ratingNum && ratingNum < POOR_MATCH_THRESHOLD) {
        applyNow(state, [
          relEff(a1,a2,'trust', -1),
          relEff(b1,b2,'trust', -1),
        ], 'Dynamic inbox: tag off night', { brand, seg: seg.seg, rating: ratingNum });

        const key = `tagoff:${brand}:${state.week}:${kA}:${kB}`;
        if (!wasSeen(state, key) && relMailCount < MAX_RELATIONSHIP_MAILS) {
          const sender = losersOf(seg)[0] || a1;
          pushInbox(state, brand, {
            from: sender,
            title: 'We Can Be Sharper',
            body: `That tag didn't flow. Let's tighten our timing.`,
            names: [a1, a2, b1, b2]
          }, 'brand');
          markSeen(state, key);
          relMailCount++;
        }
      }
    }
  }

  // (injury attribution handled in runShow)

  // ---------- Squash complaints ----------
  // High-starpower wrestlers who were squashed (direction:'squash') complain.
  // Gives the player a real decision with lasting consequences.
  for (const seg of (results || [])) {
    if (seg?.direction !== 'squash') continue;
    if (!isSingles(seg)) continue;

    const loserName = losersOf(seg)[0];
    if (!loserName) continue;

    const w = (roster).find(x => x.name === loserName);
    if (!w || (w.starpower ?? 0) < 70) continue; // low-card workers don't complain

    const key = `squash:${brand}:${state.week}:${loserName}`;
    if (wasSeen(state, key)) continue;

    pushInbox(state, brand, {
      from: loserName,
      title: 'Unhappy With My Booking',
      body: `I was booked to get squashed this week. That's not what I signed up for. I need to know where I stand.`,
      names: [loserName],
      actions: [
        {
          key: 'PROMISE_PUSH',
          label: 'PROMISE A FEATURED SPOT NEXT WEEK',
          effects: [
            { kind: 'w', name: loserName, stat: 'morale', delta: +5 },
            {
              kind: 'promise', type: 'matchNextWeek', brand, names: [loserName], weeks: 1,
              onKeep:  { kind: 'w', name: loserName, stat: 'morale', delta: +8 },
              onBreak: { kind: 'w', name: loserName, stat: 'morale', delta: -12 }
            }
          ]
        },
        {
          key: 'STAND_FIRM',
          label: 'STAND FIRM -- IT WAS CREATIVE\'S CALL',
          effects: [
            { kind: 'w', name: loserName, stat: 'morale', delta: -4 }
          ]
        }
      ]
    }, 'brand');

    markSeen(state, key);
  }
}

// Alias
export { processDynamicInboxEvents as generateInboxEvents };
