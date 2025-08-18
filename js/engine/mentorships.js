// public/js/engine/mentorships.js
// Weekly mentorship effects driven by mentor attributes.
// Names only; no object refs (avoid circular JSON).
// Enforces: each mentor can appear in only ONE group; each mentee can appear in only ONE group;
// a mentee cannot be a mentor in ANY group.

import { clamp } from '../util.js';

const c = (v, lo=0, hi=99)=> clamp(Math.round(v), lo, hi);
const byName = (state, name) => state.roster.find(w => w.name === name);

// --- date helpers (for age comparisons if needed later) ---
function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
function ageAt(bday, atDateStr){
  const d = parseDDMMYYYY(bday);
  if(!d) return null;
  const at = parseDDMMYYYY(atDateStr) || new Date();
  let age = at.getFullYear() - d.getFullYear();
  const pre = (at.getMonth() < d.getMonth()) || (at.getMonth() === d.getMonth() && at.getDate() < d.getDate());
  if (pre) age -= 1;
  return age;
}

// Map a stat to a small weekly delta (0..maxUp)
function tierDelta(stat, lo, hi, maxUp){
  const s = Number(stat ?? 0);
  if (s <= lo) return 0;
  if (s >= hi) return maxUp;
  const frac = (s - lo) / Math.max(1, (hi - lo));
  return Math.max(0, Math.round(frac * maxUp));
}

// Style synergy bumps based on mentor's tags
function styleBumps(tags){
  const t = (tags||[]).map(x=>String(x).toLowerCase());
  const has = (...ks)=> ks.some(k => t.includes(k));
  const bump = {
    workrate:0, psychology:0, mic:0, charisma:0,
    athleticism:0, agility:0, strengthPower:0, ringSafety:0
  };
  if (has('technical')) { bump.workrate++; bump.psychology++; }
  if (has('showman','character')) { bump.mic++; bump.charisma++; }
  if (has('high flyer','cruiser','daredevil')) { bump.athleticism++; bump.agility++; }
  if (has('powerhouse','giant')) { bump.strengthPower++; }
  if (has('striker')) { bump.ringSafety++; bump.workrate++; }
  if (has('tag specialist')) { bump.psychology++; }
  return bump;
}

// Build a recipe (positives + negatives) from mentor stats
function mentorRecipe(mentor){
  const rep  = mentor.reputation ?? 60;
  const pro  = mentor.professionalism ?? 70;
  const saf  = mentor.ringSafety ?? 70;
  const mor  = mentor.morale ?? 65;

  const pos = {
    workrate:     tierDelta(mentor.workrate,   72, 90, 2),
    psychology:   tierDelta(mentor.psychology, 72, 92, 2),
    mic:          tierDelta(mentor.mic,        65, 90, 2),
    charisma:     tierDelta(mentor.charisma,   65, 90, 2),
    athleticism:  tierDelta(mentor.athleticism,68, 90, 2),
    ringSafety:   tierDelta(mentor.ringSafety, 68, 90, 2),
    professionalism: tierDelta(mentor.professionalism, 75, 95, 1),
    strengthPower: tierDelta(mentor.strengthPower ?? 70, 72, 92, 2),
    agility:        tierDelta(mentor.agility ?? 70,       72, 92, 2),
    momentum:    tierDelta(mentor.momentum,   68, 90, 1),
    morale:      1
  };

  // Style synergy
  const bumps = styleBumps(mentor.styleTags);
  for (const k in bumps) pos[k] = (pos[k]||0) + bumps[k];

  // Rep/morale amps
  const repAmp = clamp(0.7 + (rep - 60) / 60, 0.5, 1.4);
  for (const k of ['workrate','psychology','mic','charisma','athleticism','ringSafety','strengthPower','agility']){
    pos[k] = Math.round((pos[k]||0) * repAmp);
  }
  const moraleAmp = mor >= 70 ? 1.1 : mor >= 55 ? 1.0 : 0.8;
  for (const k of ['workrate','psychology','mic','charisma','athleticism','ringSafety','strengthPower','agility','momentum']){
    pos[k] = Math.round((pos[k]||0) * moraleAmp);
  }
  pos.morale += (mor >= 80 ? 2 : mor >= 60 ? 1 : 0);

  // Baseline negatives
  const neg = {
    professionalism: pro < 50 ? -2 : (pro < 65 ? -1 : 0),
    ringSafety:      saf < 50 ? -2 : (saf < 60 ? -1 : 0),
    morale:          mor < 40 ? -3 : (mor < 55 ? -1 : 0)
  };

  return { pos, neg };
}

// Extra mentee-specific mental penalties when mentoring “up”
function compatibilityPenalty(state, mentor, mentee){
  const ageM = ageAt(mentor.birthday, state?.startDate);
  const ageW = ageAt(mentee.birthday, state?.startDate);
  const olderMentee = (ageM!=null && ageW!=null && ageW > ageM);
  const highStarMentee = (mentee.starpower ?? 0) >= 80;

  let morale = 0;
  let prof = 0;
  if (olderMentee) { morale -= 3; prof -= 1; }
  if (highStarMentee) { morale -= 2; }

  // very professional mentees take it better
  const menteePro = mentee.professionalism ?? 60;
  const damp = menteePro >= 85 ? 0.4 : menteePro >= 70 ? 0.7 : 1.0;

  return {
    morale: Math.round(morale * damp),
    professionalism: Math.round(prof * damp),
    flags: { olderMentee, highStarMentee }
  };
}

// Chance a weekly “tick” happens (most weeks it won’t)
function procChance(mentor){
  const ch = mentor.charisma ?? 60;
  const ps = mentor.psychology ?? 60;
  const rp = mentor.reputation ?? 60;
  const pr = mentor.professionalism ?? 60;

  let p = 0.10;
  p += (ch - 70) / 350;
  p += (ps - 70) / 350;
  p += (rp - 60) / 500;
  p += (pr - 60) / 600;
  return clamp(p, 0.06, 0.35);
}

// UI helpers
export function previewMentorEffects(mentor){ return mentorRecipe(mentor); }
export function compatibilityPreview(state, mentor, mentee){
  if (!state || !mentor || !mentee) return { morale:0, professionalism:0, flags:{olderMentee:false, highStarMentee:false} };
  return compatibilityPenalty(state, mentor, mentee);
}

// --- NEW: resolve/clean conflicts according to rules ---
function normalizeMentorshipSlots(slots){
  const usedMentors = new Set();
  const usedMentees = new Set();
  const allMentors = new Set(slots.map(s=>s?.mentor).filter(Boolean));

  // First occurrence wins
  for (const slot of slots){
    if (!slot) continue;

    // Mentor uniqueness
    if (slot.mentor){
      if (usedMentors.has(slot.mentor)) {
        // Duplicate mentor: clear this slot's mentor & mentees
        slot.mentor = null;
        slot.mentees = [];
        continue;
      }
      usedMentors.add(slot.mentor);
    }

    // Mentees uniqueness + cannot be any group's mentor
    const clean = [];
    for (const name of (slot.mentees||[])){
      if (!name) continue;
      if (allMentors.has(name)) continue;     // mentee cannot be a mentor in any group
      if (slot.mentor && name === slot.mentor) continue; // no self-mentoring
      if (usedMentees.has(name)) continue;    // mentee only in one group
      usedMentees.add(name);
      clean.push(name);
      if (clean.length >= 3) break;
    }
    slot.mentees = clean;
  }
}

// Main: apply weekly mentorships (brand-scoped) + inbox report
export function applyMentorships(state, brand){
  if (!state?.mentorships?.slots) return;

  // Clean the structure first so engine rules are always upheld
  normalizeMentorshipSlots(state.mentorships.slots);

  const onBrand = (w)=> !!w && w.brand === brand;
  let report = [];

  for (const slot of state.mentorships.slots){
    if (!slot?.mentor) continue;
    const mentor = byName(state, slot.mentor);
    if (!onBrand(mentor)) continue; // brand-scoped application

    // gate — many weeks have no effect
    if (Math.random() > procChance(mentor)) continue;

    const { pos, neg } = mentorRecipe(mentor);

    (slot.mentees||[]).slice(0,3).forEach(name=>{
      const w = byName(state, name); if(!onBrand(w)) return;

      const before = {
        workrate: w.workrate, psychology:w.psychology, mic:w.mic, charisma:w.charisma,
        athleticism:w.athleticism, ringSafety:w.ringSafety, strengthPower:w.strengthPower, agility:w.agility,
        professionalism:w.professionalism, momentum:w.momentum, morale:w.morale
      };

      const add = (k, d, cap=3)=>{ if (!d) return; w[k] = c((w[k] ?? 60) + clamp(d, -3, cap)); };

      // positives
      add('workrate', pos.workrate);
      add('psychology', pos.psychology);
      add('mic', pos.mic);
      add('charisma', pos.charisma);
      add('athleticism', pos.athleticism);
      add('ringSafety', pos.ringSafety);
      add('strengthPower', pos.strengthPower);
      add('agility', pos.agility);
      add('professionalism', pos.professionalism, 2);
      add('momentum', pos.momentum, 2);
      w.morale = clamp((w.morale ?? 65) + (pos.morale||0), 0, 100);

      // baseline negatives
      add('professionalism', neg.professionalism, 0);
      add('ringSafety',      neg.ringSafety, 0);
      w.morale = clamp((w.morale ?? 65) + (neg.morale||0), 0, 100);

      // compatibility penalties (mental only)
      const cmp = compatibilityPenalty(state, mentor, w);
      if (cmp.professionalism) add('professionalism', cmp.professionalism, 0);
      if (cmp.morale) w.morale = clamp((w.morale ?? 65) + cmp.morale, 0, 100);

      // Build a compact delta line if anything changed
      const after = {
        workrate: w.workrate, psychology:w.psychology, mic:w.mic, charisma:w.charisma,
        athleticism:w.athleticism, ringSafety:w.ringSafety, strengthPower:w.strengthPower, agility:w.agility,
        professionalism:w.professionalism, momentum:w.momentum, morale:w.morale
      };
      const ABBR = { workrate:'WR', psychology:'PSY', charisma:'CHA', mic:'MIC', athleticism:'ATH', strengthPower:'STR', agility:'AGI', professionalism:'PRO', momentum:'MOM', morale:'Morale', ringSafety:'SAFE' };
      const parts = [];
      for (const k in after){
        const b = before[k], a = after[k];
        if (typeof b === 'number' && typeof a === 'number' && a !== b){
          const diff = a - b;
          parts.push(`${ABBR[k]||k} ${diff>0?`+${diff}`:diff}`);
        }
      }
      if (parts.length) report.push(`${mentor.name} → ${w.name}: ${parts.join(', ')}`);
    });
  }

  if (report.length){
    if (!Array.isArray(state.inbox)) state.inbox = [];
    state.inbox.unshift({
      from: 'Coaches',
      title: 'Mentorship Report',
      body: 'Mentorship effects landed this week:\n\n' + report.join('\n')
    });
  }
}
