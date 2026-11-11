/**
 * Runs before any test file is loaded (Jest setupFiles).
 * Forces safe defaults so individual machines' `.env` cannot leak into unit
 * tests. dotenv does not override keys that are already set, so setting these
 * here wins even if a later import calls dotenv.config().
 *
 * Specs that need AUTO_APPROVE_ALL must set it themselves (and restore after).
 */
'use strict';

process.env.AUTO_APPROVE_ALL = 'false';
process.env.SEED_MODE = 'false';
process.env.EMAIL_DISABLED = 'true';

// If a host shell exported AUTO_APPROVE_ACTOR_ID from .env, keep a stable
// default but never allow the flag itself to stay on.
if (process.env.AUTO_APPROVE_ACTOR_ID === undefined) {
  process.env.AUTO_APPROVE_ACTOR_ID = '';
}
