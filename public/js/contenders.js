// public/js/contenders.js
import { el } from './util.js';
import { loadState, saveState } from './engine.js';
import { RAW, SD } from './util.js';
import { TITLES, CHAMPION_SEED } from './data.js';
import { headshotImg, getW } from './engine/helpers.js';
import { openTradePicker } from './ui/trade_picker.js';
import { getStory } from './engine/story.js';
import { getNextPPV, ppvTierLabel } from './engine/ppv.js';

const app = document.getElementById('contenders-root') || document.getElementById('app');
if (!app) throw new Error('Contenders root not found');

// ── State helpers ────────────────────────────────────────────────────
function ensureContendersState(state) {
  state.contenders   = state.contenders   || { [RAW]: {}, [SD]: {} };
  state.titleProject = state.titleProject || { [RAW]: {}, [SD]: {} };
  return state;
}

function getPlayerBrand(state) {
  const b = state?.playerBrand || state?.brand || state?.activeBrand || null;
  return (b === RAW || b === SD) ? b : RAW;
}

function idOf(w)          { return w?.id ?? w?.name ?? null; }
function nameOfId(state, id) {
  const w = (state?.roster || []).find(x => String(x?.id) === String(id)) ||
            (state?.roster || []).find(x => String(x?.name) === String(id));
  return w?.name ?? null;
}
function champHolder(state, brand, title) {
  return state?.champs?.[brand]?.[title] ?? CHAMPION_SEED?.[brand]?.[title] ?? null;
}
function holderNames(h)   { if (!h) return []; return Array.isArray(h) ? h.filter(Boolean).map(String) : [String(h)]; }
function champWrestlers(state, holder) { return holderNames(holder).map(n => getW(state, n)).filter(Boolean); }
function getContenderIds(state, brand, title)    { const a = state?.contenders?.[brand]?.[title]; return Array.isArray(a) ? a : []; }
function setContenderIds(state, brand, title, ids) { state.contenders[brand][title] = (ids || []).filter(Boolean); }
function getProjectId(state, brand, title)       { return state?.titleProject?.[brand]?.[title] ?? null; }
function setProjectId(state, brand, title, id)   { state.titleProject[brand][title] = id ?? null; }

// ── Scoring ──────────────────────────────────────────────────────────
function ovr(w) {
  if (!w) return 0;
  const promo = ((w.charisma ?? 60) + (w.mic ?? 60)) / 2;
  return Math.round(
    (w.workrate ?? 60) * 0.30 + (w.starpower ?? 60) * 0.25 +
    promo * 0.15 + (w.momentum ?? 60) * 0.10 +
    (w.psychology ?? 60) * 0.10 + (w.consistency ?? 60) * 0.10
  );
}

function heatVsChamp(state, brand, contenderW, champWs) {
  if (!contenderW || !champWs.length) return 30;
  const story = getStory(state, brand, [contenderW.name, champWs[0].name]);
  if (story?.heat != null) return Math.round(Math.min(100, story.heat));
  const any = (state.storylines?.[brand] || []).find(s => Array.isArray(s.names) && s.names.includes(contenderW.name));
  if (any?.heat != null) return Math.round(Math.min(65, any.heat * 0.6));
  return 28;
}

function freshness(state, brand, contenderW, champWs) {
  if (!contenderW || !champWs.length) return 55;
  const history = state.matchHistory?.[brand];
  if (!Array.isArray(history) || !history.length) return 60;
  const champNames = new Set(champWs.map(w => w.name));
  let lastWeek = null;
  for (const e of history) {
    const names = e?.names || e?.wrestlers || [];
    if (names.includes(contenderW.name) && names.some(n => champNames.has(n))) {
      if (lastWeek === null || (e.week ?? 0) > lastWeek) lastWeek = e.week ?? 0;
    }
  }
  if (lastWeek === null) return 68;
  return Math.round(Math.min(70, 18 + Math.max(0, (state.week || 1) - lastWeek) * 13));
}

function readiness(state, brand, title, w, champWs, isProject) {
  const heat  = heatVsChamp(state, brand, w, champWs);
  const mom   = Number(w?.momentum ?? 55);
  const over  = Number(w?.starpower ?? 60);
  const fresh = freshness(state, brand, w, champWs);
  let r = 0.40 * heat + 0.30 * mom + 0.20 * over + 0.10 * fresh;
  if (isProject) r += 8;
  return Math.round(r);
}

function champStability(state, brand, champWs) {
  if (!champWs.length) return 60;
  const c = champWs[0];
  return Math.max(40, Math.min(95, Math.round((c.starpower ?? 60) * 0.55 + (c.momentum ?? 55) * 0.45)));
}

// ── Perception labels ────────────────────────────────────────────────
function vibeLabel(champWs) {
  if (!champWs.length) return 'Vacant';
  const c = champWs[0];
  const mom = c.momentum ?? 55, over = c.starpower ?? 60;
  if (mom >= 75 && over >= 75) return 'Hot run';
  if (mom < 45 && over >= 70) return 'Big name, cold run';
  if (mom >= 70 && over < 60) return 'Overachieving run';
  if ((c.alignment || '') === 'face' && over >= 70) return 'Beloved face';
  if ((c.alignment || '') === 'heel' && over >= 70) return 'Dominant heel';
  return 'Steady reign';
}

function contenderPerception(state, brand, w, champWs, isProject, r) {
  const heat  = heatVsChamp(state, brand, w, champWs);
  const mom   = Number(w?.momentum ?? 55);
  const over  = Number(w?.starpower ?? 60);
  const fresh = freshness(state, brand, w, champWs);
  const wrate = Number(w?.workrate ?? 60);
  const promo = ((w?.charisma ?? 60) + (w?.mic ?? 60)) / 2;

  // Story fit
  let storyLine;
  if (heat >= 65)  storyLine = 'Hot feud — fan interest is there';
  else if (heat >= 45) storyLine = 'Building — needs a flashpoint moment';
  else if (heat >= 30) storyLine = 'Cold angle — direct confrontation needed';
  else storyLine = 'No story yet — book a first interaction';

  // Belongs in title picture?
  let belongs;
  if (over >= 72 && mom >= 60)        belongs = { text: 'Title-ready',      cls: 'ok'  };
  else if (over >= 60 || mom >= 65)   belongs = { text: 'Building toward it', cls: 'mid' };
  else if (over < 50 && mom < 50)     belongs = { text: 'Too soon — develop first', cls: 'low' };
  else                                 belongs = { text: 'Needs one big win', cls: 'mid' };

  // Future if pushed
  let future;
  if (r >= 70)       future = 'PPV main event ready';
  else if (r >= 55)  future = '2–3 week build needed';
  else if (r >= 40)  future = '4–6 week slow build';
  else               future = 'Not ready — protect for later';

  // Personality hook
  let hook;
  if (promo >= 72 && wrate < 65)      hook = 'Pure talker — win with the mic';
  else if (wrate >= 72 && promo < 60) hook = 'Worker — let the matches do the talking';
  else if (promo >= 68 && wrate >= 68) hook = 'Complete package';
  else if (mom >= 70)                 hook = 'Momentum is the hook — don\'t slow it';
  else if ((w?.alignment || '') === 'heel') hook = 'Needs a heel target the crowd hates';
  else                                hook = 'Needs a character hook to pop the crowd';

  return { storyLine, belongs, future, hook };
}

function readinessTone(r, champScore) {
  const d = r - champScore;
  if (d >= 0)   return { text: `${r}/100 — Pull the trigger`, cls: 'ok'  };
  if (d >= -15) return { text: `${r}/100 — Build 1–2 weeks`,  cls: 'mid' };
  return           { text: `${r}/100 — Too early`,             cls: 'low' };
}

// ── PPV panel (top strip) ────────────────────────────────────────────
function renderPPVPanel(state, brand, titles) {
  const ppv = getNextPPV(state.week || 1, brand);
  if (!ppv) return null;

  const tierCls = ppv.tier === 'wrestlemania' ? 'wm' : ppv.tier === 'supershow' ? 'supershow' : '';
  const icon = ppv.tier === 'wrestlemania' ? '🏆' : ppv.tier === 'supershow' ? '⭐' : '📅';
  const weeksText = ppv.weeksAway === 1 ? 'NEXT WEEK' : `${ppv.weeksAway} weeks away`;

  // Find most ready contender across all titles
  let topName = null, topScore = -1;
  for (const title of titles) {
    const champWs = champWrestlers(state, champHolder(state, brand, title));
    const pid = getProjectId(state, brand, title);
    for (const id of getContenderIds(state, brand, title)) {
      const w = (state.roster || []).find(x => String(x?.id) === String(id) || String(x?.name) === String(id));
      if (!w) continue;
      const s = readiness(state, brand, title, w, champWs, String(idOf(w)) === String(pid));
      if (s > topScore) { topScore = s; topName = w.name; }
    }
  }

  return el('div', { class: `ct-ppv-strip ${tierCls}` },
    el('span', { class: 'ct-ppv-icon', text: icon }),
    el('span', { class: 'ct-ppv-name', text: ppv.name }),
    el('span', { class: 'ct-ppv-meta', text: `${ppvTierLabel(ppv.tier)} · ${weeksText}` }),
    topName
      ? el('span', { class: 'ct-ppv-pick', text: `Most ready: ${topName} (${topScore}/100)` })
      : el('span', { class: 'ct-ppv-pick', text: 'No contenders set' })
  );
}

// ── Styles ───────────────────────────────────────────────────────────
function ensureStyles() {
  if (document.getElementById('contenders-styles')) return;
  const s = document.createElement('style');
  s.id = 'contenders-styles';
  s.textContent = `
    .ct-page { max-width: 1080px; margin: 0 auto; padding: 16px; font-family: inherit; color: rgba(220,235,255,.92); }

    /* PPV strip */
    .ct-ppv-strip {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 10px 16px; border-radius: 12px; margin-bottom: 16px;
      border: 1px solid rgba(255,160,60,.28); background: rgba(255,140,30,.08);
      font-size: 13px;
    }
    .ct-ppv-strip.wm        { border-color: rgba(255,215,0,.40); background: rgba(255,200,0,.10); }
    .ct-ppv-strip.supershow { border-color: rgba(120,180,255,.35); background: rgba(100,160,255,.08); }
    .ct-ppv-icon  { font-size: 18px; }
    .ct-ppv-name  { font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
    .ct-ppv-meta  { opacity: .7; }
    .ct-ppv-pick  { margin-left: auto; font-weight: 900; font-size: 12px; opacity: .85; }

    /* Page header */
    .ct-hdr { margin-bottom: 18px; }
    .ct-hdr h1 { font-size: 16px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 4px; }
    .ct-brand-pill {
      display: inline-block; padding: 5px 12px; border-radius: 999px; font-size: 11px;
      font-weight: 900; letter-spacing: .10em; text-transform: uppercase;
      border: 1px solid rgba(140,240,255,.22); background: rgba(10,40,70,.22);
    }

    /* Title lane: horizontal split — champ left, contenders right */
    .ct-lane {
      display: grid; grid-template-columns: 220px 1fr;
      border-radius: 16px; border: 1px solid rgba(140,240,255,.14);
      background: rgba(10,18,44,.50); overflow: hidden; margin-bottom: 14px;
    }
    @media (max-width: 700px) { .ct-lane { grid-template-columns: 1fr; } }

    /* Champion pane */
    .ct-champ-pane {
      padding: 16px; border-right: 1px solid rgba(140,240,255,.10);
      display: flex; flex-direction: column; gap: 10px;
      background: rgba(255,255,255,.02);
    }
    .ct-title-name { font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; opacity: .55; }
    .ct-champ-portrait {
      width: 72px; height: 72px; border-radius: 14px; overflow: hidden;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
      flex: 0 0 auto;
    }
    .ct-champ-portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ct-champ-name { font-weight: 900; font-size: 14px; line-height: 1.2; }
    .ct-champ-vibe { font-size: 11px; opacity: .65; margin-top: 2px; }
    .ct-stat-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .ct-stat { padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 800;
      border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05); }
    .ct-stability { font-size: 11px; opacity: .55; margin-top: auto; }

    /* Contenders pane */
    .ct-cont-pane { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .ct-cont-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ct-cont-label { font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; opacity: .55; }
    .ct-add-btn {
      padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 900; cursor: pointer;
      border: 1px solid rgba(140,240,255,.25); background: rgba(140,240,255,.08); color: rgba(220,245,255,.9);
      letter-spacing: .06em; text-transform: uppercase;
    }
    .ct-add-btn:hover { background: rgba(140,240,255,.14); }

    .ct-empty { font-size: 12px; opacity: .45; font-style: italic; padding: 8px 0; }

    /* Contender row */
    .ct-cont-row {
      display: grid; grid-template-columns: 40px 1fr auto;
      gap: 10px; align-items: start;
      padding: 10px; border-radius: 12px;
      background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
      transition: border-color .12s;
    }
    .ct-cont-row:hover { border-color: rgba(140,240,255,.18); }
    .ct-cont-row.is-project { border-color: rgba(65,225,255,.30); background: rgba(65,225,255,.05); }

    .ct-cont-avatar { width: 40px; height: 40px; border-radius: 10px; overflow: hidden;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); }
    .ct-cont-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .ct-cont-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .ct-cont-name { font-weight: 900; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ct-cont-hook { font-size: 11px; opacity: .6; }

    .ct-cont-tags { display: flex; gap: 5px; flex-wrap: wrap; }
    .ct-tag {
      padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 800;
      border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05);
      white-space: nowrap;
    }
    .ct-tag.ok  { border-color: rgba(80,220,160,.35); background: rgba(80,220,160,.10); color: rgba(180,255,220,.9); }
    .ct-tag.mid { border-color: rgba(255,190,80,.35);  background: rgba(255,190,80,.10);  color: rgba(255,230,180,.9); }
    .ct-tag.low { border-color: rgba(255,80,120,.35);  background: rgba(255,80,120,.10);  color: rgba(255,180,190,.9); }
    .ct-tag.story { border-color: rgba(160,130,255,.35); background: rgba(160,130,255,.10); color: rgba(220,200,255,.9); }

    .ct-cont-actions { display: flex; gap: 5px; align-items: flex-start; padding-top: 2px; }
    .ct-action-btn {
      padding: 4px 9px; border-radius: 8px; font-size: 10px; font-weight: 900; cursor: pointer;
      border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05);
      color: rgba(220,235,255,.85); text-transform: uppercase; letter-spacing: .04em;
      white-space: nowrap;
    }
    .ct-action-btn:hover { background: rgba(255,255,255,.10); }
    .ct-action-btn.active { border-color: rgba(65,225,255,.40); background: rgba(65,225,255,.12); color: rgba(200,245,255,.95); }
    .ct-action-btn.danger { border-color: rgba(255,80,80,.25); }
    .ct-action-btn.danger:hover { background: rgba(255,80,80,.10); }
  `;
  document.head.appendChild(s);
}

// ── Picker wrapper ───────────────────────────────────────────────────
function pickFromBrand(state, brand, excludeIds, onPick) {
  const excludeNames = new Set((excludeIds || []).map(id => nameOfId(state, id)).filter(Boolean));
  openTradePicker({ state, brand, excludeNames: [...excludeNames], title: `Add contender (${brand})`, onPick });
}

// ── Render ───────────────────────────────────────────────────────────
function render() {
  ensureStyles();
  let state = loadState();
  state = ensureContendersState(state);

  const brand  = getPlayerBrand(state);
  const titles = TITLES?.[brand] || [];

  app.innerHTML = '';
  const page = el('div', { class: 'ct-page' });

  // PPV strip
  const ppvStrip = renderPPVPanel(state, brand, titles);
  if (ppvStrip) page.appendChild(ppvStrip);

  // Header
  const hdr = el('div', { class: 'ct-hdr' });
  hdr.appendChild(el('h1', { text: 'Title Contenders' }));
  hdr.appendChild(el('span', { class: 'ct-brand-pill', text: `Playing: ${brand}` }));
  page.appendChild(hdr);

  // One lane per title
  for (const title of titles) {
    page.appendChild(renderTitleLane(state, brand, title));
  }

  app.appendChild(page);
}

function renderTitleLane(state, brand, title) {
  const holder  = champHolder(state, brand, title);
  const champWs = champWrestlers(state, holder);
  const stability = champStability(state, brand, champWs);
  const projId  = getProjectId(state, brand, title);
  const contIds = getContenderIds(state, brand, title);

  const lane = el('div', { class: 'ct-lane' });

  // ── Left: Champion pane ──────────────────────────────────────────
  const champPane = el('div', { class: 'ct-champ-pane' });
  champPane.appendChild(el('div', { class: 'ct-title-name', text: `${title} Championship` }));

  if (champWs.length) {
    const c = champWs[0];

    const portrait = el('div', { class: 'ct-champ-portrait' });
    portrait.appendChild(headshotImg(c.name, { width: 72, height: 72, alt: c.name }));
    champPane.appendChild(portrait);

    champPane.appendChild(el('div', { class: 'ct-champ-name', text: champWs.map(w => w.name).join(' & ') }));
    champPane.appendChild(el('div', { class: 'ct-champ-vibe', text: vibeLabel(champWs) }));

    const stats = el('div', { class: 'ct-stat-row' });
    stats.appendChild(el('div', { class: 'ct-stat', text: `OVR ${ovr(c)}` }));
    stats.appendChild(el('div', { class: 'ct-stat', text: `Mom ${c.momentum ?? '?'}` }));
    stats.appendChild(el('div', { class: 'ct-stat', text: c.alignment || 'neutral' }));
    champPane.appendChild(stats);
  } else {
    champPane.appendChild(el('div', { class: 'ct-champ-name', text: 'Vacant' }));
  }

  champPane.appendChild(el('div', { class: 'ct-stability', text: `Stability: ${stability}/100` }));
  lane.appendChild(champPane);

  // ── Right: Contenders pane ───────────────────────────────────────
  const contPane = el('div', { class: 'ct-cont-pane' });

  const contHdr = el('div', { class: 'ct-cont-hdr' });
  contHdr.appendChild(el('span', { class: 'ct-cont-label', text: 'Contenders' }));

  const addBtn = el('button', { class: 'ct-add-btn', text: '+ Add' });
  addBtn.onclick = () => {
    pickFromBrand(state, brand, contIds, (w) => {
      if (!w) return;
      const id = idOf(w);
      if (!id) return;
      setContenderIds(state, brand, title, [...new Set([...contIds, id])]);
      saveState(state);
      render();
    });
  };
  contHdr.appendChild(addBtn);
  contPane.appendChild(contHdr);

  if (!contIds.length) {
    contPane.appendChild(el('div', { class: 'ct-empty', text: 'No contenders set. Add some to build a story.' }));
  } else {
    // Resolve + sort by readiness
    const contWs = contIds
      .map(id => (state.roster || []).find(x => String(x?.id) === String(id) || String(x?.name) === String(id)))
      .filter(Boolean)
      .sort((a, b) => {
        const ar = readiness(state, brand, title, a, champWs, String(idOf(a)) === String(projId));
        const br = readiness(state, brand, title, b, champWs, String(idOf(b)) === String(projId));
        return br - ar;
      });

    for (const w of contWs) {
      contPane.appendChild(renderContenderRow(state, brand, title, w, champWs, projId, stability));
    }
  }

  lane.appendChild(contPane);
  return lane;
}

function renderContenderRow(state, brand, title, w, champWs, projId, champScore) {
  const wid       = idOf(w);
  const isProject = projId != null && String(projId) === String(wid);
  const r         = readiness(state, brand, title, w, champWs, isProject);
  const tone      = readinessTone(r, champScore);
  const p         = contenderPerception(state, brand, w, champWs, isProject, r);

  const row = el('div', { class: `ct-cont-row${isProject ? ' is-project' : ''}` });

  // Portrait
  const ava = el('div', { class: 'ct-cont-avatar' });
  ava.appendChild(headshotImg(w.name, { width: 40, height: 40, alt: w.name }));
  row.appendChild(ava);

  // Body
  const body = el('div', { class: 'ct-cont-body' });
  body.appendChild(el('div', { class: 'ct-cont-name', text: isProject ? `★ ${w.name}` : w.name }));
  body.appendChild(el('div', { class: 'ct-cont-hook', text: p.hook }));

  const tags = el('div', { class: 'ct-cont-tags' });
  tags.appendChild(el('span', { class: `ct-tag ${tone.cls}`,    text: tone.text }));
  tags.appendChild(el('span', { class: `ct-tag ${p.belongs.cls}`, text: p.belongs.text }));
  tags.appendChild(el('span', { class: 'ct-tag story',           text: p.storyLine }));
  tags.appendChild(el('span', { class: `ct-tag mid`,             text: p.future }));
  body.appendChild(tags);

  row.appendChild(body);

  // Actions
  const acts = el('div', { class: 'ct-cont-actions' });

  const projBtn = el('button', { class: `ct-action-btn${isProject ? ' active' : ''}`, text: isProject ? 'Backed' : 'Back' });
  projBtn.onclick = () => {
    setProjectId(state, brand, title, isProject ? null : wid);
    saveState(state);
    render();
  };

  const remBtn = el('button', { class: 'ct-action-btn danger', text: '✕' });
  remBtn.onclick = () => {
    setContenderIds(state, brand, title, getContenderIds(state, brand, title).filter(x => String(x) !== String(wid)));
    if (projId != null && String(projId) === String(wid)) setProjectId(state, brand, title, null);
    saveState(state);
    render();
  };

  acts.appendChild(projBtn);
  acts.appendChild(remBtn);
  row.appendChild(acts);

  return row;
}

render();
