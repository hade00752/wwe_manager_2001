// Dynamic “Attitude Era” scenario engine.
// Produces inbox items with interactive actions and state effects.

import { RAW, SD, clamp, r } from '../util.js';

// --- helpers --------------------------------------------------------------
const byName = (state, name) => state.roster.find(w => w.name === name);
const allByBrand = (state, brand) => state.roster.filter(w => w.brand === brand);
const overallOf = (w) => {
  const promoLike = ((w.charisma ?? w.promo ?? 60) + (w.mic ?? w.promo ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons  = w.consistency ?? 60;
  const o = Math.round(
    (w.workrate ?? 60)*0.30 +
    (w.starpower ?? 60)*0.25 +
    promoLike*0.15 +
    (w.momentum ?? 60)*0.10 +
    psych*0.10 +
    cons*0.10
  );
  return clamp(o,1,99);
};
const pick = (arr) => arr[Math.floor(Math.random()*arr.length)] || null;
const chance = (p) => Math.random() < p;
const relBetween = (state, a, b) => {
  // relationships shape: we assume items like { a:"Name", b:"Other", v:int }
  const arr = state.relationships || [];
  const find = arr.find(x =>
    (x.a === a.name && x.b === b.name) || (x.a === b.name && x.b === a.name)
  );
  return find?.v ?? 0; // -100..+100 (guess); 0 if unknown
};
const heatLine = (s) => (s && s.length ? s.join(' • ') : '');

// DSL: effects are plain JSON; UI will execute them.
function wDelta(name, stat, by, min=0, max=99){
  return { kind:'w', name, stat, delta:by, min, max };
}
function inj(name, weeks){ return { kind:'injury', name, weeks }; }
function restFatigue(name, by){ return { kind:'fatigue', name, delta:by }; }
function setBrand(name, to){ return { kind:'brand', name, to }; }
function relDelta(a, b, by){ return { kind:'rel', a, b, delta:by }; }

// Pick a troubled star candidate
function pickFrustratedStar(state, brand){
  const pool = allByBrand(state, brand)
    .filter(w => (overallOf(w) >= 82))
    .filter(w => (w.momentum ?? 60) <= 60)
    .filter(w => (w.injuryWeeks ?? 0) === 0);
  return pick(pool);
}

// --- scenario generators --------------------------------------------------
// Each returns {from, title, body, actions, meta?} or null

function lateToCallTime(state, brand){
  const pool = allByBrand(state, brand)
    .filter(w => (w.professionalism ?? 70) <= 60)
    .filter(w => (w.fatigue ?? 0) >= 35)
    .filter(w => (w.injuryWeeks ?? 0) === 0);
  const a = pick(pool);
  if(!a || !chance(0.35)) return null;
  const body =
`Security report says ${a.name} arrived after call-time and missed the production meeting.
They claim travel issues, crew says otherwise.`;

  return {
    from: 'Vince McMahon',
    actor: a.name,
    title: 'Tardy Arrival — Discipline?',
    body,
    actions: [
      {
        key:'fine',
        label:'Fine and formal warning',
        effects:[
          wDelta(a.name,'professionalism', +3),
          wDelta(a.name,'likeability',    -2),
          wDelta(a.name,'momentum',       -3)
        ]
      },
      {
        key:'bench',
        label:'Bench for a week (cool off)',
        effects:[
          inj(a.name, 1),                    // pseudo-suspension via 1 week “injury”
          restFatigue(a.name, -18),
          wDelta(a.name,'professionalism', +1),
          wDelta(a.name,'momentum',       -4)
        ]
      },
      {
        key:'forgive',
        label:'Quiet chat — forgive this time',
        effects:[
          wDelta(a.name,'professionalism', +1),
          wDelta(a.name,'likeability',    +1)
        ]
      }
    ]
  };
}

function backstageScuffle(state, brand){
  const boys = allByBrand(state, brand).filter(w => (w.injuryWeeks ?? 0) === 0);
  const A = pick(boys); if(!A) return null;
  const opponents = boys.filter(x => x !== A);
  const B = pick(opponents); if(!B) return null;
  const heat = relBetween(state, A, B);
  if(heat > -10 && !chance(0.25)) return null; // trigger more when there’s beef

  const body =
`${A.name} and ${B.name} were seen arguing. Words turned into a brief shoving match before agents stepped in.
Locker room morale is watching how you handle this.`;

  return {
    from: 'Vince McMahon',
    title: 'Backstage Scuffle',
    body,
    actions: [
      {
        key:'suspendA',
        label:`Suspend ${A.name} (1 week)`,
        effects:[ inj(A.name,1), wDelta(A.name,'professionalism',+2), relDelta(A.name,B.name,-5) ]
      },
      {
        key:'mediate',
        label:'Hold mediation — squash the beef',
        effects:[ relDelta(A.name,B.name, +10), wDelta(A.name,'reputation',+2), wDelta(B.name,'reputation',+2) ]
      },
      {
        key:'lookaway',
        label:'Look the other way',
        effects:[ wDelta(A.name,'professionalism',-2), wDelta(B.name,'professionalism',-2) ]
      }
    ]
  };
}

function creativeFrustration(state, brand){
  const a = pickFrustratedStar(state, brand);
  if(!a || !chance(0.45)) return null;
  const ovr = overallOf(a);
  const body =
`${a.name} (${ovr} OVR) is frustrated with creative, citing lack of big-match direction.
They want a push and feel underused.`;

  return {
    from: 'Vince McMahon',
    title: '“I Need a Push”',
    actor: a.name,
    body,
    actions: [
      {
        key:'promise',
        label:'Promise a push (backstage leaks like it)',
        effects:[
          wDelta(a.name,'momentum', +10),
          wDelta(a.name,'reputation', +2),
          wDelta(a.name,'likeability', +2)
        ]
      },
      {
        key:'bepatient',
        label:'Ask for patience (earn it on TV)',
        effects:[
          wDelta(a.name,'professionalism', +3),
          wDelta(a.name,'momentum', -3)
        ]
      },
      {
        key:'threat',
        label:'Lay down the law (my way or the highway)',
        effects:[
          wDelta(a.name,'professionalism', -3),
          wDelta(a.name,'likeability',   -4),
          wDelta(a.name,'momentum',      -4)
        ]
      }
    ]
  };
}

function wellnessStrike(state, brand){
  const pool = allByBrand(state, brand)
    .filter(w => (w.professionalism ?? 70) <= 55)
    .filter(w => (w.injuryWeeks ?? 0) === 0);
  const a = pick(pool);
  if(!a || !chance(0.22)) return null;

  const body =
`Random wellness check flagged ${a.name}.
PR is asking how to proceed.`;

  return {
    from: 'Vince McMahon',
    title: 'Wellness Policy Violation',
    actor: a.name,
    body,
    actions: [
      {
        key:'rehab',
        label:'Send to rehab / off TV (3 weeks)',
        effects:[
          inj(a.name, 3),
          wDelta(a.name,'professionalism', +4),
          wDelta(a.name,'momentum',       -6),
          wDelta(a.name,'reputation',     +1)
        ]
      },
      {
        key:'fine',
        label:'Quiet fine and internal strike',
        effects:[
          wDelta(a.name,'professionalism', +2),
          wDelta(a.name,'momentum',       -4)
        ]
      },
      {
        key:'cover',
        label:'Cover it — keep business moving',
        effects:[
          wDelta(a.name,'reputation',     -4),
          wDelta(a.name,'momentum',       +2)
        ]
      }
    ]
  };
}

function mediaSave(state, brand){
  const pool = allByBrand(state, brand)
    .filter(w => (w.charisma ?? 60) >= 78)
    .filter(w => chance(0.35));
  const a = pick(pool);
  if(!a) return null;

  const body =
`${a.name} went viral after doing media rounds and staying late for fans.
Great optics for the brand.`;

  return {
    from: 'Vince McMahon',
    title: 'Media Buzz — Good Press',
    actor: a.name,
    body,
    actions: [
      {
        key:'promote',
        label:'Lean into it (PR push)',
        effects:[ wDelta(a.name,'likeability',+5), wDelta(a.name,'momentum',+4), wDelta(a.name,'reputation',+2) ]
      },
      {
        key:'humble',
        label:'Keep it humble (internal praise only)',
        effects:[ wDelta(a.name,'reputation',+3) ]
      }
    ]
  };
}

function mentorOffer(state, brand){
  const vets = allByBrand(state, brand).filter(w =>
    (w.reputation ?? 60) >= 78 && (w.age ?? 30) >= 35
  );
  const kids = allByBrand(state, brand).filter(w =>
    (w.workrate ?? 60) >= 72 && (w.age ?? 30) <= 30
  );
  if(!vets.length || !kids.length || !chance(0.28)) return null;
  const v = pick(vets), k = pick(kids);
  if(!v || !k) return null;

  const body =
`${v.name} wants to mentor ${k.name} at the PC one morning a week.`;

  return {
    from: 'Vince McMahon',
    title: 'Mentorship Proposal',
    body,
    actions: [
      {
        key:'approve',
        label:'Approve (invest in the future)',
        effects:[
          wDelta(k.name,'workrate', +3),
          wDelta(k.name,'psychology', +3),
          wDelta(v.name,'reputation', +2),
          restFatigue(v.name, +4) // extra hours; a little more tired
        ]
      },
      {
        key:'decline',
        label:'Decline (keep schedules tight)',
        effects:[
          wDelta(v.name,'likeability', -2),
          wDelta(k.name,'momentum',   -2)
        ]
      }
    ]
  };
}

function tagTension(state, brand){
  // loosely: two “Tag Specialist” / aligned names on same brand
  const pool = allByBrand(state, brand);
  const tags = pool.filter(w => (w.styleTags||[]).some(t => /tag/i.test(t)));
  if(tags.length < 2 || !chance(0.25)) return null;
  const A = pick(tags), B = pick(tags.filter(x => x !== A));
  if(!A || !B) return null;

  const body =
`${A.name} and ${B.name} disagree on the team’s direction.
Do we split them or force a reconciliation arc?`;

  return {
    from: 'Vince McMahon',
    title: 'Tag Team Tension',
    body,
    actions: [
      { key:'counsel', label:'Counsel & keep the team', effects:[ relDelta(A.name,B.name,+12), wDelta(A.name,'chemistry',+2), wDelta(B.name,'chemistry',+2) ] },
      { key:'split',   label:'Split them — singles focus', effects:[ wDelta(A.name,'momentum',+3), wDelta(B.name,'momentum',+3), relDelta(A.name,B.name,-6) ] }
    ]
  };
}

// --- main entry -----------------------------------------------------------
export function generateScenarioEvents(state, brand, context){
  // limit how noisy we get each week
  const MAX_PER_WEEK = 2;
  const candidates = [
    lateToCallTime,
    backstageScuffle,
    creativeFrustration,
    wellnessStrike,
    mediaSave,
    mentorOffer,
    tagTension
  ];

  const out = [];
  // Shuffle order so weeks feel different
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  for(const gen of shuffled){
    if(out.length >= MAX_PER_WEEK) break;
    const m = gen(state, brand, context);
    if(m) out.push(m);
  }

  // Turn plain objects into inbox messages the UI understands.
  // Add stable meta for UI actions.
  out.forEach(m => {
    m.type = m.type || 'scenario';
    m.from = m.from || 'Vince McMahon';
    m.date = state.week; // simple week marker
  });

  return out;
}
