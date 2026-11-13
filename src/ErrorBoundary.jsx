import React from 'react';

/* One recovery face for the whole app — the same screen the index.html
   last-resort panel and the main.jsx boot handler show: plain words,
   Reload, and a data reset for when a reload is not enough. The raw
   error is logged to the console for anyone debugging, and its message
   (never the stack) sits behind a collapsed "technical detail" line. */

export function resetAppData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('omni'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  const done = () => location.reload();
  if (window.caches) {
    caches.keys()
      .then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
      .then(done, done);
  } else done();
}

export function RecoveryScreen({ message }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      padding: 24, background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        maxWidth: 420, width: '100%', background: 'var(--s1)',
        border: '1px solid var(--line)', borderRadius: 18, padding: 22,
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 19 }}>Something went wrong</h2>
        <p style={{ color: 'var(--fg2)', lineHeight: 1.55, margin: '0 0 16px', fontSize: 14.5 }}>
          This screen ran into a problem. Reloading usually fixes it. If it
          keeps happening, reset the app data — your settings and saved
          reading places will be cleared, nothing else on your phone is touched.
        </p>
        <button className="btn" style={{ width: '100%' }} onClick={() => location.reload()}>
          Reload
        </button>
        <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={resetAppData}>
          Reset app data &amp; reload
        </button>
        {message && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>Technical detail</summary>
            <p style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 6, wordBreak: 'break-word' }}>{message}</p>
          </details>
        )}
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <RecoveryScreen message={this.state.error?.message || String(this.state.error || '')} />;
    }
    return this.props.children;
  }
}
