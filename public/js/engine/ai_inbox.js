// js/engine/ai_inbox.js
// Auto-resolve inbox for non-player brands (single-player mode).
// Keeps messages in save (for future multiplayer), but player never sees them.

import { applyEffects } from './state_effects.js';
import { applySituationChoice } from '../situations_ui.js';

function normBrand(b){
  const s = String(b||'').toUpperCase();
  if (s === 'GLOBAL')      return 'GLOBAL';
  if (s === 'SD')          return 'SD';
  if (s.includes('SMACK')) return 'SD';
  if (s === 'RAW')         return 'RAW';
  if (s.includes('RAW'))   return 'RAW';
  return undefined;
}

function getPlayerBrand(state){
  const cand =
    state.playerBrand || state.myBrand || state.brand || state.career?.brand || 'RAW';
  const norm = String(cand||'RAW').toUpperCase();
  return norm.includes('SMACK') ? 'SD' : 'RAW';
}

function scoreEffects(effects){
  let score = 0;
  for (const e of (effects||[])){
    if (!e || typeof e !== 'object') continue;
    const d = Number(e.delta || 0);

    if (e.stat === 'morale')         score += d * 2.0;
    else if (e.stat === 'momentum')  score += d * 1.5;
    else if (e.stat === 'starpower') score += d * 0.7;
    else                            score += d * 0.3;
  }
  return score;
}

function pickActionAI(m){
  const acts = Array.isArray(m.actions) ? m.actions : [];
  if (!acts.length) return null;

  let best = null;
  for (const a of acts){
    const sc = scoreEffects(a.effects);
    if (!best || sc > best.sc || (sc === best.sc && String(a.key) < String(best.a.key))){
      best = { a, sc };
    }
  }
  return best ? best.a : null;
}

async function pickSituationChoiceAI(state, mail){
  const key = mail?.situation?.key;

  const preference = {
    LEFT_OFF_SHOW:     ['REASSURE','HONEST','DISMISS'],
    POLITICS_LOBBY:    ['WARN','IGNORE','SUPPORT'],
    SAFETY_INCIDENT:   ['PROTECT_LOCKER','SIDEBAR','DOWNPLAY'],
    ALTERCATION:       ['MEDIATE','WARN_BOTH','PICK_SIDE'],
    DIRTY_FINISH_BEEF: ['ACKNOWLEDGE','BACK_FINISH','MOVE_ON'],
  };

  const ordered = preference[key] || [];

  try{
    const mod = await import('../situations_ui.js'); // avoid circular import in some setups
    const getSituationChoices = mod.getSituationChoices;
    const choices = (typeof getSituationChoices === 'function')
      ? (getSituationChoices(state, mail) || [])
      : [];

    const keys = new Set(choices.map(c=>c.key));
    for (const k of ordered) if (keys.has(k)) return k;

    return choices[0]?.key || ordered[0] || null;
  }catch{
    return ordered[0] || null;
  }
}

export async function autoResolveNonPlayerInbox(state, opts = {}){
  if (!state) return;

  const playerBrand = getPlayerBrand(state);

  const src = (Array.isArray(state.inboxAll) && state.inboxAll.length)
    ? state.inboxAll
    : (Array.isArray(state.inbox) ? state.inbox : []);

  for (const m of src){
    if (!m || typeof m !== 'object') continue;
    if (m.resolved) continue;

    const b = normBrand(m.brand) || playerBrand;
    if (b === 'GLOBAL') continue;
    if (b === playerBrand) continue;

    // situations
    if (m.type === 'situation' && m.situation?.key){
      const chosenKey = await pickSituationChoiceAI(state, m);
      if (!chosenKey) continue;

      try{
        applySituationChoice(state, m, chosenKey);
        m.aiResolved = true;
        m.choice = chosenKey;
        m.resolved = true;
      }catch(e){
        console.warn('[ai_inbox] applySituationChoice failed:', e);
      }
      continue;
    }

    // normal mails with actions
    const a = pickActionAI(m);
    if (!a) continue;

    try{
      const why = `AI Inbox (${b}): ${m.title || 'Message'} (${a.key})`;
      applyEffects(state, a.effects || [], { why, week: m.week ?? state.week });
      m.aiResolved = true;
      m.choice = a.key;
      m.resolved = true;
    }catch(e){
      console.warn('[ai_inbox] applyEffects failed:', e);
    }
  }
}
