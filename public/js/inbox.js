// public/js/inbox.js
// Inbox UI (renders messages and lets the user choose outcomes)
// ✅ STRICT single-player view: only show PlayerBrand + GLOBAL.
// ✅ Debug override: add ?all=1 to show EVERYTHING.

import { el } from './util.js';
import {boot, bootOrNull, saveState } from './engine.js';
import { headshotImg } from './engine.js';
import { applyEffects } from './engine/state_effects.js';
import {
  getSituationScreen,
  getSituationChoices,
  applySituationChoice,
  sanitizeInboxAll
} from './situations_ui.js';

const root = getRoot();
const SHOW_ALL = new URLSearchParams(location.search).has('all'); // ✅ debug override
init();

/* ------------------------------- boot ---------------------------------- */
function getRoot(){
  return document.getElementById('inbox-root') || (() => {
    const m = document.createElement('main');
    m.id = 'inbox-root';
    document.body.appendChild(m);
    return m;
  })();
}

function init(){
  try{
    const state = boot();
    if(!state){
      root.innerHTML = '';
      root.appendChild(el('div',{class:'card'}, el('div',{text:'No season yet. Start from Booking.'})));
      return;
    }

    if (!Array.isArray(state.inbox)) state.inbox = [];
    if (!Array.isArray(state.inboxAll)) state.inboxAll = [];

    const beforeAllLen = state.inboxAll.length;
    const beforeAllSample = state.inboxAll.slice(0, 3).map(m => ({
      week: m?.week, brand: m?.brand, title: m?.title, from: m?.from || m?.actor
    }));

    let sanitized = null;
    try {
      sanitized = sanitizeInboxAll(state.inboxAll);
    } catch (e) {
      console.error('[inbox] sanitizeInboxAll threw:', e);
      sanitized = state.inboxAll; // fail open
    }

    // 🚨 HARD GUARD: never allow sanitize to wipe a non-empty inboxAll
    if (beforeAllLen > 0 && Array.isArray(sanitized) && sanitized.length === 0) {
      console.error('[inbox] sanitizeInboxAll wiped inboxAll. Reverting.',
        { beforeAllLen, beforeAllSample }
      );
      // Keep original and continue; do not persist the wipe
      state.inboxAll = state.inboxAll;
    } else if (Array.isArray(sanitized)) {
      state.inboxAll = sanitized;
    }

    console.log('[inbox][init] after ensure/sanitize:',
      'inboxAll=', state.inboxAll.length,
      'inbox=', state.inbox.length,
      'playerBrand=', getPlayerBrand(state)
    );

    // Only save if we didn't just detect a wipe
    saveState(state);
    render(state);
  }catch(e){
    console.error(e);
    root.innerHTML = `<div class="card">Error loading inbox.</div>`;
  }
}

/* ----------------------------- brand helpers --------------------------- */
function normBrand(b){
  const s = String(b||'').toUpperCase();
  if (s === 'GLOBAL')      return 'GLOBAL';
  if (s === 'SD')          return 'SD';
  if (s.includes('SMACK')) return 'SD';
  if (s === 'RAW')         return 'RAW';
  if (s.includes('RAW'))   return 'RAW';
  return undefined;
}

function getPlayerBrand(state){
  const cand =
      state.playerBrand ||
      state.myBrand ||
      state.brand ||
      state.career?.brand ||
      localStorage.getItem('ui_last_brand');
  const norm = (cand||'RAW').toUpperCase();
  const b = (norm.includes('SMACK')) ? 'SD' : 'RAW';
  localStorage.setItem('ui_last_brand', b);
  return b;
}

function isVisibleToPlayer(msg, playerBrand){
  if (SHOW_ALL) return true; // ✅ debug override
  if (!msg || msg.visible === false) return false;

  const nb = normBrand(msg.brand);

  // 🔒 Safety net: legacy / sanitized messages without a brand should not vanish
  if (!nb) return true;

  if (nb === 'GLOBAL') return true;
  return nb === playerBrand;
}

/* ------------------------------- render -------------------------------- */
function render(state){
  root.innerHTML = '';

  const playerBrand = getPlayerBrand(state);

  const source = (Array.isArray(state.inboxAll) && state.inboxAll.length)
    ? state.inboxAll
    : (Array.isArray(state.inbox) ? state.inbox : []);

  const visible = source
    .filter(Boolean)
    .filter(m => isVisibleToPlayer(m, playerBrand));

  // 🔎 helpful diagnostics (won’t break anything)
  try{
    const all = (Array.isArray(state.inboxAll) ? state.inboxAll : []).filter(Boolean);
    const counts = all.reduce((acc,m)=>{ const b = normBrand(m.brand) || 'NONE'; acc[b]=(acc[b]||0)+1; return acc; }, {});
    console.log('[inbox] SHOW_ALL=', SHOW_ALL, 'playerBrand=', playerBrand, 'visible=', visible.length, 'inboxAll=', all.length, 'brandCounts=', counts);
  }catch{}

  // ── Promise tracker (shown above inbox, always) ──────────────────────
  const promiseCard = renderPromiseTracker(state, playerBrand);
  if (promiseCard) root.appendChild(promiseCard);

  const topCard = el('div',{class:'card'});

  // Header
  const headerRow = el('div',{});
  headerRow.style.display = 'flex';
  headerRow.style.alignItems = 'center';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.gap = '12px';

  const titleLeft = el('div',{});
  titleLeft.appendChild(el('h3',{text:`Inbox`}));
  const sub = el('div',{
    class:'sub',
    text:`Player brand: ${playerBrand === 'SD' ? 'SmackDown' : 'RAW'}${SHOW_ALL ? ' (SHOWING ALL BRANDS)' : ''}`
  });
  sub.style.opacity = '.75';
  sub.style.marginTop = '4px';
  titleLeft.appendChild(sub);
  headerRow.appendChild(titleLeft);

  topCard.appendChild(headerRow);

  if (visible.length === 0){
    topCard.appendChild(el('div',{class:'sub', text:'Nothing new right now.'}));
    if (!SHOW_ALL){
      topCard.appendChild(el('div',{
        class:'sub',
        text:'(Debug: add ?all=1 to the URL to show all brands.)'
      }));
      topCard.lastChild.style.opacity = '.6';
      topCard.lastChild.style.marginTop = '8px';
    }
    root.appendChild(topCard);
    return;
  }

  const unresolved = visible.filter(m => !m.resolved);
  const resolved   = visible.filter(m => m.resolved);

  const renderMsg = (m) => {
    const msg = el('div',{class:'card', style:{opacity: m.resolved ? .65 : 1}});

    /* ---------- header ---------- */
    const who = m.actor || m.from || 'Office';
    const fromRow = el('div',{});
    fromRow.style.display = 'flex';
    fromRow.style.alignItems = 'center';
    fromRow.style.gap = '8px';
    fromRow.style.marginBottom = '8px';

    const ava = headshotImg(who, { width:28, height:28, className:'avatar', alt: who });
    ava.onerror = () => ava.replaceWith(pill(initials(who)));

    fromRow.appendChild(ava);
    fromRow.appendChild(el('span',{text:'From:', style:{opacity:.7}}));
    fromRow.appendChild(el('a',{href:`/profile.html?name=${encodeURIComponent(who)}`, text:who}));

    if (m.week != null){
      const wk = pill(`Wk ${m.week}`); wk.style.marginLeft='auto'; fromRow.appendChild(wk);
    } else {
      fromRow.appendChild(el('span',{style:{marginLeft:'auto'}}));
    }

    const b = normBrand(m.brand) || playerBrand;
    const brandText = (b === 'GLOBAL') ? 'GLOBAL' : (b === 'SD' ? 'SmackDown' : 'RAW');
    fromRow.appendChild(pill(brandText));

    msg.appendChild(fromRow);

    if (m.title) msg.appendChild(el('strong',{text:m.title}));
    msg.appendChild(renderBodyWithRosterLinks(m.body || '', state));

    /* ---------- situation badge ---------- */
    if (m.type === 'situation' && m.situation?.key){
      const badge = pill(`Situation: ${m.situation.key.replace(/_/g,' ')}`);
      badge.style.marginTop = '6px';
      badge.style.opacity = '.85';
      msg.appendChild(badge);
    }

    /* ---------- actions ---------- */
    if (Array.isArray(m.actions) && m.actions.length){
      const row = el('div',{});
      row.style.display='flex';
      row.style.gap='8px';
      row.style.flexWrap='wrap';
      row.style.marginTop='8px';

      m.actions.forEach(a=>{
        const btn = el('button',{text:a.label || a.key});
        btn.onclick = () => {
          // 🔑 Intercept situations
          if (m.type === 'situation' && a.key === 'OPEN'){
            if (!isVisibleToPlayer(m, playerBrand)) return;
            openSituation(state, m);
            return;
          }

          const why = `Inbox: ${m.title || 'Message'} (${a.key})`;
          applyEffects(state, a.effects || [], { why, week: m.week ?? state.week });

          // persist resolution
          m.resolved = true;
          m.handled = true;
          m.choice = a.key;

          saveState(state);
          render(state);
        };
        row.appendChild(btn);
      });
      msg.appendChild(row);
    }

    if (m.resolved && m.choice){
      msg.appendChild(el('div',{text:`Resolved: ${m.choice}`, style:{opacity:.7, marginTop:'6px'}}));
    }

    return msg;
  };

  const addSection = (title, list) => {
    if (!list.length) return;
    topCard.appendChild(el('h4',{text:title}));
    list.forEach(m => topCard.appendChild(renderMsg(m)));
  };

  addSection('New', unresolved);
  addSection('History', resolved);
  root.appendChild(topCard);
}

/* ------------------------- SITUATION VIEW ------------------------------ */
function openSituation(state, m){
  root.innerHTML = '';

  // IMPORTANT:
  // Do NOT sanitize/reassign inboxAll during navigation.
  // Sanitization is done once at init. Reassigning here can break object identity
  // and lead to "empty inbox" illusions after backing out.

  const card = el('div',{class:'card'});
  card.appendChild(el('h3',{text:'Backstage Situation'}));

  let screen = null;
  let choices = [];

  try{
    screen = getSituationScreen(state, m) || null;
    choices = getSituationChoices(state, m) || [];
  }catch(e){
    console.error('[inbox] getSituationScreen/Choices failed:', e);
  }

  const titleText =
    (screen && screen.title) ||
    m.situation?.memory?.title ||
    m.title ||
    'Situation';

  const bodyText =
    (screen && screen.body) ||
    m.situation?.memory?.body ||
    m.body ||
    '';

  card.appendChild(el('div',{
    text: titleText,
    style:{fontWeight:'bold', marginBottom:'6px'}
  }));

  card.appendChild(el('div',{
    text: bodyText,
    style:{whiteSpace:'pre-wrap'}
  }));

  const cast = Array.isArray(m.situation?.memory?.names)
    ? m.situation.memory.names.filter(Boolean)
    : (Array.isArray(m.names) ? m.names.filter(Boolean) : []);

  if (cast.length){
    const chips = el('div',{});
    chips.style.display='flex';
    chips.style.gap='8px';
    chips.style.flexWrap='wrap';
    chips.style.marginTop='10px';
    cast.forEach(n=>chips.appendChild(nameChip(n)));
    card.appendChild(chips);
  }

  const row = el('div',{});
  row.style.display='flex';
  row.style.gap='8px';
  row.style.flexWrap='wrap';
  row.style.marginTop='12px';

  if (Array.isArray(choices) && choices.length){
    for (const c of choices){
      const btn = el('button',{ text: c.label || c.key });
      btn.onclick = () => {
        try{
          applySituationChoice(state, m, c.key);

          // 🔒 guarantee persistence of resolution flags (even if situations_ui forgets)
          if (m) {
            m.resolved = true;
            m.handled = true;
            m.choice = c.key;
          }
          if (m?.situation) {
            m.situation.resolved = true;
            m.situation.handled = true;
            m.situation.choice = c.key;
          }

          saveState(state);

          if (m?.resolved || m?.situation?.resolved) render(state);
          else openSituation(state, m);
        }catch(e){
          console.error('[inbox] applySituationChoice failed:', e);
          openSituation(state, m);
        }
      };
      row.appendChild(btn);
    }
  } else {
    card.appendChild(el('div',{
      text:'(No choices available for this situation.)',
      style:{opacity:.6, marginTop:'12px'}
    }));
  }

  card.appendChild(row);

  const back = el('button',{text:'Back to Inbox'});
  back.onclick = ()=>render(state);
  back.style.marginTop='12px';
  card.appendChild(back);

  root.appendChild(card);
}

/* ------------------------- helpers / UI bits --------------------------- */
function initials(name){
  const p=String(name||'').trim().split(/\s+/);
  return p.length===1?p[0].slice(0,2).toUpperCase():(p[0][0]+p[1][0]).toUpperCase();
}
function pill(text){
  const s=el('span',{text});
  s.style.border='1px solid rgba(255,255,255,.2)';
  s.style.borderRadius='999px';
  s.style.padding='3px 8px';
  s.style.fontSize='12px';
  return s;
}
function nameChip(n){
  const c=el('span',{});
  c.style.display='inline-flex';
  c.style.gap='6px';
  const img=headshotImg(n,{width:22,height:22});
  img.onerror=()=>img.replaceWith(pill(initials(n)));
  c.appendChild(img);
  c.appendChild(el('a',{href:`/profile.html?name=${encodeURIComponent(n)}`,text:n}));
  return c;
}
function renderBodyWithRosterLinks(text,state){
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let html=esc(String(text||''));
  const names=(state.roster||[]).map(w=>w.name).sort((a,b)=>b.length-a.length);
  for(const name of names){
    const safe=name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
    const re=new RegExp(`\\b(${safe})\\b`,'g');
    html=html.replace(re,`<a href="/profile.html?name=${encodeURIComponent(name)}">$1</a>`);
  }
  const d=document.createElement('div');
  d.innerHTML=html;
  return d;
}

/* ─────────────────── Promise tracker ─────────────────────────────── */
function effectSummary(eff) {
  if (!eff) return null;
  if (eff.kind === 'w' && eff.stat && eff.delta != null) {
    const sign = eff.delta > 0 ? '+' : '';
    return `${eff.name}: ${eff.stat} ${sign}${eff.delta}`;
  }
  if (eff.kind === 'state' && eff.stat) {
    const sign = (eff.delta || 0) > 0 ? '+' : '';
    return `${eff.stat} ${sign}${eff.delta || ''}`;
  }
  return null;
}

function renderPromiseTracker(state, playerBrand) {
  const week = state.week || 0;
  const open = (state.promises || []).filter(p =>
    p.open && (
      !p.brand ||
      normBrand(p.brand) === playerBrand ||
      (p.brand || '').toUpperCase() === 'GLOBAL'
    )
  );
  if (!open.length) return null;

  const sorted = open.slice().sort((a, b) => (a.dueWeek || 0) - (b.dueWeek || 0));

  const wrap = el('div', { class: 'card' });

  // Header
  const hdr = el('div', { class: 'pt-header' });
  hdr.appendChild(el('span', { class: 'pt-title', text: 'Open Commitments' }));
  hdr.appendChild(el('span', { class: 'pt-count', text: `${open.length} pending` }));
  wrap.appendChild(hdr);

  for (const p of sorted) {
    const weeksLeft = (p.dueWeek || 0) - week;
    const overdue = weeksLeft < 0;
    const urgent  = weeksLeft <= 1 && !overdue;

    const row = el('div', { class: `pt-row${overdue ? ' pt-overdue' : urgent ? ' pt-urgent' : ''}` });

    // Countdown badge
    const cntCls = overdue ? 'pt-badge pt-badge--overdue'
                 : urgent  ? 'pt-badge pt-badge--urgent'
                 :           'pt-badge';
    const cntText = overdue ? 'OVERDUE' : weeksLeft === 0 ? 'DUE NOW' : `${weeksLeft}w`;
    row.appendChild(el('span', { class: cntCls, text: cntText }));

    // Body
    const body = el('div', { class: 'pt-body' });
    const names = (p.names || []).filter(Boolean);
    const nameEl = el('div', { class: 'pt-names' });
    if (names.length) {
      names.forEach((n, i) => {
        if (i > 0) nameEl.appendChild(document.createTextNode(', '));
        const a = el('a', { href: `/profile.html?name=${encodeURIComponent(n)}`, text: n });
        nameEl.appendChild(a);
      });
    } else {
      nameEl.appendChild(el('span', { text: 'General commitment' }));
    }
    body.appendChild(nameEl);

    // Stakes
    const keepText  = effectSummary(p.onKeep);
    const breakText = effectSummary(p.onBreak);
    if (keepText || breakText) {
      const stakes = el('div', { class: 'pt-stakes' });
      if (keepText)  stakes.appendChild(el('span', { class: 'pt-keep',  text: 'Keep: ' + keepText  }));
      if (breakText) stakes.appendChild(el('span', { class: 'pt-break', text: 'Break: ' + breakText }));
      body.appendChild(stakes);
    }

    // Progress bar (weeks elapsed out of total)
    const total = Math.max(1, (p.dueWeek || 0) - (p.createdWeek || week - 1));
    const elapsed = total - Math.max(0, weeksLeft);
    const pct = Math.min(100, Math.round((elapsed / total) * 100));
    const bar = el('div', { class: 'pt-bar-track' });
    const fill = el('div', { class: `pt-bar-fill${overdue ? ' pt-bar--overdue' : urgent ? ' pt-bar--urgent' : ''}` });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    body.appendChild(bar);

    row.appendChild(body);
    wrap.appendChild(row);
  }

  // Inject styles once
  if (!document.getElementById('pt-styles')) {
    const style = document.createElement('style');
    style.id = 'pt-styles';
    style.textContent = `
      .pt-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .pt-title  { font-weight:900; font-size:14px; }
      .pt-count  { font-size:11px; opacity:.5; }

      .pt-row {
        display:grid; grid-template-columns:72px 1fr; gap:10px; align-items:start;
        padding:9px 10px; border-radius:10px; margin-bottom:7px;
        background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
      }
      .pt-row.pt-urgent  { border-color:rgba(255,160,40,.30); background:rgba(255,140,0,.05); }
      .pt-row.pt-overdue { border-color:rgba(255,60,60,.35);  background:rgba(255,40,40,.06); }

      .pt-badge {
        font-size:11px; font-weight:900; padding:4px 8px; border-radius:999px; text-align:center;
        background:rgba(120,160,255,.12); border:1px solid rgba(120,160,255,.25);
        align-self:center;
      }
      .pt-badge--urgent  { background:rgba(255,140,0,.16); border-color:rgba(255,140,0,.45); color:#ffb347; }
      .pt-badge--overdue { background:rgba(255,60,60,.18); border-color:rgba(255,60,60,.45);  color:#ff8080; }

      .pt-body  { display:flex; flex-direction:column; gap:4px; min-width:0; }
      .pt-names { font-size:13px; font-weight:700; }
      .pt-names a { color:inherit; text-decoration:underline; opacity:.9; }

      .pt-stakes { display:flex; gap:10px; flex-wrap:wrap; font-size:11px; }
      .pt-keep   { color:rgba(80,220,160,.9); }
      .pt-break  { color:rgba(255,100,100,.85); }

      .pt-bar-track { height:3px; border-radius:99px; background:rgba(255,255,255,.08); margin-top:2px; }
      .pt-bar-fill  { height:100%; border-radius:99px; background:rgba(120,160,255,.6); transition:width .3s; }
      .pt-bar-fill.pt-bar--urgent  { background:rgba(255,140,0,.7); }
      .pt-bar-fill.pt-bar--overdue { background:rgba(255,60,60,.7); }
    `;
    document.head.appendChild(style);
  }

  return wrap;
}
