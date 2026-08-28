import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';
import { initTheme } from './core/theme.js';
import { initPWA } from './core/pwa.js';

// Init theme before render - apply saved theme immediately to avoid flash
initTheme();

// Init PWA - setup install prompt handling
initPWA();

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

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
