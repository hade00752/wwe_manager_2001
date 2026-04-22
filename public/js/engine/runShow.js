// public/js/engine/runShow.js
import {
  SEGMENTS, SEGMENT_WEIGHTS, TITLE_ALLOWED_ON,
  REPEAT_PENALTY, STORY_HOT_THRESHOLD, STORY_PROMO_BONUS, STORY_HEAT_ON_HOT,
  TV, clamp, avg, r
} from '../util.js';
import { HOT, CROWD, MAIN_EVENT, FATIGUE, MAIN_EVENT_KEY as BAL_ME_KEY } from './balance.js';
import { BAL } from './balance.js';
import { getW, byBrand, keyFromNames } from './helpers.js';
import { applyEffects } from './state_effects.js';
import { simulateMatch } from './simulate.js';
import { addOrBoostStory, getStory, decayStories, inAnyStory } from './story.js';
import { decayAllChemistry } from './relationships.js';
import {
  applyChampionAuraDrift,
  titleWeight,
  isTitleTagChange,
  isTitleTagDefense,
  capNeg,
  applyForcedOutcome,
  applyForcedTitleResult
} from './champions.js';
import {
  computeAfterglowTVBump,
  rateToBlurb,
  matchSummary,
  promoScoreFor,
  isHotSingles
} from './ratings.js';
import { decayRelationships } from './relationships.js';
import { applyWeeklyProgression } from './progression.js';
import { processRetirements } from './retirement.js';
import { applyMentorships } from './mentorships.js';
import { applyMoraleHooks, computeTraitPairDelta } from './traits.js';
import { snapshotWeekBaselineOnce, getBaselineValues, computeAttrDeltas } from './attr_ledger.js';
import { generateScenarioEvents } from './scenarios.js';
import { processDynamicInboxEvents, resolveOpenPromises } from './inbox_dynamic.js';
import { applyAttrDelta, captureWeeklySnapshot, ensureAttrStores } from './attr_ledger.js';
import { ensureInboxStores, pushInbox, rebuildInboxView, flushLegacyInboxToAll } from './inbox_store.js';
import {
  applyOutcomeSideEffects,
  applyChampionLeftOffShowPenalty,
  computeChampionOffShowRatingPenalty
} from './state_effects.js';
import { rollAndApplyMatchInjury, tickInjuriesWeekly } from './injuries.js';
import { wrapInboxSituations } from './inbox_situations.js';
import { autoResolveNonPlayerInbox } from './ai_inbox.js';
import { getActivePPV, getNextPPV, ppvScoreBoost, ppvTierLabel, PPV_WARN_WEEKS } from './ppv.js';
import { refreshSocialGroups, groupBookingEffect, processGroupPolitics } from './social_groups.js';

console.log('RUNSHOW LOADED ✅', new Date().toISOString());
console.log('RUNSHOW LOADED: 2026-01-23 A');

const MAIN_EVENT_KEY = BAL_ME_KEY;

function mergeExplain(simRes, fallback = {}) {
  const base = { ...(simRes?.explain || {}), ...(simRes?.debug || {}), ...fallback };
  if (Array.isArray(simRes?.attrEffects) && !Array.isArray(base.attrEffects)) {
    base.attrEffects = simRes.attrEffects.slice();
  }
  if (simRes?.momentumDelta != null && base.momentumDelta == null) {
    base.momentumDelta = simRes.momentumDelta;
  }
  return base;
}

// ---- NEW: compact audit helpers -----------------------------------------
function pickAuditAttrs(w) {
  if (!w) return null;
  return {
    morale: clamp(Number(w.morale ?? 65), 0, 100),
    momentum: clamp(Number(w.momentum ?? 50), 0, 99),
    starpower: clamp(Number(w.starpower ?? 50), 0, 99),
    reputation: clamp(Number(w.reputation ?? 50), 0, 99),
    likeability: clamp(Number(w.likeability ?? 50), 0, 99),
    fatigue: clamp(Number(w.fatigue ?? 0), 0, 99),
  };
}

function diffAudit(before, after) {
  if (!before || !after) return null;
  const d = {};
  for (const k of Object.keys(before)) {
    const bv = Number(before[k]);
    const av = Number(after[k]);
    if (Number.isFinite(bv) && Number.isFinite(av)) {
      const delta = av - bv;
      if (delta !== 0) d[k] = delta;
    }
  }
  return d;
}

/* ------------------------------------------------------------------------ */
/* NEW: Relationship/Chemistry bridge for scoring (SYNC, in-memory only)    */
/* ------------------------------------------------------------------------ */

// DB uses 0 as "unset" sometimes; treat 0 as neutral 50 for chemistry math.
function pressureEff(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return 50;
  return (v === 0) ? 50 : clamp(v, 0, 100);
}

function relKey(a, b) {
  return [String(a), String(b)].sort().join('::');
}

function countOverlap(a = [], b = []) {
  const setB = new Set(b || []);
  let n = 0;
  for (const x of (a || [])) if (setB.has(x)) n++;
  return n;
}

function dynamicChemFromContext({
  rapport, pressure,
  selfStyleTags = [], otherStyleTags = [],
  traitDelta = null,
  alignmentA = null, alignmentB = null
}) {
  const rap = clamp(Number(rapport || 0), -50, 50);
  const p = pressureEff(pressure);

  let score = 0;

  // 1) Base from rapport
  score += rap * 1.6;

  // 2) Style synergy
  const shared = countOverlap(selfStyleTags, otherStyleTags);
  score += clamp(shared, 0, 3) * 8;

  const has = (arr, v) => (arr || []).includes(v);
  const complementary =
    (has(selfStyleTags, 'HighFlyer') && has(otherStyleTags, 'Powerhouse')) ||
    (has(selfStyleTags, 'Powerhouse') && has(otherStyleTags, 'HighFlyer')) ||
    (has(selfStyleTags, 'Technician') && has(otherStyleTags, 'Brawler')) ||
    (has(selfStyleTags, 'Brawler') && has(otherStyleTags, 'Technician')) ||
    (has(selfStyleTags, 'TagSpecialist') && has(otherStyleTags, 'TagSpecialist'));
  if (complementary) score += 8;

  // 3) Trait synergy
  if (traitDelta) {
    score += Number(traitDelta.trustDelta || 0) * 1.2;
    score += Number(traitDelta.respectDelta || 0) * 0.8;
  }

  // 4) Pressure term: meaningful only if something is happening
  const pres = (p - 50) / 50; // -1..+1
  const hasSignal = (rap !== 0) || (p !== 50) || shared > 0 || !!traitDelta;
  if (hasSignal) {
    score += pres * (rap < 0 ? -28 : +18);
  }

  // 5) Alignment micro-effect (tiny)
  if (alignmentA && alignmentB && alignmentA !== alignmentB) score += 2;

  return clamp(Math.round(score), -100, 100);
}

function getPair(state, aName, bName) {
  const store = state?.relPairs || {};
  return store[relKey(aName, bName)] || null;
}

function traitDeltaBetween(aW, bW) {
  try {
    if (!computeTraitPairDelta) return null;
    const aT = aW?.traits || { core: [], status: [], rare: [] };
    const bT = bW?.traits || { core: [], status: [], rare: [] };
    return computeTraitPairDelta(aT, bT) || null;
  } catch {
    return null;
  }
}

function rapportApproxFromPair(pair) {
  // Legacy pair system uses trust/respect; approximate rapport with trust+respect.
  const t = Number(pair?.trust || 0);
  const r2 = Number(pair?.respect || 0);
  return clamp(Math.round(t + r2), -50, 50);
}

function chemPtsFromDynChem(dynChem) {
  // Map -100..100 -> about -12..+12 points. Keeps chemistry meaningful but not absurd.
  const x = Number(dynChem || 0);
  return clamp(Math.round(x / 8), -12, 12);
}

function computeSinglesChem(state, aW, bW) {
  const pair = getPair(state, aW?.name, bW?.name);
  const rapport = pair ? rapportApproxFromPair(pair) : 0;
  const pressure = pair ? pair.pressure : 0;

  const delta = traitDeltaBetween(aW, bW);
  const dynChem = dynamicChemFromContext({
    rapport,
    pressure,
    selfStyleTags: aW?.styleTags || [],
    otherStyleTags: bW?.styleTags || [],
    traitDelta: delta,
    alignmentA: aW?.alignment,
    alignmentB: bW?.alignment
  });

  const chemPts = chemPtsFromDynChem(dynChem);

  return {
    dynChem,
    chemPts,
    relBonus: chemPts,
    relMeta: {
      mode: 'singles',
      source: pair ? 'relPairs' : 'none',
      rapportApprox: rapport,
      pressureRaw: pair ? (pair.pressure ?? 0) : 0,
      pressureEff: pressureEff(pressure),
      styleA: (aW?.styleTags || []).slice(),
      styleB: (bW?.styleTags || []).slice(),
      sharedStyle: countOverlap(aW?.styleTags || [], bW?.styleTags || []),
      alignmentA: aW?.alignment || null,
      alignmentB: bW?.alignment || null,
      traitDelta: delta
    }
  };
}

function computeTagChem(state, A1, A2, B1, B2) {
  // Teammate synergy is positive; cross-team friction reduces it slightly.
  const tA = computeSinglesChem(state, A1, A2);
  const tB = computeSinglesChem(state, B1, B2);

  const cross = [
    computeSinglesChem(state, A1, B1),
    computeSinglesChem(state, A1, B2),
    computeSinglesChem(state, A2, B1),
    computeSinglesChem(state, A2, B2),
  ];

  const teamChem = Math.round(avg([tA.dynChem, tB.dynChem]));
  const crossChem = Math.round(avg(cross.map(x => x.dynChem)));

  const dynChem = clamp(Math.round(teamChem - (crossChem * 0.5)), -100, 100);
  const chemPts = chemPtsFromDynChem(dynChem);

  return {
    dynChem,
    chemPts,
    relBonus: chemPts,
    relMeta: {
      mode: 'tag',
      team: { A: tA.relMeta, B: tB.relMeta },
      crossAvgDynChem: crossChem,
      teamAvgDynChem: teamChem
    }
  };
}

/* --------------------------------- main --------------------------------- */
// ✅ BACK TO SYNC: your UI expects an object, not a Promise
export function runShow(state, brand, booking) {
  state.roster = (state.roster || []).filter(Boolean);

  state.matches = state.matches || {};
  state.matchSeq = state.matchSeq || 1;
  state.matchHistory = state.matchHistory || {};
  state.matchHistory[brand] = state.matchHistory[brand] || [];
  state.lastWeekKeys = state.lastWeekKeys || {};
  state.afterglow = state.afterglow || { RAW: 0, SD: 0, ttl: { RAW: 0, SD: 0 } };
  state.hotMatches = state.hotMatches || {};
  state.snapshots = state.snapshots || {};
  ensureAttrStores(state);

  // Inbox init + sweep anything that landed in legacy inbox before this run
  ensureInboxStores(state);
  flushLegacyInboxToAll(state, brand);

  snapshotWeekBaselineOnce(state);

  // ✅ Social groups: recompute once per week (both brands share one pass)
  try {
    const needsRefresh = !state.socialGroups?._computedWeek || state.socialGroups._computedWeek !== state.week;
    if (needsRefresh) {
      refreshSocialGroups(state);
      state.socialGroups._computedWeek = state.week;
    }
  } catch (e) { console.warn('[runShow] social groups refresh failed (soft):', e); }

  // ✅ Injury weekly tick (ONCE per brand per week)
  state._injuryTickWeekByBrand = state._injuryTickWeekByBrand || {};
  if (state._injuryTickWeekByBrand[brand] !== state.week) {
    state._injuryTickWeekByBrand[brand] = state.week;

    try {
      tickInjuriesWeekly(state, brand, (st, b, msg) => {
        pushInbox(st, b, msg, 'brand');
      });
    } catch (e) {
      console.warn('[runShow] tickInjuriesWeekly failed (soft):', e);
    }
  }

  const results = [];
  const booked = new Set();
  let showScore = 0;

  // ✅ accumulate injuries surfaced during this show
  const injuriesThisShow = [];

  // 🔒 Morale preservation: track anyone whose morale we touched this show,
  // then protect their morale value across applyWeeklyProgression.
  const moraleTouched = new Set();
  const markMoraleTouched = (name) => { if (name) moraleTouched.add(name); };

  const weekKeys = [];
  const hotPairs = [];
  const lastKeys = state.lastWeekKeys[brand] || [];
  let mainEventScore = null;
  const matchScores = [];
  let veryHotCount = 0, hotCount = 0;

  for (const seg of SEGMENTS) {
    const s = booking && booking[seg.key];
    if (!s) continue;

    const weight = SEGMENT_WEIGHTS[seg.key] || 1.0;

    let segScore = 0;
    let text = "";
    let tags = [];
    let summary = "";
    let simRes = null;
    let det = null;
    let matchId = null;

    if (s.type === "promo") {
      const sp = getW(state, s.speaker);
      if (!sp) continue;

      booked.add(sp.name);

      const promoStoryBonus = inAnyStory(state, brand, sp.name) ? STORY_PROMO_BONUS : 0;
      const pScore = promoScoreFor(sp, promoStoryBonus);
      sp.likeability = clamp(sp.likeability + Math.round((pScore - 60) / 10), 0, 99);
      sp.momentum = clamp(sp.momentum + Math.round((pScore - 60) / 12), 0, 99);

      // small morale acknowledgement for a solid promo
      if (pScore >= 70) {
        const before = (sp.morale ?? 65);
        sp.morale = clamp(before + 1, 0, 100);
        if (sp.morale !== before) markMoraleTouched(sp.name);
      }

      // Trait morale hook for promos (light touch, but makes traits matter)
      try {
        const before = (sp.morale ?? 65);
        const delta = applyMoraleHooks(sp, {
          mainEvented: (seg.key === MAIN_EVENT_KEY),
          jobbed: false, jobLoss: 0,
          longMatch: false, offShow: false,
          isPromo: true
        });
        if ((sp.morale ?? 65) !== before || (delta | 0) !== 0) markMoraleTouched(sp.name);
      } catch (e) {
        console.warn('[runShow] applyMoraleHooks(promo) failed (soft):', e);
      }

      segScore = pScore;
      text = `${s.speaker} cuts a promo. Crowd pops (+Like/Momentum).`;
      summary = `${s.speaker} hyped the crowd.`;

    } else if (s.type === "singles" || s.type === "tag") {
      const isTag = s.type === 'tag';

      // Gather wrestlers
      let namesArr;
      let A = null, B = null;
      let A1 = null, A2 = null, B1 = null, B2 = null;

      if (!isTag) {
        A = getW(state, s.a);
        B = getW(state, s.b);
        if (!(A && B)) return { error: `${seg.key}: Missing wrestlers.` };
        if ((A.injuryWeeks | 0) > 0 || (B.injuryWeeks | 0) > 0) return { error: `${seg.key}: Injured wrestler booked.` };
        if (A.gender !== B.gender) return { error: `${seg.key}: Mixed-gender singles is not allowed.` };
        namesArr = [A.name, B.name];
      } else {
        A1 = getW(state, s.teams[0][0]);
        A2 = getW(state, s.teams[0][1]);
        B1 = getW(state, s.teams[1][0]);
        B2 = getW(state, s.teams[1][1]);
        if (!(A1 && A2 && B1 && B2)) return { error: `${seg.key}: Tag needs four wrestlers.` };
        if ([A1, A2, B1, B2].some(w => (w.injuryWeeks | 0) > 0)) return { error: `${seg.key}: Injured wrestler booked.` };
        const g = A1.gender;
        if ([A2, B1, B2].some(w => w.gender !== g)) return { error: `${seg.key}: Tag must be all same gender.` };
        namesArr = [A1.name, A2.name, B1.name, B2.name];
      }

      namesArr.forEach(n => booked.add(n));

      const isTitle = !!s.championship && TITLE_ALLOWED_ON.has(seg.key);
      const champsBefore = isTitle ? JSON.parse(JSON.stringify(state.champs)) : null;

      const outcomeCode = s.outcome || 'ENG';      // ENG | A | B | TeamA | TeamB | NC
      const finishType  = s.finish || 'clean';     // clean | dirty (legacy)
      const direction   = s.direction || finishType; // clean | dirty | squash | protect

      // ---- NEW: capture pre-match audit snapshot ------------------------
      const auditBefore = {};
      for (const n of namesArr) {
        auditBefore[n] = pickAuditAttrs(getW(state, n));
      }

      simRes = simulateMatch(
        state,
        namesArr.map(n => getW(state, n)),
        seg.key,
        isTitle ? { brand, title: s.championship } : null,
        brand,
        isTag
      );

      segScore = simRes.rating;
      text = simRes.text;
      tags = simRes.tags || [];

      // Direction modifier (from BAL.DIRECTION — squash +3, protect -4, etc.)
      const dirMod = BAL?.DIRECTION?.[direction]?.score ?? 0;
      if (dirMod !== 0) {
        segScore = clamp(segScore + dirMod, 10, 99);
        tags.push(`direction:${direction}`);
      }

      // ------------------------------------------------------------------
      // Chemistry forensics only — simulate.js already applied chemPts
      // inside rateSinglesLikeTV. Do NOT add to segScore here (double-count).
      // ------------------------------------------------------------------
      const relComputed = !isTag
        ? computeSinglesChem(state, A, B)
        : computeTagChem(state, A1, A2, B1, B2);

      const baseChem = relComputed?.dynChem ?? 0;
      const chemPts  = relComputed?.chemPts ?? 0;
      const relBonus = relComputed?.relBonus ?? 0;
      const relMeta  = relComputed?.relMeta ?? { mode: isTag ? 'tag' : 'singles', source: 'none' };

      // display tag only (no score mutation)
      if (chemPts !== 0) tags.push(`chem ${chemPts > 0 ? '+' : ''}${chemPts}`);

      const k = keyFromNames(namesArr);
      summary = matchSummary(segScore, namesArr, tags);

      weekKeys.push(k);

      if (segScore >= STORY_HOT_THRESHOLD) hotPairs.push(namesArr);
      if (!isTag && isHotSingles(getW(state, namesArr[0]), getW(state, namesArr[1]), segScore)) {
        tags.push("hot match");
        state.hotMatches[k] = { ttl: HOT.TTL };
        addOrBoostStory(state, brand, namesArr, Math.ceil(STORY_HEAT_ON_HOT / 2));
      }

      const isRepeat = lastKeys.includes(k);
      const hasImmunity = !!state.hotMatches[k];
      if (isRepeat && !hasImmunity) {
        const hasStory = !!getStory(state, brand, namesArr);
        const pen = Math.round(segScore * (hasStory ? REPEAT_PENALTY / 2 : REPEAT_PENALTY));
        segScore -= pen;
        tags.push(`repeat -${pen}${hasStory ? ' (story)' : ''}`);
      } else if (isRepeat && hasImmunity) {
        tags.push("hot rematch (no penalty)");
      }

      matchId = `M${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      const tWeight = isTitle ? titleWeight(s.championship) : 0;
      const titleChanged = isTitle ? isTitleTagChange(tags) : false;
      const titleDefense = isTitle ? isTitleTagDefense(tags) : false;
      const titleApplied = !!simRes?.explain?.titleApplied || isTitle; // conservative

      det = mergeExplain(simRes, {
        type: isTag ? 'tag' : 'singles',
        segmentKey: seg.key,
        title: isTitle ? s.championship : null,
        titleWeight: tWeight,
        titleApplied,
        titleChanged,
        titleDefense,
        week: state.week,
        date: state.startDate,
        brand,
        id: matchId,
        names: namesArr.slice(),
        // NEW: relationship/chem forensic fields
        baseChem,
        chemPts,
        relBonus,
        relMeta
      });

      // Determine winners/losers robustly
      let winners = [];
      let losers = [];
      let noContest = false;

      const forced = applyForcedOutcome(namesArr, outcomeCode, isTag);
      if (forced && forced.nocontest) {
        noContest = true;
        winners = [];
        losers = [];
        if (champsBefore) state.champs = champsBefore;
        tags = tags.filter(t => t !== 'title change!');
        tags.push('no contest');
      } else if (forced) {
        winners = forced.winners.slice();
        losers = forced.losers.slice();
        if (finishType === 'dirty') tags.push('dirty finish');
        if (finishType === 'clean') tags.push('clean finish');
      } else {
        if (Array.isArray(simRes?.winners) && simRes.winners.length) winners = simRes.winners.slice();
        if (Array.isArray(simRes?.losers) && simRes.losers.length) losers = simRes.losers.slice();

        if ((!winners.length) && typeof text === 'string') {
          const m = text.match(/^\s*([^\.]+?)\s+defeat(?:s|ed)?\s+([^\.]+?)(?:\.|$)/i);
          if (m) {
            winners = m[1].split('&').map(s => s.trim()).filter(Boolean);
            losers = m[2].split('&').map(s => s.trim()).filter(Boolean);
          }
        }

        if (winners.length && !losers.length) {
          const winSet = new Set(winners);
          losers = namesArr.filter(n => !winSet.has(n));
        }
      }

      if (forced && !noContest) {
        text = `${winners.join(" & ")} defeat ${losers.join(" & ")}.` + (isTitle ? " (Title bout)" : "");
      }

      det.winners = winners.slice();
      det.losers = losers.slice();
      det.finish     = noContest ? 'nocontest' : finishType;
      det.direction  = noContest ? 'nocontest' : direction;

      // ✅ If outcome was forced on a title match, rollback sim title mutation and re-apply based on forced winners
      if (forced && !noContest && isTitle) {
        tags = applyForcedTitleResult({
          state,
          brand,
          title: s.championship,
          champsBefore,
          namesArr,
          winners,
          tags,
          det
        });

        det.titleChanged = !!isTitleTagChange(tags);
        det.titleDefense = !!isTitleTagDefense(tags);
        det.titleApplied = true;
      }

      // ── Apply momentum from simulate.js (this is the ONE place it gets persisted) ──
      if (!noContest && winners.length && losers.length) {
        const mDeltas = simRes?.explain?.momentumDelta || {};
        for (const [name, delta] of Object.entries(mDeltas)) {
          if (!delta) continue;
          const w = getW(state, name);
          if (!w) continue;
          // Scale: main event = full delta, opener = 60%, mid-card slots = 80%
          const slotScale = seg.key === MAIN_EVENT_KEY ? 1.0
                          : seg.key === 'Opener'       ? 0.6
                          : 0.8;
          const scaled = Math.round(delta * slotScale);
          if (scaled) applyAttrDelta(state, state.week, w, 'momentum', scaled,
            `${delta > 0 ? 'Win' : 'Loss'} momentum (${seg.key})`,
            { brand, matchId, seg: seg.key, evt: delta > 0 ? 'win' : 'loss' }
          );
        }
      }

      // Apply side effects + trait morale hooks (only if an actual W/L)
      if (!noContest && winners.length && losers.length) {
        applyOutcomeSideEffects(
          state,
          winners,
          losers,
          finishType,
          markMoraleTouched,
          { matchId, seg: seg.key, vs: namesArr.filter(x => !winners.includes(x)) },
          direction
        );

        const isMain = (seg.key === MAIN_EVENT_KEY);
        const isLong = segScore >= 80;

        const isTitleMatch = !!(det.title);
        const tW = Number(det.titleWeight || 0);
        const didChange = !!det.titleChanged;
        const didDefend = !!det.titleDefense;

        const baseJobLoss = -2;
        const titleJobLoss = isTitleMatch && didChange
          ? capNeg(baseJobLoss - (tW * 2), -10)
          : baseJobLoss;

        console.log(
          '[MORALE@POSTMATCH]',
          seg.key,
          winners.map(n => [n, getW(state, n)?.morale]),
          losers.map(n => [n, getW(state, n)?.morale]),
          { finishType, title: det.title || null, titleChanged: didChange, titleDefense: didDefend, titleWeight: tW }
        );

        // winners
        for (const n of winners) {
          const w = getW(state, n);
          if (!w) continue;
          try {
            const before = (w.morale ?? 65);
            const delta = applyMoraleHooks(w, {
              mainEvented: isMain,
              jobbed: false, jobLoss: 0,
              longMatch: isLong,
              offShow: false,
              isTag,
              isSingles: !isTag,
              isTitle: isTitleMatch,
              titleName: det.title || null,
              titleWeight: tW,
              titleChanged: didChange,
              titleDefense: didDefend,
              titleWin: (isTitleMatch && didChange),
              titleLoss: false,
            });
            if ((w.morale ?? 65) !== before || (delta | 0) !== 0) markMoraleTouched(w.name);
            applyChampionLeftOffShowPenalty(state, brand, w, markMoraleTouched);
          } catch (e) {
            console.warn('[runShow] applyMoraleHooks(winner) failed (soft):', e);
          }
        }

        // losers
        for (const n of losers) {
          const w = getW(state, n);
          if (!w) continue;
          try {
            const beforeMorale = clamp(Number(w.morale ?? 65), 0, 100);
            const beforeMomentum = clamp(Number(w.momentum ?? 50), 0, 99);

            const delta = applyMoraleHooks(w, {
              mainEvented: isMain,
              jobbed: true,
              jobLoss: titleJobLoss,
              longMatch: isLong,
              offShow: false,
              isTag,
              isSingles: !isTag,
              isTitle: isTitleMatch,
              titleName: det.title || null,
              titleWeight: tW,
              titleChanged: didChange,
              titleDefense: false,
              titleWin: false,
              titleLoss: (isTitleMatch && didChange),
            });

            // ---- NEW: title-loss floors (stop "lose belt -> morale up") ----
            if (isTitleMatch && didChange) {
              const afterMorale = clamp(Number(w.morale ?? 65), 0, 100);
              const afterMomentum = clamp(Number(w.momentum ?? 50), 0, 99);

              // Morale cannot increase on title loss (match-level)
              if (afterMorale > beforeMorale) {
                w.morale = beforeMorale;
              }
              // Momentum cannot increase on title loss (match-level)
              if (afterMomentum > beforeMomentum) {
                w.momentum = beforeMomentum;
              }
            }

            if ((w.morale ?? 65) !== beforeMorale || (delta | 0) !== 0) markMoraleTouched(w.name);
          } catch (e) {
            console.warn('[runShow] applyMoraleHooks(loser) failed (soft):', e);
          }
        }

        // ✅ Match-time injuries
        try {
          const isLong = segScore >= 80;
          const notify = (st, b, msg) => pushInbox(st, b, msg, 'brand');

          const injEvents = [];
          for (const victimName of namesArr) {
            const ev = rollAndApplyMatchInjury(
              state,
              victimName,
              {
                brand,
                matchId,
                seg: seg.key,
                finish: noContest ? 'nocontest' : finishType,
                longMatch: !!isLong,
                opponents: namesArr.filter(n => n !== victimName),
                injurerName: null
              },
              notify
            );
            if (ev) injEvents.push(ev);
          }

          if (injEvents.length) {
            injuriesThisShow.push(...injEvents);
            det.injuries = injEvents.map(x => ({ ...x }));
            for (const x of injEvents) {
              const nm = x?.victim || 'Unknown';
              const wk = (x?.weeks ?? 0) | 0;
              tags.push(`injury: ${nm} (${wk}w)`);
            }
          }
        } catch (e) {
          console.warn('[runShow] rollAndApplyMatchInjury failed (soft):', e);
        }
      }

      // ---- NEW: capture post-match audit snapshot + deltas ----------------
      const auditAfter = {};
      const auditDelta = {};
      for (const n of namesArr) {
        auditAfter[n] = pickAuditAttrs(getW(state, n));
        auditDelta[n] = diffAudit(auditBefore[n], auditAfter[n]);
      }
      det.audit = {
        before: auditBefore,
        after: auditAfter,
        delta: auditDelta
      };

      const perMatchBaseline = {};
      namesArr.forEach(n => {
        const v = getBaselineValues(state, n);
        if (v) perMatchBaseline[n] = { values: v };
      });

      state.matches[matchId] = {
        id: matchId,
        week: state.week,
        date: state.startDate,
        brand,
        segment: seg.key,
        type: det.type,
        title: det.title || null,
        names: namesArr.slice(),
        rating: Math.max(10, Math.round(segScore)),
        text,
        tags: [...tags],
        summary,
        details: JSON.parse(JSON.stringify(det)),
        baseline: perMatchBaseline
      };

      results.push({
        id: matchId,
        seg: seg.key,
        type: s.type,
        score: Math.max(10, Math.round(segScore)),
        text,
        tags,
        summary,
        names: namesArr.slice(),
        explain: JSON.parse(JSON.stringify(det))
      });

      if (seg.key === MAIN_EVENT_KEY) mainEventScore = segScore;
      matchScores.push(segScore);
      if (segScore >= CROWD.VERY_HOT_SEG) veryHotCount++;
      else if (segScore >= CROWD.HOT_SEG) hotCount++;
    }

    showScore += Math.max(10, Math.round(segScore * weight));
  }

  hotPairs.forEach(names => addOrBoostStory(state, brand, names, STORY_HOT_THRESHOLD > 0 ? STORY_HEAT_ON_HOT : 0));
  decayStories(state);
  decayAllChemistry(state);
  decayRelationships(state);

  const appearedNames = [...new Set(results.flatMap(r => r.names || []))];
  const appeared = appearedNames.map(n => getW(state, n)).filter(Boolean);

  if (appeared.length) {
    const top = appeared
      .sort((a, b) => (b.starpower + b.likeability * 0.3) - (a.starpower + a.likeability * 0.3))
      .slice(0, TV.STAR_DRAW_TOPN);
    const draw = avg(top.map(w => w.starpower));
    const drawBonus = Math.round(draw * TV.STAR_DRAW_FACTOR);
    showScore += drawBonus;
  }
  applyChampionAuraDrift(state, brand);

  if (mainEventScore != null && matchScores.length > 1) {
    const others = matchScores.filter(x => x !== mainEventScore);
    const avgOthers = Math.round(others.reduce((a, b) => a + b, 0) / others.length);
    const flat = mainEventScore < MAIN_EVENT.FLAT_FLOOR;
    const deltaFail = mainEventScore + MAIN_EVENT.UNDERWHELM_DELTA < avgOthers;
    if (flat || deltaFail) {
      showScore += MAIN_EVENT.PENALTY;
      const last = results.find(r => r.seg === MAIN_EVENT_KEY);
      if (last) last.tags.push('underwhelming main event');
    }
  }

  // ✅ Booker penalty: champs left off the show hurts perception
  const champOff = computeChampionOffShowRatingPenalty(state, brand, booked);
  if (champOff.penalty) {
    showScore += champOff.penalty;

    results.push({
      id: `SYS-CHAMPS-${state.week}-${brand}`,
      seg: 'System',
      type: 'system',
      score: 0,
      text: `Champions left off the show hurt perception (${champOff.omittedTitles.join(', ')}).`,
      tags: [`champions omitted ${champOff.penalty}`],
      summary: `Champions omitted penalty`,
      names: champOff.omittedNames.slice(),
      explain: { kind: 'champions_omitted', omittedTitles: champOff.omittedTitles, penalty: champOff.penalty }
    });

    try {
      pushInbox(state, brand, {
        from: 'Production',
        title: 'Champions Left Off Show',
        body:
          `Leaving champions off TV hurt perception.\n` +
          `Titles omitted: ${champOff.omittedTitles.join(', ')}\n` +
          `Penalty applied: ${champOff.penalty} to show score.`
      }, 'brand');
    } catch { }
  }

  // ✅ PPV week boost — era-accurate score bump applied before avg
  const activePPV = getActivePPV(state.week, brand);
  if (activePPV) {
    const boost = ppvScoreBoost(activePPV);
    showScore += boost;

    results.push({
      id: `SYS-PPV-${state.week}-${brand}`,
      seg: 'System',
      type: 'system',
      score: 0,
      text: `${activePPV.name} — PPV atmosphere boosted show score (+${boost}).`,
      tags: [`ppv:${activePPV.tier}`, `boost:+${boost}`],
      summary: `${activePPV.name} PPV boost`,
      names: [],
      explain: { kind: 'ppv_boost', ppv: activePPV.name, tier: activePPV.tier, boost }
    });

    state.ppvHistory ||= [];
    state.ppvHistory.push({
      week:  state.week,
      name:  activePPV.name,
      brand,
      tier:  activePPV.tier,
      boost,
      showScore: Math.max(10, Math.round(showScore))
    });
  }

  const totalW = Object.values(SEGMENT_WEIGHTS).reduce((a, b) => a + b, 0);
  const weightedAvg = showScore / (totalW || 1);
  let tvRating = Math.round((weightedAvg - TV.BASELINE) / TV.SCALE);

  const level = (veryHotCount >= 1) ? 2 : (hotCount >= 2 ? 1 : 0);
  if (level > 0) {
    state.afterglow[brand] = level;
    state.afterglow.ttl[brand] = CROWD.AFTERGLOW_TTL;
  }

  const { bump: afterglowBump } = computeAfterglowTVBump(results);
  tvRating = clamp(tvRating + afterglowBump, 1, 10);

  // --- Morale preservation that still allows progression deltas ---
  const moraleEarned = {};
  const moraleBeforeProg = {};

  for (const name of moraleTouched) {
    const w = getW(state, name);
    if (!w) continue;
    const m = clamp(Number(w.morale ?? 65), 0, 100);
    moraleEarned[name] = m;
    moraleBeforeProg[name] = m;
  }

  applyWeeklyProgression(state, brand, results, appeared);

  // Apply progression delta onto the "earned" morale
  for (const name of Object.keys(moraleEarned)) {
    const w = getW(state, name);
    if (!w) continue;

    const before = clamp(Number(moraleBeforeProg[name] ?? 65), 0, 100);
    const after = clamp(Number(w.morale ?? 65), 0, 100);
    const progDelta = after - before;

    w.morale = clamp(Number(moraleEarned[name]) + progDelta, 0, 100);
  }

  // Mentorship: apply + allow module to write into legacy inbox; we sweep later
  const mentored = applyMentorships(state, brand) || [];
  if (Array.isArray(mentored)) {
    if (mentored.length) {
      pushInbox(state, brand, {
        from: 'Coaches Room',
        title: 'Mentorship Update',
        body: mentored.join('\n')
      }, 'brand');
    }
  }

  // Fatigue ticks
  const appearedSet = new Set(appearedNames);
  byBrand(state, brand).forEach(w => {
    if ((w.injuryWeeks | 0) > 0) return;

    if (appearedSet.has(w.name)) {
      const mult = results.reduce((m, seg) => {
        return seg.text && seg.text.includes(w.name) ? Math.max(m, FATIGUE.SLOT_MULT[seg.seg] || 1) : m;
      }, 0.8);
      const inc = Math.round(r(...FATIGUE.WRESTLE_BASE_INC) * mult);

      applyAttrDelta(state, state.week, w, 'fatigue', +inc, 'Worked show', { brand, week: state.week });
    } else {
      const dec = r(...FATIGUE.REST_DEC);
      applyAttrDelta(state, state.week, w, 'fatigue', -dec, 'Rested this week', { brand, week: state.week });
    }
  });

  // Brand-scoped, appearance-aware scenarios
  const scenarioMsgs = generateScenarioEvents(state, brand, {
    results,
    appeared: appearedNames.slice()
  });

  if (Array.isArray(scenarioMsgs) && scenarioMsgs.length) {
    scenarioMsgs.forEach(m => {
      // Apply any state effects in a ledger-aware way
      if (m?.effects) {
        try {
          applyEffects(state, m.effects, {
            week: state.week,
            why: `Scenario: ${m.title || 'Event'}`,
            ref: { brand, week: state.week, evt: 'scenario', title: m.title }
          });
        } catch {}
      }
      pushInbox(state, brand, m, 'brand');
    });
  }

  // PPV countdown inbox warning — fires once, PPV_WARN_WEEKS before the event
  const upcomingPPV = getNextPPV(state.week, brand);
  if (upcomingPPV && upcomingPPV.weeksAway === PPV_WARN_WEEKS) {
    const warnKey = `ppvwarn:${brand}:${upcomingPPV.name}:${upcomingPPV.week}`;
    state._mailSeenWeek ||= {};
    const wkSet = state._mailSeenWeek[state.week|0] ||= new Set();
    if (!wkSet.has(warnKey)) {
      pushInbox(state, brand, {
        from: 'Creative',
        title: `${PPV_WARN_WEEKS} Weeks to ${upcomingPPV.name}`,
        body: `${upcomingPPV.name} is ${upcomingPPV.weeksAway} weeks away (${ppvTierLabel(upcomingPPV.tier)}). Make sure your big angles are in place before then.`,
        tags: ['ppv-warning', upcomingPPV.tier]
      }, 'brand');
      wkSet.add(warnKey);
    }
  }

  // Dynamic inbox events write into legacy state.inbox — always sweep into inboxAll.
  resolveOpenPromises(state, brand, results);
  processDynamicInboxEvents(state, brand, results);

  // ✅ Social group booking effects — spread morale based on what happened to group mates
  try {
    for (const seg of results) {
      const names = seg.names || [];
      if (!names.length) continue;

      // Squash: loser's group feels it
      if (seg.direction === 'squash') {
        const losers = Array.isArray(seg.explain?.losers) ? seg.explain.losers : names.slice(1);
        for (const loser of losers) {
          const eff = groupBookingEffect(state, loser, 'squashed');
          if (eff.length) applyEffects(state, eff, { why: 'Group: squash solidarity', week: state.week });
        }
      }

      // Title change: winner's group feels pride, rival group feels jealousy
      const hasTitleChange = Array.isArray(seg.tags) && seg.tags.some(t => String(t).includes('title change'));
      if (hasTitleChange) {
        const winners = Array.isArray(seg.explain?.winners) ? seg.explain.winners : names.slice(0, 1);
        for (const winner of winners) {
          const eff = groupBookingEffect(state, winner, 'pushed');
          if (eff.length) applyEffects(state, eff, { why: 'Group: title change solidarity', week: state.week });
        }
      }
    }
  } catch (e) { console.warn('[runShow] group booking effects failed (soft):', e); }

  // ✅ Social group politics: locker room inbox events
  try {
    processGroupPolitics(state, brand, results);
  } catch (e) { console.warn('[runShow] group politics failed (soft):', e); }

  // ✅ Critical: sweep ANY legacy writes (dynamic + mentorships + mail.js users) into inboxAll
  flushLegacyInboxToAll(state, brand);

  for (const k in state.hotMatches) {
    state.hotMatches[k].ttl -= 1;
    if (state.hotMatches[k].ttl <= 0) delete state.hotMatches[k];
  }

  const retiredThisWeek = processRetirements(state, brand);

  // Attach attrEffects (per-match deltas) — keep, but your det.audit is canonical
  try {
    for (const seg of results) {
      const rec = state.matches?.[seg.id];
      if (!rec || !rec.baseline || !Array.isArray(rec.names)) continue;
      const deltasByName = {};
      for (const n of rec.names) {
        const w = getW(state, n);
        const base = rec.baseline?.[n]?.values;
        if (!w || !base) continue;
        const d = computeAttrDeltas(w, base);
        if (Object.keys(d).length) deltasByName[n] = d;
      }
      if (Object.keys(deltasByName).length) {
        rec.details = rec.details || {};
        rec.details.attrEffects = deltasByName;
        seg.explain = seg.explain || rec.details;
        seg.explain.attrEffects = deltasByName;
      }
    }
  } catch (e) {
    console.warn('[runShow] attach per-match attrEffects failed (soft):', e);
  }

  // ✅ Wrap any newly pushed mails into RPG situations (do this AFTER all pushes/sweeps)
  try {
    wrapInboxSituations(state, brand);
  } catch (e) {
    console.warn('[runShow] wrapInboxSituations failed (soft):', e);
  }

  // ✅ Fire-and-forget AI resolver (it is async). DO NOT await (keeps runShow sync).
  try {
    Promise
      .resolve(autoResolveNonPlayerInbox(state))
      .catch(e => console.warn('[runShow] autoResolveNonPlayerInbox failed (soft):', e));
  } catch (e) {
    console.warn('[runShow] autoResolveNonPlayerInbox failed (soft):', e);
  }

  // One more sweep in case situations/other helpers still touched legacy inbox
  flushLegacyInboxToAll(state, brand);

  rebuildInboxView(state, brand);

  state.matchHistory[brand].push({
    week: state.week,
    date: state.startDate,
    tvRating,
    showScore: Math.max(10, Math.round(weightedAvg)),
    segments: results
  });

  state.lastWeekKeys[brand] = weekKeys;

  captureWeeklySnapshot(state, state.week);

  return {
    brand,
    segments: results,
    showScore: Math.max(10, Math.round(weightedAvg)),
    tvRating,
    fanReact: rateToBlurb(tvRating),
    matchKeys: weekKeys,
    champPenaltyInfo: {},
    injuries: injuriesThisShow,
    retiredThisWeek
  };
}

