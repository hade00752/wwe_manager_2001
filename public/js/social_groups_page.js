// public/js/social_groups_page.js
// Social Groups & Backstage Politics — portraits + personality + standing

import { boot } from './engine.js';
import { computeSocialGroups, computeGroupRivalries } from './engine/social_groups.js';
import { headshotImg } from './engine/helpers.js';
import { forceHydrateRelPairs } from './engine/state_mgmt.js';

// ── DOM helper ───────────────────────────────────────────────────────
function el(tag, opts = {}, ...children) {
  const e = document.createElement(tag);
  if (opts.class) e.className = opts.class;
  if (opts.id)    e.id = opts.id;
  if (opts.text)  e.textContent = opts.text;
  if (opts.html)  e.innerHTML = opts.html;
  if (opts.style) Object.assign(e.style, opts.style);
  if (opts.title) e.title = opts.title;
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

// ── Personality derivation (from attributes, never hardcoded) ────────
function derivePersonality(w) {
  const workrate  = Number(w.workrate  ?? 60);
  const psych     = Number(w.psychology ?? 60);
  const charisma  = Number(w.charisma  ?? 60);
  const mic       = Number(w.mic       ?? 60);
  const starpower = Number(w.starpower ?? 60);
  const momentum  = Number(w.momentum  ?? 55);
  const morale    = Number(w.morale    ?? 65);
  const consist   = Number(w.consistency ?? 60);
  const likeability = Number(w.likeability ?? 60);

  const workerScore = (workrate + psych) / 2;
  const talkerScore = (charisma + mic) / 2;

  // Primary archetype
  let archetype;
  if (starpower >= 80)                           archetype = 'Megastar';
  else if (starpower >= 70 && momentum >= 68)   archetype = 'Main Eventer';
  else if (talkerScore >= 72 && workerScore < 62) archetype = 'Pure Talker';
  else if (workerScore >= 72 && talkerScore < 62) archetype = 'Pure Worker';
  else if (talkerScore >= 65 && workerScore >= 65) archetype = 'Complete Package';
  else if (momentum >= 70)                       archetype = 'Rising Star';
  else if (consist >= 70)                        archetype = 'Reliable Hand';
  else if (starpower >= 60 && momentum < 45)     archetype = 'Fading Name';
  else                                           archetype = 'Midcard Talent';

  // Personality trait
  let trait;
  if (morale < 40)                              trait = 'Unhappy';
  else if (morale >= 80 && likeability >= 70)   trait = 'Locker room leader';
  else if (likeability >= 75)                   trait = 'Well-liked';
  else if (likeability < 40)                    trait = 'Difficult';
  else if (psych >= 75)                         trait = 'Ring general';
  else if (charisma >= 75)                      trait = 'Natural performer';
  else if (consist >= 75)                       trait = 'The pro\'s pro';
  else if (morale >= 75)                        trait = 'Content & focused';
  else                                          trait = 'Steady';

  // Standing in company
  let standing;
  if (starpower >= 78)        standing = { label: 'Top guy',         cls: 'top'  };
  else if (starpower >= 65)   standing = { label: 'Upper midcard',   cls: 'upper' };
  else if (starpower >= 50)   standing = { label: 'Solid midcard',   cls: 'mid'  };
  else                        standing = { label: 'Lower card',      cls: 'lower' };

  // Mood indicator
  const moodCls = morale >= 70 ? 'happy' : morale >= 50 ? 'neutral' : 'unhappy';
  const moodIcon = morale >= 70 ? '●' : morale >= 50 ? '●' : '●';

  return { archetype, trait, standing, morale, moodCls, moodIcon };
}

// ── Styles ────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('sg-page-styles')) return;
  const s = document.createElement('style');
  s.id = 'sg-page-styles';
  s.textContent = `
    .sg-page { font-family: inherit; color: rgba(220,235,255,.92); max-width: 1080px; margin: 0 auto; }

    .sg-page-header {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
      padding: 12px 16px; border-radius: 14px; margin-bottom: 18px;
      background: rgba(10,20,50,.55); border: 1px solid rgba(140,240,255,.20);
      box-shadow: 0 0 0 2px rgba(0,0,0,.18) inset;
    }
    .sg-page-title { font-weight: 900; font-size: 16px; letter-spacing: .12em; text-transform: uppercase; }
    .sg-page-sub   { font-size: 11px; opacity: .6; margin-top: 3px; letter-spacing: .06em; }

    /* Brand section */
    .sg-brand-section { margin-bottom: 24px; }
    .sg-brand-label {
      font-size: 10px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase;
      opacity: .55; margin-bottom: 10px;
    }
    .sg-brand-label.raw { color: rgba(255,110,110,.9); }
    .sg-brand-label.sd  { color: rgba(110,180,255,.9); }

    /* Groups grid */
    .sg-groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }

    /* Group card */
    .sg-group-card {
      border-radius: 16px; padding: 14px; border: 1px solid rgba(140,240,255,.12);
      background: rgba(10,18,44,.55); box-shadow: 0 0 0 2px rgba(0,0,0,.18) inset;
      transition: border-color .15s;
    }
    .sg-group-card:hover { border-color: rgba(140,240,255,.24); }
    .sg-group-card.has-rivalry { border-color: rgba(255,100,80,.32); }

    .sg-group-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .sg-align-badge {
      width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
      font-size: 13px; flex: 0 0 auto; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
    }
    .sg-align-badge.heel { background: rgba(200,60,60,.18); border-color: rgba(255,80,80,.28); }
    .sg-align-badge.face { background: rgba(60,180,255,.14); border-color: rgba(80,180,255,.28); }
    .sg-group-name   { font-weight: 900; font-size: 14px; }
    .sg-group-meta   { font-size: 11px; opacity: .6; margin-top: 2px; }

    /* Stat bars */
    .sg-bars { display: flex; gap: 6px; margin-bottom: 12px; }
    .sg-bar-col { flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .sg-bar-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; opacity: .5; }
    .sg-bar-track { height: 4px; border-radius: 99px; background: rgba(255,255,255,.08); }
    .sg-bar-fill  { height: 100%; border-radius: 99px; }
    .sg-bar-fill.mood      { background: linear-gradient(90deg, rgba(255,160,60,.7), rgba(255,200,60,.9)); }
    .sg-bar-fill.cohesion  { background: linear-gradient(90deg, rgba(60,200,160,.7), rgba(60,240,180,.9)); }
    .sg-bar-fill.influence { background: linear-gradient(90deg, rgba(120,160,255,.7), rgba(160,200,255,.9)); }
    .sg-bar-val { font-size: 10px; font-weight: 900; opacity: .75; }

    /* Members */
    .sg-members { display: flex; flex-direction: column; gap: 7px; }

    .sg-member-row {
      display: grid; grid-template-columns: 36px 1fr auto;
      gap: 8px; align-items: center;
      padding: 7px 8px; border-radius: 10px;
      background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
    }
    .sg-member-row.is-leader { background: rgba(65,225,255,.05); border-color: rgba(65,225,255,.18); }

    .sg-member-avatar {
      width: 36px; height: 36px; border-radius: 8px; overflow: hidden;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08);
      flex: 0 0 auto;
    }
    .sg-member-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .sg-member-info { min-width: 0; }
    .sg-member-name {
      font-weight: 900; font-size: 12px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .sg-member-name .leader-star { color: rgba(65,225,255,.9); margin-right: 3px; font-size: 10px; }
    .sg-member-archetype { font-size: 10px; opacity: .6; margin-top: 1px; }
    .sg-member-trait { font-size: 10px; opacity: .5; }

    .sg-member-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
    .sg-standing {
      font-size: 9px; font-weight: 900; padding: 2px 7px; border-radius: 999px;
      text-transform: uppercase; letter-spacing: .06em; white-space: nowrap;
      border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.05);
    }
    .sg-standing.top   { border-color: rgba(255,215,0,.40);   background: rgba(255,210,0,.10);  color: rgba(255,240,160,.9); }
    .sg-standing.upper { border-color: rgba(65,225,255,.30);  background: rgba(65,225,255,.08); color: rgba(200,245,255,.9); }
    .sg-standing.mid   { border-color: rgba(255,255,255,.12); }
    .sg-standing.lower { border-color: rgba(255,255,255,.07); opacity: .7; }

    .sg-mood-dot { font-size: 9px; }
    .sg-mood-dot.happy   { color: rgba(80,220,160,.9); }
    .sg-mood-dot.neutral { color: rgba(255,190,80,.9); }
    .sg-mood-dot.unhappy { color: rgba(255,80,100,.9); }

    .sg-arc-hot  { font-size: 9px; font-weight: 900; color: rgba(255,160,40,.9);  letter-spacing: .04em; }
    .sg-arc-cold { font-size: 9px; font-weight: 900; color: rgba(120,160,255,.75); letter-spacing: .04em; }

    /* No-groups note */
    .sg-empty {
      padding: 18px; border-radius: 12px; font-size: 12px; opacity: .5;
      text-align: center; border: 1px dashed rgba(255,255,255,.10);
    }

    /* Loners */
    .sg-loner-section { margin-top: 12px; }
    .sg-loner-label { font-size: 10px; opacity: .4; letter-spacing: .10em; text-transform: uppercase; margin-bottom: 6px; }
    .sg-loner-chips { display: flex; flex-wrap: wrap; gap: 5px; }
    .sg-loner-chip {
      font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 700;
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); opacity: .7;
    }

    /* Rivalries */
    .sg-rival-section { margin-top: 24px; }
    .sg-rival-title { font-size: 10px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,100,80,.8); margin-bottom: 8px; }
    .sg-rival-list { display: flex; flex-direction: column; gap: 6px; }
    .sg-rival-row {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 9px 12px; border-radius: 10px;
      background: rgba(255,60,60,.05); border: 1px solid rgba(255,60,60,.18);
      font-size: 12px;
    }
    .sg-rival-grp  { font-weight: 900; }
    .sg-rival-vs   { font-size: 10px; opacity: .45; font-weight: 900; letter-spacing: .08em; }
    .sg-rival-heat { margin-left: auto; font-size: 10px; font-weight: 900; color: rgba(255,120,100,.9); }
    .sg-rival-none { font-size: 12px; opacity: .4; font-style: italic; }
  `;
  document.head.appendChild(s);
}

// ── Render one group card ─────────────────────────────────────────────
function renderGroupCard(state, group, hasRivalry) {
  const alignCls = group.alignment === 'heel' ? 'heel' : group.alignment === 'face' ? 'face' : '';
  const alignIcon = group.alignment === 'heel' ? '😈' : group.alignment === 'face' ? '⭐' : '⚪';

  const card = el('div', { class: `sg-group-card${hasRivalry ? ' has-rivalry' : ''}` });

  // Header
  const top = el('div', { class: 'sg-group-top' },
    el('div', { class: `sg-align-badge ${alignCls}`, text: alignIcon }),
    el('div', {},
      el('div', { class: 'sg-group-name', text: group.name }),
      el('div', { class: 'sg-group-meta', text: `${group.members.length} members · ${group.alignment || 'neutral'} · ${['Rookie','Midcard','Veteran','Legend'][group.seniorityTier ?? 1]} bloc · ${hasRivalry ? '⚡ Rivalry' : 'Stable'}` })
    )
  );
  card.appendChild(top);

  // Stat bars
  const bars = el('div', { class: 'sg-bars' });
  for (const [lbl, val, cls] of [['Mood', group.mood, 'mood'], ['Cohesion', group.cohesion, 'cohesion'], ['Influence', group.influence, 'influence']]) {
    bars.appendChild(el('div', { class: 'sg-bar-col' },
      el('div', { class: 'sg-bar-lbl', text: lbl }),
      el('div', { class: 'sg-bar-track' },
        el('div', { class: `sg-bar-fill ${cls}`, style: { width: `${Math.min(100, Math.max(0, val))}%` } })
      ),
      el('div', { class: 'sg-bar-val', text: String(val) })
    ));
  }
  card.appendChild(bars);

  // Member list
  const members = el('div', { class: 'sg-members' });

  // Sort: leader first, then by starpower desc
  const roster = state.roster || [];
  const memberObjs = group.members
    .map(name => roster.find(w => w.name === name))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.name === group.leaderName) return -1;
      if (b.name === group.leaderName) return 1;
      return (Number(b.starpower ?? 50)) - (Number(a.starpower ?? 50));
    });

  for (const w of memberObjs) {
    members.appendChild(renderMemberRow(w, w.name === group.leaderName));
  }
  card.appendChild(members);

  return card;
}

function renderMemberRow(w, isLeader) {
  const p = derivePersonality(w);

  const row = el('div', { class: `sg-member-row${isLeader ? ' is-leader' : ''}` });

  // Portrait
  const ava = el('div', { class: 'sg-member-avatar' });
  ava.appendChild(headshotImg(w.name, { width: 36, height: 36, alt: w.name }));
  row.appendChild(ava);

  // Info
  const info = el('div', { class: 'sg-member-info' });
  const nameEl = el('div', { class: 'sg-member-name' });
  if (isLeader) nameEl.innerHTML = `<span class="leader-star">★</span>${w.name}`;
  else nameEl.textContent = w.name;
  info.appendChild(nameEl);
  info.appendChild(el('div', { class: 'sg-member-archetype', text: p.archetype }));
  info.appendChild(el('div', { class: 'sg-member-trait', text: p.trait }));
  row.appendChild(info);

  // Right: standing + mood + arc
  const right = el('div', { class: 'sg-member-right' });
  right.appendChild(el('span', { class: `sg-standing ${p.standing.cls}`, text: p.standing.label }));
  right.appendChild(el('span', { class: `sg-mood-dot ${p.moodCls}`, text: `● Morale ${p.morale}`, title: `Morale: ${p.morale}` }));

  const arc  = Number(w._arcStreak  || 0);
  const inac = Number(w.weeksInactive || 0);
  if (arc >= 3) {
    right.appendChild(el('span', { class: 'sg-arc-hot', text: `\u25b2 Hot`, title: `Hot streak: ${arc} weeks` }));
  } else if (arc <= -3 || inac >= 4) {
    right.appendChild(el('span', { class: 'sg-arc-cold', text: `\u25bc Cold`, title: `Off TV: ${inac}w` }));
  }

  row.appendChild(right);

  return row;
}

// ── Render loners ─────────────────────────────────────────────────────
function renderLoners(brand, state, groups) {
  const grouped = new Set(groups.flatMap(g => g.members));
  const loners  = (state.roster || []).filter(w =>
    w.brand === brand && w.active !== false && !w.retired &&
    !(Number(w.injuryWeeks) > 0) && !grouped.has(w.name)
  );
  if (!loners.length) return null;

  const sec = el('div', { class: 'sg-loner-section' },
    el('div', { class: 'sg-loner-label', text: 'No group affiliation' })
  );
  const chips = el('div', { class: 'sg-loner-chips' });
  for (const w of loners) chips.appendChild(el('span', { class: 'sg-loner-chip', text: w.name }));
  sec.appendChild(chips);
  return sec;
}

// ── Render rivalries panel ────────────────────────────────────────────
function renderRivalries(rivalries, allGroups) {
  const byId = Object.fromEntries(allGroups.map(g => [g.id, g]));

  const sec = el('div', { class: 'sg-rival-section' },
    el('div', { class: 'sg-rival-title', text: 'Active Inter-Group Rivalries' })
  );

  if (!rivalries.length) {
    sec.appendChild(el('div', { class: 'sg-rival-none', text: 'No rivalries detected this week.' }));
    return sec;
  }

  const list = el('div', { class: 'sg-rival-list' });
  for (const r of rivalries) {
    const gA = byId[r.groupA], gB = byId[r.groupB];
    if (!gA || !gB) continue;
    list.appendChild(el('div', { class: 'sg-rival-row' },
      el('span', { class: 'sg-rival-grp', text: gA.name }),
      el('span', { class: 'sg-rival-vs',  text: 'vs' }),
      el('span', { class: 'sg-rival-grp', text: gB.name }),
      el('span', { class: 'sg-rival-heat', text: `Rapport avg: ${r.avgTrust}` })
    ));
  }
  sec.appendChild(list);
  return sec;
}

// ── Main render ───────────────────────────────────────────────────────
function render() {
  injectStyles();
  const root = document.getElementById('social-groups-root');
  if (!root) return;

  const state = boot();
  if (!state) {
    root.innerHTML = '<div style="padding:20px;opacity:.5;">No save found. Start a game first.</div>';
    return;
  }

  const rawGroups = computeSocialGroups(state, 'RAW');
  const sdGroups  = computeSocialGroups(state, 'SD');
  const allGroups = [...rawGroups, ...sdGroups];
  const rivalries = computeGroupRivalries(state, allGroups);

  const rivalIds = new Set(rivalries.flatMap(r => [r.groupA, r.groupB]));

  const page = el('div', { class: 'sg-page' });

  // Header
  page.appendChild(el('div', { class: 'sg-page-header' },
    el('div', {},
      el('div', { class: 'sg-page-title', text: 'Social Groups & Backstage Politics' }),
      el('div', { class: 'sg-page-sub', text: `Week ${state.week || 1} · ${allGroups.length} groups · ${rivalries.length} rivalr${rivalries.length === 1 ? 'y' : 'ies'} · Groups recompute each week from live data` })
    )
  ));

  // RAW
  const rawSec = el('div', { class: 'sg-brand-section' },
    el('div', { class: 'sg-brand-label raw', text: 'RAW' })
  );
  if (!rawGroups.length) {
    rawSec.appendChild(el('div', { class: 'sg-empty', text: 'No social groups on RAW this week — relationships may be too neutral.' }));
  } else {
    const grid = el('div', { class: 'sg-groups-grid' });
    for (const g of rawGroups) grid.appendChild(renderGroupCard(state, g, rivalIds.has(g.id)));
    rawSec.appendChild(grid);
  }
  const rawLoners = renderLoners('RAW', state, rawGroups);
  if (rawLoners) rawSec.appendChild(rawLoners);
  page.appendChild(rawSec);

  // SD
  const sdSec = el('div', { class: 'sg-brand-section' },
    el('div', { class: 'sg-brand-label sd', text: 'SMACKDOWN' })
  );
  if (!sdGroups.length) {
    sdSec.appendChild(el('div', { class: 'sg-empty', text: 'No social groups on SmackDown this week.' }));
  } else {
    const grid = el('div', { class: 'sg-groups-grid' });
    for (const g of sdGroups) grid.appendChild(renderGroupCard(state, g, rivalIds.has(g.id)));
    sdSec.appendChild(grid);
  }
  const sdLoners = renderLoners('SD', state, sdGroups);
  if (sdLoners) sdSec.appendChild(sdLoners);
  page.appendChild(sdSec);

  // Rivalries
  page.appendChild(renderRivalries(rivalries, allGroups));

  root.innerHTML = '';
  root.appendChild(page);
}

function boot_and_render() {
  render();

  // Force-refresh DB pairs so groups always reflect latest seeded data.
  // If the fetch returns new data, re-render once automatically.
  const state = boot();
  if (state) {
    forceHydrateRelPairs(state);
    window.addEventListener('wwf:rels-updated', () => render(), { once: true });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot_and_render);
else boot_and_render();
