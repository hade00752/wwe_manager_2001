// public/js/booking.js
import { RAW, SD, SEGMENTS, TITLE_ALLOWED_ON, el } from './util.js';
import { newSeason, loadState, saveState, ensureInitialised, availableByBrand, byBrand } from './engine.js';
import { TITLES } from './data.js';
import { headshotImg } from './engine.js';

const root = document.getElementById('booking-root') || (function(){
  const m = document.createElement('main'); m.id = 'booking-root'; document.body.appendChild(m); return m;
})();

let state;
safeInit();

function safeInit(){
  try{
    state = loadState() || newSeason(RAW);
    ensureInitialised(state);
    saveState(state);
    render();
  }catch(err){
    console.error(err);
    if (window.__showBootError) window.__showBootError("Initialisation failed", err);
  }
}

function render(){
  root.innerHTML = "";
  root.appendChild(navBar());
  root.appendChild(showChampions());
  root.appendChild(bookingForm());
}

function navBar(){
  const wrap = el('div',{class:'row'});

  // Brand selector (booking supports only RAW/SD)
  const brandSel = el('select',{},
    ...[RAW,SD].map(b=>{
      const o = el('option',{value:b,text:b});
      if(state.brand===b) o.selected = true;
      return o;
    })
  );
  brandSel.addEventListener('change', ()=>{
    state.brand = brandSel.value;
    saveState(state);
    render();
  });

  // Hard reset without introducing circular references
  const newBtn = el('button',{text:'Start New Season'});
  newBtn.onclick = ()=>{
    try{
      const fresh = newSeason(state.brand);   // create brand-new state
      ensureInitialised(fresh);
      saveState(fresh);
      location.reload();
    }catch(err){
      console.error(err);
      if (window.__showBootError) window.__showBootError("Failed to start new season", err);
    }
  };

  wrap.appendChild(
    el('div',{class:'card'},
      el('label',{text:'Brand '}), brandSel, el('span',{text:' '}), newBtn
    )
  );
  return wrap;
}

function showChampions(){
  const c = el('div',{class:'card'});
  c.appendChild(el('h3',{text:'Champions'}));
  for(const brand of [RAW,SD]){
    const row = el('div',{}, el('strong',{text:brand}));
    for(const title of TITLES[brand]){
      const holder = state.champs[brand][title];
      row.appendChild(
        el('div',{
          html:`<span class="pill title">${brand} ${title}</span> ${Array.isArray(holder)? holder?.join(' & '): (holder||'Vacant')}`
        })
      );
    }
    c.appendChild(row);
  }
  return c;
}

/* Single-source-of-truth select with inline headshot preview */
function makeSelectWithPreview(id, available, injured){
  const wrap = el('span',{class:'pick-with-photo'});
  const s = el('select',{id});
  s.appendChild(el('option',{value:'',text:'— Select —'}));
  available.forEach(w=> s.appendChild(el('option',{value:w.name,text:`${w.name}${w.gender==='F'?' (W)':''}`})));

  if(injured.length){
    const grp = document.createElement('optgroup'); grp.label = 'Injured (unavailable)';
    injured.forEach(w=>{
      const o=document.createElement('option');
      o.value=''; o.disabled=true; o.textContent=`${w.name} — out ${w.injuryWeeks}w`;
      grp.appendChild(o);
    });
    s.appendChild(grp);
  }

  // preview container
  const previewHolder = document.createElement('span');
  previewHolder.style.marginLeft = '8px';
  previewHolder.style.display = 'inline-flex';
  previewHolder.style.verticalAlign = 'middle';

  let currentImg = null;
  const updatePreview = () => {
    const name = s.value || '';
    if (currentImg) { previewHolder.removeChild(currentImg); currentImg = null; }
    if (!name) return;
    // Use engine helper: builds an <img> with ext fallbacks & onerror swap
    currentImg = headshotImg(name, { width:24, height:24 });
    previewHolder.appendChild(currentImg);
  };

  s.addEventListener('change', updatePreview);

  wrap.appendChild(s);
  wrap.appendChild(previewHolder);
  return wrap;
}

function bookingForm(){
  const c = el('div',{class:'card'});
  c.appendChild(el('h3',{text:`Book Week ${state.week} (${state.brand})`}));

  const my = byBrand(state, state.brand);
  const available = availableByBrand(state, state.brand);
  const injured = my.filter(w=>w.injuryWeeks>0);

  const box = el('div',{class:'grid'});
  for(const seg of SEGMENTS){
    const segBox = el('div',{class:'card'});
    segBox.appendChild(el('strong',{text:seg.key}));

    if(seg.type==='promo'){
      const s = makeSelectWithPreview(`${seg.key}_Promo`, available, injured);
      segBox.appendChild(s);

    }else if(seg.type==='tag'){
      const a1=makeSelectWithPreview('Tag_A1', available, injured);
      const a2=makeSelectWithPreview('Tag_A2', available, injured);
      const b1=makeSelectWithPreview('Tag_B1', available, injured);
      const b2=makeSelectWithPreview('Tag_B2', available, injured);
      segBox.appendChild(el('div',{}, el('label',{text:"Team A"}), a1, a2));
      segBox.appendChild(el('div',{}, el('label',{text:"Team B"}), b1, b2));

    }else{
      const A=makeSelectWithPreview(`${seg.key}_A`, available, injured);
      const B=makeSelectWithPreview(`${seg.key}_B`, available, injured);
      segBox.appendChild(el('div',{}, el('label',{text:'A'}), A, el('span',{text:' '}), el('label',{text:'B'}), B));
    }

    if(seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key)){
      const tChk = el('input',{type:'checkbox',id:`${seg.key}_isTitle`});
      const tSel = el('select',{id:`${seg.key}_title`, disabled:true});
      for(const t of TITLES[state.brand]) tSel.appendChild(el('option',{value:t,text:t}));
      tChk.addEventListener('change',()=> tSel.disabled = !tChk.checked);
      segBox.appendChild(el('div',{}, el('label',{text:'Championship '}), tChk, el('span',{text:' '}), tSel));
    }

    box.appendChild(segBox);
  }
  c.appendChild(box);

  const warn = el('div',{class:'pill warn'});
  const simBtn = el('button',{text:'Save Booking & Go To Results'});
  simBtn.onclick = ()=>{
    try{
      const my = byBrand(state, state.brand);
      const booking = {};
      for(const seg of SEGMENTS){
        if(seg.type==='promo'){
          const v = val(`${seg.key}_Promo`); if(!v){ warn.textContent=`[${seg.key}] missing promo.`; return; }
          booking[seg.key] = {type:'promo', speaker:v};
        } else if(seg.type==='tag'){
          const picks = ['Tag_A1','Tag_A2','Tag_B1','Tag_B2'].map(id=>val(id));
          if(picks.some(v=>!v)) { warn.textContent="[Tag] needs four picks."; return; }
          if(picks.some(n=>my.find(w=>w.name===n)?.injuryWeeks>0)){ warn.textContent="You selected an injured wrestler."; return; }
          const [a1,a2,b1,b2] = picks;
          const g = my.find(w=>w.name===a1).gender;
          if([a2,b1,b2].some(n=>my.find(w=>w.name===n).gender!==g)) { warn.textContent="[Tag] teams must be same gender."; return; }
          booking[seg.key] = {type:'tag', teams:[[a1,a2],[b1,b2]]};
        } else {
          const A=val(`${seg.key}_A`), B=val(`${seg.key}_B`);
          if(!A||!B){ warn.textContent=`[${seg.key}] needs two wrestlers.`; return; }
          if(my.find(w=>w.name===A)?.injuryWeeks>0 || my.find(w=>w.name===B)?.injuryWeeks>0){ warn.textContent="You selected an injured wrestler."; return; }
          if(my.find(w=>w.name===A).gender!==my.find(w=>w.name===B).gender){ warn.textContent=`[${seg.key}] women vs women only.`; return; }
          booking[seg.key]={type:'singles', a:A, b:B};
        }

        if(seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key)){
          const tOn = checked(`${seg.key}_isTitle`);
          if(tOn) booking[seg.key].championship = val(`${seg.key}_title`);
        }
      }
      const payload = {week: state.week, brand: state.brand, booking};
      localStorage.setItem("wwf_booking_payload", JSON.stringify(payload));
      saveState(state);
      location.href="./results.html";
    }catch(err){
      console.error(err);
      warn.textContent = "Failed to save & navigate. See console.";
      if (window.__showBootError) window.__showBootError("Failed to save booking", err);
    }
  };

  c.appendChild(el('div',{}, simBtn, el('span',{text:' '}), warn));
  return c;

  function val(id){ const e=document.getElementById(id); return e? e.value: null; }
  function checked(id){ const e=document.getElementById(id); return !!(e && e.checked); }
}
