/**
 * UPI QR + chat link maker — both built entirely on this device.
 *
 * The UPI code carries the standard payment address (id, name, amount,
 * note) that every UPI app reads; the chat link opens a conversation
 * with a number you have not saved. Nothing typed here is sent anywhere:
 * the codes are drawn locally, exactly like the QR Code tool.
 */
import React, { useMemo, useState } from 'react';
import { qrDataUrl } from '../core/qr';
import { Card, Field, Copy, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

const VPA = /^[\w.\-]{2,}@[a-zA-Z][a-zA-Z0-9.\-]{1,}$/;

function QrBlock({ text, name }) {
  const url = useMemo(() => {
    try { return qrDataUrl(text, { size: 520, fg: '#101613', bg: '#ffffff' }); }
    catch { return ''; }
  }, [text]);
  if (!url) return <div className="err" style={{ marginTop: 12 }}><p>That text is too long for a QR code.</p></div>;
  return (
    <div style={{ textAlign: 'center', marginTop: 14 }}>
      <img src={url} alt="QR code" style={{ width: 230, height: 230, borderRadius: 16, border: '1px solid var(--line)' }} />
      <div className="btnrow" style={{ justifyContent: 'center', marginTop: 10 }}>
        <a className="btn sm" href={url} download={name} onClick={() => { toast('QR image saved'); sfxPlay('success'); }}>
          <Icon n="download" size={14} /> Save QR image</a>
      </div>
    </div>);
}

function UpiTab() {
  const [pa, setPa] = useState('');
  const [pn, setPn] = useState('');
  const [am, setAm] = useState('');
  const [tn, setTn] = useState('');
  const valid = VPA.test(pa.trim());
  const amt = parseFloat(am);
  const amtBad = am !== '' && !(amt > 0);
  const uri = useMemo(() => {
    if (!valid) return '';
    const qs = new URLSearchParams();
    qs.set('pa', pa.trim());
    if (pn.trim()) qs.set('pn', pn.trim());
    if (!amtBad && amt > 0) { qs.set('am', amt.toFixed(2)); qs.set('cu', 'INR'); }
    if (tn.trim()) qs.set('tn', tn.trim().slice(0, 80));
    return `upi://pay?${qs.toString()}`;
  }, [pa, pn, am, tn, valid, amtBad, amt]);

  return (<>
    <div className="fld"><label>UPI ID</label>
      <div className="ip-wrap"><input value={pa} onChange={(e) => setPa(e.target.value.trim())}
        placeholder="yourname@okhdfcbank" autoComplete="off" spellCheck="false" /></div>
      {pa && !valid && <div className="dim sm" style={{ color: 'var(--bad)', marginTop: 4 }}>
        That does not look like a UPI ID — it should look like name@bank.</div>}
    </div>
    <div className="g2">
      <Field label="Name (shown to payer)" value={pn} onChange={(e) => setPn(e.target.value)} placeholder="e.g. Ramesh Kumar" />
      <Field label="Amount ₹ (optional)" type="number" inputMode="decimal" min="0" value={am}
        onChange={(e) => setAm(e.target.value)} placeholder="Fixed amount" />
    </div>
    {amtBad && <div className="dim sm" style={{ color: 'var(--bad)' }}>Amount must be more than zero.</div>}
    <Field label="Note (optional)" value={tn} onChange={(e) => setTn(e.target.value)} placeholder="e.g. Fees for November" />
    {uri && (<>
      <QrBlock text={uri} name="upi-qr.png" />
      <Card style={{ marginTop: 12 }}>
        <div className="chead">Payment address</div>
        <div className="mono sm" style={{ wordBreak: 'break-all' }}>{uri}</div>
        <div className="btnrow" style={{ marginTop: 8 }}><Copy text={uri} label="Copy address" /></div>
        <p className="dim sm" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
          Anyone can scan this with any UPI app to pay {pn.trim() ? <b>{pn.trim()}</b> : 'this UPI ID'}
          {amt > 0 && !amtBad ? <> a fixed <b>₹{amt.toFixed(2)}</b></> : <> any amount they choose</>}.
          Double-check the UPI ID before printing or sharing — a wrong ID sends money to someone else.</p>
      </Card>
    </>)}
    {!uri && (
      <p className="dim sm" style={{ marginTop: 10, lineHeight: 1.5 }}>
        Enter a UPI ID and the code appears here. Leave the amount blank to let the payer choose it.</p>)}
  </>);
}

function ChatTab() {
  const [cc, setCc] = useState('91');
  const [num, setNum] = useState('');
  const [msg, setMsg] = useState('');
  const digits = (num || '').replace(/\D/g, '');
  const full = useMemo(() => {
    let d = digits;
    if (d.length === 10) d = (cc || '91') + d;
    if (d.length < 11 || d.length > 15) return '';
    return d;
  }, [digits, cc]);
  const link = full ? `https://wa.me/${full}${msg.trim() ? `?text=${encodeURIComponent(msg.trim())}` : ''}` : '';

  return (<>
    <div className="g2">
      <Field label="Country code" value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, '').slice(0, 4))}
        placeholder="91" inputMode="numeric" />
      <Field label="Phone number" value={num} onChange={(e) => setNum(e.target.value)}
        placeholder="10-digit mobile" inputMode="tel" />
    </div>
    <Field label="Pre-filled message (optional)" value={msg} onChange={(e) => setMsg(e.target.value)}
      placeholder="e.g. Namaste, I want to order…" />
    {digits && !full && (
      <div className="dim sm" style={{ color: 'var(--warn)' }}>
        Enter the full number — 10 digits for a local number, or the full number with country code.</div>)}
    {link && (<>
      <QrBlock text={link} name="chat-qr.png" />
      <Card style={{ marginTop: 12 }}>
        <div className="chead">Chat link</div>
        <div className="mono sm" style={{ wordBreak: 'break-all' }}>{link}</div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <Copy text={link} label="Copy link" />
          <a className="btn sm" href={link} target="_blank" rel="noreferrer">
            <Icon n="link" size={14} /> Open chat</a>
        </div>
        <p className="dim sm" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
          Share the link or the code — tapping it opens a chat with this number,
          no contact saving needed.</p>
      </Card>
    </>)}
    {!link && (
      <p className="dim sm" style={{ marginTop: 10, lineHeight: 1.5 }}>
        For shops and freelancers: customers tap one link and reach your chat directly.</p>)}
  </>);
}

export function PayLinks() {
  const [tab, setTab] = useState('upi');
  return (<>
    <div className="cats">
      <button className={`cat ${tab === 'upi' ? 'on' : ''}`} onClick={() => setTab('upi')}>
        <Icon n="qr" size={13} /> UPI payment QR</button>
      <button className={`cat ${tab === 'chat' ? 'on' : ''}`} onClick={() => setTab('chat')}>
        <Icon n="link" size={13} /> Chat link</button>
    </div>
    <div style={{ marginTop: 12 }}>{tab === 'upi' ? <UpiTab /> : <ChatTab />}</div>
    <div className="src"><span className="dot" /><span>Made on this device — nothing you type is uploaded</span></div>
  </>);
}

export default PayLinks;
