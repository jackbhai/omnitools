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

// Global error handler for uncaught errors
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error);
  const root = document.getElementById('root');
  if (root && !root.innerHTML) {
    root.innerHTML = `<div style="padding:20px;margin:20px;background:#1a1a1a;color:#ff6b6b;font-family:monospace;font-size:14px;border-radius:8px;border:2px solid #ff6b6b">
      <h2 style="color:#ff6b6b;margin-top:0">JavaScript Error</h2>
      <p style="color:#fff">${e.message}</p>
      <pre style="background:#000;padding:15px;border-radius:4px;overflow:auto;color:#fff">${e.error?.stack || ''}</pre>
      <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#4ecdc4;color:#000;border:none;border-radius:4px;cursor:pointer;font-size:16px;font-weight:bold">Reload Page</button>
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
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          // A new build is ready and an old worker is in control -> take over now.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage('skip-waiting');
            location.reload();
          }
        });
      });
      reg.update();
    } catch {}
  });
}
