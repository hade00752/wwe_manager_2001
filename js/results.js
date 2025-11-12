// public/js/results.js
import { el } from "./util.js?v=1755554537";
import {
  loadState, saveState, ensureInitialised,
  runShow, aiBooking, headshotImg, advanceSimWeek,
  recordWeeklyFinance, weeklyContractTick, ensureFinances,
  financeReportForWeek, financeTotals, formatMoney
} from "./engine.js?v=1755554537";
import { normalizeAllMatches } from "./details_normalize.js";
import { snapshotWeekBaselineOnce } from './engine/snapshots.js';
import { openMatchModal } from "./match.js"; // modal caller
import { nsKey } from "./engine.js?v=1755554537"; // with other imports

const root = document.getElementById('results-root') || (() => {
  const m = document.createElement('main'); m.id = 'results-root'; document.body.appendChild(m); return m;
})();

let state;
let currentIndex = 0;

/* ------------------------------ tiny styles ----------------------------- */
(function injectStyles(){
  if (document.getElementById('results-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'results-ui-styles';
  s.textContent = `
  :root{ --appbar-h:56px; }
  .segbox{ padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.02); box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; margin:10px 0 }
  .segline{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
  .segsummary{ margin:6px 0 6px; font-weight:600 }
  .segsummary.blue{ color:#a8c8ff } .segsummary.green{ color:#93e89b } .segsummary.yellow{ color:#ffd769 } .segsummary.red{ color:#ff8a8a }
  .segdivider{ border:0; border-top:1px solid rgba(255,255,255,.06); margin:8px 0 }
  .pill{ display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15) }
  .pill.warn{ background: rgba(255,170,0,.16); border-color: rgba(255,170,0,.35); }
  .pill.score{ font-weight:700 }
  .pill.blue{ background:rgba(120,180,255,.16); border-color:rgba(120,180,255,.4) }
  .pill.green{ background:rgba(110,240,110,.12); border-color:rgba(110,240,110,.35) }
  .pill.yellow{ background:rgba(255,210,80,.12); border-color:rgba(255,210,80,.35) }
  .pill.red{ background:rgba(255,80,80,.12); border-color:rgba(255,80,80,.35) }
  .segstory{ margin-top:8px; padding:8px 10px; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); }
  .segstory-header{ font-size:13px; font-weight:600; margin-bottom:4px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .segstory-sub{ font-size:12px; opacity:.8; text-transform:uppercase; letter-spacing:.4px; margin-top:6px; }
  .segstory ul{ margin:4px 0 0 14px; padding:0 0 0 4px; font-size:13px; opacity:.92; }
  .segstory li{ margin:2px 0; }
  .btn-min{ padding:4px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); cursor:pointer }

  .chips{ display:flex; gap:8px; flex-wrap:wrap; margin:2px 0 6px }
  .chip{ display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); }
  .chip.win{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
  .chip img{ width:22px; height:22px; border-radius:999px; object-fit:cover }
  .chip .nm{ font-size:12px; opacity:.95 }

  .week-header{ position:sticky; top:var(--appbar-h); z-index:10; background:rgba(12,14,18,.88); backdrop-filter: blur(8px); border-radius:12px; box-shadow:0 0 0 1px rgba(255,255,255,.06) inset; margin-bottom:12px; }

  .card{ padding:12px; border-radius:12px; background:rgba(255,255,255,.02); box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; margin:8px 0 }
  `;
  document.head.appendChild(s);
})();

/* -------------------------------- utils -------------------------------- */
const MATCH_TYPES = new Set(['singles','tag','Match']);
const scoreClass = (n) => (n>=90?'score blue': n>=75?'score green': n>=60?'score yellow':'score red');
const pill = (text, cls='') => el('span', { class: `pill ${cls}`, text });

const signed = (n) => {
  if (!Number.isFinite(n) || n === 0) return String(Math.round(n || 0));
  return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`;
};

const currentMorale = (name) => {
  if (!state || !Array.isArray(state.roster)) return null;
  const w = state.roster.find(w => w.name === name);
  return Number.isFinite(w?.morale) ? Math.round(w.morale) : null;
};

function nameChip(n, cls=''){
  const c = el('span',{class:`chip ${cls}`.trim()});
  const img = headshotImg(n, { width:22, height:22, exts:['webp','png','jpg','jpeg'], alt:n });
  img.onerror = () => {
    img.replaceWith(el('span',{class:'pill',text:n.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}));
  };
  c.appendChild(img);
  c.appendChild(el('span',{class:'nm', text:n}));
  return c;
}

/* -------------------------------- init --------------------------------- */
init();

function init(){
  try{
    state = loadState();
    if(!state){
      root.appendChild(el('div',{class:'card'}, el('div',{text:'No season found. Start a new season from Booking.'})));
      return;
    }

    // Normalise core structure; do NOT wipe history
    ensureInitialised(state);
    ensureFinances(state);
    saveState(state);

    // Normalize legacy matches ASAP (non-fatal)
    try { normalizeAllMatches(); } catch (e) { console.warn('Normalization on boot failed:', e); }

    // If Booking just saved a payload, simulate, persist, re-normalize, then show latest
    const TMP_KEY = nsKey("booking_payload");
    const payloadStr = localStorage.getItem(TMP_KEY);
    if (payloadStr) localStorage.removeItem(TMP_KEY);
    if (payloadStr) {
      localStorage.removeItem("wwf_booking_payload");

      const payload = JSON.parse(payloadStr);
      const brand = payload.brand;
      const opp   = brand === "RAW" ? "SmackDown" : "RAW";

      // 1) Take baseline once for this week BEFORE both shows
      try { snapshotWeekBaselineOnce(state); } catch(e){ console.warn('snapshotWeekBaselineOnce failed', e); }

      // 2) Run shows
      const myRes = runShow(state, brand, payload.booking);
      if (myRes?.error) {
        root.appendChild(el('div',{class:'card'}, el('div',{text: String(myRes.error)})));
        return;
      }
      const aiRes = runShow(state, opp, aiBooking(state, opp));

      if (!myRes?.error) recordWeeklyFinance(state, myRes);
      if (!aiRes?.error) recordWeeklyFinance(state, aiRes);

      // 3) Persist indices + history
      state.lastWeekKeys[brand] = myRes.matchKeys || [];
      state.lastWeekKeys[opp]   = aiRes.matchKeys || [];
      state.history.push({ week: state.week, myBrand: brand, myShow: myRes, oppBrand: opp, oppShow: aiRes });

      // 4) Advance exactly once, process contracts, then SAVE
      advanceSimWeek(state, 1);
      weeklyContractTick(state);
      saveState(state);

      // 5) Reload the just-saved state to defend against any stale in-memory copy
      state = loadState() || state;
      ensureInitialised(state);
      ensureFinances(state);
      saveState(state);

      // 6) Normalize again post-sim (new matches created this tick), then SAVE again
      try { normalizeAllMatches(); } catch(e){ console.warn('Normalization (post-sim) failed (non-fatal):', e); }
      saveState(state);
    }

    // default to latest entry
    currentIndex = Math.max(0, (state.history?.length || 1) - 1);
    render();
  }catch(err){
    console.error(err);
    window.__showResultsBootError && window.__showResultsBootError("Initialisation failed", err);
  }
}

/* ------------------------------- renderers ------------------------------ */
function render(){
  try{
    root.innerHTML = "";
    if(!state.history || state.history.length === 0){
      const card = el('div',{class:'card'});
      card.appendChild(el('div',{text:'No booking found yet.'}));
      card.appendChild(el('div',{text:'Go to Booking → "Save Booking & Go To Results".'}));
      root.appendChild(card);
      return;
    }

    // Clamp index (safety)
    currentIndex = Math.min(Math.max(0, currentIndex), state.history.length - 1);

    root.appendChild(weekHeader());

    const h = state.history[currentIndex];
    root.appendChild(showCard('Your Show', h.myShow));
    root.appendChild(showCard('AI’s Show', h.oppShow));

    root.appendChild(seasonTable());
    root.appendChild(financeCard(h));
  }catch(err){
    console.error(err);
    window.__showResultsBootError && window.__showResultsBootError("Render failed", err);
  }
}

function weekHeader(){
  const h = state.history[currentIndex];
  const wrap = el('div',{class:'card week-header'});
  wrap.appendChild(el('h3',{text:`Week #${h.week}`}));

  const nav = el('div',{class:'row'});
  const firstBtn = el('button',{class:'btn-min', text:'« First'});
  const prevBtn  = el('button',{class:'btn-min', text:'‹ Prev'});
  const nextBtn  = el('button',{class:'btn-min', text:'Next ›'});
  const lastBtn  = el('button',{class:'btn-min', text:'Last »'});

  const atFirst = currentIndex === 0;
  const atLast  = currentIndex === state.history.length - 1;

  firstBtn.disabled = atFirst; prevBtn.disabled  = atFirst;
  nextBtn.disabled  = atLast;  lastBtn.disabled  = atLast;

  firstBtn.onclick = ()=>{ currentIndex = 0; render(); };
  prevBtn.onclick  = ()=>{ currentIndex = Math.max(0, currentIndex - 1); render(); };
  nextBtn.onclick  = ()=>{ currentIndex = Math.min(state.history.length - 1, currentIndex + 1); render(); };
  lastBtn.onclick  = ()=>{ currentIndex = state.history.length - 1; render(); };

  const pos = el('span',{class:'pill', text:`${currentIndex+1}/${state.history.length}`});
  nav.append(firstBtn, el('span',{text:' '}), prevBtn, el('span',{text:' '}), pos, el('span',{text:' '}), nextBtn, el('span',{text:' '}), lastBtn);

  const brands = el('div',{});
  brands.append(pill(h.myShow?.brand || '—'), el('span',{text:' vs '}), pill(h.oppShow?.brand || '—'));

  wrap.append(nav, brands);
  return wrap;
}

function showCard(title, res){
  const c = el('div',{class:'card'});
  if(res?.error){
    c.append(el('h3',{text:`${title} — ${res.brand||'AI'} — Error`}), el('div',{class:'pill warn', text:String(res.error)}));
    return c;
  }

  c.appendChild(el('h3',{text:`${title} — ${res?.brand ?? 'N/A'} — TV ${res?.tvRating ?? '-'}/10`}));
  if (res?.fanReact) c.appendChild(el('div',{class:'pill', text:res.fanReact}));
  c.appendChild(el('div',{class:'pill warn', text:`Champion aura penalty: -${res?.champPenaltyInfo?.totalPenalty || 0}`}));

  const ol = document.createElement('ol');

  (res?.segments || []).forEach(s=>{
    const li = document.createElement('li'); li.className = 'segbox';

    // header row
    const head = el('div',{class:'segline'});
    head.appendChild(el('strong',{text:`${s.seg}: `}));

    // colored score pill
    if (typeof s.score === 'number') {
      head.appendChild(el('span',{class:`pill ${scoreClass(s.score)}`, text:String(s.score)}));
    }

    // tags
    if (s.tags?.length){
      head.appendChild(el('span',{text:' '}));
      s.tags.forEach(t => head.appendChild(el('span',{class:'pill warn', text:t})));
    }

    // details button -> open external modal
    if (MATCH_TYPES.has(s.type) && s.id){
      const btn = el('button',{class:'btn-min', text:'View details'});
      btn.onclick = ()=> openMatchModal(state, s.id);
      head.appendChild(btn);
    }

    li.appendChild(head);

    // names for chips: prefer canonical matches
    if ((!s.names || !s.names.length) && s.id && state.matches?.[s.id]?.names?.length){
      s.names = [...state.matches[s.id].names];
    }

    if (MATCH_TYPES.has(s.type) && s.names?.length){
      const chips = el('div',{class:'chips'});
      s.names.forEach(n => chips.appendChild(nameChip(n)));
      li.appendChild(chips);
    }

    // summary / text
    if (s.summary) li.appendChild(el('div', { class:`segsummary ${typeof s.score==='number' ? scoreClass(s.score).split(' ')[1] : 'blue'}`, text:s.summary }));
    if (s.summary && s.text){ const hr = document.createElement('hr'); hr.className = 'segdivider'; li.appendChild(hr); }
    if (s.text) li.appendChild(el('div',{class:'segtext', text:s.text}));

    if (MATCH_TYPES.has(s.type)) {
      const heat = s.explain?.storyHeat || null;
      const hasDelta = Number.isFinite(heat?.delta) ? heat.delta !== 0 : false;
      const hasMorale = heat?.morale && Object.keys(heat.morale).some(k => Number.isFinite(heat.morale[k]) && heat.morale[k] !== 0);
      const hasRivalry = heat?.rivalry && Object.keys(heat.rivalry).some(k => Number.isFinite(heat.rivalry[k]) && heat.rivalry[k] !== 0);
      if (heat && (hasDelta || hasMorale || hasRivalry)) {
        const box = el('div',{class:'segstory'});
        const before = Number.isFinite(heat.before) ? Math.round(heat.before) : 0;
        const after = Number.isFinite(heat.after) ? Math.round(heat.after) : before;
        const tier = Number.isFinite(heat.tier) ? heat.tier : Math.max(0, Math.round((after || 0) / 12));
        const tierDelta = Number.isFinite(heat.tierDelta) ? heat.tierDelta : Math.max(0, Math.round((after || 0) / 12)) - Math.max(0, Math.round((before || 0) / 12));
        const header = el('div',{class:'segstory-header'});
        header.appendChild(el('span',{text:`Story heat ${before} → ${after} (${signed(Number.isFinite(heat.delta) ? heat.delta : 0)})`}));
        let tierText = `Tier ${tier}`;
        if (tierDelta > 0) tierText += ` (↑${tierDelta})`;
        else if (tierDelta < 0) tierText += ` (↓${Math.abs(tierDelta)})`;
        const tierCls = tierDelta > 0 ? 'green' : tierDelta < 0 ? 'red' : 'blue';
        header.appendChild(pill(tierText, tierCls));
        box.appendChild(header);

        const moraleEntries = Object.entries(heat.morale || {}).filter(([,v]) => Number.isFinite(v) && v !== 0);
        if (moraleEntries.length){
          box.appendChild(el('div',{class:'segstory-sub', text:'Morale'}));
          const ul = document.createElement('ul');
          moraleEntries.forEach(([name, delta]) => {
            const now = currentMorale(name);
            const text = now != null ? `${name}: ${signed(delta)} (now ${now})` : `${name}: ${signed(delta)}`;
            ul.appendChild(el('li',{text}));
          });
          box.appendChild(ul);
        }

        const rivalryEntries = Object.entries(heat.rivalry || {}).filter(([,v]) => Number.isFinite(v) && v !== 0);
        if (rivalryEntries.length){
          box.appendChild(el('div',{class:'segstory-sub', text:'Rivalry'}));
          const ul = document.createElement('ul');
          rivalryEntries.forEach(([pair, delta]) => {
            ul.appendChild(el('li',{text:`${pair}: ${signed(delta)}`}));
          });
          box.appendChild(ul);
        }

        li.appendChild(box);
      }
    }

    ol.appendChild(li);
  });

  c.appendChild(ol);

  if(res.injuries && res.injuries.length){
    const box = el('div',{class:'card'});
    box.appendChild(el('h4',{text:'Injuries this week'}));
    const ul=document.createElement('ul');
    res.injuries.forEach(i=> ul.appendChild(el('li',{text:`${i.name} — out ${i.weeks} weeks`})));
    box.appendChild(ul);
    c.appendChild(box);
  }
  return c;
}

function seasonTable(){
  const c = el('div',{class:'card'});
  c.appendChild(el('h3',{text:'Season Overview'}));
  const t = document.createElement('table');
  t.appendChild(row(true, "Week", "Your TV", "AI TV"));
  (state.history||[]).forEach(h=>{
    t.appendChild(row(false, `${h.week}`, `${h.myShow?.tvRating ?? "-"}/10`, `${h.oppShow?.tvRating ?? "-"}/10`));
  });
  c.appendChild(t);
  return c;
}

function financeCard(historyEntry){
  const brand = historyEntry?.myShow?.brand || state.brand || 'RAW';
  ensureFinances(state);
  const totals = financeTotals(state, brand) || { cash:0, revenue:0, expenses:0, adjustments:0, net:0 };

  const card = el('div',{class:'card'});
  card.appendChild(el('h3',{text:`Financials — ${brand}`}));

  card.appendChild(el('div',{class:'segsummary blue', text:`Cash on hand: ${formatMoney(totals.cash)}`}));

  const season = document.createElement('table');
  season.appendChild(row(true, 'Season', 'Revenue', 'Expenses', 'Adjustments', 'Net'));
  season.appendChild(row(false, 'Totals',
    formatMoney(totals.revenue || 0),
    formatMoney(totals.expenses || 0),
    formatMoney(totals.adjustments || 0),
    formatMoney(totals.net || 0)
  ));
  card.appendChild(season);

  const report = financeReportForWeek(state, brand, historyEntry?.week);
  if (report){
    const breakdown = el('div',{class:'card'});
    breakdown.appendChild(el('h4',{text:`Week ${report.week} Breakdown`}));

    const revTitle = el('strong',{text:'Revenue'});
    const revList = document.createElement('ul');
    Object.entries(report.revenue || {}).forEach(([k,v]) => {
      revList.appendChild(el('li',{text:`${k}: ${formatMoney(v)}`}));
    });

    const expTitle = el('strong',{text:'Expenses'});
    const expList = document.createElement('ul');
    Object.entries(report.expenses || {}).forEach(([k,v]) => {
      expList.appendChild(el('li',{text:`${k}: ${formatMoney(v)}`}));
    });

    breakdown.append(revTitle, revList, expTitle, expList);

    if (report.adjustments && report.adjustments.length){
      const adjTitle = el('strong',{text:'Adjustments'});
      const adjList = document.createElement('ul');
      report.adjustments.forEach(adj => {
        const label = adj.reason || 'Adjustment';
        adjList.appendChild(el('li',{text:`${label}: ${formatMoney(adj.amount)}`}));
      });
      breakdown.append(adjTitle, adjList);
    }

    breakdown.appendChild(el('div',{class:'pf-info-line', text:`Net for week: ${formatMoney(report.net)}`}));
    card.appendChild(breakdown);
  } else {
    card.appendChild(el('div',{class:'sub', text:'No financial data recorded for this week yet.'}));
  }

  return card;
}
function row(hdr, ...cells){
  const tr = document.createElement('tr');
  cells.forEach(txt=>{
    const td = document.createElement(hdr ? 'th' : 'td'); td.textContent = txt; tr.appendChild(td);
  });
  return tr;
}

