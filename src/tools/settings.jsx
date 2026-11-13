/**
 * Settings Page - Standard settings with themes + PWA + Live Check System
 * Features:
 * - PWA install, offline status, cache management
 * - Themes: dark, light, amoled, ocean, forest, sunset, midnight + Make Your Own Theme
 * - Features enable/disable
 * - Live Check System with button, % working, live logs
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, Stat, useFold } from '../ui/kit';

/* A Settings group that folds shut — the choice is remembered per group,
   so the page opens the way the user left it. */
function Fold({ id, head, style, defaultOpen = true, children }) {
  const [open, toggle] = useFold(id, defaultOpen);
  return (
    <Card style={style}>
      <button className="fold-h" onClick={toggle} aria-expanded={open}>
        <span className="chead" style={{ flex: 1, textAlign: 'left', margin: 0 }}>{head}</span>
        <Icon n="chevron" size={16} className="chev"
          style={{ transform: open ? '' : 'rotate(-90deg)', transition: 'transform .2s' }} />
      </button>
      <div className="sec-body" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="sec-inner">{open && children}</div>
      </div>
    </Card>);
}
import { Icon } from '../ui/icons';
import { THEMES, getCurrentThemeId, getCustomTheme, saveCustomTheme, applyTheme, getAllThemes } from '../core/theme.js';
import { getPWAInfo, triggerInstall, onInstallPrompt, getCacheStatus, clearAllCaches, getOfflineStatus } from '../core/pwa.js';
import { runLiveCheck, getFeatureCategories } from '../core/live-check.js';
import { getSettings, setSetting, onSettings } from '../core/settings.js';
/* The switch is a checkbox; these are the sounds it switches. Both come from the
   one module the app itself listens through, so what is heard here is exactly
   what is heard in a tool — no separate demo audio. */
import { play as sfxPlay, soundLog as sfxLog, SOUNDS as SFX, supported as sfxSupported } from '../core/sfx.js';
import { TextSizeCtl } from '../ui/readerkit';

export function Settings() {
  const [currentTheme, setCurrentTheme] = useState(getCurrentThemeId());
  const [customTheme, setCustomTheme] = useState(getCustomTheme());
  const [showCustomMaker, setShowCustomMaker] = useState(false);
  const [customColors, setCustomColors] = useState({
    '--bg': '#000000',
    '--s1': '#080B0A',
    '--s2': '#0E1412',
    '--s3': '#141C19',
    '--line': '#1C2724',
    '--line2': '#26332F',
    '--green': '#00FF9C',
    '--cyan': '#00E5FF',
    '--fg': '#E8FFF4',
    '--fg2': '#9DB5AC',
    '--fg3': '#6E857C',
  });
  const [customName, setCustomName] = useState('My Custom Theme');
  const [pwaInfo, setPwaInfo] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installStatus, setInstallStatus] = useState('');
  const [liveCheckResult, setLiveCheckResult] = useState(null);
  const [liveLogs, setLiveLogs] = useState([]);
  const [liveProgress, setLiveProgress] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [settings, setSettingsState] = useState(getSettings());
  const [sfxLast, setSfxLast] = useState('');
  const logRef = useRef(null);

  /* Two switches write this one preference - the speaker in the header and the
     checkbox here - so this page has to listen, or it shows a state the app has
     already left behind. Subscribing costs nothing and cannot go stale. */
  useEffect(() => onSettings((s) => setSettingsState(s)), []);

  /* What the button does is call the same play() a tool calls, and what prints
     under it is that call's answer — including "sounds are off", so a silent
     button is never mistaken for a broken one. */
  const hear = (name) => {
    sfxPlay(name);
    const l = sfxLog()[sfxLog().length - 1];
    setSfxLast(l ? `${SFX[l.name] ? SFX[l.name].label : l.name}${l.ok ? '' : ' — ' + l.why}` : '');
  };

  useEffect(() => {
    // Init theme
    setCurrentTheme(getCurrentThemeId());
    setCustomTheme(getCustomTheme());
    
    // PWA info
    setPwaInfo(getPWAInfo());
    getCacheStatus().then(setCacheInfo);
    
    // Install prompt
    onInstallPrompt(() => setCanInstall(true));
    
    // Update PWA info periodically
    const interval = setInterval(() => {
      setPwaInfo(getPWAInfo());
      getCacheStatus().then(setCacheInfo);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-scroll logs
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [liveLogs]);

  const handleThemeChange = (themeId) => {
    const theme = applyTheme(themeId);
    setCurrentTheme(themeId);
    setInstallStatus(`Theme changed to ${theme.name}`);
    setTimeout(() => setInstallStatus(''), 2000);
  };

  const handleCustomColorChange = (varName, value) => {
    setCustomColors(prev => ({ ...prev, [varName]: value }));
  };

  const handleSaveCustomTheme = () => {
    const newCustom = {
      id: 'custom',
      name: customName || 'My Custom Theme',
      nameHi: 'मेरा कस्टम थीम',
      description: `Custom theme created by user - ${new Date().toLocaleString()}`,
      colors: customColors,
      isDark: isColorDark(customColors['--bg']),
      createdAt: new Date().toISOString(),
    };
    
    if (saveCustomTheme(newCustom)) {
      setCustomTheme(newCustom);
      applyTheme('custom');
      setCurrentTheme('custom');
      setShowCustomMaker(false);
      setInstallStatus(`Custom theme "${customName}" saved and applied!`);
      setTimeout(() => setInstallStatus(''), 3000);
    } else {
      setInstallStatus('Failed to save custom theme - storage full?');
    }
  };

  const handleInstall = async () => {
    setInstallStatus('Triggering install prompt...');
    const result = await triggerInstall();
    if (result.ok) {
      setInstallStatus(result.accepted ? 'Install accepted! App will be installed.' : `Install prompt: ${result.outcome}`);
    } else {
      setInstallStatus(`Cannot install: ${result.reason} - Try using browser menu "Add to Home Screen" or "Install App"`);
    }
    setTimeout(() => setInstallStatus(''), 4000);
  };

  const handleClearCache = async () => {
    setInstallStatus('Clearing caches...');
    const result = await clearAllCaches();
    if (result.ok) {
      setInstallStatus(`Cleared ${result.deleted} caches - Reload to refetch`);
      getCacheStatus().then(setCacheInfo);
    } else {
      setInstallStatus(`Clear failed: ${result.reason}`);
    }
    setTimeout(() => setInstallStatus(''), 3000);
  };

  const handleLiveCheck = async () => {
    setIsChecking(true);
    setLiveLogs([]);
    setLiveCheckResult(null);
    setLiveProgress({ current: 0, total: 20, percent: 0, checkName: 'Starting...' });

    const result = await runLiveCheck({
      onLog: (entry) => {
        setLiveLogs(prev => [...prev, entry]);
      },
      onProgress: (prog) => {
        setLiveProgress(prog);
      },
    });

    setLiveCheckResult(result);
    setIsChecking(false);
    setLiveProgress(null);
  };

  const isColorDark = (hex) => {
    if (!hex || !hex.startsWith('#')) return true;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  const allThemes = getAllThemes();

  return (
    <>
      <Card>
        <div className="chead"><Icon n="cog" size={18} /> Settings</div>
        <div className="dim sm">Appearance, reading, sounds, connection — and a one-tap check that everything still works.</div>
        
        {installStatus && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 10, borderLeft: '3px solid var(--green)', fontSize: 12 }}>
            {installStatus}
          </div>
        )}

        {/* App & offline */}
        <Fold id="set-pwa" defaultOpen={false} style={{ marginTop: 16, background: 'var(--s2)' }}
          head={<><Icon n="box" size={16} /> App &amp; offline</>}>
          <div className="dim sm">Install OmniTools on your home screen and it opens like a normal app — no browser bar — and keeps working without internet.</div>

          <div className="g2" style={{ marginTop: 12 }}>
            <Stat l="How it opens" v={pwaInfo?.isStandalone ? 'As an app' : 'In the browser'} />
            <Stat l="Installed" v={pwaInfo?.isInstalled ? 'Yes' : 'Not yet'} />
            <Stat l="Offline ready" v={pwaInfo?.serviceWorker?.status === 'active' ? 'Yes' : 'Setting up…'} />
            <Stat l="Connection" v={pwaInfo?.offline?.online ? 'Online' : 'Offline'} />
            <Stat l="Can install" v={canInstall ? 'Yes — one tap below' : pwaInfo?.isStandalone ? 'Already installed' : 'From the browser menu'} />
            <Stat l="Saved for offline" v={cacheInfo?.totalCaches ? `${cacheInfo.totalCaches} stores` : 'Checking…'} />
          </div>

          {pwaInfo?.offline?.connection && (
            <div style={{ marginTop: 10, padding: 8, background: 'var(--s1)', borderRadius: 8, fontSize: 11 }}>
              <b>Connection:</b> {pwaInfo.offline.connection.effectiveType} · about {pwaInfo.offline.connection.downlink} Mbps · your device asks sites to save data: {pwaInfo.offline.connection.saveData ? 'yes' : 'no'}
            </div>
          )}

          {cacheInfo?.caches && cacheInfo.caches.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 100, overflow: 'auto', fontSize: 10, background: 'var(--s1)', padding: 8, borderRadius: 8 }}>
              {cacheInfo.caches.map((c, i) => (
                <div key={i}>{c.name}: {c.count} items</div>
              ))}
            </div>
          )}

          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={handleInstall} disabled={!canInstall && !pwaInfo?.isStandalone}>
              <Icon n="download" size={14} /> {pwaInfo?.isStandalone ? 'Already installed' : canInstall ? 'Install the app' : 'Install from the browser menu'}
            </button>
            <button className="btn ghost" onClick={handleClearCache}>
              <Icon n="refresh" size={14} /> Clear offline storage
            </button>
            <button className="btn ghost" onClick={() => { setPwaInfo(getPWAInfo()); getCacheStatus().then(setCacheInfo); }}>
              <Icon n="search" size={14} /> Refresh
            </button>
          </div>

          <div className="dim sm" style={{ marginTop: 10, lineHeight: 1.5 }}>
            <b>Installing:</b> Chrome or Edge — menu (⋮) → “Install app”. iPhone Safari — Share → “Add to Home Screen”.
            Things you open are saved on this device as you go, so they reopen offline later.
          </div>
        </Fold>

        {/* Appearance */}
        <Fold id="set-themes" style={{ marginTop: 16, background: 'var(--s2)' }}
          head={<><Icon n="palette" size={16} /> Appearance</>}>
          <div className="dim sm">Pick a theme — buttons, headings and highlights all follow it — or build your own from colours.</div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {Object.entries(allThemes).map(([id, theme]) => (
              <button
                key={id}
                onClick={() => handleThemeChange(id)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: currentTheme === id ? `2px solid ${theme.colors['--green']}` : '1px solid var(--line)',
                  background: theme.colors['--s1'],
                  color: theme.colors['--fg'],
                  textAlign: 'left',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {currentTheme === id && <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, color: theme.colors['--green'] }}>● Active</span>}
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: theme.colors['--bg'], border: `1px solid ${theme.colors['--line']}` }} />
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: theme.colors['--green'] }} />
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: theme.colors['--cyan'] }} />
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: theme.colors['--s2'] }} />
                </div>
                <b style={{ fontSize: 12 }}>{theme.name}</b>
                <div style={{ fontSize: 10, color: theme.colors['--fg2'], marginTop: 2, lineHeight: 1.3 }}>{theme.description}</div>
                <div style={{ fontSize: 9, color: theme.colors['--fg3'], marginTop: 4 }}>{theme.isDark ? 'Dark' : 'Light'} | {Object.keys(theme.colors).length} colors</div>
              </button>
            ))}
          </div>

          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setShowCustomMaker(!showCustomMaker)}>
              <Icon n="pen" size={14} /> {showCustomMaker ? 'Close the theme maker' : 'Make your own theme'}
            </button>
            {customTheme && (
              <button className="btn ghost" onClick={() => { localStorage.removeItem('omni:custom-theme'); setCustomTheme(null); if (currentTheme === 'custom') handleThemeChange('dark'); }}>
                <Icon n="x" size={14} /> Delete Custom Theme
              </button>
            )}
          </div>

          {showCustomMaker && (
            <Card style={{ marginTop: 12, background: 'var(--s1)', border: '1px solid var(--line2)' }}>
              <div className="chead"><Icon n="palette" size={14} /> Make your own theme</div>
              <div className="dim sm">Pick a colour for each part of the app, watch the preview, then save. It applies everywhere, straight away.</div>
              
              <div className="fld" style={{ marginTop: 10 }}>
                <label>Theme Name</label>
                <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="My Custom Theme" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                {Object.entries(customColors).map(([varName, color]) => (
                  <div key={varName} className="fld" style={{ marginBottom: 0 }}>
                    <label>{varName} - {varName.replace('--', '')}</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={color} onChange={e => handleCustomColorChange(varName, e.target.value)} style={{ width: 40, height: 36, padding: 2, borderRadius: 8 }} />
                      <input value={color} onChange={e => handleCustomColorChange(varName, e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} placeholder="#000000" />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, padding: 12, background: customColors['--bg'], borderRadius: 12, border: `1px solid ${customColors['--line']}` }}>
                <div style={{ color: customColors['--fg'], fontSize: 14, fontWeight: 600 }}>Preview: {customName}</div>
                <div style={{ color: customColors['--fg2'], fontSize: 12, marginTop: 4 }}>This is how your theme will look - Background {customColors['--bg']} with green {customColors['--green']} and cyan {customColors['--cyan']}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span style={{ padding: '4px 8px', borderRadius: 6, background: customColors['--s2'], color: customColors['--fg'], fontSize: 10, border: `1px solid ${customColors['--line']}` }}>Card s2</span>
                  <span style={{ padding: '4px 8px', borderRadius: 6, background: customColors['--green'], color: '#000', fontSize: 10, fontWeight: 700 }}>Button</span>
                  <span style={{ padding: '4px 8px', borderRadius: 6, background: customColors['--s1'], color: customColors['--fg3'], fontSize: 10, border: `1px solid ${customColors['--line']}` }}>Dim</span>
                </div>
              </div>

              <div className="btnrow" style={{ marginTop: 12 }}>
                <button className="btn" onClick={handleSaveCustomTheme}>
                  <Icon n="save" size={14} /> Save Custom Theme "{customName}"
                </button>
                <button className="btn ghost" onClick={() => { setCustomColors({ '--bg': '#000000', '--s1': '#080B0A', '--s2': '#0E1412', '--s3': '#141C19', '--line': '#1C2724', '--line2': '#26332F', '--green': '#00FF9C', '--cyan': '#00E5FF', '--fg': '#E8FFF4', '--fg2': '#9DB5AC', '--fg3': '#6E857C' }); }}>
                  Reset to Default
                </button>
              </div>
            </Card>
          )}
        </Fold>

        {/* Reading & data */}
        <Fold id="set-reading" defaultOpen={false} style={{ marginTop: 16, background: 'var(--s2)' }}
          head={<><Icon n="book" size={16} /> Reading &amp; data</>}>
          <div className="dim sm">One text size for every book reader — Gita, Quran, Bible, Gurbani, Aarti &amp; Mantra and Novels all use it, and each reader keeps your place.</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="sm" style={{ fontWeight: 600 }}>Text size</span>
            <TextSizeCtl />
          </div>
          <label className="chk" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={!!settings.readerPaper} onChange={e => { const s = setSetting('readerPaper', e.target.checked); setSettingsState(s); }} />
            <span>Paper page — a warm, light reading surface inside the book readers, easier on the eyes than a dark screen for long reading</span>
          </label>
          <label className="chk">
            <input type="checkbox" checked={!!settings.lowData} onChange={e => { const s = setSetting('lowData', e.target.checked); setSettingsState(s); }} />
            <span>Save data — fewer images: TV channel logos are skipped and home search does not fetch the channel list. {pwaInfo?.offline?.connection?.saveData ? 'Your device is also asking sites to save data, so this is already partly on.' : ''}</span>
          </label>
        </Fold>

        {/* Playback, sounds & connection */}
        <Fold id="set-features" defaultOpen={false} style={{ marginTop: 16, background: 'var(--s2)' }}
          head={<><Icon n="cog" size={16} /> Playback, sounds &amp; connection</>}>
          <div className="dim sm">How music behaves, whether the app makes sounds, and how it reaches the internet.</div>

          <div style={{ marginTop: 12 }}>
            <label className="chk">
              <input type="checkbox" checked={settings.autoRadio} onChange={e => { const s = setSetting('autoRadio', e.target.checked); setSettingsState(s); }} />
              <span>Auto radio — when a queue ends, keep the music going with similar songs (Music player)</span>
            </label>
            <label className="chk">
              <input type="checkbox" checked={settings.sfx} onChange={e => { const s = setSetting('sfx', e.target.checked); setSettingsState(s); }} />
              <span>Sound effects — small sounds for taps, switches, saves and errors, made in your browser. Nothing is downloaded.</span>
            </label>
            <div className="btnrow" style={{ marginTop: 8 }}>
              {[['pop', 'Hear a tap'], ['open', 'Hear a panel open'], ['toggleon', 'Hear a switch on'], ['success', 'Hear a save'], ['error', 'Hear a failure'], ['play', 'Hear play'], ['pause', 'Hear pause'], ['copy', 'Hear a copy'], ['whoosh', 'Hear a train pass'], ['chime', 'Hear an answer'], ['ding', 'Hear an alert armed']].map(([n, l]) => (
                <button key={n} className="btn ghost" data-sfx="none" onClick={() => hear(n)}>{l}</button>
              ))}
            </div>
            <div className="dim sm" style={{ marginTop: 6 }}>
              {!sfxSupported() ? 'This browser cannot play these sounds — nothing is downloaded either way.'
                : settings.sfx === false ? 'Sounds are off above, so these buttons explain instead of playing.'
                : sfxLast ? `Last played: ${sfxLast}` : `${Object.keys(SFX).length} sounds in all. The same on/off switch sits at the top of every screen.`}
            </div>
            <label className="chk">
              <input type="checkbox" checked={settings.useBuiltin} onChange={e => { const s = setSetting('useBuiltin', e.target.checked); setSettingsState(s); }} />
              <span>Built-in connection relay — some music and book sources cannot be reached directly from a browser, so the app goes through a small relay it ships with. Fast and on by default; turn it off only if you use your own below</span>
            </label>
            <div className="fld" style={{ marginTop: 10 }}>
              <label>Your own relay address (optional)</label>
              <input value={settings.proxyUrl} onChange={e => { const s = setSetting('proxyUrl', e.target.value); setSettingsState(s); }} placeholder="https://your-relay.example.com" />
              <div className="dim sm" style={{ marginTop: 4 }}>Only for people who run their own relay — it is used instead of the built-in one. Most people never need this.</div>
            </div>
          </div>
        </Fold>

        {/* Health check */}
        <Fold id="set-livecheck" style={{ marginTop: 16, border: '2px solid var(--green)', background: 'var(--s2)' }}
          head={<><Icon n="signal" size={18} /> Check that everything works</>}>
          <div className="dim sm">One tap tests the app's features and sources for real, and shows what passed, what is struggling and what is down — with a live log of each check as it happens.</div>

          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleLiveCheck} disabled={isChecking}>
              <Icon n={isChecking ? "refresh" : "search"} size={16} /> {isChecking ? `Checking… ${liveProgress?.percent || 0}% — ${liveProgress?.checkName || ''}` : 'Run the check'}
            </button>
            <button className="btn ghost" onClick={() => { setLiveCheckResult(null); setLiveLogs([]); setLiveProgress(null); }}>
              <Icon n="x" size={14} /> Clear
            </button>
          </div>

          {liveProgress && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg3)', marginBottom: 4 }}>
                <span>{liveProgress.checkName}</span>
                <span>{liveProgress.current}/{liveProgress.total} - {liveProgress.percent}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--line2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${liveProgress.percent}%`, background: 'var(--grad)', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {liveCheckResult && (
            <>
              <div className="g3" style={{ marginTop: 16 }}>
                <Stat l="Total Features" v={liveCheckResult.summary.total} />
                <Stat l="Passed" v={liveCheckResult.summary.passed} />
                <Stat l="Failed" v={liveCheckResult.summary.failed} />
                <Stat l="Warnings" v={liveCheckResult.summary.warnings} />
                <Stat l="Overall %" v={`${liveCheckResult.summary.overallPercent}%`} />
                <Stat l="Status" v={liveCheckResult.summary.overallStatus.toUpperCase()} />
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {Object.entries(getFeatureCategories(liveCheckResult.results)).map(([cat, data]) => (
                  <Card key={cat} style={{ padding: 10, background: 'var(--s1)', border: `1px solid ${data.percent >= 90 ? 'var(--green)' : data.percent >= 70 ? 'var(--warn)' : 'var(--bad)'}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat} - {data.percent}%</div>
                    <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>{data.passed} pass, {data.warnings} warn, {data.failed} fail of {data.total}</div>
                    <div style={{ height: 4, background: 'var(--line2)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${data.percent}%`, background: data.percent >= 90 ? 'var(--green)' : data.percent >= 70 ? 'var(--warn)' : 'var(--bad)' }} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 9 }}>
                      {data.features.slice(0, 3).map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{f.name}</span>
                          <span style={{ color: f.status === 'pass' ? 'var(--green)' : f.status === 'warn' ? 'var(--warn)' : 'var(--bad)' }}>{f.percent}% {f.status === 'pass' ? '✓' : f.status === 'warn' ? '!' : '✗'}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="chead" style={{ fontSize: 11 }}>All Features Detailed - % Working</div>
                <div className="list" style={{ maxHeight: 300, overflow: 'auto' }}>
                  {liveCheckResult.results.map((r, i) => (
                    <div key={i} className="row" style={{ padding: '8px 12px' }}>
                      <span className={`dot ${r.status === 'pass' ? '' : r.status === 'warn' ? 'warn' : 'bad'}`} />
                      <div className="main" style={{ flex: 1 }}>
                        <b style={{ fontSize: 12 }}>{r.name} - {r.percent}% - {r.status.toUpperCase()}</b>
                        <span className="dim sm" style={{ fontSize: 10 }}>{r.details}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: r.status === 'pass' ? 'var(--green)' : r.status === 'warn' ? 'var(--warn)' : 'var(--bad)' }}>{r.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="chead" style={{ fontSize: 11 }}><Icon n="code" size={12} /> Live log</div>
            <div ref={logRef} className="live-log">
              {liveLogs.length === 0 ? (
                <div className="log-dim">Nothing yet — run the check and each step appears here as it happens.</div>
              ) : (
                liveLogs.map((log, i) => (
                  <div key={i} className={`log-${log.type === 'pass' ? 'pass' : log.type === 'fail' ? 'fail' : log.type === 'warn' ? 'warn' : 'info'}`} style={{ marginBottom: 2 }}>
                    [{log.time}] {log.type.toUpperCase()}: {log.message}
                  </div>
                ))
              )}
              {isChecking && <div className="log-info">Checking… {liveProgress?.checkName} {liveProgress?.percent}%</div>}
            </div>
          </div>

          <div className="dim sm" style={{ marginTop: 10, lineHeight: 1.5 }}>
            The check covers the offline tools, the live sources behind music, TV, travel, books and the rest, offline storage, and the theme system — the same results the status panel at the top of the app summarises.
          </div>
        </Fold>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="chead"><Icon n="box" size={16} /> About OmniTools</div>
        <div className="sm" style={{ lineHeight: 1.6 }}>
          {typeof __BUILD__ !== 'undefined' ? <>Build {__BUILD__} · </> : ''}Every setting on this page lives only on this device.
          Nothing here needs an account, and clearing the app data above removes all of it.
        </div>
      </Card>
    </>
  );
}
