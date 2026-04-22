// server/routes/era_roster_full.js
import express from 'express';
import { db } from '../db.js'; // <- whatever your sqlite wrapper export is

export const router = express.Router();

router.get('/api/era/:era/roster_full', (req, res) => {
  const era = Number(req.params.era || 0);
  if (!era) return res.status(400).json({ ok: false, error: 'Invalid era' });

  const sql = `
    SELECT
      w.id, w.name, w.gender, w.birthday,
      r.era, r.brand, r.alignment,
      a.starpower, a.workrate, a.charisma, a.mic, a.psychology,
      a.stamina, a.durability, a.consistency, a.likeability, a.momentum,
      a.morale, a.styleTags_json,
      c.annual AS contract_annual,
      c.expected_annual
    FROM roster_era r
    JOIN wrestlers w ON w.id = r.wrestler_id
    LEFT JOIN attributes a ON a.era = r.era AND a.wrestler_id = r.wrestler_id
    LEFT JOIN contracts c ON c.era = r.era AND c.wrestler_id = r.wrestler_id
    WHERE r.era = ?
    ORDER BY r.brand, w.name;
  `;

  const rows = db.prepare(sql).all(era);
  res.json({ ok: true, rows });
});
