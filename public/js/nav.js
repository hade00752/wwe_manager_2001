// public/js/nav.js
// Collapsible sidenav with grouped submenus, active highlight, sim-date pill,
// hover prefetch, fade fix, bfcache fix, and PS2 "Just Bring It"-ish styling.
// PATCH: remove transparency (opaque nav + opaque items + darker overlay), fix import usage.

import { boot, bootOrNull, simDateString } from './engine.js';

/* ----------------------------- CONFIG ONLY ----------------------------- */
const MENU = [
  {
    label: 'Inbox',
    href:  '/inbox.html',
    children: [
      { label: 'All',        href: '/inbox.html#all' },
      { label: 'Praise',     href: '/inbox.html#praise' },
      { label: 'Complaints', href: '/inbox.html#complaints' },
      { label: 'Fallout',    href: '/inbox.html#fallout' },
    ]
  },
  {
    label: 'Booking',
    href:  '/booking.html',
    children: [
      { label: 'Weekly Card',  href: '/booking.html#card' },
      { label: 'PPV Builder',  href: '/booking.html#ppv' },
      { label: 'Titles',       href: '/booking.html#titles' },
      { label: 'Contenders',       href: '/contenders.html#contenders' },
    ]
  },
  {
    label: 'Results',
    href:  '/results.html',
    children: [
      { label: 'Show History',     href: '/results.html#shows' },
      { label: 'Ratings & Stats',  href: '/results.html#stats' },
    ]
  },
  {
    label: 'Roster',
    href:  '/roster.html',
    children: [
      { label: 'Profiles',   href: '/roster.html#profiles' },
      { label: 'Contracts',  href: '/roster.html#contracts' },
      { label: 'Social Groups', href: '/social_groups.html' },
      { label: 'Trades',        href: '/trades.html#trades' },
    ]
  },
  {
    label: 'Mentoring',
    href:  '/mentors.html',
    children: [
      { label: 'Pairs',        href: '/mentors.html#pairs' },
      { label: 'Progression',  href: '/progression.html#progression' },
    ]
  },
  {
    label: 'Main Menu/Exit',
    href:  '/index.html',
  }
];

/* ------------------------------ STYLES --------------------------------- */
(function injectNavStyles(){
  if (document.getElementById('global-nav-styles')) return;

  const s = document.createElement('style');
  s.id = 'global-nav-styles';

  s.textContent = `
    :root{
      --sidenav-width: 300px;

      /* Pull from your styles.css if present, else fall back */
      --gn-ink: var(--ink, rgba(235,245,255,.92));
      --gn-sub: var(--sub, rgba(170,190,220,.82));
      --gn-cyan: var(--cyan, #41e1ff);
      --gn-stroke-1: var(--stroke-1, rgba(140,180,255,.28));
      --gn-stroke-2: var(--stroke-2, rgba(140,180,255,.16));
      --gn-shadow: var(--shadow-soft, 0 8px 28px rgba(0,0,0,.35));
      --gn-glow: var(--glow-cyan, 0 0 0 1px rgba(65,225,255,.25), 0 0 16px rgba(65,225,255,.18));
    }

    /* Toggle button (hamburger) */
    .gn-toggle{
      position: fixed;
      top: 10px;
      left: 12px;
      z-index: 1100;

      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      user-select: none;

      color: var(--gn-ink);
      /* PATCH: opaque */
      background: rgba(10,16,36,1);
      border: 1px solid rgba(140,240,255,.22);
      border-radius: 12px;
      padding: 6px 10px;

      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset, 0 0 18px rgba(120,240,255,.10);
      backdrop-filter: blur(0px);
    }
    .gn-toggle:hover{
      filter: brightness(1.05);
      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset, 0 0 26px rgba(120,240,255,.14);
    }

    /* Off-canvas nav */
    .sidenav{
      height: 100%;
      width: var(--sidenav-width);
      position: fixed;
      top: 0;
      left: 0;
      z-index: 1200;

      /* PATCH: OPAQUE panel (no page bleed-through) */
      background: #040816;
      background-image:
        radial-gradient(900px 500px at 30% 10%, rgba(65,225,255,.08), transparent 60%),
        linear-gradient(180deg, rgba(12,18,40,1), rgba(6,10,22,1));

      overflow-x: hidden;
      padding-top: 60px;

      border-right: 1px solid rgba(140,240,255,.22);
      box-shadow: 0 0 0 2px rgba(0,0,0,.35) inset, 0 0 30px rgba(0,0,0,.55);

      contain: layout paint;
      transform: translateX(-102%);
      transition: transform .22s ease;
    }
    .sidenav.open{ transform: translateX(0); }

    /* Close X */
    .sidenav .closebtn{
      position: absolute;
      top: 10px;
      right: 14px;

      font-size: 34px;
      color: rgba(220,240,255,.85);
      cursor: pointer;
      line-height: 1;
      user-select: none;

      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: grid;
      place-items: center;

      /* PATCH: opaque */
      background: linear-gradient(180deg, rgba(16,26,56,1), rgba(10,16,34,1));
      border: 1px solid rgba(140,240,255,.18);
      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset;
    }
    .sidenav .closebtn:hover{ color:#fff; filter: brightness(1.05); }

    /* Header plate inside nav (optional) */
    .gn-plate{
      margin: 0 14px 10px;
      padding: 10px 12px;
      border-radius: 999px;
      text-transform: uppercase;
      font-weight: 900;
      letter-spacing: .14em;
      font-size: 12px;
      color: rgba(235,250,255,.92);

      /* PATCH: opaque */
      background: linear-gradient(180deg, rgba(16,26,56,1), rgba(10,16,34,1));
      border: 1px solid rgba(140,240,255,.22);
      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset, 0 0 18px rgba(120,240,255,.10);
    }

    /* Top-level item row */
    .gn-item{
      display:flex;
      align-items:center;
      gap:8px;

      margin: 8px 12px;
      padding: 0;

      /* PATCH: opaque item plate */
      background: linear-gradient(180deg, rgba(16,26,56,1), rgba(10,16,34,1));
      border: 1px solid rgba(140,240,255,.16);
      border-radius: 14px;
      box-shadow: 0 0 0 2px rgba(0,0,0,.28) inset;
    }

    .gn-item > a.gn-link{
      flex: 1 1 auto;
      display:block;
      padding: 12px 12px 12px 16px;

      text-decoration:none;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;

      color: rgba(210,230,255,.86);
      border-radius: 14px;
    }
    .gn-item > a.gn-link:hover{
      color:#fff;
      background: rgba(255,255,255,.06);
    }

    .gn-item > a.gn-link.active{
      color:#fff;
      background: linear-gradient(180deg, rgba(65,225,255,.16), rgba(65,225,255,.08));
      box-shadow: var(--gn-glow);
    }

    .gn-expander{
      flex: 0 0 auto;
      margin-right: 8px;
      border: none;

      /* PATCH: opaque */
      background: linear-gradient(180deg, rgba(16,26,56,1), rgba(10,16,34,1));

      color: rgba(210,230,255,.85);
      cursor:pointer;
      font-size: 18px;
      padding: 8px 10px;
      border-radius: 12px;

      border: 1px solid rgba(140,240,255,.12);
      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset;
    }
    .gn-expander:hover{ color:#fff; filter: brightness(1.05); }
    .gn-expander:focus-visible{ outline: 2px solid rgba(65,225,255,.55); outline-offset: 2px; }

    /* Submenu */
    .gn-submenu{
      margin: 0 12px 10px 24px;
      border-left: 1px dashed rgba(140,240,255,.16);
      padding-left: 10px;

      max-height: 0;
      overflow: hidden;
      transition: max-height .2s ease;
    }
    .gn-submenu.open{ max-height: 800px; }

    .gn-submenu a.gn-sublink{
      display:block;
      padding: 9px 10px;
      margin: 6px 0;

      text-decoration:none;
      color: rgba(210,230,255,.82);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;

      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.06);

      /* PATCH: opaque */
      background: linear-gradient(180deg, rgba(12,20,44,1), rgba(8,14,30,1));
    }
    .gn-submenu a.gn-sublink:hover{
      color:#fff;
      background: linear-gradient(180deg, rgba(18,30,64,1), rgba(10,18,40,1));
      border-color: rgba(140,240,255,.14);
    }
    .gn-submenu a.gn-sublink.active{
      color:#fff;
      background: linear-gradient(180deg, rgba(65,225,255,.14), rgba(65,225,255,.07));
      border: 1px solid rgba(65,225,255,.26);
      box-shadow: 0 0 18px rgba(65,225,255,.10);
    }

    /* Sim-date pill */
    .gn-pill{
      display:block;
      margin: 14px 14px 18px;
      padding: 8px 12px;

      border-radius: 999px;
      font-size: 12px;
      letter-spacing: .12em;
      text-transform: uppercase;
      font-weight: 900;

      color: rgba(235,250,255,.92);

      /* PATCH: opaque */
      background: linear-gradient(180deg, rgba(16,26,56,1), rgba(10,16,34,1));
      border: 1px solid rgba(140,240,255,.20);
      box-shadow: 0 0 0 2px rgba(0,0,0,.22) inset, 0 0 18px rgba(120,240,255,.10);
    }

    /* Overlay */
    .sidenav-overlay{
      position: fixed;
      inset: 0;

      /* PATCH: darker, no blur/glass */
      background: rgba(0,0,0,.55);
      backdrop-filter: none;

      z-index: 1150;
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
    }
    .sidenav-overlay.show{ opacity: 1; pointer-events: auto; }

    /* Hide local navbars / first row if you still have them */
    .js-hide-local-nav .row:first-of-type{ display:none; }

    /* Fade transitions (kept) */
    html.page-transitioning body{ opacity: 0; transition: opacity .12s ease; }
    body{ opacity: 1; transition: opacity .12s ease; }

    @media (prefers-reduced-motion: reduce){
      .sidenav, .sidenav-overlay{ transition: none; }
      html.page-transitioning body, body{ transition: none !important; }
    }
  `;

  document.head.appendChild(s);
})();

/* ------------------------------ HELPERS -------------------------------- */
const norm = (p) => p.toLowerCase().replace(/\/+$/,'').replace(/\.html$/,'').replace(/\/index$/,'');
const herePath = norm(location.pathname);
const hereHash = location.hash || '';
const here = herePath + hereHash;

function aLink(href, cls, label){
  const a = document.createElement('a');
  const abs = href.startsWith('/') ? href : '/' + href.replace(/^\.\//,'');
  a.href = abs;
  a.className = cls;
  a.textContent = label;
  return a;
}

/* ------------------------------- RENDER -------------------------------- */
function renderNav(){
  if (window.__globalNavInserted) return;
  window.__globalNavInserted = true;

  document.documentElement.classList.add('js-hide-local-nav');

  const toggle = document.createElement('button');
  toggle.className = 'gn-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label','Open navigation');
  toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML = '&#9776;';

  const sidenav = document.createElement('nav');
  sidenav.className = 'sidenav';
  sidenav.setAttribute('aria-hidden','true');
  sidenav.setAttribute('aria-label','Primary');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'closebtn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label','Close navigation');
  closeBtn.innerHTML = '&times;';

  sidenav.appendChild(closeBtn);

  // Optional plate at top
  const plate = document.createElement('div');
  plate.className = 'gn-plate';
  plate.textContent = 'WWF GM — Navigation';
  sidenav.appendChild(plate);

  // Remember expanded groups
  const OPEN_KEY = 'wwf_nav_open_groups';
  const openSet = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'));
  const saveOpen = () => localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet]));

  // Build groups
  for (const group of MENU){
    const item = document.createElement('div');
    item.className = 'gn-item';

    const top = aLink(group.href, 'gn-link', group.label);
    item.appendChild(top);

    let submenuEl = null;
    let expander = null;
    let hasActiveChild = false;

    if (Array.isArray(group.children) && group.children.length){
      expander = document.createElement('button');
      expander.className = 'gn-expander';
      expander.type = 'button';
      expander.setAttribute('aria-label', `Toggle ${group.label} submenu`);
      expander.textContent = '▸';
      item.appendChild(expander);

      submenuEl = document.createElement('div');
      submenuEl.className = 'gn-submenu';

      for (const child of group.children){
        const sub = aLink(child.href, 'gn-sublink', child.label);

        const url = new URL(child.href, location.origin);
        const childPath = norm(url.pathname);
        const childHash = child.href.includes('#') ? child.href.slice(child.href.indexOf('#')) : '';
        const childNorm = childPath + childHash;

        if (here === childNorm) { sub.classList.add('active'); hasActiveChild = true; }
        submenuEl.appendChild(sub);
      }
    }

    // Top-level active if current path matches and no child took it
    const topPath = norm(new URL(group.href, location.origin).pathname);
    if (!hasActiveChild && herePath === topPath) top.classList.add('active');

    // Auto-open if it has an active child or was stored open
    const id = topPath || group.label.toLowerCase().replace(/\s+/g,'-');
    const shouldOpen = hasActiveChild || openSet.has(id);

    if (submenuEl){
      if (shouldOpen) {
        submenuEl.classList.add('open');
        expander.textContent = '▾';
        openSet.add(id);
      }
      expander.addEventListener('click', (e)=>{
        e.stopPropagation();
        const open = submenuEl.classList.toggle('open');
        expander.textContent = open ? '▾' : '▸';
        if (open) openSet.add(id); else openSet.delete(id);
        saveOpen();
      });

      sidenav.appendChild(item);
      sidenav.appendChild(submenuEl);
    } else {
      sidenav.appendChild(item);
    }
  }

  // Sim-date pill (always present; content depends on save)
  const pill = document.createElement('span');
  pill.className = 'gn-pill';
  pill.id = 'sim-date-pill';
  pill.textContent = 'No save loaded';
  sidenav.appendChild(pill);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidenav-overlay';

  // Mount
  document.body.appendChild(toggle);
  document.body.appendChild(sidenav);
  document.body.appendChild(overlay);

  // Open/close
  const openNav = () => {
    sidenav.classList.add('open');
    overlay.classList.add('show');
    sidenav.setAttribute('aria-hidden','false');
    toggle.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
    setTimeout(()=> closeBtn.focus(), 0);
  };

  const closeNav = () => {
    sidenav.classList.remove('open');
    overlay.classList.remove('show');
    sidenav.setAttribute('aria-hidden','true');
    toggle.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
    toggle.focus();
  };

  toggle.addEventListener('click', openNav);
  closeBtn.addEventListener('click', closeNav);
  overlay.addEventListener('click', closeNav);
  document.addEventListener('keydown', (e)=> {
    if (e.key === 'Escape' && sidenav.classList.contains('open')) closeNav();
  });

  // Close after clicking any link
  sidenav.addEventListener('click', (e)=>{
    const link = e.target.closest('a[href]');
    if (link) closeNav();
  });

  // Store refs
  window.__sidenav = sidenav;
  window.__sidenav_toggle = toggle;
  window.__sim_date_pill = pill;

  // Initial pill update
  refreshSimDatePill();
}

/* ------------------------------ INIT ----------------------------------- */
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', renderNav);
} else {
  renderNav();
}

/* ----------------------------- PUBLIC API ------------------------------ */
export function refreshSimDatePill(){
  const pill = document.getElementById('sim-date-pill') || window.__sim_date_pill;
  if (!pill) return;

  const state = bootOrNull();
  if (!state) {
    pill.textContent = 'No save loaded';
    return;
  }

  // Hydrate safely (boot() ensures persisted state is normalised)
  const hydrated = boot();
  pill.textContent = simDateString(hydrated);
}

/* --------------------------- SMOOTHNESS -------------------------------- */
// Hover prefetch (HTML)
(function setupHoverPrefetch(){
  const seen = new Set();
  function prefetch(pathname){
    if (seen.has(pathname)) return;
    seen.add(pathname);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.as = 'document';
    l.href = pathname;
    document.head.appendChild(l);
  }

  document.addEventListener('mouseover', (e)=>{
    const a = e.target.closest('a[href]');
    if (!a) return;
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin) return;
    prefetch(url.pathname);
  }, { passive: true });
})();

// Fade + bfcache safety
window.addEventListener('beforeunload', ()=> {
  document.documentElement.classList.add('page-transitioning');
});
window.addEventListener('pageshow', (e)=> {
  if (e.persisted) {
    document.documentElement.classList.remove('page-transitioning');
    document.body.style.opacity = '1';
  }
});
