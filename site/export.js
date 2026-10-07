// Saving a table as a file: CSV, Excel (.xlsx) or PDF. Written here with no outside library, so it keeps
// working for as long as the site does. Every download on the site goes through askDownload, which first
// says how many rows, how big a file and which filters, and waits for a yes.
const EXPORT_FORMATS = [['csv', 'CSV'], ['xlsx', 'Excel'], ['pdf', 'PDF']];
const PDF_ROWS = 2000;      // a PDF of more rows than this is hundreds of pages; the other two formats take everything

function saveBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

// rows: arrays of numbers and strings
function tableBlob(format, header, rows) {
  if (format === 'xlsx') return xlsxBlob(header, rows);
  const cell = (v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  return new Blob(['\ufeff' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
}

// ---- Excel. A .xlsx file is a zip of a few small XML files; this writes one sheet, with numbers as numbers.
function xlsxBlob(header, rows) {
  const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const letters = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const cell = (v, c, r, bold) => {
    const at = `${letters(c)}${r}`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${at}"><v>${v}</v></c>`;
    if (v === null || v === undefined || v === '') return '';
    return `<c r="${at}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const sheetRows = [header.map((h, c) => cell(h, c, 1, true)).join(''), ...rows.map((row, r) => row.map((v, c) => cell(v, c, r + 2)).join(''))];
  const widths = header.map((h, c) => Math.min(60, Math.max(8, String(h).length + 2, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))));
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = {
    '[Content_Types].xml': `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows.map((r, i) => `<row r="${i + 1}">${r}</row>`).join('')}</sheetData></worksheet>`,
  };
  return new Blob([zipStored(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// a zip with the files stored as they are (no compression): enough for Excel, and a few lines instead of a library
function zipStored(files) {
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const record = (sig, name, data, crc, extra) => {
    const b = new Uint8Array(extra.length + name.length), v = new DataView(b.buffer);
    extra.forEach(([at, size, value]) => (size === 4 ? v.setUint32(at, value, true) : v.setUint16(at, value, true)));
    v.setUint32(0, sig, true);
    b.set(name, extra.length);
    return b;
  };
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(path), data = enc.encode(text), crc = crc32(data);
    // local header (30 bytes) then the data; flag 0x0800 says the name is UTF-8
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const dir = new Uint8Array(46 + name.length), dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true);
    dv.setUint32(16, crc, true); dv.setUint32(20, data.length, true); dv.setUint32(24, data.length, true); dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(local, data); central.push(dir);
    offset += local.length + data.length;
  }
  const size = central.reduce((n, d) => n + d.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end]);
}

// ---- PDF. The browser already knows how to make one from a printed page, with every alphabet intact.
// So the table is laid out on a clean page of its own and the print window opened; "Save as PDF" is there.
function printTable(title, header, rows, note = '') {
  const safe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shown = rows.slice(0, PDF_ROWS), cut = rows.length > shown.length;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(title)}</title><style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font: 9px/1.35 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: -.01em; }
    p { margin: 0 0 10px; color: #555; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #555; border-bottom: 1.5px solid #111; padding: 4px 8px 4px 0; }
    td { padding: 3px 8px 3px 0; border-bottom: .5px solid #ccc; vertical-align: top; }
    tr { break-inside: avoid; }
    .n { text-align: right; font-variant-numeric: tabular-nums; }
  </style></head><body>
    <h1>${safe(title)}</h1>
    <p>Settle it in the Cypher &middot; ${new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })} &middot; ${shown.length.toLocaleString()} row${shown.length === 1 ? '' : 's'}${cut ? ` of ${rows.length.toLocaleString()} (the first ${PDF_ROWS.toLocaleString()}; CSV and Excel hold them all)` : ''}${note ? ` &middot; ${safe(note)}` : ''}</p>
    <table><thead><tr>${header.map((h, c) => `<th class="${typeof (shown[0] || [])[c] === 'number' ? 'n' : ''}">${safe(h)}</th>`).join('')}</tr></thead>
    <tbody>${shown.map((r) => `<tr>${r.map((v) => `<td class="${typeof v === 'number' ? 'n' : ''}">${safe(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`);
  doc.close();
  const done = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow.onafterprint = done;
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(done, 60000); }, 150);
}

// ---- the question asked before any download: this many rows, this big a file, these filters. Go ahead?
//   askDownload({ title, name, count, total, filters, about, note, formats, make })
//   filters: [[what, value], ...] as the visitor set them      about(format): a line on what the file holds
//   make(format, progress): { header, rows } for a table, or { blob, filename, count } for a file that already
//   exists. It may be a promise; the file is made first so that its real size can be shown.
//   formats: false when there is no choice of file type
let saveFormat = 'csv', asking = null;
const byId = (id) => document.getElementById(id);
const sizeWords = (n) => (n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function askDownload(request) {
  asking = { filters: [], ...request };
  drawDownload();
}
function closeDownload() { asking = null; byId('modal').hidden = true; }

async function drawDownload() {
  const a = asking, format = a.formats === false ? null : saveFormat, turn = (a.turn = (a.turn || 0) + 1);
  const safe = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const current = () => asking === a && a.turn === turn;
  const ok = byId('modal-ok');
  a.ready = null;
  byId('modal-body').innerHTML = `
    ${format ? `<div class="seg formats" role="group" aria-label="File type">${EXPORT_FORMATS.map(([key, label]) => `<button data-format="${key}" class="${key === format ? 'on' : ''}">${label}</button>`).join('')}</div>` : ''}
    <p>${[a.about?.(format), format === 'pdf' ? 'Pick "Save as PDF" in the print window that opens.' : ''].filter(Boolean).join(' ')}</p>
    <table><tr><td class="muted">Rows</td><td id="dl-rows"></td></tr><tr><td class="muted">File size</td><td id="dl-size"></td></tr></table>
    <h4>Filters applied</h4>
    ${a.filters.length ? `<table>${a.filters.map(([k, v]) => `<tr><td class="muted">${safe(k)}</td><td>${safe(v)}</td></tr>`).join('')}</table>`
      : '<p class="muted">None. This is every row.</p>'}
    ${a.note ? `<p class="note">${safe(a.note)}</p>` : ''}`;
  const say = (n) => n.toLocaleString();
  const counted = (n) => {
    if (n === undefined) { byId('modal-title').textContent = 'Download'; byId('dl-rows').textContent = 'Counting…'; return; }
    const kept = format === 'pdf' ? Math.min(n, PDF_ROWS) : n;
    byId('modal-title').textContent = `Download ${say(kept)} row${kept === 1 ? '' : 's'}`;
    byId('dl-rows').textContent = kept < n ? `${say(kept)}, the first of ${say(n)}. A PDF holds no more; CSV and Excel hold them all`
      : a.total > n ? `${say(n)} of ${say(a.total)}` : say(n);
  };
  counted(a.count);
  byId('dl-size').textContent = 'Working it out…';
  ok.disabled = true;
  ok.textContent = format === 'pdf' ? 'Open print window' : 'Download';
  byId('modal').hidden = false;
  try {
    const made = await a.make(format, (done) => { if (current()) byId('dl-size').textContent = `Working it out… ${Math.round(100 * done)}%`; });
    if (!current()) return;
    if (!made.blob && format !== 'pdf') made.blob = tableBlob(format, made.header, made.rows);
    const n = made.count ?? made.rows.length;
    counted(n);
    byId('dl-size').textContent = made.blob ? sizeWords(made.blob.size) : 'Set in the print window, by the paper size chosen there';
    a.ready = made;
    ok.disabled = !n;
  } catch {
    if (current()) byId('dl-size').textContent = 'Could not prepare the file. Check the connection and try again.';
  }
}

byId('modal-ok').onclick = () => {
  const a = asking, made = a?.ready;
  if (!made) return;
  if (made.blob) saveBlob(made.blob, made.filename || `${a.name}_${made.rows.length}_rows.${saveFormat}`);
  else printTable(a.title, made.header, made.rows, a.filters.map(([k, v]) => `${k}: ${v}`).join('; '));
  closeDownload();
};
byId('modal-body').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-format]');
  if (!pick || !asking) return;
  saveFormat = pick.dataset.format;
  drawDownload();
});
byId('modal-cancel').onclick = closeDownload;
byId('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeDownload(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && asking) closeDownload(); });
