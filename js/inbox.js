// public/js/inbox.js
// Inbox UI (renders messages and lets the user choose outcomes)

import { el, clamp } from "./util.js?v=1755554537";
import { loadState, ensureInitialised, saveState } from "./engine.js?v=1755554537";
import { RAW, SD } from "./util.js?v=1755554537";
import { headshotImg } from "./engine.js?v=1755554537";

const root = getRoot();
init();

/* ------------------------------- boot ---------------------------------- */
function getRoot(){
  return document.getElementById('inbox-root') || (() => {
    const m = document.createElement('main'); m.id = 'inbox-root'; document.body.appendChild(m); return m;
  })();
}

function init(){
  try{
    const state = loadState();
    if(!state){
      root.innerHTML = '';
      root.appendChild(el('div',{class:'card'}, el('div',{text:'No season yet. Start from Booking.'})));
      return;
    }
    ensureInitialised(state);
    if (!Array.isArray(state.inbox)) state.inbox = [];
    saveState(state);
    render(state);
  }catch(e){
    console.error(e);
    root.innerHTML = `<div class="card">Error loading inbox.</div>`;
  }
}

/* ------------------------------- render -------------------------------- */
function render(state){
  root.innerHTML = '';

  const inbox = Array.isArray(state.inbox) ? state.inbox : (state.inbox = []);
  saveState(state);

  const card = el('div',{class:'card'});
  card.appendChild(el('h3',{text:'Inbox'}));

  if (inbox.length === 0){
    card.appendChild(el('div',{class:'sub', text:'Nothing new right now.'}));
    root.appendChild(card);
    return;
  }

  const unresolved = inbox.filter(m => !m.resolved);
  const resolved   = inbox.filter(m => m.resolved);

  const renderMsg = (m) => {
    const msg = el('div',{class:'card', style:{opacity: m.resolved ? .65 : 1}});

    // ----- SENDER ROW (inline styles so it can't disappear) -----
    const who = m.actor || m.from || 'Vince McMahon';
    const fromRow = document.createElement('div');
    fromRow.style.display = 'flex';
    fromRow.style.alignItems = 'center';
    fromRow.style.gap = '8px';
    fromRow.style.marginBottom = '8px';

    const ava = headshotImg(who, { width:28, height:28, className:'avatar', alt: who });
    ava.onerror = () => {
      const badge = el('span',{
        style:{display:'inline-block', padding:'2px 6px', border:'1px solid rgba(255,255,255,.2)', borderRadius:'999px', fontSize:'12px', opacity:.9},
        text: initials(who)
      });
      ava.replaceWith(badge);
    };

    const label = el('span',{text:'From:'});
    label.style.opacity = '.75';

    const link = el('a', { href:`profile.html?name=${encodeURIComponent(who)}`, text: who });
    link.style.textDecoration = 'none';

    fromRow.appendChild(ava);
    fromRow.appendChild(label);
    fromRow.appendChild(link);

    if (m.date){
      const datePill = el('span',{text:m.date});
      datePill.style.border = '1px solid rgba(255,255,255,.2)';
      datePill.style.borderRadius = '999px';
      datePill.style.padding = '2px 8px';
      datePill.style.fontSize = '12px';
      datePill.style.marginLeft = '6px';
      fromRow.appendChild(datePill);
    }

    msg.appendChild(fromRow);
    // ------------------------------------------------------------

    // Title
    if (m.title) msg.appendChild(el('strong',{text:m.title}));

    // Body (auto-link any roster names; preserve line breaks)
    msg.appendChild(renderBodyWithRosterLinks(m.body || '', state));

    // Optional participant chips
    if (Array.isArray(m.names) && m.names.length){
      const chips = document.createElement('div');
      chips.style.display = 'flex';
      chips.style.gap = '8px';
      chips.style.flexWrap = 'wrap';
      chips.style.marginTop = '8px';
      m.names.forEach(n => chips.appendChild(nameChip(n)));
      msg.appendChild(chips);
    }

    // Effect preview (non-binding)
    const preview = previewEffects(m.effects || firstActionEffects(m) || []);
    if (preview) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.flexWrap = 'wrap';
      row.style.marginTop = '8px';

      const cap = pill('Will affect:');
      row.appendChild(cap);
      preview.forEach(x => row.appendChild(pill(x)));
      msg.appendChild(row);
    }

    // Actions / dismiss / status
    if (Array.isArray(m.actions) && m.actions.length){
      const actionsRow = document.createElement('div');
      actionsRow.style.display = 'flex';
      actionsRow.style.gap = '8px';
      actionsRow.style.flexWrap = 'wrap';
      actionsRow.style.marginTop = '8px';

      m.actions.forEach((a) => {
        const btn = el('button',{text:a.label || a.key});
        btn.onclick = () => {
          applyEffects(state, m, a.effects || []);
          m.resolved = true;
          m.choice = a.key || a.label;
          saveState(state);
          render(state);
        };
        actionsRow.appendChild(btn);
      });
      msg.appendChild(actionsRow);
    } else if (!m.resolved) {
      const dismiss = el('button',{text:'Dismiss'});
      dismiss.onclick = () => { m.resolved = true; saveState(state); render(state); };
      const row = document.createElement('div');
      row.style.marginTop = '8px';
      row.appendChild(dismiss);
      msg.appendChild(row);
    } else if (m.choice) {
      const sub = el('div',{text:`Resolved: ${m.choice}`});
      sub.style.opacity = '.75';
      sub.style.marginTop = '6px';
      msg.appendChild(sub);
    }

    return msg;
  };

  if (unresolved.length){
    const section = el('div',{}); section.appendChild(el('h4',{text:'New'}));
    unresolved.forEach(m => section.appendChild(renderMsg(m)));
    card.appendChild(section);
  }

  if (resolved.length){
    const section = el('div',{style:{marginTop:'10px'}}); section.appendChild(el('h4',{text:'History'}));
    resolved.forEach(m => section.appendChild(renderMsg(m)));
    card.appendChild(section);
  }

  root.appendChild(card);
}

/* ------------------------- helpers / UI bits --------------------------- */
function initials(name){
  const parts = String(name||'').trim().split(/\s+/);
  if (!parts.length) return '??';
  if (parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function pill(text){
  const s = el('span',{text});
  s.style.display = 'inline-block';
  s.style.padding = '3px 8px';
  s.style.borderRadius = '999px';
  s.style.border = '1px solid rgba(255,255,255,.2)';
  s.style.fontSize = '12px';
  return s;
}

function nameChip(n, cls=''){
  const c = document.createElement('span');
  c.style.display = 'inline-flex';
  c.style.alignItems = 'center';
  c.style.gap = '6px';
  c.style.padding = '4px 10px';
  c.style.borderRadius = '999px';
  c.style.border = '1px solid rgba(255,255,255,.15)';
  c.style.background = 'rgba(255,255,255,.06)';

  const img = headshotImg(n, { width:22, height:22, className:'avatar', alt:n });
  img.onerror = () => { img.replaceWith(pill(initials(n))); };
  c.appendChild(img);

  const a = el('a',{href:`profile.html?name=${encodeURIComponent(n)}`, text:n});
  c.appendChild(a);
  return c;
}

function firstActionEffects(m){
  if (Array.isArray(m.actions) && m.actions.length) return m.actions[0].effects || [];
  return null;
}

/* -------------------- linkify roster names in body --------------------- */
function renderBodyWithRosterLinks(text, state){
  const esc = s => s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');

  let html = esc(String(text || ''));

  const names = (state.roster || []).map(w => w.name).sort((a,b) => b.length - a.length);
  if (names.length){
    const boundary = '(^|[^\\w’\'])';
    const tail     = '($|[^\\w’\'])';
    for (const name of names){
      const safe = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`${boundary}(${safe})${tail}`, 'g');
      html = html.replace(re, (_, pre, cap, post) => {
        const url = `profile.html?name=${encodeURIComponent(cap)}`;
        return `${pre}<a href="${url}">${cap}</a>${post}`;
      });
    }
  }

  const node = document.createElement('div');
  node.style.whiteSpace = 'pre-wrap';
  node.innerHTML = html;
  return node;
}

/* -------------------- effect preview (non-binding) --------------------- */
function previewEffects(effects){
  if (!Array.isArray(effects) || effects.length===0) return null;
  const chips = [];
  for (const ef of effects){
    if (ef.kind === 'w'){
      const stat = ef.stat?.replace(/([A-Z])/g,' $1') || 'Stat';
      const d = ef.delta || 0;
      if (ef.name === '*actor') chips.push(`${stat} ${d>0?'+':''}${d} (actor)`);
      else if (ef.name) chips.push(`${ef.name}: ${stat} ${d>0?'+':''}${d}`);
    } else if (ef.kind === 'injury'){
      chips.push(`${ef.name}: injury ${ef.weeks||0}w`);
    } else if (ef.kind === 'fatigue'){
      chips.push(`${ef.name}: fatigue ${ef.delta>0?'+':''}${ef.delta||0}`);
    } else if (ef.kind === 'brand'){
      chips.push(`${ef.name}: → ${ef.to}`);
    } else if (ef.kind === 'rel'){
      chips.push(`Rel: ${ef.a} ↔ ${ef.b} ${ef.delta>0?'+':''}${ef.delta||0}`);
    } else if (ef.kind === 'mentorship'){
      const d = ef.delta || {};
      const parts = Object.entries(d).map(([k,v])=>`${labelFor(k)} ${v>0?'+':''}${v}`);
      if (ef.name) chips.push(`${ef.name}: ${parts.join(' · ')}`);
    } else if (ef.kind === 'titlePrestige'){
      const bump = ef.marquee ? '+3/+3/+1' : '+2/+2/+1';
      chips.push(`${ef.name}: Title prestige ${bump}`);
    }
  }
  return chips.length ? chips : null;
}

function labelFor(k){
  switch(k){
    case 'starpower': return 'Star Power';
    case 'reputation': return 'Reputation';
    case 'consistency': return 'Consistency';
    case 'momentum': return 'Momentum';
    case 'ringSafety': return 'Ring Safety';
    default: return k;
  }
}

/* ---------------- effect executor (UI-side) ---------------- */
function applyEffects(state, message, effects){
  const byName = (name) => state.roster.find(w => w.name === name);
  const c = (n,min=0,max=99)=> clamp(n,min,max);

  for(const ef of (effects||[])){
    if(ef.kind === 'w'){
      const name = ef.name === '*actor' ? (message.actor || message.from) : ef.name;
      const w = byName(name); if(!w) continue;
      const v = Math.round((w[ef.stat] ?? 60) + (ef.delta||0));
      w[ef.stat] = c(v, ef.min ?? 0, ef.max ?? 99);

    } else if(ef.kind === 'injury'){
      const w = byName(ef.name); if(!w) continue;
      w.injuryWeeks = Math.max(w.injuryWeeks||0, ef.weeks||0);

    } else if(ef.kind === 'fatigue'){
      const w = byName(ef.name); if(!w) continue;
      w.fatigue = c((w.fatigue||0) + (ef.delta||0), 0, 100);

    } else if(ef.kind === 'brand'){
      const w = byName(ef.name); if(!w) continue;
      if (ef.to===RAW || ef.to===SD) w.brand = ef.to;

    } else if(ef.kind === 'rel'){
      state.relationships = state.relationships || [];
      const i = state.relationships.findIndex(x =>
        (x.a===ef.a && x.b===ef.b) || (x.a===ef.b && x.b===ef.a)
      );
      if(i>=0) state.relationships[i].v = (state.relationships[i].v||0) + (ef.delta||0);
      else state.relationships.push({ a:ef.a, b:ef.b, v:(ef.delta||0) });

    } else if (ef.kind === 'mentorship'){
      const w = byName(ef.name); if(!w) continue;
      const deltas = ef.delta || {};
      for (const [stat, inc] of Object.entries(deltas)){
        const min = (stat === 'fatigue') ? 0 : 0;
        const max = (stat === 'fatigue') ? 100 : 99;
        w[stat] = c(Math.round((w[stat] ?? (stat==='fatigue'?0:60)) + (inc||0)), min, max);
      }

    } else if (ef.kind === 'titlePrestige'){
      const w = byName(ef.name); if(!w) continue;
      const marquee = !!ef.marquee;
      const incSP  = marquee ? 3 : 2;
      const incREP = marquee ? 3 : 2;
      const incCON = 1;
      w.starpower   = c((w.starpower ?? 60) + incSP, 1, 99);
      w.reputation  = c((w.reputation ?? 60) + incREP, 1, 99);
      w.consistency = c((w.consistency ?? 60) + incCON, 1, 99);
    }
  }
}
