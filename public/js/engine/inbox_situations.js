// js/engine/inbox_situations.js
// Wrap certain inbox mails into RPG "situations" WITHOUT hardcoding people.
// Engine-side only: no DOM, no random rolls, no effects execution.
// It simply tags mails and swaps actions to an OPEN entrypoint.
//
// This file is safe for Node tests.

function norm(s){
  return String(s || '').toLowerCase().trim();
}

// Return a situation key based on the mail content.
// Priority matters: some titles/bodies overlap ("dirty" vs "not cool").
function situationKeyFor(m){
  const t = norm(m && m.title);
  const b = norm(m && m.body);

  // Highest-signal first
  if (t.includes('left off the show') || b.includes('left off the show')) return 'LEFT_OFF_SHOW';

  if (
    t.includes('backstage politics') ||
    b.includes('backstage politics') ||
    t.includes('lobbied') ||
    b.includes('lobbied') ||
    t.includes('lobby') ||
    b.includes('lobby')
  ) return 'POLITICS_LOBBY';

  if (
    t.includes('safety concern') ||
    b.includes('safety concern') ||
    t.includes('unsafe') ||
    b.includes('unsafe') ||
    t.includes('stiff') ||
    b.includes('stiff')
  ) return 'SAFETY_INCIDENT';

  if (
    t.includes('heated altercation') ||
    b.includes('heated altercation') ||
    t.includes('altercation') ||
    b.includes('altercation') ||
    t.includes('argument') ||
    b.includes('argument') ||
    t.includes('nearly turned physical') ||
    b.includes('nearly turned physical')
  ) return 'ALTERCATION';

  // Relationship “beef” style
  if (
    t.includes('not cool') ||
    b.includes('not cool') ||
    t.includes('dirty finish') ||
    b.includes('dirty finish') ||
    t.includes('dirty') ||
    b.includes('dirty')
  ) return 'DIRTY_FINISH_BEEF';

  return null;
}

function safeNames(m){
  if (Array.isArray(m && m.names) && m.names.length) {
    return m.names.filter(Boolean).map(String);
  }
  // fall back to "from" so we at least have a cast
  const from = (m && (m.actor || m.from)) ? String(m.actor || m.from) : null;
  return from ? [from] : [];
}

function makeSig(m, key){
  // A stable-ish signature to avoid re-wrapping the same message if it re-enters the list.
  // Uses key + title/body/from/week (if any).
  const from = String((m && (m.actor || m.from)) || '');
  const title = String((m && m.title) || '');
  const body = String((m && m.body) || '');
  const week = (m && (m.week != null)) ? String(m.week) : '';
  return `${key}::${week}::${from}::${title}::${body}`;
}

export function wrapInboxSituations(state, brand){
  if (!state) return;

  const all = Array.isArray(state.inboxAll)
    ? state.inboxAll
    : (Array.isArray(state.inbox) ? state.inbox : null);

  if (!Array.isArray(all)) return;

  // track what we've wrapped (so repeated calls in runShow don't keep changing actions)
  state._situationWrapped = state._situationWrapped || {};

  for (const m of all){
    if (!m || typeof m !== 'object') continue;
    if (m.resolved) continue;

    // already a situation? leave it alone.
    if (m.type === 'situation' && m.situation && m.situation.key) continue;

    // brand scope
    if (m.brand && m.brand !== 'GLOBAL' && m.brand !== brand) continue;

    const key = situationKeyFor(m);
    if (!key) continue;

    const sig = makeSig(m, key);
    if (state._situationWrapped[sig]) continue;
    state._situationWrapped[sig] = true;

    // preserve legacy mail actions (if any) so UI can offer "Quick resolve" later
    const legacy = Array.isArray(m.actions) ? m.actions : [];

    m.type = 'situation';
    m.situation = {
      key,
      stage: 0,
      // a place for UI to stash temporary choices without touching the generators
      memory: {
        from: m.actor || m.from || null,
        names: safeNames(m),
        title: m.title || '',
        body: m.body || ''
      }
    };

    // keep original, but don't risk mutation by reference
    m._legacyActions = legacy.map(a => ({ ...a, effects: Array.isArray(a.effects) ? a.effects.slice() : [] }));

    // Replace “email actions” with RPG entrypoint.
    // UI will intercept OPEN and launch the dialogue screen.
    m.actions = [
      { key:'OPEN', label:'OPEN SITUATION', effects:[] }
    ];
  }
}
