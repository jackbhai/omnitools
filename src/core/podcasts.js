/**
 * Podcasts — a keyless podcast index for discovery, and the shows' own
 * feeds for episodes.
 *
 * Search answers as JSON with CORS open (verified from this app's origin).
 * Episode lists come from each show's public RSS feed: fetched directly
 * first (most podcast hosts answer with CORS open), then through one
 * public relay as a second leg for feeds that do not. A feed that fails
 * both ways reports an honest error — episodes are never invented.
 */
import { jget } from './engine';

const GENRES = [
  { id: 1303, n: 'Comedy' },
  { id: 1489, n: 'Stories & Katha' },
  { id: 1488, n: 'News' },
  { id: 1444, n: 'Spirituality' },
  { id: 1301, n: 'Arts' },
  { id: 1321, n: 'Business' },
  { id: 1304, n: 'Education' },
  { id: 1487, n: 'History' },
];

export const PODCAST_GENRES = GENRES;

const shapeShow = (r) => ({
  id: r.collectionId,
  title: r.collectionName || r.trackName || 'Untitled show',
  author: r.artistName || '',
  art: r.artworkUrl600 || r.artworkUrl100 || '',
  feed: r.feedUrl || '',
  genre: r.primaryGenreName || '',
  count: r.trackCount || 0,
});

/* One capability, one endpoint — but the index has regional mirrors of
   the same catalogue, so the pool tries IN then US then GB editions. */
export const podcastSearch = ['IN', 'US', 'GB'].map((cc) => ({
  id: `pod-index-${cc.toLowerCase()}`,
  label: 'Podcast index',
  async run({ q }) {
    const d = await jget(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=30&country=${cc}`,
      { ms: 10000 });
    const out = (d.results || []).map(shapeShow).filter((s) => s.feed);
    if (!out.length) throw new Error('empty');
    return out;
  },
}));

export const podcastBrowse = ['IN', 'US', 'GB'].map((cc) => ({
  id: `pod-browse-${cc.toLowerCase()}`,
  label: 'Podcast index',
  async run({ genreId }) {
    const d = await jget(
      `https://itunes.apple.com/search?term=podcast&media=podcast&entity=podcast&attribute=genreIndex&genreId=${genreId}&limit=30&country=${cc}`,
      { ms: 10000 });
    const out = (d.results || []).map(shapeShow).filter((s) => s.feed);
    if (!out.length) throw new Error('empty');
    return out;
  },
}));

/* ------------------------------------------------------------------ feeds */
async function fetchFeedText(feedUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(feedUrl, { signal: ctrl.signal });
    if (!r.ok) throw new Error('feed ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function fetchFeedTextRelayed(feedUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
      { signal: ctrl.signal });
    if (!r.ok) throw new Error('relay ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

const txt = (el, sel) => el?.querySelector(sel)?.textContent?.trim() || '';

function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('That feed could not be read');
  const channel = doc.querySelector('channel');
  if (!channel) throw new Error('That feed could not be read');
  const showArt = channel.querySelector('image url')?.textContent?.trim()
    || channel.getElementsByTagName('itunes:image')[0]?.getAttribute('href') || '';
  const items = [...channel.querySelectorAll('item')].slice(0, 60).map((it) => {
    const enc = it.querySelector('enclosure');
    const durRaw = it.getElementsByTagName('itunes:duration')[0]?.textContent?.trim() || '';
    return {
      title: txt(it, 'title') || 'Untitled episode',
      audio: enc?.getAttribute('url') || '',
      date: txt(it, 'pubDate'),
      dur: durRaw,
      desc: (txt(it, 'description') || '').replace(/<[^>]+>/g, '').slice(0, 220),
    };
  }).filter((e) => e.audio);
  if (!items.length) throw new Error('No playable episodes in that feed');
  return { art: showArt, episodes: items };
}

/** Episodes for one show: direct fetch, then a relayed fetch. */
export const podcastFeed = [
  { id: 'pod-feed-direct', label: 'Show feed',
    async run({ feed }) { return parseFeed(await fetchFeedText(feed)); } },
  { id: 'pod-feed-relay', label: 'Show feed',
    async run({ feed }) { return parseFeed(await fetchFeedTextRelayed(feed)); } },
];
