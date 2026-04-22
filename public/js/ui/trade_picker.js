// public/js/ui/trade_picker.js
import { el, clamp } from '../util.js';
import { headshotImg } from '../engine/helpers.js';

// Local overall (same as profile/trades)
function overallOf(w){
  if (!w) return 0;
  const promoLike = ((w?.charisma ?? w?.promo ?? 60) + (w?.mic ?? w?.promo ?? 60)) / 2;
  const o =
    (w?.workrate ?? 60) * 0.30 +
    (w?.starpower ?? 60) * 0.25 +
    promoLike * 0.15 +
    (w?.momentum ?? 60) * 0.10 +
    (w?.psychology ?? 60) * 0.10 +
    (w?.consistency ?? 60) * 0.10;

  return clamp(Math.round(o), 1, 99);
}

function getContractAnnual(w){
  // prefer canonical field
  const v = w?.contractAnnual ?? w?.contract ?? w?.salary ?? w?.contractValue ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${Math.round(x / 1000)}k`;
  return `$${x.toLocaleString()}`;
}

function initialAvatarText(name){
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ensureStyles(){
  if (document.getElementById('trade-picker-styles')) return;

  const s = document.createElement('style');
  s.id = 'trade-picker-styles';
  s.textContent = `
  .tp-overlay{
    position:fixed; inset:0; z-index:9999;
    background:rgba(0,0,0,.58);
    backdrop-filter: blur(8px);
    display:grid; place-items:center;
  }
  .tp-panel{
    width:min(980px, calc(100vw - 28px));
    height:min(78vh, 720px);
    border-radius:18px;
    background: rgba(18,18,24,.92);
    box-shadow: 0 20px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.10) inset;
    overflow:hidden;
    display:grid;
    grid-template-rows:auto auto 1fr auto;
  }
  .tp-top{
    padding:14px 16px 10px;
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .tp-title{ font-size:14px; color:rgba(255,255,255,.88); font-weight:700; letter-spacing:.3px; }
  .tp-close{
    border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.06);
    color:rgba(255,255,255,.86);
    border-radius:10px;
    padding:7px 10px;
    cursor:pointer;
  }
  .tp-filters{
    padding:10px 16px;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  }
  .tp-search{
    flex:1 1 240px;
    background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.10);
    color:rgba(255,255,255,.90);
    border-radius:12px;
    padding:10px 12px;
    outline:none;
  }
  .tp-pill{
    padding:7px 10px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.06);
    color:rgba(255,255,255,.86);
    font-size:12px;
    cursor:pointer;
    user-select:none;
  }
  .tp-pill.on{
    border-color: rgba(140,160,255,.55);
    background: rgba(140,160,255,.16);
  }
  .tp-list{
    padding: 0 10px 10px;
    overflow:auto;
  }
  .tp-row{
    display:grid;
    grid-template-columns: 54px 1fr auto auto;
    gap:12px;
    align-items:center;
    padding:10px 12px;
    margin:8px 6px;
    border-radius:14px;
    background: rgba(255,255,255,.03);
    box-shadow: 0 0 0 1px rgba(255,255,255,.07) inset;
    cursor:pointer;
  }
  .tp-row:hover{
    box-shadow: 0 0 0 1px rgba(140,160,255,.35) inset;
    background: rgba(140,160,255,.07);
  }
  .tp-ava{
    width:44px; height:44px; border-radius:12px;
    background: rgba(255,255,255,.06);
    overflow:hidden;
    display:grid; place-items:center;
    box-shadow: 0 0 0 1px rgba(255,255,255,.10) inset;
  }
  .tp-ava img{ width:44px; height:44px; object-fit:cover; display:block; }
  .tp-name{ font-weight:750; color:rgba(255,255,255,.92); }
  .tp-sub{ font-size:12px; color:rgba(255,255,255,.64); margin-top:2px; }
  .tp-metric{
    display:flex; flex-direction:column; align-items:flex-end;
    gap:2px;
    min-width:72px;
  }
  .tp-metric .k{ font-size:11px; color:rgba(255,255,255,.55); }
  .tp-metric .v{ font-weight:800; color:rgba(255,255,255,.92); }
  .tp-foot{
    padding:12px 16px;
    border-top: 1px solid rgba(255,255,255,.08);
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    color: rgba(255,255,255,.65);
    font-size:12px;
  }
  .tp-hint{ opacity:.85; }
  `;
  document.head.appendChild(s);
}

/**
 * openTradePicker({ state, brand, excludeNames, title, onPick })
 * brand: "RAW" | "SD" | null (null = any)
 */
export function openTradePicker({
  state,
  brand = null,
  excludeNames = [],
  title = 'Pick a wrestler',
  onPick = () => {}
} = {}){
  ensureStyles();

  const roster = Array.isArray(state?.roster) ? state.roster : [];
  const exclude = new Set((excludeNames || []).filter(Boolean).map(String));

  const basePool = roster
    .filter(w => w && !w.retired && Number(w.injuryWeeks || 0) === 0)
    .filter(w => !exclude.has(w.name))
    .filter(w => !brand ? true : String(w.brand).toUpperCase() === String(brand).toUpperCase());

  let mode = 'all'; // 'all' | 'men' | 'women'
  let q = '';

  const overlay = el('div', { class: 'tp-overlay' });
  const panel = el('div', { class: 'tp-panel' });

  const top = el('div', { class: 'tp-top' });
  top.appendChild(el('div', { class: 'tp-title', text: title }));
  const btnClose = el('button', { class: 'tp-close', text: 'Close' });
  top.appendChild(btnClose);

  const filters = el('div', { class: 'tp-filters' });
  const search = document.createElement('input');
  search.className = 'tp-search';
  search.placeholder = 'Search name…';
  search.autocomplete = 'off';

  const pillAll = el('div', { class: 'tp-pill on', text: 'All' });
  const pillMen = el('div', { class: 'tp-pill', text: 'Men' });
  const pillWomen = el('div', { class: 'tp-pill', text: 'Women' });

  filters.appendChild(search);
  filters.appendChild(pillAll);
  filters.appendChild(pillMen);
  filters.appendChild(pillWomen);

  const list = el('div', { class: 'tp-list' });

  const foot = el('div', { class: 'tp-foot' });
  const leftHint = el('div', { class: 'tp-hint', text: 'Click a row to select.' });
  const count = el('div', { text: '' });
  foot.appendChild(leftHint);
  foot.appendChild(count);

  panel.appendChild(top);
  panel.appendChild(filters);
  panel.appendChild(list);
  panel.appendChild(foot);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function setMode(m){
    mode = m;
    pillAll.classList.toggle('on', mode === 'all');
    pillMen.classList.toggle('on', mode === 'men');
    pillWomen.classList.toggle('on', mode === 'women');
    render();
  }

  function matches(w){
    if (mode === 'men' && w.gender !== 'M') return false;
    if (mode === 'women' && w.gender !== 'F') return false;
    if (q){
      const low = q.toLowerCase();
      if (!String(w.name || '').toLowerCase().includes(low)) return false;
    }
    return true;
  }

  function row(w){
    const ovr = overallOf(w);
    const annual = getContractAnnual(w);

    const rEl = el('div', { class: 'tp-row' });

    const ava = el('div', { class: 'tp-ava' });
    const img = headshotImg(w.name, { width: 44, height: 44, className: '', alt: w.name });
    img.onerror = () => {
      ava.innerHTML = '';
      ava.appendChild(el('div', { text: initialAvatarText(w.name) }));
    };
    ava.appendChild(img);

    const info = el('div');
    info.appendChild(el('div', { class: 'tp-name', text: w.name }));
    info.appendChild(
      el('div', {
        class: 'tp-sub',
        text: `${w.brand} • ${w.gender === 'F' ? 'Women' : 'Men'} • ${w.alignment || 'neutral'}`
      })
    );

    const m1 = el('div', { class: 'tp-metric' });
    m1.appendChild(el('div', { class: 'k', text: 'OVR' }));
    m1.appendChild(el('div', { class: 'v', text: String(ovr) }));

    const m2 = el('div', { class: 'tp-metric' });
    m2.appendChild(el('div', { class: 'k', text: 'Contract' }));
    m2.appendChild(el('div', { class: 'v', text: annual == null ? '—' : fmtMoney(annual) }));

    rEl.appendChild(ava);
    rEl.appendChild(info);
    rEl.appendChild(m1);
    rEl.appendChild(m2);

    rEl.onclick = () => { cleanup(); onPick(w); };
    return rEl;
  }

  function render(){
    list.innerHTML = '';
    const pool = basePool.filter(matches);

    pool.sort((a,b) => (overallOf(b) - overallOf(a)) || String(a.name).localeCompare(String(b.name)));

    for (const w of pool) list.appendChild(row(w));
    count.textContent = `${pool.length} available`;
  }

  function cleanup(){
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e){
    if (e.key === 'Escape') cleanup();
  }

  btnClose.onclick = cleanup;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  document.addEventListener('keydown', onKey);

  search.addEventListener('input', () => { q = search.value || ''; render(); });
  pillAll.onclick = () => setMode('all');
  pillMen.onclick = () => setMode('men');
  pillWomen.onclick = () => setMode('women');

  setTimeout(() => search.focus(), 0);
  render();

  return { close: cleanup };
}
