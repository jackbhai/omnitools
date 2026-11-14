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

const DIST = resolve(process.cwd(), 'dist');
const ROUTES = ['', '#music', '#languages'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

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
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('verify:browser FAIL — dist/ missing; run npm run build first');
  process.exit(1);
}

const server = createServer(async (req, res) => {
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
const base = `http://127.0.0.1:${server.address().port}/`;

const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let failures = 0;
try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message || String(e)));
    await page.goto(base + route, { waitUntil: 'networkidle2', timeout: 45000 }).catch((e) => errors.push('goto: ' + e.message));
    await new Promise((r) => setTimeout(r, 3500));
    const text = await page.evaluate(() => document.getElementById('root')?.innerText || '');
    const crashed = text.includes('Something went wrong');
    const rendered = text.trim().length > 80;
    if (crashed || !rendered || errors.length) {
      failures++;
      console.log(`verify:browser FAIL route "${route || '(home)'}" crashed=${crashed} rendered=${rendered} errors=${JSON.stringify(errors).slice(0, 300)}`);
    } else {
      console.log(`verify:browser PASS route "${route || '(home)'}" (${text.trim().length} chars rendered, 0 page errors)`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures) { console.error(`verify:browser — ${failures}/${ROUTES.length} routes FAILED`); process.exit(1); }
console.log(`verify:browser — ${ROUTES.length}/${ROUTES.length} routes PASS`);
