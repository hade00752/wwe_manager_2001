// public/js/results.js
import { RAW, SD, el } from './util.js';
import {
  loadState, saveState, ensureInitialised,
  runShow, aiBooking, headshotImg, advanceSimWeek
} from './engine.js';
import { normalizeAllMatches } from './details_normalize.js';
import { snapshotWeekBaselineOnce } from './engine/attr_ledger.js';
import { openMatchModal } from './match.js';

const root = document.getElementById('results-root') || (() => {
  const m = document.createElement('main'); m.id = 'results-root'; document.body.appendChild(m); return m;
})();

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
  .btn-min{ padding:4px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); cursor:pointer }
  .chips{ display:flex; gap:8px; flex-wrap:wrap; margin:2px 0 6px }
  .chip{ display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); }
  .chip.win{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
  .chip img{ width:22px; height:22px; border-radius:999px; object-fit:cover }
  .chip .nm{ font-size:12px; opacity:.95 }
  .row-between{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .card{ padding:12px; border-radius:12px; background:rgba(255,255,255,.02); box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; margin:8px 0 }
  `;
  document.head.appendChild(s);
})();

/* -------------------------------- utils -------------------------------- */
const MATCH_TYPES = new Set(['singles','tag','Match']);
const scoreClass = (n) => (n>=90?'score blue': n>=75?'score green': n>=60?'score yellow':'score red');

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

// equality for arrays of names (order-insensitive)
function setEq(a, b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const A = [...a].map(String).sort().join('::');
  const B = [...b].map(String).sort().join('::');
  return A === B;
}

// Try to find a persisted match record for a segment even if seg.id is missing.
function resolveMatchRecord(state, seg, ctx){
  const store = state.matches || {};
  const segNames = Array.isArray(seg.names) ? seg.names.slice().sort() : [];

  // exact: date+brand+segment+names
  let hit = Object.values(store).find(m =>
    m && m.date === ctx.date &&
    m.brand === ctx.brand &&
    (m.segment === seg.seg || m.seg === seg.seg) &&
    setEq(m.names || [], segNames)
  );
  if (hit) return hit;

  // relaxed: date+brand+names
  hit = Object.values(store).find(m =>
    m && m.date === ctx.date &&
    m.brand === ctx.brand &&
    setEq(m.names || [], segNames)
  );
  if (hit) return hit;

  // weakest: latest record with same names
  return Object.values(store)
    .filter(m => m && setEq(m.names || [], segNames))
    .sort((a,b)=> (b.week||0) - (a.week||0))[0] || null;
}

// backfill segment ids/names for a show's record (saves if anything found)
function backfillIdsForShow(state, showRec, brand, week, date){
  let changed = false;
  if (!showRec || !Array.isArray(showRec.segments)) return false;

  const meta = { week, date, brand };

  showRec.segments.forEach(seg => {
    if (!seg || seg.type === 'promo') return;
    if (seg.id && state.matches?.[seg.id]) return;

    const rec = resolveMatchRecord(state, seg, meta);
    if (rec?.id) {
      seg.id = rec.id;
      if (!Array.isArray(seg.names) || seg.names.length === 0) {
        seg.names = (rec.names || []).slice();
      }
      changed = true;
    }
  });

  return changed;
}

/* -------------------------------- boot --------------------------------- */
let state = loadState() || {};
state.viewWeek = Number.isInteger(state.viewWeek) ? state.viewWeek : -1; // -1 = latest

init();

function init(){
  try{
    state = loadState() || {};
    if(!state){
      root.appendChild(el('div',{class:'card'}, el('div',{text:'No season found. Start a new season from Booking.'})));
      return;
    }

    ensureInitialised(state);

    // prune any legacy rows that don't have segments arrays (defensive)
    (function migrateMatchHistory(){
      try{
        const mh = state.matchHistory || {};
        for (const b of [RAW, SD]) {
          if (Array.isArray(mh[b])) {
            mh[b] = mh[b].filter(x => x && Array.isArray(x.segments));
          }
        }
        state.matchHistory = mh;
        saveState(state);
      }catch(e){ console.warn('matchHistory migration skipped', e); }
    })();

    // 🔁 DO NOT normalize on every visit; it can drop details.attrEffects.
    // We'll either do a one-time migration for old saves, or normalize
    // only right after we simulate a new week.

    // If Booking saved a payload, simulate *both* shows and persist
    const payloadStr = localStorage.getItem("wwf_booking_payload");
    if (payloadStr) {
      localStorage.removeItem("wwf_booking_payload");

      const payload = JSON.parse(payloadStr);
      const brand = payload.brand;
      const opp   = brand === RAW ? SD : RAW;

      // capture week/date BEFORE running shows
      const week0 = state.week;
      const date0 = state.startDate;

      try { snapshotWeekBaselineOnce(state); } catch(e){ console.warn('snapshotWeekBaselineOnce failed', e); }

      const myRes = runShow(state, brand, payload.booking);
      const aiRes = runShow(state, opp, aiBooking(state, opp));

      // only normalize right after creating/updating matches
      try { normalizeAllMatches(); } catch (e) { console.warn('Normalization (post-sim) failed:', e); }

      state.history = Array.isArray(state.history) ? state.history : [];
      state.history.push({
        week: week0,
        date: date0,
        myBrand: brand, myShow: myRes,
        oppBrand: opp,  oppShow: aiRes
      });

      // advance the sim clock to NEXT week
      advanceSimWeek(state, 1);

      saveState(state);
    } else if (!state.__normalizedOnce) {
      // one-time migration for very old saves
      try { normalizeAllMatches(); } catch (e) { console.warn('Normalization (one-time) failed:', e); }
      state.__normalizedOnce = true;
      saveState(state);
    }

    render();
  }catch(err){
    console.error(err);
    window.__showResultsBootError && window.__showResultsBootError("Initialisation failed", err);
  }
}

/* ------------------------------- renderers ------------------------------ */
function render(){
  state = loadState() || state;
  root.innerHTML = '';

  const season = Array.isArray(state.history) ? state.history : [];

  // fallback path (older saves): build pseudo-season from matchHistory
  const fallbackIfNeeded = () => {
    const mh = state.matchHistory || {};
    const raws = Array.isArray(mh[RAW]) ? mh[RAW] : [];
    const sds  = Array.isArray(mh[SD])  ? mh[SD]  : [];
    const n = Math.max(raws.length, sds.length);
    const out = [];
    for (let i=0; i<n; i++){
      out.push({
        week: (state.week - (n - i)) || i+1,
        date: state.startDate,
        myBrand: RAW, myShow: raws[i] || null,
        oppBrand: SD,  oppShow:  sds[i] || null
      });
    }
    return out;
  };

  const weeks = season.length ? season : fallbackIfNeeded();
  const lastIdx = Math.max(0, weeks.length - 1);

  if (!Number.isInteger(state.viewWeek) || state.viewWeek < 0 || state.viewWeek > lastIdx) {
    state.viewWeek = lastIdx; // show latest by default
  }

  // pager
  const pager = el('div', { class: 'row-between card' });
  const firstBtn = el('button', { class: 'btn-min', text: '« First' });
  const prevBtn  = el('button', { class: 'btn-min', text: '‹ Prev' });
  const info     = el('span', { class: 'pill', text:
    weeks.length ? `Week ${weeks[state.viewWeek].week} — ${weeks[state.viewWeek].date}` : 'No shows yet'
  });
  const nextBtn  = el('button', { class: 'btn-min', text: 'Next ›' });
  const lastBtn  = el('button', { class: 'btn-min', text: 'Last »' });

  const atFirst = state.viewWeek <= 0;
  const atLast  = state.viewWeek >= lastIdx;
  firstBtn.disabled = atFirst; prevBtn.disabled = atFirst;
  nextBtn.disabled = atLast;   lastBtn.disabled = atLast;

  firstBtn.onclick = () => { state.viewWeek = 0; saveState(state); render(); };
  prevBtn.onclick  = () => { state.viewWeek = Math.max(0, state.viewWeek - 1); saveState(state); render(); };
  nextBtn.onclick  = () => { state.viewWeek = Math.min(lastIdx, state.viewWeek + 1); saveState(state); render(); };
  lastBtn.onclick  = () => { state.viewWeek = lastIdx; saveState(state); render(); };

  pager.append(firstBtn, prevBtn, info, nextBtn, lastBtn);
  root.appendChild(pager);

  if (!weeks.length) return;

  const rec = weeks[state.viewWeek];

  if (rec.myShow) {
    if (backfillIdsForShow(state, rec.myShow, rec.myBrand, rec.week, rec.date)) saveState(state);
    root.appendChild(renderShowCard(rec.myShow, rec.myBrand, rec.week, rec.date));
  }
  if (rec.oppShow) {
    if (backfillIdsForShow(state, rec.oppShow, rec.oppBrand, rec.week, rec.date)) saveState(state);
    root.appendChild(renderShowCard(rec.oppShow, rec.oppBrand, rec.week, rec.date));
  }
}

function renderShowCard(showRec, brandLabel, week, date){
  const c = el('div',{class:'card'});
  const tv = (typeof showRec?.tvRating === 'number' && showRec.tvRating > 0) ? showRec.tvRating : '-';
  c.appendChild(el('h3',{text:`${brandLabel || 'Show'} — TV ${tv}/10`}));

  const ol = document.createElement('ol');
  (showRec?.segments || []).forEach(s => {
    const li = document.createElement('li');
    li.className = 'segbox';

    // header row
    const head = el('div',{class:'segline'});
    head.appendChild(el('strong',{text:`${s.seg}: `}));

    if (typeof s.score === 'number') {
      head.appendChild(el('span',{class:`pill ${scoreClass(s.score)}`, text:String(s.score)}));
    }
    if (Array.isArray(s.tags) && s.tags.length){
      head.appendChild(el('span',{text:' '}));
      s.tags.forEach(t => head.appendChild(el('span',{class:'pill warn', text:t})));
    }

    if (MATCH_TYPES.has(s.type)) {
      const btn = el('button', { class: 'btn-min', text: 'VIEW DETAILS' });
      btn.onclick = () => {
        let rec = null;

        // A) direct by id (fast path)
        if (s.id && state.matches?.[s.id]) {
          rec = state.matches[s.id];
        }

        // B) segIndex path uses week (if segIndex is maintained in your build)
        if (!rec) {
          const key = `${brandLabel}|${week}|${s.seg}`;
          const byIdx = state.segIndex?.[key];
          if (byIdx && state.matches?.[byIdx]) {
            rec = state.matches[byIdx];
            if (!s.id) { s.id = byIdx; saveState(state); }
          }
        }

        // C) resolver with correct meta (date/brand/week)
        if (!rec) {
          rec = resolveMatchRecord(state, s, { brand: brandLabel, week, date });
          if (rec?.id && !s.id) { s.id = rec.id; saveState(state); }
        }

        // D) last resort — ad-hoc placeholder
        if (!rec) {
          rec = {
            id: s.id || 'ad-hoc',
            brand: brandLabel,
            segment: s.seg,
            names: Array.isArray(s.names) ? s.names.slice() : [],
            rating: (typeof s.score === 'number') ? s.score : 0,
            text: s.text || '',
            tags: Array.isArray(s.tags) ? s.tags.slice() : [],
            details: { note: 'Ad-hoc record (persisted match not found)' },
            week: week ?? state?.week,
            date: date ?? state?.startDate
          };
          state.matches = state.matches || {};
          state.matches[rec.id] = rec;
          saveState(state);
        }

        // KEY: match.js expects (stateIn, matchId)
        openMatchModal(state, rec.id);
      };
      head.appendChild(btn);
    }

    li.appendChild(head);

    // names chips (prefer persisted record if segment had no names)
    let names = s.names;
    if ((!names || !names.length) && s.id && state.matches?.[s.id]?.names?.length){
      names = state.matches[s.id].names;
    }
    if (MATCH_TYPES.has(s.type) && Array.isArray(names) && names.length){
      const chips = el('div',{class:'chips'});
      names.forEach(n => chips.appendChild(nameChip(n)));
      li.appendChild(chips);
    }

    // summary / text
    if (s.summary) {
      const cls = (typeof s.score==='number' ? scoreClass(s.score).split(' ')[1] : 'blue');
      li.appendChild(el('div', { class:`segsummary ${cls}`, text:s.summary }));
    }
    if (s.summary && s.text){
      const hr = document.createElement('hr');
      hr.className = 'segdivider';
      li.appendChild(hr);
    }
    if (s.text) li.appendChild(el('div',{class:'segtext', text:s.text}));

    ol.appendChild(li);
  });

  c.appendChild(ol);
  return c;
}

// (optional) season table – not used by default
function seasonTable(weeks){
  const c = el('div',{class:'card'});
  c.appendChild(el('h3',{text:'Season Overview'}));
  const t = document.createElement('table');
  const row = (hdr, ...cells)=>{
    const tr = document.createElement('tr');
    cells.forEach(txt => {
      const td = document.createElement(hdr ? 'th' : 'td');
      td.textContent = txt; tr.appendChild(td);
    });
    return tr;
  };
  t.appendChild(row(true, "Week", "Brand A TV", "Brand B TV"));
  weeks.forEach(w=>{
    t.appendChild(row(false,
      `${w.week}`,
      w.myShow ? `${w.myBrand} ${w.myShow.tvRating}/10` : '—',
      w.oppShow ? `${w.oppBrand} ${w.oppShow.tvRating}/10` : '—'
    ));
  });
  c.appendChild(t);
  return c;
}

