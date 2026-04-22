// public/js/engine/db_hydrate.js
import { saveState } from '../engine.js';

export async function hydrateRosterContractsFromDb(state, era) {
  if (!state || !Array.isArray(state.roster)) return state;

  state.__dbContractsHydrated = state.__dbContractsHydrated || {};
  const eraKey = String(era);

  // If already hydrated AND roster has at least one real contract, skip
  if (state.__dbContractsHydrated[eraKey]) {
    const hasAny = state.roster.some(w => Number(w?.contractAnnual) > 0);
    if (hasAny) return state;
    // cache is lying, force rehydrate
    console.warn('[db_hydrate] cache set but roster has no contracts; rehydrating', eraKey);
    state.__dbContractsHydrated[eraKey] = false;
  }

  const r = await fetch(`/api/era/${encodeURIComponent(eraKey)}/roster_full`);
  if (!r.ok) throw new Error(`roster_full failed: ${r.status}`);
  const rows = await r.json(); // your endpoint returns an array

  // Build maps
  const byId = new Map(rows.map(x => [String(x.id), x.contractAnnual ?? null]));
  const byName = new Map(rows.map(x => [x.name, x.contractAnnual ?? null]));

  let updated = 0;
  let missing = 0;

  for (const w of state.roster) {
    if (!w) continue;

    const v =
      (w.id != null ? byId.get(String(w.id)) : undefined) ??
      (w.name ? byName.get(w.name) : undefined);

    if (v === undefined) { missing++; continue; }

    w.contractAnnual = v; // may be null for FA/no-contract
    updated++;
  }

  console.log(`[db_hydrate] era=${eraKey} updated=${updated} missing=${missing} roster=${state.roster.length} apiRows=${rows.length}`);

  // IMPORTANT: only “lock” cache if we actually updated something
  if (updated > 0) {
    state.__dbContractsHydrated[eraKey] = true;
    saveState(state);
  } else {
    console.warn('[db_hydrate] updated=0; NOT setting cache flag');
  }

  return state;
}
