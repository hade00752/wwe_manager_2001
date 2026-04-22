// scripts/sync_traits_catalog.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

// Adjust this import path if your file location differs
import { TRAIT_EFFECTS } from "../public/js/engine/traits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust if your db path differs
const DB_PATH = path.join(__dirname, "..", "server", "db", "wwe.sqlite");

(async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await db.exec("PRAGMA foreign_keys = ON;");

  const entries = Object.entries(TRAIT_EFFECTS).map(([id, v]) => ({
    id,
    cat: v?.cat,
    label: id, // simple default; you can prettify later
  }));

  // sanity
  const missingCat = entries.filter(e => !e.cat);
  if (missingCat.length) {
    console.error("Traits missing cat:", missingCat.slice(0, 20));
    throw new Error("Some TRAIT_EFFECTS entries have no cat");
  }

  await db.exec("BEGIN;");
  try {
    for (const t of entries) {
      await db.run(
        `INSERT INTO traits (id, cat, label)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cat = excluded.cat,
           label = COALESCE(excluded.label, traits.label);`,
        [t.id, t.cat, t.label]
      );
    }
    await db.exec("COMMIT;");
  } catch (e) {
    await db.exec("ROLLBACK;");
    throw e;
  }

  const row = await db.get(`SELECT COUNT(*) AS n FROM traits;`);
  console.log(`[ok] traits catalog rows: ${row.n}`);

  await db.close();
})();
