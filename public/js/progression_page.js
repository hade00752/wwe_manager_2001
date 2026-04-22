// js/progression_page.js
import { el, clamp } from './util.js';
import {boot, , headshotImg, saveState } from './engine.js';
import { ATTR_KEYS } from './engine/attr_ledger.js';

function getRoot(){
  return document.getElementById('prog-root') || (() => {
    const m = document.createElement('main'); m.id='prog-root'; document.body.appendChild(m); return m;
  })();
}

function numOr(v, fb){ const n = Number(v); return Number.isFinite(n) ? n : fb; }

const DEFAULT_ATTRS = ['momentum','morale','reputation','starpower'];

function weeksSorted(state){
  const h = state.attrHistory || {};
  return Object.keys(h).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
}

function getVal(state, week, name, attr){
  return state.attrHistory?.[week]?.[name]?.values?.[attr];
}

function getLedger(state, week, name){
  return state.attrLedger?.[week]?.[name] || [];
}

function labelForAttr(k){
  const map = {
    workrate:'Work Rate', psychology:'Psychology', charisma:'Charisma', mic:'Mic',
    chemistry:'Chemistry', starpower:'Star Power', reputation:'Reputation', likeability:'Likeability',
    consistency:'Consistency', momentum:'Momentum', morale:'Morale', stamina:'Stamina', durability:'Durability',
    strengthPower:'Strength/Power', agility:'Agility', athleticism:'Athleticism', ringSafety:'Ring Safety', fatigue:'Fatigue'
  };
  return map[k] || k;
}

function makeSelect(options, value){
  const s = document.createElement('select');
  for (const o of options){
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    s.appendChild(opt);
  }
  s.value = value ?? '';
  return s;
}

function makeCheckList(keys, selectedSet, onChange){
  const wrap = el('div', { class:'prog-attrs' });
  keys.forEach(k=>{
    const row = el('label', { class:'prog-attr' });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedSet.has(k);
    cb.onchange = () => { onChange(k, cb.checked); };
    row.appendChild(cb);
    row.appendChild(el('span', { text: labelForAttr(k) }));
    wrap.appendChild(row);
  });
  return wrap;
}

/* -------------------- VS HEADER (big portraits) -------------------- */
function makeVsHeader(){
  const wrap = el('div', { class: 'prog-vs' });

  const sideA = el('div', { class: 'prog-vs-side a' });
  const imgA  = el('div', { class: 'prog-vs-img', id:'prog-vs-img-a' });
  const metaA = el('div', { class: 'prog-vs-meta' },
    el('div', { class:'prog-vs-name', id:'prog-vs-name-a', text:'—' }),
    el('div', { class:'prog-vs-sub',  text:'Wrestler A' })
  );
  sideA.appendChild(imgA);
  sideA.appendChild(metaA);

  const mid = el('div', { class:'prog-vs-mid' },
    el('div', { class:'vs', text:'VS' }),
    el('div', { class:'hint', text:'Compare progression' })
  );

  const sideB = el('div', { class: 'prog-vs-side b right' });
  const metaB = el('div', { class: 'prog-vs-meta' },
    el('div', { class:'prog-vs-name', id:'prog-vs-name-b', text:'—' }),
    el('div', { class:'prog-vs-sub',  text:'Compare (B)' })
  );
  const imgB  = el('div', { class: 'prog-vs-img', id:'prog-vs-img-b' });
  sideB.appendChild(metaB);
  sideB.appendChild(imgB);

  wrap.appendChild(sideA);
  wrap.appendChild(mid);
  wrap.appendChild(sideB);

  return wrap;
}

function setVsSide(which, name){
  const nameEl = document.getElementById(which === 'a' ? 'prog-vs-name-a' : 'prog-vs-name-b');
  const imgEl  = document.getElementById(which === 'a' ? 'prog-vs-img-a'  : 'prog-vs-img-b');

  if (!nameEl || !imgEl) return;

  nameEl.textContent = name || (which === 'a' ? '—' : '—');

  imgEl.innerHTML = '';
  if (!name){
    // placeholder
    imgEl.appendChild(el('div', { text: which.toUpperCase() }));
    return;
  }

  // Use existing headshot helper (handles URLs / fallbacks in your engine)
  const img = headshotImg(name, { width: 76, height: 76 });
  imgEl.appendChild(img);
}

/* -------------------- SVG line chart (two wrestlers overlay) -------------------- */
function renderChart({ weeks, seriesA, seriesB, attrs, onPickWeek }){
  const W = 980, H = 360;
  const padL = 52, padR = 18, padT = 18, padB = 46;

  // gather values
  let minV = Infinity, maxV = -Infinity;
  for (const a of attrs){
    for (const w of weeks){
      const va = seriesA?.[a]?.[w];
      const vb = seriesB?.[a]?.[w];
      if (va != null) { minV = Math.min(minV, va); maxV = Math.max(maxV, va); }
      if (vb != null) { minV = Math.min(minV, vb); maxV = Math.max(maxV, vb); }
    }
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)){
    minV = 0; maxV = 100;
  }
  // Nice bounds
  const span = Math.max(1, maxV - minV);
  minV = Math.floor(minV - span*0.08);
  maxV = Math.ceil(maxV + span*0.08);

  const xOf = (i)=> padL + (i/(Math.max(1, weeks.length-1))) * (W-padL-padR);
  const yOf = (v)=> padT + (1 - ((v - minV)/(maxV-minV || 1))) * (H-padT-padB);

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('prog-chart');

  // grid
  const grid = (y, text)=>{
    const line = document.createElementNS(svg.namespaceURI,'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W-padR);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('class','grid');
    svg.appendChild(line);

    const t = document.createElementNS(svg.namespaceURI,'text');
    t.setAttribute('x', 8); t.setAttribute('y', y+4);
    t.setAttribute('class','axisText');
    t.textContent = text;
    svg.appendChild(t);
  };

  const ticks = 5;
  for (let i=0;i<=ticks;i++){
    const v = minV + (i/ticks)*(maxV-minV);
    grid(yOf(v), String(Math.round(v)));
  }

  // x labels (sparse)
  for (let i=0;i<weeks.length;i++){
    if (weeks.length > 14 && i % 3 !== 0 && i !== weeks.length-1) continue;
    const x = xOf(i);
    const t = document.createElementNS(svg.namespaceURI,'text');
    t.setAttribute('x', x);
    t.setAttribute('y', H-18);
    t.setAttribute('text-anchor','middle');
    t.setAttribute('class','axisText');
    t.textContent = `W${weeks[i]}`;
    svg.appendChild(t);
  }

  function pathFor(points){
    let d = '';
    points.forEach((p, idx)=>{
      const cmd = idx===0 ? 'M' : 'L';
      d += `${cmd}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    });
    return d.trim();
  }

  let attrIdx = 0;
  for (const attr of attrs){
    const ptsA = [];
    const ptsB = [];

    for (let i=0;i<weeks.length;i++){
      const w = weeks[i];
      const va = seriesA?.[attr]?.[w];
      const vb = seriesB?.[attr]?.[w];

      if (va != null) ptsA.push({ x:xOf(i), y:yOf(va), week:w, val:va });
      if (vb != null) ptsB.push({ x:xOf(i), y:yOf(vb), week:w, val:vb });
    }

    const group = document.createElementNS(svg.namespaceURI,'g');
    group.setAttribute('class', `attr attr-${attrIdx % 6}`);

    // Lines
    if (ptsA.length >= 2){
      const p = document.createElementNS(svg.namespaceURI,'path');
      p.setAttribute('d', pathFor(ptsA));
      p.setAttribute('class', 'line lineA');
      group.appendChild(p);
    }
    if (ptsB.length >= 2){
      const p = document.createElementNS(svg.namespaceURI,'path');
      p.setAttribute('d', pathFor(ptsB));
      p.setAttribute('class', 'line lineB');
      group.appendChild(p);
    }

    // Points (A and B separately, so they can be colored)
    for (let i=0;i<weeks.length;i++){
      const week = weeks[i];
      const x = xOf(i);

      const a = seriesA?.[attr]?.[week];
      const b = seriesB?.[attr]?.[week];

      if (a != null){
        const cA = document.createElementNS(svg.namespaceURI,'circle');
        cA.setAttribute('cx', x);
        cA.setAttribute('cy', yOf(a));
        cA.setAttribute('r', 3.4);
        cA.setAttribute('class', 'pt ptA');
        cA.addEventListener('click', ()=> onPickWeek && onPickWeek(week));
        // tooltip
        const t = document.createElementNS(svg.namespaceURI,'title');
        t.textContent = `A • ${labelForAttr(attr)} • W${week}: ${a}`;
        cA.appendChild(t);
        group.appendChild(cA);
      }

      if (b != null){
        const cB = document.createElementNS(svg.namespaceURI,'circle');
        cB.setAttribute('cx', x);
        cB.setAttribute('cy', yOf(b));
        cB.setAttribute('r', 3.4);
        cB.setAttribute('class', 'pt ptB');
        cB.addEventListener('click', ()=> onPickWeek && onPickWeek(week));
        const t = document.createElementNS(svg.namespaceURI,'title');
        t.textContent = `B • ${labelForAttr(attr)} • W${week}: ${b}`;
        cB.appendChild(t);
        group.appendChild(cB);
      }
    }

    svg.appendChild(group);
    attrIdx++;
  }

  return svg;
}

function init(){
  const root = getRoot();
  const state = boot();
  if (!state){ root.innerHTML=''; root.appendChild(el('div',{text:'No season found.'})); return; }

  const roster = (state.roster || []).filter(Boolean).map(w=>w.name).sort((a,b)=>a.localeCompare(b));
  const weeks = weeksSorted(state);

  if (!weeks.length){
    root.innerHTML='';
    root.appendChild(el('div',{class:'pf-wrap'},
      el('h2',{text:'Progression'}),
      el('div',{class:'pf-empty', text:'No attrHistory found yet. Run at least one show after installing weekly snapshots.'})
    ));
    return;
  }

  const saved = state.uiProgression || {};
  const pickA0 = saved.a || roster[0] || '';
  const pickB0 = saved.b || '';
  const selectedAttrs = new Set(Array.isArray(saved.attrs) && saved.attrs.length ? saved.attrs : DEFAULT_ATTRS);
  let pickedWeek = saved.week || weeks[weeks.length-1];

  const wrap = el('div',{class:'pf-wrap'});
  wrap.appendChild(el('h2',{class:'pf-name', text:'Progression'}));

  // VS header (big portraits)
  const vsHeader = makeVsHeader();
  wrap.appendChild(vsHeader);

  // Top controls
  const controls = el('div',{class:'prog-controls'});

  const selA = makeSelect(roster.map(n=>({value:n,label:n})), pickA0);
  const selB = makeSelect([{value:'',label:'(no comparison)'}].concat(roster.map(n=>({value:n,label:n}))), pickB0);

  const weekMin = weeks[0];
  const weekMax = weeks[weeks.length-1];
  const weekSlider = document.createElement('input');
  weekSlider.type = 'range';
  weekSlider.min = String(weekMin);
  weekSlider.max = String(weekMax);
  weekSlider.step = '1';
  weekSlider.value = String(clamp(numOr(pickedWeek, weekMax), weekMin, weekMax));

  const weekLabel = el('div',{class:'prog-weeklbl', text:`Selected week: W${weekSlider.value}`});
  weekSlider.oninput = ()=>{
    pickedWeek = Number(weekSlider.value);
    weekLabel.textContent = `Selected week: W${weekSlider.value}`;
    render();
  };

  const row1 = el('div',{class:'prog-row'},
    el('div',{class:'prog-field'}, el('div',{class:'prog-lbl',text:'Wrestler A'}), selA),
    el('div',{class:'prog-field'}, el('div',{class:'prog-lbl',text:'Compare (B)'}), selB),
    el('div',{class:'prog-field grow'}, el('div',{class:'prog-lbl',text:'Week'}), weekSlider, weekLabel)
  );

  const attrsList = makeCheckList(ATTR_KEYS, selectedAttrs, (k, on)=>{
    if (on) selectedAttrs.add(k); else selectedAttrs.delete(k);
    render();
  });

  controls.appendChild(row1);
  controls.appendChild(el('div',{class:'prog-lbl',text:'Attributes'}));
  controls.appendChild(attrsList);

  wrap.appendChild(controls);

  // Layout: chart + ledger
  const grid = el('div',{class:'prog-grid'});
  const chartBox = el('div',{class:'prog-panel'});
  const ledgerBox = el('div',{class:'prog-panel'});
  grid.appendChild(chartBox);
  grid.appendChild(ledgerBox);
  wrap.appendChild(grid);

  root.innerHTML='';
  root.appendChild(wrap);

  function buildSeries(name){
    if (!name) return null;
    const map = {};
    for (const a of selectedAttrs){
      map[a] = {};
      for (const w of weeks){
        const v = getVal(state, w, name, a);
        if (v != null) map[a][w] = Number(v);
      }
    }
    return map;
  }

  function renderLedgerFor(name, week){
    const box = el('div');
    box.appendChild(el('div',{class:'prog-ledger-title', text: name ? `${name} — Week ${week}` : 'Ledger'}));

    if (!name){
      box.appendChild(el('div',{class:'pf-empty', text:'Pick a wrestler.'}));
      return box;
    }

    const items = getLedger(state, week, name);
    if (!items.length){
      box.appendChild(el('div',{class:'pf-empty', text:'No ledger entries logged for this week.'}));
      return box;
    }

    // Group by attr
    const by = new Map();
    for (const it of items){
      if (!it || !it.attr) continue;
      const arr = by.get(it.attr) || [];
      arr.push(it);
      by.set(it.attr, arr);
    }

    for (const [attr, arr] of by.entries()){
      const h = el('div',{class:'prog-ledger-attr', text: labelForAttr(attr)});
      box.appendChild(h);

      arr.forEach(it=>{
        const sign = it.delta > 0 ? '+' : '';
        const line = el('div',{class:'prog-ledger-item'});
        line.appendChild(el('span',{class:'prog-ledger-d', text:`${sign}${it.delta}`}));
        line.appendChild(el('span',{class:'prog-ledger-why', text: it.why || '—'}));
        box.appendChild(line);
      });
    }

    return box;
  }

  function render(){
    const a = selA.value;
    const b = selB.value;

    // persist UI selection
    state.uiProgression = { a, b, attrs: [...selectedAttrs], week: pickedWeek };
    saveState(state);

    // Update VS header portraits/names
    setVsSide('a', a);
    setVsSide('b', b || '');

    chartBox.innerHTML='';
    ledgerBox.innerHTML='';

    const seriesA = buildSeries(a);
    const seriesB = b ? buildSeries(b) : null;

    const attrs = [...selectedAttrs];
    if (!attrs.length){
      chartBox.appendChild(el('div',{class:'pf-empty', text:'Select at least one attribute.'}));
    } else {
      const svg = renderChart({
        weeks,
        seriesA,
        seriesB,
        attrs,
        onPickWeek: (w)=>{
          pickedWeek = w;
          weekSlider.value = String(w);
          weekLabel.textContent = `Selected week: W${w}`;
          render();
        }
      });
      chartBox.appendChild(svg);

      // legend (A/B color-coded)
      const legend = el('div',{class:'prog-legend'});
      legend.appendChild(el('span',{class:'pill a'},
        el('span',{class:'dot a'}), el('span',{text:`A: ${a}`})
      ));
      if (b) {
        legend.appendChild(el('span',{class:'pill b'},
          el('span',{class:'dot b'}), el('span',{text:`B: ${b}`})
        ));
      }
      legend.appendChild(el('span',{class:'pill', text:`Click a point to inspect week`}));
      chartBox.appendChild(legend);
    }

    const ledWrap = el('div');
    ledWrap.appendChild(renderLedgerFor(a, pickedWeek));
    if (b) {
      ledWrap.appendChild(el('hr',{class:'prog-hr'}));
      ledWrap.appendChild(renderLedgerFor(b, pickedWeek));
    }
    ledgerBox.appendChild(ledWrap);
  }

  selA.onchange = render;
  selB.onchange = render;

  render();
}

init();
