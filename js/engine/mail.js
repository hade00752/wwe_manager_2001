// public/js/engine/mail.js
// Tiny helper for pushing messages into the save's inbox.

import { saveState } from '../engine.js'; // re-use the barrel export

function makeId() {
  // short-ish unique id
  return 'mail_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
}

/**
 * pushMail(state, message)
 * message: { title, from, body, actions?, actor?, meta? }
 * - Unshifts to the front of the inbox (newest first)
 * - Adds id and createdAt (ISO string)
 * - Persists via saveState
 */
export function pushMail(state, message) {
  if (!state || typeof state !== 'object') return null;
  if (!Array.isArray(state.inbox)) state.inbox = [];

  const msg = {
    id: makeId(),
    createdAt: new Date().toISOString(),
    resolved: false,
    ...message
  };

  // newest first
  state.inbox.unshift(msg);
  saveState(state);
  return msg.id;
}

