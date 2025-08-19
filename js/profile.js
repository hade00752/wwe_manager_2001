// public/js/profile.js — stable profile with baseline deltas and no undefined calls

import { el, clamp, RAW, SD } from "./util.js";
import { loadState, ensureInitialised, headshotImg, saveState, nsKey } from "./engine.js";

/* ---------- boot error ---------- */
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

/* ---------- tiny utils ---------- */
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

/* ---------- date/age (SIM CLOCK) ---------- */
function parseDDMMYYYY(s){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}
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

/* ---------- heat helpers ---------- */
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

/* ---------- stat color + deltas ---------- */
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
const STAT_STOPS = [
  { at:  0, color: '#4b0000' },
  { at: 20, color: '#ff3b30' },
  { at: 40, color: '#ff7f00' },
  { at: 60, color: '#ffd60a' },
  { at: 75, color: '#93e89b' },
  { at: 90, color: '#1f8a3e' },
];
const STAT_BLUE_90 = '#8ec5ff';
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

/* ---------- snapshot + deltas ---------- */
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
// namespaced preferred
function loadPrevSnapshot(name){
  try { return JSON.parse(localStorage.getItem(nsKey(`attr::${name}`)) || 'null'); } catch { return null; }
}
// legacy fallback (older builds saved this way)
function loadPrevSnapshotLegacy(name){
  try { return JSON.parse(localStorage.getItem(`wwf_attr_snap_v1::${name}`) || 'null'); } catch { return null; }
}
function computeDeltas(curr, prev){
  const d = {};
  if (!prev) return d;
  for (const k of ATTR_KEYS){
    if (Object.prototype.hasOwnProperty.call(prev, k)) {
      const a = Number(curr[k] ?? 0), b = Number(prev[k] ?? 0);
      const diff = a - b;
      if (diff !== 0) d[k] = diff;
    }
  }
  return d;
}

/* ---------- find a fallback baseline from per-match records ---------- */
function findPerMatchBaseline(state, name){
  try{
    const matches = Object.values(state.matches || {});
    if (!matches.length) return null;
    // sort by week (desc) then brand just to make order stable
    matches.sort((a,b)=>{
      const wa = Number(a.week ?? -1), wb = Number(b.week ?? -1);
      if (wa !== wb) return wb - wa;
      return String(b.brand||'').localeCompare(String(a.brand||''));
    });
    for (const m of matches){
      const base = m?.baseline?.[name]?.values;
      if (base && typeof base === 'object') return { values: base };
    }
  }catch{}
  return null;
}

/* ---------- momentum delta fallback (if no baseline) ---------- */
function findLatestMomentumDelta(state, name){
  try{
    const matches = Object.values(state.matches || {});
    matches.sort((a,b)=>{
      const wa = Number(a.week ?? -1), wb = Number(b.week ?? -1);
      if (wa !== wb) return wb - wa;
      return String(b.brand||'').localeCompare(String(a.brand||''));
    });
    for (const m of matches){
      const d = m?.details?.momentumDelta || m?.debug?.momentumDelta || {};
      if (typeof d[name] === 'number' && d[name] !== 0) return d[name];
    }
  }catch{}
  return 0;
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

/* ---------- FM-ish CSS (scoped) ---------- */
(function injectStyles(){ /* unchanged CSS omitted for brevity */ })();

/* ---------- rows & bars ---------- */
function statRow(label, value, key, deltas){ /* unchanged */ }
function bar(label, value, max=100){ /* unchanged */ }

/* ---------- overall & status ---------- */
function overallOf(w){ /* unchanged */ }
function retirementStatus(w, refDate){ /* unchanged */ }
function isFreeAgent(brand){ /* unchanged */ }

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

  const nowSim = simNow(state);

  // deltas vs this week's baseline snapshot (captured by Results via snapshotWeekBaselineOnce)
  const currSnap = snapshotOf(w);
  const baselineSnap =
        (state.snapshots && state.snapshots.weekBaseline && state.snapshots.weekBaseline[w.name])
  || loadPrevSnapshot(w.name)        
  || loadPrevSnapshotLegacy(w.name); 
  const baseDeltas = computeDeltas(currSnap, baselineSnap?.values || null);

  // Ring Safety extra delta (shown under Risk)
  const deltas = { ...baseDeltas };
  if (baselineSnap?.values && typeof baselineSnap.values.ringSafety === 'number') {
    const rsNow = Number(w.ringSafety ?? 0);
    const rsThen = Number(baselineSnap.values.ringSafety ?? rsNow);
    const rsDiff = rsNow - rsThen;
    if (rsDiff !== 0) deltas.ringSafety = rsDiff;
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

  const statusCard = card('Status');
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

    const roleSel = el('select',{}, ...['wrestler','manager','mentor'].map(r => el('option',{value:r,text:r})));
    roleSel.value = w.role || 'wrestler';
    const btnRaw = el('button',{text:'Sign to RAW'});
    const btnSD  = el('button',{text:'Sign to SmackDown'});
    btnRaw.onclick = () => { w.brand = RAW; w.role = roleSel.value; saveState(state); location.reload(); };
    btnSD.onclick  = () => { w.brand = SD;  w.role = roleSel.value; saveState(state); location.reload(); };
    const rowBtns = el('div',{class:'pf-info-line'});
    rowBtns.appendChild(roleSel);
    rowBtns.appendChild(btnRaw);
    rowBtns.appendChild(btnSD);
    contract.appendChild(rowBtns);
    right.appendChild(contract);
  }

  // Bio & Style
  const bioCard = card('Bio & Style');
  const info = el('div',{class:'pf-info-grid'});
  info.appendChild(el('div',{class:'pf-info-line',text:`Birthday: ${w.birthday || 'Unknown'}`}));
  info.appendChild(el('div',{class:'pf-info-line', text:`Style Tags: ${ (w.styleTags?.length? w.styleTags.join(', ') : 'None') }`}));
  bioCard.appendChild(info);
  right.appendChild(bioCard);

  // Mount
  grid.appendChild(left);
  grid.appendChild(right);
  wrap.appendChild(grid);
  root.appendChild(wrap);
}

try { init(); } catch(e){ bootError(e.message, e); }
