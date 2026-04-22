// js/engine/inbox_store.js
// Engine-only inbox persistence helpers.
// NO DOM. NO UI. Safe for Node tests.

function normBrand(b) {
  const s = String(b || '').toUpperCase();
  if (s === 'GLOBAL') return 'GLOBAL';
  if (s === 'SD') return 'SD';
  if (s.includes('SMACK')) return 'SD';
  if (s === 'RAW') return 'RAW';
  if (s.includes('RAW')) return 'RAW';
  return undefined;
}

export function ensureInboxStores(state) {
  state.inboxAll = Array.isArray(state.inboxAll) ? state.inboxAll.filter(Boolean) : [];
  state.inbox    = Array.isArray(state.inbox)    ? state.inbox.filter(Boolean)    : [];

  // one-time migration: legacy state.inbox -> state.inboxAll
  // (kept, but we also provide a general "flush" function used each week)
  if (state.inbox.length && state.inboxAll.length === 0) {
    const myBrand =
      String(state.myBrand || state.playerBrand || state.brand || 'RAW')
        .toUpperCase()
        .includes('SMACK') ? 'SD' : 'RAW';

    const idx = new Map(
      (state.roster || [])
        .filter(Boolean)
        .map(w => [w.name, w.brand || myBrand])
    );

    for (const m of state.inbox) {
      if (!m || typeof m !== 'object') continue;

      let on = 0, off = 0;
      const names = Array.isArray(m.names) ? m.names : [];

      for (const n of names) {
        const b = idx.get(n);
        if (!b) continue;
        if (b === myBrand) on++;
        else off++;
      }

      const tag =
        (names.length === 0 || on >= off) ? myBrand :
        (off > on ? (myBrand === 'RAW' ? 'SD' : 'RAW') : 'GLOBAL');

      const finalBrand = (names.length === 0) ? 'GLOBAL' : tag;

      state.inboxAll.unshift({
        ...m,
        brand: finalBrand,
        week: state.week,
        date: state.startDate
      });
    }

    state.inbox = []; // legacy view cleared after migration
  }
}

export function pushInbox(state, brand, msg, scope = 'brand') {
  if (!state) return;
  state.inboxAll = Array.isArray(state.inboxAll) ? state.inboxAll : [];

  const safe = (msg && typeof msg === 'object') ? msg : {};

  // ✅ Respect msg.brand if present, normalize it.
  // - If scope is global, force GLOBAL
  // - If msg.brand is GLOBAL, force GLOBAL
  // - If msg.brand is SD/RAW, keep it
  // - Else fall back to provided brand
  const nb = normBrand(safe.brand);
  const forcedGlobal = (scope === 'global') || (nb === 'GLOBAL');

  const finalBrand = forcedGlobal
    ? 'GLOBAL'
    : (nb || normBrand(brand) || brand);

  const tagged = {
    week: state.week,
    date: state.startDate,
    ...safe,
    brand: finalBrand
  };

  state.inboxAll.unshift(tagged);
}

/**
 * Flush anything that ended up in legacy state.inbox into state.inboxAll.
 * This is the "seatbelt" that fixes week-to-week systems still writing to inbox.
 * - Dedupes by object reference and by a simple signature.
 * - Preserves existing m.brand if provided; otherwise tags to current brand.
 */
export function flushLegacyInboxToAll(state, brand) {
  if (!state) return;

  state.inboxAll = Array.isArray(state.inboxAll) ? state.inboxAll : [];
  state.inbox    = Array.isArray(state.inbox) ? state.inbox.filter(Boolean) : [];

  if (!state.inbox.length) return;

  const baseBrand = normBrand(brand) || brand;

  const sig = (m) => [
    String(m?.week ?? state.week),
    String(normBrand(m?.brand) ?? baseBrand),
    String(m?.from ?? m?.actor ?? ''),
    String(m?.title ?? ''),
    String(m?.body ?? '')
  ].join('||');

  const seenRef = new Set(state.inboxAll);          // object ref dedupe (same-session)
  const seenSig = new Set(state.inboxAll.map(sig)); // content-ish dedupe (cross-session)

  const toMove = [];
  for (const m of state.inbox) {
    if (!m || typeof m !== 'object') continue;
    if (seenRef.has(m)) continue;

    const s = sig(m);
    if (seenSig.has(s)) continue;

    seenRef.add(m);
    seenSig.add(s);
    toMove.push(m);
  }

  // clear legacy store; we rebuild the view later
  state.inbox = [];

  for (const m of toMove) {
    const mb = normBrand(m.brand);
    const finalBrand = mb || baseBrand;

    const scope = (finalBrand === 'GLOBAL') ? 'global' : 'brand';

    // ✅ Important: pushInbox now respects msg.brand, but we still pass the right “brand”
    pushInbox(
      state,
      finalBrand,
      { ...m, brand: finalBrand },
      scope
    );
  }
}

// ── pushMail (merged from mail.js — thin compat shim) ───────────────
// Older code uses pushMail; redirect into pushInbox so there is one path.
export function pushMail(state, msg = {}) {
  if (!state || typeof state !== 'object') return;
  const title = String(msg.title || '').trim();
  const body  = String(msg.body  || '').trim();
  if (!title && !body) return;
  pushInbox(state, msg.brand || 'GLOBAL', msg, msg.brand ? 'brand' : 'global');
}

// Optional: rebuild legacy state.inbox view (kept for backwards compatibility)
export function rebuildInboxView(state, brand) {
  const all = Array.isArray(state.inboxAll) ? state.inboxAll : [];
  const visible = [];

  const b0 = normBrand(brand) || brand;

  for (const m of all) {
    if (!m || typeof m !== 'object') continue;
    const b = normBrand(m.brand) || b0;
    if (b === 'GLOBAL' || b === b0) visible.push(m);
  }

  state.inbox = visible;
}
