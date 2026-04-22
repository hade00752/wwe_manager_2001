// public/js/situations.js
// UI-only RPG dialogue logic for inbox situations.
// No randomness. No engine imports except effects execution upstream.
//
// This file now also provides the missing "hooks":
// - sanitizeInboxAll(state): remove null mail entries safely
// - applySituationChoice(state, mail, choiceKey): apply effects, advance stage, resolve, audit
// - getSituationChoices(state, mail): convenience for UI rendering

function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }
function clamp100(x){ return Math.max(0, Math.min(100, Number(x)||0)); }

export function sanitizeInboxAll(state){
  if (!state || typeof state !== 'object') return;
  if (Array.isArray(state.inboxAll)) state.inboxAll = state.inboxAll.filter(Boolean);
  if (Array.isArray(state.inbox))    state.inbox    = state.inbox.filter(Boolean);
}

// Apply a single effect object (your current effect format: {kind:'w', name, stat, delta})
function applyEffect(state, eff){
  if (!state || !eff || typeof eff !== 'object') return;

  // wrestler stat delta
  if (eff.kind === 'w'){
    const name = String(eff.name || '').trim();
    const stat = String(eff.stat || '').trim();
    const delta = Number(eff.delta || 0);

    if (!name || !stat || !Number.isFinite(delta)) return;

    const w = (state.roster || []).find(x => x && x.name === name);
    if (!w) return;

    const before = Number(w[stat]);
    const base = Number.isFinite(before) ? before : (stat === 'morale' ? 70 : 50);
    w[stat] = clamp100(base + delta);
    return;
  }

  // Future: brand/global effects etc can go here.
}

// Optional: attach an audit trail onto the mail so you can debug later
function auditStep(mail, payload){
  if (!mail || typeof mail !== 'object') return;
  mail.situation = mail.situation || {};
  mail.situation.audit = Array.isArray(mail.situation.audit) ? mail.situation.audit : [];
  mail.situation.audit.push({
    at: new Date().toISOString(),
    ...payload
  });
}

export function applySituationChoice(state, mail, choiceKey){
  if (!state || typeof state !== 'object') return { ok:false, error:'bad state' };
  if (!mail || typeof mail !== 'object') return { ok:false, error:'bad mail' };

  sanitizeInboxAll(state);

  // Must be a situation mail
  if (mail.type !== 'situation' || !mail.situation || !mail.situation.key){
    return { ok:false, error:'not a situation' };
  }

  const scr = getSituationScreen(state, mail);
  const choices = Array.isArray(scr?.choices) ? scr.choices : [];

  const key = String(choiceKey || '').trim();
  const chosen = choices.find(c => c && c.key === key);
  if (!chosen){
    return { ok:false, error:`unknown choice: ${key}` };
  }

  const effects = Array.isArray(chosen.effects) ? chosen.effects : [];
  for (const eff of effects) applyEffect(state, eff);

  // advance stage / resolve
  const sit = mail.situation;
  const prevStage = Number(sit.stage || 0);

  if (chosen.resolve){
    mail.resolved = true;
  } else if (chosen.nextStage != null){
    sit.stage = Number(chosen.nextStage);
  } else {
    sit.stage = prevStage + 1;
  }

  // store a tiny memory of what happened
  sit.memory = sit.memory || {};
  sit.memory.lastChoice = chosen.key;

  auditStep(mail, {
    key: sit.key,
    prevStage,
    nextStage: Number(sit.stage || 0),
    choice: chosen.key,
    effects: effects.map(e => ({ ...e }))
  });

  return { ok:true, resolved: !!mail.resolved, stage: Number(sit.stage || 0) };
}

export function getSituationChoices(state, mail){
  const scr = getSituationScreen(state, mail);
  return Array.isArray(scr?.choices) ? scr.choices : [];
}

export function getSituationScreen(state, mail){
  const sit   = mail.situation || {};
  const key   = sit.key;
  const stage = Number(sit.stage || 0);
  const mem   = sit.memory || {};
  const cast  = mem.names || [];
  const who   = mem.from || cast[0] || 'Someone';

  switch (key){
    case 'LEFT_OFF_SHOW':     return leftOffShow(who, mem, stage);
    case 'POLITICS_LOBBY':    return politicsLobby(who, mem, stage);
    case 'SAFETY_INCIDENT':   return safetyIncident(who, mem, stage);
    case 'ALTERCATION':       return altercation(who, mem, stage);
    case 'DIRTY_FINISH_BEEF': return dirtyFinishBeef(who, mem, stage);
    default:
      return fallback(mem);
  }
}

/* ------------------------------------------------------------------ */
/* LEFT OFF THE SHOW                                                   */
/* ------------------------------------------------------------------ */

function leftOffShow(who, mem, stage){
  if (stage === 0){
    return {
      title: 'Left Off The Show',
      body:
        `${who} closes the door behind them.\n\n` +
        `“I wasn’t on TV. I watched the whole show from catering.”\n\n` +
        `They’re not yelling. That’s worse.`,
      choices: [
        {
          key:'REASSURE',
          label:'Reassure them they’re part of the plan',
          effects:[{ kind:'w', name: who, stat:'morale', delta:+4 }],
          nextStage: 1
        },
        {
          key:'HONEST',
          label:'Be blunt: rotation happens',
          effects:[{ kind:'w', name: who, stat:'morale', delta:-1 }],
          nextStage: 1
        },
        {
          key:'DISMISS',
          label:'End the conversation quickly',
          effects:[{ kind:'w', name: who, stat:'morale', delta:-4 }],
          resolve:true
        }
      ]
    };
  }

  return {
    title: 'Conversation Ends',
    body:
      `${who} nods. They don’t look convinced.\n\n` +
      `This will be remembered.`,
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* BACKSTAGE POLITICS / LOBBYING                                       */
/* ------------------------------------------------------------------ */

function politicsLobby(who, mem, stage){
  const target = (mem.names || []).find(n => n !== who) || 'another wrestler';

  if (stage === 0){
    return {
      title: 'Backstage Politics',
      body:
        `You’re handed a quiet note.\n\n` +
        `${who} has been lobbying against ${target}.\n\n` +
        `Nothing public. Nothing provable. Just pressure.`,
      choices:[
        {
          key:'SUPPORT',
          label:`Side with ${who}`,
          effects:[
            { kind:'w', name: who, stat:'morale', delta:+3 },
            { kind:'w', name: target, stat:'morale', delta:-3 }
          ],
          nextStage: 1
        },
        {
          key:'WARN',
          label:`Warn ${who} to knock it off`,
          effects:[
            { kind:'w', name: who, stat:'morale', delta:-2 }
          ],
          nextStage: 1
        },
        {
          key:'IGNORE',
          label:'Ignore it and let it play out',
          effects:[],
          resolve:true
        }
      ]
    };
  }

  return {
    title: 'Pressure Continues',
    body:
      `Word spreads — not officially.\n\n` +
      `Both sides clock where you stood.`,
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* SAFETY INCIDENT                                                     */
/* ------------------------------------------------------------------ */

function safetyIncident(who, mem, stage){
  const victim = (mem.names || []).find(n => n !== who) || 'another wrestler';

  if (stage === 0){
    return {
      title: 'Safety Concern',
      body:
        `A producer flags you down.\n\n` +
        `${victim} feels ${who} worked too stiff.\n\n` +
        `No injury. But people noticed.`,
      choices:[
        {
          key:'SIDEBAR',
          label:`Have a private word with ${who}`,
          effects:[
            { kind:'w', name: who, stat:'morale', delta:-1 }
          ],
          nextStage: 1
        },
        {
          key:'PROTECT_LOCKER',
          label:`Publicly reinforce safety standards`,
          effects:[
            { kind:'w', name: victim, stat:'morale', delta:+2 }
          ],
          nextStage: 1
        },
        {
          key:'DOWNPLAY',
          label:'Downplay the concern',
          effects:[],
          resolve:true
        }
      ]
    };
  }

  return {
    title: 'Message Sent',
    body:
      `The room recalibrates.\n\n` +
      `Some feel safer. Some feel watched.`,
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* HEATED ALTERCATION                                                  */
/* ------------------------------------------------------------------ */

function altercation(who, mem, stage){
  const other = (mem.names || []).find(n => n !== who) || 'another wrestler';

  if (stage === 0){
    return {
      title: 'Heated Altercation',
      body:
        `Raised voices. Swearing.\n\n` +
        `${who} and ${other} had to be separated.\n\n` +
        `This could spiral.`,
      choices:[
        {
          key:'MEDIATE',
          label:'Pull them into a room and mediate',
          effects:[
            { kind:'w', name: who, stat:'morale', delta:+1 },
            { kind:'w', name: other, stat:'morale', delta:+1 }
          ],
          nextStage: 1
        },
        {
          key:'WARN_BOTH',
          label:'Issue a warning to both',
          effects:[
            { kind:'w', name: who, stat:'morale', delta:-1 },
            { kind:'w', name: other, stat:'morale', delta:-1 }
          ],
          nextStage: 1
        },
        {
          key:'PICK_SIDE',
          label:`Back ${who}`,
          effects:[
            { kind:'w', name: who, stat:'morale', delta:+3 },
            { kind:'w', name: other, stat:'morale', delta:-3 }
          ],
          resolve:true
        }
      ]
    };
  }

  return {
    title: 'Tension Lingers',
    body:
      `They leave separately.\n\n` +
      `You’ll feel this later.`,
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* DIRTY FINISH / RESPECT BEEF                                         */
/* ------------------------------------------------------------------ */

function dirtyFinishBeef(who, mem, stage){
  const other = (mem.names || []).find(n => n !== who) || 'their opponent';

  if (stage === 0){
    return {
      title: 'Respect Questioned',
      body:
        `${other} isn’t happy.\n\n` +
        `They felt the finish crossed a line.\n\n` +
        `“That wasn’t what we agreed.”`,
      choices:[
        {
          key:'BACK_FINISH',
          label:'Defend the finish as booked',
          effects:[
            { kind:'w', name: other, stat:'morale', delta:-2 }
          ],
          nextStage: 1
        },
        {
          key:'ACKNOWLEDGE',
          label:'Acknowledge their concern',
          effects:[
            { kind:'w', name: other, stat:'morale', delta:+2 }
          ],
          nextStage: 1
        },
        {
          key:'MOVE_ON',
          label:'Tell them to move on',
          effects:[
            { kind:'w', name: other, stat:'morale', delta:-3 }
          ],
          resolve:true
        }
      ]
    };
  }

  return {
    title: 'Issue Parked',
    body:
      `The air isn’t clear — but the conversation is over.`,
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}

/* ------------------------------------------------------------------ */

function fallback(mem){
  return {
    title: mem.title || 'Situation',
    body: mem.body || '',
    choices:[
      { key:'CLOSE', label:'Close', effects:[], resolve:true }
    ]
  };
}
