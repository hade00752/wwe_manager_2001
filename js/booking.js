// public/js/booking.js
// Stable booking screen (brand switcher, champions, segment picks, save → results)

import { RAW, SD, SEGMENTS, TITLE_ALLOWED_ON, el } from "./util.js";
import { loadState, saveState, ensureInitialised, headshotImg } from "./engine.js";
import { TITLES } from "./data.js";

/* ---------- root ---------- */
const root =
  document.getElementById("booking-root") ||
  (() => {
    const m = document.createElement("main");
    m.id = "booking-root";
    document.body.appendChild(m);
    return m;
  })();

/* ---------- boot ---------- */
function bootError(msg, err) {
  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  pre.style.padding = "12px";
  pre.style.border = "1px solid #444";
  pre.style.borderRadius = "10px";
  pre.textContent = `[Booking error]\n${msg}\n\n${err?.stack || err?.message || String(err)}`;
  root.innerHTML = "";
  root.appendChild(pre);
}

function render() {
  const state = loadState();
  ensureInitialised(state);

  root.innerHTML = "";
  root.appendChild(navBar(state));
  root.appendChild(championsPanel(state));
  root.appendChild(bookingForm(state));
}

try {
  render();
} catch (e) {
  console.error(e);
  bootError("Initialisation failed", e);
}

/* ---------- navbar (brand picker) ---------- */
function navBar(state) {
  const wrap = el("div", { class: "row" });

  const brandSel = el(
    "select",
    {},
    ...[RAW, SD].map((b) => {
      const o = el("option", { value: b, text: b });
      if (state.brand === b) o.selected = true;
      return o;
    })
  );
  brandSel.addEventListener("change", () => {
    state.brand = brandSel.value;
    saveState(state);
    render();
  });

  wrap.appendChild(
    el("div", { class: "card" },
      el("label", { text: "Brand " }),
      brandSel
    )
  );
  return wrap;
}

/* ---------- champions panel ---------- */
function championsPanel(state) {
  const c = el("div", { class: "card" });
  c.appendChild(el("h3", { text: "Champions" }));

  for (const brand of [RAW, SD]) {
    const row = el("div", {}, el("strong", { text: brand }));
    const titles = TITLES?.[brand] || [];
    for (const title of titles) {
      const holder = state?.champs?.[brand]?.[title];
      row.appendChild(
        el("div", {
          html: `<span class="pill title">${brand} ${title}</span> ${
            Array.isArray(holder) ? holder.join(" & ") : holder || "Vacant"
          }`,
        })
      );
    }
    c.appendChild(row);
  }
  return c;
}

/* ---------- select with photo preview ---------- */
function makeSelectWithPreview(id, candidates, injured) {
  const wrap = el("span", { class: "pick-with-photo" });

  const s = el("select", { id });
  s.appendChild(el("option", { value: "", text: "— Select —" }));
  candidates.forEach((w) =>
    s.appendChild(el("option", { value: w.name, text: `${w.name}${w.gender === "F" ? " (W)" : ""}` }))
  );

  if (injured.length) {
    const grp = document.createElement("optgroup");
    grp.label = "Injured (unavailable)";
    injured.forEach((w) => {
      const o = document.createElement("option");
      o.value = "";
      o.disabled = true;
      o.textContent = `${w.name} — out ${w.injuryWeeks}w`;
      grp.appendChild(o);
    });
    s.appendChild(grp);
  }

  const previewHolder = document.createElement("span");
  previewHolder.style.marginLeft = "8px";
  previewHolder.style.display = "inline-flex";
  previewHolder.style.verticalAlign = "middle";

  let currentImg = null;
  const updatePreview = () => {
    const name = s.value || "";
    if (currentImg) {
      previewHolder.removeChild(currentImg);
      currentImg = null;
    }
    if (!name) return;
    currentImg = headshotImg(name, { width: 24, height: 24 });
    previewHolder.appendChild(currentImg);
  };
  s.addEventListener("change", updatePreview);

  wrap.appendChild(s);
  wrap.appendChild(previewHolder);
  return wrap;
}

/* ---------- booking form ---------- */
function bookingForm(state) {
  const c = el("div", { class: "card" });
  c.appendChild(el("h3", { text: `Book Week ${state.week} (${state.brand})` }));

  // Basic availability by brand with simple guards
  const my = (state.roster || []).filter((w) => w.brand === state.brand);
  const injured = my.filter((w) => (w.injuryWeeks || 0) > 0);
  const available = my.filter((w) => (w.injuryWeeks || 0) === 0);

  const box = el("div", { class: "grid" });

  for (const seg of SEGMENTS) {
    const segBox = el("div", { class: "card" });
    segBox.appendChild(el("strong", { text: seg.key }));

    if (seg.type === "promo") {
      const s = makeSelectWithPreview(`${seg.key}_Promo`, available, injured);
      segBox.appendChild(s);
    } else if (seg.type === "tag") {
      const a1 = makeSelectWithPreview("Tag_A1", available, injured);
      const a2 = makeSelectWithPreview("Tag_A2", available, injured);
      const b1 = makeSelectWithPreview("Tag_B1", available, injured);
      const b2 = makeSelectWithPreview("Tag_B2", available, injured);
      segBox.appendChild(el("div", {}, el("label", { text: "Team A" }), a1, a2));
      segBox.appendChild(el("div", {}, el("label", { text: "Team B" }), b1, b2));
    } else {
      const A = makeSelectWithPreview(`${seg.key}_A`, available, injured);
      const B = makeSelectWithPreview(`${seg.key}_B`, available, injured);
      segBox.appendChild(
        el("div", {},
          el("label", { text: "A" }), A,
          el("span", { text: " " }),
          el("label", { text: "B" }), B
        )
      );
    }

    if (seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key)) {
      const tChk = el("input", { type: "checkbox", id: `${seg.key}_isTitle` });
      const tSel = el("select", { id: `${seg.key}_title`, disabled: true });

      const brandTitles = TITLES?.[state.brand] || [];
      for (const t of brandTitles) tSel.appendChild(el("option", { value: t, text: t }));

      tChk.addEventListener("change", () => (tSel.disabled = !tChk.checked));
      segBox.appendChild(
        el("div", {}, el("label", { text: "Championship " }), tChk, el("span", { text: " " }), tSel)
      );
    }

    box.appendChild(segBox);
  }

  c.appendChild(box);

  // Save + navigate
  const warn = el("div", { class: "pill warn" });
  const simBtn = el("button", { text: "Save Booking & Go To Results" });

  simBtn.onclick = () => {
    try {
      const booking = {};
      for (const seg of SEGMENTS) {
        if (seg.type === "promo") {
          const speaker = val(`${seg.key}_Promo`);
          if (!speaker) {
            warn.textContent = `[${seg.key}] missing promo.`;
            return;
          }
          booking[seg.key] = { type: "promo", speaker };
        } else if (seg.type === "tag") {
          const picks = ["Tag_A1", "Tag_A2", "Tag_B1", "Tag_B2"].map((id) => val(id));
          if (picks.some((v) => !v)) {
            warn.textContent = "[Tag] needs four picks.";
            return;
          }
          const [a1, a2, b1, b2] = picks;
          // simple gender guard
          const g = my.find((w) => w.name === a1)?.gender || "M";
          if ([a2, b1, b2].some((n) => my.find((w) => w.name === n)?.gender !== g)) {
            warn.textContent = "[Tag] teams must be same gender.";
            return;
          }
          booking[seg.key] = { type: "tag", teams: [[a1, a2], [b1, b2]] };
        } else {
          const A = val(`${seg.key}_A`), B = val(`${seg.key}_B`);
          if (!A || !B) {
            warn.textContent = `[${seg.key}] needs two wrestlers.`;
            return;
          }
          // gender rule
          const gA = my.find((w) => w.name === A)?.gender || "M";
          const gB = my.find((w) => w.name === B)?.gender || "M";
          if (gA !== gB) {
            warn.textContent = `[${seg.key}] women vs women only.`;
            return;
          }
          booking[seg.key] = { type: "singles", a: A, b: B };
        }

        if (seg.titleToggle && TITLE_ALLOWED_ON.has(seg.key)) {
          const tOn = checked(`${seg.key}_isTitle`);
          if (tOn) booking[seg.key].championship = val(`${seg.key}_title`);
        }
      }

      const payload = { week: state.week, brand: state.brand, booking };
      localStorage.setItem("wwe2001_save_v1::booking_payload", JSON.stringify(payload));
      saveState(state);
      location.href = "./results.html";
    } catch (err) {
      console.error(err);
      warn.textContent = "Failed to save & navigate. See console.";
      bootError("Failed to save booking", err);
    }
  };

  c.appendChild(el("div", {}, simBtn, el("span", { text: " " }), warn));
  return c;

  function val(id) {
    const e = document.getElementById(id);
    return e ? e.value : null;
  }
  function checked(id) {
    const e = document.getElementById(id);
    return !!(e && e.checked);
  }
}
