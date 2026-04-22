// server/server.mjs
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, applySchema } from "./db/index.mjs";
import { seedRelationshipsToDb } from "./db/seed_relationships.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5173;

const app = express();
app.use(cors());
app.use(express.json());

// ---- static files (html/js/css/img) ----
const PUBLIC_DIR = path.join(__dirname, "../public");
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// ---- DB ----
const db = openDb();
applySchema(db);

// ---- helpers ----
function isValidEra(era) {
  const n = Number(era);
  return Number.isFinite(n) && n > 0;
}

function normalizeBrand(b) {
  if (!b) return b;
  const s = String(b).trim();

  // common variants
  if (s.toLowerCase() === "free agency") return "FA";
  if (s.toLowerCase() === "freeagent") return "FA";
  if (s.toUpperCase() === "RAW") return "RAW";
  if (s.toUpperCase() === "SD") return "SD";
  if (s.toLowerCase() === "smackdown") return "SD";

  return s;
}

// Small helper: parse JSON safely
function safeJsonArray(s) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Prepared statements (avoid re-preparing per request)
const stmtUpsertWrestlerNameGender = db.prepare(`
  INSERT INTO wrestlers (name, gender) VALUES (?, ?)
  ON CONFLICT(name) DO UPDATE SET gender=excluded.gender
`);

const stmtGetWrestlerIdByName = db.prepare(`SELECT id FROM wrestlers WHERE name=?`);
const stmtHasWrestlerId = db.prepare(`SELECT 1 AS ok FROM wrestlers WHERE id=?`);

function getOrCreateWrestlerId(name, gender = "M") {
  stmtUpsertWrestlerNameGender.run(name, gender);
  return stmtGetWrestlerIdByName.get(name).id;
}

/**
 * Resolve wrestler identifier from either numeric id or exact name.
 * Returns numeric id or null.
 */
function resolveWrestlerId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const asNum = Number(s);
  if (Number.isFinite(asNum)) {
    // ✅ verify it exists (otherwise you’ll query phantom ids)
    const ok = stmtHasWrestlerId.get(asNum)?.ok;
    return ok ? asNum : null;
  }

  const row = stmtGetWrestlerIdByName.get(s);
  return row?.id ? Number(row.id) : null;
}

// ---- API ----
app.get("/api/health", (req, res) => res.json({ ok: true }));

/**
 * DB seed endpoint (admin).
 * Uses ./db/seed_relationships.mjs seedRelationshipsToDb(db, era)
 */
app.post("/api/admin/seed_relationships/:era", async (req, res) => {
  try {
    const era = Number(req.params.era);
    if (!isValidEra(era)) return res.status(400).json({ error: "bad era" });

    const out = await seedRelationshipsToDb(db, era);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/era/:era/relationships_map", (req, res) => {
  const era = Number(req.params.era);
  if (!Number.isFinite(era)) return res.status(400).json({ error: "bad era" });

  const rows = db.prepare(`
    SELECT
      wa.name AS a,
      wb.name AS b,
      COALESCE(r.rapport, CAST(ROUND((COALESCE(r.trust,0)+COALESCE(r.respect,0))/2.0) AS INTEGER)) AS rapport,
      COALESCE(r.pressure,0) AS pressure,
      COALESCE(r.flags_json,'[]') AS flags_json
    FROM relationships r
    JOIN wrestlers wa ON wa.id = r.a_id
    JOIN wrestlers wb ON wb.id = r.b_id
    WHERE r.era = ?
  `).all(era);

  // store as pairKey(name,name) => row
  const out = {};
  for (const r of rows) {
    const a = String(r.a), b = String(r.b);
    const key = [a,b].sort().join("::");
    out[key] = {
      w1: [a,b].sort()[0],
      w2: [a,b].sort()[1],
      rapport: Number(r.rapport || 0),
      pressure: Number(r.pressure || 0),
      flags: safeJsonArray(r.flags_json)
    };
  }

  res.json({ era, pairs: out });
});


app.get("/api/era/:era/roster_full", (req, res) => {
  const era = Number(req.params.era);
  if (!isValidEra(era)) return res.status(400).json({ error: "bad era" });

  const rows = db.prepare(`
    SELECT
      w.id AS id,
      w.name, w.gender, w.birthday,
      re.brand, re.alignment,
      c.annual AS contractAnnual,
      c.expected_annual AS expectedAnnual,
      a.starpower, a.workrate, a.charisma, a.mic, a.psychology,
      a.stamina, a.durability, a.consistency, a.likeability, a.momentum,
      a.morale,
      a.athleticism, a.agility, a.strengthPower,
      a.adaptability, a.professionalism, a.ringSafety, a.reputation,
      a.styleTags_json
    FROM roster_era re
    JOIN wrestlers w ON w.id = re.wrestler_id
    LEFT JOIN contracts c ON c.era = re.era AND c.wrestler_id = w.id
    LEFT JOIN attributes a ON a.era = re.era AND a.wrestler_id = w.id
    WHERE re.era = ?
    ORDER BY w.name
  `).all(era);

  const traitRows = db.prepare(`
    SELECT w.name, wt.trait_id
    FROM wrestler_traits wt
    JOIN wrestlers w ON w.id = wt.wrestler_id
    WHERE wt.era = ?
  `).all(era);

  const traitsByName = {};
  for (const r of traitRows) (traitsByName[r.name] ||= []).push(r.trait_id);

  const outRows = rows.map(r => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    birthday: r.birthday,
    brand: normalizeBrand(r.brand),
    alignment: r.alignment,

    contractAnnual: r.contractAnnual == null ? null : Number(r.contractAnnual),
    expectedAnnual: r.expectedAnnual == null ? null : Number(r.expectedAnnual),

    starpower:    r.starpower    ?? null,
    workrate:     r.workrate     ?? null,
    charisma:     r.charisma     ?? null,
    mic:          r.mic          ?? null,
    psychology:   r.psychology   ?? null,
    stamina:      r.stamina      ?? null,
    durability:   r.durability   ?? null,
    consistency:  r.consistency  ?? null,
    likeability:  r.likeability  ?? null,
    momentum:     r.momentum     ?? null,
    morale:       r.morale       ?? null,

    // Extended physical & personality attributes (added migration)
    athleticism:     r.athleticism     ?? null,
    agility:         r.agility         ?? null,
    strengthPower:   r.strengthPower   ?? null,
    adaptability:    r.adaptability    ?? null,
    professionalism: r.professionalism ?? null,
    ringSafety:      r.ringSafety      ?? null,
    reputation:      r.reputation      ?? null,

    styleTags: r.styleTags_json ? safeJsonArray(r.styleTags_json) : [],
    traitIds: traitsByName[r.name] || []
  }));

  res.json({ ok: true, era, rows: outRows });
});

app.post("/api/wrestlers", (req, res) => {
  const { name, gender, birthday } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  db.prepare(`
    INSERT INTO wrestlers (name, gender, birthday)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET gender=excluded.gender, birthday=excluded.birthday
  `).run(name, gender || "M", birthday || null);

  res.json(db.prepare(`SELECT * FROM wrestlers WHERE name=?`).get(name));
});

/**
 * Relationships endpoint (DB is king)
 * Returns BOTH directions:
 * - rows where a_id = id (normal)
 * - rows where b_id = id (reverse)
 *
 * Normalizes each row so that:
 * - other_id / other_name is always "the other person"
 * - rapport prefers r.rapport, but falls back to avg(trust,respect) when rapport is unset (0)
 */
app.get("/api/era/:era/relationships/:wrestlerId", (req, res) => {
  const era = Number(req.params.era);
  const raw = String(req.params.wrestlerId || "").trim();

  if (!isValidEra(era) || !raw) {
    return res.status(400).json({ error: "bad params" });
  }

  const aId = resolveWrestlerId(raw);
  if (!aId) return res.status(404).json({ error: "wrestler not found", key: raw });

  // Pull both directions and normalize
  const base = db.prepare(`
    SELECT
      r.a_id,
      r.b_id,
      COALESCE(
        NULLIF(r.rapport, 0),
        CAST(ROUND((COALESCE(r.trust,0) + COALESCE(r.respect,0)) / 2.0) AS INTEGER)
      ) AS rapport,
      r.pressure,
      COALESCE(r.flags_json, '[]') AS flags_json
    FROM relationships r
    WHERE r.era = ? AND (r.a_id = ? OR r.b_id = ?)
  `).all(era, aId, aId);

  // Preload names in one go (avoid N+1)
  const ids = Array.from(new Set(base.flatMap(r => [r.a_id, r.b_id]).filter(Boolean)));
  const nameRows = ids.length
    ? db.prepare(`SELECT id, name FROM wrestlers WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids)
    : [];
  const nameById = new Map(nameRows.map(r => [Number(r.id), r.name]));

  const baseRows = base
    .map(r => {
      const a = Number(r.a_id);
      const b = Number(r.b_id);
      const other_id = (a === aId) ? b : a;
      const other_name = nameById.get(other_id) || "(unknown)";

      return {
        other_id,
        other_name,
        rapport: Number(r.rapport ?? 0),
        pressure: r.pressure == null ? 0 : Number(r.pressure),
        flags: safeJsonArray(r.flags_json)
      };
    })
    // de-dupe if both directions exist as separate rows (keep the “stronger” one)
    .reduce((acc, row) => {
      const k = String(row.other_id);
      const prev = acc.get(k);
      if (!prev) {
        acc.set(k, row);
      } else {
        const score = (x) =>
          Math.abs(Number(x.rapport || 0)) +
          Math.abs(Number(x.pressure || 0)) +
          (Array.isArray(x.flags) ? x.flags.length * 5 : 0);
        if (score(row) > score(prev)) acc.set(k, row);
      }
      return acc;
    }, new Map());

  const deduped = Array.from(baseRows.values())
    .sort((x, y) => String(x.other_name).localeCompare(String(y.other_name)));

  // traits packs (self + other) so profile.js can overlay deltas
  const getTraitsFor = db.prepare(`
    SELECT t.cat, wt.trait_id
    FROM wrestler_traits wt
    JOIN traits t ON t.id = wt.trait_id
    WHERE wt.era = ? AND wt.wrestler_id = ?
  `);

  const toPack = (id) => {
    const pack = { core: [], status: [], rare: [] };
    for (const r of getTraitsFor.all(era, id)) {
      if (r.cat === "core") pack.core.push(r.trait_id);
      else if (r.cat === "status") pack.status.push(r.trait_id);
      else if (r.cat === "rare") pack.rare.push(r.trait_id);
    }
    return pack;
  };

  const selfTraits = toPack(aId);
  const rowsWithTraits = deduped.map(r => ({
    ...r,
    selfTraits,
    otherTraits: toPack(r.other_id)
  }));

  return res.json({ era, a_id: aId, rows: rowsWithTraits });
});

app.put("/api/roster/:era/:name", (req, res) => {
  const era = Number(req.params.era);
  const name = req.params.name;
  const { brand, alignment, gender } = req.body;

  if (!isValidEra(era)) return res.status(400).json({ error: "bad era" });
  if (!brand || !alignment) return res.status(400).json({ error: "brand and alignment required" });

  const id = getOrCreateWrestlerId(name, gender || "M");

  db.prepare(`
    INSERT INTO roster_era (era, wrestler_id, brand, alignment)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(era, wrestler_id) DO UPDATE SET brand=excluded.brand, alignment=excluded.alignment
  `).run(era, id, normalizeBrand(brand), alignment);

  res.json({ ok: true });
});

// ---- pretty routes ----
app.get("/profile", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "profile.html")));
app.get("/roster",  (req, res) => res.sendFile(path.join(PUBLIC_DIR, "roster.html")));
app.get("/booking", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "booking.html")));
app.get("/results", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "results.html")));
app.get("/inbox",   (req, res) => res.sendFile(path.join(PUBLIC_DIR, "inbox.html")));
app.get("/match",   (req, res) => res.sendFile(path.join(PUBLIC_DIR, "match.html")));
app.get("/mentors", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "mentors.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serving + API on http://localhost:${PORT}`);
});

