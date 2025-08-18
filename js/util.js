// public/js/util.js
// One-stop utilities + constants used across the app.

export const RAW = "RAW";
export const SD  = "SmackDown";
export const FA  = "Free Agency";

// 7-segment TV format
export const SEGMENTS = [
  { key:"PreShow",   type:"singles",  titleToggle:false },
  { key:"Opener",    type:"singles",  titleToggle:true  },
  { key:"Promo1",    type:"promo",    titleToggle:false },
  { key:"Tag",       type:"tag",      titleToggle:true  },
  { key:"Promo2",    type:"promo",    titleToggle:false },
  { key:"Match",     type:"singles",  titleToggle:true  },
  { key:"MainEvent", type:"singles",  titleToggle:true  }
];

// How much each segment contributes to the night’s score.
export const SEGMENT_WEIGHTS = {
  PreShow:   0.8,
  Opener:    1.0,
  Promo1:    0.5,
  Tag:       1.0,
  Promo2:    0.5,
  Match:     1.0,
  MainEvent: 1.4
};

// Which segments are allowed to be championship matches
export const TITLE_ALLOWED_ON = new Set(["Opener","Tag","Match","MainEvent"]);

// Repeat penalties, stories, title heat
export const REPEAT_PENALTY      = 0.18; // 18% off if same match as last week
export const STORY_HOT_THRESHOLD = 75;   // rating that can spark/boost a storyline
export const STORY_MAX_BONUS     = 12;   // cap of bonus from storyline heat
export const STORY_PROMO_BONUS   = 6;    // promo bump if in an active story
export const STORY_DECAY         = 3;    // weekly heat decay
export const STORY_HEAT_ON_HOT   = 10;   // heat added when a match is “hot”

// Small extra pop for titles (in addition to slot bonus)
export const TITLE_HEAT = {
  World: 8,
  "Intercontinental": 6,
  "United States": 6,
  "Cruiserweight": 4, // ← fixed missing comma
  Tag: 5,
  Women: 6
};

// TV conversion tuning (score -> 1..10)
export const TV = {
  BASELINE: 48,          // subtract this before scaling
  SCALE: 6.0,            // divide by this to get ~1..10
  STAR_DRAW_TOPN: 3,     // how many top stars affect draw bonus
  STAR_DRAW_FACTOR: 0.18 // multiplier for star draw
};

// ----- Alignment effects (percent multipliers) -----
export const ALIGNMENT_EFFECT = {
  SINGLES_SAME: 0.05,               // 5% off when both singles are same alignment
  SINGLES_SAME_HEEL_BONUS: 0.02,    // extra 2% off if it's heel vs heel
  SINGLES_BOTH_NEUTRAL_REDUCTION: 0.02, // soften by 2% if neutral vs neutral

  TAG_MIXED_TEAM: 0.06,             // 6% off for each mixed-alignment team
  TAG_TEAMS_SAME: 0.04              // 4% off if both teams are same alignment
};

// Normalizer (safe even if you've already cleaned data)
export function normAlign(a){
  const x = String(a || 'neutral').toLowerCase();
  if (x === 'face' || x === 'heel' || x === 'neutral') return x;
  return 'neutral';
}



// ---------- small helpers ----------
export const r = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
export const avg = (xs)=> xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;

// Set equality helpers
export function sameSet(a, b){
  if(a.size !== b.size) return false;
  for(const v of a) if(!b.has(v)) return false;
  return true;
}
export function setEq(a, b){ return sameSet(a, b); }

// Tiny DOM helper
export function el(tag, props={}, ...children){
  const node = document.createElement(tag);
  if (props) {
    for (const [k,v] of Object.entries(props)){
      if (v == null) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style" && typeof v === "object") {
        for (const [sk,sv] of Object.entries(v)) node.style[sk] = sv;
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  for (const c of children){
    if (c == null) continue;
    if (Array.isArray(c)) c.forEach(x=> x!=null && node.appendChild(x));
    else node.appendChild(c);
  }
  return node;
}
