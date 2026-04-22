// public/js/booking.js
import { RAW, SD, SEGMENTS, TITLE_ALLOWED_ON, el } from './util.js';
import {
  boot,
  saveState,
  availableByBrand,
  byBrand,
  headshotImg
} from './engine.js';
import { TITLES } from './data.js';
import { openVsPicker } from './ui/vs_picker.js';
import { getActivePPV, getNextPPV, ppvTierLabel, getSharedMainEventBrand } from './engine/ppv.js';

const root = document.getElementById('booking-root') || (function () {
  const m = document.createElement('main'); m.id = 'booking-root'; document.body.appendChild(m); return m;
})();

let state = null;
init();

/* ------------------------------------------------------------------ */
/* Init (canonical)                                                   */
/* ------------------------------------------------------------------ */
function init() {
  try {
    state = boot({ brand: RAW });
    state.brand = state.brand || RAW;
    saveState(state);
    render();
  } catch (err) {
    console.error(err);
    if (window.__showBootError) window.__showBootError("Initialisation failed", err);
  }
}

/* ------------------------------------------------------------------ */
/* Render                                                             */
/* ------------------------------------------------------------------ */
function render() {
  root.innerHTML = "";
  root.appendChild(navBar());
  root.appendChild(showChampions());
  root.appendChild(bookingForm());
}

/* ------------------------------------------------------------------ */
/* Navbar                                                             */
/* ------------------------------------------------------------------ */
function navBar() {
  const wrap = el('div', { class: 'row' });

  const brandSel = el('select', {},
    ...[RAW, SD].map(b => {
      const o = el('option', { value: b, text: b });
      if (state.brand === b) o.selected = true;
      return o;
    })
  );

  brandSel.addEventListener('change', () => {
    state.brand = brandSel.value;
    saveState(state);
    render();
  });

  const newBtn = el('button', { text: 'Start New Season' });
  newBtn.onclick = () => {
    try {
      const fresh = boot({ forceNew: true, brand: state.brand });
      localStorage.removeItem("wwf_booking_payload");
      saveState(fresh);
      state = fresh;
      render();
    } catch (err) {
      console.error(err);
      if (window.__showBootError) window.__showBootError("Failed to start new season", err);
    }
  };

  wrap.appendChild(
    el('div', { class: 'card' },
      el('label', { text: 'Brand ' }), brandSel, el('span', { text: ' ' }), newBtn
    )
  );
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Champions                                                          */
/* ------------------------------------------------------------------ */
function showChampions() {
  const c = el('div', { class: 'card' });
  c.appendChild(el('h3', { text: 'Champions' }));

  for (const brand of [RAW, SD]) {
    const row = el('div', {}, el('strong', { text: brand }));
    for (const title of TITLES[brand]) {
      const holder = state.champs?.[brand]?.[title];

      const brandClass = (brand === RAW) ? 'brand-raw' : 'brand-sd';

      row.appendChild(
        el('div', {
          html: `<span class="pill title ${brandClass}">${brand} ${title}</span> ${
            Array.isArray(holder) ? holder.join(' & ') : (holder || 'Vacant')
          }`
        })
      );
    }
    c.appendChild(row);
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* VS-picker backed booking pick slot UI                               */
/* ------------------------------------------------------------------ */
function ensureSlotStylesOnce(){
  if (document.getElementById('booking-slot-styles')) return;
  const s = document.createElement('style');
  s.id = 'booking-slot-styles';
  s.textContent = `
    /* Same structure + sizes, only re-skinned */
    .pickslot{
      display:inline-flex;
      align-items:center;
      gap:10px;
      padding:10px 12px;
      border-radius:14px;
      border:1px solid rgba(140,240,255,.22);
      background: rgba(10,40,70,.18);
      box-shadow:
        0 0 0 2px rgba(0,0,0,.18) inset,
        0 0 18px rgba(120,240,255,.08);
      cursor:pointer;
      user-select:none;
      min-width: 220px;
    }
    .pickslot:hover{
      filter: brightness(1.06);
      box-shadow:
        0 0 0 2px rgba(0,0,0,.18) inset,
        0 0 26px rgba(120,240,255,.12);
    }
    .pickslot .lbl{
      opacity:.70;
      font-size:12px;
      width:26px;
      letter-spacing:.06em;
      text-transform:uppercase;
    }
    .pickslot .nm{
      font-weight:900;
      letter-spacing:.04em;
    }
    .pickslot .ava{
      width:28px;
      height:28px;
      border-radius:999px;
      object-fit:cover;
      border:1px solid rgba(140,240,255,.22);
      box-shadow: 0 0 12px rgba(120,240,255,.08);
    }
    .pickslot .empty{
      opacity:.55;
      font-weight:800;
    }
    .pickslot .meta{
      margin-left:auto;
      display:flex;
      gap:8px;
      align-items:center;
    }
    .pickslot .pillmini{
      font-size:11px;
      padding:2px 8px;
      border-radius:999px;
      border:1px solid rgba(140,240,255,.18);
      background: rgba(10,40,70,.14);
      opacity:.88;
      letter-spacing:.06em;
      text-transform:uppercase;
    }
    .pickslot .pillmini.warn{
      border-color: rgba(255,170,0,.35);
      background: rgba(255,170,0,.10);
    }
  `;
  document.head.appendChild(s);
}

/* ✅ normalise whatever vs_picker returns into a name string */
function pickToName(p){
  if (!p) return '';
  if (typeof p === 'string') return p;
  if (typeof p === 'object') return p.name || '';
  return '';
}

function makePickSlot({ id, label, brandRoster, stateRef, getOpponentName, clickable = true }){
  ensureSlotStylesOnce();

  const hidden = el('input', { id, type:'hidden', value:'' });

  const wrap = el('div', { class: 'pickslot', title: clickable ? 'Click to pick' : '' });
  const lbl  = el('div', { class: 'lbl', text: label });

  const ava = document.createElement('img');
  ava.className = 'ava';
  ava.alt = '';

  const nm = el('div', { class: 'nm empty', text: '— Select —' });
  const meta = el('div', { class: 'meta' });

  wrap.append(lbl, ava, nm, meta, hidden);

  function setName(name){
    hidden.value = name || '';
    meta.innerHTML = '';

    if (!name) {
      nm.textContent = '— Select —';
      nm.classList.add('empty');
      ava.src = '';
      ava.style.display = 'none';
      return;
    }

    nm.textContent = name;
    nm.classList.remove('empty');

    const img = headshotImg(name, { width: 28, height: 28, exts:['webp','png','jpg','jpeg'], alt:name });
    img.className = 'ava';
    img.onerror = () => {
      img.replaceWith(el('span', { class:'pillmini', text: name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase() }));
    };
    ava.replaceWith(img);

    const w = brandRoster.find(x => x?.name === name);
    const fat = (w?.fatigue ?? w?.fatiguePct ?? null);
    if (fat != null) {
      const pill = el('span', { class:'pillmini', text:`FAT ${Math.round(fat)}` });
      if (Number(fat) >= 70) pill.classList.add('warn');
      meta.appendChild(pill);
    }

    const champs = stateRef?.champs?.[stateRef.brand] || {};
    let isChamp = false;
    for (const holder of Object.values(champs)) {
      if (!holder) continue;
      if (Array.isArray(holder) && holder.includes(name)) { isChamp = true; break; }
      if (holder === name) { isChamp = true; break; }
    }
    if (isChamp) meta.appendChild(el('span', { class:'pillmini', text:'CHAMP' }));
  }

  if (clickable) {
    wrap.addEventListener('click', () => {
      const opponentName = (typeof getOpponentName === 'function') ? getOpponentName() : null;
      openVsPicker({
        state: stateRef,
        brand: stateRef.brand,
        roster: brandRoster,
        selectedName: hidden.value || null,
        opponentName: opponentName || null,
        sideLabelLeft: '1P',
        sideLabelRight: 'COM',
        titleText: 'SELECT SUPERSTAR',
        onPick: (picked) => {
          const name = pickToName(picked);
          setName(name);
          hidden.dispatchEvent(new Event('change'));
        }
      });
    });
  } else {
    wrap.style.cursor = 'default';
  }

  return {
    wrap,
    input: hidden,
    set: setName,
    get: () => hidden.value || ''
  };
}

/* ------------------------------------------------------------------ */
/* Booking form                                                       */
/* ------------------------------------------------------------------ */
function ppvBanner() {
  const week  = state.week  || 1;
  const brand = state.brand || RAW;

  const active = getActivePPV(week, brand);
  if (active) {
    const isShared = active.shared;
    const mainBrand = isShared ? getSharedMainEventBrand(state) : brand;
    const tier = ppvTierLabel(active.tier);

    const s = document.createElement('style');
    s.textContent = `
      .ppv-banner{border-radius:14px;padding:13px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;}
      .ppv-banner.major{border:1px solid rgba(255,160,60,.35);background:rgba(255,130,20,.10);}
      .ppv-banner.supershow{border:1px solid rgba(120,180,255,.40);background:rgba(100,160,255,.10);}
      .ppv-banner.wm{border:1px solid rgba(255,210,0,.45);background:rgba(255,200,0,.12);}
      .ppv-banner__icon{font-size:20px;}
      .ppv-banner__body{flex:1;}
      .ppv-banner__name{font-weight:900;font-size:15px;}
      .ppv-banner__meta{opacity:.75;margin-top:2px;}
    `;
    if (!document.getElementById('ppv-banner-styles')) { s.id = 'ppv-banner-styles'; document.head.appendChild(s); }

    const cls = active.tier === 'wrestlemania' ? 'wm' : (active.tier === 'supershow' ? 'supershow' : 'major');
    const icon = active.tier === 'wrestlemania' ? '🏆' : (active.tier === 'supershow' ? '⭐' : '📅');

    const banner = el('div', { class: `ppv-banner ${cls}` });
    banner.appendChild(el('div', { class: 'ppv-banner__icon', text: icon }));
    const body = el('div', { class: 'ppv-banner__body' });
    body.appendChild(el('div', { class: 'ppv-banner__name', text: `THIS WEEK: ${active.name.toUpperCase()}` }));
    let meta = tier;
    if (isShared) meta += ` — Main event slot: ${mainBrand}`;
    body.appendChild(el('div', { class: 'ppv-banner__meta', text: meta }));
    banner.appendChild(body);
    return banner;
  }

  // Not a PPV week — show countdown pill if close
  const next = getNextPPV(week, brand);
  if (next && next.weeksAway <= 3) {
    const div = el('div', { style: 'border-radius:12px;padding:10px 14px;margin-bottom:10px;border:1px solid rgba(255,200,80,.25);background:rgba(255,190,60,.07);font-size:12px;opacity:.9;' });
    div.textContent = `Upcoming: ${next.name} in ${next.weeksAway} week${next.weeksAway !== 1 ? 's' : ''}`;
    return div;
  }

  return null;
}

function bookingForm() {
  const c = el('div', { class: 'card' });

  const banner = ppvBanner();
  if (banner) c.appendChild(banner);

  c.appendChild(el('h3', { text: `Book Week ${state.week} (${state.brand})` }));

  const my = byBrand(state, state.brand);
  const available = availableByBrand(state, state.brand);

  const brandRoster = (available || []).filter(w => (w?.injuryWeeks|0) <= 0);

  function openPickOnce({ rosterList, selectedName, opponentName, titleText = 'SELECT SUPERSTAR' }) {
    return new Promise((resolve) => {
      openVsPicker({
        state,
        brand: state.brand,
        roster: rosterList,
        selectedName: selectedName || null,
        opponentName: opponentName || null,
        sideLabelLeft: '1P',
        sideLabelRight: 'COM',
        titleText,
        onPick: (picked) => resolve(pickToName(picked) || null),
        onClose: () => resolve(null)
      });
    });
  }

  /* ✅ singles uses one modal (pair mode) -> returns {aName,bName} */
  function openPickPair({ rosterList, aName, bName, titleText = 'SELECT SUPERSTARS' }) {
    return new Promise((resolve) => {
      openVsPicker({
        state,
        brand: state.brand,
        roster: rosterList,
        selectedName: aName || null,
        opponentName: bName || null,
        mode: 'pair',
        sideLabelLeft: 'A',
        sideLabelRight: 'B',
        titleText,
        onPick: (pair) => resolve(pair || null),
        onClose: () => resolve(null)
      });
    });
  }

  function firstEmptySlot(slots) {
    return slots.findIndex(s => !s.get());
  }

  function usedExcept(slots, slotIndex){
    const used = new Set();
    slots.forEach((s, i) => {
      const n = s.get();
      if (!n) return;
      if (i === slotIndex) return;
      used.add(n);
    });
    return used;
  }

  const warn = el('div', { class: 'pill warn' });

  /* ---------------- Title validation helpers ---------------- */

  const getChampionFor = (brand, title) => state?.champs?.[brand]?.[title] ?? null;
  const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
  const sameSet2 = (a, b) => {
    const A = uniq(a).sort();
    const B = uniq(b).sort();
    return A.length === B.length && A.every((x,i)=>x===B[i]);
  };

  function titleEligibilityForSeg(seg, ctx) {
    const brand = state.brand;
    const titles = TITLES[brand] || [];
    const parts = (ctx.getParticipants ? ctx.getParticipants() : []).filter(Boolean);

    if ((seg.type === 'tag' && parts.length < 4) || (seg.type !== 'tag' && parts.length < 2)) {
      return { ok:false, reason:'Pick wrestlers first.', allowedTitles: [] };
    }

    const allowed = [];
    for (const t of titles) {
      const holder = getChampionFor(brand, t);
      if (!holder) continue;

      if (Array.isArray(holder)) {
        if (seg.type !== 'tag') continue;
        const { teamA, teamB } = ctx.getTeams ? ctx.getTeams() : { teamA: [], teamB: [] };
        if (teamA.length !== 2 || teamB.length !== 2) continue;
        if (sameSet2(holder, teamA) || sameSet2(holder, teamB)) allowed.push(t);
      } else {
        if (seg.type === 'tag') continue;
        if (parts.includes(holder)) allowed.push(t);
      }
    }

    return allowed.length
      ? { ok:true, allowedTitles: allowed }
      : { ok:false, reason:'No champion is in this match.', allowedTitles: [] };
  }

  function setupTitleControls(seg, segBox, ctx) {
    if (!(seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key))) return;

    const tChk = el('input', { type: 'checkbox', id: `${seg.key}_isTitle` });
    const tSel = el('select', { id: `${seg.key}_title`, disabled: true });
    tSel.appendChild(el('option', { value: '', text: '— Select title —' }));

    const forceOff = () => { tChk.checked = false; tSel.disabled = true; };

    const rebuildTitleOptions = () => {
      const outcome = ctx.outcomeSel ? ctx.outcomeSel.value : 'ENG';
      const isNC = outcome === 'NC';
      const elig = titleEligibilityForSeg(seg, ctx);
      const keepValue = tSel.value;

      tSel.innerHTML = '';
      tSel.appendChild(el('option', { value: '', text: '— Select title —' }));
      (elig.allowedTitles || []).forEach(t => tSel.appendChild(el('option', { value: t, text: t })));

      if (isNC || !elig.ok) {
        tChk.disabled = true;
        forceOff();
        return;
      }

      tChk.disabled = false;
      if (keepValue && (elig.allowedTitles || []).includes(keepValue)) tSel.value = keepValue;

      if (tChk.checked) {
        if (!tSel.value || !(elig.allowedTitles || []).includes(tSel.value)) {
          tSel.value = elig.allowedTitles?.[0] || '';
        }
        tSel.disabled = false;
      } else {
        tSel.disabled = true;
      }
    };

    tChk.addEventListener('change', () => {
      if (!tChk.checked) { tSel.disabled = true; return; }
      const elig = titleEligibilityForSeg(seg, ctx);
      if (!elig.ok) {
        tChk.checked = false;
        tSel.disabled = true;
        warn.textContent = `[${seg.key}] Can't book a title match: ${elig.reason || 'invalid'}`;
        return;
      }
      if (!tSel.value || !(elig.allowedTitles || []).includes(tSel.value)) {
        tSel.value = elig.allowedTitles?.[0] || '';
      }
      tSel.disabled = false;
    });

    (ctx.bindEls || []).filter(Boolean).forEach(e => e.addEventListener('change', rebuildTitleOptions));
    if (ctx.outcomeSel) ctx.outcomeSel.addEventListener('change', rebuildTitleOptions);

    rebuildTitleOptions();
    segBox.appendChild(el('div', {}, el('label', { text: 'Championship ' }), tChk, el('span', { text: ' ' }), tSel));
  }

  /* ------------------------------------------------------------------ */

  const box = el('div', { class: 'grid' });

  for (const seg of SEGMENTS) {
    const segBox = el('div', { class: 'card' });
    segBox.appendChild(el('strong', { text: seg.key }));

    if (seg.type === 'promo') {
      const pick = makePickSlot({
        id: `${seg.key}_Promo`,
        label: '',
        brandRoster,
        stateRef: state,
        getOpponentName: () => null,
        clickable: false
      });
      segBox.appendChild(pick.wrap);

      segBox.style.cursor = 'pointer';
      segBox.title = 'Click to pick speaker';

      segBox.addEventListener('click', async (e) => {
        if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest?.('.pickslot'))) return;

        const picked = await openPickOnce({
          rosterList: brandRoster,
          selectedName: pick.get() || null,
          opponentName: null,
          titleText: 'SELECT SPEAKER'
        });

        if (!picked) return;
        pick.set(picked);
        pick.input.dispatchEvent(new Event('change'));
      });

    } else if (seg.type === 'tag') {
      const a1 = makePickSlot({ id:`${seg.key}_A1`, label:'A1', brandRoster, stateRef: state, getOpponentName:()=>'', clickable:false });
      const a2 = makePickSlot({ id:`${seg.key}_A2`, label:'A2', brandRoster, stateRef: state, getOpponentName:()=>'', clickable:false });
      const b1 = makePickSlot({ id:`${seg.key}_B1`, label:'B1', brandRoster, stateRef: state, getOpponentName:()=>'', clickable:false });
      const b2 = makePickSlot({ id:`${seg.key}_B2`, label:'B2', brandRoster, stateRef: state, getOpponentName:()=>'', clickable:false });

      segBox.appendChild(el('div', {}, el('label', { text: "Team A" }), a1.wrap, a2.wrap));
      segBox.appendChild(el('div', {}, el('label', { text: "Team B" }), b1.wrap, b2.wrap));

      segBox.style.cursor = 'pointer';
      segBox.title = 'Click to pick teams';

      segBox.addEventListener('click', async (e) => {
        if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest?.('.pickslot'))) return;

        const slots = [a1, a2, b1, b2];

        let i = firstEmptySlot(slots);
        if (i === -1) i = 0;

        for (; i < slots.length; i++) {
          const used = usedExcept(slots, i);
          const rosterFiltered = brandRoster.filter(w => w?.name && !used.has(w.name));

          const opponentName =
            (i <= 1) ? (b1.get() || null)
                     : (a1.get() || null);

          const picked = await openPickOnce({
            rosterList: rosterFiltered,
            selectedName: slots[i].get() || null,
            opponentName
          });

          if (!picked) break;
          slots[i].set(picked);
          slots[i].input.dispatchEvent(new Event('change'));
        }
      });

      const outcomeSel = el('select', { id: `${seg.key}_Outcome` },
        el('option', { value: 'ENG', text: '— Let engine decide —' }),
        el('option', { value: 'TeamA', text: 'Winner: Team A' }),
        el('option', { value: 'TeamB', text: 'Winner: Team B' }),
        el('option', { value: 'NC', text: 'No contest' }),
      );

      const finishSel = el('select', { id: `${seg.key}_Finish` },
        el('option', { value: 'clean', text: 'Clean win' }),
        el('option', { value: 'dirty', text: 'Dirty win' }),
      );

      const directionSel = el('select', { id: `${seg.key}_Direction`, title: 'Booking direction affects momentum, morale, and locker room reactions' },
        el('option', { value: 'clean',   text: 'Standard'  }),
        el('option', { value: 'dirty',   text: 'Dirty'     }),
        el('option', { value: 'squash',  text: 'Squash (+3 score, +12 mom, loser morale -4, may complain)' }),
        el('option', { value: 'protect', text: 'Protect (-4 score, loser protected)'  }),
      );

      segBox.appendChild(el('div', {}, el('label', { text: 'Outcome ' }), outcomeSel, el('span', { text: ' ' }), finishSel, el('span', { text: ' ' }), directionSel));

      const ctx = {
        outcomeSel,
        bindEls: [a1.input, a2.input, b1.input, b2.input],
        getParticipants: () => uniq([a1.get(), a2.get(), b1.get(), b2.get()]),
        getTeams: () => ({
          teamA: uniq([a1.get(), a2.get()]),
          teamB: uniq([b1.get(), b2.get()]),
        })
      };

      setupTitleControls(seg, segBox, ctx);

    } else {
      const A = makePickSlot({ id: `${seg.key}_A`, label: 'A', brandRoster, stateRef: state, getOpponentName: () => '', clickable: false });
      const B = makePickSlot({ id: `${seg.key}_B`, label: 'B', brandRoster, stateRef: state, getOpponentName: () => '', clickable: false });

      segBox.appendChild(
        el('div', {},
          el('label', { text: 'A' }), A.wrap,
          el('span', { text: ' ' }),
          el('label', { text: 'B' }), B.wrap
        )
      );

      segBox.style.cursor = 'pointer';
      segBox.title = 'Click to pick wrestlers';

      segBox.addEventListener('click', async (e) => {
        if (e.target && (
          e.target.tagName === 'SELECT' ||
          e.target.tagName === 'BUTTON' ||
          e.target.tagName === 'INPUT'  ||
          e.target.closest?.('.pickslot')
        )) return;

        const aCur = A.get() || null;
        const bCur = B.get() || null;

        const pair = await openPickPair({
          rosterList: brandRoster,
          aName: aCur,
          bName: bCur,
          titleText: 'SELECT SUPERSTARS'
        });

        if (!pair) return;

        if (pair.aName && pair.bName && pair.aName === pair.bName) {
          warn.textContent = `[${seg.key}] A and B must be different.`;
          return;
        }

        A.set(pair.aName || '');
        A.input.dispatchEvent(new Event('change'));
        B.set(pair.bName || '');
        B.input.dispatchEvent(new Event('change'));
      });

      const outcomeSel = el('select', { id: `${seg.key}_Outcome` },
        el('option', { value: 'ENG', text: '— Let engine decide —' }),
        el('option', { value: 'A', text: 'Winner: A' }),
        el('option', { value: 'B', text: 'Winner: B' }),
        el('option', { value: 'NC', text: 'No contest' }),
      );

      const finishSel = el('select', { id: `${seg.key}_Finish` },
        el('option', { value: 'clean', text: 'Clean win' }),
        el('option', { value: 'dirty', text: 'Dirty win' }),
      );

      const directionSel = el('select', { id: `${seg.key}_Direction`, title: 'Booking direction affects momentum, morale, and locker room reactions' },
        el('option', { value: 'clean',   text: 'Standard'  }),
        el('option', { value: 'dirty',   text: 'Dirty'     }),
        el('option', { value: 'squash',  text: 'Squash (+3 score, +12 mom, loser morale -4, may complain)' }),
        el('option', { value: 'protect', text: 'Protect (-4 score, loser protected)'  }),
      );

      segBox.appendChild(el('div', {}, el('label', { text: 'Outcome ' }), outcomeSel, el('span', { text: ' ' }), finishSel, el('span', { text: ' ' }), directionSel));

      const ctx = {
        outcomeSel,
        bindEls: [A.input, B.input],
        getParticipants: () => uniq([A.get(), B.get()])
      };

      setupTitleControls(seg, segBox, ctx);
    }

    box.appendChild(segBox);
  }

  c.appendChild(box);

  function getMatchParticipants(entry){
    if (!entry) return [];
    if (entry.type === 'singles') return [entry.a, entry.b].filter(Boolean);
    if (entry.type === 'tag')     return [...(entry.teams?.[0]||[]), ...(entry.teams?.[1]||[])].filter(Boolean);
    return [];
  }

  function validateNoDoubleBookedMatches(booking){
    const usedInMatch = new Map();
    for (const [segKey, entry] of Object.entries(booking)){
      const names = getMatchParticipants(entry);
      for (const n of names){
        if (!n) continue;
        if (usedInMatch.has(n)){
          const prev = usedInMatch.get(n);
          return { ok:false, msg:`Tag: Wrestler already booked in another match. (${n} in ${prev} & ${segKey})` };
        }
        usedInMatch.set(n, segKey);
      }
    }
    return { ok:true };
  }

  function validateTitleLegitimacy(booking){
    const brand = state.brand;

    for (const [segKey, entry] of Object.entries(booking)){
      if (!entry || !entry.championship) continue;

      const title = entry.championship;
      const holder = state?.champs?.[brand]?.[title] ?? null;

      if (!holder) {
        return { ok:false, msg:`[${segKey}] "${title}" is Vacant. Can't book it as a title match.` };
      }

      if (entry.type === 'singles') {
        if (Array.isArray(holder)) {
          return { ok:false, msg:`[${segKey}] "${title}" is a tag title. Can't be defended in singles.` };
        }
        if (holder !== entry.a && holder !== entry.b) {
          return { ok:false, msg:`[${segKey}] Invalid title match: "${title}" champ (${holder}) is not in the match.` };
        }
      }

      if (entry.type === 'tag') {
        if (!Array.isArray(holder)) {
          return { ok:false, msg:`[${segKey}] "${title}" is a singles title. Can't be defended in a tag match.` };
        }
        const teamA = (entry.teams?.[0]||[]).filter(Boolean);
        const teamB = (entry.teams?.[1]||[]).filter(Boolean);
        if (!sameSet2(holder, teamA) && !sameSet2(holder, teamB)) {
          return { ok:false, msg:`[${segKey}] Invalid tag title match: champs (${holder.join(' & ')}) are not one of the teams.` };
        }
      }
    }

    return { ok:true };
  }

  const simBtn = el('button', { text: 'Save Booking & Go To Results' });
  simBtn.onclick = () => {
    try {
      const my = byBrand(state, state.brand);
      const booking = {};

      for (const seg of SEGMENTS) {
        if (seg.type === 'promo') {
          const v = val(`${seg.key}_Promo`);
          if (!v) { warn.textContent = `[${seg.key}] missing promo.`; return; }
          booking[seg.key] = { type: 'promo', speaker: v };

        } else if (seg.type === 'tag') {
          const picks = [`${seg.key}_A1`, `${seg.key}_A2`, `${seg.key}_B1`, `${seg.key}_B2`].map(id => val(id));
          if (picks.some(v => !v)) { warn.textContent = `[${seg.key}] needs four picks.`; return; }
          if (picks.some(n => (my.find(w => w.name === n)?.injuryWeeks | 0) > 0)) { warn.textContent = "You selected an injured wrestler."; return; }

          const [a1, a2, b1, b2] = picks;
          const g = my.find(w => w.name === a1).gender;
          if ([a2, b1, b2].some(n => my.find(w => w.name === n).gender !== g)) { warn.textContent = `[${seg.key}] teams must be same gender.`; return; }

          const outcome    = val(`${seg.key}_Outcome`);
          const finish     = val(`${seg.key}_Finish`);
          const direction  = val(`${seg.key}_Direction`) || 'clean';
          booking[seg.key] = { type: 'tag', teams: [[a1, a2], [b1, b2]], outcome, finish, direction };

        } else {
          const A = val(`${seg.key}_A`), B = val(`${seg.key}_B`);
          if (!A || !B) { warn.textContent = `[${seg.key}] needs two wrestlers.`; return; }
          if ((my.find(w => w.name === A)?.injuryWeeks | 0) > 0 || (my.find(w => w.name === B)?.injuryWeeks | 0) > 0) { warn.textContent = "You selected an injured wrestler."; return; }
          if (my.find(w => w.name === A).gender !== my.find(w => w.name === B).gender) { warn.textContent = `[${seg.key}] women vs women only.`; return; }

          const outcome    = val(`${seg.key}_Outcome`);
          const finish     = val(`${seg.key}_Finish`);
          const direction  = val(`${seg.key}_Direction`) || 'clean';
          booking[seg.key] = { type: 'singles', a: A, b: B, outcome, finish, direction };
        }

        if (seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key)) {
          const o = booking[seg.key].outcome || 'ENG';
          if (o !== 'NC') {
            const tOn = checked(`${seg.key}_isTitle`);
            if (tOn) {
              const t = val(`${seg.key}_title`);
              if (t) booking[seg.key].championship = t;
            }
          }
        }
      }

      const v1 = validateNoDoubleBookedMatches(booking);
      if (!v1.ok) { warn.textContent = v1.msg; return; }

      const v2 = validateTitleLegitimacy(booking);
      if (!v2.ok) { warn.textContent = v2.msg; return; }

      const payload = { seasonId: state._seasonId, week: state.week, brand: state.brand, booking };
      localStorage.setItem("wwf_booking_payload", JSON.stringify(payload));
      saveState(state);
      location.href = "./results.html";
    } catch (err) {
      console.error(err);
      warn.textContent = "Failed to save & navigate. See console.";
      if (window.__showBootError) window.__showBootError("Failed to save booking", err);
    }
  };

  c.appendChild(el('div', {}, simBtn, el('span', { text: ' ' }), warn));
  return c;

  function val(id) { const e = document.getElementById(id); return e ? e.value : null; }
  function checked(id) { const e = document.getElementById(id); return !!(e && e.checked); }
}

