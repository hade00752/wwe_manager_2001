PRAGMA foreign_keys = ON;

-- Core wrestler identity
CREATE TABLE IF NOT EXISTS wrestlers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  gender        TEXT NOT NULL CHECK (gender IN ('M','F')),
  birthday      TEXT,              -- keep your DD-MM-YYYY string for now
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Era/season roster placement (brand + alignment can change by era)
CREATE TABLE IF NOT EXISTS roster_era (
  era           INTEGER NOT NULL,  -- e.g., 2001
  wrestler_id   INTEGER NOT NULL,
  brand         TEXT NOT NULL,      -- RAW/SD/FA
  alignment     TEXT NOT NULL CHECK (alignment IN ('face','heel','neutral')),
  PRIMARY KEY (era, wrestler_id),
  FOREIGN KEY (wrestler_id) REFERENCES wrestlers(id) ON DELETE CASCADE
);

-- Contracts by era
CREATE TABLE IF NOT EXISTS contracts (
  era           INTEGER NOT NULL,
  wrestler_id   INTEGER NOT NULL,
  annual        INTEGER NOT NULL,
  PRIMARY KEY (era, wrestler_id),
  FOREIGN KEY (wrestler_id) REFERENCES wrestlers(id) ON DELETE CASCADE
);

-- “Legacy” attributes by era (your ATTR_OVERRIDES / defaults output)
CREATE TABLE IF NOT EXISTS attributes (
  era           INTEGER NOT NULL,
  wrestler_id   INTEGER NOT NULL,

  starpower     INTEGER, workrate INTEGER, charisma INTEGER, mic INTEGER, psychology INTEGER,
  stamina       INTEGER, durability INTEGER, consistency INTEGER, likeability INTEGER, momentum INTEGER,

  -- store tags as JSON text (SQLite doesn’t have real arrays)
  styleTags_json TEXT,

  PRIMARY KEY (era, wrestler_id),
  FOREIGN KEY (wrestler_id) REFERENCES wrestlers(id) ON DELETE CASCADE
);

-- Trait catalog (optional if you already have traits.js, but useful for validation + editors)
CREATE TABLE IF NOT EXISTS traits (
  id            TEXT PRIMARY KEY,   -- e.g. "Showman"
  category      TEXT NOT NULL CHECK (category IN ('core','status','rare')),
  description   TEXT
);

-- Traits assigned to wrestlers by era (your TRAIT_SEED_2003)
CREATE TABLE IF NOT EXISTS wrestler_traits (
  era           INTEGER NOT NULL,
  wrestler_id   INTEGER NOT NULL,
  trait_id      TEXT NOT NULL,
  PRIMARY KEY (era, wrestler_id, trait_id),
  FOREIGN KEY (wrestler_id) REFERENCES wrestlers(id) ON DELETE CASCADE,
  FOREIGN KEY (trait_id) REFERENCES traits(id) ON DELETE CASCADE
);

-- Trigger to keep updated_at fresh
CREATE TRIGGER IF NOT EXISTS trg_wrestlers_updated
AFTER UPDATE ON wrestlers
FOR EACH ROW
BEGIN
  UPDATE wrestlers SET updated_at = datetime('now') WHERE id = OLD.id;
END;
