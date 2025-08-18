// public/js/roster.js
// Unified, minimal roster view + search.

import { RAW, SD, FA, el, clamp } from "./js/util.js";
import { loadState, ensureInitialised, headshotImg } from "./js/engine.js";

const root = document.getElementById('roster-root') || (() => {
  const m = document.createElement('main'); m.id = 'roster-root'; document.body.appendChild(m); return m;
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
  const b = (brand===RAW) ? 'raw' : (brand===SD) ? 'sd' : 'fa';
  const t = (brand===RAW) ? 'RAW' : (brand===SD) ? 'SmackDown' : 'Free Agent';
  return el('span', { class:`pill brand ${b}`, text:t });
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

  // Make the whole row clickable while keeping the anchor accessible
  r.addEventListener('click', (e)=>{
    // Don’t double-handle when clicking the anchor itself
    if (!(e.target instanceof HTMLAnchorElement)) window.location.href = href;
  });

  return r;
}

function render(){
  const state = loadState();
  ensureInitialised(state);

  root.innerHTML = '';
  const wrap = el('div',{class:'ro-wrap'});

  // header with search
  const head = el('div',{class:'ro-head'});
  head.appendChild(el('h3',{text:'Roster'}));
  const search = el('input',{class:'ro-search', type:'search', placeholder:'Search roster…'});
  head.appendChild(search);
  wrap.appendChild(head);

  // unified sorted list
  const list = el('div',{class:'ro-list'});
  const all = [...state.roster].sort((a,b)=>a.name.localeCompare(b.name));
  let current = all;

  function refresh(){
    list.innerHTML = '';
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

try { render(); } catch(e){ console.error(e); }
