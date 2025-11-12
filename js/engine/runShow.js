// public/js/engine/runShow.js
import {
  SEGMENTS, SEGMENT_WEIGHTS, TITLE_ALLOWED_ON,
  REPEAT_PENALTY, STORY_PROMO_BONUS,
  TV, clamp, el, setEq, avg, r
} from '../util.js';
import { HOT, CROWD, MAIN_EVENT, FATIGUE, INJURY } from './constants.js';
import { getW, byBrand, keyFromNames } from './helpers.js';
import { simulateMatch } from './simulate.js';
import { applyStoryProgression, applyStoryEcosystemEffects, getStory, decayStories, inAnyStory } from './story.js';
import { decayAllChemistry } from './chemistry.js';
import { applyChampionAuraDrift } from './champions.js';
import {
  computeAfterglowTVBump,
  rateToBlurb,
  matchSummary,
  promoScoreFor,
  isHotSingles,
  isHotTag
} from './ratings.js';
import { generateInboxEvents } from './inbox.js';
import { decayRelationships } from './relationships.js';
import { applyWeeklyProgression } from './progression.js';
import { processRetirements } from './retirement.js';
import { applyMentorships } from './mentorships.js';
import { snapshotWeekBaselineOnce } from './snapshots.js';
import { applyPostMatchEffects } from './state_effects.js';
import { BAL } from './balance.js';

// ------------------ local date helpers (DD-MM-YYYY) ------------------
function pad2(n){ return String(n).padStart(2,'0'); }
function addDaysDDMMYYYY(s, days){
  try{
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
    if(!m) throw new Error('bad date');
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
    d.setDate(d.getDate()+Number(days||0));
    return `${pad2(d.getDate())}-${pad2(d.getMonth()+1)}-${d.getFullYear()}`;
  }catch{ return s; }
}

// ------------------------- promo helper -------------------------
function applyPromoEffects(state, speakerName, seg){
  const w = (state.roster || []).find(x => x.name === speakerName);
  if (!w) return;

  const mic = w.mic ?? 60;
  const cha = w.charisma ?? 60;
  const promoScore = Math.round(mic * BAL.PROMO.mic + cha * BAL.PROMO.charisma);

  // Threshold: only good promos move the needle
  if (promoScore >= 70) {
    const before = w.momentum ?? 60;
    const delta  = BAL.PROMO.momentumBoost;
    w.momentum   = clamp(before + delta, 1, 99);

    // annotate for details/debug
    seg.debug = seg.debug || {};
    seg.debug.promo = { promoScore, momentumDelta: { [speakerName]: delta } };

    // set a default copy if booking didn't provide one
    if (!seg.text) {
      seg.text = `${speakerName} cuts a promo. Crowd pops (+Like/Momentum).`;
    }
  }
}

// ------------------- Hash-based match IDs -------------------
function fnv1a(str){
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    // h *= 16777619 (via shifts to keep it 32-bit)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
}
function simDateYMD(state){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(state.startDate||'01-04-2001'));
  if (!m) return '20010401';
  return `${m[3]}${m[2]}${m[1]}`;
}
function makeMatchId(state, brand, segKey, namesArr){
  state.matchSeq = (state.matchSeq|0) || 1;
  const ymd  = simDateYMD(state);
  const seed = `${ymd}|${brand}|${segKey}|${(namesArr||[]).join('|')}|${state.matchSeq}`;
  const hash = fnv1a(seed);
  const code = state.matchSeq.toString(36).toUpperCase();
  const id   = `M${ymd}-${hash}-${code}`;
  state.matchSeq += 1;
  return id;
}

// ----------------------------- main -----------------------------
export function runShow(state, brand, booking){
  // Ensure stores exist (must be INSIDE the function — state is an arg)
  state.matches = state.matches || {};
  state.matchSeq = state.matchSeq || 1;
  state.matchHistory = state.matchHistory || {};
  state.matchHistory[brand] = state.matchHistory[brand] || [];
  state.lastWeekKeys = state.lastWeekKeys || {};
  state.afterglow = state.afterglow || { RAW:0, SD:0, ttl:{RAW:0,SD:0} };
  state.hotMatches = state.hotMatches || {};

  // Baseline snapshot BEFORE any per-week changes (for profile arrows)
  snapshotWeekBaselineOnce(state);

  const results = [];
  const usedNames = new Set();
  let showScore = 0;

  const weekKeys = [];
  const lastKeys = state.lastWeekKeys[brand] || [];
  let openerScore = null, mainEventScore = null;
  let matchScores = [];
  let veryHotCount = 0, hotCount = 0;

  for (const seg of SEGMENTS) {
    const s = booking[seg.key];
    if (!s) continue;

    const weight = SEGMENT_WEIGHTS[seg.key] || 1.0;

    let segScore = 0;
    let text = "";
    let tags = [];
    let summary = "";
    let simRes = null;

    // normalized details/debug object
    let det = null;
    let matchId = null;

    if (s.type === "promo") {
      const sp = getW(state, s.speaker);
      if (!sp) continue;

      // Use the new helper to grant momentum and set default text if needed
      applyPromoEffects(state, sp.name, s);

      // Score still comes from ratings function (with story bonus)
      const promoStoryBonus = inAnyStory(state, brand, sp.name) ? STORY_PROMO_BONUS : 0;
      segScore = promoScoreFor(sp, promoStoryBonus);

      text = s.text || `${sp.name} cuts a promo. Crowd pops (+Like/Momentum).`;
      summary = `${sp.name} hyped the crowd.`;

      usedNames.add(sp.name);

    } else if (s.type === "singles") {
      const A = getW(state, s.a), B = getW(state, s.b);
      if (!A || !B) return { error: `${seg.key}: Missing wrestlers.` };
      if (A.injuryWeeks > 0 || B.injuryWeeks > 0) return { error: `${seg.key}: Injured wrestler booked.` };
      if (A.gender !== B.gender) return { error: `${seg.key}: Mixed-gender singles is not allowed.` };

      const isTitle = !!s.championship && TITLE_ALLOWED_ON.has(seg.key);
      simRes = simulateMatch(state, [A, B], seg.key, isTitle ? { brand, title: s.championship } : null, brand);

      det = simRes?.debug || simRes?.explain || {};
      det.type = 'singles';
      det.segmentKey = seg.key;
      det.title = isTitle ? s.championship : null;
      det.week = state.week;
      det.date = state.startDate;
      det.brand = brand;

      segScore = simRes.rating;
      text = simRes.text;
      tags = simRes.tags || [];

      const namesArr = [A.name, B.name];
      const pairings = [[A.name, B.name]];
      const k = keyFromNames(namesArr);
      summary = matchSummary(segScore, namesArr, tags);

      weekKeys.push(k);
      usedNames.add(A.name); usedNames.add(B.name);

      const wasHot = isHotSingles(A, B, segScore);
      if (wasHot) {
        tags.push("hot match");
        state.hotMatches[k] = { ttl: HOT.TTL };
      }

      let repeatPenaltyApplied = 0;
      const isRepeat = lastKeys.includes(k);
      const hasImmunity = !!state.hotMatches[k];
      if (isRepeat && !hasImmunity) {
        const hasStory = !!getStory(state, brand, namesArr);
        const pen = Math.round(segScore * (hasStory ? REPEAT_PENALTY / 2 : REPEAT_PENALTY));
        segScore -= pen;
        repeatPenaltyApplied = pen;
        tags.push(`repeat -${pen}${hasStory ? ' (story)' : ''}`);
        if (det) det.repeatPenalty = pen;
      } else if (isRepeat && hasImmunity) {
        tags.push("hot rematch (no penalty)");
      }

      const winners = (simRes?.explain?.winners || []).slice();
      const storyProgress = applyStoryProgression(state, brand, namesArr, {
        rating: segScore,
        hot: wasHot,
        repeatPenalty: repeatPenaltyApplied
      });
      if (storyProgress) {
        if (storyProgress.delta > 0) tags.push(`story heat +${storyProgress.delta}`);
        else if (storyProgress.delta < 0) tags.push(`story heat ${storyProgress.delta}`);

        const eco = applyStoryEcosystemEffects(state, brand, storyProgress, {
          rating: segScore,
          winners,
          participants: namesArr,
          pairings
        });
        if (det) {
          det.storyHeat = {
            before: storyProgress.before,
            after: storyProgress.after,
            delta: storyProgress.delta,
            applied: storyProgress.appliedDelta,
            tier: eco?.tier ?? null,
            tierDelta: eco?.tierDelta ?? null,
            morale: eco?.moraleChanges || null,
            rivalry: eco?.rivalryChanges || null
          };
        }
      }

      // Hashed match ID
      matchId = makeMatchId(state, brand, seg.key, namesArr);
      if (det){
        det.id = matchId;
        det.names = namesArr;
      }

    } else if (s.type === "tag") {
      const A1 = getW(state, s.teams[0][0]),
            A2 = getW(state, s.teams[0][1]),
            B1 = getW(state, s.teams[1][0]),
            B2 = getW(state, s.teams[1][1]);

      if (!(A1 && A2 && B1 && B2)) return { error: `${seg.key}: Tag needs four wrestlers.` };
      if ([A1, A2, B1, B2].some(w => w.injuryWeeks > 0)) return { error: `${seg.key}: Injured wrestler booked.` };
      const g = A1.gender;
      if ([A2, B1, B2].some(w => w.gender !== g)) return { error: `${seg.key}: Tag must be all same gender.` };

      const isTitle = !!s.championship && TITLE_ALLOWED_ON.has(seg.key);
      simRes = simulateMatch(
        state, [A1, A2, B1, B2], seg.key,
        isTitle ? { brand, title: s.championship } : null,
        brand, true
      );

      det = simRes?.debug || simRes?.explain || {};
      det.type = 'tag';
      det.segmentKey = seg.key;
      det.title = isTitle ? s.championship : null;
      det.week = state.week;
      det.date = state.startDate;
      det.brand = brand;

      segScore = simRes.rating;
      text = simRes.text;
      tags = simRes.tags || [];

      const namesArr = [A1.name, A2.name, B1.name, B2.name];
      const pairings = [[A1.name, B1.name], [A2.name, B2.name]];
      const k = keyFromNames(namesArr);
      summary = matchSummary(segScore, namesArr, tags);

      weekKeys.push(k);
      [A1, A2, B1, B2].forEach(w => usedNames.add(w.name));

      const wasHot = isHotTag(A1, A2, B1, B2, segScore);
      if (wasHot) {
        tags.push("hot match");
        state.hotMatches[k] = { ttl: HOT.TTL };
      }

      let repeatPenaltyApplied = 0;
      const isRepeat = lastKeys.includes(k);
      const hasImmunity = !!state.hotMatches[k];
      if (isRepeat && !hasImmunity) {
        const hasStory = !!getStory(state, brand, namesArr);
        const pen = Math.round(segScore * (hasStory ? REPEAT_PENALTY / 2 : REPEAT_PENALTY));
        segScore -= pen;
        repeatPenaltyApplied = pen;
        tags.push(`repeat -${pen}${hasStory ? ' (story)' : ''}`);
        if (det) det.repeatPenalty = pen;
      } else if (isRepeat && hasImmunity) {
        tags.push("hot rematch (no penalty)");
      }

      const winners = (simRes?.explain?.winners || []).slice();
      const storyProgress = applyStoryProgression(state, brand, namesArr, {
        rating: segScore,
        hot: wasHot,
        repeatPenalty: repeatPenaltyApplied
      });
      if (storyProgress) {
        if (storyProgress.delta > 0) tags.push(`story heat +${storyProgress.delta}`);
        else if (storyProgress.delta < 0) tags.push(`story heat ${storyProgress.delta}`);

        const eco = applyStoryEcosystemEffects(state, brand, storyProgress, {
          rating: segScore,
          winners,
          participants: namesArr,
          pairings
        });
        if (det) {
          det.storyHeat = {
            before: storyProgress.before,
            after: storyProgress.after,
            delta: storyProgress.delta,
            applied: storyProgress.appliedDelta,
            tier: eco?.tier ?? null,
            tierDelta: eco?.tierDelta ?? null,
            morale: eco?.moraleChanges || null,
            rivalry: eco?.rivalryChanges || null
          };
        }
      }

      // Hashed match ID
      matchId = makeMatchId(state, brand, seg.key, namesArr);
      if (det){
        det.id = matchId;
        det.names = namesArr;
      }
    }

    // Tally & record the segment
    showScore += Math.max(10, Math.round(segScore * weight));

    // Persist details for deep-link (matches only)
    if (matchId){
      state.matches[matchId] = {
        id: matchId,
        week: state.week,
        date: state.startDate,
        brand,
        segment: seg.key,
        type: (det && det.type) || s.type,
        title: det?.title || null,
        names: det?.names || [],
        rating: Math.max(10, Math.round(segScore)),
        text,
        tags: [...tags],
        summary,
        details: det || null
      };
    }

    results.push({
      id: matchId,                     // null for promos
      seg: seg.key,
      type: s.type,
      score: Math.max(10, Math.round(segScore)),
      text,
      tags,
      summary,
      names: det?.names || simRes?.namesArr || [],
      explain: det || null             // keep "explain" key for UI
    });

    // Track opener/ME/hotness
    if (s.type === "singles" || s.type === "tag") {
      matchScores.push(segScore);
      if (seg.key === "Opener")     openerScore = segScore;
      if (seg.key === "MainEvent")  mainEventScore = segScore;
      if (segScore >= CROWD.VERY_HOT_SEG) veryHotCount++;
      else if (segScore >= CROWD.HOT_SEG) hotCount++;
    }
  }

  // ---------- FIX: apply post-match effects per match ----------
  for (const res of results) {
    if (res.type === 'singles' || res.type === 'tag') {
      applyPostMatchEffects(state, {
        ids: res.id,
        names: res.names || [],
        winners: res.explain?.winners || [],
        isTitle: !!res.explain?.title,
        segment: res.seg,
        longMatch: res.explain?.long === true,
      });
    }
  }

  // Storylines & chemistry decay
  decayStories(state);
  decayAllChemistry(state);
  decayRelationships(state);

  // Star draw bonus
  const appeared = [...usedNames].map(n => getW(state, n)).filter(Boolean);
  if (appeared.length) {
    const top = appeared
      .sort((a, b) => (b.starpower + b.likeability * 0.3) - (a.starpower + a.likeability * 0.3))
      .slice(0, TV.STAR_DRAW_TOPN);
    const draw = avg(top.map(w => w.starpower));
    const drawBonus = Math.round(draw * TV.STAR_DRAW_FACTOR);
    showScore += drawBonus;
  }
  const aura = applyChampionAuraDrift(state, brand);

  // Underwhelming main event penalty
  if (mainEventScore != null && matchScores.length > 1) {
    const others = matchScores.filter(x => x !== mainEventScore);
    const avgOthers = Math.round(others.reduce((a,b)=>a+b,0) / others.length);
    const flat = mainEventScore < MAIN_EVENT.FLAT_FLOOR;
    const deltaFail = mainEventScore + MAIN_EVENT.UNDERWHELM_DELTA < avgOthers;
    if (flat || deltaFail) {
      showScore += MAIN_EVENT.PENALTY;
      const last = results.find(r => r.seg === "MainEvent");
      if (last) last.tags.push('underwhelming main event');
    }
  }

  // Base TV rating
  const totalW = Object.values(SEGMENT_WEIGHTS).reduce((a,b)=>a+b,0);
  const weightedAvg = showScore / (totalW || 1);
  let tvRating = Math.round((weightedAvg - TV.BASELINE) / TV.SCALE);

  // Crowd afterglow (carry-over boost next week)
  const level = (veryHotCount >= 1) ? 2 : (hotCount >= 2 ? 1 : 0);
  if (level > 0) {
    state.afterglow[brand] = level;
    state.afterglow.ttl[brand] = CROWD.AFTERGLOW_TTL;
  }

  // Apply afterglow bump to the final TV number and attach note
  const { bump: afterglowBump, note: afterglowNote } = computeAfterglowTVBump(results);
  tvRating = clamp(tvRating + afterglowBump, 1, 10);

  // Weekly progression once (attributes, age effects, etc.)
  applyWeeklyProgression(state, brand, results, appeared);

  // Mentorship ticks (may or may not proc on a given week)
  const mentored = applyMentorships(state, brand) || [];
  if (Array.isArray(state.inbox) && Array.isArray(mentored) && mentored.length){
    state.inbox.unshift({
      from: 'Coaches Room',
      title: 'Mentorship Update',
      body: mentored.join('\n')
    });
  }

  // Fatigue / injuries
  const injuries = [];
  byBrand(state, brand).forEach(w => { if (w.injuryWeeks > 0) w.injuryWeeks = Math.max(0, w.injuryWeeks - 1); });

  const appearedSet = new Set(appeared.map(w => w.name));
  byBrand(state, brand).forEach(w => {
    if (w.injuryWeeks > 0) return;
    if (appearedSet.has(w.name)) {
      const mult = results.reduce((m, seg) => {
        return seg.text && seg.text.includes(w.name) ? Math.max(m, FATIGUE.SLOT_MULT[seg.seg] || 1) : m;
      }, 0.8);
      const inc = Math.round(r(...FATIGUE.WRESTLE_BASE_INC) * mult);
      w.fatigue = clamp(w.fatigue + inc, 0, FATIGUE.CAP);
    } else {
      const dec = r(...FATIGUE.REST_DEC);
      w.fatigue = clamp(w.fatigue - dec, 0, FATIGUE.CAP);
    }
  });

  // Create inbox events for this brand based on tonight
  generateInboxEvents(state, brand, results, appeared);

  // Decay one-week hot-match immunities
  for (const k in state.hotMatches) {
    state.hotMatches[k].ttl -= 1;
    if (state.hotMatches[k].ttl <= 0) delete state.hotMatches[k];
  }

  // Injury rolls
  appeared.forEach(w=>{
    if(w.injuryWeeks>0) return;
    const dur = w.durability ?? 70;
    const safety = (w.ringSafety ?? 70);
    const pro    = (w.professionalism ?? 70);
    const fatigueFactor = Math.min(INJURY.CAP, INJURY.BASE + w.fatigue * INJURY.PER_FATIGUE);

    const safetyCut = Math.max(0, (safety-70) * 0.003);
    const proCut    = Math.max(0, (pro-70) * 0.002);
    const safe = Math.max(-0.1, Math.min(0.15, (dur-70)*0.0025 - safetyCut - proCut));

    const p = clamp(fatigueFactor - safe, 0, INJURY.CAP);
    if(Math.random() < p){
      const durW = w.fatigue>=INJURY.HEAVY_AT ? r(...INJURY.DUR_HEAVY)
                : w.fatigue>=INJURY.MED_AT   ? r(...INJURY.DUR_MED)
                : r(...INJURY.DUR_LIGHT);
      w.injuryWeeks = durW;
      injuries.push({ name:w.name, weeks:durW });
      w.fatigue = clamp(Math.max(0, w.fatigue - r(10,18)), 0, FATIGUE.CAP);
    }
  });

  if (injuries.length){
    if (!Array.isArray(state.inbox)) state.inbox = [];
    injuries.forEach(({ name, weeks })=>{
      state.inbox.unshift({
        from: 'Medical',
        title: 'Injury Update',
        body: `${name} suffered an injury and will be out for ${weeks} week(s).`
      });
    });
  }

  // Retirement checks
  const retiredThisWeek = processRetirements(state, brand);

  // Persist a history record so old cards are linkable with details
  state.matchHistory[brand].push({
    week: state.week,
    date: state.startDate,
    tvRating,
    showScore: Math.max(10, Math.round(weightedAvg)),
    segments: results
  });

  // Save keys for next-week repeat penalty
  state.lastWeekKeys[brand] = weekKeys;

  return {
    brand,
    segments: results,
    showScore: Math.max(10, Math.round(weightedAvg)),
    tvRating,
    fanReact: afterglowNote ? `${rateToBlurb(tvRating)} ${afterglowNote}` : rateToBlurb(tvRating),
    matchKeys: weekKeys,
    champPenaltyInfo: { ...aura },
    injuries,
    retiredThisWeek
  };
}

