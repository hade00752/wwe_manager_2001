// public/js/data.js
import { RAW, SD, FA, clamp } from './util.js';
import { SHOW_BUDGET as _SHOW_BUDGET } from './config.js';

// Re-export for other modules (so profile.js can import from ./data.js)
export const SHOW_BUDGET = _SHOW_BUDGET;

/* ------------------------------------------------------------------ */
/* Titles (rules/config)                                              */
/* ------------------------------------------------------------------ */
export const CHAMPION_SEED = {
  [RAW]: {
    "World":            "Triple H",
    "Intercontinental": "Kane",
    "Tag":              ["Chris Jericho", "Christian"],
    "Women":            "Victoria",
  },
  [SD]: {
    "World":         "Kurt Angle",
    "United States": "Big Show",
    "Tag":           ["Eddie Guerrero", "Edge"],
    "Cruiserweight": "Billy Kidman",
  }
};

export const TITLES = {
  [RAW]: ["World","Intercontinental","Tag","Women"],
  [SD]:  ["World","United States","Tag","Cruiserweight"],
  [FA]:  [],
};

/* ------------------------------------------------------------------ */
/* DB-first roster loader                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns engine-ready wrestler objects for a given era.
 * Source of truth: DB via /api/era/:era/roster_full
 *
 * NOTE: Some endpoints return:
 *  - an array of rows directly, OR
 *  - { rows: [...] }
 * We support both.
 */
export async function loadRosterFromDb(era) {
  const res = await fetch(`/api/era/${encodeURIComponent(String(era))}/roster_full`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load roster_full for era ${era}`);
  const j = await res.json();

  const rows =
    Array.isArray(j) ? j
    : Array.isArray(j?.rows) ? j.rows
    : [];

  return rows.map(rowToWrestler).filter(w => w && w.name);
}

/* ------------------------------------------------------------------ */
/* Mapping: DB row -> engine wrestler object                           */
/* ------------------------------------------------------------------ */

const DEFAULT_BDAY = '01-01-1975';

function parseTagsJson(s) {
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j : [];
  } catch {
    // if styleTags_json ever becomes a comma string or garbage, fail gracefully
    return [];
  }
}

function num(v, d = 60) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function rowToWrestler(x) {
  // identity
  const name = String(x?.name || '').trim();
  const gender = String(x?.gender || 'M').trim();

  // normalize brand a bit
  let brand = String(x?.brand || FA).trim();
  if (brand.toLowerCase() === 'free agency' || brand.toLowerCase() === 'freeagent') brand = FA;
  if (brand.toLowerCase() === 'smackdown') brand = SD;
  if (brand.toLowerCase() === 'raw') brand = RAW;

  const alignment = String(x?.alignment || 'neutral').trim();
  const birthday = (x?.birthday && String(x.birthday).trim()) ? String(x.birthday).trim() : DEFAULT_BDAY;

  const styleTags = parseTagsJson(x?.styleTags_json);

  // stats (DB is authoritative; fallback to sane defaults)
  const starpower   = clamp(num(x?.starpower, 70), 1, 99);
  const workrate    = clamp(num(x?.workrate,  60), 1, 99);
  const charisma    = clamp(num(x?.charisma,  60), 1, 99);
  const mic         = clamp(num(x?.mic,       60), 1, 99);
  const psychology  = clamp(num(x?.psychology,60), 1, 99);
  const stamina     = clamp(num(x?.stamina,   70), 1, 99);
  const durability  = clamp(num(x?.durability,70), 1, 99);
  const consistency = clamp(num(x?.consistency,70),1, 99);
  const likeability = clamp(num(x?.likeability, alignment === 'heel' ? 62 : 70), 1, 99);
  const momentum    = clamp(num(x?.momentum,  55), 1, 99);

  // you added morale to attributes; treat it as an attribute
  const morale      = clamp(num(x?.morale, 60), 1, 99);

  // legacy/derived fields your engine/UI expects
  const promo = Math.round((charisma + mic) / 2);

  // contracts (DB-first)
  const contractAnnual = (brand === FA) ? null : num(x?.contractAnnual ?? x?.annual ?? x?.contract_annual, 0);
  const expectedAnnual = (brand === FA) ? null : num(x?.expectedAnnual ?? x?.expected_annual, 0);

  // percent display (pure UI)
  const budget = Number.isFinite(Number(SHOW_BUDGET)) ? Number(SHOW_BUDGET) : 150_000_000;
  const contractBudgetPct =
    (brand === FA || !contractAnnual || !budget)
      ? null
      : Math.round((contractAnnual / budget) * 10000) / 100;

  return {
    // identity
    id: x?.id ?? null,
    name,
    gender,
    brand,
    alignment,
    birthday,

    // core stats
    starpower,
    workrate,
    charisma,
    mic,
    psychology,
    stamina,
    durability,
    consistency,
    likeability,
    momentum,

    // morale (new)
    morale,

    // misc
    promo,
    styleTags,

    // contracts
    contractAnnual,
    expectedAnnual,
    contractBudgetPct,

    // stateful (engine will mutate)
    championOf: null,
    fatigue: 0,
    injuryWeeks: 0,

    // traits: DB owns this now, so default empty until you wire endpoint/table
    traits: { core: [], status: [], rare: [] },
  };
}
