// public/js/roster.js
// Unified, minimal roster view + search.

import { RAW, SD, FA, el, brandLabel, clamp } from './util.js';
import { bootReadOnly, bootOrNull, headshotImg } from './engine.js';

const root = document.getElementById('roster-root') || (() => {
  const m = document.createElement('main');
  m.id = 'roster-root';
  document.body.appendChild(m);
  return m;
})();

(function injectStyles(){
  const s = document.createElement('style');
  s.textContent = `
  .ro-wrap{ display:grid; gap:16px; }
  .ro-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .ro-search{ min-width:260px; }
  .ro-list{ display:grid; gap:8px; }
  .ro-row{ display:grid; grid-template-columns: 56px 1fr auto auto; align-items:center; gap:12px;
           padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.03);
           box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; cursor:pointer; }
  .ro-name{ font-weight:600; }
  .pill.brand{ padding:4px 10px; border-radius:999px; font-size:12px; border:1px solid rgba(255,255,255,.18); }
  .pill.raw{ background: rgba(80,140,255,.16); border-color: rgba(80,140,255,.38); }
  .pill.sd{  background: rgba(150,120,255,.16); border-color: rgba(150,120,255,.38); }
  .pill.fa{  background: rgba(180,180,180,.12); border-color: rgba(180,180,180,.30); }
  .ro-ov{ font-weight:800; font-size:18px; color:rgba(140,160,255,.95) }
  .ro-img{ width:48px; height:48px; border-radius:10px; overflow:hidden; box-shadow:0 0 0 1px rgba(255,255,255,.1) inset; }
  .ro-img > img{ width:48px; height:48px; object-fit:cover; display:block; }
  .ro-link{ color:inherit; text-decoration:none; }
  .ro-empty{ opacity:.75; padding:12px; border-radius:12px; background:rgba(255,255,255,.03);
             box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; }
  `;
  document.head.appendChild(s);
})();

function calcOverall(w){
  const promoLike = ((w.charisma ?? w.promo ?? 60) + (w.mic ?? w.promo ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons  = w.consistency ?? 60;
  const o = Math.round(
    (w.workrate ?? 60)*0.30 + (w.starpower ?? 60)*0.25 +
    promoLike*0.15 + (w.momentum ?? 60)*0.10 + psych*0.10 + cons*0.10
  );
  return clamp(o, 1, 99);
}

function brandPill(brand){
  const cls = (brand===RAW) ? 'raw' : (brand===SD) ? 'sd' : 'fa';
  const t = brandLabel(brand);
  return el('span', { class:`pill brand ${cls}`, text:t });
}

// Use pretty URL always; server serves /profile for the profile page
const PROFILE_PATH = '/profile';

function rowFor(w){
  const r = el('div', { class:'ro-row' });

  const href = `${PROFILE_PATH}?name=${encodeURIComponent(w.name)}`;

  const pic = el('div',{class:'ro-img'});
  pic.appendChild(headshotImg(w.name, { width:48, height:48 }));
  r.appendChild(pic);

  const name = el('a', { class:'ro-name ro-link', text:w.name, href });
  r.appendChild(name);

  r.appendChild(brandPill(w.brand));
  r.appendChild(el('div', { class:'ro-ov', text:String(calcOverall(w)) }));

  r.addEventListener('click', (e)=>{
    if (!(e.target instanceof HTMLAnchorElement)) window.location.href = href;
  });

  return r;
}

/* ------------------------------------------------------------------ */
/* Render with stable state (no destructive boot loop)                */
/* ------------------------------------------------------------------ */

let __lastRosterSig = '';
let __rerenderQueued = false;

function rosterSig(roster){
  const arr = Array.isArray(roster) ? roster : [];
  // stable signature: count + first/last names (cheap, avoids O(n) hashing)
  const names = arr.map(w => w?.name).filter(Boolean).sort();
  const first = names[0] || '';
  const last  = names[names.length-1] || '';
  return `${names.length}::${first}::${last}`;
}

function getStateReadOnly(){
  // Prefer an existing save if present, otherwise still allow bootReadOnly to create defaults
  // (bootReadOnly uses save:false in engine.js)
  return bootReadOnly();
}

function renderFrom(state){
  root.innerHTML = '';
  const wrap = el('div',{class:'ro-wrap'});

  const head = el('div',{class:'ro-head'});
  head.appendChild(el('h3',{text:'Roster'}));
  const search = el('input',{class:'ro-search', type:'search', placeholder:'Search roster…'});
  head.appendChild(search);
  wrap.appendChild(head);

  const list = el('div',{class:'ro-list'});

  const roster = Array.isArray(state?.roster) ? state.roster : [];
  const all = [...roster].sort((a,b)=>a.name.localeCompare(b.name));
  let current = all;

  function refresh(){
    list.innerHTML = '';
    if (!current.length){
      list.appendChild(el('div', {
        class:'ro-empty',
        text: 'No roster loaded yet. If this is right after page load, give it a second — hydration may still be running.'
      }));
      return;
    }
    current.forEach(w => list.appendChild(rowFor(w)));
  }

  refresh();

  search.addEventListener('input', ()=>{
    const q = search.value.trim().toLowerCase();
    current = !q ? all : all.filter(w => w.name.toLowerCase().includes(q));
    refresh();
  });

  wrap.appendChild(list);
  root.appendChild(wrap);
}

function rerenderSoon(){
  if (__rerenderQueued) return;
  __rerenderQueued = true;
  setTimeout(()=>{
    __rerenderQueued = false;
    try {
      const state = getStateReadOnly();
      const sig = rosterSig(state?.roster);
      // ✅ Do not rerender if nothing materially changed (prevents event loops)
      if (sig === __lastRosterSig) return;
      __lastRosterSig = sig;
      renderFrom(state);
    } catch (e) {
      console.error(e);
    }
  }, 30);
}

// initial render
try {
  const state = getStateReadOnly();
  __lastRosterSig = rosterSig(state?.roster);
  renderFrom(state);
} catch(e){
  console.error(e);
}

// ✅ When the DB/API roster arrives, re-render this page (but only if it changed)
try {
  window.addEventListener('wwf:roster-updated', () => rerenderSoon());
  window.addEventListener('wwf:state-initialised', () => rerenderSoon());
} catch {}
