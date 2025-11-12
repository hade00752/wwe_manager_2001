// public/js/engine/state_mgmt.js
import { RAW, SD, r, clamp } from '../util.js';
import { TITLES, buildFixedRoster, ATTR_OVERRIDES } from '../data.js';
import { setChampionFlags, stripCrossBrandTitles } from './champions.js';
import { men, women, pickTop, pairForTag, uniqSorted, byBrand } from './helpers.js';
import { defaultRelationships, seedEra2000 } from './relationships.js';
import { pushMail } from './mail.js';
import { defaultFinances, ensureFinances } from './finances.js';
import { ensureContract } from './contracts.js';

/* ────────────────────────────── storage keys ───────────────────────────── */

// Single source of truth for the save key.
export const SAVE_KEY = 'wwe2001_save_v1';
export const nsKey = (suffix) => `${SAVE_KEY}::${suffix}`;

// Any old keys we might have used before (or that other pages used).
const LEGACY_KEYS = [
  'wwf_sim_state_v1',
  'wwf_state',
  'wwe_manager_2001',
  'wwe_2001_sim',
  'wwe_save',
  'game_state',
  'state',
];

// lightweight JSON helpers
function getJSON(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
function setJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Adopt legacy keys if SAVE_KEY is missing.
function adoptLegacyIfNeeded() {
  if (localStorage.getItem(SAVE_KEY)) return;
  let bestKey = null, bestLen = -1;
  for (const k of Object.keys(localStorage)) {
    if (LEGACY_KEYS.includes(k) || /wwe|wwf|save|state/i.test(k)) {
      const v = localStorage.getItem(k) || '';
      if (v.length > bestLen) { bestLen = v.length; bestKey = k; }
    }
  }
  if (bestKey) {
    localStorage.setItem(SAVE_KEY, localStorage.getItem(bestKey));
    // optional: clean up dupes so we never flip-flop again
    try {
      for (const k of Object.keys(localStorage)) {
        if (k !== SAVE_KEY && (LEGACY_KEYS.includes(k) || /wwe|wwf|save|state/i.test(k))) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }
}
adoptLegacyIfNeeded();

/* ─────────────────────────────── state shape ────────────────────────────── */

export function defaultState(brand = RAW){
  return {
    week: 1,
    brand,
    startDate: '01-04-2001',
    roster: buildFixedRoster(),
    champs: { [RAW]:{}, [SD]:{} },
    history: [],
    lastWeekKeys: { [RAW]:[], [SD]:[] },
    storylines: { [RAW]:[], [SD]:[] },
    chemistry: {},
    relationships: defaultRelationships(),
    inbox: [],
    afterglow: { [RAW]:0, [SD]:0, ttl:{ [RAW]:0, [SD]:0 } },
    hotMatches: {},
    flags: { welcomeSent:false },
    mentorships: {
      slots: [
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] },
        { mentor:null, mentees:[] }
      ]
    },
    finances: defaultFinances(),
  };
}

export const CHAMPION_SEED = {
  [RAW]: {
    "World":            "Triple H",
    "Intercontinental": "Kane",
    "Tag":              ["Chris Jericho", "Christian"],
    "Women":            "Chyna",
  },
  [SD]: {
    "World":         "Kurt Angle",
    "United States": "Big Show",
    "Tag":           ["Eddie Guerrero", "Edge"],
    "Cruiserweight": "Billy Kidman",
  }
};

function normalizeBrandsForTitles(state){
  const isCruiser = (w)=> (w.styleTags||[]).some(t=>/cruiser/i.test(t));
  state.roster.forEach(w=>{
    if (w.gender === 'F' && w.brand === SD) w.brand = RAW;
    if (isCruiser(w) && w.brand === RAW)    w.brand = SD;
  });
}

function calcOverall(w) {
  const promoLike = ((w.charisma ?? w.promo ?? 60) + (w.mic ?? w.promo ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons  = w.consistency ?? 60;
  const o = Math.round(
    (w.workrate  ?? 60) * 0.30 +
    (w.starpower ?? 60) * 0.25 +
    promoLike * 0.15 +
    (w.momentum  ?? 60) * 0.10 +
    psych * 0.10 +
    cons * 0.10
  );
  return Math.max(1, Math.min(99, o));
}

export function applyFixedChampions(state, seed = CHAMPION_SEED){
  state.champs = { [RAW]:{}, [SD]:{} };
  for (const brand of [RAW, SD]){
    const m = seed[brand] || {};
    for (const [title, holder] of Object.entries(m)){
      state.champs[brand][title] = holder;
    }
  }
}

/* ───────────────────── migration-safe load / save ───────────────────── */

export function loadState(){
  const s = getJSON(SAVE_KEY);

  // one-time sanitizer for old inbox links (/profile? -> profile.html?)
  if (s?.inbox && Array.isArray(s.inbox)) {
    let changed = false;
    for (const m of s.inbox) {
      for (const fld of ['body','html','text']) {
        if (typeof m[fld] === 'string' && m[fld].includes('/profile?')) {
          m[fld] = m[fld].replaceAll('/profile?', 'profile.html?');
          changed = true;
        }
      }
    }
    if (changed) setJSON(SAVE_KEY, s);
  }

  return s || null;
}

export function saveState(state){
  setJSON(SAVE_KEY, state);
}

/* ─────────────────────────── sim clock helpers ────────────────────────── */

function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
function addDays(d, days){ const x = new Date(d); x.setDate(x.getDate()+days); return x; }

export function simNow(state){
  const base = parseDDMMYYYY(state?.startDate || '01-04-2001') || new Date(2001,3,1);
  const weeks = Math.max(0, (state?.week||1)-1);
  return addDays(base, weeks*7);
}
export function simDateString(state){
  const d = simNow(state);
  const pad = n => String(n).padStart(2,'0');
  return `Week ${state?.week||1} — ${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
}
export function advanceSimWeek(state, n=1){
  state.week = Math.max(1, (state.week||1) + n);

  const afterglow = state.afterglow;
  const ttl = afterglow && afterglow.ttl;
  if (ttl && typeof ttl === 'object') {
    for (const brand of [RAW, SD]) {
      const current = Number(ttl[brand]);
      if (!Number.isFinite(current) || current <= 0) {
        ttl[brand] = 0;
        if (afterglow && Number(afterglow[brand]) !== 0) afterglow[brand] = 0;
        continue;
      }

      const remaining = Math.max(0, current - Math.max(1, Math.round(n)));
      ttl[brand] = remaining;
      if (remaining === 0 && afterglow) afterglow[brand] = 0;
    }
  }
}

/* ────────────────────────── storyline normaliser ─────────────────────── */

function normalizeStory(s){
  if(!s) return null;
  if(s.set && s.set instanceof Set){
    s = { names:[...s.set], heat:s.heat||0, weeks:s.weeks||0 };
  }
  if(Array.isArray(s.names)) s.names = uniqSorted(s.names);
  s.heat = clamp(Math.max(0, Math.round(Number(s.heat ?? 0))), 0, 100);
  s.weeks = Math.max(0, Math.round(Number(s.weeks ?? 0)));
  if (!Number.isFinite(s.lastScore)) s.lastScore = 0;
  else s.lastScore = Math.round(s.lastScore);
  if (!Number.isFinite(s.lastDelta)) s.lastDelta = 0;
  else s.lastDelta = Math.round(s.lastDelta);
  return s;
}

/* ─────────────────────────── season bootstrap ────────────────────────── */

export function newSeason(brand = RAW, { useChampionSeed = true } = {}){
  const state = defaultState(brand);

  normalizeBrandsForTitles(state);

  if (useChampionSeed && CHAMPION_SEED) {
    applyFixedChampions(state, CHAMPION_SEED);
  } else {
    const cruisersSD = men(byBrand(state, SD))
      .filter(w => (w.styleTags||[]).some(t => /cruiser/i.test(t)));
    state.champs = {
      [RAW]: {
        "World":            pickTop(men(byBrand(state, RAW))),
        "Intercontinental": pickTop(men(byBrand(state, RAW)), 1),
        "Tag":              pairForTag(men(byBrand(state, RAW))),
        "Women":            pickTop(women(byBrand(state, RAW)))
      },
      [SD]: {
        "World":         pickTop(men(byBrand(state, SD))),
        "United States": pickTop(men(byBrand(state, SD)), 1),
        "Tag":           pairForTag(men(byBrand(state, SD))),
        "Cruiserweight": pickTop(cruisersSD.length ? cruisersSD : men(byBrand(state, SD)))
      }
    };
  }

  stripCrossBrandTitles(state);
  seedEra2000(state);

  // Welcome mail once per save
  state.flags = state.flags || {};
  if (!state.flags.welcomeSent) {
    const other = brand === RAW ? SD : RAW;
    const top3 = [...byBrand(state, brand)]
      .map(w => ({ n: w.name, ov: calcOverall(w) }))
      .sort((a,b)=> b.ov - a.ov)
      .slice(0,3);

    const body = [
      `Welcome, manager of ${brand}.`,
      ``,
      `Your aim this season is simple: beat ${other} in both TV ratings and revenue.`,
      `The brand with the best average TV rating gets the WrestleMania main event.`,
      ``,
      `Top stars to build around:`,
      `• ${top3[0]?.n ?? '—'} (OVR ${top3[0]?.ov ?? '—'})`,
      `• ${top3[1]?.n ?? '—'} (OVR ${top3[1]?.ov ?? '—'})`,
      `• ${top3[2]?.n ?? '—'} (OVR ${top3[2]?.ov ?? '—'})`,
      ``,
      `Current champions:`,
      ...TITLES[brand].map(t => `• ${t}: ${
        Array.isArray(state.champs[brand][t]) ? state.champs[brand][t].join(' & ')
                                              : (state.champs[brand][t] || 'Vacant')
      }`)
    ].join('\n');

    pushMail(state, { title: `Season Briefing — ${brand}`, from: 'Vince McMahon', body });
    state.flags.welcomeSent = true;
    saveState(state);
  }

  return state;
}

/* ─────────────────────── migration / initialisation ───────────────────── */

export function ensureInitialised(state){
  // If caller passed nothing, try to load from storage.
  state = (state && typeof state === 'object') ? state : loadState() || {};

  if (state.week == null) state.week = 1;
  if (!state.startDate)   state.startDate = '01-04-2001';

  // Only bootstrap if champs container is missing; never wipe existing progress.
  if (!state.champs || !state.champs[RAW] || !state.champs[SD]) {
    const bootstrap = newSeason(state.brand || RAW, { useChampionSeed: true });

    // Preserve the user’s ongoing progress if present.
    const preserved = {
      week: state.week,
      startDate: state.startDate,
      history: Array.isArray(state.history) ? state.history : [],
      brand: state.brand || bootstrap.brand,
      roster: Array.isArray(state.roster) ? state.roster : bootstrap.roster,
      inbox: Array.isArray(state.inbox) ? state.inbox : [],
      flags: (state.flags && typeof state.flags==='object') ? state.flags : (bootstrap.flags||{}),
    };
    state = Object.assign({}, bootstrap, state, preserved);
  }

  state.history          = Array.isArray(state.history) ? state.history : [];
  state.flags            = (state.flags && typeof state.flags === 'object') ? state.flags : {};
  state.lastWeekKeys     = (state.lastWeekKeys     && typeof state.lastWeekKeys === 'object') ? state.lastWeekKeys : { [RAW]:[], [SD]:[] };
  state.storylines       = (state.storylines       && typeof state.storylines   === 'object') ? state.storylines   : { [RAW]:[], [SD]:[] };
  state.storylines[RAW]  = (state.storylines[RAW]||[]).map(normalizeStory);
  state.storylines[SD]   = (state.storylines[SD] ||[]).map(normalizeStory);
  state.chemistry        = (state.chemistry        && typeof state.chemistry    === 'object') ? state.chemistry    : {};
  state.hotMatches       = (state.hotMatches       && typeof state.hotMatches   === 'object') ? state.hotMatches   : {};
  state.afterglow        = (state.afterglow        && typeof state.afterglow    === 'object') ? state.afterglow    : { [RAW]:0, [SD]:0, ttl:{ [RAW]:0, [SD]:0 } };
  if (!state.afterglow.ttl) state.afterglow.ttl = { [RAW]:0, [SD]:0 };
  if (!Array.isArray(state.inbox)) state.inbox = [];

  if (!state.mentorships || !Array.isArray(state.mentorships.slots)) {
    state.mentorships = defaultState(state.brand || RAW).mentorships;
  } else {
    state.mentorships.slots = state.mentorships.slots.map(s => ({
      mentor: s?.mentor ?? null,
      mentees: Array.isArray(s?.mentees) ? s.mentees.slice(0,3).filter(Boolean) : []
    }));
    while (state.mentorships.slots.length < 5) state.mentorships.slots.push({ mentor:null, mentees:[] });
    if (state.mentorships.slots.length > 5) state.mentorships.slots = state.mentorships.slots.slice(0,5);
  }

  state.roster = Array.isArray(state.roster) ? state.roster : [];
  state.roster.forEach(w=>{
    if (typeof w.fatigue      !== 'number') w.fatigue      = r(5,18);
    if (typeof w.injuryWeeks  !== 'number') w.injuryWeeks  = 0;
    if (typeof w.retired      !== 'boolean') w.retired     = false;

    if (typeof w.morale       !== 'number') w.morale       = clamp(r(55,75), 0, 100);

    const o = ATTR_OVERRIDES[w.name];
    if (o) {
      if (typeof w.charisma    !== 'number') w.charisma    = o.charisma;
      if (typeof w.mic         !== 'number') w.mic         = o.mic;
      if (typeof w.psychology  !== 'number') w.psychology  = o.psychology;
      if (typeof w.stamina     !== 'number') w.stamina     = o.stamina;
      if (typeof w.durability  !== 'number') w.durability  = o.durability;
      if (typeof w.consistency !== 'number') w.consistency = o.consistency;
    } else {
      if (typeof w.charisma    !== 'number') w.charisma    = 66;
      if (typeof w.mic         !== 'number') w.mic         = 66;
      if (typeof w.psychology  !== 'number') w.psychology  = 72;
      if (typeof w.stamina     !== 'number') w.stamina     = 76;
      if (typeof w.durability  !== 'number') w.durability  = 74;
      if (typeof w.consistency !== 'number') w.consistency = 76;
    }
    if (typeof w.promo !== 'number' || w.promo <= 0) w.promo = Math.round((w.charisma + w.mic)/2);

    if (typeof w.reputation      !== 'number') w.reputation      = r(45,75);
    if (typeof w.professionalism !== 'number') w.professionalism = r(55,85);
    if (typeof w.adaptability    !== 'number') w.adaptability    = r(55,75);
    if (typeof w.ringSafety      !== 'number') w.ringSafety      = r(55,85);
    if (typeof w.athleticism     !== 'number') w.athleticism     = r(55,80);

    [
      'charisma','mic','psychology','stamina','durability','consistency',
      'reputation','professionalism','adaptability','ringSafety','athleticism',
      'workrate','starpower','likeability','momentum'
    ].forEach(k=>{
      if (typeof w[k] === 'number' && !Number.isFinite(w[k])) w[k] = 60;
      if (typeof w[k] === 'number') w[k] = clamp(Math.round(w[k]), 1, 99);
    });

    w.morale = clamp(Math.round(w.morale ?? 65), 0, 100);

    ensureContract(w);
  });

  setChampionFlags(state);
  ensureFinances(state);
  return state;
}

export { byBrand };

