// scripts/import_trait_seed_2003.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

// Adjust path if needed
import { TRAIT_SEED_2003 } from "../public/js/traits_seed_2003.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "server", "db", "wwe.sqlite");

// Choose your era number for that seed context.
// You can also import per-era seeds later.
const ERA = 200404; // change if your "2003 context" uses a different era key

const cats = ["core", "status", "rare"];

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON;");

  // Build name -> id map
  const wrestlers = await db.all(`SELECT id, name FROM wrestlers;`);
  const nameToId = new Map(wrestlers.map(w => [w.name, w.id]));

  // Build set of valid trait ids
  const traitRows = await db.all(`SELECT id FROM traits;`);
  const validTraits = new Set(traitRows.map(t => t.id));

  const missingWrestlers = [];
  const missingTraits = new Set();
  let inserted = 0;

  await db.exec("BEGIN;");
  try {
    for (const [name, pack] of Object.entries(TRAIT_SEED_2003)) {
      const wid = nameToId.get(name);
      if (!wid) {
        missingWrestlers.push(name);
        continue;
      }

      for (const cat of cats) {
        const arr = pack?.[cat] || [];
        for (const traitId of arr) {
          if (!validTraits.has(traitId)) {
            missingTraits.add(traitId);
            continue;
          }
          await db.run(
            `INSERT OR IGNORE INTO wrestler_traits (era, wrestler_id, trait_id)
             VALUES (?, ?, ?);`,
            [ERA, wid, traitId]
          );
          inserted++;
        }
      }
    }

    await db.exec("COMMIT;");
  } catch (e) {
    await db.exec("ROLLBACK;");
    throw e;
  }

  console.log(`[ok] inserted/attempted rows: ${inserted}`);
  if (missingWrestlers.length) {
    console.log(`\n[warn] missing wrestlers (${missingWrestlers.length}):`);
    console.log(missingWrestlers.slice(0, 50).join("\n"));
  }
  if (missingTraits.size) {
    console.log(`\n[warn] missing traits in catalog (${missingTraits.size}):`);
    console.log([...missingTraits].slice(0, 50).join("\n"));
  }

  const count = await db.get(`SELECT COUNT(*) AS n FROM wrestler_traits WHERE era = ?;`, [ERA]);
  console.log(`[ok] wrestler_traits rows for era ${ERA}: ${count.n}`);

  await db.close();
})();
