-- ===== WWE DB AUDIT (safe read-only) =====

.headers on
.mode column

-- What eras exist?
SELECT era, COUNT(*) AS roster_rows
FROM roster_era
GROUP BY era
ORDER BY era;

-- Brand distribution for your target era
SELECT brand, COUNT(*) AS cnt
FROM roster_era
WHERE era=200404
GROUP BY brand
ORDER BY cnt DESC;

-- Any brands outside the canonical set?
SELECT brand, COUNT(*) AS cnt
FROM roster_era
WHERE era=200404
  AND TRIM(brand) NOT IN ('RAW','SD','FA')
GROUP BY brand
ORDER BY cnt DESC;

-- Missing attributes for roster entries
SELECT COUNT(*) AS missing_attrs
FROM roster_era r
LEFT JOIN attributes a
  ON a.era=r.era AND a.wrestler_id=r.wrestler_id
WHERE r.era=200404 AND a.wrestler_id IS NULL;

-- Missing contracts for signed (non-FA) roster entries
SELECT COUNT(*) AS missing_contracts_for_signed
FROM roster_era r
LEFT JOIN contracts c
  ON c.era=r.era AND c.wrestler_id=r.wrestler_id
WHERE r.era=200404
  AND r.brand IN ('RAW','SD')
  AND (c.wrestler_id IS NULL OR c.annual IS NULL OR c.annual<=0);

-- Duplicates (should be impossible because PK is (era,wrestler_id), but verify)
SELECT wrestler_id, COUNT(*) AS cnt
FROM roster_era
WHERE era=200404
GROUP BY wrestler_id
HAVING cnt>1;

-- Wrestlers who exist but aren't on 200404 roster (should be empty)
SELECT w.name
FROM wrestlers w
LEFT JOIN roster_era r
  ON r.wrestler_id=w.id AND r.era=200404
WHERE r.wrestler_id IS NULL
ORDER BY w.name;

-- People in roster_era but missing from wrestlers table (should be empty)
SELECT r.wrestler_id
FROM roster_era r
LEFT JOIN wrestlers w ON w.id=r.wrestler_id
WHERE r.era=200404 AND w.id IS NULL;

