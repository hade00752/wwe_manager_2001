// public/js/details_normalize.js
// One-time normaliser: rebuilds canonical state.matches[*].details from history/debug/explain/text.

import { loadState, saveState, ensureInitialised } from "./js/engine.js";
import { el } from "./js/util.js"; // if you don't need el, you can remove this import

/* --------- Utilities --------- */

// Fallback-safe getter
function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

// Parse simple "X defeats Y" / "X def. Y" / "X beat Y" lines for winners
function parseWinnersFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const line = text.replace(/\n/g, ' ').trim();

  // Common patterns: "A defeats B", "A def. B", "A & B defeat C & D", "A pins B"
  const winRe = /\b(?:defeats?|def\.|beat|beats?|pins?|submits?)\b/i;
  if (!winRe.test(line)) return [];

  // Split at the verb and take left side as winners
  const parts = line.split(winRe);
  if (parts.length < 2) return [];

  // Left side might contain "&", "and", ","
  const winnersSide = parts[0]
    .replace(/.*?:\s*/,'')            // strip possible prefix like "Result:"
    .replace(/\b(team|the|by|via)\b/gi,' ')
    .trim();

  // Extract names heuristically: split by & , and 'and'
  let winners = winnersSide
    .split(/\s*(?:&|,|and)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);

  // Clean extra artifacts like "wins", "(c)", belt tags, etc.
  winners = winners.map(w => w.replace(/\(c\)/gi,'').replace(/\s{2,}/g,' ').trim());
  // De-dupe
  winners = Array.from(new Set(winners));
  return winners;
}

// Build a normalized details object from any shape we find.
function buildDetailsFrom(any) {
  if (!any || typeof any !== 'object') return {};

  // Accept either legacy "debug" shape, "explain" shape, or already "details"
  const src = any.details || any.explain || any.debug || any;

  // Known fields we standardise
  const norm = {
    aSideScore: pick(src.aSideScore, src.sideAScore, src.aScore),
    bSideScore: pick(src.bSideScore, src.sideBScore, src.bScore),
    probA: pick(src.probA, src.winProbA, src.aWinProb),
    winners: pick(src.winners, src.victors, src.winSideNames),
    repeatPenalty: pick(src.repeatPenalty, src.repeatPenaltyPts, src.repeatPenaltyPct, 0),
    alignmentPenaltyPct: pick(src.alignmentPenaltyPct, src.alignmentPenalty, 0),
    storyBonus: pick(src.storyBonus, src.storyPts, 0),
    baseChem: pick(src.baseChem, src.chemBase, 0),
    relBonus: pick(src.relBonus, src.relationshipBonus, 0),
    chemPts: pick(src.chemPts, src.chemistryPts, 0),
    momentumDelta: pick(src.momentumDelta, src.momentum, {}),
    titleBump: pick(src.titleBump, src.titleBonus, 0),
    fatigueMult: pick(src.fatigueMult, src.fatigueMultiplier, 1),
    notes: pick(src.notes, []),
  };

  // Make sure momentumDelta is a map
  if (norm.momentumDelta && !isPlainObject(norm.momentumDelta)) {
    // If it's an array of {name, delta}, convert to map
    if (Array.isArray(norm.momentumDelta)) {
      const m = {};
      for (const it of norm.momentumDelta) {
        if (it && it.name) m[it.name] = it.delta ?? 0;
      }
      norm.momentumDelta = m;
    } else {
      norm.momentumDelta = {};
    }
  }

  return norm;
}

function isPlainObject(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}

// Prefer canonical winners in details; otherwise fall back through sources
function resolveWinners(matchObj, histSeg) {
  const fromDetails = pick(
    matchObj?.details?.winners,
    matchObj?.explain?.winners,
    matchObj?.debug?.winners
  );
  if (fromDetails && fromDetails.length) return fromDetails;

  const fromHist = pick(
    histSeg?.details?.winners,
    histSeg?.explain?.winners,
    histSeg?.debug?.winners
  );
  if (fromHist && fromHist.length) return fromHist;

  const parsed = parseWinnersFromText(
    pick(matchObj?.text, matchObj?.summary, histSeg?.text, histSeg?.summary, '')
  );
  return parsed;
}

// Merge tags from various places, de-dup
function mergeTags(...arrs) {
  const out = new Set();
  for (const a of arrs) {
    if (!a) continue;
    for (const t of a) if (t) out.add(String(t));
  }
  return Array.from(out);
}

// Best-effort names for participants
function resolveNames(matchObj, histSeg) {
  const n = pick(
    matchObj?.names,
    histSeg?.names,
    // Try sides A/B from legacy explain
    (matchObj?.explain?.aNames && matchObj?.explain?.bNames) ? [...matchObj.explain.aNames, ...matchObj.explain.bNames] : null,
    (histSeg?.explain?.aNames && histSeg?.explain?.bNames) ? [...histSeg.explain.aNames, ...histSeg.explain.bNames] : null
  );
  return Array.isArray(n) ? n.filter(Boolean) : [];
}

/* --------- Main normaliser --------- */

export function normalizeAllMatches({ force = false } = {}) {
  ensureInitialised();
  const state = loadState();

  if (!state) return { changed: 0, scanned: 0, reason: 'no-state' };
  if (!force && state.normalization?.allMatchesV1 === true) {
    return { changed: 0, scanned: 0, reason: 'already-normalized' };
  }

  let scanned = 0;
  let changed = 0;

  state.matches = state.matches || {};
  state.matchHistory = state.matchHistory || {};
  const brands = Object.keys(state.matchHistory);

  for (const brand of brands) {
    const histArr = state.matchHistory[brand] || [];
    for (const weekEntry of histArr) {
      const segs = weekEntry?.segments || [];
      for (const seg of segs) {
        scanned++;
        const id = seg.id;
        if (!id) continue;

        const cur = state.matches[id] || {};

        // Build canonical object
        const canonical = {
          id,
          week: pick(cur.week, weekEntry.week),
          date: pick(cur.date, weekEntry.date),
          brand: pick(cur.brand, brand),
          segment: pick(cur.segment, seg.segment || seg.key),
          type: pick(cur.type, seg.type),
          title: pick(cur.title, seg.title || seg.matchTitle || ''),
          names: resolveNames(cur, seg),
          rating: pick(cur.rating, seg.rating),
          summary: pick(cur.summary, seg.summary),
          text: pick(cur.text, seg.text),
          tags: mergeTags(cur.tags, seg.tags),
          details: {}
        };

        // Build details unified
        const detailsFrom =
          buildDetailsFrom(cur) || buildDetailsFrom(seg) || {};
        canonical.details = detailsFrom;

        // Winners fallback → winners in details
        const winners = resolveWinners(cur, seg);
        if (winners && winners.length) {
          canonical.details.winners = winners;
        }

        // Momentum fallback: prefer details map, else build from hist explain/debug
        if (!canonical.details.momentumDelta || !Object.keys(canonical.details.momentumDelta).length) {
          const m = pick(
            seg?.details?.momentumDelta,
            seg?.explain?.momentumDelta,
            seg?.debug?.momentumDelta
          );
          if (m) {
            if (isPlainObject(m)) canonical.details.momentumDelta = m;
            if (Array.isArray(m)) {
              const map = {};
              for (const it of m) if (it?.name) map[it.name] = it.delta ?? 0;
              canonical.details.momentumDelta = map;
            }
          }
        }

        // Title bump consistency
        if (canonical.tags?.some(t => /title change/i.test(t))) {
          canonical.details.titleBump = canonical.details.titleBump ?? 1;
        }

        // If anything differs from current stored, write it
        const before = JSON.stringify(state.matches[id] || {});
        const after = JSON.stringify(canonical);
        if (before !== after) {
          state.matches[id] = canonical;
          changed++;
        }
      }
    }
  }

  state.normalization = state.normalization || {};
  state.normalization.allMatchesV1 = true;
  saveState(state);

  return { changed, scanned, reason: 'ok' };
}

/* --------- Optional: small UI hook (temporary) --------- */

// Call this to add a temporary button to Results header for manual run.
// Remove once you auto-run on first load.
export function injectNormalizationButton() {
  const bar = document.querySelector('.results-weekbar') || document.body;
  if (!bar || bar.querySelector('#normalize-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'normalize-btn';
  btn.textContent = 'Normalize legacy matches';
  btn.style.marginLeft = '8px';
  btn.onclick = () => {
    const res = normalizeAllMatches({ force: true });
    alert(`Normalized: ${res.changed} changed out of ${res.scanned} scanned (${res.reason}).`);
    location.reload();
  };
  bar.appendChild(btn);
}
