/**
 * verify_render.mjs — the browser-truth gate.
 *
 * Node-side verifies (SSR, logic harnesses) cannot see bundling-order
 * bugs: on 2026-11-14 a useEffect dependency array read two consts
 * before their declarations in the bundled player chunk and the whole
 * app showed the crash screen to every user while every node verify
 * stayed green. This gate loads the BUILT site in a real headless
 * Chromium and fails if any checked route lands on the crash screen
 * or raises a page error.
 *
 * Extended the same day (button-overlap + search-latency wave):
 *  - every route renders at a phone viewport, 390x844;
 *  - OVERLAP: on home, #votd and #music (after a real search), no two
 *    visible buttons that share a .btnrow or the same row container
 *    may overlap — the `.ghost` CSS collision that stacked "Play all"
 *    on "Shuffle" and "Read in context" on "Share" must never return;
 *  - SEARCH: a real "khaab akhil" search on #music must paint results
 *    within 20 s in-harness (progressive first-paint; measured and
 *    printed), and the results header must show count + Play all +
 *    Shuffle together in one clean row.
 *
 * Usage: node scripts/verify_render.mjs [--web [url]]
 *   default: serve ./dist locally. --web: test the deployed site
 *   (default https://jackbhai.github.io/omnitools/).
 *
 * Network: if https_proxy is set, it is honoured — a credentialed
 * proxy is fronted by an in-process CONNECT relay because headless
 * Chromium cannot do proxy auth itself.
 *
 * Needs puppeteer-core (devDependency) and a Chromium binary: the
 * puppeteer cache (~/.cache/puppeteer) or $CHROME_PATH. If no binary
 * exists on the machine it SKIPS with a warning (exit 0) — it must
 * never be the reason an unrelated machine cannot run the suite; on
 * the maintainer machine the binary exists and the gate is real.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const DIST = resolve(process.cwd(), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const SEARCH_BUDGET_MS = 20000;

const webArg = process.argv.indexOf('--web');
const WEB_URL = webArg >= 0 ? (process.argv[webArg + 1] || 'https://jackbhai.github.io/omnitools/') : null;

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  try {
    const base = join(homedir(), '.cache', 'puppeteer', 'chrome-headless-shell');
    const vers = execSync(`ls ${base}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
    for (const v of vers.reverse()) {
      const p = join(base, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  for (const p of ['/opt/meta-chromium/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('verify:browser SKIP — no Chromium binary found on this machine');
  process.exit(0);
}

/* ---- target: local dist server, or the live site with --web -------- */
let server = null;
let base;
if (WEB_URL) {
  base = WEB_URL.endsWith('/') ? WEB_URL : WEB_URL + '/';
  console.log(`verify:browser — testing LIVE ${base}`);
} else {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('verify:browser FAIL — dist/ missing; run npm run build first');
    process.exit(1);
  }
  server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') path = '/index.html';
      const file = join(DIST, path);
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(500); res.end('err'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
}

/* ---- proxy: Chromium cannot do proxy auth, so front a credentialed
        upstream with a tiny local CONNECT relay -------------------- */
const chromeArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
let relaySrv = null;
const proxyEnv = process.env.https_proxy || process.env.HTTPS_PROXY || '';
if (proxyEnv) {
  try {
    const up = new URL(proxyEnv);
    if (up.username || up.password) {
      const authH = 'Basic ' + Buffer.from(
        decodeURIComponent(up.username) + ':' + decodeURIComponent(up.password)).toString('base64');
      relaySrv = http.createServer((q, r) => { r.writeHead(405); r.end(); });
      relaySrv.on('connect', (req, client, head) => {
        const upstream = net.connect(+up.port, up.hostname, () => {
          upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authH}\r\nProxy-Connection: keep-alive\r\n\r\n`);
        });
        let buf = Buffer.alloc(0);
        const onData = (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          const idx = buf.indexOf('\r\n\r\n');
          if (idx === -1) return;
          upstream.off('data', onData);
          if (!/ 200 /.test(buf.slice(0, buf.indexOf('\r\n')).toString())) { client.destroy(); upstream.destroy(); return; }
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          const rest = buf.slice(idx + 4);
          if (rest.length) client.write(rest);
          if (head && head.length) upstream.write(head);
          upstream.pipe(client); client.pipe(upstream);
        };
        upstream.on('data', onData);
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      });
      await new Promise((r) => relaySrv.listen(0, '127.0.0.1', r));
      chromeArgs.push(`--proxy-server=http://127.0.0.1:${relaySrv.address().port}`,
        '--proxy-bypass-list=127.0.0.1;localhost');
    } else {
      chromeArgs.push(`--proxy-server=${up.protocol}//${up.host}`);
    }
  } catch { /* unparsable proxy env — go direct */ }
}

/* In-page: visible buttons grouped by their row container (.btnrow or
   parent element) must never overlap. Nested buttons (a button inside
   a button-card) are ancestors, not row neighbours — skipped. */
const OVERLAP_FN = () => {
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    return r;
  };
  const groups = new Map();
  for (const b of document.querySelectorAll('button')) {
    const r = rectOf(b);
    if (!r) continue;
    const host = b.closest('.btnrow') || b.parentElement;
    if (!host) continue;
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push({
      b, r,
      label: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 36) || '(icon button)',
    });
  }
  const bad = [];
  for (const items of groups.values()) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (A.b.contains(B.b) || B.b.contains(A.b)) continue;
        const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
        const iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (ix > 2 && iy > 2) bad.push(`"${A.label}" x "${B.label}" overlap ${Math.round(ix)}x${Math.round(iy)}px`);
      }
    }
  }
  return bad;
};

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: chrome, args: chromeArgs });
let failures = 0;
const fail = (msg) => { failures++; console.log('verify:browser FAIL ' + msg); };
const pass = (msg) => console.log('verify:browser PASS ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openRoute(route) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message || String(e)));
  await page.goto(base + route, { waitUntil: 'load', timeout: 60000 })
    .catch((e) => errors.push('goto: ' + e.message));
  await sleep(3000);
  return { page, errors };
}

function checkRender(route, text, errors) {
  const crashed = text.includes('Something went wrong');
  const rendered = text.trim().length > 80;
  if (crashed || !rendered || errors.length) {
    fail(`route "${route || '(home)'}" crashed=${crashed} rendered=${rendered} errors=${JSON.stringify(errors).slice(0, 300)}`);
    return false;
  }
  pass(`route "${route || '(home)'}" renders (${text.trim().length} chars, 0 page errors)`);
  return true;
}

async function checkOverlap(page, label) {
  const bad = await page.evaluate(OVERLAP_FN);
  if (bad.length) { fail(`${label} button overlaps: ${bad.slice(0, 5).join(' | ')}`); return false; }
  pass(`${label} no button overlaps`);
  return true;
}

try {
  /* ---- home -------------------------------------------------------- */
  {
    const { page, errors } = await openRoute('');
    const text = await page.evaluate(() => document.getElementById('root')?.innerText || '');
    if (checkRender('', text, errors)) await checkOverlap(page, 'home');
    await page.close();
  }

  /* ---- verse of the day --------------------------------------------- */
  {
    const { page, errors } = await openRoute('#votd');
    const text = await page.evaluate(() => document.getElementById('root')?.innerText || '');
    if (checkRender('#votd', text, errors)) {
      /* The user's exact complaint: "Read in context" must sit in its
         own row, not on top of Share. */
      const layout = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const find = (t) => btns.find((b) => (b.innerText || '').trim() === t);
        const ctx = find('Read in context'), share = find('Share');
        if (!ctx || !share) return { found: false };
        const a = ctx.getBoundingClientRect(), b = share.getBoundingClientRect();
        return { found: true, separateRow: a.top >= b.bottom - 2, fullWidth: a.width > 250 };
      });
      if (!layout.found) fail('#votd "Read in context"/"Share" buttons not found');
      else if (!layout.separateRow || !layout.fullWidth) {
        fail(`#votd "Read in context" is not in its own full-width row (separateRow=${layout.separateRow} fullWidth=${layout.fullWidth})`);
      } else pass('#votd "Read in context" sits in its own full-width row');
      await checkOverlap(page, '#votd');
    }
    await page.close();
  }

  /* ---- languages (crash regression route) ---------------------------- */
  {
    const { page, errors } = await openRoute('#languages');
    const text = await page.evaluate(() => document.getElementById('root')?.innerText || '');
    checkRender('#languages', text, errors);
    await page.close();
  }

  /* ---- music: real search, timed paint, header row, overlaps --------- */
  {
    const { page, errors } = await openRoute('#music');
    const text = await page.evaluate(() => document.getElementById('root')?.innerText || '');
    if (checkRender('#music', text, errors)) {
      await page.evaluate(() => {
        [...document.querySelectorAll('button')]
          .find((x) => x.innerText.trim() === 'Search')?.click();
      });
      await sleep(700);
      const sel = 'input[placeholder*="song" i]';
      await page.waitForSelector(sel, { timeout: 15000 });
      await page.click(sel);
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type(sel, 'khaab akhil', { delay: 15 });
      const t0 = Date.now();
      await page.keyboard.press('Enter');
      let paintMs = null;
      for (let i = 0; i < 180; i++) {
        await sleep(250);
        const st = await page.evaluate(() => ({
          rows: document.querySelectorAll('.list .row').length,
          first: document.querySelector('.list .row b')?.innerText || '',
        }));
        if (st.rows >= 3 && /khaab/i.test(st.first)) { paintMs = Date.now() - t0; break; }
      }
      if (paintMs == null) fail('#music search "khaab akhil" painted no results within 45 s');
      else if (paintMs > SEARCH_BUDGET_MS) fail(`#music search painted in ${paintMs}ms — over the ${SEARCH_BUDGET_MS}ms budget`);
      else pass(`#music search "khaab akhil" painted in ${paintMs}ms (budget ${SEARCH_BUDGET_MS}ms)`);

      if (paintMs != null) {
        /* results header: count + Play all + Shuffle, one row, all visible */
        const hdr = await page.evaluate(() => {
          const row = [...document.querySelectorAll('.btnrow')]
            .find((d) => (d.innerText || '').includes('Play all'));
          if (!row) return { found: false };
          const vis = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden';
          };
          const labels = [...row.querySelectorAll('button')].map((b) => (b.innerText || '').trim());
          return {
            found: true,
            hasCount: /\d+\s+songs/.test(row.innerText || ''),
            hasPlayAll: labels.some((t) => t === 'Play all') && vis([...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Play all')),
            hasShuffle: labels.some((t) => t === 'Shuffle') && vis([...row.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Shuffle')),
          };
        });
        if (!hdr.found) fail('#music results header row (with Play all) not found');
        else if (!hdr.hasCount || !hdr.hasPlayAll || !hdr.hasShuffle) {
          fail(`#music results header incomplete: count=${hdr.hasCount} playAll=${hdr.hasPlayAll} shuffle=${hdr.hasShuffle}`);
        } else pass('#music results header shows count + Play all + Shuffle');
        await checkOverlap(page, '#music (390px, search results)');

        /* same header at desktop width */
        await page.setViewport({ width: 1280, height: 800 });
        await sleep(600);
        await checkOverlap(page, '#music (1280px, search results)');
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (server) server.close();
  if (relaySrv) relaySrv.close();
}
if (failures) { console.error(`verify:browser — ${failures} check(s) FAILED`); process.exit(1); }
console.log('verify:browser — ALL CHECKS PASS');
