/**
 * STORAGE REGISTRY — every key this app writes, in one place.
 *
 * Two stores: localStorage (survives restarts) and sessionStorage (dies
 * with the tab). Session keys carry the `omni:sess:` prefix; persistent
 * keys are plain `omni:…`. Before adding a key anywhere, add it here.
 *
 * ------------------------------------------------------------ localStorage
 * omni:settings        core/settings.js    app settings (relay choice, save-data)
 * omni:theme           core/theme.js       theme name
 * omni:custom-theme    core/theme.js       user-built theme palette
 * omni:vol             ui/PlayerUI.jsx     player volume
 * omni:viz             ui/PlayerUI.jsx     visualizer theme
 * omni:eq              core/player.jsx     equalizer bands + power + preset
 * omni:fav             App.jsx             pinned tools on the home shelf
 * omni:recent          App.jsx             recently opened tools
 * omni:visits          App.jsx             tool open counts (shelf ordering)
 * omni:searches        App.jsx             recent universal-search queries
 * omni:reminders       core/reminders.js   path/aarti reminder list (Wave A)
 * omni:install:dismissed App.jsx           install banner dismissed flag
 * omni:lib:fav         core/library.js     favourite tracks
 * omni:lib:hist        core/library.js     play history
 * omni:lib:playlists   core/library.js     user playlists
 * omni:music:prefs     core/preferences.js taste profile for recommendations
 * omni:tv:fav          core/iptv.js        favourite channels
 * omni:tv:recent       core/iptv.js        recently watched channels
 * omni:tv:live         core/iptv.js        cached live-channel health
 * omni:proxy           core/iptv.js        stream relay preference
 * omni:fm:live         core/sources.js     cached radio-station health
 * omni:radio:fav       core/webradio.js    favourite internet-radio stations
 * omni:pod:pos         tools/podcasts.jsx  podcast episode resume positions
 * omni:games:best      tools/games*.jsx    best scores for the whole 50-game arcade
 *                                           (one key per game id inside the object;
 *                                           sudoku keeps one per difficulty)
 * omni:news:ed         tools/news.jsx      news edition (country) choice
 * omni:quran:listen    tools/devotional.jsx Quran listen position
 * omni:sid             core/presence.js    anonymous presence session id
 * omni:presence        core/presence.js    last good presence count
 * omni:pwa             core/pwa.js         install-prompt state
 * omni:loc             core/geo.jsx        last known location (coarse)
 * omni:trip-v1         core/trip-state.js  trip-planner working state
 * omni:read:last       ui/readerkit.jsx    last reader tool opened
 * omni:read:<tool>     ui/readerkit.jsx    per-reader position (dynamic suffix)
 * omni:sec:<id>        ui/kit.jsx          collapsible section open state (dynamic)
 *
 * Dynamic-prefix caches (localStorage, self-expiring):
 * omni:c:<key>         core/engine.js      provider response cache
 * omni:aud:<key>       core/audio-resolve.js  resolved-audio cache
 *
 * ------------------------------------------------------------ sessionStorage
 * omni:sess:music:resume  App.jsx → tools/music2.jsx   "Continue" song hand-off
 *                         (renamed from omni:music:resume, migrated on read)
 * omni:sess:tv:open       App.jsx → tools/tv.jsx       "Continue" channel hand-off
 *                         (renamed from omni:tv:open, migrated on read)
 * omni:scrollpos          App.jsx          per-route scroll memory
 *                         (predates the sess: prefix; rename with the shelf
 *                          rewrite, not piecemeal — it has no legacy readers)
 *
 * ------------------------------------------------------------ elsewhere
 * IndexedDB `omnitools-offline` — downloaded songs (core/offline-store.js).
 * IndexedDB `omni-recordings` — voice recorder clips (tools/recorder.jsx).
 * Service-worker caches: omni-shell-v7 / omni-data-v1 / omni-med-v1 (public/sw.js).
 * The dead key omni:eq:music (old player page) was removed with that page;
 * nothing reads it and nothing should resurrect it.
 */

/** Session hand-off keys (the only two renamed so far — see registry). */
export const SESS_RESUME_MUSIC = 'omni:sess:music:resume';
export const SESS_OPEN_TV = 'omni:sess:tv:open';

/** Pre-rename names, migrated transparently by the helpers below. */
const LEGACY = {
  [SESS_RESUME_MUSIC]: 'omni:music:resume',
  [SESS_OPEN_TV]: 'omni:tv:open',
};

/** Write a session value under its current name; clears any legacy copy. */
export function sessSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
    const old = LEGACY[key];
    if (old) sessionStorage.removeItem(old);
  } catch { /* private mode / quota — the hand-off is best-effort */ }
}

/**
 * Read-and-remove a session hand-off: returns the value stored under the
 * current name, or migrates (and returns) a legacy value written by an
 * older build, so an in-flight "Continue" tap never gets lost in an update.
 */
export function sessTake(key) {
  try {
    let raw = sessionStorage.getItem(key);
    if (raw != null) { sessionStorage.removeItem(key); return raw; }
    const old = LEGACY[key];
    if (old) {
      raw = sessionStorage.getItem(old);
      if (raw != null) sessionStorage.removeItem(old);
      return raw;
    }
  } catch { /* ignore */ }
  return null;
}
