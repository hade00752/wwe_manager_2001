// Main Menu: start RAW/SmackDown or continue
import { el, RAW, SD } from './util.js';
import { loadState, saveState, ensureInitialised, newSeason } from './engine.js';

(function styles(){
  const s = document.createElement('style');
  s.textContent = `
  .mm-wrap{ max-width:900px; margin:24px auto; padding:16px; }
  .mm-title{ font-size:40px; font-weight:800; margin:8px 0 16px }
  .mm-card{ padding:16px; border-radius:16px; background:rgba(255,255,255,.03); box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; }
  .mm-row{ display:flex; gap:12px; flex-wrap:wrap; }
  .mm-pill{ padding:8px 12px; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); font-size:12px }
  .mm-btn{ padding:12px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.06); cursor:pointer; }
  .mm-btn:disabled{ opacity:.55; cursor:not-allowed; }
  .mm-footer{ margin-top:16px; display:flex; gap:10px; flex-wrap:wrap; }
  `;
  document.head.appendChild(s);
})();

const root = document.getElementById('mainmenu-root');

init();

function init(){
  const state = loadState();

  const wrap = el('div',{class:'mm-wrap'});
  wrap.appendChild(el('div',{class:'mm-title', text:'WWF GM — Main Menu'}));

  const card = el('div',{class:'mm-card'});
  const row1 = el('div',{class:'mm-row'});

  const cont = el('button',{class:'mm-btn', text:'Continue Current Save'});
  cont.disabled = !state;
  cont.onclick = () => location.href = './booking.html';

  const startRaw = el('button',{class:'mm-btn', text:'Start New — RAW'});
  startRaw.onclick = () => {
    const s = newSeason(RAW);
    ensureInitialised(s);
    saveState(s);
    location.href = './booking.html';
  };

  const startSD = el('button',{class:'mm-btn', text:'Start New — SmackDown'});
  startSD.onclick = () => {
    const s = newSeason(SD);
    ensureInitialised(s);
    saveState(s);
    location.href = './booking.html';
  };

  row1.appendChild(startRaw);
  row1.appendChild(startSD);
  row1.appendChild(cont);
  card.appendChild(row1);

  const footer = el('div',{class:'mm-footer'});
  if (state){
    const simBadge = el('span',{class:'mm-pill', text:`Week ${state.week} — ${state.startDate||'01-04-2001'}`});
    const brandBadge = el('span',{class:'mm-pill', text:`Brand: ${state.brand}`});
    footer.appendChild(simBadge);
    footer.appendChild(brandBadge);
  }
  const wipe = el('button',{class:'mm-btn', text:'Delete Save'});
  wipe.onclick = () => { try{ localStorage.removeItem('wwf_sim_state_v1'); }catch{} location.reload(); };
  footer.appendChild(wipe);

  card.appendChild(footer);
  wrap.appendChild(card);
  root.innerHTML = '';
  root.appendChild(wrap);
}
