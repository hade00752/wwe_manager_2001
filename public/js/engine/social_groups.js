// public/js/engine/social_groups.js
//
// Dynamic social group system — groups are DERIVED from existing data each week.
// No hardcoded factions. Groups form from:
//   1. DB rapport / flags (tag, family, stable, former_stable — strongest signal)
//   2. Alignment match (face/heel cohort bonding)
//   3. Seniority tier match (veterans cluster, rising stars cluster)
//   4. Likeability (high-likeability acts attract, low repel)
//   5. Professionalism / trait compatibility
//   6. Shared style tags + relevant trait pairs
//   7. Storyline co-membership
//
// Groups create lateral pressure:
//   - Favour one member  → group mates feel solidarity, rival group feels jealous
//   - Mistreat one member → group mates feel it, rival group feels satisfaction
//   - Ignoring a tight group → collective lobby for TV time
//   - Cross-group feuds over titles / pushes → backstage politics inbox events

import { getPair, getPairView } from './relationships.js';
import { pushInbox } from './inbox_store.js';
import { applyEffects } from './state_effects.js';

// ── Tuning ──────────────────────────────────────────────────────────
const AFFINITY_THRESHOLD    = 14;  // lowered: DB rapport alone at 15 now surpasses this
const MIN_GROUP_SIZE        =  2;
const MAX_GROUP_SIZE        =  6;
const RIVAL_TRUST_THRESHOLD = -10; // avg cross-group rapport this negative → rivals

const SPREAD = {
  pushed:     { mates: +3, rivals: -4 },
  favored:    { mates: +2, rivals: -3 },
  squashed:   { mates: -3, rivals: +3 },
  mistreated: { mates: -2, rivals: +2 },
  ignored:    { mates: -1, rivals:  0 },
};

// ── Helpers ─────────────────────────────────────────────────────────

function num(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo)); }

// Seniority tier: 0=rookie, 1=midcard, 2=veteran, 3=legend
function seniorityTier(w) {
  const rep = num(w.reputation, num(w.starpower, 50));
  const traits = [...(w.traitIds || []), ...(w.traits?.status || []), ...(w.traits?.core || [])];
  if (traits.includes('Legend') || rep >= 82)  return 3;
  if (traits.includes('Veteran') || rep >= 68)  return 2;
  if (rep >= 52)                                return 1;
  return 0;
}

function hasAnyTrait(w, ...ids) {
  const all = new Set([
    ...(w.traitIds || []),
    ...(w.traits?.core   || []),
    ...(w.traits?.status || []),
    ...(w.traits?.rare   || []),
  ]);
  return ids.some(id => all.has(id));
}

function sharedTagCount(a, b) {
  const aSet = new Set([...(a.styleTags || []), ...(a.traitIds || [])]);
  let count = 0;
  for (const t of [...(b.styleTags || []), ...(b.traitIds || [])]) {
    if (aSet.has(t)) count++;
  }
  return Math.min(count, 4);
}

// ── Core affinity formula ────────────────────────────────────────────

function pairAffinity(state, brand, a, b) {
  const view = getPairView(state, a.name, b.name);

  // ── 1. DB rapport (base relationship signal, weighted more heavily now) ──
  const dbRapport = num(view?.db?.rapport, 0);
  const liveRap   = num(view?.live?.dRapport, 0);
  const rapport   = clamp(dbRapport + liveRap, -50, 50);
  const rapScore  = rapport * 1.2;   // was 0.55 — rapport is the primary signal

  // ── 2. DB flags (tag/family/stable = strongest known bonds) ──────────────
  const flags = Array.isArray(view?.db?.flags) ? view.db.flags : [];
  let flagBonus = 0;
  if (flags.includes('family'))         flagBonus += 32;  // Hardy Boyz, Dudleys
  if (flags.includes('tag'))            flagBonus += 25;  // tag teams
  if (flags.includes('stable'))         flagBonus += 22;  // active stable mates
  if (flags.includes('former_stable'))  flagBonus += 12;  // DX alumni etc.
  if (flags.includes('romance'))        flagBonus += 20;  // on-screen / off-screen couple
  if (flags.includes('professional'))   flagBonus += 8;   // professional respect

  // ── 3. Alignment match ───────────────────────────────────────────────────
  // Kept deliberately modest so alignment alone NEVER reaches threshold 14.
  // It amplifies other signals rather than being the primary driver.
  const alignBonus =
    (a.alignment && b.alignment && a.alignment === b.alignment) ? 4 : -6;

  // ── 4. Seniority tier match ──────────────────────────────────────────────
  // Same tier → mild affinity, far apart → mild friction.
  // Kept small so it amplifies, not decides.
  const tierA = seniorityTier(a), tierB = seniorityTier(b);
  const tierDiff = Math.abs(tierA - tierB);
  // Same tier: +3  |  1 tier apart: +1  |  2+ tiers: -4
  const seniorityBonus = tierDiff === 0 ? 3 : tierDiff === 1 ? 1 : -4;

  // ── 5. Likeability synergy ───────────────────────────────────────────────
  const likeA = num(a.likeability, 60), likeB = num(b.likeability, 60);
  const avgLike = (likeA + likeB) / 2;
  // High mutual likeability = easier to form bonds; low = friction
  const likeBonus = clamp((avgLike - 58) * 0.35, -8, 10);

  // ── 6. Professionalism match ─────────────────────────────────────────────
  const profA = num(a.professionalism, 60), profB = num(b.professionalism, 60);
  const avgProf = (profA + profB) / 2;
  const profBonus = clamp((avgProf - 58) * 0.2, -4, 6);

  // ── 7. Trait-pair modifiers ──────────────────────────────────────────────
  let traitMod = 0;

  // LoneWolf always resists grouping with anyone
  if (hasAnyTrait(a, 'LoneWolf') || hasAnyTrait(b, 'LoneWolf')) traitMod -= 20;

  // Politickers clash with other politickers
  if (hasAnyTrait(a, 'Politicker') && hasAnyTrait(b, 'Politicker')) traitMod -= 10;

  // LockerRoomLeader attracts people / is attracted to other leaders (mentor dynamic)
  if (hasAnyTrait(a, 'LockerRoomLeader') || hasAnyTrait(b, 'LockerRoomLeader')) traitMod += 6;

  // TeamPlayer bonds strongly with others
  if (hasAnyTrait(a, 'TeamPlayer') && hasAnyTrait(b, 'TeamPlayer')) traitMod += 8;
  else if (hasAnyTrait(a, 'TeamPlayer') || hasAnyTrait(b, 'TeamPlayer'))  traitMod += 4;

  // StableMember explicitly bonded to a unit
  if (hasAnyTrait(a, 'StableMember') && hasAnyTrait(b, 'StableMember')) traitMod += 10;

  // TagTeamSpecialist naturally works closely with others
  if (hasAnyTrait(a, 'TagTeamSpecialist') && hasAnyTrait(b, 'TagTeamSpecialist')) traitMod += 6;

  // CompanyGuy bonds with management-friendly types
  if (hasAnyTrait(a, 'CompanyGuy') && hasAnyTrait(b, 'CompanyGuy')) traitMod += 5;

  // BulldogEnforcer in a pair (locker room tough love)
  if (hasAnyTrait(a, 'BulldogEnforcer') && hasAnyTrait(b, 'BulldogEnforcer')) traitMod += 4;

  // SeriousPro to SeriousPro (shoot-style respect)
  if (hasAnyTrait(a, 'SeriousPro') && hasAnyTrait(b, 'SeriousPro')) traitMod += 5;

  // Partier/problematic types cluster (for better or worse)
  if (hasAnyTrait(a, 'Partier') && hasAnyTrait(b, 'Partier')) traitMod += 6;

  // FanFavorite acts gravitate together
  if (hasAnyTrait(a, 'FanFavorite') && hasAnyTrait(b, 'FanFavorite')) traitMod += 4;

  // Incompatible archetypes
  const aIsEnforcer = hasAnyTrait(a, 'BulldogEnforcer', 'Shooter');
  const bIsShowman  = hasAnyTrait(b, 'Showman', 'FlashyRiskTaker');
  if (aIsEnforcer && bIsShowman) traitMod -= 6;
  const bIsEnforcer = hasAnyTrait(b, 'BulldogEnforcer', 'Shooter');
  const aIsShowman  = hasAnyTrait(a, 'Showman', 'FlashyRiskTaker');
  if (bIsEnforcer && aIsShowman) traitMod -= 6;

  // ── 8. Shared style/trait tags ──────────────────────────────────────────
  const tagBonus = sharedTagCount(a, b) * 5;  // 5 per shared tag (was 4)

  // ── 9. Story co-membership ──────────────────────────────────────────────
  const stories = state.storylines?.[brand] || [];
  const sameFaction = stories.some(s =>
    Array.isArray(s.names) &&
    s.names.includes(a.name) &&
    s.names.includes(b.name) &&
    s.type !== 'feud'
  );
  const storyBonus = sameFaction ? 20 : 0;

  // Opposite sides of active feud → mild antipathy
  const feudedAgainst = stories.some(s =>
    s.type === 'feud' &&
    Array.isArray(s.names) &&
    (s.names.includes(a.name) !== s.names.includes(b.name))
  ) ? -5 : 0;

  // ── Total ────────────────────────────────────────────────────────────────
  return rapScore + flagBonus + alignBonus + seniorityBonus + likeBonus + profBonus + traitMod + tagBonus + storyBonus + feudedAgainst;
}

// ── Union-Find ───────────────────────────────────────────────────────
class UnionFind {
  constructor(keys) {
    this.p = {}; this.r = {};
    keys.forEach(k => { this.p[k] = k; this.r[k] = 0; });
  }
  find(x) {
    if (this.p[x] !== x) this.p[x] = this.find(this.p[x]);
    return this.p[x];
  }
  union(x, y) {
    const rx = this.find(x), ry = this.find(y);
    if (rx === ry) return;
    if (this.r[rx] < this.r[ry])      this.p[rx] = ry;
    else if (this.r[rx] > this.r[ry]) this.p[ry] = rx;
    else                              { this.p[ry] = rx; this.r[rx]++; }
  }
}

// ── Leader selection (starpower + reputation + likeability + traits) ──
function leaderScore(w) {
  const sp   = num(w.starpower, 50);
  const rep  = num(w.reputation, 50);
  const like = num(w.likeability, 50);
  const prof = num(w.professionalism, 50);
  let bonus = 0;
  if (hasAnyTrait(w, 'LockerRoomLeader')) bonus += 15;
  if (hasAnyTrait(w, 'BrandCaptain'))     bonus += 10;
  if (hasAnyTrait(w, 'Veteran', 'Legend'))bonus += 8;
  if (hasAnyTrait(w, 'Politicker'))       bonus += 5;   // not always good but they dominate
  if (hasAnyTrait(w, 'LoneWolf'))         bonus -= 20;  // lone wolves aren't leaders
  return sp * 0.38 + rep * 0.25 + like * 0.22 + prof * 0.15 + bonus;
}

// ── Group name derivation ─────────────────────────────────────────────
const STYLE_LABELS = {
  Technical:  'The Technicians',
  Power:      'The Powerhouses',
  HighFlyer:  'The High Flyers',
  Brawler:    'The Brawlers',
  Showman:    'The Entertainers',
  Submission: 'The Submission Crew',
  Hardcore:   'The Hardcore Bunch',
};

const SENIORITY_LABELS = [
  'The Rookies',
  'The Midcard Pack',
  'The Veterans',
  'The Legends',
];

function deriveGroupName(leader, members) {
  // Shared style → style-based name
  const leaderStyles = leader.styleTags || [];
  for (const style of leaderStyles) {
    if (STYLE_LABELS[style] && members.every(m => (m.styleTags || []).includes(style))) {
      return STYLE_LABELS[style];
    }
  }

  // All same seniority tier → tier name
  const tiers = members.map(m => seniorityTier(m));
  if (tiers.every(t => t === tiers[0])) {
    return SENIORITY_LABELS[tiers[0]];
  }

  // All same alignment → alignment name
  const align = leader.alignment || 'neutral';
  const allSameAlign = members.every(m => m.alignment === align);

  if (allSameAlign && align === 'heel') return `${leader.name}'s Crew`;
  if (allSameAlign && align === 'face') return `${leader.name}'s Alliance`;

  // Mixed alignment (uneasy truce) or diverse
  const seniorLabel = seniorityTier(leader) >= 2 ? 'Veteran' : 'Rising';
  return `${leader.name}'s ${seniorLabel} Bloc`;
}

// ── Core: compute groups for a brand ─────────────────────────────────
export function computeSocialGroups(state, brand) {
  const roster = (state.roster || []).filter(w =>
    w.brand === brand &&
    w.active !== false &&
    !w.retired &&
    !(num(w.injuryWeeks) > 0)
  );

  if (roster.length < MIN_GROUP_SIZE) return [];

  // Build all affinities
  const uf = new UnionFind(roster.map(w => w.name));
  const affinityCache = new Map();

  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i], b = roster[j];
      // LoneWolves never cluster with anyone regardless of other signals
      if (hasAnyTrait(a, 'LoneWolf') || hasAnyTrait(b, 'LoneWolf')) {
        affinityCache.set(`${a.name}|${b.name}`, -999);
        continue;
      }
      const aff = pairAffinity(state, brand, a, b);
      affinityCache.set(`${a.name}|${b.name}`, aff);
      if (aff >= AFFINITY_THRESHOLD) uf.union(a.name, b.name);
    }
  }

  // Collect clusters
  const clusterMap = new Map();
  for (const w of roster) {
    const root = uf.find(w.name);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(w);
  }

  const groups = [];

  for (const [, members] of clusterMap) {
    if (members.length < MIN_GROUP_SIZE) continue;

    // Leader = highest leaderScore in cluster
    const sorted = [...members].sort((a, b) => leaderScore(b) - leaderScore(a));
    const leader = sorted[0];

    // Cap size: keep members with highest affinity TO LEADER (not just starpower)
    let finalMembers = sorted;
    if (finalMembers.length > MAX_GROUP_SIZE) {
      // Always keep leader; rank rest by affinity to leader
      const rest = sorted.slice(1).map(m => {
        const key  = `${leader.name}|${m.name}`;
        const rkey = `${m.name}|${leader.name}`;
        const aff  = affinityCache.get(key) ?? affinityCache.get(rkey) ?? 0;
        return { m, aff };
      }).sort((a, b) => b.aff - a.aff);
      finalMembers = [leader, ...rest.slice(0, MAX_GROUP_SIZE - 1).map(x => x.m)];
    }

    // Collective stats
    const mood = Math.round(
      finalMembers.reduce((s, m) => s + num(m.morale, 65), 0) / finalMembers.length
    );

    // Cohesion = avg pairwise affinity (normalised 0-100)
    let totalAff = 0, pairs = 0;
    for (let i = 0; i < finalMembers.length; i++) {
      for (let j = i + 1; j < finalMembers.length; j++) {
        const key  = `${finalMembers[i].name}|${finalMembers[j].name}`;
        const rkey = `${finalMembers[j].name}|${finalMembers[i].name}`;
        totalAff += affinityCache.get(key) ?? affinityCache.get(rkey) ?? 0;
        pairs++;
      }
    }
    const rawCohesion = pairs ? totalAff / pairs : 0;
    // Affinity now ranges roughly −60..+100, map to 0-100
    const cohesion = Math.round(clamp((rawCohesion + 30) * (100 / 130), 0, 100));

    // Influence: leaderScore + avg momentum
    const avgMom = finalMembers.reduce((s, m) => s + num(m.momentum, 50), 0) / finalMembers.length;
    const influence = Math.round(leaderScore(leader) * 0.55 + avgMom * 0.45);

    // Seniority label for the group
    const tierCounts = [0, 0, 0, 0];
    finalMembers.forEach(m => tierCounts[seniorityTier(m)]++);
    const dominantTier = tierCounts.indexOf(Math.max(...tierCounts));

    const id = `grp_${brand}_${leader.name.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase()}`;

    groups.push({
      id,
      brand,
      name:         deriveGroupName(leader, finalMembers),
      leaderName:   leader.name,
      members:      finalMembers.map(m => m.name),
      mood,
      cohesion,
      influence,
      alignment:    leader.alignment || 'neutral',
      seniorityTier: dominantTier,   // new: exposed for UI
    });
  }

  return groups;
}

// ── Rivalries: cross-group avg rapport below threshold ───────────────
export function computeGroupRivalries(state, groups) {
  const rivalries = [];

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      if (a.brand !== b.brand) continue;

      let total = 0, count = 0;
      for (const ma of a.members) {
        for (const mb of b.members) {
          const view = getPairView(state, ma, mb);
          total += num(view?.effective?.rapport, 0);
          count++;
        }
      }
      const avgTrust = count ? Math.round(total / count) : 0;
      if (avgTrust <= RIVAL_TRUST_THRESHOLD) {
        rivalries.push({ groupA: a.id, groupB: b.id, avgTrust });
      }
    }
  }

  return rivalries;
}

// ── Group lookup ─────────────────────────────────────────────────────
export function getWrestlerGroup(groups, name) {
  return (groups || []).find(g => g.members.includes(name)) || null;
}

// ── Compute and cache groups + rivalries for both brands ─────────────
export function refreshSocialGroups(state) {
  const RAW_groups = computeSocialGroups(state, 'RAW');
  const SD_groups  = computeSocialGroups(state, 'SD');

  state.socialGroups   = { RAW: RAW_groups, SD: SD_groups };
  state.groupRivalries = computeGroupRivalries(state, [...RAW_groups, ...SD_groups]);
}

// ── Effect propagation ───────────────────────────────────────────────
export function groupBookingEffect(state, wrestlerName, event) {
  const allGroups = [
    ...(state.socialGroups?.RAW || []),
    ...(state.socialGroups?.SD  || []),
  ];
  const rivalries = state.groupRivalries || [];
  const spread    = SPREAD[event] || SPREAD.favored;
  const group     = getWrestlerGroup(allGroups, wrestlerName);

  if (!group) return [];

  const effects = [];

  for (const mate of group.members) {
    if (mate === wrestlerName) continue;
    effects.push({ kind: 'w', name: mate, stat: 'morale', delta: spread.mates });
  }

  if (spread.rivals !== 0) {
    const rivalGroupIds = rivalries
      .filter(r => r.groupA === group.id || r.groupB === group.id)
      .map(r => r.groupA === group.id ? r.groupB : r.groupA);

    for (const rid of rivalGroupIds) {
      const rg = allGroups.find(g => g.id === rid);
      if (!rg) continue;
      for (const rival of rg.members) {
        effects.push({ kind: 'w', name: rival, stat: 'morale', delta: spread.rivals });
      }
    }
  }

  return effects;
}

// ── Weekly politics inbox events ─────────────────────────────────────
export function processGroupPolitics(state, brand, results) {
  const allGroups = [
    ...(state.socialGroups?.RAW || []),
    ...(state.socialGroups?.SD  || []),
  ];
  const brandGroups = allGroups.filter(g => g.brand === brand);
  const rivalries   = state.groupRivalries || [];
  const week        = state.week || 1;

  state._grpMailSeen ||= {};

  for (const group of brandGroups) {
    // ── 1. Low collective mood → locker room tension ──────────────────
    if (group.mood < 45 && group.members.length >= 2) {
      const key = `grp_mood:${group.id}:w${week}`;
      if (!state._grpMailSeen[key]) {
        const names = group.members.slice(0, 3).join(', ');
        pushInbox(state, brand, {
          from:  group.leaderName,
          title: 'Locker Room Tension',
          body:
            `There's real frustration building with ${group.name}. ` +
            `${names}${group.members.length > 3 ? ' and others' : ''} feel like ` +
            `creative isn't giving them what they need.`,
          names:   group.members.slice(),
          tags:    ['group-politics', 'low-mood'],
          actions: [
            {
              key:     'ADDRESS_GROUP',
              label:   'MEET WITH THEM — PROMISE THINGS WILL IMPROVE',
              effects: group.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +4 })),
            },
            {
              key:     'IGNORE_GROUP',
              label:   "IGNORE IT — THEY'LL GET OVER IT",
              effects: group.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: -2 })),
            },
          ],
        }, 'brand');
        state._grpMailSeen[key] = true;
      }
    }

    // ── 2. High-cohesion group barely featured → request TV together ──
    const bookedSet   = new Set((results || []).flatMap(r => r.names || []));
    const bookedCount = group.members.filter(n => bookedSet.has(n)).length;

    if (group.cohesion >= 55 && bookedCount < 2 && group.members.length >= 2) {
      const stagger = group.members.length % 4;
      if (week % 4 === stagger) {
        const key = `grp_tv:${group.id}:w${week}`;
        if (!state._grpMailSeen[key]) {
          pushInbox(state, brand, {
            from:  group.leaderName,
            title: `${group.name} Want More Together`,
            body:
              `${group.leaderName} says the group hasn't been featured together lately. ` +
              `They're tight — give them a tag or a shared angle and it'll pay off.`,
            names: group.members.slice(),
            tags:  ['group-politics', 'tv-request'],
          }, 'brand');
          state._grpMailSeen[key] = true;
        }
      }
    }
  }

  // ── 3. Rival group title change → lobby event ─────────────────────
  const titleChangeSegs = (results || []).filter(r =>
    Array.isArray(r.tags) && r.tags.some(t => String(t).includes('title change'))
  );

  for (const seg of titleChangeSegs) {
    const winner = (seg.explain?.winners || seg.names || [])[0];
    if (!winner) continue;

    const winnerGroup = getWrestlerGroup(allGroups, winner);
    if (!winnerGroup || winnerGroup.brand !== brand) continue;

    const rivalGroupIds = rivalries
      .filter(r => r.groupA === winnerGroup.id || r.groupB === winnerGroup.id)
      .map(r => r.groupA === winnerGroup.id ? r.groupB : r.groupA);

    for (const rid of rivalGroupIds) {
      const rg = allGroups.find(g => g.id === rid && g.brand === brand);
      if (!rg) continue;

      const key = `grp_lobby:${rg.id}:vs:${winnerGroup.id}:w${week}`;
      if (state._grpMailSeen[key]) continue;

      pushInbox(state, brand, {
        from:  rg.leaderName,
        title: "That Should've Been Us",
        body:
          `${rg.leaderName} isn't happy. ${rg.name} feels like they were passed over ` +
          `for ${winnerGroup.name} again. The resentment back there is real.`,
        names:   rg.members.slice(),
        tags:    ['group-politics', 'title-jealousy'],
        actions: [
          {
            key:    'DISMISS_LOBBY',
            label:  "CREATIVE'S CALL — MOVE ON",
            effects: rg.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: -3 })),
          },
          {
            key:    'PROMISE_NEXT_RUN',
            label:  `PROMISE ${rg.name.toUpperCase()} THEIR TURN IS COMING`,
            effects: [
              ...rg.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +4 })),
              {
                kind:    'promise',
                type:    'matchNextWeek',
                brand,
                names:   rg.members.slice(),
                weeks:   3,
                onKeep:  { kind: 'w', name: rg.leaderName, stat: 'morale', delta: +6 },
                onBreak: { kind: 'w', name: rg.leaderName, stat: 'morale', delta: -10 },
              },
            ],
          },
        ],
      }, 'brand');
      state._grpMailSeen[key] = true;
    }
  }

  // ── 4. Escalating rivalry: deep inter-group tension ───────────────
  for (const rivalry of rivalries) {
    const grpA = allGroups.find(g => g.id === rivalry.groupA && g.brand === brand);
    const grpB = allGroups.find(g => g.id === rivalry.groupB && g.brand === brand);
    if (!grpA || !grpB) continue;

    if (rivalry.avgTrust > -22) continue;

    const key = `grp_tension:${rivalry.groupA}:${rivalry.groupB}:w${week}`;
    if (state._grpMailSeen[key]) continue;

    if (week % 5 !== grpA.members.length % 5) continue;

    pushInbox(state, brand, {
      from:  'Agents',
      title: 'Backstage Friction',
      body:
        `${grpA.name} and ${grpB.name} are at each other's throats backstage. ` +
        `You may need to address the tension before it spills onto TV — ` +
        `or channel it into a program.`,
      names:   [...grpA.members, ...grpB.members],
      tags:    ['group-politics', 'rivalry-tension'],
      actions: [
        {
          key:    'CHANNEL_INTO_FEUD',
          label:  'LEAN INTO IT — BUILD A CROSS-GROUP FEUD',
          effects: [
            ...grpA.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +2 })),
            ...grpB.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +2 })),
          ],
        },
        {
          key:    'DEFUSE_TENSION',
          label:  'SEPARATE THEM — KEEP THE PEACE',
          effects: [
            ...grpA.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +1 })),
            ...grpB.members.map(n => ({ kind: 'w', name: n, stat: 'morale', delta: +1 })),
          ],
        },
      ],
    }, 'brand');
    state._grpMailSeen[key] = true;
  }
}
