// public/js/mentorships_ui.js
// Mentorships screen (UI layer). Renders slots, handles selects, previews.

import { el } from "./util.js?v=1755554537";
import { loadState, ensureInitialised, saveState, headshotImg } from "./engine.js?v=1755554537";
import { previewMentorEffects, compatibilityPreview } from './engine/mentorships.js';

// ---------- tiny styles for chips & note ----------
(function injectMentorshipStyles(){
  if (document.getElementById('mentorships-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'mentorships-ui-styles';
  s.textContent = `
  .ment-wrap{ display:grid; gap:12px; }
  .ment-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .ment-slot{ padding:12px; border-radius:12px; box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; background:rgba(255,255,255,.02); }
  .ment-slot h4{ margin:0 0 8px 0; font-weight:600; }
  .ment-note{ font-size:12px; opacity:.85; margin:4px 0 8px; }
  .chip{ display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; border:1px solid transparent; margin:3px 6px 0 0; }
  .chip-pos{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
  .chip-neg{ background: rgba(255,80,80,.12); border-color: rgba(255,80,80,.35); }
  .pick-with-photo{ display:inline-flex; align-items:center; gap:8px; }
  .pick-with-photo img{ width:24px; height:24px; border-radius:999px; object-fit:cover; box-shadow:0 0 0 1px rgba(255,255,255,.12) inset; }
  `;
  document.head.appendChild(s);
})();

// ---------- bootstrap ----------
const root = document.getElementById('mentorships-root') || (() => {
  const m = document.createElement('main'); m.id='mentorships-root'; document.body.appendChild(m); return m;
})();

let state;
init();

function init(){
  const s = loadState();
  if (!s){
    root.innerHTML = '';
    root.appendChild(el('div',{class:'card'}, el('div',{text:'No season found. Start from Booking.'})));
    return;
  }
  ensureInitialised(s);
  if (!s.mentorships || !Array.isArray(s.mentorships.slots)){
    s.mentorships = { slots: Array.from({length:5}, ()=>({ mentor:null, mentees:[] })) };
  }
  state = s;
  saveState(state);
  render();
}

function isOnCurrentBrand(w){
  return w.brand === state.brand; // exclude other brand + free agents
}

// Helpers to compute global “locks”
function usedMentors(slots, exceptIdx=-1){
  const set = new Set();
  slots.forEach((s,i)=>{ if(i!==exceptIdx && s?.mentor) set.add(s.mentor); });
  return set;
}
function usedMentees(slots, exceptIdx=-1){
  const set = new Set();
  slots.forEach((s,i)=>{
    if(i===exceptIdx) return;
    (s?.mentees||[]).forEach(n => n && set.add(n));
  });
  return set;
}
function allMentors(slots){
  return new Set(slots.map(s=>s?.mentor).filter(Boolean));
}

function render(){
  root.innerHTML = '';
  const wrap = el('div',{class:'card ment-wrap'});
  wrap.appendChild(el('h3',{text:`Mentorships (${state.brand})`}));

  // controls row
  const controls = el('div',{class:'ment-row'});
  const autofillBtn = el('button',{text:'Auto-fill'});
  const clearBtn = el('button',{text:'Clear All'});
  controls.appendChild(autofillBtn);
  controls.appendChild(clearBtn);
  wrap.appendChild(controls);

  autofillBtn.onclick = ()=>{ autoFill(); saveState(state); render(); };
  clearBtn.onclick = ()=>{
    state.mentorships.slots.forEach(s=>{ s.mentor=null; s.mentees=[]; });
    saveState(state); render();
  };

  // brand-scoped roster list
  const all = state.roster.filter(isOnCurrentBrand).sort((a,b)=>a.name.localeCompare(b.name));

  // render 5 slots
  state.mentorships.slots.forEach((slot, idx)=>{
    wrap.appendChild(renderSlot(idx, slot, all));
  });

  root.appendChild(wrap);
}

function renderSlot(index, slot, list){
  const slots = state.mentorships.slots;
  const mentorsElsewhere = usedMentors(slots, index);
  const menteesElsewhere = usedMentees(slots, index);
  const mentorsAnywhere  = allMentors(slots); // mentee cannot be any slot’s mentor

  const card = el('div',{class:'ment-slot'});
  card.appendChild(el('h4',{text:`Slot ${index+1}`}));

  // mentor pick (exclude mentors used elsewhere)
  const row1 = el('div',{class:'ment-row'});
  row1.appendChild(el('label',{text:'Mentor'}));
  const mentorChoices = list.filter(w => !mentorsElsewhere.has(w.name));
  const mentorSel = selectWithPhoto(`mentor_${index}`, mentorChoices, slot.mentor);
  row1.appendChild(mentorSel.wrap);

  // mentee picks (exclude this slot’s mentor, mentees used elsewhere, and ANY mentor anywhere)
  const row2 = el('div',{class:'ment-row'});
  row2.appendChild(el('label',{text:'Mentees'}));

  const menteeChoices = () => {
    const currentMentor = mentorSel.sel.value || slot.mentor || null;
    return list.filter(w =>
      w.name !== currentMentor &&
      !menteesElsewhere.has(w.name) &&
      !mentorsAnywhere.has(w.name)
    );
  };

  const currentMentees = [slot.mentees?.[0]||'', slot.mentees?.[1]||'', slot.mentees?.[2]||''];
  const menteeSels = [0,1,2].map(i => selectWithPhoto(`mentee_${index}_${i}`, menteeChoices(), currentMentees[i]));
  menteeSels.forEach(x => row2.appendChild(x.wrap));

  // preview container
  const preview = el('div');
  renderMentorPreview(preview,
    list.find(w=>w.name===(mentorSel.sel.value || slot.mentor)),
    menteeSels.map(x=>x.sel.value).filter(Boolean)
  );

  // handlers
  mentorSel.sel.addEventListener('change', ()=>{
    // set mentor
    slot.mentor = mentorSel.sel.value || null;

    // sanitize mentees (drop any that became illegal)
    slot.mentees = (slot.mentees||[]).filter(n =>
      n &&
      n !== slot.mentor &&
      !usedMentees(slots, index).has(n) &&
      !allMentors(slots).has(n)
    ).slice(0,3);

    saveState(state);
    render(); // re-render to refresh allowed picks everywhere
  });

  menteeSels.forEach((x,i)=>{
    x.sel.addEventListener('change', ()=>{
      const slotsNow = state.mentorships.slots;
      const others = usedMentees(slotsNow, index);
      const mentorsNow = allMentors(slotsNow);

      // rebuild mentees from current selects, enforcing unique inside the slot
      const picks = menteeSels.map(s=>s.sel.value).filter(Boolean);
      const clean = [];
      for (const n of picks){
        if (n === (slot.mentor||'')) continue;
        if (others.has(n)) continue;
        if (mentorsNow.has(n)) continue;
        if (!clean.includes(n)) clean.push(n);
        if (clean.length >= 3) break;
      }
      slot.mentees = clean;

      saveState(state);
      render(); // re-render to update filters
    });
  });

  card.appendChild(row1);
  card.appendChild(row2);
  card.appendChild(preview);
  return card;
}

/* ---------- Select + headshot (no placeholder until selected) ---------- */
function selectWithPhoto(id, list, value){
  const wrap = el('span',{class:'pick-with-photo'});
  const s = el('select',{id});
  s.appendChild(el('option',{value:'',text:'— Select —'}));

  // If current value is not in list (now invalid), it won’t be shown — that’s OK.
  list.forEach(w=>{
    const o = el('option',{value:w.name, text:w.name});
    if (w.name===value) o.selected = true;
    s.appendChild(o);
  });

  const pic = el('span'); // empty holder; we only insert an <img> when a name is chosen
  wrap.appendChild(s);
  wrap.appendChild(pic);

  const updatePhoto = (name)=>{
    pic.innerHTML = '';
    if (!name) return; // no image when not selected
    try{
      const img = headshotImg(name, {width:24, height:24});
      img.onerror = ()=>{ pic.innerHTML=''; };
      pic.appendChild(img);
    }catch{
      // ignore; keep empty
    }
  };

  // init + change
  updatePhoto(value || '');
  s.addEventListener('change', ()=> updatePhoto(s.value || ''));

  return { wrap, sel: s };
}

// ---------- Autofill: pick good mentors, then rising/less-established unique mentees ----------
function autoFill(){
  const list = state.roster.filter(isOnCurrentBrand);

  // score mentor potential: charisma & psychology are key; rep/pro add a bit
  const mScore = w => (w.charisma??60)*0.4 + (w.psychology??60)*0.4 + (w.reputation??60)*0.15 + (w.professionalism??60)*0.05;

  // unique mentors (best first)
  const mentors = [...list]
    .filter(w => !w.injuryWeeks)
    .sort((a,b)=> mScore(b) - mScore(a));

  const usedMent = new Set();
  const usedMentee = new Set();

  state.mentorships.slots.forEach(slot=>{
    // pick first mentor not used
    const mentor = mentors.find(m=>!usedMent.has(m.name));
    if (!mentor){ slot.mentor=null; slot.mentees=[]; return; }
    usedMent.add(mentor.name);
    slot.mentor = mentor.name;

    // mentee pool: exclude this mentor, exclude all mentors (globally), exclude already used mentees
    const mentorNames = new Set(mentors.map(m=>m.name));
    const pool = list
      .filter(w => w.name !== mentor.name && !mentorNames.has(w.name) && !usedMentee.has(w.name))
      .sort((a,b)=>{
        // less established first
        const aScore = (a.reputation??60) + (a.starpower??60);
        const bScore = (b.reputation??60) + (b.starpower??60);
        return aScore - bScore;
      });

    slot.mentees = [];
    for (const w of pool){
      if (slot.mentees.length >= 3) break;
      slot.mentees.push(w.name);
      usedMentee.add(w.name);
    }
  });

  saveState(state);
}

// ---------- Builds the little preview rows under a slot ----------
function renderMentorPreview(containerEl, mentor, menteeNames){
  // Clear old
  containerEl.innerHTML = '';

  // Disclaimer — *not guaranteed*
  const note = el('div', {
    class: 'ment-note',
    text: 'Potential weekly effects (not guaranteed). High-charisma, high-psychology mentors trigger more often.'
  });
  containerEl.appendChild(note);

  if (!mentor) return;

  const { pos, neg } = previewMentorEffects(mentor);

  // Pretty labels
  const ABBR = {
    workrate:'WR', psychology:'PSY', charisma:'CHA', mic:'MIC',
    athleticism:'ATH', strengthPower:'STR', agility:'AGI',
    professionalism:'PRO', momentum:'MOM', morale:'Morale', ringSafety:'SAFE'
  };

  const fmt = (map, wantNeg=false)=> {
    const parts = [];
    for (const [k,v] of Object.entries(map)){
      if (!v) continue;
      if (!wantNeg && v > 0) parts.push(`${ABBR[k]||k} +${v}`);
      if (wantNeg && v < 0)  parts.push(`${ABBR[k]||k} ${v}`); // v already negative
    }
    return parts.join(' · ');
  };

  (menteeNames || []).filter(Boolean).forEach(name=>{
    // Positive line (green)
    const posLine = fmt(pos, false);
    if (posLine){
      const row = el('div', { class:'chip chip-pos', text:`${name}: ${posLine}` });
      containerEl.appendChild(row);
    }
    // Baseline negatives, if any
    const negLine = fmt(neg, true);
    if (negLine){
      const rowN = el('div', { class:'chip chip-neg', text:`Possible downsides: ${negLine}` });
      containerEl.appendChild(rowN);
    }

    // Compatibility risk (mentee-specific, mental only)
    const mentee = state.roster.find(w=>w.name===name);
    if (mentee){
      const cmp = compatibilityPreview(state, mentor, mentee);
      if ((cmp?.morale||0) < 0 || (cmp?.professionalism||0) < 0){
        const details = [];
        if (cmp.flags?.olderMentee) details.push('older mentee');
        if (cmp.flags?.highStarMentee) details.push('high starpower (80+)');
        const deltas = [];
        if ((cmp.morale||0) < 0) deltas.push(`Morale ${cmp.morale}`);
        if ((cmp.professionalism||0) < 0) deltas.push(`PRO ${cmp.professionalism}`);
        const txt = `Compatibility risk${details.length?` (${details.join(' & ')})`:''}: ${deltas.join(' · ')}`;
        containerEl.appendChild(el('div',{class:'chip chip-neg', text: txt}));
      }
    }
  });
}
