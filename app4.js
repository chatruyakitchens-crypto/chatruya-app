/* Chatruya Kitchens — PDF bills, phone book, menu posters */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, num, $, $$, esc, inr, today, niceDay, ui, toast, openSheet, closeSheet, views, acts, render, field, val, confirmAsk, phoneDigits, fmtClock, dayNo, orderForm } = A;

  const LEAF = '#173B2C', LEAF2 = '#24563F', TURMERIC = '#F4B400', INK = '#17201B', MUTED = '#5D6B63', LINE = '#D3DBD6', STEEL = '#E9EDEB';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
  const ROUND = '"SF Pro Rounded", ui-rounded, "Nunito", ' + FONT;

  function kitchen() {
    const k = S.get('config', 'kitchen') || {};
    return { name: S.meta.kitchenName || k.name || 'Chatruya Kitchens', phone: k.phone || '' };
  }
  function makeCanvas(w, h, scale) {
    const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    const cx = cv.getContext && cv.getContext('2d'); if (!cx) return null;
    cx.scale(scale, scale); cx.textBaseline = 'alphabetic'; return { cv, cx };
  }
  function crop(src, w, h, scale) {
    const out = makeCanvas(w, h, 1 / 1); if (!out) return src;
    out.cv.width = Math.round(w * scale); out.cv.height = Math.round(h * scale);
    out.cv.getContext('2d').drawImage(src, 0, 0); return out.cv;
  }
  function fit(cx, text, max) {
    text = String(text || ''); if (cx.measureText(text).width <= max) return text;
    while (text.length > 1 && cx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }
  function wrap(cx, text, max) {
    const words = String(text || '').split(/\s+/); const out = []; let line = '';
    words.forEach((w) => { const t = line ? line + ' ' + w : w; if (cx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; });
    if (line) out.push(line); return out;
  }
  const rs = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // ================= BILL =================
  function billCanvas(o) {
    const W = 720, P = 40, SC = 2; const k = kitchen();
    const big = makeCanvas(W, 2400, SC); if (!big) return null;
    const { cv, cx } = big;
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, 2400);
    // header
    cx.fillStyle = LEAF; cx.fillRect(0, 0, W, 116);
    cx.fillStyle = '#fff'; cx.font = '800 32px ' + ROUND; cx.fillText(fit(cx, k.name, 440), P, 56);
    cx.fillStyle = TURMERIC; cx.font = '600 17px ' + FONT; cx.fillText(k.phone ? 'WhatsApp / call ' + k.phone : 'Home-cooked meals', P, 88);
    cx.textAlign = 'right'; cx.fillStyle = '#fff'; cx.font = '700 20px ' + FONT; cx.fillText(o.billNo ? 'Bill ' + o.billNo : 'Order #' + dayNo(o), W - P, 56);
    cx.font = '500 16px ' + FONT; cx.fillStyle = '#CFE0D6'; cx.fillText(A.fmtDate(o.billDate || C.serveDate(o)) + ' · ' + C.slotOf(o), W - P, 86); cx.textAlign = 'left';
    let y = 160;
    cx.fillStyle = MUTED; cx.font = '600 14px ' + FONT; cx.fillText('Bill to', P, y);
    cx.textAlign = 'right'; cx.fillText('Delivery', W - P, y); cx.textAlign = 'left';
    y += 28; cx.fillStyle = INK; cx.font = '700 21px ' + FONT; cx.fillText(fit(cx, o.customer || 'Customer', 380), P, y);
    cx.textAlign = 'right'; cx.font = '600 18px ' + FONT; cx.fillText(serveText(o), W - P, y); cx.textAlign = 'left';
    cx.font = '400 16px ' + FONT; cx.fillStyle = MUTED;
    if (o.phone) { y += 24; cx.fillText(o.phone, P, y); }
    if (o.address) wrap(cx, o.address, 400).slice(0, 3).forEach((ln) => { y += 22; cx.fillText(ln, P, y); });
    // items table
    y += 34; cx.fillStyle = STEEL; cx.fillRect(P, y - 22, W - 2 * P, 36);
    cx.fillStyle = MUTED; cx.font = '700 14px ' + FONT;
    const cQ = 430, cR = 540, cA = W - P - 10;
    cx.fillText('Item', P + 12, y + 1); cx.textAlign = 'right'; cx.fillText('Qty', cQ, y + 1); cx.fillText('Rate', cR, y + 1); cx.fillText('Amount', cA, y + 1); cx.textAlign = 'left';
    y += 20;
    (o.items || []).forEach((l) => {
      y += 34; cx.fillStyle = INK; cx.font = '500 18px ' + FONT;
      cx.fillText(fit(cx, l.name, cQ - P - 70), P + 12, y);
      cx.textAlign = 'right'; cx.fillText(String(l.qty), cQ, y);
      cx.fillStyle = MUTED; cx.fillText(num(l.price) ? rs(l.price) : '—', cR, y);
      cx.fillStyle = INK; cx.font = '600 18px ' + FONT; cx.fillText(num(l.price) ? rs(num(l.qty) * num(l.price)) : 'free', cA, y); cx.textAlign = 'left';
      cx.strokeStyle = STEEL; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(P, y + 13); cx.lineTo(W - P, y + 13); cx.stroke();
    });
    // totals
    y += 26;
    const sumRow = (label, value, strong) => {
      y += strong ? 46 : 30; cx.textAlign = 'right';
      cx.fillStyle = strong ? INK : MUTED; cx.font = (strong ? '800 26px ' + ROUND : '500 17px ' + FONT); cx.fillText(label, cR, y);
      cx.fillStyle = INK; cx.fillText(value, cA, y); cx.textAlign = 'left';
    };
    sumRow('Subtotal', rs(o.subtotal != null ? o.subtotal : C.orderTotals(o.items, 0, 0).subtotal));
    if (num(o.delivery)) sumRow('Delivery', rs(o.delivery));
    if (num(o.discount)) sumRow('Discount', '− ' + rs(o.discount));
    y += 14; cx.strokeStyle = INK; cx.setLineDash([6, 5]); cx.beginPath(); cx.moveTo(cR - 160, y); cx.lineTo(W - P, y); cx.stroke(); cx.setLineDash([]);
    sumRow('Total', rs(o.total), true);
    const plates = C.platesOf(o.items);
    if (plates > 1) { y += 26; cx.textAlign = 'right'; cx.fillStyle = MUTED; cx.font = '500 15px ' + FONT; cx.fillText(plates + ' plates', cA, y); cx.textAlign = 'left'; }
    // payment badge
    y += 44; const paid = !!o.paid; const badge = paid ? 'PAID · ' + (o.payMode || '') : 'PAYMENT DUE · ' + rs(o.total);
    cx.font = '800 16px ' + FONT; const bw = cx.measureText(badge).width + 36;
    cx.fillStyle = paid ? '#DCE8E1' : '#F8E1DA'; roundRect(cx, P, y - 26, bw, 38, 19); cx.fill();
    cx.fillStyle = paid ? '#1E5A3C' : '#C2401F'; cx.fillText(badge, P + 18, y - 1);
    if (o.notes) { cx.fillStyle = MUTED; cx.font = '400 15px ' + FONT; wrap(cx, 'Note: ' + o.notes, W - 2 * P).slice(0, 3).forEach((ln) => { y += 26; cx.fillText(ln, P, y + 16); }); y += 16; }
    // footer
    y += 56; cx.fillStyle = STEEL; cx.fillRect(0, y - 30, W, 70);
    cx.fillStyle = LEAF2; cx.font = '700 17px ' + FONT; cx.textAlign = 'center'; cx.fillText('Thank you for ordering with ' + k.name + '!', W / 2, y + 10); cx.textAlign = 'left';
    const H = y + 40;
    return { canvas: crop(cv, W, H, SC), w: Math.round(W * SC), h: Math.round(H * SC) };
  }
  function serveText(o) { const d = C.serveDate(o), s = C.slotOf(o); return s + ', by ' + fmtClock(C.deliverAt(d, s)); }
  function roundRect(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }

  // One-page PDF wrapping a JPEG (no libraries needed). Page is 420 pt wide.
  function jpegToPdf(bytes, wPx, hPx) {
    const enc = (s) => new TextEncoder().encode(s);
    const parts = []; const off = []; let len = 0;
    const push = (u) => { parts.push(u); len += u.length; };
    const obj = (n, body) => { off[n] = len; push(enc(n + ' 0 obj\n' + body + '\nendobj\n')); };
    const pw = 420, ph = Math.round((hPx * pw / wPx) * 100) / 100;
    push(enc('%PDF-1.4\n'));
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    off[4] = len;
    push(enc('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + wPx + ' /Height ' + hPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytes.length + ' >>\nstream\n'));
    push(bytes); push(enc('\nendstream\nendobj\n'));
    const content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    obj(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    const xref = len; let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let n = 1; n <= 5; n++) x += String(off[n]).padStart(10, '0') + ' 00000 n \n';
    x += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    push(enc(x));
    const out = new Uint8Array(len); let p = 0; parts.forEach((u) => { out.set(u, p); p += u.length; });
    return out;
  }
  function dataUrlBytes(url) { const bin = atob(url.split(',')[1]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  async function shareOrSave(bytes, type, filename, text) {
    const blob = new Blob([bytes], { type });
    let file = null; try { file = new File([blob], filename, { type }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename, text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    return 'downloaded';
  }
  const safeName = (s) => String(s || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 30);

  acts.billPdf = async (id) => {
    const o0 = S.get('orders', id); if (!o0) return;
    const o = o0.billNo ? o0 : { ...o0, billNo: C.nextBillNo(), billDate: today() };
    const b = billCanvas(o); if (!b) { toast('This phone can’t make PDFs'); return; }
    const pdf = jpegToPdf(dataUrlBytes(b.canvas.toDataURL('image/jpeg', 0.9)), b.w, b.h);
    const name = 'Bill-' + o.billNo + (o.customer ? '-' + safeName(o.customer) : '') + '.pdf';
    const r = await shareOrSave(pdf, 'application/pdf', name, kitchen().name + ' bill ' + o.billNo + ': ' + rs(o.total));
    if (r === 'downloaded') toast('Bill saved as PDF. Attach it in WhatsApp from Files/Downloads.');
    await S.put('orders', r === 'cancelled' ? o : { ...o, billSentAt: C.nowLocal(), billSentVia: 'PDF' });
    A.orderDetail(id);
  };

  // ================= PHONE BOOK =================
  ui.pbQ = ui.pbQ || '';
  views.customers = () => {
    const q = ui.pbQ.trim().toLowerCase();
    const all = C.customers(); const list = all.filter((c) => !q || ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.address || '') + ' ' + (c.notes || '')).toLowerCase().includes(q));
    let h = '<div class="screen-title"><h1>Phone book</h1><button class="btn small alt" data-act="contactNew">Add contact</button></div>';
    if (!all.length) return h + '<div class="empty"><p>Customers from your orders appear here automatically. You can also add people who haven’t ordered yet.</p><button class="btn small" data-act="contactNew">Add contact</button></div>';
    h += '<input class="search" id="pbq" type="search" placeholder="Search name, number, area" value="' + esc(ui.pbQ) + '" data-input="pbQ">';
    h += '<div class="btns" style="margin-bottom:12px"><button class="btn small alt" data-act="vcf">Save all to phone contacts</button></div>';
    h += '<p class="sub" style="margin:-4px 0 10px">' + all.length + ' customers. To send a menu poster to many at once, save them to your phone contacts, then add them to a WhatsApp broadcast list.</p>';
    if (!list.length) return h + '<div class="empty"><p>No one matches that search.</p></div>';
    return h + '<div class="list">' + list.map((c) => '<button class="rowc" data-act="contact:' + encodeURIComponent(c.key) + '"><div class="grow"><div class="t">' + esc(c.name || c.phone) + (c.contactId ? '' : ' <span class="sub">(from orders)</span>') + '</div>' +
      '<div class="m">' + esc([c.phone, c.orders ? c.orders + ' order' + (c.orders === 1 ? '' : 's') + ' · ' + inr(c.spent) : 'No orders yet', c.last ? 'last ' + niceDay(c.last) : '', c.notes].filter(Boolean).join(' · ')) + '</div></div><span aria-hidden="true">›</span></button>').join('') + '</div>';
  };
  const findCust = (key) => C.customers().find((c) => c.key === key);
  acts.contact = (k) => contactSheet(decodeURIComponent(k));
  acts.contactNew = () => contactForm(null);
  acts.contactEdit = (k) => contactForm(findCust(decodeURIComponent(k)));
  function contactSheet(key) {
    const c = findCust(key); if (!c) { closeSheet(); return; }
    const recent = S.list('orders').filter((o) => (C.phoneKey(o.phone) || (o.customer || '').trim().toLowerCase()) === key).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    let b = '<div class="card" style="margin-bottom:12px"><div style="font-weight:800;font-size:19px">' + esc(c.name || 'No name') + '</div>' +
      (c.phone ? '<div class="sub">' + esc(c.phone) + '</div>' : '') + (c.address ? '<div class="sub">' + esc(c.address) + '</div>' : '') +
      (c.notes ? '<div class="note" style="margin:10px 0 0">' + esc(c.notes) + '</div>' : '') +
      '<div class="sub" style="margin-top:8px">' + (c.orders ? c.orders + ' orders · ' + inr(c.spent) + ' in total' : 'No orders yet') + '</div></div>';
    b += '<div class="btns" style="margin-bottom:8px">' + (c.phone ? '<a class="btn small alt" href="tel:' + esc(c.phone.replace(/\s/g, '')) + '">Call</a><a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/' + phoneDigits(c.phone) + '">WhatsApp</a>' : '') +
      '<button class="btn small warm" data-act="orderFor:' + encodeURIComponent(key) + '">New order</button></div>';
    b += '<div class="btns" style="margin-bottom:12px"><button class="btn small alt" data-act="contactEdit:' + encodeURIComponent(key) + '">' + (c.contactId ? 'Edit' : 'Save to phone book') + '</button>' +
      (c.contactId ? '<button class="btn small danger" data-act="contactDel:' + c.contactId + '">Remove</button>' : '') + '</div>';
    if (recent.length) b += '<div class="day-h"><span>Recent orders</span></div><div class="list">' + recent.map((o) => A.ticket(o, false)).join('') + '</div>';
    openSheet(c.name || c.phone || 'Customer', b, []);
    A.bind($('#sheetBody'));
  }
  acts.orderFor = (k) => { const c = findCust(decodeURIComponent(k)); orderForm(null, c ? { customer: c.name, phone: c.phone, address: c.address } : {}); };
  acts.contactDel = async (id) => { const r = S.get('config', id); if (!r || !confirmAsk('Remove ' + (r.name || 'this contact') + ' from the phone book? Their past orders stay.')) return; await S.remove('config', id); toast('Removed'); closeSheet(); };
  function contactForm(c) {
    c = c || {};
    const existing = c.contactId ? S.get('config', c.contactId) : null;
    const b = '<form id="cf">' + field('Name', '<input class="in" name="name" value="' + esc(c.name || '') + '">') +
      field('Phone', '<input class="in" name="phone" type="tel" value="' + esc(c.phone || '') + '" placeholder="98765 43210">') +
      field('Address or area', '<textarea class="in" name="address" rows="2">' + esc(c.address || '') + '</textarea>') +
      field('Notes', '<input class="in" name="notes" value="' + esc(c.notes || '') + '" placeholder="Office lunch every weekday, less spicy…">') + '</form>';
    openSheet(existing ? 'Edit contact' : 'Add contact', b, [{ label: 'Save contact', run: async () => {
      const f = $('#cf'); const name = val(f, 'name').trim(), phone = val(f, 'phone').trim();
      if (!name && !phone) { toast('Enter a name or phone number'); return; }
      const dup = !existing && C.phoneKey(phone) && C.contacts().find((r) => C.phoneKey(r.phone) === C.phoneKey(phone));
      const base = existing || dup || {};
      const r = await S.put('config', { ...base, id: base.id || 'contact_' + C.uid(), kind: 'contact', name, phone, address: val(f, 'address').trim(), notes: val(f, 'notes').trim() });
      toast((name || phone) + ' saved'); contactSheet(C.phoneKey(r.phone) || (r.name || '').trim().toLowerCase());
    } }]);
  }
  acts.vcf = () => {
    const list = C.customers().filter((c) => C.phoneKey(c.phone).length === 10);
    if (!list.length) { toast('No phone numbers to save yet'); return; }
    const k = kitchen().name;
    const v = list.map((c) => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + (c.name || c.phone).replace(/[\r\n,;]/g, ' '), 'N:;' + (c.name || c.phone).replace(/[\r\n,;]/g, ' ') + ';;;',
      'TEL;TYPE=CELL:+91' + C.phoneKey(c.phone), 'ORG:' + k + ' customer', c.address ? 'ADR;TYPE=HOME:;;' + c.address.replace(/[\r\n,;]/g, ' ') + ';;;;' : '', 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n') + '\r\n';
    shareOrSave(new TextEncoder().encode(v), 'text/vcard', safeName(k) + '-customers.vcf', list.length + ' customers').then((r) => { if (r === 'downloaded') toast('Contacts file saved. Open it to add them to your phone.'); });
  };

  // ================= MENU POSTERS (one saved list per meal or event) =================
  const PRESETS = [
    { id: 'poster_breakfast', name: 'Breakfast', cat: /breakfast|tiffin/i },
    { id: 'poster_lunch', name: 'Lunch' },
    { id: 'poster_dinner', name: 'Dinner' },
    { id: 'poster_special', name: 'Special event', special: true }
  ];
  const sellable = () => S.list('dishes').filter((d) => d.active !== false && num(d.price) > 0);
  function slotNote(name) {
    const s = C.slots().find((x) => x.name.toLowerCase() === String(name || '').toLowerCase());
    if (!s) return '';
    const [h, m] = s.cutoff.split(':').map(Number); const d = new Date(2000, 0, 1, h, m);
    return 'Order by ' + fmtClock(d) + (s.dayBefore ? ' the day before' : '') + ' · delivered by ' + fmtClock(new Date(2000, 0, 1, ...s.deliver.split(':').map(Number)));
  }
  function posterRecords() {
    const saved = S.list('config').filter((r) => r.kind === 'poster');
    const out = PRESETS.map((p) => {
      const r = saved.find((x) => x.id === p.id);
      if (r) return r;
      const all = sellable();
      const ids = p.special ? [] : p.cat ? all.filter((d) => p.cat.test(d.category || '')).map((d) => d.id) : all.filter((d) => !/breakfast|tiffin/i.test(d.category || '')).map((d) => d.id);
      return { id: p.id, kind: 'poster', name: p.name, title: p.special ? 'Special Menu' : p.name + ' Menu', note: p.special ? 'Pre-order for parties & functions' : slotNote(p.name), ids, preset: true };
    });
    saved.filter((r) => !PRESETS.some((p) => p.id === r.id)).sort((a, b) => a.createdAt - b.createdAt).forEach((r) => out.push(r));
    return out;
  }
  function currentPoster() {
    const list = posterRecords();
    if (!ui.posterSel || !list.some((p) => p.id === ui.posterSel)) {
      const nb = C.nextOpenBatch(); ui.posterSel = (list.find((p) => p.name.toLowerCase() === nb.slot.toLowerCase()) || list[1] || list[0]).id; ui.poster = null;
    }
    if (!ui.poster || ui.poster.id !== ui.posterSel) ui.poster = JSON.parse(JSON.stringify(list.find((p) => p.id === ui.posterSel)));
    return ui.poster;
  }
  async function savePoster(quiet) {
    const pp = ui.poster; if (!pp) return;
    const rec = { ...(S.get('config', pp.id) || {}), id: pp.id, kind: 'poster', name: pp.name, title: pp.title, note: pp.note, ids: pp.ids.slice() };
    await S.put('config', rec); ui.poster = JSON.parse(JSON.stringify(S.get('config', pp.id)));
    if (!quiet) toast(pp.name + ' poster saved');
  }
  function posterCanvas(pp, scale) {
    const W = 1080, H = 1350; const k = kitchen();
    const m = makeCanvas(W, H, scale || 1); if (!m) return null; const { cv, cx } = m;
    const dishes = S.list('dishes').filter((d) => (pp.ids || []).includes(d.id)).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    cx.fillStyle = '#FFFDF7'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = LEAF; cx.fillRect(0, 0, W, 300);
    cx.fillStyle = TURMERIC; cx.fillRect(0, 300, W, 14);
    cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.font = '800 76px ' + ROUND; cx.fillText(fit(cx, k.name, W - 120), W / 2, 130);
    cx.fillStyle = TURMERIC; cx.font = '800 54px ' + ROUND; cx.fillText(fit(cx, pp.title, W - 120), W / 2, 214);
    cx.fillStyle = '#CFE0D6'; cx.font = '500 32px ' + FONT; cx.fillText(fit(cx, pp.note, W - 120), W / 2, 268);
    const rows = []; let last = null;
    dishes.forEach((d) => { const c = d.category || 'Dishes'; if (c !== last) { rows.push({ cat: c }); last = c; } rows.push({ d }); });
    const top = 370, bottom = H - 190; let fs = 46;
    const heightFor = (f) => rows.reduce((s, r) => s + (r.cat ? f * 1.9 : f * 1.55), 0);
    while (fs > 22 && heightFor(fs) > bottom - top) fs -= 2;
    let y = top; const L = 110, R = W - 110;
    if (!rows.length) { cx.fillStyle = MUTED; cx.font = '500 40px ' + FONT; cx.fillText('Pick dishes to show on the poster', W / 2, 600); }
    rows.forEach((r) => {
      if (r.cat) {
        y += fs * 1.35; cx.textAlign = 'center'; cx.fillStyle = LEAF2; cx.font = '800 ' + Math.round(fs * 0.72) + 'px ' + FONT;
        cx.fillText(r.cat, W / 2, y); y += fs * 0.55; return;
      }
      y += fs * 1.55; const d = r.d; const price = '₹' + Number(d.price).toLocaleString('en-IN');
      cx.font = '800 ' + fs + 'px ' + ROUND; cx.fillStyle = LEAF; cx.textAlign = 'right'; cx.fillText(price, R, y);
      const pw = cx.measureText(price).width;
      cx.textAlign = 'left'; cx.fillStyle = INK; cx.font = '600 ' + fs + 'px ' + FONT;
      const name = fit(cx, d.name, R - L - pw - 60); cx.fillText(name, L, y);
      const nw = cx.measureText(name).width;
      cx.fillStyle = '#B9C4BE'; const dotY = y - fs * 0.18;
      for (let x = L + nw + 16; x < R - pw - 16; x += 14) { cx.beginPath(); cx.arc(x, dotY, 2.2, 0, Math.PI * 2); cx.fill(); }
    });
    cx.fillStyle = LEAF; cx.fillRect(0, H - 150, W, 150);
    cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.font = '700 40px ' + FONT;
    cx.fillText(k.phone ? 'Order on WhatsApp: ' + k.phone : 'Order on WhatsApp', W / 2, H - 82);
    cx.fillStyle = TURMERIC; cx.font = '500 28px ' + FONT; cx.fillText('Home-cooked · fresh every day', W / 2, H - 38);
    cx.textAlign = 'left';
    return cv;
  }
  views.poster = () => {
    const list = posterRecords(); const pp = currentPoster();
    const dishes = S.list('dishes').filter((d) => d.active !== false && num(d.price) > 0).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    let h = '<div class="screen-title"><h1>Menu posters</h1></div>';
    if (!dishes.length) return h + '<div class="empty"><p>Add dishes to your menu first, then come back to make a poster.</p><button class="btn small" data-act="go:menu">Go to menu</button></div>';
    h += '<div class="seg" role="group" aria-label="Choose a poster">' + list.map((p) => '<button type="button" aria-pressed="' + (p.id === pp.id) + '" data-act="posterPick:' + p.id + '">' + esc(p.name) + '</button>').join('') + '</div>';
    if (!kitchen().phone) h += '<div class="note">Add the kitchen’s WhatsApp number in ☰ → Settings so customers know where to order.</div>';
    h += '<label class="f"><span>Heading</span><input class="in" id="ptTitle" value="' + esc(pp.title) + '"></label>';
    h += '<label class="f"><span>Line under it</span><input class="in" id="ptNote" value="' + esc(pp.note) + '" placeholder="Order by 10:00 AM · delivered by 12:30 PM"></label>';
    h += '<div class="f"><span>Dishes on this poster <span class="sub" id="ptCount">(' + pp.ids.length + ')</span></span><div class="box">' + dishes.map((d) => '<label class="line" style="cursor:pointer"><input type="checkbox" data-pd="' + d.id + '"' + (pp.ids.includes(d.id) ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:#173B2C"><div class="grow"><div class="t">' + esc(d.name) + '</div><div class="m">' + esc(d.category || '') + '</div></div><span class="amt">' + inr(d.price) + '</span></label>').join('') + '</div></div>';
    h += '<div class="btns" style="margin-bottom:14px"><button class="btn small alt" data-act="posterSave">Save this list</button>' + (PRESETS.some((p) => p.id === pp.id) ? '' : '<button class="btn small danger" data-act="posterDel:' + pp.id + '">Delete poster</button>') + '</div>';
    h += '<div class="f"><span>Preview</span><img id="ptImg" alt="Menu poster preview" style="width:100%;border-radius:14px;border:1px solid #D3DBD6;display:block;background:#fff"></div>';
    h += '<div class="btns" style="margin-bottom:8px"><button class="btn warm" data-act="posterShare">Share poster</button></div>';
    h += '<div class="btns"><button class="btn small alt" data-act="posterText">Share menu as text</button></div>';
    h += '<div class="section"><h2>New poster</h2></div><div class="line newside" style="padding:0"><input class="in" id="ptNew" placeholder="e.g. Diwali special, Sunday biryani"><button class="btn small alt" data-act="posterNew">Create</button></div>';
    h += '<p class="sub" style="margin-top:12px">Lists are saved and shared with every phone. Share opens the phone’s share menu: pick WhatsApp, then a broadcast list, a group or My Status.</p>';
    setTimeout(() => {
      const upd = () => { const cv = posterCanvas(ui.poster, 0.5); const img = $('#ptImg'); if (cv && img) img.src = cv.toDataURL('image/jpeg', 0.85); const c = $('#ptCount'); if (c) c.textContent = '(' + ui.poster.ids.length + ')'; };
      const t = $('#ptTitle'), n = $('#ptNote');
      if (t) t.addEventListener('input', () => { ui.poster.title = t.value; upd(); });
      if (n) n.addEventListener('input', () => { ui.poster.note = n.value; upd(); });
      $$('#view [data-pd]').forEach((cb) => cb.addEventListener('change', () => {
        const id = cb.dataset.pd; ui.poster.ids = ui.poster.ids.filter((x) => x !== id); if (cb.checked) ui.poster.ids.push(id); upd();
      }));
      const nw = $('#ptNew'); if (nw) nw.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); acts.posterNew(); } });
      upd();
    });
    return h;
  };
  acts.posterPick = (id) => { ui.posterSel = id; ui.poster = null; render(); };
  acts.posterSave = async () => { await savePoster(false); render(); };
  acts.posterNew = async () => {
    const inp = $('#ptNew'); const name = inp ? inp.value.trim() : ''; if (!name) { if (inp) inp.focus(); toast('Type a name for the poster'); return; }
    const id = 'poster_' + C.uid();
    await S.put('config', { id, kind: 'poster', name, title: name, note: 'Pre-order now', ids: [] });
    ui.posterSel = id; ui.poster = null; toast(name + ' poster created. Tick the dishes for it.'); render();
  };
  acts.posterDel = async (id) => { const r = S.get('config', id); if (!r || !confirmAsk('Delete the “' + r.name + '” poster?')) return; await S.remove('config', id); ui.posterSel = null; ui.poster = null; toast('Poster deleted'); render(); };
  acts.posterShare = async () => {
    const cv = posterCanvas(ui.poster, 1); if (!cv) { toast('This phone can’t make pictures'); return; }
    const bytes = dataUrlBytes(cv.toDataURL('image/jpeg', 0.92));
    const r = await shareOrSave(bytes, 'image/jpeg', safeName(kitchen().name + ' ' + ui.poster.name) + '.jpg', ui.poster.title);
    if (r === 'downloaded') toast('Poster saved to your downloads');
    savePoster(true);
  };
  acts.posterText = () => {
    const pp = ui.poster; const k = kitchen(); const L = ['*' + k.name + '*', '*' + pp.title + '*', pp.note, ''];
    let last = null;
    S.list('dishes').filter((d) => pp.ids.includes(d.id)).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)).forEach((d) => {
      const c = d.category || 'Dishes'; if (c !== last) { if (last) L.push(''); L.push('_' + c + '_'); last = c; }
      L.push('• ' + d.name + ' — ₹' + d.price);
    });
    L.push('', k.phone ? 'Order on WhatsApp: ' + k.phone : 'Reply here to order!');
    window.open('https://wa.me/?text=' + encodeURIComponent(L.join('\n')), '_blank');
    savePoster(true);
  };
  window.addEventListener('hashchange', () => { if (!/^#poster/.test(location.hash)) ui.poster = null; });

  // ================= BILLS REGISTER (for audit) =================
  const billsIn = (from, to) => S.list('orders').filter((o) => o.billNo && (o.billDate || '') >= from && (o.billDate || '') <= to)
    .sort((a, b) => (a.billNo < b.billNo ? -1 : 1));
  A.billsSection = (from, to) => {
    const bills = billsIn(from, to);
    const missing = S.list('orders').filter((o) => !o.billNo && o.status === 'Delivered' && C.serveDate(o) >= from && C.serveDate(o) <= to);
    let h = '<div class="section"><h2>Bills register</h2><span class="sub">' + bills.length + ' bill' + (bills.length === 1 ? '' : 's') + '</span></div>';
    if (!bills.length && !missing.length) return h + '<p class="sub" style="margin-top:0">Bills get a number like CK-' + new Date().getFullYear() + '-0001 when an order is marked delivered or a bill is sent.</p>';
    if (bills.length) {
      const total = bills.reduce((s, o) => s + num(o.total), 0), unpaid = bills.filter((o) => !o.paid), notSent = bills.filter((o) => !o.billSentAt && o.status !== 'Cancelled');
      h += '<div class="grid2" style="margin-bottom:10px"><div class="kpi"><div class="l">Billed</div><div class="v">' + inr(total) + '</div><div class="h">' + bills[0].billNo + ' to ' + bills[bills.length - 1].billNo + '</div></div>' +
        '<div class="kpi"><div class="l">Not sent / unpaid</div><div class="v ' + (notSent.length || unpaid.length ? 'neg' : 'pos') + '">' + notSent.length + ' / ' + unpaid.length + '</div><div class="h">bills</div></div></div>';
      h += '<div class="card"><table class="t"><thead><tr><th>Bill</th><th>Customer</th><th class="n">Amount</th></tr></thead><tbody>' +
        bills.slice(-20).reverse().map((o) => '<tr data-act="order:' + o.id + '" style="cursor:pointer"><td>' + esc(o.billNo) + '<div class="sub" style="font-size:12px">' + A.fmtDate(o.billDate) + '</div></td><td>' + esc(o.customer || 'Walk-in') +
          '<div class="sub" style="font-size:12px">' + (o.status === 'Cancelled' ? 'Cancelled' : (o.paid ? 'Paid' : '<b class="neg">Due</b>') + ' · ' + (o.billSentAt ? 'sent' : '<b class="neg">not sent</b>')) + '</div></td><td class="n">' + inr(o.total) + '</td></tr>').join('') + '</tbody></table>' +
        (bills.length > 20 ? '<p class="sub" style="margin:8px 0 0">Showing the latest 20. The download has all ' + bills.length + '.</p>' : '') + '</div>';
    }
    if (missing.length) h += '<div class="note" style="margin-top:10px">' + missing.length + ' delivered order' + (missing.length === 1 ? ' has' : 's have') + ' no bill number yet. <button class="link" data-act="billsFill:' + from + '_' + to + '">Give them bill numbers</button></div>';
    h += '<div class="btns" style="margin-top:10px"><button class="btn small" data-act="billsCsv:' + from + '_' + to + '">Download bills register (Excel)</button></div>';
    return h;
  };
  acts.billsFill = async (range) => {
    const [from, to] = range.split('_');
    const list = S.list('orders').filter((o) => !o.billNo && o.status === 'Delivered' && C.serveDate(o) >= from && C.serveDate(o) <= to)
      .sort((a, b) => (C.serveDate(a) + a.createdAt < C.serveDate(b) + b.createdAt ? -1 : 1));
    if (!list.length || !confirmAsk('Give bill numbers to ' + list.length + ' delivered order' + (list.length === 1 ? '' : 's') + '? Each gets the next number, dated on its delivery day.')) return;
    for (const o of list) await S.put('orders', { ...o, billNo: C.nextBillNo(C.serveDate(o).slice(0, 4)), billDate: C.serveDate(o) });
    toast(list.length + ' bills numbered'); render();
  };
  acts.billsCsv = (range) => {
    const [from, to] = range.split('_'); const bills = billsIn(from, to);
    if (!bills.length) { toast('No bills in these dates'); return; }
    const cols = ['Bill no', 'Bill date', 'Customer', 'Phone', 'Items', 'Plates', 'Subtotal', 'Delivery', 'Discount', 'Total', 'Payment', 'Paid', 'Status', 'Bill sent', 'Sent as', 'Delivered for', 'Slot', 'Entered by'];
    const rows = bills.map((o) => [o.billNo, o.billDate, o.customer || '', o.phone || '', (o.items || []).map((l) => l.qty + ' x ' + l.name + (num(l.price) ? ' @ ' + num(l.price) : ' (free)')).join('; '),
      C.platesOf(o.items), num(o.subtotal != null ? o.subtotal : C.orderTotals(o.items, 0, 0).subtotal), num(o.delivery), num(o.discount), num(o.total), o.payMode || '', o.paid ? 'Yes' : 'No', o.status || '',
      o.billSentAt ? o.billSentAt.replace('T', ' ') : 'Not sent', o.billSentVia || '', C.serveDate(o), C.slotOf(o), o.by || '']);
    const q = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? '"\'' + s.replace(/"/g, '""') + '"' : '"' + s.replace(/"/g, '""') + '"'; };
    const csv = '﻿' + [cols.map(q).join(',')].concat(rows.map((r) => r.map(q).join(','))).join('\r\n');
    shareOrSave(new TextEncoder().encode(csv), 'text/csv', 'Bills-register-' + from + '-to-' + to + '.csv', bills.length + ' bills').then((r) => { if (r === 'downloaded') toast('Bills register downloaded. It opens in Excel.'); });
  };

  window.App4 = { jpegToPdf, billCanvas, posterCanvas, kitchen };
})();
