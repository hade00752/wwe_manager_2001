// public/js/ui/vs_picker.js
import { el } from '../util.js';
import { headshotImg } from '../engine.js';

const RADAR_STATS = [
  ['starpower', 'STAR'],
  ['workrate',  'WORK'],
  ['momentum',  'MOM'],
  ['psychology','PSY'],
  ['charisma',  'CHAR'],
  ['mic',       'MIC'],
];

const KEY_STATS = [
  ['overall',    'OVERALL'],
  ['starpower',  'STAR'],
  ['workrate',   'WORK'],
  ['momentum',   'MOM'],
  ['fatigue',    'FATIGUE'],
];

function clamp01(n){
  n = Number(n);
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function initials(name){
  const p = String(name || '').trim().split(/\s+/);
  return p.length === 1
    ? p[0].slice(0,2).toUpperCase()
    : (p[0][0] + p[1][0]).toUpperCase();
}

function normChampFlag(state, brand, name){
  const champs = state?.champs?.[brand];
  if (!champs || !name) return null;

  for (const [title, holder] of Object.entries(champs)) {
    if (!holder) continue;
    if (Array.isArray(holder)) {
      if (holder.includes(name)) return title;
    } else if (holder === name) {
      return title;
    }
  }
  return null;
}

function calcOverall(w){
  if (!w) return null;

  const keys = ['workrate','starpower','charisma','mic','psychology','consistency','momentum'];

  const vals = keys
    .map(k => Number(w?.[k]))
    .filter(n => Number.isFinite(n));

  if (!vals.length) return null;

  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  return Math.round(avg);
}

function statVal(w, key){
  if (!w) return '—';

  if (key === 'fatigue') {
    const v = w.fatigue ?? w.fatiguePct;
    return v == null ? '—' : String(Math.round(v));
  }

  if (key === 'overall') {
    const raw = w.overall;
    const v = (raw == null) ? calcOverall(w) : Number(raw);
    return v == null ? '—' : String(Math.round(Number(v) || 0));
  }

  const v = w[key];
  if (v == null) return '—';
  if (typeof v === 'number') return String(Math.round(v));
  return String(v);
}

function makePortrait(name){
  const img = headshotImg(name, {
    width: 512,
    height: 512,
    className: 'vs-portrait',
    alt: name,
    exts: ['webp','png','jpg','jpeg']
  });
  img.onerror = () => {
    img.replaceWith(el('div', { class:'vs-portrait vs-fallback', text: initials(name) }));
  };
  return img;
}

function makeEmptyPortrait(text='—'){
  return el('div', { class:'vs-portrait vs-fallback', text });
}

/* ------------------------------ Radar ------------------------------ */

function getNum(w, key){
  const n = Number(w?.[key]);
  return isFinite(n) ? n : 0;
}

function radarData(w){
  return RADAR_STATS.map(([k]) => clamp01(getNum(w,k) / 100));
}

function roundRectFill(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function drawRadarPoly(ctx, cx, cy, r, vals, fill, stroke){
  const N = vals.length;
  const angle0 = -Math.PI / 2;

  ctx.save();
  ctx.beginPath();
  for (let i=0;i<N;i++){
    const ang = angle0 + i*(Math.PI*2/N);
    const rr = r * vals[i];
    const x = cx + Math.cos(ang)*rr;
    const y = cy + Math.sin(ang)*rr;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stroke;
  for (let i=0;i<N;i++){
    const ang = angle0 + i*(Math.PI*2/N);
    const rr = r * vals[i];
    const x = cx + Math.cos(ang)*rr;
    const y = cy + Math.sin(ang)*rr;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

/* ✅ Radar now ALWAYS draws labels (even if no pick yet) */
function drawRadar(canvas, aW, bW){
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(10, Math.floor(rect.width));
  const H = Math.max(10, Math.floor(rect.height));

  canvas.width  = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, W, H);

  const cx = W/2, cy = H/2;
  const r  = Math.min(W,H) * 0.30;
  const N  = RADAR_STATS.length;
  const angle0 = -Math.PI / 2;

  // plate
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  roundRectFill(ctx, cx - r - 14, cy - r - 14, (r+14)*2, (r+14)*2, 12);
  ctx.restore();

  // rings
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  for (let ring=1; ring<=4; ring++){
    const rr = r*(ring/4);
    ctx.beginPath();
    for (let i=0;i<N;i++){
      const ang = angle0 + i*(Math.PI*2/N);
      const x = cx + Math.cos(ang)*rr;
      const y = cy + Math.sin(ang)*rr;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // spokes + labels (always)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '9px ui-sans-serif, system-ui, Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i=0;i<N;i++){
    const ang = angle0 + i*(Math.PI*2/N);
    const x = cx + Math.cos(ang)*r;
    const y = cy + Math.sin(ang)*r;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    const lab = RADAR_STATS[i][1];
    const lx = cx + Math.cos(ang)*(r + 11);
    const ly = cy + Math.sin(ang)*(r + 11);

    ctx.fillText(lab, lx, ly);
  }
  ctx.restore();

  const aVals = radarData(aW);
  const bVals = radarData(bW);

  if (aW?.name) drawRadarPoly(ctx, cx, cy, r, aVals, 'rgba(120,180,255,.22)', 'rgba(120,180,255,.75)');
  if (bW?.name) drawRadarPoly(ctx, cx, cy, r, bVals, 'rgba(255,110,110,.18)', 'rgba(255,110,110,.72)');
}

/* ------------------------------ Main ------------------------------ */

function wByName(list, name){
  if (!name) return null;
  return list.find(w => w?.name === name) || null;
}

function isRealOpponentName(list, n){
  return !!(n && list.some(w => w?.name === n));
}

function uniqNonEmpty(arr){
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function openVsPicker({
  state,
  brand,
  roster,

  selectedName = null,
  opponentName = null,

  /**
   * modes:
   *  - 'single' : pick one name (returns string)
   *  - 'pair'   : pick two names (returns {aName,bName})
   *  - 'slots'  : fill N slots in one modal (returns {names:[...]}), e.g. tag=4
   */
  mode = 'single',

  // slots mode
  slotCount = 4,
  slotNames = null,        // optional initial array length slotCount
  slotLabels = null,       // optional labels like ['A1','A2','B1','B2']
  allowDuplicates = false, // default false: hard guard

  sideLabelLeft = 'A',
  sideLabelRight = 'B',
  titleText = 'SELECT SUPERSTARS',
  onPick,
  onClose
}){
  const list = Array.isArray(roster) ? roster.slice() : [];
  if (!list.length) { onClose && onClose(); return; }

  // indices for roster browser (the "picker cursor")
  let idx = list.findIndex(w => w?.name === selectedName);
  if (idx < 0) idx = 0;

  let oppIdx = 0;
  if (opponentName) {
    const oi = list.findIndex(w => w?.name === opponentName);
    if (oi >= 0) oppIdx = oi;
  }

  // in pair mode, opponent is NOT locked (both sides are picks)
  const opponentLocked =
    (mode === 'pair') &&
    false;

  // focus for keyboard arrows in pair mode (L/R)
  let focusSide = 'L';

  // slots mode state
  const N = Math.max(1, Math.min(12, Number(slotCount || 4)));
  const labels =
    Array.isArray(slotLabels) && slotLabels.length >= N
      ? slotLabels.slice(0, N).map(x => String(x))
      : (N === 4 ? ['A1','A2','B1','B2'] : Array.from({length:N}, (_,i)=>`S${i+1}`));

  let slots = Array.isArray(slotNames) ? slotNames.slice(0, N) : Array(N).fill(null);
  while (slots.length < N) slots.push(null);

  let activeSlot = 0;

  const overlay = el('div', { class:'vs-overlay' });
  const frame   = el('div', { class:'vs-frame' });

  // layout decisions:
  // - solo: single mode with no real opponent -> one card only
  // - duel: pair mode (or single with opponent)
  // - slots: slots UI + roster browser
  const hasOpponent = isRealOpponentName(list, opponentName);
  const soloLayout = (mode === 'single' && !hasOpponent);

  const top = el('div', { class:'vs-top' },
    el('div', { class:'vs-title', text:titleText }),
    el('div', { class:'vs-hint', text:
      mode === 'slots'
        ? '← / → browse · ENTER assign · TAB slot · ESC back'
        : '← / → change · ENTER confirm · ESC back'
    })
  );

  const left  = el('div', { class:'vs-card vs-left' });
  const mid   = el('div', { class:'vs-mid' });
  const right = el('div', { class:'vs-card vs-right' });
  const bot   = el('div', { class:'vs-bottom' });

  // mid (VS + radar) only for duel/slots
  const vsWord = el('div', { class:'vs-vs', text:'VS' });
  const radarWrap = el('div', { class:'vs-radar-wrap' });
  const radar = document.createElement('canvas');
  radar.className = 'vs-radar';
  radarWrap.appendChild(radar);
  mid.append(vsWord, radarWrap);

  frame.append(top);

  if (mode === 'slots') {
    frame.append(left, mid, right, bot);
  } else if (soloLayout) {
    frame.append(left, bot);
  } else {
    frame.append(left, mid, right, bot);
  }

  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  // dropdowns (used for single/pair; slots uses roster browser DD on right)
  const leftDD = el('select', { class:'vs-dd' });
  list.forEach((w,i)=> leftDD.appendChild(el('option',{ value:String(i), text:w?.name })));
  leftDD.value = String(idx);
  leftDD.onchange = ()=>{ idx = Number(leftDD.value)||0; render(); };

  const rightDD = el('select', { class:'vs-dd' });
  list.forEach((w,i)=> rightDD.appendChild(el('option',{ value:String(i), text:w?.name })));
  rightDD.value = String(oppIdx);
  rightDD.onchange = ()=>{ oppIdx = Number(rightDD.value)||0; render(); };

  function renderCard(root, w, tag, accent, dropdownEl){
    root.innerHTML = '';
    root.appendChild(el('div', { class:`vs-tag ${accent}`, text:tag }));
    if (dropdownEl) root.appendChild(dropdownEl);

    const name = w?.name || '— Select —';
    root.appendChild(w?.name ? makePortrait(w.name) : makeEmptyPortrait());
    root.appendChild(el('div', { class:'vs-name', text:name }));

    const champ = (w?.name && state && brand)
      ? normChampFlag(state, brand, w.name)
      : null;

    root.appendChild(
      champ
        ? el('div', { class:`vs-champ ${accent}`, text:`${champ.toUpperCase()} CHAMPION` })
        : el('div', { class:'vs-champ muted', text:'—' })
    );

    const stats = el('div', { class:'vs-stats' });
    for (const [k,label] of KEY_STATS) {
      stats.appendChild(
        el('div', { class:'vs-stat' },
          el('div', { class:'k', text:label }),
          el('div', { class:`v ${accent}`, text:statVal(w,k) })
        )
      );
    }
    root.appendChild(stats);

    const overallNum = Number(w?.overall ?? calcOverall(w) ?? 0);
    const overallPct = Math.round(clamp01(overallNum / 100) * 100);

    root.appendChild(
      el('div', { class:'vs-meter' },
        el('div', { class:'m-lab', text:'0' }),
        el('div', { class:'m-bar' },
          el('div', { class:`m-fill ${accent}`, style:{ width:`${overallPct}%` } })
        ),
        el('div', { class:'m-lab', text:'100' })
      )
    );
  }

  function renderSlotsCard(){
    left.innerHTML = '';
    left.appendChild(el('div', { class:'vs-tag blue', text:'SLOTS' }));

    // grid container (uses existing CSS? if not, still renders stacked)
    const grid = el('div', { class:'vs-slots' });

    for (let i=0; i<N; i++){
      const nm = slots[i];
      const w = nm ? wByName(list, nm) : null;

      const item = el('button', {
        class: `vs-slot ${i===activeSlot ? 'active' : ''}`,
        type: 'button',
        onclick: ()=>{ activeSlot = i; render(); }
      });

      const lab = labels[i] || `S${i+1}`;
      item.appendChild(el('div', { class:'vs-slot-lab', text: lab }));

      const row = el('div', { class:'vs-slot-row' });
      row.appendChild(w?.name ? makePortrait(w.name) : makeEmptyPortrait(lab));
      row.appendChild(el('div', { class:'vs-slot-name', text: w?.name || '— Empty —' }));
      item.appendChild(row);

      // champ badge (if filled)
      if (w?.name) {
        const champ = (state && brand) ? normChampFlag(state, brand, w.name) : null;
        item.appendChild(
          champ
            ? el('div', { class:'vs-slot-champ', text:`${champ.toUpperCase()} CHAMP` })
            : el('div', { class:'vs-slot-champ muted', text:'—' })
        );
      }

      grid.appendChild(item);
    }

    left.appendChild(grid);

    // helper line
    const filled = slots.filter(Boolean).length;
    left.appendChild(el('div', { class:'vs-subhint', text:`Fill slots: ${filled}/${N} · Click a slot to edit` }));
  }

  function renderRosterBrowser(){
    // right side shows the roster cursor target
    rightDD.value = String(idx);
    rightDD.onchange = ()=>{ idx = Number(rightDD.value)||0; render(); };

    const w = list[idx] || null;
    renderCard(right, w, 'ROSTER', 'red', rightDD);
  }

  function renderSolo(){
    leftDD.value = String(idx);
    const pick = list[idx] || null;
    renderCard(left, pick, sideLabelLeft, 'blue', leftDD);

    bot.innerHTML = '';
    const nav = el('div', { class:'vs-nav' });

    const prev = el('button', { class:'vs-btn', text:'◀' });
    const next = el('button', { class:'vs-btn', text:'▶' });

    prev.onclick = ()=>{ idx = (idx-1+list.length)%list.length; render(); };
    next.onclick = ()=>{ idx = (idx+1)%list.length; render(); };

    const confirm = el('button', { class:'vs-btn vs-confirm', text:'CONFIRM' });
    confirm.onclick = ()=> doPick();

    const cancel = el('button', { class:'vs-btn', text:'CANCEL' });
    cancel.onclick = ()=> close(true);

    nav.append(prev, next, confirm, cancel);
    bot.appendChild(nav);
  }

  function renderDuel(){
    leftDD.value = String(idx);

    rightDD.disabled = opponentLocked;
    rightDD.value = String(oppIdx);

    const pick = list[idx] || null;
    const oppW = opponentLocked
      ? (wByName(list, opponentName) || null)
      : (list[oppIdx] || null);

    renderCard(left,  pick, sideLabelLeft,  'blue', leftDD);
    renderCard(right, oppW, sideLabelRight, 'red',  rightDD);

    requestAnimationFrame(()=> drawRadar(radar, pick, oppW));

    bot.innerHTML = '';
    const nav = el('div', { class:'vs-nav' });

    const prev = el('button', { class:'vs-btn', text:'◀' });
    const next = el('button', { class:'vs-btn', text:'▶' });

    prev.onclick = ()=> {
      if (mode === 'pair' && focusSide === 'R') oppIdx = (oppIdx-1+list.length)%list.length;
      else idx = (idx-1+list.length)%list.length;
      render();
    };

    next.onclick = ()=> {
      if (mode === 'pair' && focusSide === 'R') oppIdx = (oppIdx+1)%list.length;
      else idx = (idx+1)%list.length;
      render();
    };

    const confirm = el('button', { class:'vs-btn vs-confirm', text:'CONFIRM' });
    confirm.onclick = ()=> doPick();

    const cancel = el('button', { class:'vs-btn', text:'CANCEL' });
    cancel.onclick = ()=> close(true);

    nav.append(prev, next, confirm, cancel);
    bot.appendChild(nav);
  }

  function renderSlots(){
    renderSlotsCard();
    renderRosterBrowser();

    // compare active slot vs current roster pick on radar
    const slotW = slots[activeSlot] ? wByName(list, slots[activeSlot]) : null;
    const browseW = list[idx] || null;
    requestAnimationFrame(()=> drawRadar(radar, slotW, browseW));

    bot.innerHTML = '';
    const nav = el('div', { class:'vs-nav' });

    const prev = el('button', { class:'vs-btn', text:'◀' });
    const next = el('button', { class:'vs-btn', text:'▶' });

    prev.onclick = ()=>{ idx = (idx-1+list.length)%list.length; render(); };
    next.onclick = ()=>{ idx = (idx+1)%list.length; render(); };

    const assign = el('button', { class:'vs-btn vs-confirm', text:'ASSIGN' });
    assign.onclick = ()=> assignCurrentToSlot();

    const clear = el('button', { class:'vs-btn', text:'CLEAR SLOT' });
    clear.onclick = ()=>{ slots[activeSlot] = null; render(); };

    const done = el('button', { class:'vs-btn', text:'DONE' });
    done.disabled = slots.some(n => !String(n||'').trim());
    done.onclick = ()=> doPick();

    const cancel = el('button', { class:'vs-btn', text:'CANCEL' });
    cancel.onclick = ()=> close(true);

    nav.append(prev, next, assign, clear, done, cancel);
    bot.appendChild(nav);
  }

  function render(){
    if (mode === 'slots') return renderSlots();
    if (soloLayout) return renderSolo();
    return renderDuel();
  }

  function assignCurrentToSlot(){
    const w = list[idx] || null;
    if (!w?.name) return;

    const name = w.name;

    if (!allowDuplicates) {
      const used = new Set(slots.filter(Boolean));
      const alreadyUsed = used.has(name) && slots[activeSlot] !== name;
      if (alreadyUsed) return;
    }

    slots[activeSlot] = name;

    // advance to next empty slot
    for (let i=0; i<N; i++){
      const j = (activeSlot + 1 + i) % N;
      if (!slots[j]) { activeSlot = j; break; }
    }

    render();
  }

  // ✅ confirm behavior depends on mode
  // ✅ single mode returns STRING (w.name) so booking.js never breaks again
  function doPick(){
    if (mode === 'slots') {
      const names = slots.map(x => String(x||'').trim());
      if (names.some(n => !n)) return;

      if (!allowDuplicates) {
        const uniq = uniqNonEmpty(names);
        if (uniq.length !== names.length) return;
      }

      if (onPick) onPick({ names });
      close(false);
      return;
    }

    const a = list[Number(leftDD.value) || 0] || null;
    const b = list[Number(rightDD.value) || 0] || null;

    if (mode === 'pair') {
      const aName = a?.name || '';
      const bName = b?.name || '';
      if (!aName || !bName) return;
      if (!allowDuplicates && aName === bName) return;
      if (onPick) onPick({ aName, bName });
      close(false);
      return;
    }

    const w = a;
    if (!w || !w.name) return;

    if (onPick) onPick(w.name);
    close(false);
  }

  function close(fireOnClose){
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (fireOnClose && onClose) onClose();
  }

  function onKey(e){
    if (mode === 'slots') {
      if (e.key === 'Tab') {
        e.preventDefault();
        activeSlot = (activeSlot + 1) % N;
        render();
        return;
      }

      if (e.key === 'ArrowLeft'){
        idx = (idx-1+list.length)%list.length;
        render();
        return;
      }
      if (e.key === 'ArrowRight'){
        idx = (idx+1)%list.length;
        render();
        return;
      }
      if (e.key === 'Enter'){
        assignCurrentToSlot();
        return;
      }
      if (e.key === 'Escape'){
        close(true);
        return;
      }
      return;
    }

    if (e.key === 'Tab' && mode === 'pair') {
      e.preventDefault();
      focusSide = (focusSide === 'L') ? 'R' : 'L';
      render();
      return;
    }

    if (e.key === 'ArrowLeft'){
      if (mode === 'pair') {
        if (focusSide === 'R') oppIdx=(oppIdx-1+list.length)%list.length;
        else idx=(idx-1+list.length)%list.length;
      } else {
        idx=(idx-1+list.length)%list.length;
      }
      render();
    }
    else if (e.key === 'ArrowRight'){
      if (mode === 'pair') {
        if (focusSide === 'R') oppIdx=(oppIdx+1)%list.length;
        else idx=(idx+1)%list.length;
      } else {
        idx=(idx+1)%list.length;
      }
      render();
    }
    else if (e.key === 'Enter'){ doPick(); }
    else if (e.key === 'Escape'){ close(true); }
  }

  overlay.addEventListener('click', e=>{
    if (e.target === overlay) close(true);
  });

  // in pair mode, clicking inside left/right cards sets focus for arrows
  if (mode === 'pair') {
    left.addEventListener('mousedown', ()=>{ focusSide='L'; });
    right.addEventListener('mousedown', ()=>{ focusSide='R'; });
  }

  document.addEventListener('keydown', onKey);
  render();
}
