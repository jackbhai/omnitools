/**
 * trip-map.jsx — the visual route: hidden until asked for, then drawn from the
 * same coordinates the alert engine uses.
 *
 * Leaflet is only ever pulled in by a dynamic import inside an effect, so (a)
 * this module renders safely during the SSR smoke test, where there is no
 * window, and (b) ~48 kB of map library never enters a chunk until somebody
 * actually opens a map.
 *
 * Tile sources, in order, each run by a different operator, because one CDN
 * going quiet should not switch your route map off:
 *   1. CARTO dark_matter — matches this app on black, serves OpenStreetMap data
 *   2. tile.openstreetmap.org — the standard style, the canonical home of the data
 *   3. our own sketch — no network at all: the same stop coordinates projected
 *      into an SVG, so an offline user still sees the shape of their ride.
 */
import React, { useEffect, useRef, useState } from 'react';

/* Key-free tile sources, in the order they are tried. Each one is run by a
 * different organisation, so a single operator's outage or policy change does
 * not take the map away:
 *
 *   osm.fr  — the French OSM association: full detail, place names, metro lines
 *   Esri    — a light grey canvas that stays quiet behind a bright route line
 *   otm     — OpenTopoMap, when you want the terrain and the river
 *   osm.org — the canonical OSM server, kept last on purpose: it answers a
 *             blocked client with a 200 and an "Access blocked" image instead of
 *             an error, so the fallback chain below cannot catch it failing
 *
 * CARTO's basemap CDN is deliberately gone. Since 2025 it paints "API KEY
 * REQUIRED" across the tiles of any keyless app and still returns HTTP 200, so
 * nothing here would ever notice — a map of watermarks is worse than no map.
 */
export const PROVIDERS = [
  { id: 'osmfr', label: 'osm.fr',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    sub: 'abc', attr: '© OpenStreetMap contributors' },
  { id: 'esri', label: 'Esri grey',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    sub: null, attr: '© Esri — Esri, Garmin, GEBCO, NOAA' },
  { id: 'otm', label: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    sub: 'abc', attr: '© OpenStreetMap contributors, SRTM · Map style: © OpenTopoMap (CC-BY-SA)' },
  { id: 'osm', label: 'openstreetmap.org',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    sub: null, attr: '© OpenStreetMap contributors' },
];

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
export const valid = (points) => (points || []).filter((p) => p && isFinite(p.lat) && isFinite(p.lon));

/* ------------------------------------------------------------------ sketch */
/** Equirectangular-ish projection with a cos(lat) squash — no library needed. */
export function project(points, w = 340, h = 190, pad = 16) {
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const la0 = Math.min(...lats), la1 = Math.max(...lats);
  const lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  const kx = Math.cos((((la0 + la1) / 2) * Math.PI) / 180) || 1;
  const sx = (lo1 - lo0) * kx || 1e-6, sy = (la1 - la0) || 1e-6;
  const s = Math.min((w - pad * 2) / sx, (h - pad * 2) / sy);
  const ox = (w - sx * s) / 2, oy = (h - sy * s) / 2;
  return points.map((p) => ({ ...p, x: ox + (p.lon - lo0) * kx * s, y: oy + (la1 - p.lat) * s }));
}

export function Sketch({ points, active = -1, onSelect, fix, height = 190 }) {
  const w = 340;
  const src = valid(points);
  const pts = project(src, w, height);
  if (!pts.length) return null;
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const scale = project([{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }], w, height);
  const metresPerPx = 111320 / Math.abs(scale[1].y - scale[0].y || 1);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img"
      aria-label={`Route sketch, ${pts.length} points`} className="sketch">
      <rect x="0" y="0" width={w} height={height} rx="10" fill="var(--s1)" />
      <polyline points={line} fill="none" stroke="#0C3A2C" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke="#00FF9C" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
      {fix && isFinite(fix.lat) && (() => {
        const f = project([{ lat: fix.lat, lon: fix.lon }], w, height)[0];
        const r = Math.min(60, Math.max(5, (fix.accuracy || 45) / metresPerPx));
        return (<g>
          <circle cx={f.x} cy={f.y} r={r} fill="#00E5FF" opacity=".14" />
          <circle cx={f.x} cy={f.y} r="3.4" fill="#00E5FF" /></g>);
      })()}
      {pts.map((p, i) => {
        const hot = i === active || p.isBoard || p.isAlight;
        return (
          <g key={i} onClick={() => onSelect && onSelect(i)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <circle cx={p.x} cy={p.y} r={i === active ? 5.8 : hot ? 4.4 : 2.5}
              fill={i === active ? '#00E5FF' : p.isBoard ? '#00FF9C' : p.isAlight ? '#FFD166' : '#0E1412'}
              stroke={hot ? '#E8FFF4' : '#2A3B36'} strokeWidth="1.2" />
            {hot && (
              <text x={p.x} y={Math.max(9, p.y - 9)} fill="#9DB5AC" fontSize="7.6" textAnchor="middle"
                style={{ fontFamily: 'system-ui' }}>{(p.name || '').slice(0, 24)}</text>)}
          </g>);
      })}
    </svg>);
}

/* ------------------------------------------------------------------- panel */
export default function TripMap({ points, active = -1, fix, onSelect, height = 250, className = '' }) {
  const box = useRef(null);
  const api = useRef(null);          // { L, map, draw }
  const [status, setStatus] = useState(isBrowser ? 'loading' : 'ssr');
  const [srcIdx, setSrcIdx] = useState(0);

  /* one init per mount: build the map, wire the tile fallback chain, expose draw() */
  useEffect(() => {
    if (!isBrowser || !box.current) return undefined;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return undefined;
    }
    let dead = false;
    (async () => {
      let L, css;
      try {
        const mod = await import('leaflet');
        css = import('leaflet/dist/leaflet.css');
        L = mod.default || mod;
      } catch { if (!dead) setStatus('offline'); return; }
      if (dead || !box.current || api.current) return;
      const map = L.map(box.current, {
        zoomControl: true, attributionControl: true, scrollWheelZoom: false,
        tap: true, preferCanvas: true, fadeAnimation: true, zoomAnimation: false,
      });
      api.current = { L, map };
      css.then(() => { if (!dead) setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60); });
      setStatus('ready');
      try { map.invalidateSize(); } catch {}
    })();
    return () => {
      dead = true;
      try { api.current?.map?.remove(); } catch {}
      api.current = null;
    };
  }, []);

  /* which tile layer is live; switching providers is a redraw of one layer */
  useEffect(() => {
    const a = api.current;
    if (!a || status !== 'ready') return undefined;
    const { L, map } = a;
    if (srcIdx >= PROVIDERS.length) { setStatus('offline'); return undefined; }
    const p = PROVIDERS[srcIdx];
    let errs = 0;
    const t = L.tileLayer(p.url, { ...(p.sub ? { subdomains: p.sub } : {}), maxZoom: 19, minZoom: 3,
      attribution: p.attr, crossOrigin: true });
    t.on('tileerror', () => { if (++errs === 4) setSrcIdx((i) => i + 1); });
    t.addTo(map);
    return () => { try { t.remove(); } catch {} };
  }, [status, srcIdx]);

  /* the actual geometry: every change to points / active / fix redraws in place */
  useEffect(() => {
    const a = api.current;
    if (!a || status !== 'ready') return;
    const { L, map } = a;
    if (a.layer) { try { a.layer.remove(); } catch {} a.layer = null; }
    const pts = valid(points);
    if (!pts.length) return;
    const latlngs = pts.map((p) => [p.lat, p.lon]);
    const walk = (points || []).some((p) => p.kind === 'walk');
    const layer = L.layerGroup().addTo(map);
    L.polyline(latlngs, { color: '#0C3A2C', weight: 6.5, opacity: .85 }).addTo(layer);
    L.polyline(latlngs, { color: '#00FF9C', weight: 3.2, opacity: .95, dashArray: walk ? '2 7' : null,
      lineCap: 'round' }).addTo(layer);
    pts.forEach((p, i) => {
      const role = i === active ? 'now' : p.isBoard ? 'board' : p.isAlight ? 'alight' : 'stop';
      const m = L.circleMarker([p.lat, p.lon], {
        radius: role === 'stop' ? 3.4 : 6.2,
        color: role === 'now' ? '#00E5FF' : role === 'alight' ? '#FFD166' : '#E8FFF4',
        weight: role === 'stop' ? 1 : 1.8,
        fillColor: role === 'now' ? '#00E5FF' : role === 'board' ? '#00FF9C' : role === 'alight' ? '#FFD166' : '#0E1412',
        fillOpacity: role === 'stop' ? .92 : 1 }).addTo(layer);
      m.bindTooltip(`${i + 1}. ${p.name || ''}${p.ref ? ' · ' + p.ref : p.line ? ' · ' + p.line : ''}`,
        { direction: 'top', offset: [0, -6], opacity: .96 });
      if (onSelect) m.on('click', () => onSelect(i));
    });
    if (fix && isFinite(fix.lat)) {
      L.circle([fix.lat, fix.lon], { radius: Math.max(14, fix.accuracy || 45), color: '#00E5FF',
        weight: 1, fillColor: '#00E5FF', fillOpacity: .12 }).addTo(layer);
    }
    a.layer = layer;
    if (active >= 0 && pts[active]) {
      try { map.panTo([pts[active].lat, pts[active].lon]); } catch {}
    } else {
      try { map.fitBounds(L.latLngBounds(latlngs).pad(0.16), { animate: false }); } catch {}
    }
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60);
  }, [JSON.stringify(valid(points).map((p) => [p.lat, p.lon, p.name, p.kind])), active,
      fix?.lat, fix?.lon, fix?.accuracy, status, onSelect]);

  const pts = valid(points);
  const live = PROVIDERS[Math.min(srcIdx, PROVIDERS.length - 1)]?.label;
  return (
    <div className={`mapbox ${className}`}>
      <div ref={box} className="mapleaf" style={{ height, display: status === 'ready' ? 'block' : 'none' }} />
      {status === 'loading' && <div className="mapnote" style={{ height }}><span className="dot" /> Loading map…</div>}
      {(status === 'offline' || status === 'ssr') && (
        <div className="mapsketchwrap">
          <Sketch points={pts} active={active} onSelect={onSelect} fix={fix} height={height} />
        </div>)}
      <div className="mapnote sm">
        {status === 'offline'
          ? `Offline sketch — ${pts.length} points drawn from the app's own data; no tiles were reachable.`
          : `${pts.length} points · amber pin is where you get off`}
        {status === 'ready'
          ? <button className="mapswap" onClick={() => setSrcIdx((i) => (i + 1) % PROVIDERS.length)}
              title="Free tile servers, no account, no key. Press to switch to the next one.">
              tiles: {live} ▸</button>
          : <button className="mapswap" onClick={() => { setSrcIdx(0); setStatus('loading'); }}>
              try tiles again</button>}
      </div>
    </div>);
}
