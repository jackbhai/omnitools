/**
 * Gold & silver — the world spot price, converted to rupees.
 *
 * The price feed is a genuinely free, keyless spot source (verified live
 * from this app's origin, updating by the minute), with a daily-rate
 * snapshot as the failover leg. The rupee figures are a straight
 * conversion at today's exchange rate — they are NOT a local jeweller
 * or exchange quote: Indian retail prices add import duty, GST and
 * making charges on top, and the card says exactly that.
 */
import React from 'react';
import { jget } from '../core/engine';
import * as P from '../core/providers';
import { useData, Spin, Err, Card, Stat, Src, fmt } from '../ui/kit';

const TROY_OZ_G = 31.1034768;

function spotPool(sym) {
  return [
    { id: `spot-live-${sym}`, label: 'Spot price', async run() {
        const d = await jget(`https://api.gold-api.com/price/${sym}`, { ms: 10000 });
        if (!d?.price) throw new Error('bad');
        return { usdOz: d.price, at: d.updatedAt, live: true }; } },
    { id: `spot-daily-${sym}`, label: 'Daily rate', async run() {
        const lc = sym.toLowerCase();
        const d = await jget(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lc}.json`, { ms: 10000 });
        const usd = d?.[lc]?.usd, inr = d?.[lc]?.inr;
        if (!usd) throw new Error('bad');
        return { usdOz: 1 / usd, inrOz: inr ? 1 / inr : null, at: d.date, live: false }; } },
  ];
}
const GOLD = spotPool('XAU');
const SILVER = spotPool('XAG');

function MetalCard({ title, pool, per }) {
  const m = useData(`spot-${title}`, pool, {}, { ttl: 6e5, spread: false });
  const fx = useData('fx-usd', P.currency, { base: 'USD' }, { ttl: 36e5 });
  const d = m.data;
  const inrRate = fx.data?.rates?.INR;
  const inrOz = d ? (d.inrOz ?? (inrRate ? d.usdOz * inrRate : null)) : null;
  return (
    <Card style={{ marginBottom: 12 }}>
      <div className="chead">{title}</div>
      {m.loading && <Spin t="Reading the market" />}
      {m.error && <Err error={m.error} retry={() => m.run()} />}
      {d && (<>
        <div className="big">${fmt(d.usdOz, 2)}<span style={{ fontSize: 15 }}> /oz</span></div>
        {inrOz
          ? <div className="g2" style={{ marginTop: 10 }}>
              {per.map(([label, grams]) => (
                <Stat key={label} l={label} v={'₹' + fmt(inrOz * grams / TROY_OZ_G, 0)} />))}
            </div>
          : <div className="dim sm" style={{ marginTop: 6 }}>Rupee conversion unavailable right now — the dollar price above is live.</div>}
        <div className="dim" style={{ fontSize: 10.5, marginTop: 8 }}>
          {d.live ? 'Live spot' : 'Daily rate'} · updated {d.at
            ? new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : 'today'}
        </div>
        <Src meta={m.meta} />
      </>)}
    </Card>);
}

export function Bullion() {
  return (<>
    <MetalCard title="Gold" pool={GOLD} per={[['Per 10 grams', 10], ['Per gram', 1]]} />
    <MetalCard title="Silver" pool={SILVER} per={[['Per kilogram', 1000], ['Per 10 grams', 10]]} />
    <Card>
      <p className="dim sm" style={{ margin: 0, lineHeight: 1.55 }}>
        These are <b>world spot prices converted at today's exchange rate</b> — the raw metal
        value before any Indian charges. A jeweller's price or an exchange quote will be
        higher: import duty, GST and making charges are added on top. Use this to know
        whether gold is up or down today, not as a shop quote.</p>
    </Card>
  </>);
}

export default Bullion;
