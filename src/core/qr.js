/**
 * Local QR generation — no network, no third party.
 *
 * The QR tool used to hot-load an image from a hosted QR service while the
 * registry labelled it "works offline": without internet it rendered
 * nothing, and whatever the user typed was sent to that service. The code
 * is now produced entirely on-device by the vendored MIT generator
 * (qrcode-generator.js), so the offline label is finally true and typed
 * text never leaves the phone.
 */
import qrcode from './qrcode-generator.js';

function buildQr(text, ecc = 'M') {
  /* Type 0 asks the library to pick the smallest version that fits; the
     explicit loop is a belt-and-braces fallback for very long payloads. */
  try {
    const q = qrcode(0, ecc);
    q.addData(text);
    q.make();
    if (q.getModuleCount() > 0) return q;
  } catch { /* fall through to the explicit search */ }
  for (let t = 1; t <= 40; t++) {
    try {
      const q = qrcode(t, ecc);
      q.addData(text);
      q.make();
      return q;
    } catch { /* try a bigger version */ }
  }
  throw new Error('That text is too long for a QR code');
}

/**
 * Render `text` as a QR code and return a PNG data URL.
 * Colours default to the app's QR look (green on black).
 */
export function qrDataUrl(text, { size = 300, fg = '#00FF9C', bg = '#000000' } = {}) {
  const qr = buildQr(text);
  const n = qr.getModuleCount();
  const quiet = 4;                                   // mandatory quiet zone
  const scale = Math.max(1, Math.floor(size / (n + quiet * 2)));
  const px = (n + quiet * 2) * scale;
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = fg;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return cv.toDataURL('image/png');
}
