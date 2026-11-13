import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';
import { initTheme } from './core/theme.js';
import { initPWA } from './core/pwa.js';
import { ErrorBoundary } from './ErrorBoundary';

// Init theme before render - apply saved theme immediately to avoid flash
initTheme();

// Init PWA - setup install prompt handling
initPWA();

// Global error handler for uncaught errors. Only for the one case the
// React boundary cannot reach: the app never rendered at all. It shows
// the same friendly recovery screen as ErrorBoundary (plain words,
// reload, data reset) — never a stack trace. Theme variables may not be
// applied yet at this point, so the colours are literals on purpose.
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error);
  const root = document.getElementById('root');
  if (root && !root.innerHTML) {
    root.innerHTML = `<div style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#000;color:#E8FFF4;font-family:'DM Sans',system-ui,sans-serif">
      <div style="max-width:420px;width:100%;background:#0E1412;border:1px solid #1C2724;border-radius:18px;padding:22px">
        <h2 style="margin:0 0 8px;font-size:19px">Something went wrong</h2>
        <p style="color:#9DB5AC;line-height:1.55;margin:0 0 16px;font-size:14.5px">The app could not start. Reloading usually fixes it. If it keeps happening, reset the app data — your settings and saved reading places will be cleared, nothing else on your phone is touched.</p>
        <button onclick="location.reload()" style="display:block;width:100%;padding:12px 18px;background:linear-gradient(135deg,#00FF9C,#00E5FF);color:#00110A;border:none;border-radius:12px;cursor:pointer;font-size:15px;font-weight:700">Reload</button>
        <button onclick="try{Object.keys(localStorage).filter(function(k){return k.indexOf('omni')===0}).forEach(function(k){localStorage.removeItem(k)});if(window.caches){caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}).then(function(){location.reload()})}else{location.reload()}}catch(err){location.reload()}" style="display:block;width:100%;margin-top:10px;padding:12px 18px;background:#141C19;color:#E8FFF4;border:1px solid #26332F;border-radius:12px;cursor:pointer;font-size:15px">Reset app data &amp; reload</button>
      </div>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(
        import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' });
      /* A new build used to reload the page the moment its worker installed —
         mid-song, mid-scroll, no warning. It now waits on a one-line prompt
         and only hands over once the user taps it. */
      let bar = null, handing = false;
      const ask = () => {
        if (bar) return;
        bar = document.createElement('div');
        bar.setAttribute('role', 'status');
        bar.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);'
          + 'z-index:2147483000;display:flex;gap:10px;align-items:center;'
          + 'background:#101413;border:1px solid rgba(0,255,156,.35);border-radius:12px;'
          + 'padding:8px 12px;color:#E8FFF4;font:13px/1.2 "DM Sans",system-ui,sans-serif;'
          + 'box-shadow:0 6px 24px rgba(0,0,0,.5)';
        const msg = document.createElement('span');
        msg.textContent = 'New version ready';
        const btn = document.createElement('button');
        btn.textContent = 'Reload';
        btn.style.cssText = 'background:#00FF9C;color:#000;border:0;border-radius:8px;'
          + 'padding:6px 12px;font-weight:700;font-size:13px;cursor:pointer';
        btn.onclick = () => {
          if (!reg.waiting) { location.reload(); return; }
          handing = true;
          reg.waiting.postMessage('skip-waiting');
        };
        bar.append(msg, btn);
        document.body.appendChild(bar);
      };
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only after we asked for the handover; the first claim on install
        // must not bounce anyone anywhere.
        if (handing) location.reload();
      });
      const check = () => reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) ask();
        });
      });
      if (reg.waiting) ask();
      // A tab left open for days picks up deploys the moment it gets focus.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      check();
    } catch {}
  });
}
