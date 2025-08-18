// public/js/nav.js
// Global sticky nav with active-tab highlight + sim date pill.

import { loadState, ensureInitialised, simDateString } from "./engine.js";

(function injectNavStyles(){
  if (document.getElementById('global-nav-styles')) return;
  const s = document.createElement('style');
  s.id = 'global-nav-styles';
  s.textContent = `
    .global-topnav {
      position: sticky; top: 0; z-index: 1000;
      backdrop-filter: blur(6px);
      background: linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,.25));
      border-bottom: 1px solid rgba(255,255,255,.08);
    }
    .global-topnav__row {
      display: flex; gap: 10px; align-items: center; padding: 10px 14px;
    }
    .gn-link {
      display:inline-block; padding:8px 14px; border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.06); color: inherit; text-decoration:none;
    }
    .gn-link.active {
      background: rgba(140,160,255,.16);
      border-color: rgba(140,160,255,.45);
    }
    .gn-dot { opacity:.5 }
    .gn-spacer { flex: 1 }
    /* optional: hide the very first legacy nav row if it looks like a nav */
    .js-hide-local-nav .row:first-of-type { display:none; }
  `;
  document.head.appendChild(s);
})();

function link(href, label){
  const a = document.createElement('a');
  a.href = href; a.textContent = label; a.className = 'gn-link';
  const here = location.pathname.split('/').pop().toLowerCase();
  const end  = href.split('/').pop().toLowerCase();
  if (here === end) a.classList.add('active');
  return a;
}

function dot(){ const d=document.createElement('span'); d.textContent='•'; d.className='gn-dot'; return d; }

function renderNav(){
  if (window.__globalNavInserted) return; // avoid duplicates
  window.__globalNavInserted = true;

  // Optionally hide legacy per-page nav rows to avoid double nav
  document.documentElement.classList.add('js-hide-local-nav');

  const header = document.createElement('header');
  header.className = 'global-topnav';
  const row = document.createElement('div');
  row.className = 'global-topnav__row';

  row.appendChild(link('./inbox.html','Inbox'));
  row.appendChild(dot());
  row.appendChild(link('./booking.html','Booking'));
  row.appendChild(dot());
  row.appendChild(link('./results.html','Results'));
  row.appendChild(dot());
  row.appendChild(link('./roster.html','Roster'));
  row.appendChild(dot());
  row.appendChild(link('./mentors.html','Mentoring'));

  // spacer + sim date
  const spacer = document.createElement('div'); spacer.className = 'gn-spacer';
  row.appendChild(spacer);

  const state = loadState();
  if (state){
    ensureInitialised(state);
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.id = 'sim-date-pill';
    pill.textContent = simDateString(state);
    row.appendChild(pill);
  }

  header.appendChild(row);

  // Insert at very top of body
  if (document.body.firstChild) {
    document.body.insertBefore(header, document.body.firstChild);
  } else {
    document.body.appendChild(header);
  }
}

// Re-render (or update pill) when DOM is ready
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', renderNav);
} else {
  renderNav();
}

// Optional public updater (call after advancing week if you stay on the page)
export function refreshSimDatePill(){
  const state = loadState(); if (!state) return;
  ensureInitialised(state);
  const el = document.getElementById('sim-date-pill');
  if (el) el.textContent = simDateString(state);
}
