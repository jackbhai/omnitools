/* Node loader so the browser module's `import x from '*.json'` works in tests. */
import { readFileSync } from 'node:fs';
export function load(url, ctx, next) {
  if (url.endsWith('.json')) {
    return { format: 'module', shortCircuit: true,
      source: `export default ${readFileSync(new URL(url), 'utf8')}` };
  }
  return next(url, ctx);
}
