// server/import/import_2001.mjs
import { openDb, applySchema } from "../db/index.mjs";

// Import your existing hardcoded data + builder (NO MOVING FILES)
import { buildFixedRoster, CONTRACTS_2001 } from "../../public/js/data.js";
import { TRAIT_EFFECTS } from "../../public/js/engine/traits.js";

const ERA = 2001;

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function upsertWrestler(db, { name, gender, birthday }) {
  db.prepare(`
    INSERT INTO wrestlers (name, gender, birthday)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      gender=excluded.gender,
      birthday=excluded.birthday
  `).run(name, gender || "M", birthday || null);

  return db.prepare(`SELECT id FROM wrestlers WHERE name=?`).get(name).id;
}

function upsertRosterEra(db, { era, wrestlerId, brand, alignment }) {
  db.prepare(`
    INSERT INTO roster_era (era, wrestler_id, brand, alignment)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(era, wrestler_id) DO UPDATE SET
      brand=excluded.brand,
      alignment=excluded.alignment
  `).run(era, wrestlerId, brand, alignment);
}

function upsertContract(db, { era, wrestlerId, annual }) {
  if (annual == null) return;
  db.prepare(`
    INSERT INTO contracts (era, wrestler_id, annual)
    VALUES (?, ?, ?)
    ON CONFLICT(era, wrestler_id) DO UPDATE SET
      annual=excluded.annual
  `).run(era, wrestlerId, Number(annual));
}

function upsertAttributes(db, wrestlerId, w) {
  const styleTags_json = Array.isArray(w.styleTags) ? JSON.stringify(w.styleTags) : null;

  // IMPORTANT: match schema.sql exactly (no extra columns)
  db.prepare(`
    INSERT INTO attributes (
      era, wrestler_id,
      starpower, workrate, charisma, mic, psychology,
      stamina, durability, consistency, likeability, momentum,
      styleTags_json
    ) VALUES (
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?
    )
    ON CONFLICT(era, wrestler_id) DO UPDATE SET
      starpower=excluded.starpower,
      workrate=excluded.workrate,
      charisma=excluded.charisma,
      mic=excluded.mic,
      psychology=excluded.psychology,
      stamina=excluded.stamina,
      durability=excluded.durability,
      consistency=excluded.consistency,
      likeability=excluded.likeability,
      momentum=excluded.momentum,
      styleTags_json=excluded.styleTags_json
  `).run(
    ERA, wrestlerId,
    w.starpower ?? null,
    w.workrate ?? null,
    w.charisma ?? null,
    w.mic ?? null,
    w.psychology ?? null,
    w.stamina ?? null,
    w.durability ?? null,
    w.consistency ?? null,
    w.likeability ?? null,
    w.momentum ?? null,
    styleTags_json
  );
}

function seedTraitCatalog(db) {
  // TRAIT_EFFECTS looks like:
  // { Showman: { cat:"core", hooks:{...} }, ... }
  const ins = db.prepare(`
    INSERT INTO traits (id, category, description)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category=excluded.category
  `);

  let n = 0;
  for (const [id, meta] of Object.entries(TRAIT_EFFECTS || {})) {
    const cat = meta?.cat;
    if (!cat) continue;
    ins.run(String(id), String(cat), null);
    n++;
  }
  return n;
}

function replaceTraitsForWrestler(db, wrestlerId, traitsByCat) {
  // wipe then insert (simple + deterministic)
  db.prepare(`DELETE FROM wrestler_traits WHERE era=? AND wrestler_id=?`).run(ERA, wrestlerId);

  const ins = db.prepare(`
    INSERT INTO wrestler_traits (era, wrestler_id, trait_id)
    VALUES (?, ?, ?)
    ON CONFLICT(era, wrestler_id, trait_id) DO NOTHING
  `);

  const all = [
    ...(traitsByCat?.core || []),
    ...(traitsByCat?.status || []),
    ...(traitsByCat?.rare || []),
  ].filter(Boolean);

  for (const t of all) ins.run(ERA, wrestlerId, String(t));
}

function main() {
  const db = openDb();
  applySchema(db);

  const roster = buildFixedRoster();
  assert(Array.isArray(roster) && roster.length, "buildFixedRoster() returned no roster");

  db.exec("BEGIN");
  try {
    // Clear era data before re-import (repeatable)
    db.prepare(`DELETE FROM wrestler_traits WHERE era=?`).run(ERA);
    db.prepare(`DELETE FROM attributes WHERE era=?`).run(ERA);
    db.prepare(`DELETE FROM contracts WHERE era=?`).run(ERA);
    db.prepare(`DELETE FROM roster_era WHERE era=?`).run(ERA);

    const traitCount = seedTraitCatalog(db);

    let inserted = 0;

    for (const w of roster) {
      const wrestlerId = upsertWrestler(db, {
        name: w.name,
        gender: w.gender,
        birthday: w.birthday || null,
      });

      upsertRosterEra(db, {
        era: ERA,
        wrestlerId,
        brand: w.brand,
        alignment: w.alignment,
      });

      // contracts: use computed contractAnnual if present, fallback to CONTRACTS_2001 map
      const annual =
        (w.contractAnnual ?? null) ??
        (CONTRACTS_2001?.[w.name] ?? null);

      upsertContract(db, { era: ERA, wrestlerId, annual });

      upsertAttributes(db, wrestlerId, w);

      // Traits: requires traits catalog seeded (FK)
      replaceTraitsForWrestler(db, wrestlerId, w.traits);

      inserted++;
    }

    db.exec("COMMIT");
    console.log(`[seed] Traits catalog present: ${traitCount}`);
    console.log(`[seed] Imported era ${ERA}: ${inserted} wrestlers`);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

main();
