/**
 * Minimal image-PDF writer — one JPEG per page, no external library.
 * The same writer the Images → PDF converter uses, shared so the
 * document scanner assembles files the identical, verified way.
 *
 * @param pages [{ bytes: Uint8Array (JPEG), w, h }] in page order
 * @returns Blob (application/pdf)
 */
export function buildImagePdf(pages) {
  const enc = new TextEncoder();
  const chunks = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; return len; };
  const offsets = [0];
  push('%PDF-1.4\n');
  const nPage = pages.length;
  const objCount = 2 + nPage * 3;
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');

  offsets[1] = len; push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  offsets[2] = len; push(`2 0 obj\n<< /Type /Pages /Count ${nPage} /Kids [${kids}] >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pageObj = 3 + i * 3, contentObj = pageObj + 1, imgObj = pageObj + 2;
    offsets[pageObj] = len;
    push(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] ` +
         `/Resources << /XObject << /I0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`);
    const stream = `q ${p.w} 0 0 ${p.h} 0 0 cm /I0 Do Q`;
    offsets[contentObj] = len;
    push(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    offsets[imgObj] = len;
    push(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
         `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    push(p.bytes); push('\nendstream\nendobj\n');
  });

  const xref = len;
  let x = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objCount; i++) x += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  const all = new Uint8Array(len); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new Blob([all], { type: 'application/pdf' });
}

/** Canvas → one PDF page record (JPEG bytes + pixel size). */
export async function canvasPage(canvas, quality = 0.9) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not encode page');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}
