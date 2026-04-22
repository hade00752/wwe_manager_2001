// public/js/trades.js
import { el } from './util.js';
import { loadState, saveState } from './engine.js';
import { headshotImg, getW } from './engine/helpers.js';
import { openTradePicker } from './ui/trade_picker.js';
import { hydrateRosterContractsFromDb } from './engine/db_hydrate.js';
const BUDGET_CAP = 150_000_000;
const SLOTS = 3;

const BRAND_RAW = 'RAW';
const BRAND_SD  = 'SD';

function money(n){
  const x = Number(n || 0);
  return x.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function getContract(w){
  return Number(w?.contractAnnual ?? w?.contract ?? w?.salary ?? w?.contractValue ?? 0);
}

function getOverall(w){
  const promoLike = ((w?.charisma ?? w?.promo ?? 60) + (w?.mic ?? w?.promo ?? 60)) / 2;
  const o =
    (w?.workrate ?? 60)*0.30 +
    (w?.starpower ?? 60)*0.25 +
    promoLike*0.15 +
    (w?.momentum ?? 60)*0.10 +
    (w?.psychology ?? 60)*0.10 +
    (w?.consistency ?? 60)*0.10;
  return Math.round(o);
}

function brandRoster(state, brand){
  return (state?.roster || []).filter(w => w?.brand === brand && !w?.retired);
}

function brandPayroll(state, brand){
  return brandRoster(state, brand).reduce((sum,w)=> sum + getContract(w), 0);
}

/**
 * Decide who the player is.
 * Adjust this to your canonical save field if you have one.
 */
function getPlayerBrand(state){
  const b =
    state?.playerBrand ||
    state?.brand ||
    state?.activeBrand ||
    state?.selectedBrand ||
    null;

  if (b === BRAND_RAW || b === BRAND_SD) return b;
  return BRAND_RAW; // fallback
}

function otherBrandOf(b){
  return (b === BRAND_RAW) ? BRAND_SD : BRAND_RAW;
}

/**
 * Trade is always:
 *   YOU give from playerBrand -> otherBrand
 *   YOU take from otherBrand  -> playerBrand
 */
function applyTrade(state, playerBrand, giveNames, wantNames){
  const all = state?.roster || [];
  const otherBrand = otherBrandOf(playerBrand);

  const setGive = new Set((giveNames || []).filter(Boolean));
  const setWant = new Set((wantNames || []).filter(Boolean));

  if (setGive.size === 0 || setWant.size === 0){
    return { ok:false, reason:'Select at least 1 wrestler on each side.' };
  }

  // Validate give are from playerBrand
  for (const n of setGive){
    const w = getW(all, n);
    if (!w) return { ok:false, reason:`Unknown wrestler: ${n}` };
    if (w.retired) return { ok:false, reason:`${n} is retired.` };
    if (w.brand !== playerBrand) return { ok:false, reason:'You can only offer wrestlers from your brand.' };
  }

  // Validate want are from otherBrand
  for (const n of setWant){
    const w = getW(all, n);
    if (!w) return { ok:false, reason:`Unknown wrestler: ${n}` };
    if (w.retired) return { ok:false, reason:`${n} is retired.` };
    if (w.brand !== otherBrand) return { ok:false, reason:'You can only request wrestlers from the other brand.' };
  }

  // projected payrolls
  const playerPayroll = brandPayroll(state, playerBrand);
  const otherPayroll  = brandPayroll(state, otherBrand);

  const giveCost = [...setGive].reduce((s,n)=> s + getContract(getW(all,n)), 0);
  const wantCost = [...setWant].reduce((s,n)=> s + getContract(getW(all,n)), 0);

  const newPlayerPayroll = playerPayroll - giveCost + wantCost;
  const newOtherPayroll  = otherPayroll  - wantCost + giveCost;


  // AI acceptance: total OVR offered >= total OVR requested
  const giveO = [...setGive].reduce((s,n)=> s + getOverall(getW(all,n)), 0);
  const wantO = [...setWant].reduce((s,n)=> s + getOverall(getW(all,n)), 0);

  if (giveO < wantO){
    return { ok:false, reason:`Trade rejected: offer value too low (${giveO} < ${wantO}).` };
  }

  // Apply swaps
  for (const w of all){
    if (setGive.has(w.name)) w.brand = otherBrand;
    if (setWant.has(w.name)) w.brand = playerBrand;
  }

  return { ok:true, reason:'Trade accepted.' };
}

/* ---------------- UI ---------------- */

const app = document.getElementById('app');
let state = loadState();

const ui = {
  give: Array(SLOTS).fill(null),
  want: Array(SLOTS).fill(null),
  picking: null // { side:'give'|'want', idx:number }
};

async function render(){
  state = loadState();

  // pick era from state (or fallback)
  const era = Number(state?.era || 200404);

  try {
    await hydrateRosterContractsFromDb(state, era);
  } catch (e) {
    console.warn('[trades] contract hydrate failed (continuing)', e);
  }


  const playerBrand = getPlayerBrand(state);
  const otherBrand  = otherBrandOf(playerBrand);

  app.innerHTML = '';
  const wrap = el('div',{class:'trade-wrap'});

  wrap.appendChild(el('div',{class:'trade-title',text:'Trades'}));
  wrap.appendChild(el('div',{class:'trade-sub',text:`Offer a trade. AI accepts if your total Overall ≥ their total Overall, and neither brand exceeds $${money(BUDGET_CAP)} payroll.`}));

  const grid = el('div',{class:'trade-grid'});
  grid.appendChild(renderColumn(playerBrand, 'give', ui.give, 'You Offer'));
  grid.appendChild(renderColumn(otherBrand,  'want', ui.want, 'You Want'));
  wrap.appendChild(grid);

  const footer = el('div',{style:'margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;'});
  const btn = el('button',{class:'trade-btn',text:'PROPOSE TRADE'});
  btn.onclick = () => {
    const res = applyTrade(state, playerBrand, ui.give, ui.want);
    alert(res.reason);
    if (res.ok){
      saveState(state);
      ui.give = Array(SLOTS).fill(null);
      ui.want = Array(SLOTS).fill(null);
      ui.picking = null;
      render();
    }
  };

  const reset = el('button',{class:'trade-btn',text:'RESET'});
  reset.onclick = () => {
    ui.give = Array(SLOTS).fill(null);
    ui.want = Array(SLOTS).fill(null);
    ui.picking = null;
    render();
  };

  footer.appendChild(btn);
  footer.appendChild(reset);
  wrap.appendChild(footer);

  const hint = el('div',{style:'margin-top:14px; padding:12px; border-radius:16px; background:rgba(0,0,0,.20); border:1px solid rgba(255,255,255,.10); opacity:.9;'});
  hint.textContent = ui.picking ? 'Picker open…' : `Playing as ${playerBrand}. Pick a slot to choose a wrestler.`;
  wrap.appendChild(hint);

  app.appendChild(wrap);
}

function renderColumn(brand, sideKey, names, labelText){
  const col = el('div',{class:'trade-col'});
  const hdr = el('div',{class:'trade-col__hdr'});

  const badgeCls = brand === BRAND_RAW ? 'trade-brand__badge badge-raw' : 'trade-brand__badge badge-sd';
  hdr.appendChild(
    el('div',{class:'trade-brand'},
      el('div',{class:badgeCls, text:brand}),
      el('div',{style:'font-weight:800; opacity:.9;', text: labelText})
    )
  );

  const payroll = brandPayroll(state, brand);
  hdr.appendChild(el('div',{class:'trade-pill',text:`Payroll: $${money(payroll)} / $${money(BUDGET_CAP)}`}));
  col.appendChild(hdr);

  const slots = el('div',{class:'trade-slots'});

  for (let i=0;i<names.length;i++){
    const n = names[i];
    const w = n ? getW(state, n) : null;

    const slot = el('div',{class:'trade-slot' + (!w ? ' trade-slot--empty' : '')});

    if (w){
      slot.appendChild(headshotImg(w.name,{ className:'avatar', width:46, height:46 }));

      const main = el('div',{class:'trade-slot__main'});
      main.appendChild(el('div',{class:'trade-slot__name',text:w.name}));
      main.appendChild(el('div',{class:'trade-slot__meta'},
        el('div',{class:'trade-pill',text:`OVR ${getOverall(w)}`}),
        el('div',{class:'trade-pill',text:`$${money(getContract(w))}`})
      ));
      slot.appendChild(main);

      const acts = el('div',{class:'trade-slot__actions'});
      const change = el('button',{class:'trade-btn',text:'PICK'});
      change.onclick = ()=> openPicker(sideKey, i);

      const clear = el('button',{class:'trade-btn',text:'CLEAR'});
      clear.onclick = ()=> { names[i]=null; render(); };

      acts.appendChild(change);
      acts.appendChild(clear);
      slot.appendChild(acts);
    } else {
      slot.appendChild(el('div',{class:'trade-slot__main'},
        el('div',{class:'trade-slot__name',text:'Vacant'}),
        el('div',{class:'trade-slot__meta'},
          el('div',{class:'trade-pill',text:'OVR —'}),
          el('div',{class:'trade-pill',text:'$—'})
        )
      ));

      const acts = el('div',{class:'trade-slot__actions'});
      const pick = el('button',{class:'trade-btn',text:'PICK'});
      pick.onclick = ()=> openPicker(sideKey, i);
      acts.appendChild(pick);
      slot.appendChild(acts);
    }

    slots.appendChild(slot);
  }

  col.appendChild(slots);

  const totO = names.filter(Boolean).reduce((s,n)=> s + getOverall(getW(state,n)), 0);
  const totC = names.filter(Boolean).reduce((s,n)=> s + getContract(getW(state,n)), 0);

  const foot = el('div',{class:'trade-footer'});
  foot.appendChild(
    el('div',{class:'trade-totals'},
      el('div',{class:'trade-pill',text:`Total OVR: ${totO}`}),
      el('div',{class:'trade-pill',text:`Total $: $${money(totC)}`}),
    )
  );

  col.appendChild(foot);
  return col;
}

function openPicker(side, idx){

  const playerBrand = getPlayerBrand(state);
  const otherBrand  = otherBrandOf(playerBrand);

  const brand = (side === 'give') ? playerBrand : otherBrand;

  const exclude = new Set([
    ...ui.give.filter(Boolean),
    ...ui.want.filter(Boolean),
  ]);

  ui.picking = { side, idx };

  openTradePicker({
    state,
    brand,
    excludeNames: [...exclude],
    title: `Select for ${brand} slot #${idx + 1}`,
    onPick: (w) => {
      if (!w?.name) return;
      if (side === 'give') ui.give[idx] = w.name;
      if (side === 'want') ui.want[idx] = w.name;
      ui.picking = null;
      render();
    }
  });
}

render();
