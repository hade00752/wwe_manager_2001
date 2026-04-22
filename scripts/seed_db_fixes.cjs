// scripts/seed_db_fixes.js — run with: node scripts/seed_db_fixes.js
const Database = require('better-sqlite3');
const db = new Database('server/db/wwe.sqlite');

// ── Step 1: Batista traits ──────────────────────────────────────────────
const batistaId = db.prepare("SELECT id FROM wrestlers WHERE name='Batista'").get()?.id;
if (batistaId) {
  const traits = ['PowerhouseCore','StableMember','BulldogEnforcer','CompanyGuy','Showman'];
  const stmt = db.prepare('INSERT OR IGNORE INTO wrestler_traits (era, wrestler_id, trait_id) VALUES (?, ?, ?)');
  let added = 0;
  for (const t of traits) { const r = stmt.run(200404, batistaId, t); if (r.changes) added++; }
  console.log('Batista traits added:', added);
} else {
  console.log('Batista not found!');
}

// ── Step 2: Seed extra relationships ───────────────────────────────────
// [nameA, nameB, rapport, trust, pressure, flagsJson]
const newRels = [
  // Evolution bloc
  ['Triple H', 'Randy Orton',         5,  10, 25, '["backstage","stable","mentor"]'],
  ['Ric Flair', 'Randy Orton',        5,  10,  0, '["backstage","stable","mentor"]'],
  ['Ric Flair', 'Batista',           10,  20,  0, '["backstage","stable","mentor"]'],
  ['Triple H', 'Batista',             8,  15,  0, '["backstage","stable","mentor"]'],
  ['Batista', 'Randy Orton',          8,  15, 25, '["backstage","stable"]'],

  // SD Title picture
  ['Kurt Angle', 'Big Show',          3,   5, 35, '["backstage","professional"]'],
  ['Kurt Angle', 'John Cena',        -5, -10, 15, '["backstage"]'],
  ['Eddie Guerrero', 'Kurt Angle',   -3,  -5, 40, '["backstage","professional"]'],
  ['Eddie Guerrero', 'John Cena',    10,  20,  0, '["backstage"]'],
  ['Chris Benoit', 'Triple H',       -5, -10, 40, '["backstage","professional"]'],
  ['Chris Benoit', 'Shawn Michaels',  5,  10, 35, '["backstage","professional"]'],

  // Raw midcard
  ['Chris Jericho', 'Trish Stratus',  8,  15,  0, '["backstage","romance"]'],
  ['Kane', 'Lita',                  -10, -20, 40, '["backstage"]'],

  // SD midcard
  ['John Cena', 'Booker T',          -5, -10, 20, '["backstage"]'],
  ['John Cena', 'Big Show',          -5, -10, 25, '["backstage"]'],
  ['Rey Mysterio', 'Chavo Guerrero Jr.', -8, -15, 30, '["backstage"]'],
  ['Eddie Guerrero', 'Big Show',     -5, -10, 30, '["backstage"]'],
  ['John Cena', 'Randy Orton',       -3,  -5, 20, '["backstage"]'],
  ['Batista', 'John Cena',            3,   5,  0, '["backstage"]'],

  // Womens
  ['Trish Stratus', 'Molly Holly',   -8, -15, 25, '["backstage"]'],
  ['Lita', 'Edge',                   15,  30,  0, '["backstage","romance"]'],
  ['Lita', 'Matt Hardy',            -30, -60, 50, '["backstage"]'],

  // Locker room veterans
  ['The Undertaker', 'Bradshaw',      5,  10,  0, '["backstage"]'],
  ['Ric Flair', 'Kurt Angle',         8,  15, 20, '["backstage","professional"]'],
  ['Stone Cold Steve Austin', 'Shawn Michaels', 5, 10, 0, '["backstage"]'],

  // Family/tag
  ['Bubba Ray Dudley', 'Spike Dudley', 13, 25, 0, '["backstage","family","tag"]'],

  // ECW veterans
  ['Rob Van Dam', 'Rhyno',            8,  15,  0, '["backstage"]'],
  ['Raven', 'Tazz',                   8,  15,  0, '["backstage"]'],
  ['Sabu', 'Rhyno',                   5,  10,  0, '["backstage"]'],

  // TNA-origin guys
  ['AJ Styles', 'Low Ki',            10,  20,  0, '["backstage"]'],
  ['Eddie Guerrero', 'Tajiri',        5,  10,  0, '["backstage"]'],

  // Notorious backstage tension
  ['Triple H', 'Goldberg',          -15, -30, 35, '["backstage"]'],
  ['Triple H', 'Chris Jericho',      -6, -12, 15, '["backstage"]'],
  ['Mark Henry', 'Triple H',         -8, -15, 20, '["backstage"]'],
];

const nameToId = {};
db.prepare('SELECT id, name FROM wrestlers').all().forEach(w => { nameToId[w.name] = w.id; });

const insertRel = db.prepare(
  'INSERT INTO relationships (era, a_id, b_id, rapport, trust, pressure, flags_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(era, a_id, b_id) DO UPDATE SET rapport=excluded.rapport, trust=excluded.trust, pressure=excluded.pressure, flags_json=excluded.flags_json'
);

let added = 0, skipped = 0;
for (const [nameA, nameB, rapport, trust, pressure, flags] of newRels) {
  const idA = nameToId[nameA];
  const idB = nameToId[nameB];
  if (!idA || !idB) { console.log('  SKIP (not found):', nameA, '/', nameB); skipped++; continue; }
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
  insertRel.run(200404, lo, hi, rapport, trust, pressure, flags);
  added++;
}
console.log('Relationships upserted:', added, '| Skipped:', skipped);

// ── Final stats ────────────────────────────────────────────────────────
const total = db.prepare('SELECT COUNT(*) as n FROM relationships WHERE era=200404').get().n;
console.log('Total era 200404 relationships:', total);

// Quick check Undertaker
const utId = db.prepare("SELECT id FROM wrestlers WHERE name='The Undertaker'").get()?.id;
const utRels = db.prepare(
  'SELECT wa.name a, wb.name b, r.rapport, r.pressure FROM relationships r ' +
  'JOIN wrestlers wa ON wa.id=r.a_id JOIN wrestlers wb ON wb.id=r.b_id ' +
  'WHERE r.era=200404 AND (r.a_id=? OR r.b_id=?)'
).all(utId, utId);
console.log('\nUndertaker relationships:', utRels.length);
utRels.forEach(r => console.log(' ', r.a, '<->', r.b, 'rap:', r.rapport, 'pres:', r.pressure));
