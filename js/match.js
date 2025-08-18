// public/js/match.js
import { loadState, ensureInitialised, headshotImg, saveState } from "./engine.js?v=1755554537";
import { el } from "./util.js?v=1755554537";

/* ---------------- small helpers ---------------- */
const q = (k) => new URLSearchParams(location.search).get(k);

const labelFor = (k) =>
  k === 'starpower'   ? 'Star Power' :
  k === 'reputation'  ? 'Reputation' :
  k === 'consistency' ? 'Consistency' :
  k === 'momentum'    ? 'Momentum'   : k;

function nameChip(n, cls=''){
  const c = el('span',{class:`chip ${cls}`.trim()});
  const img = headshotImg(n, { width:22, height:22, exts:['webp','png','jpg','jpeg'], alt:n });
  img.onerror = () => { img.replaceWith(el('span',{class:'pill',text:n.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()})); };
  c.appendChild(img);
  c.appendChild(el('span',{text:n}));
  return c;
}
const line = (k,v) => el('div',{class:'kv'}, el('div',{class:'k',text:k}), el('div',{class:'v',text:v}));

function parseWinnersFromText(txt){
  if (!txt) return [];
  const m = txt.match(/^\s*([^\.]+?)\s+defeat(?:s|ed)?\s+([^\.]+?)\s*(?:\.|\(|$)/i);
  if (!m) return [];
  return m[1].split('&').map(s=>s.trim()).filter(Boolean);
}
const avg = (a)=> a.length ? a.reduce((x,y)=>x+y,0) / a.length : 0;
const rosterMap = (state)=>{ const m=new Map(); (state.roster||[]).forEach(w=>m.set(w.name,w)); return m; };

// legacy snapshot loader (used in profile.js too)
function loadPrevSnapshotLegacy(name){
  try { return JSON.parse(localStorage.getItem(`wwf_attr_snap_v1::${name}`) || 'null'); } catch { return null; }
}

/* ---------------- styles (overlay) ---------------- */
(function css(){
  if (document.getElementById('match-modal-styles')) return;
  const s=document.createElement('style');
  s.id = 'match-modal-styles';
  s.textContent = `
    body{font-family: ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;color:#eef;background:#0c0e12}
    .modal-back{ position:fixed; inset:0; background:rgba(0,0,0,.55); display:grid; place-items:center; z-index:9999 }
    .modal{ width:min(940px, 92vw); max-height:88vh; overflow:auto; background:#15181e; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.4); padding:16px }
    .md-card{padding:12px;border-radius:12px;background:rgba(255,255,255,.02);
             box-shadow:0 0 0 1px rgba(255,255,255,.08) inset;margin:12px 0}
    .kv{display:grid;grid-template-columns:180px 1fr;gap:8px;margin:6px 0}
    .pill{display:inline-block;padding:3px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.15);margin:0 6px 6px 0}
    .pill.win{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
    .mono{font-variant-numeric: tabular-nums}
    .chips{display:flex; gap:8px; flex-wrap:wrap; margin:6px 0}
    .chip{display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px;
          border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06);}
    .chip.win{ background: rgba(0,210,140,.14); border-color: rgba(0,210,140,.35); }
    .chip img{ width:22px; height:22px; border-radius:999px; object-fit:cover }
    .foot{opacity:.65;font-size:12px;margin-top:6px}
    .row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap }
    .kv .k{ color:rgba(255,255,255,.70) }
    .kv .v{ text-align:right; font-weight:700 }
    .hdr{ font-weight:700; margin:0 0 6px 0 }
    .list{ margin:6px 0 0 16px }
    .btn-min{ padding:4px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); cursor:pointer }
  `;
  document.head.appendChild(s);
})();

/* ---------------- overlay factory ---------------- */
function showModal(content){
  const back = el('div',{class:'modal-back'});
  const box  = el('div',{class:'modal'});
  const close = el('button',{class:'btn-min', text:'CLOSE'});
  close.style.float='right';
  close.onclick = ()=> back.remove(); // NEVER navigate
  box.appendChild(close);
  box.appendChild(content);
  back.appendChild(box);
  back.addEventListener('click', e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
}

/* ---------------- backfill helpers ---------------- */
function backfillNames(state, rec){
  if (rec?.names?.length) return;

  // 1) search history (your show + AI show) by segment id
  outer: for (const h of (state.history || [])) {
    for (const show of [h.myShow, h.oppShow]) {
      const seg = (show?.segments || []).find(s => s.id === rec.id);
      if (seg?.names?.length) { rec.names = [...seg.names]; break outer; }
    }
  }

  // 2) search matchHistory by brand/week
  if ((!rec.names || !rec.names.length) && rec.brand && rec.week != null) {
    const wk = (state.matchHistory?.[rec.brand] || []).find(x => x.week === rec.week);
    const seg = wk?.segments?.find(x => x.id === rec.id);
    if (seg?.names?.length) rec.names = [...seg.names];
  }
}

function backfillSideScoresAndProb(state, rec, det){
  if (Number.isFinite(det.aSideScore) && Number.isFinite(det.bSideScore) && det.probA != null) return;

  const rmap = rosterMap(state);
  const scoreOf = (arr)=> {
    const side = arr.map(n=>rmap.get(n)).filter(Boolean);
    if (!side.length) return 0;
    const like = avg(side.map(w => w.likeability ?? 60));
    const wrk  = avg(side.map(w => w.workrate   ?? 60));
    const star = avg(side.map(w => w.starpower   ?? 60));
    const mom  = avg(side.map(w => w.momentum    ?? 60));
    const psy  = avg(side.map(w => w.psychology  ?? 70));
    const hf   = (side.some(w=>w.alignment==='heel') && side.some(w=>w.alignment==='face')) ? 1 : 0;
    return Math.round(wrk*0.38 + star*0.22 + mom*0.12 + psy*0.16 + like*0.08 + hf);
  };

  const names = rec.names || [];
  if ((rec.type||det.type)==='tag' && names.length>=4){
    det.aSideScore = scoreOf([names[0], names[1]]);
    det.bSideScore = scoreOf([names[2], names[3]]);
  } else if (names.length>=2){
    det.aSideScore = scoreOf([names[0]]);
    det.bSideScore = scoreOf([names[1]]);
  }

  if (Number.isFinite(det.aSideScore) && Number.isFinite(det.bSideScore)){
    det.probA = 1 / (1 + Math.pow(10, (det.bSideScore - det.aSideScore) / 28));
  }
}

/* ---------------- baseline helpers ---------------- */
function attachOrFindBaseline(state, rec){
  // prefer per-match baseline (persisted once discovered)
  rec.baseline = rec.baseline || {};

  const wkBase = (state.snapshots && state.snapshots.weekBaseline) || {};
  let foundAny = false;

  (rec.names||[]).forEach(n => {
    if (rec.baseline[n]) return;

    // 1) current week's baseline snapshot
    const wk = wkBase[n]?.values || null;
    if (wk) { rec.baseline[n] = { values: wk }; foundAny = true; return; }

    // 2) legacy per-wrestler snapshot
    const legacy = loadPrevSnapshotLegacy(n);
    if (legacy && legacy.values) { rec.baseline[n] = { values: legacy.values }; foundAny = true; }
  });

  if (foundAny) {
    // Persist so future opens do not depend on volatile weekBaseline
    const stateMatches = state.matches || (state.matches = {});
    stateMatches[rec.id] = Object.assign({}, stateMatches[rec.id] || {}, rec);
    saveState(state);
  }
}

/* ---------------- main renderer (exportable) ---------------- */
export function openMatchModal(stateIn, matchId){
  const state = stateIn || (ensureInitialised(loadState() || {}), loadState());
  ensureInitialised(state);

  const rec = (state.matches && state.matches[matchId]) || null;
  if (!rec) {
    showModal(el('div',{}, el('div',{text:'Match not found.'})));
    return;
  }

  // ensure names & details
  backfillNames(state, rec);

  const det = rec.details || (rec.details = {});
  if (!Array.isArray(det.winners) || det.winners.length===0){
    const parsed = parseWinnersFromText(rec.text || rec.summary || '');
    if (parsed.length){ det.winners = parsed; }
  }
  backfillSideScoresAndProb(state, rec, det);

  // persist new info learned
  if (!state.matches) state.matches = {};
  state.matches[matchId] = rec;
  saveState(state);

  // ensure baseline available (and store per match once discovered)
  attachOrFindBaseline(state, rec);

  /* ---------- Build modal DOM ---------- */
  const root = document.createElement('div');

  // Header
  const h = el('div',{class:'md-card'});
  const titleText = rec.names?.length
    ? ( (rec.type==='tag' || rec.names.length===4)
        ? `${rec.names[0]} & ${rec.names[1]} vs ${rec.names[2]} & ${rec.names[3]}`
        : (rec.names.length>=2 ? `${rec.names[0]} vs ${rec.names[1]}` : rec.names[0]) )
    : 'Match';
  h.appendChild(el('h3',{text:titleText}));
  h.appendChild(line('Brand', rec.brand || '—'));
  h.appendChild(line('Segment', rec.segment || rec.seg || '—'));
  h.appendChild(line('Week / Date', `${rec.week ?? '—'} / ${rec.date ?? '—'}`));
  h.appendChild(line('Rating', String(rec.rating ?? rec.score ?? '—')));
  if (rec.title) h.appendChild(line('Title', rec.title));
  const tags = (rec.tags||[]);
  if (tags.length){
    const tg = el('div');
    tags.forEach(t=> tg.appendChild(el('span',{class:'pill', text:t})));
    h.appendChild(tg);
  }
  if (rec.names?.length){
    const chips = el('div',{class:'chips'});
    rec.names.forEach(n => chips.appendChild(nameChip(n, (det.winners||[]).includes(n) ? 'win' : '')));
    h.appendChild(chips);
  }
  root.appendChild(h);

  // Scoring factors
  const dbg = rec.debug || {};
  const sc = el('div',{class:'md-card'});
  sc.appendChild(el('div',{class:'hdr', text:'Scoring factors'}));
  const add = (k,v)=> sc.appendChild(line(k, v));
  add('Story bonus', (dbg.storyBonus!=null ? (dbg.storyBonus>=0?`+${dbg.storyBonus}`:`${dbg.storyBonus}`) : '+0'));
  add('Title bump', (dbg.titleBoost ? `+${dbg.titleBoost}` : '—'));
  add('Repeat penalty', (rec.penalties?.repeat ? `-${rec.penalties.repeat}` : '—'));
  add('Segment weight', rec.segment==='MainEvent' ? '×1.3' : '×1');
  if ((rec.tags||[]).includes('hot match')){
    const sub = el('div',{style:{opacity:.8,marginTop:'4px'}, text:'Audience interest boosted this segment'});
    sc.appendChild(sub);
  }
  root.appendChild(sc);

  // Engine Inputs
  const eng = el('div',{class:'md-card'});
  eng.appendChild(el('div',{class:'hdr', text:'Engine Inputs'}));
  eng.appendChild(line('Side strength (A/B)', `${Number.isFinite(det.aSideScore)?det.aSideScore:'—'} / ${Number.isFinite(det.bSideScore)?det.bSideScore:'—'}`));
  eng.appendChild(line('Win probability (A)', (det.probA!=null && isFinite(det.probA)) ? `${Math.round(det.probA*100)}%` : '—'));

  const winRow = el('div',{class:'kv'});
  winRow.appendChild(el('div',{class:'k',text:'Winners'}));
  const winCell = el('div',{class:'v'});
  if ((det.winners||[]).length){
    const wrapChips = el('div',{class:'chips'});
    det.winners.forEach(n => wrapChips.appendChild(nameChip(n,'win')));
    winCell.appendChild(wrapChips);
  } else {
    winCell.textContent = '—';
  }
  winRow.appendChild(winCell);
  eng.appendChild(winRow);

  eng.appendChild(line('Segment fatigue weight', rec.segment==='MainEvent' ? '×1.3' : '×1'));
  root.appendChild(eng);

  // Injuries (if any recorded on the match record)
  const injCard = el('div',{class:'md-card'});
  injCard.appendChild(el('div',{class:'hdr', text:'Injuries'}));
  const injList = document.createElement('ul'); injList.className = 'list';
  const injuries = rec.injuries || [];
  if (injuries.length){
    injuries.forEach(i => injList.appendChild(el('li',{text:`${i.name} — out ${i.weeks} week(s)`})));
  }else{
    injList.appendChild(el('li',{text:'No injuries recorded for this match.'}));
  }
  injCard.appendChild(injList);
  root.appendChild(injCard);

  // Post-match effects
  const eff = el('div',{class:'md-card'});
  eff.appendChild(el('div',{class:'hdr', text:'Post-match effects'}));
  const ul = document.createElement('ul'); ul.className='list';

  const baseMap = rec.baseline || {};
  const deltaKeys = ['momentum','starpower','reputation','consistency'];
  const rmap = rosterMap(state);
  const mdMap = (det.momentumDelta) || (dbg.momentumDelta) || {};

  (rec.names||[]).forEach(n=>{
    const w = rmap.get(n);
    const base = baseMap[n]?.values || null;
    const parts = [];

    // momentum delta (engine recorded)
    if (typeof mdMap[n] === 'number' && mdMap[n] !== 0){
      const d = mdMap[n]; parts.push(`Momentum ${d>0?'+':''}${d}`);
    }

    // attribute deltas vs baseline
    if (base && w){
      deltaKeys.forEach(k=>{
        const a = Number(w[k] ?? 0), b = Number(base[k] ?? a);
        const d = a - b;
        if (d !== 0) parts.push(`${labelFor(k)} ${d>0?'+':''}${d}`);
      });
    }

    ul.appendChild(el('li',{text: parts.length ? `${n}: ${parts.join(' · ')}` : n}));
  });
  eff.appendChild(ul);

  const foot = el('div',{class:'foot',
    text:`Engine view: Side A strength ${Number.isFinite(det.aSideScore)?det.aSideScore:'—'} vs Side B ${Number.isFinite(det.bSideScore)?det.bSideScore:'—'}; A win probability ${det.probA!=null && isFinite(det.probA)?Math.round(det.probA*100)+'%':'—'}. Winners: ${(det.winners||[]).length?(det.winners||[]).join(' & '):'—'}.`});
  eff.appendChild(foot);

  root.appendChild(eff);

  showModal(root);
}

/* -------------- standalone page support (/match?id=...) -------------- */
(function bootStandalone(){
  // If this script is loaded on /match, render modal on top of blank page.
  const id = q('id');
  if (!id) return;
  try{
    const state = loadState(); if(!state) { showModal(el('div',{}, el('div',{text:'No save found.'}))); return; }
    ensureInitialised(state);
    openMatchModal(state, id);
  }catch(e){
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
    pre.style.padding = '12px';
    pre.style.border = '1px solid #444';
    pre.style.borderRadius = '10px';
    pre.textContent = `[Match load error]\n${e?.message || e}`;
    document.body.innerHTML = '';
    document.body.appendChild(pre);
  }
})();

