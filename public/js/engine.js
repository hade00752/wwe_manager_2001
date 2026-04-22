// public/js/engine.js
// Root barrel kept for backwards-compat with older UI pages.
// Everything should route through /js/engine/engine.js so all pages
// share the same STORAGE_KEYS + load/save logic + helpers.

export * from './engine/engine.js';
