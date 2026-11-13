/**
 * verify_appmode.mjs — the app-mode quality gate.
 *
 * Run:  node scripts/verify_appmode.mjs          (bridge present)
 *       node scripts/verify_appmode.mjs --web    (no bridge)
 *
 * App mode proves, with a stubbed window.OmniApp:
 *  1. APP_MODE is detected from the bridge object.
 *  2. The home config (omni:app:home) round-trips through
 *     localStorage — a fresh module graph (a "reload") reads back
 *     exactly what the user arranged, and reset restores defaults.
 *  3. The app home renders server-side: greeting, My Day strip,
 *     Customise entry, the category grid honouring hidden
 *     categories, and the bottom tab bar with the chosen slots.
 * Web mode proves the bridge module is inert (APP_MODE false) and
 * that App.jsx keeps every app-mode branch behind the guard.
 */
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import React from 'react';
import fs from 'node:fs';

const WEB = process.argv.includes('--web');
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

/* localStorage / sessionStorage stubs */
function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    _map: m,
  };
}
const ls = storage();
globalThis.localStorage = ls;
globalThis.sessionStorage = storage();
globalThis.window = globalThis;
if (!WEB) {
  globalThis.OmniApp = {
    isApp: () => true,
    haptic: () => {},
    keepAwake: () => {},
    musicState: () => {},
    dailyPush: (j) => { globalThis.__lastPush = j; },
    share: () => {}, saveFile: () => {}, musicCmd: () => {},
  };
}

const server = await createServer({
  logLevel: 'silent', appType: 'custom', server: { middlewareMode: true },
});

try {
  const bridge = await server.ssrLoadModule('/src/core/app-bridge.js');

  if (WEB) {
    ok('web: APP_MODE is false without the bridge', bridge.APP_MODE === false);
    const src = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
    ok('web: install prompt guarded', src.includes('{!APP_MODE && <InstallPrompt />}'));
    ok('web: hero guarded', src.includes('{!APP_MODE && (<div className="hero">'));
    ok('web: shelf guarded', src.includes('{!APP_MODE && !q.trim() && <Shelf'));
    ok('web: nav swapped only in app mode',
      src.includes('APP_MODE ? (') && src.includes('<AppTabBar'));
    ok('web: grid swapped only in app mode', src.includes('APP_MODE ? (\n            <AppHomeCats'));
  } else {
    ok('app: APP_MODE detected from window.OmniApp', bridge.APP_MODE === true);

    /* ---- config round-trip */
    bridge.setHomeCfg({
      order: ['Media', 'Bhakti'], hidden: ['Media'],
      myTools: ['music'], tabs: ['tv', 'search'],
      sections: { myday: true, cont: false },
    });
    const raw = ls.getItem('omni:app:home');
    ok('config written to omni:app:home', !!raw && raw.includes('"Media"'));
    const live = bridge.getHomeCfg();
    ok('config read back live',
      live.order.join() === 'Media,Bhakti' && live.tabs.join() === 'tv,search'
      && live.sections.cont === false);

    /* a fresh module graph = a reload: it must see the saved layout */
    const server2 = await createServer({
      logLevel: 'silent', appType: 'custom', server: { middlewareMode: true },
    });
    try {
      const bridge2 = await server2.ssrLoadModule('/src/core/app-bridge.js');
      const reloaded = bridge2.getHomeCfg();
      ok('config survives reload',
        reloaded.order.join() === 'Media,Bhakti' && reloaded.hidden.join() === 'Media'
        && reloaded.myTools.join() === 'music');
    } finally { await server2.close(); }

    /* ---- SSR render of the app home */
    const { AppHomeTop, AppHomeCats, AppTabBar } = await server.ssrLoadModule('/src/ui/apphome.jsx');
    const tools = [
      { id: 'music', n: 'Music', i: 'music' },
      { id: 'tv', n: 'Live TV', i: 'film' },
      { id: 'panchang', n: 'Panchang', i: 'sun' },
      { id: 'votd', n: 'Verse of the Day', i: 'sparkle' },
      { id: 'weather', n: 'Weather & AQI', i: 'sun' },
    ];
    const catList = [
      { name: 'Bhakti', meta: { i: 'sparkle', a: '--gold', d: 'Daily devotion' }, list: [tools[2], tools[3]] },
      { name: 'Media', meta: { i: 'film', a: '--cyan', d: 'Watch and listen' }, list: [tools[0], tools[1]] },
    ];
    const go = () => {};
    const open = () => {};

    const top = renderToString(React.createElement(AppHomeTop, { tools, go, open }));
    ok('home: greeting renders', /Good (morning|afternoon|evening|night)/.test(top));
    ok('home: My Day strip renders', top.includes('My Day') && top.includes('Verse of the Day'));
    ok('home: panchang + weather rows render',
      top.includes('Panchang') && top.includes('Weather &amp; AQI'));
    ok('home: Customise entry renders', top.includes('Customise'));
    ok('home: My Tools row renders pinned tool', top.includes('My Tools') && top.includes('Music'));

    const cats = renderToString(React.createElement(AppHomeCats,
      { tools, catList, favTools: [], go }));
    ok('grid: visible category renders', cats.includes('Bhakti — 2 tools'));
    ok('grid: hidden category stays home', !cats.includes('Media — 2 tools'));
    ok('grid: A–Z card renders', cats.includes('All tools A–Z'));

    const tabs = renderToString(React.createElement(AppTabBar, { tools, route: '', go }));
    ok('tab bar: Home present', tabs.includes('Home'));
    ok('tab bar: chosen tool slot present', tabs.includes('Live'));
    ok('tab bar: search slot present', tabs.includes('Search'));

    bridge.resetHomeCfg();
    ok('reset clears the saved layout',
      ls.getItem('omni:app:home') === null
      && bridge.getHomeCfg().tabs.join() === 'music,tv,search,more');
  }
} finally {
  await server.close();
}

console.log(`\nappmode verify: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
