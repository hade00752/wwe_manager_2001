// public/js/profile.js FM-style wrestler profile with
// FM-style wrestler profile with streamlined attributes (15-stat model + birthday/age + color scale & delta arrows)
// NOTE: Chemistry is NOT a wrestler attribute anymore.
//       Chemistry is computed dynamically per pair (rapport/pressure + traits + style synergy + alignment).

import { el, clamp, RAW, SD, FA, brandLabel } from './util.js';
import { boot, bootOrNull, saveState, headshotImg } from './engine.js';
import { collectPairsFor } from './engine/relationships.js';
import { SHOW_BUDGET } from './data.js'; // <— for contract % label
import { TRAIT_EFFECTS, computeTraitPairDelta } from './engine/traits.js'; // <— trait tooltips
import { getAttr } from './engine/attr_ledger.js';

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
function relBadge(text, cls = ''){
  const b = document.createElement('span');
  b.className = `pf-badge ${cls}`;
  b.textContent = text;
  return b;
}

async function fetchDbContract(era, wrestlerId){
  try {
    const r = await fetch(`/api/era/${era}/roster_full`);
    if (!r.ok) return null;

    const data = await r.json();

    // handle both possible shapes safely
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data.rows)
        ? data.rows
        : [];

    const match = rows.find(x => String(x.id) === String(wrestlerId));
    return match?.contractAnnual ?? null;

  } catch {
    return null;
  }
}


function num(n, d=0){ n = Number(n); return Number.isFinite(n) ? n : d; }
function numOr(v, fallback){ const n = Number(v); return Number.isFinite(n) ? n : fallback; }

function parseYearFromStartDate(ddmmyyyy){
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(ddmmyyyy||'').trim());
  return m ? Number(m[3]) : NaN;
}

function isValidEra(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return false;
  if (x === 0) return false;
  if (x >= 2000 && x <= 2100) return true;
  if (x >= 200001 && x <= 210012) return true;
  return false;
}

function A(w, key, fallback=60){
  if (!w) return fallback;
  const v = (typeof getAttr === 'function') ? getAttr(w, key) : w[key];
  return numOr(v, fallback);
}


function fmtMoney(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  if (x >= 1_000_000) return `$${(x/1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${Math.round(x/1000)}k`;
  return `$${x.toLocaleString()}`;
}

/* ---------- Pressure normalization ---------- */
function pressureEff(p){
  const v = num(p, 0);
  return (v === 0) ? 50 : clamp(v, 0, 100);
}

/* ---------- DB Relationships helpers (API: rapport/pressure/flags + traits) ---------- */

async function fetchDbRosterOne(era, wrestlerKey) {
  // Uses your existing endpoint: /api/era/:era/roster_full
  // Returns the matching roster row by id (preferred) or name.
  const r = await fetch(`/api/era/${era}/roster_full`);
  if (!r.ok) throw new Error(`DB roster_full fetch failed: ${r.status}`);
  const data = await r.json();
  // Server returns { ok, era, rows: [...] }
  const rows = Array.isArray(data) ? data : (Array.isArray(data.rows) ? data.rows : []);
  if (!rows.length) return null;

  const key = String(wrestlerKey ?? '').trim();

  // Prefer numeric id match if possible
  const asNum = Number(key);
  if (Number.isFinite(asNum)) {
    const hit = rows.find(x => Number(x.id) === asNum);
    if (hit) return hit;
  }

  // Fallback to name match
  return rows.find(x => String(x.name) === key) || null;
}


async function fetchDbRelationships(era, wrestlerKey) {
  const key = encodeURIComponent(String(wrestlerKey));
  const r = await fetch(`/api/era/${era}/relationships/${key}`);
  if (!r.ok) throw new Error(`DB relationships fetch failed: ${r.status}`);
  const data = await r.json();
  return Array.isArray(data.rows) ? data.rows : [];
}

function isBaseSignal(r){
  const flags = Array.isArray(r.flags) ? r.flags : [];
  return (
    Math.abs(numOr(r.rapport, 0)) >= 1 ||
    numOr(r.pressure, 0) >= 1 ||
    flags.length > 0
  );
}

function filterNotableBase(rows){
  return (rows || []).filter(r => {
    const rap      = numOr(r.rapport, 0);
    const pr       = numOr(r.pressure, 0);
    const hasFlags = Array.isArray(r.flags) && r.flags.length > 0;

    return (
      Math.abs(rap) >= 6 ||
      pr >= 10 ||
      hasFlags
    );
  });
}

function overlayTraitDeltas(row) {
  const delta = computeTraitPairDelta(row.selfTraits, row.otherTraits) || {};
  const dRap = numOr(delta.trustDelta, 0) + numOr(delta.respectDelta, 0);

  return {
    ...row,
    traitDelta: { ...delta, rapportDelta: dRap },
    rapportDisplay: numOr(row.rapport, 0) + dRap,
    pressureDisplay: numOr(row.pressure, 0),
    pressureEff: pressureEff(row.pressure)
  };
}

async function fetchDbRelationshipsCarryForward(era, wrestlerKey, { canonEras=[2002] } = {}){
  // 1) current era
  const nowRaw  = await fetchDbRelationships(era, wrestlerKey);
  const nowRows = (nowRaw || []).map(overlayTraitDeltas);

  const notableNow = filterNotableBase(nowRows);
  if (notableNow.length) {
    return { rows: nowRows, notable: notableNow, carried: false };
  }

  // 2) carry-forward from canon era(s) (only notable ones)
  const nowByOther = new Map(nowRows.map(r => [r.other_id, r]));
  const carried = [];

  for (const ce of canonEras){
    if (!isValidEra(ce)) continue;
    if (Number(ce) === Number(era)) continue;

    const canonRaw  = await fetchDbRelationships(ce, wrestlerKey);
    const canonRows = (canonRaw || []).map(overlayTraitDeltas);
    const notableCanon = filterNotableBase(canonRows);

    for (const r of notableCanon){
      const existing = nowByOther.get(r.other_id);

      // if current era has ANY base signal, do not override with canon
      if (existing && isBaseSignal(existing)) continue;

      const merged = {
        ...(existing || {}),
        ...r,
        carried: true,
        sourceEra: ce
      };

      merged.other_id = r.other_id;
      merged.other_name = r.other_name;

      carried.push(merged);
      nowByOther.set(r.other_id, merged);
    }
  }

  const notableFinal = carried.length ? carried : notableNow;
  return { rows: nowRows, notable: notableFinal, carried: carried.length > 0 };
}

// Derived state label for rapport/pressure world
function deriveRelStateFromNumbers(rapport, pressureRaw = 0) {
  const rap = numOr(rapport, 0);
  const p   = pressureEff(pressureRaw); // 0 in DB becomes 50 (neutral)

  // Helper: pressure bands (assuming 50 is neutral)
  const presHigh = p >= 70;   // heavy tension / management heat
  const presMed  = p >= 60;
  const presLow  = p <= 40;   // relaxed / low friction
  const presVeryLow = p <= 30;

  // --- Negative rapport (personal dislike axis) ---
  if (rap <= -35) return 'Hatred';
  if (rap <= -18) return presHigh ? 'BloodFeud' : 'TenseRivals';
  if (rap <= -8)  return presHigh ? 'TenseRivals' : 'Dislike';

  // --- Positive rapport (bond axis) ---
  if (rap >= 35) return 'BestFriends';
  if (rap >= 22) return 'CloseFriends';
  if (rap >= 10) return presHigh ? 'UneasyAlliance' : 'Liked';

  // --- Near-neutral rapport: let pressure tell the story ---
  // (only use positive-flavoured labels when rapport is non-negative)
  if (presHigh) return rap < 0 ? 'Tension' : 'ProfessionalRivals';
  if (presMed)  return 'Tension';
  if (rap >= 0 && presVeryLow) return 'EasyWorkingRelationship';
  if (rap >= 0 && presLow)     return 'ProfessionalRespect';

  return 'Neutral';
}

/* ---------- state -> badge class (FIX: was missing, caused DB fallback) ---------- */
function stateClass(st){
  if (!st) return '';
  if (['Hatred','BloodFeud','TenseRivals','Dislike'].includes(st)) return 'warn';
  if (['BestFriends','CloseFriends','Liked','EasyWorkingRelationship','ProfessionalRespect'].includes(st)) return 'good';
  if (['ProfessionalRivals','Tension','UneasyAlliance'].includes(st)) return 'info';
  return '';
}

/* ---------- Dynamic chemistry (pair-based) ---------- */

function relKey(a,b){ return [String(a),String(b)].sort().join("::"); }

// DB-first PairRel stores only deltas: dRapport, dPressure
function getLivePairFromState(state, aName, bName){
  const store = state?.relPairs || {};
  return store[relKey(aName,bName)] || null;
}

function countOverlap(a=[], b=[]){
  const setB = new Set(b);
  let n=0;
  for (const x of (a||[])) if (setB.has(x)) n++;
  return n;
}

function dynamicChemFromContext({
  rapport, pressure,
  selfStyleTags=[], otherStyleTags=[],
  traitDelta=null,
  alignmentA=null, alignmentB=null
}){
  const rap = clamp(numOr(rapport, 0), -50, 50);

  // pressure: 0/undefined from DB should mean neutral 50
  const p = pressureEff(pressure);

  let score = 0;

  // 1) Base from rapport
  score += rap * 1.6;

  // 2) Style synergy
  const shared = countOverlap(selfStyleTags, otherStyleTags);
  score += clamp(shared, 0, 3) * 8;

  const has = (arr, v)=> (arr||[]).includes(v);
  const complementary =
    (has(selfStyleTags,'HighFlyer') && has(otherStyleTags,'Powerhouse')) ||
    (has(selfStyleTags,'Powerhouse') && has(otherStyleTags,'HighFlyer')) ||
    (has(selfStyleTags,'Technician') && has(otherStyleTags,'Brawler')) ||
    (has(selfStyleTags,'Brawler') && has(otherStyleTags,'Technician')) ||
    (has(selfStyleTags,'TagSpecialist') && has(otherStyleTags,'TagSpecialist'));
  if (complementary) score += 8;

  // 3) Trait synergy (fold in trust/respect deltas even though DB is rapport-only)
  if (traitDelta){
    score += numOr(traitDelta.trustDelta, 0) * 1.2;
    score += numOr(traitDelta.respectDelta, 0) * 0.8;
  }

  // 4) Pressure term: meaningful only if something is happening
  const pres = (p - 50) / 50; // -1..+1
  const hasSignal = (rap !== 0) || (p !== 50) || shared > 0 || !!traitDelta;
  if (hasSignal){
    score += pres * (rap < 0 ? -28 : +18);
  }

  // 5) Alignment micro-effect (tiny)
  if (alignmentA && alignmentB && alignmentA !== alignmentB) score += 2;

  return clamp(Math.round(score), -100, 100);
}

// ---- devtools debug hooks (safe in prod; no side effects) ----
if (typeof window !== 'undefined') {
  window.__pf = window.__pf || {};
  window.__pf.dynamicChemFromContext = dynamicChemFromContext;
  window.__pf.computeTraitPairDelta = (typeof computeTraitPairDelta === 'function') ? computeTraitPairDelta : null;
  window.__pf.numOr = numOr;
  window.__pf.clamp = clamp;
}

/* ---------- retro title-boosts from history ---------- */
function applyRetroTitleBoostsFromHistory(name) {
  const state = boot();
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

        const others = (seg.names || []).filter(n => n !== name);
        const oppObjs = (state.roster || []).filter(w => others.includes(w.name));
        const oppAvg = oppObjs.length ? oppObjs.reduce((a,w)=>a+(+w.starpower||0),0) / oppObjs.length : 0;
        const bump = oppAvg >= 80 ? { sp:3, rp:3, cs:1 } : { sp:2, rp:2, cs:1 };

        const w = (state.roster || []).find(x => x.name === name);
        if (!w) continue;
        w.starpower   = clamp(numOr(w.starpower,60)   + bump.sp, 1, 99);
        w.reputation  = clamp(numOr(w.reputation,60)  + bump.rp, 1, 99);
        w.consistency = clamp(numOr(w.consistency,60) + bump.cs, 1, 99);

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
function simNow(state){
  const base = parseDDMMYYYY(state.startDate || '01-04-2001') || new Date(2004,3,1);
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

/* ---------- Heat pills ---------- */
function heatTier(heat){ if (typeof heat !== 'number') return 0; return Math.max(0, Math.round(heat/12)); }
function heatPill(text, tier){
  const span = document.createElement('span');
  span.className = `pill heat heat-${tier}`;
  span.textContent = text;
  return span;
}

/* ---------- Value color & deltas ---------- */
function hexToRgb(hex){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:{r:255,g:255,b:255}; }
function mixColor(hexA,hexB,t){ const a=hexToRgb(hexA),b=hexToRgb(hexB); const r=Math.round(a.r+(b.r-a.r)*t), g=Math.round(a.g+(b.g-a.g)*t), b2=Math.round(a.b+(b.b-a.b)*t); return `rgb(${r}, ${g}, ${b2})`; }
const STAT_STOPS=[{at:0,color:'#4b0000'},{at:20,color:'#ff3b30'},{at:40,color:'#ff7f00'},{at:60,color:'#ffd60a'},{at:75,color:'#93e89b'},{at:90,color:'#1f8a3e'}];
const STAT_BLUE_90='#8ec5ff';

// Chemistry removed from wrestler attributes.
const ATTR_KEYS=[
  'workrate','psychology','charisma','mic',
  'starpower','reputation','likeability','consistency','momentum','morale',
  'stamina','durability','strengthPower','agility','athleticism'
];

function snapshotOf(w){
  const m = {};
  ATTR_KEYS.forEach(k=>{
    const def = (k === 'morale') ? 65 : 60;
    m[k] = A(w, k, def);
  });
  return m;
}

function colorForStat(v, key){
  const hi = (key === 'morale') ? 100 : 99;
  const x = clamp(numOr(v,0),0,hi);
  if (x>=90) return STAT_BLUE_90;
  for (let i=0;i<STAT_STOPS.length-1;i++){
    const a=STAT_STOPS[i], b=STAT_STOPS[i+1];
    if (x>=a.at && x<b.at){ const t=(x-a.at)/(b.at-a.at); return mixColor(a.color,b.color,t); }
  }
  return STAT_STOPS[STAT_STOPS.length-1].color;
}

function loadPrevSnapshotLegacy(name){ try{ return JSON.parse(localStorage.getItem(`wwf_attr_snap_v1::${name}`)||'null'); }catch{ return null; } }
function computeDeltas(curr,prev){
  const d={}; if(!prev) return d;
  for (const k of ATTR_KEYS){
    if (Object.prototype.hasOwnProperty.call(prev,k)){
      const a=numOr(curr[k],0), b=numOr(prev[k],0);
      const diff=a-b;
      if(diff!==0) d[k]=diff;
    }
  }
  return d;
}

/* =====================================================================
   FM-STYLE PROFILE — RENDERING LAYER
   (everything below here is pure UI; data logic is above)
   ===================================================================== */

/* ---------- Overall formula ---------- */
function overallOf(w){
  const promoLike = (A(w,'charisma', A(w,'promo',60)) + A(w,'mic', A(w,'promo',60))) / 2;
  return clamp(Math.round(
    A(w,'workrate',60)*0.30 + A(w,'starpower',60)*0.25 +
    promoLike*0.15 + A(w,'momentum',60)*0.10 +
    A(w,'psychology',60)*0.10 + A(w,'consistency',60)*0.10
  ), 1, 99);
}

function retirementStatus(w, refDate){
  const age = ageFromBirthdayAt(w.birthday, refDate);
  const lowPhys = numOr(w.stamina,100)<10 || numOr(w.durability,100)<10;
  if (w.retired)              return { text:'Retired', cls:'warn' };
  if (age!=null && age>=51)   return { text:'Retired (51+)', cls:'warn' };
  if (lowPhys)                return { text:'At risk', cls:'warn' };
  return { text:'Active', cls:'good' };
}
function isFreeAgent(brand){
  const b = String(brand||'').trim().toUpperCase();
  return b==='FA' || b==='FREE AGENCY' || b==='FREEAGENCY';
}
function beltsFor(state, w){
  const res=[];
  try {
    for (const [title, holder] of Object.entries(state.champs?.[w.brand]||{})){
      if (Array.isArray(holder)){ if(holder.includes(w.name)) res.push(title); }
      else if(holder===w.name) res.push(title);
    }
  } catch{}
  return res;
}

/* ---------- Trait helpers ---------- */
function humanizePercent(x){ return (x>0?'+':'')+Math.round(x*100)+'%'; }
function humanizeFlat(x){ return (x>0?'+':'')+x; }
function titleCaseId(id){
  return String(id)
    .replace(/([a-z])([A-Z])/g,'$1 $2')
    .replace(/([A-Za-z])Core\b/g,'$1')
    .replace(/\bVs\b/g,'vs').replace(/\bPR\b/g,'PR').trim();
}
function summarizeTraitEffect(traitId){
  const t = TRAIT_EFFECTS[traitId]; if(!t) return '';
  const h = t.hooks||{}; const lines=[];
  if(h.momentum?.gainPct)                lines.push(`${humanizePercent(h.momentum.gainPct)} momentum gain`);
  if(h.momentum?.longMatchGainPct)       lines.push(`${humanizePercent(h.momentum.longMatchGainPct)} in long matches`);
  if(h.momentum?.winMultiplier)          lines.push(`Win momentum x${h.momentum.winMultiplier}`);
  if(h.momentum?.highSpotBonus)          lines.push(`High-spot bonus ${humanizeFlat(h.momentum.highSpotBonus)}`);
  if(h.momentum?.lossPenaltyMultiplier)  lines.push(`Loss penalty x${h.momentum.lossPenaltyMultiplier}`);
  if(h.morale?.flat)                     lines.push(`Morale ${humanizeFlat(h.morale.flat)}`);
  if(h.morale?.mainEventBonus)           lines.push(`Main-event morale ${humanizeFlat(h.morale.mainEventBonus)}`);
  if(h.morale?.offShowPenalty)           lines.push(`Off-show morale ${humanizeFlat(h.morale.offShowPenalty)}`);
  if(h.morale?.volatilityPct)            lines.push(`Morale volatility ${humanizePercent(h.morale.volatilityPct)}`);
  if(h.trustBase)                        lines.push(`Trust base ${humanizeFlat(h.trustBase)}`);
  if(h.respectBase)                      lines.push(`Respect base ${humanizeFlat(h.respectBase)}`);
  if(h.aura?.allyMoraleAura)             lines.push(`Ally morale aura ${humanizeFlat(h.aura.allyMoraleAura)}`);
  if(h.injury?.selfRiskPct)              lines.push(`Self-injury risk ${humanizeFlat(h.injury.selfRiskPct)}%`);
  if(h.injury?.opponentRiskPct)          lines.push(`Opponent risk ${humanizeFlat(h.injury.opponentRiskPct)}%`);
  if(h.injury?.selfRiskMultiplier)       lines.push(`Self-injury x${h.injury.selfRiskMultiplier}`);
  if(h.availability?.canBook===false)    lines.push(`Unavailable for booking`);
  if(typeof h.availability?.noShowChance==='number') lines.push(`No-show ${humanizeFlat(h.availability.noShowChance)}%`);
  if(typeof h.fanReactions==='number')   lines.push(`Fan reactions ${humanizeFlat(h.fanReactions)}`);
  if(h.bookingBias?.pushBias)            lines.push(`Push bias ${humanizeFlat(h.bookingBias.pushBias)}`);
  return lines.join('\n') || 'No special effects listed';
}

/* ---------- Effective relationship helpers ---------- */
function clampRapport(v){ return clamp(numOr(v,0),-50,50); }
function clampPressure(v){ return clamp(numOr(v,0),0,100); }
function effectiveRapportFromDbAndLive(dbRap, traitDelta, live){
  return clampRapport(numOr(dbRap,0)+numOr(traitDelta,0)+numOr(live?.dRapport,0));
}
function effectivePressureFromDbAndLive(dbPr, live){
  return clampPressure(numOr(dbPr,0)+numOr(live?.dPressure,0));
}

function renderNotFound(message){
  const root=getRoot(); root.innerHTML='';
  root.appendChild(el('div',{class:'pf-wrap'},el('div',{text:message})));
}

/* ---------- Scouting report blurb ---------- */
function cap(s){ return String(s).charAt(0).toUpperCase()+String(s).slice(1); }
function analysisParagraph(w){
  const sp=A(w,'starpower',60), wr=A(w,'workrate',60), psy=A(w,'psychology',60);
  const ch=A(w,'charisma',60),  mic=A(w,'mic',60),     sta=A(w,'stamina',60);
  const dur=A(w,'durability',60), mor=A(w,'morale',65), con=A(w,'consistency',60);
  const mom=A(w,'momentum',60), arc=numOr(w._arcStreak,0);

  const tier = sp>=90?'main event talent':sp>=78?'upper-midcard performer':sp>=63?'midcard worker':sp>=48?'lower-card worker':'enhancement talent';
  const ringAvg=(wr+psy)/2;
  const ring = ringAvg>=88?'elite ring general':ringAvg>=77?'strong in-ring performer':ringAvg>=67?'solid worker':'limited in-ring';
  const promoAvg=(ch+mic)/2;
  const promo = promoAvg>=85?'elite on the mic':promoAvg>=72?'capable promo':promoAvg>=58?'passable talker':'weak promo ability';
  const physAvg=(sta+dur)/2;
  const phys = physAvg>=80?'iron constitution':physAvg>=68?'durable frame':physAvg>=55?'average durability':'fragile — injury risk';
  const morDesc = mor>=78?'very content':mor>=68?'content':mor>=58?'unsettled':'disgruntled';
  let arcLine = '';
  if(arc>=4) arcLine = ' Currently riding a strong hot streak — breakout window is open.';
  else if(arc>=2) arcLine = ' Building momentum right now.';
  else if(arc<=-3) arcLine = ' Currently on a cold run — needs rebooking attention.';
  else if(mom>=78) arcLine = ' Fan enthusiasm is high.';
  const conLine = con>=82?' Remarkably consistent booking asset.':con<=52?' Consistency is a real concern.':'';

  return `${cap(tier)}, ${ring}. ${cap(promo)} — ${phys}. Currently ${morDesc} (morale ${mor}).${arcLine}${conLine}`;
}

/* =====================================================================
   STYLES
   ===================================================================== */
(function injectStyles(){
  const s = document.createElement('style');
  s.textContent = `
  /* ===== FM-STYLE PROFILE ===== */
  #profile-root {
    --pf-bg:      #0d1117;
    --pf-surf:    #161b22;
    --pf-surf2:   #1c2128;
    --pf-border:  rgba(255,255,255,.08);
    --pf-text:    rgba(255,255,255,.92);
    --pf-sub:     rgba(255,255,255,.50);
    --pf-accent:  #4e8ef7;
    --pf-good:    #3fb950;
    --pf-warn:    #f87171;
    --pf-amber:   #e3b341;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 0 32px;
    font-size: 13px;
    color: var(--pf-text);
    font-family: inherit;
  }

  /* --- Header --- */
  .pfn-header {
    display: grid;
    grid-template-columns: 130px 1fr auto;
    gap: 20px;
    align-items: start;
    padding: 20px 22px 18px;
    background: var(--pf-surf);
    border-radius: 10px 10px 0 0;
    border: 1px solid var(--pf-border);
    border-bottom: none;
  }
  .pfn-portrait {
    width: 130px; height: 130px;
    border-radius: 8px;
    background: rgba(255,255,255,.04);
    border: 1px solid var(--pf-border);
    overflow: hidden;
    display: grid; place-items: center;
    font-size: 38px; color: var(--pf-sub);
    flex-shrink: 0;
  }
  .pfn-portrait img { width:130px; height:130px; object-fit:cover; display:block; }
  .pfn-info { min-width: 0; padding-top: 2px; }
  .pfn-name {
    font-size: 28px; font-weight: 700; margin: 0 0 8px;
    color: var(--pf-text); line-height: 1.1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pfn-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .pfn-badge {
    padding: 3px 9px; border-radius: 4px;
    font-size: 11px; font-weight: 600;
    letter-spacing: .4px; text-transform: uppercase;
    background: rgba(255,255,255,.07); border: 1px solid var(--pf-border); color: var(--pf-sub);
  }
  .pfn-badge.raw   { background:rgba(220,50,50,.16); border-color:rgba(220,50,50,.4); color:#fca5a5; }
  .pfn-badge.sd    { background:rgba(70,120,255,.16); border-color:rgba(70,120,255,.4); color:#93b4fd; }
  .pfn-badge.fa    { background:rgba(160,160,160,.12); border-color:rgba(160,160,160,.3); color:#aaa; }
  .pfn-badge.face  { background:rgba(63,185,80,.14); border-color:rgba(63,185,80,.35); color:#86efac; }
  .pfn-badge.heel  { background:rgba(240,80,80,.14); border-color:rgba(240,80,80,.35); color:#fca5a5; }
  .pfn-badge.champ { background:rgba(230,180,0,.16); border-color:rgba(230,180,0,.4); color:#fcd34d; }
  .pfn-badge.warn  { background:rgba(240,80,80,.14); border-color:rgba(240,80,80,.35); color:#fca5a5; }
  .pfn-meta { font-size: 12px; color: var(--pf-sub); margin-bottom: 8px; }
  .pfn-style-tags { display: flex; gap: 5px; flex-wrap: wrap; }
  .pfn-style-chip {
    padding: 2px 8px; border-radius: 3px; font-size: 11px;
    background: rgba(78,142,247,.1); border: 1px solid rgba(78,142,247,.28);
    color: rgba(130,170,255,.9);
  }
  .pfn-overall { text-align: right; padding-top: 4px; }
  .pfn-overall__num {
    font-size: 56px; font-weight: 800; line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pfn-overall__lbl { font-size: 11px; color: var(--pf-sub); text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }

  /* --- Tabs --- */
  .pfn-tabs {
    display: flex;
    background: var(--pf-surf2);
    border: 1px solid var(--pf-border);
    border-top: none; border-bottom: none;
  }
  .pfn-tab {
    padding: 11px 22px; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .5px;
    color: var(--pf-sub); cursor: pointer;
    border: none; background: none;
    border-bottom: 2px solid transparent;
    transition: color .1s, border-color .1s, background .1s;
  }
  .pfn-tab:hover { color: var(--pf-text); background: rgba(255,255,255,.03); }
  .pfn-tab.active { color: var(--pf-accent); border-bottom-color: var(--pf-accent); background: rgba(78,142,247,.06); }

  /* --- Body / Panes --- */
  .pfn-body {
    background: var(--pf-surf);
    border: 1px solid var(--pf-border);
    border-top: none; border-radius: 0 0 10px 10px;
    padding: 20px; min-height: 440px;
  }
  .pfn-pane { display: none; }
  .pfn-pane.active { display: block; }

  /* --- Cards --- */
  .pfn-card {
    background: rgba(255,255,255,.025);
    border: 1px solid var(--pf-border);
    border-radius: 8px; padding: 14px 16px;
  }
  .pfn-card__ttl {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .7px;
    color: var(--pf-sub); margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--pf-border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .pfn-card__ttl span { color: var(--pf-accent); font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0; }

  /* --- Stat Bars --- */
  .sb-row {
    display: grid; grid-template-columns: 110px 30px 1fr 24px;
    align-items: center; gap: 8px; padding: 3.5px 0;
  }
  .sb-lbl { font-size: 12px; color: var(--pf-sub); }
  .sb-val { font-size: 13px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .sb-track { height: 5px; border-radius: 3px; background: rgba(255,255,255,.07); overflow: hidden; }
  .sb-fill  { height: 100%; border-radius: 3px; }
  .sb-delta { font-size: 10px; text-align: center; font-weight: 700; }
  .sb-delta.up { color: var(--pf-good); }
  .sb-delta.dn { color: var(--pf-warn); }

  /* --- Grids --- */
  .pfn-g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .pfn-g2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .pfn-g21 { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
  @media(max-width:960px){ .pfn-g3,.pfn-g2,.pfn-g21 { grid-template-columns:1fr; } }

  /* --- Analysis blurb --- */
  .pfn-analysis {
    background: rgba(78,142,247,.06);
    border: 1px solid rgba(78,142,247,.18);
    border-radius: 8px; padding: 13px 16px; margin-bottom: 16px;
    font-size: 13px; line-height: 1.65; color: var(--pf-text);
  }
  .pfn-analysis__lbl {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .7px; color: var(--pf-accent); margin-bottom: 5px;
  }

  /* --- KV rows --- */
  .pfn-kv { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--pf-border); }
  .pfn-kv:last-child { border-bottom: none; }
  .pfn-kv__k { color: var(--pf-sub); font-size: 12px; }
  .pfn-kv__v { font-size: 12px; font-weight: 600; }
  .pfn-kv__v.good  { color: var(--pf-good); }
  .pfn-kv__v.warn  { color: var(--pf-warn); }
  .pfn-kv__v.amber { color: var(--pf-amber); }
  .pfn-kv__v.accent{ color: var(--pf-accent); }

  /* --- Meter bar (morale, momentum) --- */
  .pfn-meter { margin: 0 0 10px; }
  .pfn-meter__hd { display: flex; justify-content: space-between; font-size: 11px; color: var(--pf-sub); margin-bottom: 5px; }
  .pfn-meter__val { font-weight: 700; }
  .pfn-meter__track { height: 8px; border-radius: 4px; background: rgba(255,255,255,.07); }
  .pfn-meter__fill  { height: 100%; border-radius: 4px; }

  /* --- Storyline rows --- */
  .pfn-story { display: flex; align-items: center; gap: 9px; padding: 7px 0; border-bottom: 1px solid var(--pf-border); }
  .pfn-story:last-child { border-bottom: none; }
  .pfn-story__heat {
    padding: 2px 7px; border-radius: 3px; font-size: 11px; font-weight: 700; flex-shrink: 0;
    background: rgba(255,150,0,.14); border: 1px solid rgba(255,150,0,.3); color: #fbbf24;
  }
  .pfn-story__vs { font-size: 12px; color: var(--pf-text); }

  /* --- Relationship rows --- */
  .pfn-rel {
    display: grid;
    grid-template-columns: 28px 170px 130px 1fr 90px;
    align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--pf-border);
  }
  .pfn-rel:last-child { border-bottom: none; }
  .pfn-rel__av {
    width: 26px; height: 26px; border-radius: 4px; object-fit: cover;
    background: rgba(255,255,255,.07); border: 1px solid var(--pf-border);
    display: grid; place-items: center; font-size: 9px; color: var(--pf-sub);
    flex-shrink: 0; overflow: hidden;
  }
  .pfn-rel__av img { width: 26px; height: 26px; object-fit: cover; display: block; }
  .pfn-rel__name { font-size: 12px; font-weight: 600; color: var(--pf-text); text-decoration: none; display: block; }
  .pfn-rel__name:hover { color: var(--pf-accent); }
  .pfn-rel__name-sub { font-size: 10px; color: var(--pf-sub); margin-top: 1px; }
  .pfn-rel__state {
    font-size: 11px; padding: 2px 7px; border-radius: 3px;
    font-weight: 600; text-align: center; white-space: nowrap;
  }
  .pfn-rel__state.good { background:rgba(63,185,80,.14); border:1px solid rgba(63,185,80,.35); color:#86efac; }
  .pfn-rel__state.warn { background:rgba(247,129,102,.14); border:1px solid rgba(247,129,102,.35); color:#fca5a5; }
  .pfn-rel__state.info { background:rgba(78,142,247,.12); border:1px solid rgba(78,142,247,.3); color:#93b4fd; }
  .pfn-rel__state.neutral { background:rgba(255,255,255,.05); border:1px solid var(--pf-border); color:var(--pf-sub); }
  .pfn-rel__meters { display: flex; flex-direction: column; gap: 4px; }
  .pfn-rel__mrow { display: grid; grid-template-columns: 52px 1fr 28px; gap: 5px; align-items: center; }
  .pfn-rel__mlbl { font-size: 10px; color: var(--pf-sub); }
  .pfn-rel__mval { font-size: 10px; font-weight: 700; text-align: right; }
  .pfn-rel__flags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .pfn-rel__flag {
    font-size: 10px; padding: 1px 5px; border-radius: 3px;
    background: rgba(255,255,255,.05); border: 1px solid var(--pf-border); color: var(--pf-sub);
  }
  .pfn-rel__flag.romance { color:#f9a8d4; border-color:rgba(249,168,212,.3); background:rgba(249,168,212,.07); }
  .pfn-rel__flag.family  { color:#86efac; border-color:rgba(134,239,172,.3); background:rgba(134,239,172,.07); }

  /* --- Traits --- */
  .pfn-trait-sec { display: grid; gap: 10px; }
  .pfn-trait-row { display: flex; align-items: flex-start; gap: 8px; }
  .pfn-trait-lbl { font-size: 11px; color: var(--pf-sub); width: 52px; flex-shrink: 0; padding-top: 3px; }
  .pfn-trait-chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .pfn-trait-chip {
    padding: 3px 9px; border-radius: 4px;
    background: rgba(255,255,255,.06); border: 1px solid var(--pf-border);
    font-size: 11px; color: var(--pf-text); cursor: help; white-space: nowrap;
  }
  .pfn-trait-chip.core   { border-color:rgba(78,142,247,.35); background:rgba(78,142,247,.08); }
  .pfn-trait-chip.status { border-color:rgba(227,179,65,.35); background:rgba(227,179,65,.08); color:var(--pf-amber); }
  .pfn-trait-chip.rare   { border-color:rgba(167,139,250,.35); background:rgba(167,139,250,.08); color:#c4b5fd; }
  .pfn-trait-chip:hover  { opacity:.75; }

  /* --- Contract bar --- */
  .pfn-cbar { margin: 8px 0 12px; }
  .pfn-cbar__hd { display: flex; justify-content: space-between; font-size: 11px; color: var(--pf-sub); margin-bottom: 5px; }
  .pfn-cbar__track { height: 8px; border-radius: 4px; background: rgba(255,255,255,.07); }
  .pfn-cbar__fill  { height: 100%; border-radius: 4px; }

  /* --- Signing buttons (FA) --- */
  .pfn-sign-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
  .pfn-sign-sel {
    padding: 5px 10px; background: var(--pf-surf2); color: var(--pf-text);
    border: 1px solid var(--pf-border); border-radius: 5px; font-size: 12px;
  }
  .pfn-sign-btn {
    padding: 5px 14px; border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
    border: 1px solid transparent;
  }
  .pfn-sign-btn.raw { background:rgba(220,50,50,.18); color:#fca5a5; border-color:rgba(220,50,50,.4); }
  .pfn-sign-btn.sd  { background:rgba(70,120,255,.18); color:#93b4fd; border-color:rgba(70,120,255,.4); }

  /* --- Empty --- */
  .pfn-empty { color: var(--pf-sub); font-size: 12px; padding: 12px 0; }
  .pfn-spin { color: var(--pf-sub); font-size: 12px; padding: 20px 0; text-align: center; }

  /* --- Hot/Cold arc pill --- */
  .pfn-arc { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 700; }
  .pfn-arc.hot  { background:rgba(255,100,0,.16); border:1px solid rgba(255,130,0,.35); color:#fb923c; }
  .pfn-arc.cold { background:rgba(100,140,255,.14); border:1px solid rgba(100,140,255,.3); color:#93c5fd; }
  `;
  document.head.appendChild(s);
})();

/* =====================================================================
   RENDER COMPONENTS
   ===================================================================== */

/** Horizontal stat bar row */
function statBar(label, value, key, delta) {
  const row = document.createElement('div');
  row.className = 'sb-row';

  const lbl = document.createElement('div');
  lbl.className = 'sb-lbl';
  lbl.textContent = label;

  const val = document.createElement('div');
  val.className = 'sb-val';
  val.textContent = String(Math.round(numOr(value,0)));
  val.style.color = colorForStat(value, key);

  const track = document.createElement('div');
  track.className = 'sb-track';
  const fill = document.createElement('div');
  fill.className = 'sb-fill';
  fill.style.width = clamp(numOr(value,0),0,100) + '%';
  fill.style.background = colorForStat(value, key);
  track.appendChild(fill);

  const dEl = document.createElement('div');
  const d = numOr(delta, 0);
  if (d !== 0) {
    dEl.className = 'sb-delta ' + (d > 0 ? 'up' : 'dn');
    dEl.textContent = d > 0 ? '+' + d : String(d);
  }

  row.appendChild(lbl);
  row.appendChild(val);
  row.appendChild(track);
  row.appendChild(dEl);
  return row;
}

/** Named meter bar (morale/momentum) */
function meterBar(label, value, color) {
  const wrap = document.createElement('div');
  wrap.className = 'pfn-meter';
  const hd = document.createElement('div');
  hd.className = 'pfn-meter__hd';
  const lSpan = document.createElement('span');
  lSpan.textContent = label;
  const vSpan = document.createElement('span');
  vSpan.className = 'pfn-meter__val';
  vSpan.textContent = String(Math.round(numOr(value,0)));
  vSpan.style.color = color;
  hd.appendChild(lSpan);
  hd.appendChild(vSpan);
  const track = document.createElement('div');
  track.className = 'pfn-meter__track';
  const fill = document.createElement('div');
  fill.className = 'pfn-meter__fill';
  fill.style.width = clamp(numOr(value,0),0,100) + '%';
  fill.style.background = color;
  track.appendChild(fill);
  wrap.appendChild(hd);
  wrap.appendChild(track);
  return wrap;
}

/** Key-value row */
function kvRow(k, v, cls) {
  const row = document.createElement('div');
  row.className = 'pfn-kv';
  const kEl = document.createElement('span');
  kEl.className = 'pfn-kv__k';
  kEl.textContent = k;
  const vEl = document.createElement('span');
  vEl.className = 'pfn-kv__v' + (cls ? ' ' + cls : '');
  vEl.textContent = String(v ?? '—');
  row.appendChild(kEl);
  row.appendChild(vEl);
  return row;
}

/** Card with title */
function pfCard(title, subtitle) {
  const c = document.createElement('div');
  c.className = 'pfn-card';
  const ttl = document.createElement('div');
  ttl.className = 'pfn-card__ttl';
  const t = document.createElement('span');
  t.textContent = title;
  ttl.appendChild(t);
  if (subtitle) {
    const s = document.createElement('span');
    s.textContent = subtitle;
    ttl.appendChild(s);
  }
  c.appendChild(ttl);
  return c;
}

/** Rel mini-bar (rapport / chemistry) */
function relMiniBar(label, value, min, max, positiveColor, negativeColor) {
  const row = document.createElement('div');
  row.className = 'pfn-rel__mrow';
  const lbl = document.createElement('span');
  lbl.className = 'pfn-rel__mlbl';
  lbl.textContent = label;
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range * 100) : 50;
  const color = value >= 0 ? positiveColor : negativeColor;
  const track = document.createElement('div');
  track.style.cssText = 'height:4px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%;width:${clamp(pct,0,100)}%;background:${color};`;
  track.appendChild(fill);
  const val = document.createElement('span');
  val.className = 'pfn-rel__mval';
  val.style.color = color;
  val.textContent = (value >= 0 ? '+' : '') + Math.round(value);
  row.appendChild(lbl);
  row.appendChild(track);
  row.appendChild(val);
  return row;
}

/* =====================================================================
   MAIN INIT
   ===================================================================== */
async function init(){
  const root = getRoot();
  const state = boot();
  if (!state){ renderNotFound('No season found — start a game from the main menu.'); return; }
  const name = qparam('name');
  if (!name){ renderNotFound('No wrestler specified.'); return; }
  const w = state.roster.find(x => x.name === name);
  if (!w){ renderNotFound(`Profile not found for "${name}".`); return; }

  applyRetroTitleBoostsFromHistory(name);
  saveState(state);

  // Era
  const qs = new URLSearchParams(location.search);
  const qsEraNum = Number(qs.get('era'));
  const derived = parseYearFromStartDate(state.startDate);
  const era =
    isValidEra(qsEraNum) ? qsEraNum :
    isValidEra(Number(state?.era)) ? Number(state.era) :
    isValidEra(derived) ? derived : 200404;

  if (!isValidEra(qsEraNum)) {
    const u = new URL(location.href);
    u.searchParams.set('era', String(era));
    history.replaceState({}, '', u.toString());
  }

  // DB overlay
  try {
    const wrestlerKey = (w.id != null) ? String(w.id) : w.name;
    const dbW = await fetchDbRosterOne(era, wrestlerKey);
    if (dbW) {
      if (dbW.contractAnnual != null) w.contractAnnual = Number(dbW.contractAnnual);
      if (dbW.expectedAnnual != null) w.expectedAnnual = Number(dbW.expectedAnnual);
      if (dbW.gender != null)    w.gender    = dbW.gender;
      if (dbW.birthday != null)  w.birthday  = dbW.birthday;
      if (dbW.brand != null)     w.brand     = dbW.brand;
      if (dbW.alignment != null) w.alignment = dbW.alignment;
      const ATTRS = [
        'starpower','workrate','charisma','mic','psychology','stamina','durability',
        'consistency','likeability','momentum','morale','athleticism','agility',
        'strengthPower','adaptability','professionalism','ringSafety','reputation'
      ];
      for (const k of ATTRS) { if (dbW[k] != null) w[k] = Number(dbW[k]); }
      if (Array.isArray(dbW.styleTags)) w.styleTags = dbW.styleTags;
      if (Array.isArray(dbW.traitIds)) {
        w.traitIds = dbW.traitIds;
        w.traits = {
          core:   w.traitIds.filter(id => TRAIT_EFFECTS?.[id]?.cat === 'core'),
          status: w.traitIds.filter(id => TRAIT_EFFECTS?.[id]?.cat === 'status'),
          rare:   w.traitIds.filter(id => TRAIT_EFFECTS?.[id]?.cat === 'rare'),
        };
      }
    }
  } catch(e) { console.warn('[profile] DB overlay failed', e); }

  // Computed values
  const nowSim    = simNow(state);
  const age       = ageFromBirthdayAt(w.birthday, nowSim);
  const overall   = overallOf(w);
  const currSnap  = snapshotOf(w);
  const baseline  = state.snapshots?.weekBaseline?.[w.name] || loadPrevSnapshotLegacy(w.name);
  const deltas    = computeDeltas(currSnap, baseline?.values || null);
  const belts     = beltsFor(state, w);
  const retireInfo = retirementStatus(w, nowSim);
  const arc       = numOr(w._arcStreak, 0);
  const inac      = numOr(w.weeksInactive, 0);
  const mor       = A(w, 'morale', 65);
  const mom       = A(w, 'momentum', 60);

  // ─── BUILD DOM ──────────────────────────────────────────────────────────
  root.innerHTML = '';

  // ═══════════════ HEADER ═════════════════════════════════════
  const header = document.createElement('div');
  header.className = 'pfn-header';

  // Portrait
  const portrait = document.createElement('div');
  portrait.className = 'pfn-portrait';
  const pImg = headshotImg(w.name, { width:130, height:130, alt:w.name });
  pImg.style.cssText = 'width:130px;height:130px;object-fit:cover;display:block;';
  pImg.onerror = () => { portrait.innerHTML = ''; portrait.textContent = initialAvatarText(w.name); };
  portrait.appendChild(pImg);

  // Info block
  const infoDiv = document.createElement('div');
  infoDiv.className = 'pfn-info';

  const nameEl = document.createElement('h1');
  nameEl.className = 'pfn-name';
  nameEl.textContent = w.name;

  const badgesDiv = document.createElement('div');
  badgesDiv.className = 'pfn-badges';

  const brandStr = (w.brand || 'FA').toUpperCase();
  const brandCls = brandStr === 'RAW' ? 'raw' : brandStr === 'SD' ? 'sd' : 'fa';
  const brandTxt = brandStr === 'SD' ? 'SmackDown' : brandStr === 'RAW' ? 'RAW' : 'Free Agent';
  addBadge(badgesDiv, brandTxt, brandCls);
  addBadge(badgesDiv, cap(w.alignment || 'neutral'), w.alignment === 'heel' ? 'heel' : w.alignment === 'face' ? 'face' : '');
  for (const b of belts) addBadge(badgesDiv, b, 'champ');
  if (numOr(w.injuryWeeks,0) > 0) addBadge(badgesDiv, `Injured ${w.injuryWeeks}w`, 'warn');

  const metaDiv = document.createElement('div');
  metaDiv.className = 'pfn-meta';
  const ageTxt = age != null ? `Age ${age}` : 'Age ?';
  const dobTxt = w.birthday ? ` · ${w.birthday}` : '';
  const retTxt = retireInfo.text !== 'Active' ? ` · ${retireInfo.text}` : '';
  metaDiv.textContent = ageTxt + dobTxt + retTxt;

  // Style tags
  const styleTags = document.createElement('div');
  styleTags.className = 'pfn-style-tags';
  for (const st of (w.styleTags || [])) {
    const chip = document.createElement('span');
    chip.className = 'pfn-style-chip';
    chip.textContent = st;
    styleTags.appendChild(chip);
  }

  infoDiv.appendChild(nameEl);
  infoDiv.appendChild(badgesDiv);
  infoDiv.appendChild(metaDiv);
  infoDiv.appendChild(styleTags);

  // Overall
  const ovBox = document.createElement('div');
  ovBox.className = 'pfn-overall';
  const ovNum = document.createElement('div');
  ovNum.className = 'pfn-overall__num';
  ovNum.textContent = String(overall);
  ovNum.style.color = colorForStat(overall, 'overall');
  const ovLbl = document.createElement('div');
  ovLbl.className = 'pfn-overall__lbl';
  ovLbl.textContent = 'Overall';
  ovBox.appendChild(ovNum);
  ovBox.appendChild(ovLbl);

  header.appendChild(portrait);
  header.appendChild(infoDiv);
  header.appendChild(ovBox);

  // ═══════════════ TAB BAR ════════════════════════════════════
  const tabBar = document.createElement('div');
  tabBar.className = 'pfn-tabs';
  const TAB_DEFS = [
    { id:'overview',      label:'Overview' },
    { id:'attributes',    label:'Attributes' },
    { id:'relationships', label:'Relationships' },
    { id:'contract',      label:'Contract & Bio' },
  ];
  const tabBtns = {}, panes = {};
  for (const t of TAB_DEFS) {
    const btn = document.createElement('button');
    btn.className = 'pfn-tab' + (t.id==='overview'?' active':'');
    btn.textContent = t.label;
    btn.dataset.tab = t.id;
    tabBtns[t.id] = btn;
    tabBar.appendChild(btn);
  }

  // ═══════════════ BODY ═══════════════════════════════════════
  const body = document.createElement('div');
  body.className = 'pfn-body';
  for (const t of TAB_DEFS) {
    const pane = document.createElement('div');
    pane.className = 'pfn-pane' + (t.id==='overview'?' active':'');
    pane.id = 'pane-' + t.id;
    panes[t.id] = pane;
    body.appendChild(pane);
  }

  tabBar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    const id = btn.dataset.tab;
    Object.values(tabBtns).forEach(b => b.classList.toggle('active', b===btn));
    Object.values(panes).forEach(p => p.classList.toggle('active', p.id==='pane-'+id));
  });

  // ═══════════════ OVERVIEW PANE ══════════════════════════════
  {
    const ov = panes.overview;

    // Analysis blurb
    const analysis = document.createElement('div');
    analysis.className = 'pfn-analysis';
    const aLbl = document.createElement('div');
    aLbl.className = 'pfn-analysis__lbl';
    aLbl.textContent = 'Scouting Report';
    const aTxt = document.createElement('div');
    aTxt.textContent = analysisParagraph(w);
    analysis.appendChild(aLbl);
    analysis.appendChild(aTxt);
    ov.appendChild(analysis);

    // 3-col grid
    const grid = document.createElement('div');
    grid.className = 'pfn-g3';

    // Col 1 — In-Ring
    const c1 = pfCard('In-Ring');
    for (const [lbl, key] of [
      ['Work Rate','workrate'],['Psychology','psychology'],
      ['Stamina','stamina'],['Durability','durability'],['Ring Safety','ringSafety']
    ]) c1.appendChild(statBar(lbl, A(w,key,60), key, deltas[key]));
    grid.appendChild(c1);

    // Col 2 — Presence
    const c2 = pfCard('Presence');
    for (const [lbl, key] of [
      ['Star Power','starpower'],['Charisma','charisma'],['Mic Skills','mic'],
      ['Reputation','reputation'],['Likeability','likeability'],['Consistency','consistency']
    ]) c2.appendChild(statBar(lbl, A(w,key,60), key, deltas[key]));
    grid.appendChild(c2);

    // Col 3 — Status
    const c3 = pfCard('Status');

    // Morale + Momentum meters
    const morColor = mor>=72?'#3fb950':mor>=58?'#e3b341':'#f87171';
    const momColor = mom>=72?'#4e8ef7':mom>=55?'#e3b341':'#f87171';
    c3.appendChild(meterBar('Morale', mor, morColor));
    c3.appendChild(meterBar('Momentum', mom, momColor));

    // Arc
    if (arc >= 2 || arc <= -2) {
      const arcPill = document.createElement('span');
      arcPill.className = 'pfn-arc ' + (arc > 0 ? 'hot' : 'cold');
      arcPill.textContent = arc > 0 ? `▲ Hot streak +${arc}` : `▼ Cold streak ${arc}`;
      c3.appendChild(arcPill);
      c3.appendChild(document.createElement('br'));
      c3.appendChild(document.createElement('br'));
    }

    c3.appendChild(kvRow('Fatigue', numOr(w.fatigue,0), numOr(w.fatigue,0)>25?'warn':''));
    c3.appendChild(kvRow('Injury', numOr(w.injuryWeeks,0)>0?`${w.injuryWeeks}w remaining`:'None', numOr(w.injuryWeeks,0)>0?'warn':'good'));
    c3.appendChild(kvRow('Status', retireInfo.text, retireInfo.cls));
    if (inac >= 2) c3.appendChild(kvRow('Off TV', `${inac} weeks`, inac>=4?'warn':'amber'));
    c3.appendChild(kvRow('Brand', brandTxt, ''));

    // Storylines separator
    const stTtl = document.createElement('div');
    stTtl.className = 'pfn-card__ttl';
    stTtl.style.marginTop = '14px';
    const stTtlSpan = document.createElement('span');
    stTtlSpan.textContent = 'Active Storylines';
    stTtl.appendChild(stTtlSpan);
    c3.appendChild(stTtl);

    const stories = (state.storylines?.[w.brand] || []).filter(s => s.heat>0 && s.names?.includes(w.name));
    if (!stories.length) {
      const e = document.createElement('div');
      e.className = 'pfn-empty';
      e.textContent = 'No active storylines';
      c3.appendChild(e);
    } else {
      for (const s of stories) {
        const row = document.createElement('div');
        row.className = 'pfn-story';
        const heat = document.createElement('span');
        heat.className = 'pfn-story__heat';
        heat.textContent = `H${heatTier(s.heat)}`;
        const vs = document.createElement('span');
        vs.className = 'pfn-story__vs';
        vs.textContent = 'vs ' + (s.names||[]).filter(n=>n!==w.name).join(' & ');
        row.appendChild(heat);
        row.appendChild(vs);
        c3.appendChild(row);
      }
    }

    // Belts
    if (belts.length) {
      const bTtl = document.createElement('div');
      bTtl.className = 'pfn-card__ttl';
      bTtl.style.marginTop = '14px';
      const bSpan = document.createElement('span');
      bSpan.textContent = 'Championships';
      bTtl.appendChild(bSpan);
      c3.appendChild(bTtl);
      for (const b of belts) {
        const bRow = document.createElement('div');
        bRow.className = 'pfn-kv';
        bRow.style.borderBottom = 'none';
        bRow.innerHTML = `<span class="pfn-kv__v accent">\u2605 ${b}</span>`;
        c3.appendChild(bRow);
      }
    }

    grid.appendChild(c3);
    ov.appendChild(grid);
  }

  // ═══════════════ ATTRIBUTES PANE ════════════════════════════
  {
    const at = panes.attributes;
    const grid = document.createElement('div');
    grid.className = 'pfn-g2';

    const groups = [
      { title:'In-Ring Performance', stats:[
        ['Work Rate','workrate'],['Psychology','psychology'],
        ['Ring Safety','ringSafety'],['Adaptability','adaptability'],
      ]},
      { title:'Physical Profile', stats:[
        ['Stamina','stamina'],['Durability','durability'],
        ['Strength / Power','strengthPower'],['Agility','agility'],['Athleticism','athleticism'],
      ]},
      { title:'Crowd Presence', stats:[
        ['Star Power','starpower'],['Charisma','charisma'],['Mic Skills','mic'],
        ['Likeability','likeability'],['Reputation','reputation'],
      ]},
      { title:'Professionalism', stats:[
        ['Consistency','consistency'],['Professionalism','professionalism'],
        ['Momentum','momentum'],['Morale','morale'],
      ]},
    ];

    for (const g of groups) {
      const card = pfCard(g.title);
      for (const [lbl, key] of g.stats) {
        const val = A(w, key, key==='morale'?65:60);
        const def = key==='morale'?65:60;
        card.appendChild(statBar(lbl, val, key, deltas[key]));
      }
      grid.appendChild(card);
    }
    at.appendChild(grid);
  }

  // ═══════════════ RELATIONSHIPS PANE ═════════════════════════
  {
    const rp = panes.relationships;
    const spin = document.createElement('div');
    spin.className = 'pfn-spin';
    spin.textContent = 'Loading relationships…';
    rp.appendChild(spin);

    const wrestlerKeyForRel = (w.id != null) ? String(w.id) : w.name;
    fetchDbRelationshipsCarryForward(era, wrestlerKeyForRel, { canonEras:[2002] })
      .then(({ notable }) => {
        rp.innerHTML = '';

        // Precompute effective values
        for (const r of notable || []) {
          const otherW = (state.roster||[]).find(x => x.name===r.other_name) || null;
          const live   = getLivePairFromState(state, w.name, r.other_name);
          r._effRap  = effectiveRapportFromDbAndLive(numOr(r.rapport,0), numOr(r.traitDelta?.rapportDelta,0), live);
          r._effPr   = effectivePressureFromDbAndLive(numOr(r.pressure,0), live);
          r._dynChem = dynamicChemFromContext({
            rapport: r._effRap, pressure: r._effPr,
            selfStyleTags: w.styleTags||[], otherStyleTags: otherW?.styleTags||[],
            traitDelta: r.traitDelta, alignmentA: w.alignment, alignmentB: otherW?.alignment
          });
        }

        // Sort by significance (most interesting first)
        (notable||[]).sort((a,b) => {
          const s = r => Math.abs(r._effRap||0)*2 + Math.abs(r._dynChem||0) + Math.abs(pressureEff(r._effPr||0)-50);
          return s(b)-s(a);
        });

        if (!notable?.length) {
          const e = document.createElement('div');
          e.className = 'pfn-empty';
          e.textContent = 'No notable relationships seeded for this era yet.';
          rp.appendChild(e);
          return;
        }

        const card = pfCard('Relationships', `${notable.length} notable`);

        // Column header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:grid;grid-template-columns:28px 170px 130px 1fr 90px;gap:10px;padding:4px 0 8px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:2px;';
        hdr.innerHTML = ['','Name','Relationship','Rapport / Chem','Flags'].map(
          (t,i) => `<span style="font-size:10px;color:var(--pf-sub);text-transform:uppercase;letter-spacing:.5px;${i===3?'grid-column:span 1':''}">${t}</span>`
        ).join('');
        card.appendChild(hdr);

        for (const r of notable.slice(0, 30)) {
          const row = document.createElement('div');
          row.className = 'pfn-rel';

          // Avatar
          const avWrap = document.createElement('div');
          avWrap.className = 'pfn-rel__av';
          const avImg = headshotImg(r.other_name, { width:26, height:26, alt:r.other_name });
          avImg.style.cssText = 'width:26px;height:26px;object-fit:cover;display:block;border-radius:3px;';
          avImg.onerror = () => { avWrap.textContent = initialAvatarText(r.other_name); };
          avWrap.appendChild(avImg);
          row.appendChild(avWrap);

          // Name + carried indicator
          const nameCol = document.createElement('div');
          const link = document.createElement('a');
          link.className = 'pfn-rel__name';
          link.href = `/profile.html?era=${encodeURIComponent(String(era))}&name=${encodeURIComponent(r.other_name)}`;
          link.textContent = r.other_name;
          nameCol.appendChild(link);
          if (r.carried) {
            const sub = document.createElement('div');
            sub.className = 'pfn-rel__name-sub';
            sub.textContent = `era ${r.sourceEra}`;
            nameCol.appendChild(sub);
          }
          row.appendChild(nameCol);

          // State badge
          const st = deriveRelStateFromNumbers(r._effRap, r._effPr);
          const stEl = document.createElement('span');
          stEl.className = 'pfn-rel__state ' + (stateClass(st)||'neutral');
          stEl.textContent = st;
          row.appendChild(stEl);

          // Mini bars
          const meters = document.createElement('div');
          meters.className = 'pfn-rel__meters';
          meters.appendChild(relMiniBar('Rapport', r._effRap, -50, 50, '#3fb950', '#f87171'));
          meters.appendChild(relMiniBar('Chem', r._dynChem, -100, 100, '#4e8ef7', '#f78166'));
          row.appendChild(meters);

          // Flags
          const flagsDiv = document.createElement('div');
          flagsDiv.className = 'pfn-rel__flags';
          for (const f of (r.flags||[]).filter(f=>f!=='backstage').slice(0,3)) {
            const fb = document.createElement('span');
            fb.className = 'pfn-rel__flag' + (f==='romance'?' romance':f==='family'?' family':'');
            fb.textContent = f;
            flagsDiv.appendChild(fb);
          }
          // Show pressure if notable
          const pEff = pressureEff(r._effPr);
          if (Math.abs(pEff-50) >= 15) {
            const pb = document.createElement('span');
            pb.className = 'pfn-rel__flag';
            pb.title = 'Pressure (50=neutral)';
            pb.textContent = `P${Math.round(pEff)}`;
            flagsDiv.appendChild(pb);
          }
          row.appendChild(flagsDiv);

          card.appendChild(row);
        }
        rp.appendChild(card);
      })
      .catch(e => {
        rp.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'pfn-empty';
        err.textContent = 'Could not load relationships: ' + e.message;
        rp.appendChild(err);
      });
  }

  // ═══════════════ CONTRACT & BIO PANE ════════════════════════
  {
    const cb = panes.contract;
    const grid = document.createElement('div');
    grid.className = 'pfn-g21';

    // Left: Traits
    const traitsCard = pfCard('Traits');
    const tt = (w.traits || { core:[], status:[], rare:[] });
    const traitSec = document.createElement('div');
    traitSec.className = 'pfn-trait-sec';

    for (const [cat, ids] of [['Core', tt.core||[]], ['Status', tt.status||[]], ['Rare', tt.rare||[]]]) {
      const row = document.createElement('div');
      row.className = 'pfn-trait-row';
      const lbl = document.createElement('span');
      lbl.className = 'pfn-trait-lbl';
      lbl.textContent = cat;
      row.appendChild(lbl);
      const chips = document.createElement('div');
      chips.className = 'pfn-trait-chips';
      if (!ids.length) {
        const none = document.createElement('span');
        none.style.cssText = 'color:var(--pf-sub);font-size:12px;';
        none.textContent = 'None';
        chips.appendChild(none);
      } else {
        for (const id of ids) {
          const chip = document.createElement('span');
          chip.className = 'pfn-trait-chip ' + cat.toLowerCase();
          chip.textContent = titleCaseId(id);
          chip.title = summarizeTraitEffect(id);
          chips.appendChild(chip);
        }
      }
      row.appendChild(chips);
      traitSec.appendChild(row);
    }
    traitsCard.appendChild(traitSec);
    grid.appendChild(traitsCard);

    // Right column: Contract + Bio stacked
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'display:grid;gap:14px;align-content:start;';

    // Contract card
    const contCard = pfCard('Contract');
    const annual   = w.contractAnnual ?? null;
    const expected = w.expectedAnnual ?? null;
    const pct      = annual != null ? (annual / SHOW_BUDGET * 100) : null;

    if (isFreeAgent(w.brand)) {
      const fa = document.createElement('div');
      fa.className = 'pfn-empty';
      fa.textContent = 'Not under contract (Free Agent)';
      contCard.appendChild(fa);
      const row = document.createElement('div');
      row.className = 'pfn-sign-row';
      const sel = document.createElement('select');
      sel.className = 'pfn-sign-sel';
      for (const r of ['wrestler','manager','mentor']) {
        const o = document.createElement('option');
        o.value = r; o.textContent = r;
        sel.appendChild(o);
      }
      sel.value = w.role || 'wrestler';
      const bRaw = document.createElement('button');
      bRaw.className = 'pfn-sign-btn raw';
      bRaw.textContent = 'Sign to RAW';
      bRaw.onclick = () => { w.brand=RAW; w.role=sel.value; saveState(state); location.reload(); };
      const bSD = document.createElement('button');
      bSD.className = 'pfn-sign-btn sd';
      bSD.textContent = 'Sign to SD';
      bSD.onclick = () => { w.brand=SD; w.role=sel.value; saveState(state); location.reload(); };
      row.appendChild(sel);
      row.appendChild(bRaw);
      row.appendChild(bSD);
      contCard.appendChild(row);
    } else {
      contCard.appendChild(kvRow('Annual', fmtMoney(annual), annual!=null&&annual>4_000_000?'warn':''));
      contCard.appendChild(kvRow('Expected', fmtMoney(expected), ''));
      contCard.appendChild(kvRow('Budget %', pct!=null ? pct.toFixed(2)+'%' : '—', pct>5?'warn':pct>2?'amber':''));
      if (pct != null) {
        const cbar = document.createElement('div');
        cbar.className = 'pfn-cbar';
        const ch = document.createElement('div');
        ch.className = 'pfn-cbar__hd';
        ch.innerHTML = `<span>Budget share</span><span>${pct.toFixed(2)}%</span>`;
        const ct = document.createElement('div');
        ct.className = 'pfn-cbar__track';
        const cf = document.createElement('div');
        cf.className = 'pfn-cbar__fill';
        cf.style.width = Math.min(pct,100) + '%';
        cf.style.background = pct>5?'#f87171':pct>2?'#e3b341':'#4e8ef7';
        ct.appendChild(cf);
        cbar.appendChild(ch);
        cbar.appendChild(ct);
        contCard.appendChild(cbar);
      }
    }
    rightCol.appendChild(contCard);

    // Bio card
    const bioCard = pfCard('Biography');
    bioCard.appendChild(kvRow('Full Name',  w.name, ''));
    bioCard.appendChild(kvRow('Age',        age!=null?String(age):'Unknown', ''));
    bioCard.appendChild(kvRow('Date of Birth', w.birthday||'Unknown', ''));
    bioCard.appendChild(kvRow('Gender',     w.gender==='F'?'Female':'Male', ''));
    bioCard.appendChild(kvRow('Brand',      brandTxt, ''));
    bioCard.appendChild(kvRow('Alignment',  cap(w.alignment||'neutral'), ''));
    bioCard.appendChild(kvRow('Role',       cap(w.role||'Wrestler'), ''));
    if (w.styleTags?.length) bioCard.appendChild(kvRow('Style', w.styleTags.join(', '), ''));
    rightCol.appendChild(bioCard);

    grid.appendChild(rightCol);
    cb.appendChild(grid);
  }

  // ═══════════════ MOUNT ══════════════════════════════════════
  root.appendChild(header);
  root.appendChild(tabBar);
  root.appendChild(body);
}

function addBadge(container, text, cls) {
  const b = document.createElement('span');
  b.className = 'pfn-badge' + (cls ? ' ' + cls : '');
  b.textContent = text;
  container.appendChild(b);
  return b;
}

/* ---------- boot ---------- */
init();
