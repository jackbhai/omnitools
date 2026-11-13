/* Node loader for the smoke suite: extensionless relative imports in the
 * browser modules resolve to .js/.jsx, and *.json imports become modules —
 * the same trick as _json_loader.mjs, plus the extension resolution the
 * downloader/player module graph needs. */
import { readFileSync, existsSync } from 'node:fs';

export function resolve(spec, ctx, next) {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = new URL(spec, ctx.parentURL);
    if (!/\.(m?js|jsx|json)$/.test(spec)) {
      for (const ext of ['.js', '.jsx']) {
        const cand = new URL(spec + ext, ctx.parentURL);
        if (existsSync(cand)) return { url: cand.href, shortCircuit: true };
      }
    }
    if (existsSync(base)) return { url: base.href, shortCircuit: true };
  }
  return next(spec, ctx);
}

export function load(url, ctx, next) {
  if (url.endsWith('.json')) {
    return { format: 'module', shortCircuit: true,
      source: `export default ${readFileSync(new URL(url), 'utf8')}` };
  }
  return next(url, ctx);
}
