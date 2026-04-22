// server/db/seed_relationships.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function tableHasColumn(db, table, col) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => String(c.name) === String(col));
  } catch {
    return false;
  }
}

function clampInt(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

export async function seedRelationshipsToDb(db, era) {
  const eraNum = Number(era);
  if (!Number.isFinite(eraNum)) throw new Error("seedRelationshipsToDb: bad era");

  // Robust dynamic import: works across OS path formats and spaces
  const relFsPath = path.join(__dirname, `../../public/js/data/rel_seed_rows_${eraNum}.mjs`);
  const relUrl = pathToFileURL(relFsPath).href;
  const mod = await import(relUrl);

  const key = `REL_SEED_ROWS_${eraNum}`;
  const rows = mod[key];
  if (!Array.isArray(rows)) throw new Error(`Seed file missing export ${key}`);

  // Ensure wrestlers exist
  const insW = db.prepare(`
    INSERT INTO wrestlers (name, gender) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET gender=excluded.gender
  `);
  const getW = db.prepare(`SELECT id FROM wrestlers WHERE name=?`);

  // Optional rapport support
  const hasRapport = tableHasColumn(db, "relationships", "rapport");

  // Build relationship insert with/without rapport
  const insRel = hasRapport
    ? db.prepare(`
        INSERT INTO relationships (era, a_id, b_id, rapport, trust, respect, chemistry, pressure, flags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(era, a_id, b_id) DO UPDATE SET
          rapport=excluded.rapport,
          trust=excluded.trust,
          respect=excluded.respect,
          chemistry=excluded.chemistry,
          pressure=excluded.pressure,
          flags_json=excluded.flags_json
      `)
    : db.prepare(`
        INSERT INTO relationships (era, a_id, b_id, trust, respect, chemistry, pressure, flags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(era, a_id, b_id) DO UPDATE SET
          trust=excluded.trust,
          respect=excluded.respect,
          chemistry=excluded.chemistry,
          pressure=excluded.pressure,
          flags_json=excluded.flags_json
      `);

  const tx = db.transaction(() => {
    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      const aName = r?.a;
      const bName = r?.b;
      if (!aName || !bName) { skipped++; continue; }

      // Ensure both exist (gender default for now)
      insW.run(aName, "M");
      insW.run(bName, "M");

      const aId = getW.get(aName)?.id;
      const bId = getW.get(bName)?.id;
      if (!aId || !bId) { skipped++; continue; }

      // Clamp to your model ranges (safe even if schema doesn't enforce)
      const trust     = clampInt(r.trust, -50, 50);
      const respect   = clampInt(r.respect, -50, 50);
      const chemistry = clampInt(r.chemistry, -10, 10);
      const pressure  = clampInt(r.pressure, 0, 100);

      const flagsJson = JSON.stringify(Array.isArray(r.flags) ? r.flags : []);

      // If rapport exists, prefer explicit row. Else compute from trust/respect.
      const rapport = hasRapport
        ? (Number.isFinite(Number(r.rapport))
            ? clampInt(r.rapport, -50, 50)
            : clampInt(Math.round((trust + respect) / 2), -50, 50))
        : null;

      // A -> B
      if (hasRapport) insRel.run(eraNum, aId, bId, rapport, trust, respect, chemistry, pressure, flagsJson);
      else           insRel.run(eraNum, aId, bId, trust, respect, chemistry, pressure, flagsJson);
      inserted++;

      // B -> A (symmetric)
      if (hasRapport) insRel.run(eraNum, bId, aId, rapport, trust, respect, chemistry, pressure, flagsJson);
      else           insRel.run(eraNum, bId, aId, trust, respect, chemistry, pressure, flagsJson);
      inserted++;
    }

    return { ok: true, inserted, skipped, era: eraNum, hasRapport };
  });

  return tx();
}
