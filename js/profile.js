// public/js/profile.js
// FM-style wrestler profile with streamlined attributes (15-stat model + birthday/age + color scale & delta arrows)

import { el, clamp, RAW, SD } from "./util.js";
import { loadState, ensureInitialised, headshotImg, saveState, nsKey } from "./engine.js";

/* ---------- never fail silently ---------- */
function bootError(msg, err){
  const root = getRoot();
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
  pre.style.padding = '12px';
  pre.style.border = '1px solid #444';
  pre.style.borderRadius = '10px';
  pre.textContent = `[Profile load error]\n${msg}\n\n`+(err?.stack||err?.message||'');
  root.innerHTML = '';
  root.appendChild(pre);
}
window.addEventListener('error', e => bootError(e.message, e.error));
window.addEventListener('unhandledrejection', e => bootError('Unhandled promise rejection', e.reason));

/* ---------- helpers ---------- */
function getRoot(){
  return document.getElementById('profile-root') || (() => {
    const m = document.createElement('main'); m.id='profile-root'; document.body.appendChild(m); return m;
  })();
}
function qparam(k){ try { return new URLSearchParams(location.search).get(k); } catch { return null; } }
function card(title, ...children){
  const c=el('div',{class:'pf-card'});
  if(title) c.appendChild(el('div',{class:'pf-card__title',text:title}));
  children.forEach(ch => ch && c.appendChild(ch));
  return c;
}
function initialAvatarText(name){
  const parts = String(name).trim().split(/\s+/);
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function applyRetroTitleBoostsFromHistory(name) {
  const state = loadState();
  if (!state) return 0;
  state.awardsApplied = state.awardsApplied || {};
  let applied = 0;

  for (const h of state.history || []) {
    for (const show of [h.myShow, h.oppShow]) {
      for (const seg of (show?.segments || [])) {
        if (!seg?.id) continue;
        const isChange = (seg.tags || []).some(t => /title\s*change!?/i.test(t));
        if (!isChange) continue;

        const winners = seg?.details?.winners || seg?.explain?.winners || seg?.debug?.winners || [];
        if (!winners.includes(name)) continue;
        if (state.awardsApplied[seg.id]) continue;

        // marquee vs normal via opponent avg starpower
        const others = (seg.names || []).filter(n => n !== name);
        const oppObjs = (state.roster || []).filter(w => others.includes(w.name));
        const oppAvg = oppObjs.length ? oppObjs.reduce((a,w)=>a+(+w.starpower||0),0) / oppObjs.length : 0;
        const bump = oppAvg >= 80 ? { sp:3, rp:3, cs:1 } : { sp:2, rp:2, cs:1 };

        const w = (state.roster || []).find(x => x.name === name);
        if (!w) continue;
        w.starpower   = (+w.starpower||0)   + bump.sp;
        w.reputation  = (+w.reputation||0)  + bump.rp;
        w.consistency = (+w.consistency||0) + bump.cs;

        state.awardsApplied[seg.id] = true;
        applied++;
      }
    }
  }

  if (applied) saveState(state);
  return applied;
}

/* ---------- date/age helpers (SIM-CLOCK AWARE) ---------- */
function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
// current sim date = startDate + (week-1)*7 days
function simNow(state){
  const base = parseDDMMYYYY(state.startDate || '01-04-2001') || new Date(2001,3,1);
  const d = new Date(base.getTime());
  const weeks = Math.max(1, Number(state.week||1)) - 1;
  d.setDate(d.getDate() + weeks*7);
  return d;
}
function ageFromBirthdayAt(bday, refDate){
  const d = parseDDMMYYYY(bday);
  if(!d || !(refDate instanceof Date)) return null;
  let age = refDate.getFullYear() - d.getFullYear();
  const preBirthday = (refDate.getMonth() < d.getMonth()) ||
                      (refDate.getMonth() === d.getMonth() && refDate.getDate() < d.getDate());
  if(preBirthday) age -= 1;
  return age;
}

/* ---------- Heat helpers (0..100 -> 0..8) ---------- */
function heatTier(heat) {
  if (typeof heat !== "number") return 0;
  return Math.max(0, Math.round(heat / 12)); // 0..8
}
function heatPill(text, tier) {
  const span = document.createElement('span');
  span.className = `pill heat heat-${tier}`;
  span.textContent = text;
  return span;
}

/* ---------- Value color scale & delta helpers ---------- */
function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:255,g:255,b:255 };
}
function mixColor(hexA, hexB, t){
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const b2 = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${b2})`;
}

// stops (value is 0..99)
const STAT_STOPS = [
  { at:  0, color: '#4b0000' },
  { at: 20, color: '#ff3b30' },
  { at: 40, color: '#ff7f00' },
  { at: 60, color: '#ffd60a' },
  { at: 75, color: '#93e89b' },
  { at: 90, color: '#1f8a3e' },
];
const STAT_BLUE_90 = '#8ec5ff';   // ≥90 = light blue

function colorForStat(v){
  const x = clamp(Number(v || 0), 0, 99);
  if (x >= 90) return STAT_BLUE_90;
  for (let i = 0; i < STAT_STOPS.length - 1; i++){
    const a = STAT_STOPS[i], b = STAT_STOPS[i+1];
    if (x >= a.at && x < b.at){
      const t = (x - a.at) / (b.at - a.at);
      return mixColor(a.color, b.color, t);
    }
  }
  return STAT_STOPS[STAT_STOPS.length - 1].color;
}

// build attr snapshot for comparisons
const ATTR_KEYS = [
  'workrate','psychology','charisma','mic','chemistry',
  'starpower','reputation','likeability','consistency','momentum',
  'stamina','durability','strengthPower','agility','athleticism'
];
function snapshotOf(w){
  const m = {};
  ATTR_KEYS.forEach(k => { m[k] = Number(w[k] ?? 60); });
  return m;
}

/* Namespaced snapshot reader (preferred) + legacy fallback */
function loadPrevSnapshot(name){
  try {
    return JSON.parse(localStorage.getItem(nsKey(`attr::${name}`)) || 'null');
  } catch { return null; }
}
// legacy localStorage fallback (pre-snapshots.js)
function loadPrevSnapshotLegacy(name){
  try { return JSON.parse(localStorage.getItem(`wwf_attr_snap_v1::${name}`) || 'null'); } catch { return null; }
}

function computeDeltas(curr, prev){
  const d = {};
  if (!prev) return d;
  for (const k of ATTR_KEYS){
    // Only compute if baseline has this key to avoid bogus arrows
    if (Object.prototype.hasOwnProperty.call(prev, k)) {
      const a = Number(curr[k] ?? 0), b = Number(prev[k] ?? 0);
      const diff = a - b;
      if (diff !== 0) d[k] = diff;
    }
  }
  return d;
}

/* ---------- FM-ish CSS (self-contained) ---------- */
(function injectStyles(){
  const s=document.createElement('style');
  s.textContent = `
  :root{
    --pf-surface: rgba(255,255,255,.03);
    --pf-stroke: rgba(255,255,255,.08);
    --pf-ink: rgba(255,255,255,.92);
    --pf-sub: rgba(255,255,255,.68);
    --pf-accent: rgba(140, 160, 255, .95);
    --pf-badge: rgba(255,255,255,.08);
  }
  .pf-wrap{ padding:16px; border-radius:16px; background:var(--pf-surface); box-shadow:0 0 0 1px var(--pf-stroke) inset; }
  .pf-header{ display:grid; grid-template-columns: 96px 1fr auto; align-items:center; gap:16px; margin-bottom:14px; }
  .pf-avatar{ width:96px; height:96px; border-radius:12px; background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
              display:grid; place-items:center; font-size:28px; color:var(--pf-ink); box-shadow:0 0 0 1px var(--pf-stroke) inset; overflow:hidden; }
  .pf-avatar__img{ width:96px; height:96px; object-fit:cover; display:block; }
  .pf-name{ margin:0; font-size:28px; line-height:1.1; color:var(--pf-ink) }
  .pf-badges{ display:flex; gap:8px; flex-wrap:wrap; margin-top:6px }
  .pf-badge{ padding:4px 9px; border-radius:999px; background:var(--pf-badge); border:1px solid var(--pf-stroke); font-size:12px }
  .pf-badge.good{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
  .pf-badge.warn{ background: rgba(255,170,0,.16); border-color: rgba(255,170,0,.35); }
  .pf-overall{ min-width:120px; text-align:right; }
  .pf-overall__num{ font-size:36px; font-weight:700; color:var(--pf-accent); line-height:1 }
  .pf-overall__lbl{ font-size:12px; color:var(--pf-sub) }
  .pf-progress{ margin: 8px 0 4px }
  .pf-progress__label{ font-size:12px; color:var(--pf-sub); margin-bottom:6px }
  .pf-progress__bar{ height:8px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; }
  .pf-progress__fill{ height:100%; background: var(--pf-accent); }
  .pf-grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:16px; }
  .pf-col{ display:grid; gap:16px }
  .pf-card{ padding:12px; border-radius:12px; background:rgba(255,255,255,.02); box-shadow:0 0 0 1px var(--pf-stroke) inset; }
  .pf-card__title{ font-weight:600; color:var(--pf-ink); margin-bottom:10px }
  .pf-attrs{ display:grid; grid-template-columns: repeat(2, 1fr); gap:10px }
  .pf-box{ padding:8px; border-radius:10px; background:rgba(255,255,255,.02); box-shadow:0 0 0 1px var(--pf-stroke) inset; }
  .pf-box__title{ font-size:12px; color:var(--pf-sub); margin-bottom:6px }
  .pf-row{ display:flex; justify-content:space-between; padding:3px 0; gap:8px; }
  .pf-row__l{ color:var(--pf-sub) }
  .pf-row__r{ color:var(--pf-ink); font-weight:700; display:flex; align-items:center; gap:6px; }
  .pf-val{ font-variant-numeric: tabular-nums; }
  .pf-delta.up{ color:#23d18b; font-size:12px; }
  .pf-delta.down{ color:#ff6b6b; font-size:12px; }
  .pf-info-grid{ display:grid; gap:12px }
  .pf-info-line{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; color:var(--pf-sub) }
  .pf-empty{ color:var(--pf-sub); }
  .pill.heat{ border:1px solid rgba(255,255,255,.15); padding:3px 8px; border-radius:999px; font-size:12px }
  .pill.heat-0{ background:rgba(255,80,80,.12);  border-color:rgba(255,80,80,.35);  color:#ffdede }
  .pill.heat-1{ background:rgba(255,120,80,.12); border-color:rgba(255,120,80,.35); color:#ffe6d9 }
  .pill.heat-2{ background:rgba(255,150,80,.12); border-color:rgba(255,150,80,.35); color:#ffe9d9 }
  .pill.heat-3{ background:rgba(255,190,80,.12); border-color:rgba(255,190,80,.35); color:#fff1d9 }
  .pill.heat-4{ background:rgba(255,210,80,.12); border-color:rgba(255,210,80,.35); color:#fff6d9 }
  .pill.heat-5{ background:rgba(210,220,80,.12); border-color:rgba(210,220,80,.35); color:#f5ffd9 }
  .pill.heat-6{ background:rgba(150,230,80,.12); border-color:rgba(150,230,80,.35); color:#edffdf }
  .pill.heat-7{ background:rgba(110,240,110,.12);border-color:rgba(110,240,110,.35);color:#e9ffe9 }
  .pill.heat-8{ background:rgba(120,180,255,.16);border-color:rgba(120,180,255,.45);color:#e7f0ff }
  @media (max-width: 900px){ .pf-grid{ grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(s);
})();

/* ---------- value row with color + delta ---------- */
function statRow(label, value, key, deltas){
  const r=el('div',{class:'pf-row'});
  r.appendChild(el('div',{class:'pf-row__l',text:label}));
  const right = el('div',{class:'pf-row__r'});

  const v = Number(value ?? 60);
  const val = el('span',{class:'pf-val', text:String(v)});
  val.style.color = colorForStat(v);
  right.appendChild(val);

  const d = deltas ? deltas[key] : 0;
  if (d && Number.isFinite(d)){
    const arrow = el('span',{class:`pf-delta ${d>0?'up':'down'}`, text: d>0 ? '▲' : '▼'});
    arrow.title = (d>0?'+':'') + d;
    right.appendChild(arrow);
  }

  r.appendChild(right);
  return r;
}

/* ---------- tiny progress bar ---------- */
function bar(label, value, max=100){
  const w=el('div',{class:'pf-progress'});
  w.appendChild(el('div',{class:'pf-progress__label',text:`${label} (${value}/${max})`}));
  const p=el('div',{class:'pf-progress__bar'}), f=el('div',{class:'pf-progress__fill',style:{width:`${clamp(value||0,0,max)}%`}});
  p.appendChild(f); w.appendChild(p); return w;
}

/* ---------- overall formula ---------- */
function overallOf(w){
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
  return clamp(o, 1, 99);
}

/* ---------- retirement display helper (SIM-CLOCK AWARE) ---------- */
function retirementStatus(w, refDate){
  const age = ageFromBirthdayAt(w.birthday, refDate);
  const lowPhys = (w.stamina ?? 100) < 10 || (w.durability ?? 100) < 10;
  if (w.retired) return { text: 'Retired', cls: 'warn' };
  if (age != null && age >= 51) return { text: 'Retired (51+ rule)', cls: 'warn' };
  if (lowPhys) return { text: 'At risk of retirement', cls: 'warn' };
  return { text: 'Active', cls: 'good' };
}
function isFreeAgent(brand){
  return !(brand === RAW || brand === SD || brand === 'RAW' || brand === 'SmackDown');
}

/* ---------- Retro boosts from title wins (applied once per match) ---------- */
function ensureAwards(state){
  if (!state.awardsApplied) state.awardsApplied = {};
}
function getRosterMap(state){
  const m = new Map();
  (state.roster||[]).forEach(w=>m.set(w.name, w));
  return m;
}
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }

/**
 * (kept) applyRetroTitleBoosts — used to compute deltas immediately
 */
function applyRetroTitleBoosts(state, who){
  const applied = {}; // accumulate deltas for this profile view
  try{
    ensureAwards(state);
    const rmap = getRosterMap(state);

    const brands = Object.keys(state.matchHistory || {});
    for (const brand of brands){
      for (const wk of (state.matchHistory[brand] || [])){
        for (const seg of (wk.segments || [])){
          if (!seg || !seg.id) continue;
          if (state.awardsApplied[seg.id]) continue; // already processed earlier
          const tags = seg.tags || [];
          if (!tags.includes('title change!')) continue;

          const winners = seg.explain?.winners
                       || state.matches?.[seg.id]?.details?.winners
                       || [];
          if (!winners.includes(who.name)) continue;

          const names = (seg.names && seg.names.length) ? seg.names
                       : state.matches?.[seg.id]?.names || [];
          let oppAvg = 0;
          if ((seg.type === 'tag') || names.length === 4){
            const sideA = [names[0], names[1]];
            const sideB = [names[2], names[3]];
            const winnerIsA = sideA.some(n => winners.includes(n));
            const oppSide = winnerIsA ? sideB : sideA;
            oppAvg = avg(oppSide.map(n => (rmap.get(n)?.starpower ?? 60)));
          } else if (names.length >= 2){
            const [a, b] = names;
            const winnerIsA = winners.includes(a);
            const opp = rmap.get(winnerIsA ? b : a);
            oppAvg = opp ? (opp.starpower ?? 60) : 0;
          }

          const marquee = oppAvg >= 85;
          const incSP  = marquee ? 3 : 2;
          const incREP = marquee ? 3 : 2;
          const incCON = 1;

          who.starpower   = clamp((who.starpower ?? 60) + incSP, 1, 99);
          who.reputation  = clamp((who.reputation ?? 60) + incREP, 1, 99);
          who.consistency = clamp((who.consistency ?? 60) + incCON, 1, 99);

          applied.starpower   = (applied.starpower   || 0) + incSP;
          applied.reputation  = (applied.reputation  || 0) + incREP;
          applied.consistency = (applied.consistency || 0) + incCON;

          state.awardsApplied[seg.id] = true; // remember so it's one-time
        }
      }
    }
  }catch(e){
    console.warn('applyRetroTitleBoosts failed:', e);
  }
  return applied;
}

/* ---------- render ---------- */
function renderNotFound(message){
  const root=getRoot();
  root.innerHTML='';
  root.appendChild(el('div',{class:'pf-wrap'}, el('div',{text:message})));
}

function init(){
  const root=getRoot();
  const state = loadState();
  if(!state){ renderNotFound('No season found. Go to Booking to start a new season.'); return; }
  ensureInitialised(state);

  const name = qparam('name');
  if(!name){ renderNotFound('No wrestler specified.'); return; }

  const w = state.roster.find(x => x.name === name);
  if(!w){ renderNotFound(`Profile not found for "${name}".`); return; }

  const bumped = applyRetroTitleBoostsFromHistory(name);

  // Apply retroactive, one-time title-win boosts and capture their deltas
  const awardDeltas = {}; // legacy path disabled; boosts applied via history scanner
  saveState(state);

  // sim date reference
  const nowSim = simNow(state);

  // deltas vs this week's baseline snapshot (captured at runShow start)
  const currSnap = snapshotOf(w);
  const baseline =
      (state.snapshots && state.snapshots.weekBaseline && state.snapshots.weekBaseline[w.name])
   || loadPrevSnapshot(w.name)        // namespaced preferred
   || loadPrevSnapshotLegacy(w.name); // legacy fallback
  const baseDeltas = computeDeltas(currSnap, baseline?.values || null);

  // --- add safe ringSafety delta if baseline has it ---
  const deltas = { ...baseDeltas };
  if (baseline?.values && typeof baseline.values.ringSafety === 'number') {
    const rsNow = Number(w.ringSafety ?? 0);
    const rsThen = Number(baseline.values.ringSafety ?? rsNow);
    const rsDiff = rsNow - rsThen;
    if (rsDiff !== 0) deltas.ringSafety = rsDiff;
  }
  // ----------------------------------------------------

  // Merge immediate award deltas so arrows show right away (don’t wait a week)
  for (const [k,v] of Object.entries(awardDeltas)) {
    deltas[k] = (deltas[k] || 0) + v;
  }

  const overall = overallOf(w);

  // UI
  root.innerHTML='';
  const wrap = el('div',{class:'pf-wrap'});

  // Header
  const header = el('div',{class:'pf-header'});

  // Avatar with fallback
  const avatar = el('div',{class:'pf-avatar'});
  const headshot = headshotImg(w.name, {
    className: 'pf-avatar__img',
    width: 96, height: 96,
    exts: ['webp','png','jpg','jpeg'],
    alt: w.name
  });
  headshot.onerror = () => {
    avatar.innerHTML = '';
    const fb = el('div',{class:'pf-avatar__fb', text: initialAvatarText(w.name)});
    fb.style.display='grid'; fb.style.placeItems='center'; fb.style.width='100%'; fb.style.height='100%';
    avatar.appendChild(fb);
  };
  avatar.appendChild(headshot);

  const heading = el('div');
  heading.appendChild(el('h2',{class:'pf-name', text: w.name}));

  const badges = el('div',{class:'pf-badges'});
  badges.appendChild(el('span',{class:'pf-badge',text:w.brand}));
  badges.appendChild(el('span',{class:'pf-badge',text:(w.gender==='F'?'Women':'Men')}));
  badges.appendChild(el('span',{class:`pf-badge ${w.alignment==='heel'?'':'good'}`,text:w.alignment}));
  if (w.championOf) badges.appendChild(el('span',{class:'pf-badge good',text:w.championOf}));
  if ((w.injuryWeeks||0)>0) badges.appendChild(el('span',{class:'pf-badge warn',text:`Injured: ${w.injuryWeeks}w`}));
  heading.appendChild(badges);

  const overallBox = el('div',{class:'pf-overall'});
  overallBox.appendChild(el('div',{class:'pf-overall__num',text:String(overall)}));
  overallBox.appendChild(el('div',{class:'pf-overall__lbl',text:'Overall'}));

  header.appendChild(avatar);
  header.appendChild(heading);
  header.appendChild(overallBox);
  wrap.appendChild(header);

  // Top line info: Fatigue + Age + DOB (SIM AGE)
  const age = ageFromBirthdayAt(w.birthday, nowSim);
  wrap.appendChild(bar('Fatigue', w.fatigue ?? 0, 100));
  wrap.appendChild(el('div',{class:'pf-progress__label', text:`Age: ${age ?? 'Unknown'} • DOB: ${w.birthday || 'Unknown'}`}));

  // Grid
  const grid = el('div',{class:'pf-grid'});

  /* ---------------- LEFT: attributes + storylines ---------------- */
  const left = el('div',{class:'pf-col'});

  // Attributes
  const attrsCard = card('Attributes');
  const attrs = el('div',{class:'pf-attrs'});

  // In-Ring
  const boxRing = el('div',{class:'pf-box'});
  boxRing.appendChild(el('div',{class:'pf-box__title',text:'In-Ring'}));
  boxRing.appendChild(statRow('Work Rate', w.workrate ?? 60, 'workrate', deltas));
  boxRing.appendChild(statRow('Psychology', w.psychology ?? 60, 'psychology', deltas));
  boxRing.appendChild(statRow('Charisma', w.charisma ?? w.promo ?? 60, 'charisma', deltas));
  boxRing.appendChild(statRow('Mic Skills', w.mic ?? w.promo ?? 60, 'mic', deltas));
  boxRing.appendChild(statRow('Chemistry', w.chemistry ?? 60, 'chemistry', deltas));
  attrs.appendChild(boxRing);

  // Profile
  const boxProf = el('div',{class:'pf-box'});
  boxProf.appendChild(el('div',{class:'pf-box__title',text:'Profile'}));
  boxProf.appendChild(statRow('Star Power', w.starpower ?? 60, 'starpower', deltas));
  boxProf.appendChild(statRow('Reputation', w.reputation ?? 60, 'reputation', deltas));
  boxProf.appendChild(statRow('Likeability', w.likeability ?? 60, 'likeability', deltas));
  boxProf.appendChild(statRow('Consistency', w.consistency ?? 60, 'consistency', deltas));
  boxProf.appendChild(statRow('Momentum', w.momentum ?? 60, 'momentum', deltas));
  attrs.appendChild(boxProf);

  // Physical
  const boxPhys = el('div',{class:'pf-box'});
  boxPhys.appendChild(el('div',{class:'pf-box__title',text:'Physical'}));
  boxPhys.appendChild(statRow('Stamina', w.stamina ?? 60, 'stamina', deltas));
  boxPhys.appendChild(statRow('Durability', w.durability ?? 60, 'durability', deltas));
  boxPhys.appendChild(statRow('Strength/Power', w.strengthPower ?? 60, 'strengthPower', deltas));
  boxPhys.appendChild(statRow('Agility', w.agility ?? 60, 'agility', deltas));
  boxPhys.appendChild(statRow('Athleticism', w.athleticism ?? 60, 'athleticism', deltas));
  attrs.appendChild(boxPhys);

  // Risk & Longevity
  const riskCard = el('div',{class:'pf-box'});
  riskCard.appendChild(el('div',{class:'pf-box__title',text:'Risk & Longevity'}));
  const injuryRisk = (w.ringSafety ?? 70) + (w.professionalism ?? 70) + (w.durability ?? 70);
  const riskTier = (injuryRisk >= 230) ? 'Very Low' : (injuryRisk >= 210) ? 'Low' : (injuryRisk >= 180) ? 'Moderate' : 'High';
  riskCard.appendChild(el('div',{class:'pf-row'},
    el('div',{class:'pf-row__l',text:'Injury Risk'}),
    el('div',{class:'pf-row__r'}, el('span',{text:riskTier}))
  ));
  // NEW: show Ring Safety (mentorship-affected) with optional delta
  riskCard.appendChild(statRow('Ring Safety', w.ringSafety ?? 60, 'ringSafety', deltas));
  riskCard.appendChild(statRow('Durability', w.durability ?? 60, 'durability', deltas));
  riskCard.appendChild(statRow('Stamina', w.stamina ?? 60, 'stamina', deltas));
  riskCard.appendChild(el('div',{class:'pf-row'}, el('div',{class:'pf-row__l',text:'Fatigue'}), el('div',{class:'pf-row__r',text:String(w.fatigue ?? 0)})));
  riskCard.appendChild(el('div',{class:'pf-row'}, el('div',{class:'pf-row__l',text:'Age'}), el('div',{class:'pf-row__r',text:String(age ?? 'Unknown')})));
  riskCard.appendChild(el('div',{class:'pf-row'}, el('div',{class:'pf-row__l',text:'Retirement Status'}), el('div',{class:'pf-row__r',text:retirementStatus(w, nowSim).text})));
  attrs.appendChild(riskCard);

  attrsCard.appendChild(attrs);
  left.appendChild(attrsCard);

  // Storylines
  const storyCard = card('Storylines');
  const hotWith = [];
  const hotKeys = Object.keys(state.hotMatches || {});
  for (const k of hotKeys) {
    const names = k.split(' | ');
    if (names.includes(w.name)) {
      const otherSide = names.filter(n => n !== w.name).join(' & ');
      hotWith.push(otherSide);
    }
  }
  if (hotWith.length) {
    const line = el('div', { class: 'pf-info-line' });
    line.appendChild(el('span', { class: 'pf-badge good', text: 'Hot last week' }));
    line.appendChild(el('div', { text: `vs ${hotWith.join(' / ')}` }));
    storyCard.appendChild(line);
  }
  const stories = (state.storylines[w.brand]||[]).filter(s=>s.heat>0 && s.names.includes(w.name));
  if(!stories.length){
    storyCard.appendChild(el('div',{class:'pf-empty',text:'No active storylines.'}));
  }else{
    stories.forEach(s=>{
      const line=el('div',{class:'pf-info-line'});
      const tier = heatTier(s.heat || 0);
      line.appendChild(heatPill(`Heat ${tier}`, tier));
      const vs = (s.names||[]).filter(n=>n!==w.name).join(' vs ');
      line.appendChild(el('div',{text:`${w.name} vs ${vs}`}));
      storyCard.appendChild(line);
    });
  }
  left.appendChild(storyCard);

  /* ---------------- RIGHT: belts / status / bio (+ Contract for FA) ---------------- */
  const right = el('div',{class:'pf-col'});

  const beltsCard = card('Belts', el('div',{text: w.championOf || 'None'}));
  right.appendChild(beltsCard);

  const statusCard = card('Status'));
  const healthy = (w.injuryWeeks||0)===0;
  const retireInfo = retirementStatus(w, nowSim);
  statusCard.appendChild(el('div',{class:'pf-info-line'},
    el('span',{class:`pf-badge ${healthy?'good':'warn'}`,text: healthy?'Available':'Unavailable'})
  ));
  statusCard.appendChild(el('div',{class:'pf-info-line'},
    el('span',{class:`pf-badge ${retireInfo.cls}`,text: retireInfo.text})
  ));
  statusCard.appendChild(el('div',{class:'pf-info-line',text:`Injury: ${w.injuryWeeks||0} week(s)`}));
  statusCard.appendChild(el('div',{class:'pf-info-line',text:`Fatigue: ${w.fatigue ?? 0}`}));
  if (w.role) statusCard.appendChild(el('div',{class:'pf-info-line',text:`Role: ${w.role}`}));
  right.appendChild(statusCard);

  // Contract box for Free Agents
  if (isFreeAgent(w.brand)) {
    const contract = card('Contract');
    contract.appendChild(el('div',{class:'pf-info-line', text:'This talent is a Free Agent.'}));

  const roleSel = el('select', {}, ...['wrestler', 'manager', 'mentor'].map(r => el('option', {
    value: r,
    text: r
  })));
  roleSel.value = w.role || 'wrestler';
  const btnRaw = el('button', {
    text: 'Sign to RAW'
  });
  const btnSD = el('button', {
    text: 'Sign to SmackDown'
  });
  btnRaw.onclick = () => {
    w.brand = RAW;
    w.role = roleSel.value;
    saveState(state);
    location.reload();
  };
  btnSD.onclick = () => {
    w.brand = SD;
    w.role = roleSel.value;
    saveState(state);
    location.reload();
  };
  const rowBtns = el('div', {
    class: 'pf-info-line'
  });
  rowBtns.appendChild(roleSel);
  rowBtns.appendChild(btnRaw);
  rowBtns.appendChild(btnSD);
  contract.appendChild(rowBtns);
  right.appendChild(contract);
  }
  const bioCard = card('Bio & Style');
  const info = el('div', {
    class: 'pf-info-grid'
  });
  info.appendChild(el('div', {
    class: 'pf-info-line',
    text: Birthday: $ {
    w.birthday || 'Unknown'
  }
                      }));
  info.appendChild(el('div', {
    class: 'pf-info-line',
    text: Style Tags: $ {
    (w.styleTags?.length ? w.styleTags.join(', ') : 'None')
  }
  }));
  bioCard.appendChild(info);
  right.appendChild(bioCard);
  grid.appendChild(left);
  grid.appendChild(right);
  wrap.appendChild(grid);
  root.appendChild(wrap);
  }
  try {
    init();
  } catch (e) {
    bootError(e.message, e);
  }
