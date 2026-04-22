// scripts/seed_era2001.cjs — Seed traits and morale for Era 2001
const Database = require('better-sqlite3');
const db = new Database('server/db/wwe.sqlite');

const getName = (name) => db.prepare("SELECT id FROM wrestlers WHERE name=?").get(name)?.id;

// ── Morale: WWF late 2001 (post-invasion, rocky period for many) ─────────
const moraleSeeds2001 = {
  'The Rock':              78,
  'Stone Cold Steve Austin': 70,
  'The Undertaker':        72,
  'Triple H':              68,  // recovering from quad injury
  'Kurt Angle':            80,  // WWF Champion, on top
  'Chris Jericho':         76,  // rising fast
  'Shawn Michaels':        65,  // still dealing with back injury, semi-retired
  'Ric Flair':             72,
  'Chris Benoit':          70,
  'Edge':                  74,
  'Jeff Hardy':            66,
  'Matt Hardy':            68,
  'Rob Van Dam':           76,  // invasion star, very motivated
  'Booker T':              70,  // post-invasion, adapting
  'Eddie Guerrero':        65,  // personal issues early 2001
  'Big Show':              62,
  'Kane':                  68,
  'Christian':             70,
  'Bubba Ray Dudley':      68,
  'D-Von Dudley':          68,
  'Rey Mysterio':          72,
  'Tajiri':                67,
  'William Regal':         70,
  'Scotty 2 Hotty':        66,
  'Bradshaw':              65,
  'Billy Gunn':            60,
  'Chuck Palumbo':         62,
  'Goldust':               64,
  'Al Snow':               63,
  'Raven':                 60,
  'Tazz':                  65,
  'Rhyno':                 68,
  'Lance Storm':           68,
  'Chris Jericho':         76,
  'Chavo Guerrero Jr.':   68,
  'Billy Kidman':          65,
  'Hardcore Holly':        63,
  'Test':                  60,
  'Spike Dudley':          64,
  'Funaki':                63,
  'AJ Styles':             70,
  'Christopher Daniels':  68,
  'Trish Stratus':         72,
  'Lita':                  70,
  'Molly Holly':           66,
  'Torrie Wilson':         65,
  'Stacy Keibler':         65,
  'Vince McMahon':         72,
};

const moraleStmt = db.prepare("UPDATE attributes SET morale=? WHERE era=2001 AND wrestler_id=(SELECT id FROM wrestlers WHERE name=?)");
let mUpdated = 0;
for (const [name, morale] of Object.entries(moraleSeeds2001)) {
  const r = moraleStmt.run(morale, name);
  if (r.changes) mUpdated++;
}
console.log('Era 2001 morale seeded:', mUpdated);

// ── Traits ─────────────────────────────────────────────────────────────────
const traitSeeds2001 = {
  'Stone Cold Steve Austin':  ['BrawlerCore','FanFavorite','Hothead','LockerRoomLeader','Veteran','FormerChampion','PartTime'],
  'The Rock':                 ['BrandCaptain','FanFavorite','FormerChampion','MediaFriendly','RingGeneral','Showman','PartTime'],
  'The Undertaker':           ['BrandCaptain','BrawlerCore','BulldogEnforcer','FormerChampion','LockerRoomLeader','Veteran'],
  'Triple H':                 ['BrandCaptain','FormerChampion','Politicker','PowerhouseCore','Opportunist'],
  'Kurt Angle':               ['Champion','FormerChampion','RingGeneral','Shooter','TechnicalAce','Workhorse'],
  'Chris Jericho':            ['FormerChampion','Innovator','Opportunist','Showman','Workhorse'],
  'Shawn Michaels':           ['FanFavorite','FormerChampion','RingGeneral','Showman','Veteran','ComebackTour'],
  'Ric Flair':                ['FormerChampion','LockerRoomLeader','RingGeneral','Showman','Veteran'],
  'Chris Benoit':             ['BulldogEnforcer','Shooter','TechnicalAce','Workhorse','SeriousPro'],
  'Edge':                     ['FanFavorite','FormerChampion','HighFlyerCore','TagTeamSpecialist','TeamPlayer'],
  'Jeff Hardy':               ['FanFavorite','FlashyRiskTaker','HighFlyerCore','Partier','TagTeamSpecialist'],
  'Matt Hardy':               ['FanFavorite','Innovator','TagTeamSpecialist','Workhorse','TeamPlayer'],
  'Rob Van Dam':              ['FanFavorite','FlashyRiskTaker','FormerChampion','HighFlyerCore','SpotMonkey'],
  'Booker T':                 ['FormerChampion','Showman','Workhorse','FanFavorite'],
  'Eddie Guerrero':           ['FormerChampion','HighFlyerCore','Innovator','Showman','TagTeamSpecialist'],
  'Big Show':                 ['BrawlerCore','BulldogEnforcer','FormerChampion','GiantFrame'],
  'Kane':                     ['BrawlerCore','BulldogEnforcer','FormerChampion','LoneWolf','PowerhouseCore'],
  'Christian':                ['Opportunist','Showman','TagTeamSpecialist','LoneWolf'],
  'Bubba Ray Dudley':         ['BrawlerCore','PowerhouseCore','TagTeamSpecialist','Workhorse'],
  'D-Von Dudley':             ['BrawlerCore','PowerhouseCore','TagTeamSpecialist','Workhorse'],
  'Rey Mysterio':             ['FanFavorite','HighFlyerCore','Innovator','SpotMonkey','Workhorse'],
  'Tajiri':                   ['HighFlyerCore','Innovator','TechnicalAce','Workhorse'],
  'William Regal':            ['BulldogEnforcer','RingGeneral','SeriousPro','TechnicalAce','Veteran'],
  'Bradshaw':                 ['BrawlerCore','BulldogEnforcer','PowerhouseCore','StiffWorker'],
  'Goldust':                  ['Comedian','Innovator','Showman','Veteran'],
  'Al Snow':                  ['BulldogEnforcer','PowerhouseCore','Trainer','Veteran'],
  'Raven':                    ['BrawlerCore','Innovator','LoneWolf','Opportunist'],
  'Tazz':                     ['BrawlerCore','BulldogEnforcer','Shooter','StiffWorker'],
  'Rhyno':                    ['BrawlerCore','BulldogEnforcer','PowerhouseCore'],
  'Lance Storm':              ['SeriousPro','TechnicalAce','Workhorse'],
  'AJ Styles':                ['HighFlyerCore','Innovator','TechnicalAce','Workhorse','Showman'],
  'Christopher Daniels':      ['HighFlyerCore','RingGeneral','TechnicalAce','Veteran'],
  'Trish Stratus':            ['FanFavorite','Showman','Workhorse'],
  'Lita':                     ['FanFavorite','HighFlyerCore','Innovator'],
  'Vince McMahon':            ['Politicker','Opportunist','BrandCaptain','AuthorityFigure'],
};

const traitStmt = db.prepare('INSERT OR IGNORE INTO wrestler_traits (era, wrestler_id, trait_id) VALUES (?, ?, ?)');
let tAdded = 0;
for (const [name, traits] of Object.entries(traitSeeds2001)) {
  const id = getName(name);
  if (!id) { console.log('  Not found:', name); continue; }
  for (const t of traits) {
    const r = traitStmt.run(2001, id, t);
    if (r.changes) tAdded++;
  }
}
console.log('Era 2001 trait entries added:', tAdded);

// ── Seed key era 2001 relationships ────────────────────────────────────────
const rels2001 = [
  // WWF main event rivalries (late 2001)
  ['Stone Cold Steve Austin', 'The Rock',        13, 25,  0, '["backstage"]'],
  ['Stone Cold Steve Austin', 'Triple H',         5, 10, 20, '["backstage"]'],
  ['Stone Cold Steve Austin', 'Kurt Angle',      -5,-10, 25, '["backstage","professional"]'],
  ['The Rock', 'Chris Jericho',                  -5,-10, 30, '["backstage","professional"]'],
  ['Triple H', 'Chris Jericho',                  -6,-12, 15, '["backstage"]'],
  ['Triple H', 'Shawn Michaels',                 13, 25,  0, '["backstage","former_stable"]'],
  ['Triple H', 'Ric Flair',                      15, 30,  0, '["backstage"]'],
  ['The Undertaker', 'Kane',                     18, 35,  0, '["backstage","family"]'],
  ['The Undertaker', 'Stone Cold Steve Austin',  -5,-10, 20, '["backstage"]'],
  ['Kurt Angle', 'Chris Benoit',                  3,  5, 40, '["backstage","professional"]'],
  // Tag teams
  ['Edge', 'Christian',                          18, 35,  0, '["backstage","tag"]'],
  ['Matt Hardy', 'Jeff Hardy',                   23, 45,  0, '["backstage","family","tag"]'],
  ['Bubba Ray Dudley', 'D-Von Dudley',           30, 60,  0, '["backstage","family","tag"]'],
  // Midcard
  ['Chris Jericho', 'Edge',                      18, 35,  0, '["backstage"]'],
  ['Chris Jericho', 'Christian',                 18, 35,  0, '["backstage"]'],
  ['Eddie Guerrero', 'Chavo Guerrero Jr.',       23, 45,  0, '["backstage","family"]'],
  ['Rob Van Dam', 'Sabu',                        15, 30,  0, '["backstage"]'],
  // Authority
  ['Vince McMahon', 'Triple H',                   5, 10,  0, '["backstage"]'],
  ['Vince McMahon', 'Ric Flair',                 -5,-10, 20, '["backstage"]'],
];

const nameToId = {};
db.prepare('SELECT id, name FROM wrestlers').all().forEach(w => { nameToId[w.name] = w.id; });

const relStmt = db.prepare(
  'INSERT INTO relationships (era, a_id, b_id, rapport, trust, pressure, flags_json) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(era, a_id, b_id) DO UPDATE SET rapport=excluded.rapport, trust=excluded.trust, pressure=excluded.pressure, flags_json=excluded.flags_json'
);

let rAdded = 0;
for (const [nameA, nameB, rapport, trust, pressure, flags] of rels2001) {
  const idA = nameToId[nameA];
  const idB = nameToId[nameB];
  if (!idA || !idB) { console.log('  SKIP:', nameA, '/', nameB); continue; }
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
  relStmt.run(2001, lo, hi, rapport, trust, pressure, flags);
  rAdded++;
}
console.log('Era 2001 relationships seeded:', rAdded);

// Final summary
const e1r = db.prepare('SELECT COUNT(*) as n FROM relationships WHERE era=2001').get().n;
const e1t = db.prepare('SELECT COUNT(DISTINCT wrestler_id) as n FROM wrestler_traits WHERE era=2001').get().n;
const e1roster = db.prepare('SELECT COUNT(*) as n FROM roster_era WHERE era=2001').get().n;
console.log('\nEra 2001 final: rels=' + e1r + ' wrestlers_with_traits=' + e1t + '/' + e1roster);

// ── Additional traits for era 2001 (second pass) ────────────────────────
const traits2001b = {
  'Billy Gunn':       ['BrawlerCore','PowerhouseCore','TagTeamSpecialist'],
  'Billy Kidman':     ['HighFlyerCore','SpotMonkey','TagTeamSpecialist'],
  'Chavo Guerrero Jr.':['HighFlyerCore','TagTeamSpecialist','Workhorse'],
  'Chuck Palumbo':    ['BrawlerCore','PowerhouseCore','TagTeamSpecialist'],
  'Hardcore Holly':   ['BrawlerCore','StiffWorker','Veteran'],
  'Jushin Thunder Liger':['FormerChampion','HighFlyerCore','RingGeneral','TechnicalAce','Veteran'],
  'Juventud Guerrera':['HighFlyerCore','SpotMonkey','FlashyRiskTaker'],
  'Little Guido':     ['TechnicalAce','Workhorse','StableMember'],
  'Low Ki':           ['Shooter','StiffWorker','HighFlyerCore','Workhorse'],
  'Molly Holly':      ['SeriousPro','Workhorse','TechnicalAce'],
  'Psicosis':         ['HighFlyerCore','SpotMonkey','FlashyRiskTaker'],
  'Sabu':             ['BrawlerCore','FlashyRiskTaker','HighFlyerCore','LoneWolf','UnsafeWorker'],
  'Samoa Joe':        ['BrawlerCore','BulldogEnforcer','PowerhouseCore','Shooter','Workhorse'],
  'Scotty 2 Hotty':   ['Comedian','FanFavorite','HighFlyerCore'],
  'Stacy Keibler':    ['MediaFriendly','FanFavorite'],
  'Stephanie McMahon':['AuthorityFigure','Politicker'],
  'Super Crazy':      ['HighFlyerCore','SpotMonkey','FlashyRiskTaker'],
  'Test':             ['BrawlerCore','PowerhouseCore'],
  'The Hurricane':    ['Comedian','FanFavorite','HighFlyerCore','Innovator','Showman'],
  'Torrie Wilson':    ['MediaFriendly','FanFavorite'],
};

let t2 = 0;
for (const [name, traits] of Object.entries(traits2001b)) {
  const id = getName(name);
  if (!id) { console.log('Not found:', name); continue; }
  for (const t of traits) {
    const r = traitStmt.run(2001, id, t);
    if (r.changes) t2++;
  }
}
console.log('Era 2001 additional traits:', t2);
const final = db.prepare('SELECT COUNT(DISTINCT wrestler_id) as n FROM wrestler_traits WHERE era=2001').get().n;
const total = db.prepare('SELECT COUNT(*) as n FROM roster_era WHERE era=2001').get().n;
console.log('Era 2001 trait coverage now:', final + '/' + total);
