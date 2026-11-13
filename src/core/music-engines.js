/**
 * Shared music engine definitions — the ONE place that knows the public
 * endpoints and demo keys for the open-licence / metadata engines
 * (Jamendo, Last.fm).
 *
 * sources.js, music-super.js and music-discovery.js each run their own
 * racing and health strategy on top of these definitions; they must never
 * grow private copies of the constants again. (The implementations differ
 * on purpose — different cooldown pools and fallbacks — but an endpoint or
 * a key is a fact, and a fact lives in exactly one file.)
 *
 * worker/omni-music-super.js is a standalone deployable and cannot import
 * this module, so it carries a mirror of the Jamendo values. If a value
 * changes here, change it there too.
 */

/** Jamendo client_id pool (public demo ids, rotated on failure). */
export const JAMENDO_IDS = ['2c9a11b9', '709fa152'];
/** Jamendo API root; resource paths hang off it (tracks/, albums/, …). */
export const JAMENDO_API = 'https://api.jamendo.com/v3.0';
/** The tracks endpoint the search implementations call. */
export const JAMENDO_TRACKS_API = 'https://api.jamendo.com/v3.0/tracks/';

/** Last.fm public demo key used by many open-source projects. */
export const LASTFM_KEY = 'b25b959554ed76058ac220b7b2e0a026';
/** Last.fm API root; calls are ?method=…&api_key=…&format=json. */
export const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
