// public/js/data.js
import { RAW, SD, FA, clamp } from "./util.js?v=1755554537";

/* ------------------------------------------------------------------ */
/* Titles                                                             */
/* ------------------------------------------------------------------ */
export const TITLES = {
  [RAW]: ["World","Intercontinental","Tag","Women"],
  [SD]:  ["World","United States","Tag","Cruiserweight"],
  [FA]:  [],
};

/* ------------------------------------------------------------------ */
/* Base roster: name, gender, brand, alignment                        */
/* ------------------------------------------------------------------ */
export const BASE_ROSTER = [
  ["The Rock","M",RAW,"face"],["Stone Cold Steve Austin","M",RAW,"face"],["Triple H","M",RAW,"heel"],
  ["The Undertaker","M",SD,"face"],["Kurt Angle","M",SD,"heel"],["Mick Foley","M",RAW,"face"],
  ["Kane","M",RAW,"face"],["Big Show","M",SD,"neutral"],["Chris Jericho","M",RAW,"neutral"],
  ["Chris Benoit","M",SD,"neutral"],["Eddie Guerrero","M",SD,"heel"],["Rikishi","M",SD,"face"],
  ["Edge","M",SD,"face"],["Christian","M",RAW,"heel"],["William Regal","M",RAW,"heel"],
  ["Test","M",RAW,"heel"],["Booker T","M",RAW,"heel"],["Rob Van Dam","M",RAW,"face"],
  ["Diamond Dallas Page","M",SD,"face"],["Goldust","M",RAW,"neutral"],

  ["Matt Hardy","M",SD,"face"],["Jeff Hardy","M",SD,"face"],["Bubba Ray Dudley","M",RAW,"heel"],
  ["D-Von Dudley","M",RAW,"heel"],["Bradshaw","M",RAW,"neutral"],["Faarooq","M",RAW,"neutral"],
  ["Road Dogg","M",RAW,"face"],["Billy Gunn","M",RAW,"face"],["X-Pac","M",RAW,"heel"],
  ["Scotty 2 Hotty","M",SD,"face"],["Grandmaster Sexay","M",SD,"face"],
  ["Chuck Palumbo","M",SD,"heel"],["Sean O’Haire","M",SD,"heel"],["The Hurricane","M",RAW,"face"],

  ["Hardcore Holly","M",SD,"neutral"],["Crash Holly","M",SD,"face"],["Al Snow","M",RAW,"face"],
  ["Perry Saturn","M",RAW,"heel"],["Dean Malenko","M",RAW,"heel"],["Steve Blackman","M",RAW,"face"],
  ["Val Venis","M",RAW,"neutral"],["Tazz","M",SD,"neutral"],["Raven","M",RAW,"heel"],
  ["Rhyno","M",SD,"heel"],["Tajiri","M",RAW,"face"],["Tommy Dreamer","M",RAW,"face"],["Justin Credible","M",RAW,"heel"],

  ["Lance Storm","M",SD,"heel"],["Mike Awesome","M",RAW,"heel"],["Hugh Morrus","M",SD,"heel"],
  ["Kanyon","M",RAW,"heel"],["Billy Kidman","M",SD,"face"],["Chavo Guerrero Jr.","M",SD,"heel"],
  ["Brian Adams (KroniK)","M",SD,"heel"],["Bryan Clark (KroniK)","M",SD,"heel"],

  // Free Agency (unassigned, era: April 2001 — WCW/ECW/Int’l)
  ["Sting","M",FA,"face"],["Goldberg","M",FA,"face"],["Ric Flair","M",FA,"face"],
  ["Hulk Hogan","M",FA,"face"],["Kevin Nash","M",FA,"heel"],["Scott Hall","M",FA,"heel"],
  ["Scott Steiner","M",FA,"heel"],["Rey Mysterio","M",FA,"face"],["Juventud Guerrera","M",FA,"face"],
  ["Psicosis","M",FA,"heel"],["L.A. Park","M",FA,"heel"],["Konnan","M",FA,"face"],
  ["Sabu","M",FA,"neutral"],["The Sandman","M",FA,"face"],["Jerry Lynn","M",FA,"face"],
  ["Super Crazy","M",FA,"face"],["Kid Kash","M",FA,"face"],["Little Guido","M",FA,"heel"],
  ["Steve Corino","M",FA,"heel"],["AJ Styles","M",FA,"face"],["Christopher Daniels","M",FA,"heel"],
  ["Samoa Joe","M",FA,"neutral"],["Low Ki","M",FA,"neutral"],
  ["Jushin Thunder Liger","M",FA,"face"],["The Great Muta","M",FA,"heel"],["Masahiro Chono","M",FA,"heel"],
  ["Vampiro","M",FA,"heel"],["Lex Luger","M",FA,"heel"],["Buff Bagwell","M",FA,"heel"],

  // Women
  ["Lita","F",RAW,"face"],["Trish Stratus","F",SD,"face"],["Chyna","F",RAW,"neutral"],["Ivory","F",RAW,"heel"],
  ["Stephanie McMahon","F",SD,"heel"],["Jacqueline","F",SD,"neutral"],["Tori","F",RAW,"heel"],
  ["Molly Holly","F",RAW,"face"],["Torrie Wilson","F",SD,"face"],["Stacy Keibler","F",RAW,"heel"],

  // Occasional
  ["Vince McMahon","M",SD,"heel"],["Shane McMahon","M",SD,"face"],["Jerry Lawler","M",RAW,"neutral"],["Jim Ross","M",RAW,"face"]
];

/* ------------------------------------------------------------------ */
/* Birthdays (DD-MM-YYYY). Fallback: 01-01-1975                       */
/* ------------------------------------------------------------------ */
export const BIRTHDAY_OVERRIDES = {
  "The Rock":"02-05-1972","Stone Cold Steve Austin":"18-12-1964","Triple H":"27-07-1969",
  "The Undertaker":"24-03-1965","Kurt Angle":"09-12-1968","Mick Foley":"07-06-1965",
  "Kane":"26-04-1967","Big Show":"08-02-1972","Chris Jericho":"09-11-1970",
  "Chris Benoit":"21-05-1967","Eddie Guerrero":"09-10-1967","Rikishi":"11-10-1965",
  "Edge":"30-10-1973","Christian":"30-11-1973","William Regal":"10-05-1968",
  "Test":"17-03-1975","Booker T":"01-03-1965","Rob Van Dam":"18-12-1970",
  "Diamond Dallas Page":"05-04-1956","Goldust":"11-04-1969",

  "Matt Hardy":"23-09-1974","Jeff Hardy":"31-08-1977","Bubba Ray Dudley":"14-07-1971",
  "D-Von Dudley":"01-08-1972","Bradshaw":"29-11-1966","Faarooq":"15-05-1958",
  "Road Dogg":"20-05-1969","Billy Gunn":"01-11-1963","X-Pac":"13-07-1972",
  "Scotty 2 Hotty":"02-07-1973","Grandmaster Sexay":"10-01-1972",

  "Chuck Palumbo":"15-06-1971","Sean O’Haire":"25-02-1971","The Hurricane":"12-07-1974",

  "Hardcore Holly":"29-01-1963","Crash Holly":"25-08-1971","Al Snow":"18-07-1963",
  "Perry Saturn":"25-10-1966","Dean Malenko":"04-08-1960","Steve Blackman":"28-09-1963",
  "Val Venis":"06-03-1971","Tazz":"11-10-1967","Raven":"08-09-1964",
  "Rhyno":"07-10-1975","Tajiri":"29-09-1970","Tommy Dreamer":"13-02-1971","Justin Credible":"16-10-1973",

  "Lance Storm":"03-04-1969","Mike Awesome":"24-01-1965","Hugh Morrus":"10-11-1966",
  "Kanyon":"04-01-1970","Billy Kidman":"29-05-1974","Chavo Guerrero Jr.":"20-10-1970",
  "Brian Adams (KroniK)":"14-04-1964","Bryan Clark (KroniK)":"14-03-1964",

  // Free Agents (Apr 2001)
  "Sting":"20-03-1959","Goldberg":"27-12-1966","Ric Flair":"25-02-1949",
  "Hulk Hogan":"11-08-1953","Kevin Nash":"09-07-1959","Scott Hall":"20-10-1958",
  "Scott Steiner":"29-07-1962","Rey Mysterio":"11-12-1974","Juventud Guerrera":"23-11-1974",
  "Psicosis":"22-09-1971","L.A. Park":"14-11-1965","Konnan":"06-01-1964",
  "Sabu":"12-12-1964","The Sandman":"09-06-1963","Jerry Lynn":"12-03-1963",
  "Super Crazy":"03-12-1973","Kid Kash":"31-07-1969","Little Guido":"12-03-1972",
  "Steve Corino":"29-05-1973","AJ Styles":"02-06-1977","Christopher Daniels":"24-03-1970",
  "Samoa Joe":"17-03-1979","Low Ki":"06-09-1979",
  "Jushin Thunder Liger":"30-11-1964","The Great Muta":"23-12-1962","Masahiro Chono":"17-09-1963",
  "Vampiro":"31-10-1967","Lex Luger":"02-06-1958","Buff Bagwell":"10-01-1970",

  "Shawn Michaels":"22-07-1965",
  "D'Lo Brown":"22-10-1973",

  "Lita":"14-04-1975","Trish Stratus":"18-12-1975","Chyna":"27-12-1969","Ivory":"26-11-1961",
  "Stephanie McMahon":"24-09-1976","Jacqueline":"06-07-1964","Tori":"20-03-1965",
  "Molly Holly":"07-09-1977","Torrie Wilson":"24-07-1975","Stacy Keibler":"14-10-1979",

  "Vince McMahon":"24-08-1945","Shane McMahon":"15-01-1970","Jerry Lawler":"29-11-1949","Jim Ross":"03-01-1952"
};

/* ------------------------------------------------------------------ */
/* Attribute helpers                                                  */
/* ------------------------------------------------------------------ */
// Old override shape -> stored with readable keys
const A = (o)=>({
  starpower:o.sp, workrate:o.wr, charisma:o.ch, mic:o.mc, psychology:o.ps,
  stamina:o.sta, durability:o.dur, consistency:o.con, likeability:o.lk, momentum:o.mo,
  styleTags:o.tags||[]
});

// Derive the new stats from existing ones + tags.
// Adds: reputation, chemistry, strengthPower, agility, athleticism, ringSafety (deterministic).
function normalizeTo15(base, tags){
  const t = (tags||[]).map(s=>s.toLowerCase());
  const has = (k)=> t.includes(k.toLowerCase()) || t.some(s=>s.indexOf(k.toLowerCase())>=0);

  // Strength/Power baseline from durability/workrate + tag bias
  let strengthPower = Math.round((base.durability*0.45 + base.workrate*0.15 + base.stamina*0.2) + (has("power")||has("giant")||has("powerhouse")?10:0));
  // Agility baseline from workrate/stamina + tag bias
  let agility = Math.round((base.workrate*0.45 + base.stamina*0.25 + base.charisma*0.05) + (has("high flyer")||has("cruiser")||has("daredevil")?10:0));
  // Athleticism blends both + stamina
  let athleticism = Math.round((strengthPower*0.4 + agility*0.4 + base.stamina*0.2));

  // Reputation emphasizes consistency, psych, era starpower
  let reputation = Math.round((base.consistency*0.4 + base.psychology*0.35 + base.starpower*0.25));
  // Chemistry leans on psych + consistency; tag specialists get a bump
  let chemistry = Math.round((base.psychology*0.55 + base.consistency*0.35) + (has("tag specialist")?6:0));

  // Deterministic Ring Safety: durability + consistency + psychology + light tag bias
  let ringSafety = Math.round(
    base.durability*0.45 + base.consistency*0.30 + base.psychology*0.15 + base.stamina*0.10
    + (has("technical")||has("veteran")? +6 : 0)
    + (has("hardcore")||has("daredevil")? -6 : 0)
  );

  // Clamp to engine bounds 30..99
  const c = (v)=>clamp(v,30,99);

  return {
    starpower: c(base.starpower),
    reputation: c(reputation),
    likeability: c(base.likeability),
    consistency: c(base.consistency),
    momentum: c(base.momentum),

    workrate: c(base.workrate),
    psychology: c(base.psychology),
    charisma: c(base.charisma),
    mic: c(base.mic),
    chemistry: c(chemistry),

    stamina: c(base.stamina),
    durability: c(base.durability),
    strengthPower: c(strengthPower),
    agility: c(agility),
    athleticism: c(athleticism),

    ringSafety: c(ringSafety),

    styleTags: (tags||[])
  };
}

/* ------------------------------------------------------------------ */
/* Hand-tuned era attributes                                          */
/* ------------------------------------------------------------------ */
export const ATTR_OVERRIDES = {
  "The Rock": A({ sp:99, wr:77, ch:99, mc:99, ps:82, sta:86, dur:84, con:86, lk:93, mo:70, tags:["Main Event","Showman"] }),
  "Stone Cold Steve Austin": A({ sp:98, wr:74, ch:96, mc:95, ps:84, sta:82, dur:88, con:88, lk:90, mo:68, tags:["Main Event","Brawler"] }),
  "Triple H": A({ sp:95, wr:84, ch:88, mc:88, ps:90, sta:83, dur:86, con:90, lk:72, mo:65, tags:["Main Event","Powerhouse"] }),
  "The Undertaker": A({ sp:96, wr:76, ch:84, mc:80, ps:86, sta:80, dur:90, con:85, lk:85, mo:66, tags:["Main Event","Powerhouse"] }),
  "Kurt Angle": A({ sp:92, wr:92, ch:86, mc:86, ps:92, sta:86, dur:84, con:92, lk:78, mo:64, tags:["Main Event","Technical"] }),
  "Mick Foley": A({ sp:90, wr:72, ch:90, mc:92, ps:85, sta:78, dur:82, con:80, lk:88, mo:62, tags:["Hardcore","Showman"] }),
  "Kane": A({ sp:90, wr:71, ch:72, mc:70, ps:78, sta:84, dur:90, con:82, lk:88, mo:72, tags:["Powerhouse"] }),
  "Big Show": A({ sp:88, wr:66, ch:68, mc:66, ps:74, sta:76, dur:92, con:76, lk:70, mo:60, tags:["Giant","Powerhouse"] }),
  "Chris Jericho": A({ sp:89, wr:84, ch:88, mc:88, ps:84, sta:82, dur:78, con:86, lk:83, mo:70, tags:["Technical","Showman"] }),

  "Chris Benoit": A({ sp:84, wr:93, ch:60, mc:60, ps:94, sta:86, dur:84, con:94, lk:70, mo:68, tags:["Technical"] }),
  "Eddie Guerrero": A({ sp:86, wr:90, ch:82, mc:82, ps:90, sta:84, dur:78, con:90, lk:78, mo:66, tags:["Technical"] }),
  "Rikishi": A({ sp:78, wr:68, ch:70, mc:68, ps:72, sta:80, dur:80, con:74, lk:82, mo:64, tags:["Powerhouse"] }),
  "Edge": A({ sp:86, wr:82, ch:78, mc:78, ps:80, sta:82, dur:78, con:82, lk:84, mo:66, tags:["All-Rounder"] }),
  "Christian": A({ sp:80, wr:80, ch:76, mc:76, ps:80, sta:78, dur:76, con:84, lk:68, mo:60, tags:["All-Rounder"] }),
  "William Regal": A({ sp:74, wr:84, ch:72, mc:72, ps:90, sta:78, dur:78, con:90, lk:60, mo:56, tags:["Technical"] }),
  "Test": A({ sp:76, wr:70, ch:64, mc:64, ps:70, sta:78, dur:82, con:72, lk:58, mo:56, tags:["Powerhouse"] }),
  "Booker T": A({ sp:88, wr:85, ch:82, mc:82, ps:84, sta:84, dur:80, con:86, lk:88, mo:74, tags:["All-Rounder"] }),
  "Rob Van Dam": A({ sp:86, wr:88, ch:78, mc:76, ps:80, sta:86, dur:72, con:84, lk:84, mo:72, tags:["High Flyer"] }),
  "Diamond Dallas Page": A({ sp:82, wr:74, ch:82, mc:80, ps:78, sta:78, dur:78, con:78, lk:80, mo:60, tags:["Showman"] }),
  "Goldust": A({ sp:78, wr:68, ch:80, mc:80, ps:76, sta:74, dur:74, con:80, lk:72, mo:60, tags:["Character"] }),

  "Matt Hardy": A({ sp:78, wr:80, ch:72, mc:72, ps:78, sta:86, dur:70, con:84, lk:82, mo:64, tags:["High Flyer"] }),
  "Jeff Hardy": A({ sp:86, wr:82, ch:76, mc:74, ps:74, sta:88, dur:64, con:76, lk:88, mo:68, tags:["High Flyer"] }),
  "Bubba Ray Dudley": A({ sp:74, wr:72, ch:70, mc:70, ps:78, sta:78, dur:82, con:80, lk:68, mo:58, tags:["Brawler","Tag Specialist"] }),
  "D-Von Dudley": A({ sp:72, wr:72, ch:68, mc:68, ps:78, sta:78, dur:80, con:80, lk:64, mo:56, tags:["Brawler","Tag Specialist"] }),
  "Bradshaw": A({ sp:76, wr:70, ch:64, mc:64, ps:72, sta:78, dur:84, con:76, lk:60, mo:56, tags:["Brawler","Powerhouse"] }),
  "Faarooq": A({ sp:74, wr:68, ch:62, mc:62, ps:72, sta:76, dur:84, con:76, lk:60, mo:54, tags:["Brawler","Powerhouse"] }),
  "Road Dogg": A({ sp:74, wr:62, ch:78, mc:78, ps:70, sta:70, dur:70, con:72, lk:76, mo:56, tags:["Showman"] }),
  "Billy Gunn": A({ sp:78, wr:70, ch:68, mc:68, ps:72, sta:78, dur:78, con:74, lk:70, mo:56, tags:["Powerhouse"] }),
  "X-Pac": A({ sp:78, wr:80, ch:70, mc:70, ps:76, sta:82, dur:70, con:78, lk:64, mo:58, tags:["Cruiser"] }),
  "Scotty 2 Hotty": A({ sp:70, wr:68, ch:72, mc:72, ps:70, sta:80, dur:68, con:76, lk:78, mo:56, tags:["Showman"] }),
  "Grandmaster Sexay": A({ sp:70, wr:68, ch:72, mc:72, ps:68, sta:78, dur:68, con:72, lk:76, mo:54, tags:["Showman"] }),

  "Chuck Palumbo": A({ sp:72, wr:70, ch:62, mc:62, ps:70, sta:78, dur:80, con:72, lk:58, mo:54, tags:["Powerhouse"] }),
  "Sean O’Haire": A({ sp:74, wr:72, ch:62, mc:62, ps:70, sta:80, dur:80, con:72, lk:58, mo:54, tags:["Powerhouse"] }),
  "The Hurricane": A({ sp:74, wr:72, ch:78, mc:78, ps:72, sta:80, dur:70, con:78, lk:82, mo:58, tags:["Character","Cruiser"] }),

  "Hardcore Holly": A({ sp:70, wr:74, ch:60, mc:60, ps:76, sta:78, dur:80, con:82, lk:56, mo:52, tags:["Brawler"] }),
  "Crash Holly": A({ sp:64, wr:66, ch:62, mc:62, ps:68, sta:78, dur:64, con:74, lk:68, mo:52, tags:["Cruiser"] }),
  "Al Snow": A({ sp:68, wr:72, ch:66, mc:66, ps:76, sta:74, dur:70, con:78, lk:68, mo:56, tags:["All-Rounder"] }),
  "Perry Saturn": A({ sp:72, wr:82, ch:60, mc:60, ps:84, sta:80, dur:78, con:84, lk:56, mo:56, tags:["Technical"] }),
  "Dean Malenko": A({ sp:70, wr:90, ch:58, mc:58, ps:92, sta:76, dur:74, con:94, lk:54, mo:54, tags:["Technical"] }),
  "Steve Blackman": A({ sp:66, wr:74, ch:56, mc:56, ps:74, sta:78, dur:76, con:82, lk:58, mo:54, tags:["Striker"] }),
  "Val Venis": A({ sp:70, wr:72, ch:66, mc:66, ps:74, sta:76, dur:74, con:76, lk:64, mo:54, tags:["All-Rounder"] }),
  "Tazz": A({ sp:74, wr:76, ch:64, mc:64, ps:82, sta:74, dur:82, con:82, lk:58, mo:54, tags:["Brawler","Suplex"] }),
  "Raven": A({ sp:72, wr:68, ch:76, mc:76, ps:82, sta:74, dur:76, con:78, lk:62, mo:54, tags:["Hardcore","Psychology"] }),
  "Rhyno": A({ sp:76, wr:74, ch:60, mc:60, ps:74, sta:76, dur:84, con:76, lk:58, mo:56, tags:["Powerhouse"] }),
  "Tajiri": A({ sp:74, wr:82, ch:62, mc:62, ps:78, sta:80, dur:68, con:82, lk:70, mo:56, tags:["Cruiser","Striker"] }),
  "Tommy Dreamer": A({ sp:70, wr:68, ch:66, mc:66, ps:72, sta:78, dur:78, con:72, lk:68, mo:54, tags:["Hardcore"] }),
  "Justin Credible": A({ sp:68, wr:72, ch:62, mc:62, ps:74, sta:76, dur:70, con:76, lk:58, mo:52, tags:["All-Rounder"] }),

  "Lance Storm": A({ sp:74, wr:88, ch:58, mc:58, ps:90, sta:80, dur:76, con:92, lk:56, mo:56, tags:["Technical"] }),
  "Mike Awesome": A({ sp:74, wr:78, ch:60, mc:60, ps:74, sta:80, dur:82, con:76, lk:58, mo:54, tags:["Power Cruiser"] }),
  "Hugh Morrus": A({ sp:68, wr:70, ch:58, mc:58, ps:70, sta:76, dur:80, con:72, lk:54, mo:50, tags:["Powerhouse"] }),
  "Kanyon": A({ sp:72, wr:78, ch:62, mc:62, ps:76, sta:78, dur:74, con:80, lk:58, mo:52, tags:["Innovator"] }),
  "Billy Kidman": A({ sp:76, wr:84, ch:62, mc:62, ps:76, sta:84, dur:68, con:80, lk:74, mo:56, tags:["High Flyer"] }),
  "Chavo Guerrero Jr.": A({ sp:72, wr:82, ch:62, mc:62, ps:82, sta:80, dur:70, con:82, lk:62, mo:54, tags:["Technical"] }),
  "Brian Adams (KroniK)": A({ sp:72, wr:70, ch:58, mc:58, ps:70, sta:78, dur:84, con:74, lk:56, mo:52, tags:["Powerhouse","Tag Specialist"] }),
  "Bryan Clark (KroniK)": A({ sp:72, wr:70, ch:58, mc:58, ps:70, sta:78, dur:84, con:74, lk:56, mo:52, tags:["Powerhouse","Tag Specialist"] }),

  // Free Agents (Apr 2001)
  "Sting": A({ sp:95, wr:80, ch:85, mc:80, ps:85, sta:80, dur:85, con:88, lk:85, mo:60, tags:["Legend","Main Event","All-Rounder","Veteran"] }),
  "Goldberg": A({ sp:94, wr:73, ch:70, mc:65, ps:70, sta:78, dur:90, con:70, lk:75, mo:65, tags:["Powerhouse"] }),
  "Ric Flair": A({ sp:96, wr:86, ch:94, mc:95, ps:95, sta:76, dur:74, con:92, lk:80, mo:60, tags:["Legend","Technical","Veteran"] }),
  "Hulk Hogan": A({ sp:97, wr:60, ch:95, mc:93, ps:75, sta:68, dur:78, con:80, lk:92, mo:55, tags:["Legend","Showman","Powerhouse","Veteran"] }),
  "Kevin Nash": A({ sp:88, wr:62, ch:78, mc:78, ps:74, sta:70, dur:84, con:78, lk:70, mo:58, tags:["Powerhouse","Veteran"] }),
  "Scott Hall": A({ sp:86, wr:74, ch:82, mc:82, ps:80, sta:74, dur:78, con:80, lk:75, mo:58, tags:["All-Rounder","Veteran"] }),
  "Scott Steiner": A({ sp:88, wr:78, ch:70, mc:68, ps:78, sta:82, dur:86, con:78, lk:65, mo:58, tags:["Powerhouse","Suplex"] }),
  "Rey Mysterio": A({ sp:86, wr:90, ch:78, mc:74, ps:80, sta:86, dur:66, con:84, lk:88, mo:64, tags:["High Flyer","Cruiser"] }),
  "Juventud Guerrera": A({ sp:78, wr:84, ch:72, mc:70, ps:78, sta:82, dur:64, con:78, lk:74, mo:60, tags:["High Flyer","Cruiser"] }),
  "Psicosis": A({ sp:76, wr:80, ch:68, mc:66, ps:76, sta:80, dur:66, con:76, lk:70, mo:58, tags:["High Flyer","Cruiser"] }),
  "L.A. Park": A({ sp:80, wr:76, ch:84, mc:80, ps:78, sta:78, dur:74, con:78, lk:82, mo:60, tags:["Showman","Luchador"] }),
  "Konnan": A({ sp:82, wr:70, ch:84, mc:84, ps:74, sta:72, dur:70, con:72, lk:78, mo:58, tags:["Showman"] }),
  "Sabu": A({ sp:80, wr:74, ch:60, mc:58, ps:68, sta:82, dur:62, con:60, lk:70, mo:60, tags:["Hardcore","High Flyer","Daredevil"] }),
  "The Sandman": A({ sp:74, wr:52, ch:66, mc:66, ps:58, sta:70, dur:68, con:58, lk:72, mo:52, tags:["Hardcore","Brawler"] }),
  "Jerry Lynn": A({ sp:78, wr:86, ch:70, mc:70, ps:84, sta:82, dur:74, con:86, lk:70, mo:58, tags:["Technical","Veteran"] }),
  "Super Crazy": A({ sp:76, wr:82, ch:70, mc:68, ps:76, sta:82, dur:66, con:76, lk:74, mo:58, tags:["High Flyer"] }),
  "Kid Kash": A({ sp:72, wr:78, ch:66, mc:66, ps:74, sta:80, dur:64, con:74, lk:70, mo:56, tags:["Cruiser","High Flyer"] }),
  "Little Guido": A({ sp:70, wr:78, ch:62, mc:62, ps:80, sta:78, dur:66, con:82, lk:64, mo:54, tags:["Technical"] }),
  "Steve Corino": A({ sp:76, wr:74, ch:76, mc:76, ps:78, sta:78, dur:72, con:80, lk:68, mo:56, tags:["Brawler","Technical"] }),
  "AJ Styles": A({ sp:76, wr:84, ch:70, mc:68, ps:74, sta:84, dur:66, con:78, lk:76, mo:58, tags:["High Flyer"] }),
  "Christopher Daniels": A({ sp:74, wr:82, ch:72, mc:72, ps:82, sta:80, dur:74, con:84, lk:70, mo:56, tags:["All-Rounder"] }),
  "Samoa Joe": A({ sp:78, wr:80, ch:66, mc:66, ps:76, sta:86, dur:82, con:80, lk:70, mo:56, tags:["Powerhouse","Striker"] }),
  "Low Ki": A({ sp:72, wr:84, ch:60, mc:60, ps:78, sta:84, dur:66, con:78, lk:66, mo:56, tags:["Striker","High Flyer"] }),
  "Jushin Thunder Liger": A({ sp:88, wr:90, ch:78, mc:76, ps:88, sta:82, dur:78, con:92, lk:80, mo:60, tags:["Legend","High Flyer","Technical","Veteran"] }),
  "The Great Muta": A({ sp:90, wr:84, ch:82, mc:80, ps:86, sta:78, dur:78, con:86, lk:78, mo:58, tags:["Legend","Showman","Veteran"] }),
  "Masahiro Chono": A({ sp:86, wr:78, ch:78, mc:78, ps:84, sta:76, dur:78, con:86, lk:72, mo:56, tags:["Technical","Veteran"] }),
  "Vampiro": A({ sp:78, wr:74, ch:78, mc:74, ps:72, sta:76, dur:72, con:74, lk:76, mo:56, tags:["Character"] }),
  "Lex Luger": A({ sp:85, wr:60, ch:70, mc:68, ps:68, sta:70, dur:78, con:72, lk:62, mo:52, tags:["Powerhouse","Veteran"] }),
  "Buff Bagwell": A({ sp:78, wr:68, ch:76, mc:74, ps:70, sta:74, dur:72, con:72, lk:72, mo:54, tags:["Showman"] }),

  // Free Agency (unassigned)
  "Shawn Michaels": A({ sp:95, wr:86, ch:95, mc:92, ps:94, sta:72, dur:60, con:92, lk:90, mo:58, tags:["Legend","Showman","Technical"] }),
  "D'Lo Brown": A({ sp:72, wr:78, ch:70, mc:70, ps:76, sta:82, dur:76, con:78, lk:74, mo:60, tags:["All-Rounder"] }),

  /* Women (era-appropriate) */
  "Lita": A({ sp:82, wr:78, ch:80, mc:76, ps:74, sta:82, dur:68, con:78, lk:88, mo:68, tags:["High Flyer"] }),
  "Trish Stratus": A({ sp:84, wr:74, ch:82, mc:80, ps:74, sta:80, dur:68, con:80, lk:90, mo:66, tags:["Showman"] }),
  "Chyna": A({ sp:88, wr:72, ch:68, mc:66, ps:74, sta:80, dur:86, con:74, lk:76, mo:62, tags:["Powerhouse"] }),
  "Ivory": A({ sp:72, wr:70, ch:70, mc:70, ps:74, sta:78, dur:70, con:80, lk:68, mo:56, tags:["All-Rounder"] }),
  "Stephanie McMahon": A({ sp:76, wr:45, ch:78, mc:80, ps:68, sta:60, dur:60, con:68, lk:60, mo:54, tags:["Manager","Authority"] }),
  "Jacqueline": A({ sp:70, wr:74, ch:66, mc:66, ps:74, sta:80, dur:72, con:82, lk:66, mo:56, tags:["Veteran"] }),
  "Tori": A({ sp:66, wr:60, ch:64, mc:64, ps:66, sta:70, dur:66, con:68, lk:60, mo:52, tags:["Manager"] }),
  "Molly Holly": A({ sp:74, wr:78, ch:70, mc:70, ps:76, sta:82, dur:70, con:84, lk:82, mo:60, tags:["Technical"] }),
  "Torrie Wilson": A({ sp:78, wr:58, ch:76, mc:74, ps:64, sta:70, dur:64, con:66, lk:82, mo:56, tags:["Showman"] }),
  "Stacy Keibler": A({ sp:78, wr:52, ch:78, mc:76, ps:62, sta:68, dur:62, con:64, lk:80, mo:54, tags:["Manager","Showman"] }),

  /* Authority/announcers */
  "Vince McMahon": A({ sp:88, wr:40, ch:92, mc:92, ps:76, sta:60, dur:72, con:76, lk:50, mo:60, tags:["Authority","Showman"] }),
  "Shane McMahon": A({ sp:84, wr:60, ch:82, mc:80, ps:70, sta:74, dur:70, con:72, lk:74, mo:60, tags:["Daredevil"] }),
  "Jerry Lawler": A({ sp:78, wr:50, ch:84, mc:84, ps:76, sta:62, dur:66, con:78, lk:70, mo:54, tags:["Announcer","Showman"] }),
  "Jim Ross": A({ sp:70, wr:40, ch:88, mc:88, ps:78, sta:58, dur:60, con:80, lk:82, mo:54, tags:["Announcer"] })
};

/* ------------------------------------------------------------------ */
/* Smart defaults for anyone not in ATTR_OVERRIDES                     */
/* ------------------------------------------------------------------ */
function defaultsFor(name, gender, alignment){
  const base = {
    sp: 70, wr: 68, ch: 66, mc: 66, ps: 72,
    sta: 76, dur: 74, con: 76, lk: alignment==="heel"?62:70, mo: 56, tags:[]
  };

  const bump = (o, k, v)=>{ o[k] = clamp((o[k]??0)+v, 30, 99); };

  // Archetypes by name (quick heuristics)
  if (/Malenko|Regal|Benoit|Angle|Storm|Saturn|Tazz/i.test(name)) { bump(base,'wr',10); bump(base,'ps',10); bump(base,'con',8); base.tags.push("Technical"); }
  if (/Hardy|Kidman|Tajiri|X-Pac|Hurricane/i.test(name)) { bump(base,'wr',8); bump(base,'sta',6); bump(base,'dur',-6); base.tags.push("High Flyer"); }
  if (/Kane|Show|Bradshaw|Faarooq|Rhyno|Test|KroniK/i.test(name)) { bump(base,'dur',8); bump(base,'sta',4); bump(base,'wr',-2); base.tags.push("Powerhouse"); }
  if (/Raven|DDP|Goldust|Road Dogg/i.test(name)) { bump(base,'ch',6); bump(base,'mc',6); base.tags.push("Showman"); }
  if (/Dudley/i.test(name)) { base.tags.push("Tag Specialist"); bump(base,'ps',4); bump(base,'dur',4); }

  // Women generic
  if (gender==="F"){ bump(base,'ch',4); bump(base,'mc',4); bump(base,'lk',4); bump(base,'wr',-2); }

  // Faces get a small likeability bump
  if (alignment==="face") bump(base,'lk',4);

  return A({
    sp:base.sp, wr:base.wr, ch:base.ch, mc:base.mc, ps:base.ps,
    sta:base.sta, dur:base.dur, con:base.con, lk:base.lk, mo:base.mo, tags:base.tags
  });
}

/* ------------------------------------------------------------------ */
/* Builder: produce FULL wrestler objects for the engine               */
/* ------------------------------------------------------------------ */
const DEFAULT_BDAY = "01-01-1975";

export function buildFixedRoster(){
  return BASE_ROSTER.map(([name, gender, brand, alignment])=>{
    const legacy = ATTR_OVERRIDES[name] || defaultsFor(name, gender, alignment);
    const derived = normalizeTo15(legacy, legacy.styleTags);
    const birthday = BIRTHDAY_OVERRIDES[name] || DEFAULT_BDAY;

    const w = {
      name, gender, brand, alignment, birthday,

      // Profile block
      starpower:   derived.starpower,
      reputation:  derived.reputation,
      likeability: derived.likeability,
      consistency: derived.consistency,
      momentum:    derived.momentum,

      // In-Ring block
      workrate:    derived.workrate,
      psychology:  derived.psychology,
      charisma:    derived.charisma,
      mic:         derived.mic,
      chemistry:   derived.chemistry,

      // Physical block
      stamina:       derived.stamina,
      durability:    derived.durability,
      strengthPower: derived.strengthPower,
      agility:       derived.agility,
      athleticism:   derived.athleticism,

      // Safety (now deterministic from data.js)
      ringSafety:    derived.ringSafety,

      // Legacy/other
      promo:       Math.round((legacy.charisma + legacy.mic)/2),
      styleTags:   derived.styleTags,
      championOf:  null,

      // Engine will (re)backfill:
      fatigue:     0,
      injuryWeeks: 0
    };
    return w;
  });
}

