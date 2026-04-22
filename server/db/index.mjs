// server/db/index.mjs
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.resolve("server/db/wwe.sqlite");

// You had SCHEMA_PATH but never used it. Keep the code simple:
// schema is managed inline here (or move to schema.sql later deliberately).

export function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  return db;
}

function hasColumn(db, table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => String(c.name) === String(column));
  } catch {
    return false;
  }
}

export function applySchema(db) {
  // 1) base table
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      era INTEGER NOT NULL,
      a_id INTEGER NOT NULL,
      b_id INTEGER NOT NULL,

      -- DB-first canonical relationship axis
      rapport INTEGER DEFAULT 0,

      -- Legacy/back-compat fields (still useful for future)
      trust INTEGER DEFAULT 0,
      respect INTEGER DEFAULT 0,
      chemistry INTEGER DEFAULT 0,
      pressure INTEGER DEFAULT 0,
      flags_json TEXT DEFAULT '[]',

      FOREIGN KEY (a_id) REFERENCES wrestlers(id),
      FOREIGN KEY (b_id) REFERENCES wrestlers(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_relationships_era_pair
      ON relationships (era, a_id, b_id);
  `);

  // 2) migrate older DBs that already have the table but no rapport column
  if (!hasColumn(db, "relationships", "rapport")) {
    db.exec(`ALTER TABLE relationships ADD COLUMN rapport INTEGER DEFAULT 0;`);
  }

  // 3) backfill rapport for existing rows if it looks unset
  // Rule: if rapport is NULL or 0 AND trust/respect have signal, compute it.
  // (Adjust if you want 0 to be a valid “neutral” rather than “unset”.)
  db.exec(`
    UPDATE relationships
    SET rapport = CAST(ROUND((COALESCE(trust,0) + COALESCE(respect,0)) / 2.0) AS INTEGER)
    WHERE (rapport IS NULL OR rapport = 0)
      AND (COALESCE(trust,0) != 0 OR COALESCE(respect,0) != 0);
  `);
}
