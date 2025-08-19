// public/js/roster.js
// Unified roster view + search, with safe guards and brand fallbacks.

import { RAW, SD, FA, el, clamp } from "./util.js";
import { loadState, ensureInitialised, headshotImg } from "./engine.js";

const root =
  document.getElementById("roster-root") ||
  (() => {
    const m = document.createElement("main");
    m.id = "roster-root";
    document.body.appendChild(m);
    return m;
  })();

/* ---------------- styles ---------------- */
(function injectStyles() {
  const s = document.createElement("style");
  s.textContent = `
  .ro-wrap{ display:grid; gap:16px; }
  .ro-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .ro-search{ min-width:260px; }
  .ro-list{ display:grid; gap:8px; }
  .ro-row{ display:grid; grid-template-columns: 56px 1fr auto auto; align-items:center; gap:12px;
           padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.03);
           box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; cursor:pointer; }
  .ro-name{ font-weight:600; }
  .pill.brand{ padding:4px 10px; border-radius:999px; font-size:12px; border:1px solid rgba(255,255,255,.18); }
  .pill.raw{ background: rgba(80,140,255,.16); border-color: rgba(80,140,255,.38); }
  .pill.sd{  background: rgba(150,120,255,.16); border-color: rgba(150,120,255,.38); }
  .pill.fa{  background: rgba(180,180,180,.12); border-color: rgba(180,180,180,.30); }
  .ro-ov{ font-weight:800; font-size:18px; color:rgba(140,160,255,.95) }
  .ro-img{ width:48px; height:48px; border-radius:10px; overflow:hidden; box-shadow:0 0 0 1px rgba(255,255,255,.1) inset; }
  .ro-img > img{ width:48px; height:48px; object-fit:cover; display:block; }
  .ro-link{ color:inherit; text-decoration:none; }
  .ro-empty{ padding:14px; border-radius:12px; background:rgba(255,255,255,.03);
             box-shadow:0 0 0 1px rgba(255,255,255,.08) inset; }
  .ro-actions{ display:flex; gap:8px; margin-top:10px; }
  .btn{ background: rgba(14,22,48,.82); color: #e9eef8; border:1px solid rgba(140,180,255,.35);
        border-radius:12px; padding:10px 12px; cursor:pointer; text-decoration:none; }
  .btn:hover{ box-shadow: 0 0 0 1px rgba(140,180,255,.55), 0 0 16px rgba(140,180,255,.18); }
  `;
  document.head.appendChild(s);
})();

/* ---------------- helpers ---------------- */
function calcOverall(w) {
  const promoLike = ((w.charisma ?? w.promo ?? 60) + (w.mic ?? w.promo ?? 60)) / 2;
  const psych = w.psychology ?? 60;
  const cons  = w.consistency ?? 60;
  const o = Math.round(
    (w.workrate ?? 60) * 0.30 +
    (w.starpower ?? 60) * 0.25 +
    promoLike * 0.15 +
    (w.momentum ?? 60) * 0.10 +
    psych * 0.10 +
    cons * 0.10
  );
  return clamp(o, 1, 99);
}

function brandPill(brand) {
  const b = brand === RAW ? "raw" : brand === SD ? "sd" : "fa";
  const t = brand === RAW ? "RAW" : brand === SD ? "SmackDown" : "Free Agent";
  return el("span", { class: `pill brand ${b}`, text: t });
}

// Pretty URL path for profile pages
const PROFILE_PATH = "profile.html";

/* Safe state getter: renders friendly message if there is no save yet */
function getStateOrExplain() {
  const state = loadState();
  if (!state) {
    root.innerHTML = "";
    const wrap = el("div", { class: "ro-wrap" });

    wrap.appendChild(el("h3", { text: "Roster" }));
    const empty = el(
      "div",
      { class: "ro-empty" },
      el("div", {
        text:
          "No season found. Go to Booking and press “Start New Season” to create a save, then return to the Roster page.",
      })
    );
    const actions = el(
      "div",
      { class: "ro-actions" },
      el("a", { class: "btn", text: "Go to Booking", href: "booking.html" })
    );
    empty.appendChild(actions);
    wrap.appendChild(empty);
    root.appendChild(wrap);
    return null;
  }
  try {
    ensureInitialised(state);
  } catch {
    // If anything throws, keep going with the raw state to avoid blanking the page
  }
  return state;
}

/* Row builder */
function rowFor(w) {
  const r = el("div", { class: "ro-row" });

  const href = `${PROFILE_PATH}?name=${encodeURIComponent(w.name)}`;

  const pic = el("div", { class: "ro-img" });
  pic.appendChild(headshotImg(w.name, { width: 48, height: 48, alt: w.name }));
  r.appendChild(pic);

  const name = el("a", { class: "ro-name ro-link", text: w.name, href });
  r.appendChild(name);

  r.appendChild(brandPill(w.brand));
  r.appendChild(el("div", { class: "ro-ov", text: String(calcOverall(w)) }));

  // Make the whole row clickable; keep the anchor accessible
  r.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLAnchorElement)) window.location.href = href;
  });

  return r;
}

/* ---------------- render ---------------- */
function render() {
  const state = getStateOrExplain();
  if (!state) return;

  root.innerHTML = "";
  const wrap = el("div", { class: "ro-wrap" });

  // Header + search
  const head = el("div", { class: "ro-head" });
  head.appendChild(el("h3", { text: "Roster" }));
  const search = el("input", { class: "ro-search", type: "search", placeholder: "Search roster…" });
  head.appendChild(search);
  wrap.appendChild(head);

  // Build the list with robust fallbacks:
  // 1) Prefer state.roster if it's an array with items
  // 2) Otherwise flatten brand buckets state[RAW], state[SD], state[FA]
  let all = [];
  if (Array.isArray(state.roster) && state.roster.length) {
    all = [...state.roster];
  } else {
    const raw = Array.isArray(state[RAW]) ? state[RAW] : [];
    const sd  = Array.isArray(state[SD])  ? state[SD]  : [];
    const fa  = Array.isArray(state[FA])  ? state[FA]  : [];
    all = [...raw, ...sd, ...fa];
  }

  // If still empty, explain gently instead of a blank page
  const list = el("div", { class: "ro-list" });
  if (!all.length) {
    list.appendChild(
      el("div", { class: "ro-empty", text: "No wrestlers found in this save yet." })
    );
    wrap.appendChild(list);
    root.appendChild(wrap);
    return;
  }

  all.sort((a, b) => a.name.localeCompare(b.name));
  let current = all;

  function refresh() {
    list.innerHTML = "";
    current.forEach((w) => list.appendChild(rowFor(w)));
  }
  refresh();

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    current = !q ? all : all.filter((w) => w.name.toLowerCase().includes(q));
    refresh();
  });

  wrap.appendChild(list);
  root.appendChild(wrap);
}

/* ---------------- boot ---------------- */
try {
  render();
} catch (e) {
  // Last-resort error surface so the page never silently fails
  root.innerHTML = "";
  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  pre.style.padding = "12px";
  pre.style.border = "1px solid #444";
  pre.style.borderRadius = "10px";
  pre.textContent = "[Roster load error]\n" + (e?.stack || e?.message || String(e));
  root.appendChild(pre);
}
