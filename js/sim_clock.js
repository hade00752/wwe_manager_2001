// public/js/sim_clock.js
import { loadState, ensureInitialised, simDateString } from "./engine.js";

function inject(){
  const state = loadState(); if (!state) return;
  ensureInitialised(state);

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = simDateString(state);

  // Find the first top nav row and add the pill
  const row = document.querySelector('.row .card') || document.querySelector('.row');
  if (row){
    row.appendChild(document.createTextNode(' '));
    row.appendChild(pill);
  }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}
