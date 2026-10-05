/* Chatruya Kitchens — prep lists, cut-off alerts, delivery slots */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, num, $, $$, esc, inr, qty, today, niceDay, ui, toast, openSheet, sheetOpen, views, acts, render, ticket, fmtClock, fmtWhen, untilText, batchLabel, currentAlerts, confirmAsk } = A;

  // ================= PREP LIST =================
  function defaultBatch() {
    const now = new Date(), t = today();
    const c = C.batchesWithOrders(C.addDays(t, -2), C.addDays(t, 7))
      .filter((b) => { const p = C.prepList(b.date, b.slot); return p.toStart > 0 || p.deliver > now; });
    return c[0] || C.nextOpenBatch(now);
  }
  const keyOf = (b) => b.date + '_' + encodeURIComponent(b.slot);

  views.prep = (arg) => {
    const b = (arg && C.parseBatch(arg)) || defaultBatch();
    const now = new Date(), t = today();
    // batch picker: today's slots, anything booked in the next week, older batches still waiting
    const picks = C.slots().map((s) => ({ date: t, slot: s.name }))
      .concat(C.batchesWithOrders(C.addDays(t, 1), C.addDays(t, 7)))
      .concat(C.batchesWithOrders(C.addDays(t, -3), C.addDays(t, -1)).filter((x) => C.prepList(x.date, x.slot).toStart > 0));
    if (!picks.some((x) => x.date === b.date && x.slot === b.slot)) picks.push(b);
    picks.sort(C.batchCmp);
    const p = C.prepList(b.date, b.slot);
    const open = p.cutoff > now;
    let h = '<div class="screen-title"><h1>Prep list</h1></div>';
    h += '<div class="seg" role="group" aria-label="Choose a batch">' + picks.map((x) => {
      const n = C.prepList(x.date, x.slot).plates;
      return '<button type="button" aria-pressed="' + (x.date === b.date && x.slot === b.slot) + '" data-act="prep:' + keyOf(x) + '">' + esc(x.slot) + ' · ' + esc(niceDay(x.date)) + (n ? ' (' + n + ')' : '') + '</button>';
    }).join('') + '</div>';

    h += '<div class="card" style="margin-bottom:12px"><h2 style="font-size:21px">' + esc(batchLabel(b.date, b.slot)) + '</h2>' +
      '<div class="sub" style="margin-top:2px">' + (open ? 'Orders open till ' + fmtWhen(p.cutoff) + ' (' + untilText(p.cutoff - now) + ' left)' : 'Orders closed at ' + fmtWhen(p.cutoff)) + ' · deliver by ' + fmtClock(p.deliver) + '</div>' +
      (p.orders.length ? '<div class="grid2" style="margin-top:12px"><div class="kpi"><div class="l">Plates</div><div class="v">' + p.plates + '</div><div class="h">' + p.orders.length + ' order' + (p.orders.length === 1 ? '' : 's') + '</div></div>' +
        '<div class="kpi"><div class="l">Not started</div><div class="v ' + (p.toStart ? '' : 'pos') + '">' + p.toStart + '</div><div class="h">' + (p.toStart ? 'orders still New' : 'all in progress') + '</div></div></div>' : '') + '</div>';

    if (!p.orders.length) {
      return h + '<div class="empty"><p>No orders for ' + esc(b.slot.toLowerCase()) + ' ' + esc(niceDay(b.date).toLowerCase()) + ' yet.' + (open ? ' Orders close ' + fmtWhen(p.cutoff) + '.' : '') + '</p><button class="btn small warm" data-act="newOrder">Take an order</button></div>';
    }

    h += '<div class="section"><h2>What to cook</h2></div><div class="box">' + p.dishes.map((d) =>
      '<div class="plates"><span class="n">' + d.qty + '</span><div class="grow"><div class="t">' + esc(d.name) + '</div><div class="m">' + (d.toStart ? d.toStart + ' not started' : 'all started') + '</div></div></div>').join('') + '</div>';
    if (p.sides.length) h += '<div class="section"><h2>Chutney</h2></div><div class="box">' + p.sides.map((d) =>
      '<div class="plates"><span class="n">' + d.qty + '</span><div class="grow"><div class="t">' + esc(d.name) + '</div><div class="m">portions</div></div></div>').join('') + '</div>';

    if (p.notes.length) h += '<div class="section"><h2>Special requests</h2></div>' + p.notes.map((n) => '<div class="note" role="button" tabindex="0" data-act="order:' + n.id + '"><b>' + esc(n.customer) + ':</b> ' + esc(n.notes) + '</div>').join('');

    if (p.ingredients.length) {
      h += '<div class="section"><h2>Ingredients needed</h2><span class="sub">for orders not started</span></div><div class="box">' +
        '<div class="need" style="font-size:12.5px;color:var(--muted);font-weight:700"><span>Item</span><span>Need</span><span class="s" style="color:inherit">In stock</span></div>' +
        p.ingredients.map((i) => '<div class="need' + (i.short ? ' short' : '') + '"><span>' + esc(i.name) + '</span><span class="q">' + qty(i.need, i.unit) + '</span><span class="s">' + (i.short ? 'buy ' + qty(i.short, i.unit) : qty(i.stock, i.unit)) + '</span></div>').join('') + '</div>';
      if (p.shortages.length) h += '<div class="note">Not enough stock for ' + p.shortages.map((x) => esc(x.name)).join(', ') + '. Buy before you start, then record it in Stock → Record purchase.</div>';
    } else if (p.toStart) {
      h += '<div class="note">Add recipes to your dishes (☰ → Menu) to see the ingredients each batch needs.</div>';
    }

    h += '<div class="btns" style="margin:16px 0 4px">' + (p.toStart ? '<button class="btn warm" data-act="cookAll:' + keyOf(b) + '">Start cooking all ' + p.toStart + '</button>' : '') + '</div>';
    h += '<div class="btns" style="margin-bottom:6px"><a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(prepText(p)) + '">Share prep list</a>' +
      '<a class="btn small alt" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(deliveryText(p)) + '">Share delivery list</a></div>';

    h += '<div class="section"><h2>Orders</h2><span class="sub">' + inr(p.orders.reduce((s, o) => s + num(o.total), 0)) + '</span></div><div class="list">' + p.orders.map((o) => ticket(o, true)).join('') + '</div>';
    return h;
  };

  function prepText(p) {
    const L = ['*Prep list: ' + p.slot + ', ' + niceDay(p.date) + '*', 'Deliver by ' + fmtClock(p.deliver) + ' · ' + p.orders.length + ' orders · ' + p.plates + ' plates', ''];
    p.dishes.forEach((d) => L.push(d.qty + ' x ' + d.name));
    if (p.sides.length) { L.push('', '*Chutney*'); p.sides.forEach((d) => L.push(d.qty + ' x ' + d.name)); }
    if (p.notes.length) { L.push('', '*Special requests*'); p.notes.forEach((n) => L.push('• ' + n.customer + ': ' + n.notes)); }
    if (p.shortages.length) { L.push('', '*Buy before cooking*'); p.shortages.forEach((i) => L.push('• ' + i.name + ': ' + qty(i.short, i.unit))); }
    return L.join('\n');
  }
  function deliveryText(p) {
    const L = ['*Deliveries: ' + p.slot + ', ' + niceDay(p.date) + '* (by ' + fmtClock(p.deliver) + ')', ''];
    p.orders.forEach((o, i) => {
      L.push((i + 1) + '. ' + (o.customer || 'Walk-in') + (o.phone ? ' — ' + o.phone : ''));
      if (o.address) L.push('   ' + o.address);
      L.push('   ' + (o.items || []).map((l) => l.qty + ' x ' + l.name).join(', ') + ' · ' + (o.paid ? 'paid' : 'collect ' + inr(o.total)));
    });
    return L.join('\n');
  }
  acts.cookAll = async (key) => {
    const b = C.parseBatch(key); const list = C.batchOrders(b.date, b.slot).filter((o) => o.status === 'New');
    if (!list.length) return;
    if (!confirmAsk('Mark ' + list.length + ' order' + (list.length === 1 ? '' : 's') + ' as Preparing? Their ingredients come out of stock now.')) return;
    for (const o of list) await S.put('orders', { ...o, status: 'Preparing' });
    toast(list.length + ' orders are cooking');
  };

  // ================= PHONE ALERTS =================
  const canNotify = () => 'Notification' in window;
  async function notify(title, body, url, tag) {
    if (!canNotify() || Notification.permission !== 'granted') return false;
    const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url }, renotify: true };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return true; }
    } catch (e) { /* fall through */ }
    try { new Notification(title, opts); return true; } catch (e) { return false; }
  }
  async function checkAlerts() {
    if (!S.meta.alertsOn || !canNotify() || Notification.permission !== 'granted') return;
    const lead = num(S.meta.alertLead || 30) * 60000;
    const sent = { ...(S.meta.alertsSent || {}) }; let changed = false;
    for (const a of currentAlerts()) {
      const id = a.key + '_' + a.kind; if (sent[id]) continue;
      if (a.kind === 'soon' && a.ms > lead) continue;
      const url = 'index.html#prep/' + a.key; const label = batchLabel(a.date, a.slot);
      const ok = a.kind === 'soon'
        ? await notify(a.slot + ' orders close in ' + untilText(a.ms), label + ': ' + a.p.orders.length + ' orders, ' + a.p.plates + ' plates so far. Time for a last call on WhatsApp.', url, id)
        : await notify('Orders closed: cook ' + a.p.plates + ' plates', label + ', deliver by ' + fmtClock(a.del) + '. ' + a.p.dishes.slice(0, 4).map((d) => d.qty + ' ' + d.name).join(', ') + (a.p.shortages.length ? '. Short on ' + a.p.shortages.map((x) => x.name).join(', ') : ''), url, id);
      if (ok) { sent[id] = Date.now(); changed = true; }
    }
    Object.keys(sent).forEach((k) => { if (Date.now() - sent[k] > 3 * 86400000) { delete sent[k]; changed = true; } });
    if (changed) await S.setMeta('alertsSent', sent);
  }
  setInterval(() => {
    checkAlerts();
    const r = (location.hash || '#today').slice(1).split('/')[0];
    if (!sheetOpen() && (r === '' || r === 'today' || r === 'prep') && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) render();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAlerts(); });
  setTimeout(checkAlerts, 3000);
  window.addEventListener('hashchange', () => { if (!/^#slots/.test(location.hash)) ui.slotDraft = null; });

  // ================= SLOTS & ALERT SETTINGS =================
  views.slots = () => {
    if (!ui.slotDraft) ui.slotDraft = JSON.parse(JSON.stringify(C.slots()));
    const d = ui.slotDraft;
    let h = '<div class="screen-title"><h1>Slots & alerts</h1></div>' +
      '<p class="sub" style="margin-top:-6px">Each slot is one cooking batch. Orders for a slot close at its cut-off time; the prep list and alert are built from those orders. These settings are shared with every connected phone.</p>';
    h += d.map((s, i) => '<div class="slot-edit">' +
      '<label class="f"><span>Slot name</span><input class="in" data-si="' + i + '" data-k="name" value="' + esc(s.name) + '" placeholder="Lunch"></label>' +
      '<div class="row3"><label class="f"><span>Orders close at</span><input class="in" type="time" data-si="' + i + '" data-k="cutoff" value="' + esc(s.cutoff) + '"></label>' +
      '<label class="f"><span>Deliver by</span><input class="in" type="time" data-si="' + i + '" data-k="deliver" value="' + esc(s.deliver) + '"></label></div>' +
      '<label class="check" style="margin-bottom:8px"><input type="checkbox" data-si="' + i + '" data-k="dayBefore"' + (s.dayBefore ? ' checked' : '') + '> Cut-off is the day before (e.g. order by 9 PM for tomorrow’s lunch)</label>' +
      (d.length > 1 ? '<button class="btn small danger" data-act="slotDel:' + i + '">Remove this slot</button>' : '') + '</div>').join('');
    h += '<div class="btns" style="margin-bottom:8px">' + (d.length < 4 ? '<button class="btn small alt" data-act="slotAdd">Add a slot</button>' : '') + '<button class="btn" data-act="slotSave">Save slots</button></div>';

    const perm = canNotify() ? Notification.permission : 'unsupported';
    const on = S.meta.alertsOn && perm === 'granted';
    h += '<div class="section"><h2>Phone alerts</h2></div>';
    h += '<div class="note">' + (perm === 'unsupported' ? 'This browser can’t show notifications. On iPhone, add the app to the Home Screen first (iOS 16.4 or newer), then open it from there.'
      : perm === 'denied' ? 'Notifications are blocked for this app. Allow them in the phone’s settings for this site, then come back here.'
        : on ? 'On. This phone alerts you before each cut-off and when orders close, while the app is open or was used recently.'
          : 'Off. Turn on to get a reminder before each cut-off and a “time to cook” alert when orders close.') + '</div>';
    if (perm !== 'unsupported' && perm !== 'denied') {
      h += '<label class="f"><span>Remind me before cut-off</span><select class="in" id="alertLead">' + [15, 30, 45, 60].map((m) => '<option value="' + m + '"' + (num(S.meta.alertLead || 30) === m ? ' selected' : '') + '>' + m + ' minutes</option>').join('') + '</select></label>';
      h += '<div class="btns">' + (on ? '<button class="btn small alt" data-act="alertsOff">Turn off alerts</button><button class="btn small alt" data-act="alertTest">Send a test alert</button>' : '<button class="btn warm" data-act="alertsOn">Turn on phone alerts</button>') + '</div>';
    }
    h += '<p class="sub" style="margin-top:14px">Phones can only alert while the app is running in the background. If the phone has closed the app, the alert appears the next time you open it, along with the banner on the Today screen.</p>';
    setTimeout(() => {
      $$('#view [data-si]').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const s = ui.slotDraft[Number(el.dataset.si)]; s[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      }));
      const lead = $('#alertLead'); if (lead) lead.addEventListener('change', () => S.setMeta('alertLead', Number(lead.value)));
    });
    return h;
  };
  acts.slotAdd = () => { ui.slotDraft.push({ name: 'Breakfast', cutoff: '07:00', dayBefore: false, deliver: '09:00' }); render(); };
  acts.slotDel = (i) => { ui.slotDraft.splice(Number(i), 1); render(); };
  acts.slotSave = async () => {
    const d = ui.slotDraft.map((s) => ({ name: String(s.name || '').trim(), cutoff: s.cutoff || '10:00', dayBefore: !!s.dayBefore, deliver: s.deliver || '12:30' }));
    if (d.some((s) => !s.name)) { toast('Give every slot a name'); return; }
    if (new Set(d.map((s) => s.name.toLowerCase())).size !== d.length) { toast('Two slots have the same name'); return; }
    const bad = d.find((s) => !s.dayBefore && s.cutoff > s.deliver);
    if (bad) { toast(bad.name + ': cut-off is after delivery. Tick “day before” or change the times.'); return; }
    d.sort((a, b) => (a.deliver < b.deliver ? -1 : 1));
    const prev = S.data.config.slots;
    await S.put('config', { ...(prev || {}), id: 'slots', slots: d });
    ui.slotDraft = null; toast('Slots saved'); render();
  };
  acts.alertsOn = async () => {
    const res = await Notification.requestPermission();
    if (res !== 'granted') { toast('Notifications were not allowed'); render(); return; }
    await S.setMeta('alertsOn', true); toast('Alerts are on'); render(); checkAlerts();
  };
  acts.alertsOff = async () => { await S.setMeta('alertsOn', false); toast('Alerts are off'); render(); };
  acts.alertTest = async () => {
    const b = C.nextOpenBatch(); const p = C.prepList(b.date, b.slot);
    const ok = await notify('Test from ' + (S.meta.kitchenName || 'Chatruya Kitchens'), 'Next batch: ' + batchLabel(b.date, b.slot) + ', orders close ' + fmtWhen(p.cutoff) + '. ' + p.plates + ' plates so far.', 'index.html#prep/' + keyOf(b), 'test');
    toast(ok ? 'Test alert sent' : 'Could not show a notification on this phone');
  };
})();
