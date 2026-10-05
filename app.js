/* Chatruya Kitchens — screens */
(function () {
  'use strict';
  const C = window.Core, S = C.Store, num = C.num, r2 = C.round2;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => (Number(n) < 0 ? '−₹' : '₹') + Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
  const qty = (n, u) => (Math.round(num(n) * 1000) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + (u ? ' ' + u : '');
  const today = () => C.dayKey();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function niceDay(key) {
    if (!key) return '';
    const k = key.slice(0, 10);
    if (k === today()) return 'Today';
    if (k === C.addDays(today(), -1)) return 'Yesterday';
    if (k === C.addDays(today(), 1)) return 'Tomorrow';
    const [y, m, d] = k.split('-').map(Number); const dt = new Date(y, m - 1, d);
    return DAYS[dt.getDay()] + ', ' + d + ' ' + MONTHS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
  }
  function niceTime(dt) {
    if (!dt || dt.length < 16) return '';
    let h = Number(dt.slice(11, 13)); const m = dt.slice(14, 16); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + m + ' ' + ap;
  }
  const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'packet', 'dozen', 'bunch'];
  const CHANNELS = ['WhatsApp', 'Phone call', 'Walk-in', 'Bulk / party', 'Other'];
  const PAYMODES = ['Cash', 'UPI', 'Card', 'Pay later'];
  const NEXT = { New: 'Preparing', Preparing: 'Ready', Ready: 'Delivered' };
  const NEXT_LABEL = { New: 'Start cooking', Preparing: 'Mark ready', Ready: 'Mark delivered' };
  const DISH_CATS = ['Breakfast', 'Biryani', 'Curries', 'Rice', 'Breads', 'Meals', 'Chutney', 'Snacks', 'Sweets', 'Beverages'];

  const ui = { ordersTab: 'active', ordersQ: '', stockQ: '', spendMonth: today().slice(0, 7), period: 'month', from: today(), to: today() };

  // ---------- small helpers ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function chips(name, options, value, type) {
    return '<div class="chips" role="group">' + options.map((o) => {
      const v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
      const on = Array.isArray(value) ? value.includes(v) : value === v;
      return '<label><input type="' + (type || 'radio') + '" name="' + name + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span>' + esc(l) + '</span></label>';
    }).join('') + '</div>';
  }
  function field(label, inner, hint) { return '<label class="f"><span>' + label + '</span>' + inner + (hint ? '<em>' + hint + '</em>' : '') + '</label>'; }
  function group(label, inner, hint) { return '<div class="f"><span>' + label + '</span>' + inner + (hint ? '<em>' + hint + '</em>' : '') + '</div>'; }
  function val(form, name) { const el = form.elements[name]; if (!el) return ''; if (el instanceof RadioNodeList) return el.value; if (el.type === 'checkbox') return el.checked; return el.value; }
  function confirmAsk(msg) { return window.confirm(msg); }
  function phoneDigits(p) { const d = String(p || '').replace(/\D/g, ''); if (d.length === 10) return '91' + d; if (d.length === 11 && d[0] === '0') return '91' + d.slice(1); return d; }
  function itemName(id) { const i = S.data.items[id]; return i ? i.name : 'Removed item'; }
  function itemUnit(id) { const i = S.data.items[id]; return i ? i.unit : ''; }

  // ---------- bottom sheet ----------
  const sheet = { onClose: null };
  function openSheet(title, body, actions, onMount) {
    $('#sheetTitle').textContent = title;
    const oldBody = $('#sheetBody'); const fresh = oldBody.cloneNode(false); oldBody.replaceWith(fresh); // drop old listeners
    fresh.innerHTML = body;
    const foot = $('#sheetFoot'); foot.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.addEventListener('click', async () => { if (b.disabled) return; b.disabled = true; try { await a.run(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong'); } finally { b.disabled = false; } });
      foot.appendChild(b);
    });
    foot.style.display = actions && actions.length ? '' : 'none';
    $('#scrim').classList.add('on'); $('#sheet').classList.add('on');
    $('#sheetBody').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount($('#sheetBody'));
  }
  function closeSheet() {
    $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on');
    document.body.style.overflow = '';
    render();
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#scrim').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sheet').classList.contains('on')) closeSheet(); });
  const sheetOpen = () => $('#sheet').classList.contains('on');

  // ---------- sync ----------
  let syncTimer = null;
  function syncConfigured() { return !!(S.meta.syncUrl && S.meta.syncKey); }
  function scheduleSync(ms) { if (!syncConfigured()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(false), ms == null ? 2500 : ms); }
  async function runSync(manual) {
    if (!syncConfigured()) { if (manual) toast('Add the sync link in Settings first'); return; }
    if (!navigator.onLine && !manual) { badge(); return; }
    try {
      const res = await S.sync(window.fetch.bind(window));
      if (manual && res && !res.busy) toast('Synced. ' + res.pulled + ' updates checked.');
      if (!sheetOpen()) render();
    } catch (e) {
      if (manual) toast('Sync failed: ' + e.message);
    }
    badge();
  }
  function ago(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
  }
  function badge() {
    const b = $('#syncBadge'); const pending = S.dirtyRecords().length;
    let cls = '', text = 'Phone only';
    if (syncConfigured()) {
      if (S.syncing) { cls = 'busy'; text = 'Syncing'; }
      else if (S.meta.lastSyncError) { cls = 'err'; text = 'Sync problem'; }
      else if (pending) { cls = 'wait'; text = pending + ' to sync'; }
      else if (S.meta.lastSyncAt) { cls = 'ok'; text = 'Synced ' + ago(S.meta.lastSyncAt); }
      else { cls = 'wait'; text = 'Not synced yet'; }
      if (!navigator.onLine) { cls = 'wait'; text = 'Offline' + (pending ? ' · ' + pending + ' waiting' : ''); }
    }
    b.className = 'sync ' + cls; b.querySelector('span').textContent = text;
  }
  $('#syncBadge').addEventListener('click', () => { if (syncConfigured()) runSync(true); else location.hash = '#settings'; });
  window.addEventListener('online', () => { badge(); scheduleSync(500); });
  window.addEventListener('offline', badge);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });
  setInterval(() => { badge(); if (document.visibilityState === 'visible') runSync(false); }, 60000);

  // ---------- router ----------
  const views = {};
  function route() { const h = (location.hash || '#today').slice(1).split('/'); return { name: h[0] || 'today', arg: h[1] }; }
  function render() {
    const { name, arg } = route();
    const fn = views[name] || views.today;
    const active = document.activeElement; const keepId = active && active.id && $('#view').contains(active) ? active.id : null;
    const caret = keepId && active.selectionStart;
    $('#view').innerHTML = fn(arg);
    const tab = { menu: 'more', reports: 'more', settings: 'more', customers: 'more' }[name] || name;
    $$('nav.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    $('#brand').textContent = S.meta.kitchenName || 'Chatruya Kitchens';
    bind($('#view'));
    if (keepId && $('#' + keepId)) { const el = $('#' + keepId); el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } }
    badge();
  }
  window.addEventListener('hashchange', () => { if (sheetOpen()) { $('#scrim').classList.remove('on'); $('#sheet').classList.remove('on'); document.body.style.overflow = ''; } render(); window.scrollTo(0, 0); });

  // data-act="name:arg" buttons inside screens
  const acts = {};
  function bind(root) {
    $$('[data-act]', root).forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const [a, arg] = el.dataset.act.split(':'); if (acts[a]) acts[a](arg, el);
      });
    });
    $$('[data-input]', root).forEach((el) => {
      el.addEventListener('input', () => { ui[el.dataset.input] = el.value; render(); });
    });
  }
  const fab = (label, act) => '<button class="fab" type="button" data-act="' + act + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' + label + '</button>';

  // ---------- orders: shared bits ----------
  function dayNo(o) {
    const k = C.serveDate(o);
    const same = S.list('orders').filter((x) => C.serveDate(x) === k).sort((a, b) => a.createdAt - b.createdAt);
    return same.findIndex((x) => x.id === o.id) + 1;
  }
  // ---------- time helpers for slots ----------
  function fmtClock(d) { let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m + ' ' + ap; }
  function fmtWhen(d) { const k = C.dayKey(d); return (k === today() ? '' : niceDay(k) + ' ') + fmtClock(d); }
  function untilText(ms) { const m = Math.max(1, Math.round(ms / 60000)); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); }
  function batchLabel(date, slot) { return slot + ' · ' + niceDay(date); }
  function batchHash(date, slot) { return '#prep/' + date + '_' + encodeURIComponent(slot); }
  function slotLine(o) { const d = C.serveDate(o); return C.slotOf(o) + (d === today() ? '' : ' · ' + niceDay(d)); }
  function itemsText(o) { return (o.items || []).map((l) => l.qty + '× ' + l.name).join(', '); }
  function ticket(o, withStep) {
    const next = NEXT[o.status];
    return '<div class="ticket st-' + esc(o.status) + '" role="button" tabindex="0" data-act="order:' + o.id + '">' +
      '<div class="bar"></div><div class="body">' +
      '<div class="l1"><span>#' + dayNo(o) + ' · ' + esc(slotLine(o)) + ' · ' + esc(o.channel || '') + '</span><span class="chip ' + esc(o.status) + '">' + esc(o.status) + '</span></div>' +
      '<div class="l2"><span class="who">' + esc(o.customer || 'Walk-in customer') + '</span><span class="amt">' + inr(o.total) + '</span></div>' +
      '<div class="l2"><span class="what">' + esc(itemsText(o)) + '</span>' + (!o.paid && o.status !== 'Cancelled' ? '<span class="chip due">Due</span>' : '') + '</div>' +
      '</div>' + (withStep && next ? '<div class="act"><button class="btn-step" type="button" data-act="step:' + o.id + '">' + NEXT_LABEL[o.status] + '</button></div>' : '') + '</div>';
  }
  acts.step = async (id) => {
    const o = S.get('orders', id); if (!o || !NEXT[o.status]) return;
    const status = NEXT[o.status];
    await S.put('orders', { ...o, status });
    toast('#' + dayNo(o) + ' is ' + status.toLowerCase());
  };
  acts.order = (id) => orderDetail(id);
  acts.newOrder = () => orderForm();

  // ---------- TODAY ----------
  views.today = () => {
    const d = today(); const st = C.stats(d, d); const m = C.stats(C.monthStart(d), d);
    const active = kitchenQueue();
    const low = C.lowStock();
    const [y, mo, dd] = d.split('-').map(Number); const dt = new Date(y, mo - 1, dd);
    let h = '';
    if (!S.list('dishes').length && !S.list('orders').length) {
      h += '<div class="card" style="margin-bottom:14px"><h2 style="font-size:19px;margin-bottom:6px">Set up your kitchen</h2>' +
        '<p class="sub" style="margin:0 0 12px">Add your stock items (rice, chicken, oil…), then your dishes with their recipes. The app then works out what each plate costs you.</p>' +
        '<div class="btns"><button class="btn small" data-act="go:stock">Add stock items</button><button class="btn small alt" data-act="go:menu">Add dishes</button></div>' +
        '<p class="sub" style="margin:12px 0 0">Just looking around? <button class="link" data-act="demo">Load sample data</button></p></div>';
    }
    h += alertBanners();
    h += '<div class="bill"><div class="date">' + DAYS[dt.getDay()] + ', ' + dd + ' ' + MONTHS[mo - 1] + '</div>' +
      '<div class="row"><span>Sales<small>' + st.count + ' order' + (st.count === 1 ? '' : 's') + '</small></span><b>' + inr(st.sales) + '</b></div>' +
      '<div class="row"><span>Food cost<small>' + st.foodPct + '% of sales</small></span><b class="neg">− ' + inr(st.foodCost) + '</b></div>' +
      '<div class="rule"></div>' +
      '<div class="row"><span class="total-l">Gross profit</span><span class="total">' + inr(st.gross) + '</span></div>' +
      '<div class="foot"><span>Spent today ' + inr(st.spent) + '</span><span>' + (st.unpaid ? inr(st.unpaid) + ' still to collect' : 'All collected') + '</span></div></div>';

    h += cookingPlan();
    h += '<div class="section"><h2>Kitchen queue</h2><button class="link" data-act="go:orders">All orders</button></div>';
    h += active.length ? '<div class="list">' + active.map((o) => ticket(o, true)).join('') + '</div>'
      : '<div class="empty"><p>No orders waiting. New orders show up here until they are delivered.</p><button class="btn small warm" data-act="newOrder">Take an order</button></div>';

    if (low.length) {
      h += '<div class="section"><h2>Running low</h2><button class="link" data-act="go:stock">Stock</button></div><div class="list">' +
        low.map((i) => '<button class="rowc" data-act="item:' + i.id + '"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="m">Alert at ' + qty(i.min, i.unit) + '</div></div><span class="chip low">' + (C.stockOf(i.id) <= 0 ? 'Out of stock' : qty(C.stockOf(i.id), i.unit) + ' left') + '</span></button>').join('') + '</div>';
    }
    h += '<div class="section"><h2>' + MONTHS[mo - 1] + ' so far</h2><button class="link" data-act="go:reports">Reports</button></div>' +
      '<div class="grid2"><div class="kpi"><div class="l">Sales</div><div class="v">' + inr(m.sales) + '</div><div class="h">' + m.count + ' orders</div></div>' +
      '<div class="kpi"><div class="l">Spent</div><div class="v">' + inr(m.spent) + '</div><div class="h">all expenses</div></div>' +
      '<div class="kpi"><div class="l">Cash profit</div><div class="v ' + (m.net < 0 ? 'neg' : 'pos') + '">' + inr(m.net) + '</div><div class="h">sales − spent</div></div>' +
      '<div class="kpi"><div class="l">Avg order</div><div class="v">' + inr(m.avg) + '</div><div class="h">food cost ' + m.foodPct + '%</div></div></div>';
    return h + fab('New order', 'newOrder');
  };
  acts.go = (where) => { location.hash = '#' + where; };
  acts.prep = (key) => { location.hash = '#prep/' + key; };

  // orders cooking now, or due today or earlier and not started
  function kitchenQueue() {
    return S.list('orders').filter((o) => o.status === 'Preparing' || o.status === 'Ready' || (o.status === 'New' && C.serveDate(o) <= today()))
      .sort((a, b) => C.batchCmp({ date: C.serveDate(a), slot: C.slotOf(a) }, { date: C.serveDate(b), slot: C.slotOf(b) }) || a.createdAt - b.createdAt);
  }

  // what needs attention right now: cut-off coming up, or orders closed and cooking to start
  function currentAlerts(now) {
    now = now || new Date(); const out = [];
    const days = [today(), C.addDays(today(), 1)];
    days.forEach((d) => C.slots().forEach((s) => {
      const cut = C.cutoffAt(d, s.name), del = C.deliverAt(d, s.name);
      const p = C.prepList(d, s.name); const key = d + '_' + encodeURIComponent(s.name);
      const toCut = cut - now;
      if (toCut > 0 && toCut <= 60 * 60000 && C.dayKey(cut) === today()) out.push({ kind: 'soon', date: d, slot: s.name, key, p, cut, del, ms: toCut });
      else if (toCut <= 0 && now < del && p.toStart > 0) out.push({ kind: 'closed', date: d, slot: s.name, key, p, cut, del });
    }));
    return out;
  }
  function alertBanners() {
    return currentAlerts().map((a) => {
      const label = batchLabel(a.date, a.slot);
      if (a.kind === 'soon') return '<button class="alert soon" data-act="prep:' + a.key + '"><b>' + esc(a.slot) + ' orders close in ' + untilText(a.ms) + '</b><span>' + esc(label) + ' · ' + a.p.orders.length + ' order' + (a.p.orders.length === 1 ? '' : 's') + ', ' + a.p.plates + ' plates so far. Last call on WhatsApp?</span></button>';
      return '<button class="alert closed" data-act="prep:' + a.key + '"><b>Time to cook: ' + a.p.plates + ' plates for ' + esc(label) + '</b><span>Orders closed at ' + fmtClock(a.cut) + '. Deliver by ' + fmtClock(a.del) + '.' +
        (a.p.shortages.length ? ' Short on ' + a.p.shortages.slice(0, 3).map((x) => esc(x.name)).join(', ') + '.' : '') + ' Open the prep list.</span></button>';
    }).join('');
  }
  function cookingPlan() {
    const now = new Date(); const t = today();
    const list = C.slots().map((s) => ({ date: t, slot: s.name }));
    C.batchesWithOrders(C.addDays(t, 1), C.addDays(t, 6)).forEach((b) => list.push(b));
    C.batchesWithOrders(C.addDays(t, -3), C.addDays(t, -1)).filter((b) => C.prepList(b.date, b.slot).toStart > 0).forEach((b) => list.unshift(b));
    const rows = list.map((b) => {
      const p = C.prepList(b.date, b.slot); const open = p.cutoff > now; const done = p.deliver < now && !p.toStart;
      const meta = (open ? 'Orders open till ' + fmtWhen(p.cutoff) : 'Orders closed') + ' · deliver ' + fmtClock(p.deliver);
      const right = p.plates ? '<span class="amt">' + p.plates + ' plates</span>' + (p.toStart ? '<span class="chip New">' + p.toStart + ' to start</span>' : '<span class="chip Delivered">' + (done ? 'Done' : 'Cooking') + '</span>') : '<span class="sub">No orders</span>';
      return '<button class="rowc batch' + (p.shortages.length && p.toStart ? ' short' : '') + '" data-act="prep:' + b.date + '_' + encodeURIComponent(b.slot) + '"><div class="grow"><div class="t">' + esc(batchLabel(b.date, b.slot)) + '</div><div class="m">' + esc(meta) + (p.shortages.length && p.toStart ? ' · <b class="neg">short on stock</b>' : '') + '</div></div><div class="stack">' + right + '</div></button>';
    });
    return '<div class="section"><h2>Cooking plan</h2><button class="link" data-act="go:prep">Prep list</button></div><div class="list">' + rows.join('') + '</div>';
  }

  // ---------- ORDERS ----------
  views.orders = () => {
    const t = ui.ordersTab; const q = ui.ordersQ.trim().toLowerCase();
    let list = S.list('orders');
    if (t === 'active') list = kitchenQueue();
    if (t === 'today') list = list.filter((o) => C.serveDate(o) === today());
    if (t === 'upcoming') list = list.filter((o) => C.serveDate(o) > today() && o.status !== 'Cancelled');
    if (t === 'due') list = list.filter((o) => !o.paid && o.status !== 'Cancelled');
    if (q) list = list.filter((o) => ((o.customer || '') + ' ' + (o.phone || '') + ' ' + itemsText(o)).toLowerCase().includes(q));
    const bc = (a, b) => C.batchCmp({ date: C.serveDate(a), slot: C.slotOf(a) }, { date: C.serveDate(b), slot: C.slotOf(b) }) || a.createdAt - b.createdAt;
    list.sort((a, b) => (t === 'active' || t === 'today' || t === 'upcoming' ? bc(a, b) : -bc(a, b)));
    const dueTotal = S.list('orders').filter((o) => !o.paid && o.status !== 'Cancelled').reduce((s, o) => s + num(o.total), 0);
    let h = '<div class="screen-title"><h1>Orders</h1></div>' +
      '<div class="seg">' + [['active', 'In kitchen'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['due', 'Unpaid'], ['all', 'All']].map(([k, l]) => '<button type="button" aria-pressed="' + (t === k) + '" data-act="otab:' + k + '">' + l + '</button>').join('') + '</div>';
    if (t === 'all' || t === 'due') h += '<input class="search" id="oq" type="search" placeholder="Search name, phone or dish" value="' + esc(ui.ordersQ) + '" data-input="ordersQ">';
    if (t === 'due' && dueTotal) h += '<p class="sub" style="margin:0 0 10px">' + inr(dueTotal) + ' to collect in total</p>';
    if (!list.length) {
      const msg = { active: 'Nothing cooking right now.', today: 'No orders for today yet.', upcoming: 'No orders booked for the coming days.', due: 'Every order is paid. Nice.', all: q ? 'No orders match that search.' : 'Your orders will be listed here.' }[t];
      return h + '<div class="empty"><p>' + msg + '</p><button class="btn small warm" data-act="newOrder">Take an order</button></div>' + fab('New order', 'newOrder');
    }
    if (t === 'active') return h + '<div class="list">' + list.map((o) => ticket(o, true)).join('') + '</div>' + fab('New order', 'newOrder');
    if (t === 'today' || t === 'upcoming') {
      let lastB = ''; h += '<div class="list">';
      list.forEach((o) => {
        const d = C.serveDate(o), sl = C.slotOf(o), k = d + '_' + encodeURIComponent(sl);
        if (k !== lastB) { const p = C.prepList(d, sl); h += '<div class="day-h"><span>' + esc(batchLabel(d, sl)) + '</span><button class="link" data-act="prep:' + k + '">' + p.plates + ' plates · prep list</button></div>'; lastB = k; }
        h += ticket(o, t === 'today');
      });
      return h + '</div>' + fab('New order', 'newOrder');
    }
    let last = ''; h += '<div class="list">';
    list.slice(0, 300).forEach((o) => {
      const k = C.serveDate(o);
      if (k !== last) {
        const dayTotal = list.filter((x) => C.serveDate(x) === k && x.status !== 'Cancelled').reduce((s, x) => s + num(x.total), 0);
        h += '<div class="day-h"><span>' + niceDay(k) + '</span><span>' + inr(dayTotal) + '</span></div>'; last = k;
      }
      h += ticket(o, false);
    });
    return h + '</div>' + fab('New order', 'newOrder');
  };
  acts.otab = (k) => { ui.ordersTab = k; render(); };

  function orderForm(id, pre) {
    pre = pre || {};
    const o = id ? S.get('orders', id) : null;
    const dishes = S.list('dishes').filter((d) => d.active !== false || (o && (o.items || []).some((l) => l.dishId === d.id)));
    const mains = dishes.filter((d) => !C.isSideDish(d)), sides = dishes.filter((d) => C.isSideDish(d));
    if (!mains.length) {
      openSheet('New order', '<div class="empty"><p>Add the dishes you sell first. Each dish has a price and a recipe, so every order knows its cost.</p><button class="btn small" data-act="go:menu">Go to menu</button></div>', []);
      bind($('#sheetBody')); return;
    }
    const lines = {}; // dishId -> {qty, price, name, side}
    (o ? o.items : []).forEach((l) => { lines[l.dishId] = { qty: num(l.qty), price: num(l.price), name: l.name, side: C.isSideLine(l) }; });
    const lineOf = (d) => lines[d.id] || (lines[d.id] = { qty: 0, price: num(d.price), name: d.name, side: C.isSideDish(d) });
    const cats = {}; mains.sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => { const c = d.category || 'Dishes'; (cats[c] = cats[c] || []).push(d); });
    const cust = C.customers();
    const nb = C.nextOpenBatch();
    const dDate = o ? C.serveDate(o) : nb.date, dSlot = o ? C.slotOf(o) : nb.slot;
    const slotNames = C.slots().map((x) => x.name); if (!slotNames.includes(dSlot)) slotNames.push(dSlot);
    function lineHtml(d) {
      const l = lines[d.id]; const q = l ? l.qty : 0; const price = l ? l.price : num(d.price); const side = C.isSideDish(d);
      return '<div class="line' + (q ? ' picked' : '') + '" data-dish="' + d.id + '" data-name="' + esc(d.name.toLowerCase()) + '"><div class="grow"><div class="t" data-add="' + d.id + '">' + esc(d.name) + '</div>' +
        '<div class="m">₹<input class="pin" data-price="' + d.id + '" inputmode="decimal" value="' + esc(price) + '" aria-label="Price for ' + esc(d.name) + '"> ' + (side ? (price ? 'each' : '(free)') : 'per plate') + '</div></div>' +
        '<div class="stepper"><button type="button" data-minus="' + d.id + '" aria-label="One less ' + esc(d.name) + '">−</button>' +
        '<input class="qty" data-qty="' + d.id + '" type="number" inputmode="numeric" min="0" value="' + q + '" aria-label="How many ' + esc(d.name) + '">' +
        '<button type="button" class="plus" data-add="' + d.id + '" aria-label="One more ' + esc(d.name) + '">+</button></div></div>';
    }
    let body = '<form id="of" autocomplete="off">';
    body += '<div class="f"><span>Deliver on</span><div class="row2" style="grid-template-columns:1fr auto auto;align-items:center"><input class="in" type="date" name="deliveryDate" value="' + esc(dDate) + '">' +
      '<button type="button" class="btn small alt" data-day="0">Today</button><button type="button" class="btn small alt" data-day="1">Tomorrow</button></div></div>';
    body += group('Slot', chips('slot', slotNames, dSlot), '<span id="cutHint"></span>');
    body += (mains.length > 10 ? '<input class="search" type="search" id="dishQ" placeholder="Find a dish">' : '');
    body += '<p class="sub" style="margin:0 0 6px">Tap + or type the number of plates. Tap a price to change it for this order, for example a bulk rate.</p>';
    body += '<div class="box" id="dishBox">' + Object.keys(cats).sort().map((c) => '<div class="cat-h">' + esc(c) + '</div>' + cats[c].map(lineHtml).join('')).join('') + '</div>';
    body += '<div class="cat-h" style="margin:0 2px 6px">Chutney</div><div class="box" id="sideBox">' + sides.sort((a, b) => a.name.localeCompare(b.name)).map(lineHtml).join('') +
      '<div class="line newside"><input class="in" id="newSide" placeholder="' + (sides.length ? 'Another chutney…' : 'e.g. Tomato roti pachadi') + '" aria-label="New chutney name"><button type="button" class="btn small alt" id="addSide">Add</button></div></div>';
    body += '<div class="box" id="sums"></div>';
    body += field('Customer name', '<input class="in" name="customer" list="custNames" value="' + esc(o ? o.customer : pre.customer || '') + '">') +
      '<datalist id="custNames">' + cust.filter((c) => c.name).map((c) => '<option value="' + esc(c.name) + '"></option>').join('') + '</datalist>';
    body += field('Phone', '<input class="in" name="phone" type="tel" list="custPhones" value="' + esc(o ? o.phone : pre.phone || '') + '" placeholder="98765 43210">', 'Optional. A past customer’s number fills in their name and address.') +
      '<datalist id="custPhones">' + cust.filter((c) => c.phone).map((c) => '<option value="' + esc(c.phone) + '">' + esc(c.name) + '</option>').join('') + '</datalist>';
    body += '<details class="more"' + (o ? ' open' : '') + '><summary><span>More details</span><span class="sub" id="moreSum"></span></summary><div class="inner">';
    body += field('Address or pickup note', '<textarea class="in" name="address" rows="2">' + esc(o ? o.address : pre.address || '') + '</textarea>');
    body += '<div class="row2">' + field('Delivery charge', '<input class="in" name="delivery" inputmode="decimal" value="' + esc(o ? o.delivery || '' : '') + '" placeholder="0">') +
      field('Discount', '<input class="in" name="discount" inputmode="decimal" value="' + esc(o ? o.discount || '' : '') + '" placeholder="0">') + '</div>';
    body += group('Order came by', chips('channel', CHANNELS, o ? o.channel : 'WhatsApp'));
    body += group('Payment', chips('payMode', PAYMODES, o ? o.payMode : 'UPI'));
    body += '<label class="check"><input type="checkbox" name="paid"' + (o && o.paid ? ' checked' : '') + '> Payment received</label>';
    if (o) body += group('Status', chips('status', C.ORDER_STATUSES.concat(['Cancelled']), o.status));
    body += field('Order taken at', '<input class="in" type="datetime-local" name="date" value="' + esc(o ? o.date : C.nowLocal()) + '">');
    body += field('Notes', '<textarea class="in" name="notes" rows="2" placeholder="Less spicy, extra raita…">' + esc(o ? o.notes : '') + '</textarea>');
    body += '</div></details></form>';

    const form = () => $('#of');
    function drawCut() {
      const f = form(); const d = val(f, 'deliveryDate') || today(), sl = val(f, 'slot'); if (!sl) return;
      const cut = C.cutoffAt(d, sl), del = C.deliverAt(d, sl), now = new Date();
      const el = $('#cutHint'); if (!el) return;
      if (del < now && d < today()) { el.innerHTML = '<b class="neg">This date has passed.</b>'; return; }
      el.innerHTML = cut > now ? 'Orders for ' + esc(sl) + ' ' + esc(niceDay(d).toLowerCase() === 'today' ? 'today' : 'on ' + niceDay(d)) + ' close ' + fmtWhen(cut) + ' (in ' + untilText(cut - now) + '). Deliver by ' + fmtClock(del) + '.'
        : '<b class="neg">Cut-off passed at ' + fmtWhen(cut) + '.</b> You can still save it as a late order.';
    }
    const picked = () => Object.keys(lines).filter((k) => lines[k].qty > 0).map((k) => ({ dishId: k, ...lines[k] }));
    function draw() {
      drawCut();
      const f = form(); const ls = picked();
      const t = C.orderTotals(ls, val(f, 'discount'), val(f, 'delivery'));
      const snap = C.orderSnapshot(ls); const plates = C.platesOf(ls);
      $('#sums').innerHTML = ls.length
        ? ls.map((l) => '<div class="sum"><span>' + l.qty + ' × ' + esc(l.name) + (num(l.price) ? ' @ ' + inr(l.price) : '') + '</span><span>' + (num(l.price) ? inr(l.qty * l.price) : 'free') + '</span></div>').join('') +
          (num(val(f, 'delivery')) ? '<div class="sum"><span>Delivery</span><span>' + inr(val(f, 'delivery')) + '</span></div>' : '') +
          (num(val(f, 'discount')) ? '<div class="sum"><span>Discount</span><span>− ' + inr(val(f, 'discount')) + '</span></div>' : '') +
          '<div class="sum total"><span>Total · ' + plates + ' plate' + (plates === 1 ? '' : 's') + '</span><span>' + inr(t.total) + '</span></div>' +
          '<div class="sum sub"><span>Food cost ' + inr(snap.cost) + '</span><span>Profit ' + inr(t.total - snap.cost) + '</span></div>'
        : '<p class="sub" style="margin:10px 0">Tap + next to a dish, or type how many plates.</p>';
      $$('#sheetBody .line[data-dish]').forEach((row) => {
        const l = lines[row.dataset.dish]; const q = l ? l.qty : 0;
        const qi = row.querySelector('.qty'); if (qi && qi !== document.activeElement && Number(qi.value) !== q) qi.value = q;
        row.classList.toggle('picked', q > 0);
      });
      const ms = $('#moreSum'); if (ms) ms.textContent = [val(f, 'channel'), val(f, 'payMode'), val(f, 'paid') ? 'paid' : 'not paid'].filter(Boolean).join(' · ');
    }
    async function save() {
      const f = form();
      const items = picked().map((l) => ({ dishId: l.dishId, name: l.name, qty: l.qty, price: num(l.price), side: !!l.side }));
      if (!items.some((l) => !l.side)) { toast('Add at least one dish'); return; }
      const discount = num(val(f, 'discount')), delivery = num(val(f, 'delivery'));
      const t = C.orderTotals(items, discount, delivery);
      const same = o && JSON.stringify((o.items || []).map((l) => [l.dishId, num(l.qty)])) === JSON.stringify(items.map((l) => [l.dishId, l.qty]));
      const snap = same ? { cost: o.cost, consumption: o.consumption } : C.orderSnapshot(items);
      const rec = {
        ...(o || {}), items, discount, delivery, subtotal: t.subtotal, total: t.total, cost: snap.cost, consumption: snap.consumption,
        phone: val(f, 'phone').trim(), customer: val(f, 'customer').trim(), address: val(f, 'address').trim(),
        channel: val(f, 'channel'), payMode: val(f, 'payMode'), paid: val(f, 'paid'),
        status: o ? val(f, 'status') : 'New', date: val(f, 'date') || C.nowLocal(), notes: val(f, 'notes').trim(),
        deliveryDate: val(f, 'deliveryDate') || today(), slot: val(f, 'slot') || C.slots()[0].name
      };
      if (!o && C.cutoffAt(rec.deliveryDate, rec.slot) < new Date()) rec.late = true;
      const saved = await S.put('orders', rec);
      toast((o ? 'Order updated' : 'Order saved') + ' · ' + C.platesOf(items) + ' plates');
      orderDetail(saved.id);
    }
    async function addSide() {
      const inp = $('#newSide'); const name = inp.value.trim(); if (!name) { inp.focus(); return; }
      let d = S.list('dishes').find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!d) d = await S.put('dishes', { name, category: 'Chutney', price: 0, extraCost: 0, recipe: [], active: true });
      const l = lineOf(d); l.side = true; if (!l.qty) l.qty = Math.max(1, C.platesOf(picked()));
      if (!$('#sheetBody .line[data-dish="' + d.id + '"]')) $('#sheetBody .newside').insertAdjacentHTML('beforebegin', lineHtml(d));
      inp.value = ''; draw(); toast(name + ' added');
    }
    openSheet(o ? 'Edit order #' + dayNo(o) : 'New order', body, [{ label: o ? 'Save changes' : 'Save order', cls: 'warm', run: save }], (root) => {
      root.addEventListener('click', (e) => {
        if (e.target.closest('#addSide')) { addSide(); return; }
        const add = e.target.closest('[data-add]'), minus = e.target.closest('[data-minus]');
        if (add) { const d = S.data.dishes[add.dataset.add]; if (d) { lineOf(d).qty++; draw(); } }
        if (minus) { const l = lines[minus.dataset.minus]; if (l && l.qty > 0) l.qty--; draw(); }
        const day = e.target.closest('[data-day]'); if (day) { form().elements.deliveryDate.value = C.addDays(today(), Number(day.dataset.day)); drawCut(); }
      });
      root.addEventListener('keydown', (e) => { if (e.target.id === 'newSide' && e.key === 'Enter') { e.preventDefault(); addSide(); } });
      root.addEventListener('focusin', (e) => { const c = e.target.classList; if (c && (c.contains('qty') || c.contains('pin'))) setTimeout(() => { try { e.target.select(); } catch (x) { /* ignore */ } }, 0); });
      root.addEventListener('input', (e) => {
        if (e.target.id === 'dishQ') { const q = e.target.value.toLowerCase(); $$('#dishBox .line').forEach((r) => { r.style.display = r.dataset.name.includes(q) ? '' : 'none'; }); return; }
        if (e.target.id === 'newSide') return;
        const ds = e.target.dataset || {};
        if (ds.qty) { const d = S.data.dishes[ds.qty]; if (d) lineOf(d).qty = Math.max(0, Math.floor(num(e.target.value))); }
        if (ds.price) { const d = S.data.dishes[ds.price]; if (d) lineOf(d).price = Math.max(0, num(e.target.value)); }
        if (e.target.name === 'phone') {
          const dg = e.target.value.replace(/\D/g, '').slice(-10); const c = dg.length === 10 && cust.find((x) => x.phone.replace(/\D/g, '').slice(-10) === dg);
          const f = form(); if (c) { if (!f.elements.customer.value) f.elements.customer.value = c.name; if (!f.elements.address.value) f.elements.address.value = c.address; }
        }
        draw();
      });
      root.addEventListener('change', (e) => { drawCut(); if (e.target.name === 'payMode' && e.target.value === 'Pay later') form().elements.paid.checked = false; draw(); });
      draw();
    });
  }

  function billText(o) {
    const L = ['*' + (S.meta.kitchenName || 'Chatruya Kitchens') + '*', 'Order #' + dayNo(o) + ' · ' + C.slotOf(o) + ', ' + niceDay(C.serveDate(o)) + ' (by ' + fmtClock(C.deliverAt(C.serveDate(o), C.slotOf(o))) + ')', ''];
    (o.items || []).forEach((l) => L.push(l.qty + ' x ' + l.name + ' — ' + (num(l.price) ? inr(l.qty * l.price) : 'free')));
    if (C.platesOf(o.items) >= 2) L.push('(' + C.platesOf(o.items) + ' plates)');
    if (num(o.delivery)) L.push('Delivery — ' + inr(o.delivery));
    if (num(o.discount)) L.push('Discount — −' + inr(o.discount));
    L.push('', '*Total: ' + inr(o.total) + '*', 'Payment: ' + (o.payMode || '') + (o.paid ? ' (paid, thank you)' : ' (due)'), '', 'Thank you for ordering with us!');
    return L.join('\n');
  }

  function orderDetail(id) {
    const o = S.get('orders', id); if (!o) { closeSheet(); return; }
    const next = NEXT[o.status];
    let b = '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div style="font-weight:800;font-size:18px">' + esc(o.customer || 'Walk-in customer') + '</div>' +
      '<div class="sub">Deliver ' + esc(C.slotOf(o)) + ', ' + niceDay(C.serveDate(o)) + ' by ' + fmtClock(C.deliverAt(C.serveDate(o), C.slotOf(o))) + '</div>' +
      '<div class="sub">Ordered ' + niceDay(o.date) + ', ' + niceTime(o.date) + ' · ' + esc(o.channel || '') + (o.late ? ' · <b class="neg">after cut-off</b>' : '') + '</div></div><span class="chip ' + esc(o.status) + '">' + esc(o.status) + '</span></div>' +
      (o.phone ? '<div style="margin-top:8px"><a href="tel:' + esc(o.phone.replace(/\s/g, '')) + '" style="color:var(--leaf-2);font-weight:700">Call ' + esc(o.phone) + '</a></div>' : '') +
      (o.address ? '<div class="sub" style="margin-top:4px">' + esc(o.address) + '</div>' : '') +
      (o.notes ? '<div class="note" style="margin:10px 0 0">' + esc(o.notes) + '</div>' : '') + '</div>';
    b += '<div class="box">' + (o.items || []).map((l) => '<div class="sum"><span>' + l.qty + ' × ' + esc(l.name) + '</span><span>' + (num(l.price) ? inr(l.qty * l.price) : 'free') + '</span></div>').join('') +
      (num(o.delivery) ? '<div class="sum"><span>Delivery</span><span>' + inr(o.delivery) + '</span></div>' : '') +
      (num(o.discount) ? '<div class="sum"><span>Discount</span><span>− ' + inr(o.discount) + '</span></div>' : '') +
      '<div class="sum total"><span>Total · ' + C.platesOf(o.items) + ' plates</span><span>' + inr(o.total) + '</span></div>' +
      '<div class="sum sub"><span>Food cost ' + inr(o.cost) + '</span><span>Profit ' + inr(num(o.total) - num(o.cost)) + '</span></div></div>';
    b += '<div class="check" style="justify-content:space-between"><span>' + esc(o.payMode || '') + ' · ' + (o.paid ? '<b class="pos">Paid</b>' : '<b class="neg">Not paid yet</b>') + '</span>' +
      '<button class="btn small ' + (o.paid ? 'alt' : '') + '" data-act="togglePaid:' + o.id + '">' + (o.paid ? 'Mark unpaid' : 'Mark paid') + '</button></div>';
    b += '<div class="btns" style="margin-bottom:8px"><button class="btn warm" data-act="billPdf:' + o.id + '">Share bill as PDF</button></div>';
    b += '<div class="btns" style="margin-bottom:10px">' + (o.phone ? '<a class="btn alt" target="_blank" rel="noopener" href="https://wa.me/' + phoneDigits(o.phone) + '?text=' + encodeURIComponent(billText(o)) + '">Send bill as text on WhatsApp</a>' : '<button class="btn alt" data-act="shareBill:' + o.id + '">Share bill</button>') + '</div>';
    b += '<div class="btns"><button class="btn small alt" data-act="editOrder:' + o.id + '">Edit</button>' +
      (o.status !== 'Cancelled' && o.status !== 'Delivered' ? '<button class="btn small danger" data-act="cancelOrder:' + o.id + '">Cancel order</button>' : '') +
      '<button class="btn small danger" data-act="deleteOrder:' + o.id + '">Delete</button></div>';
    b += '<p class="sub" style="margin-top:14px">Taken by ' + esc(o.by || '') + '</p>';
    const actions = next ? [{ label: NEXT_LABEL[o.status], cls: 'warm', run: async () => { await S.put('orders', { ...o, status: next }); toast('Order is ' + next.toLowerCase()); orderDetail(o.id); } }] : [];
    openSheet('Order #' + dayNo(o), b, actions);
    bind($('#sheetBody'));
  }
  acts.togglePaid = async (id) => { const o = S.get('orders', id); await S.put('orders', { ...o, paid: !o.paid, payMode: !o.paid && o.payMode === 'Pay later' ? 'Cash' : o.payMode }); orderDetail(id); };
  acts.editOrder = (id) => orderForm(id);
  acts.cancelOrder = async (id) => { if (!confirmAsk('Cancel this order? Its stock is put back and it leaves your sales.')) return; const o = S.get('orders', id); await S.put('orders', { ...o, status: 'Cancelled' }); toast('Order cancelled'); orderDetail(id); };
  acts.deleteOrder = async (id) => { if (!confirmAsk('Delete this order for good?')) return; await S.remove('orders', id); toast('Order deleted'); closeSheet(); };
  acts.shareBill = async (id) => {
    const text = billText(S.get('orders', id));
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) { /* closed */ } }
    else { try { await navigator.clipboard.writeText(text); toast('Bill copied'); } catch (e) { toast('Could not copy the bill'); } }
  };

  // expose for part 2
  window.App = { C, S, num, r2, $, $$, esc, inr, qty, today, niceDay, niceTime, MONTHS, DAYS, UNITS, PAYMODES, DISH_CATS, ui, toast, chips, field, group, val, confirmAsk, phoneDigits, itemName, itemUnit, openSheet, closeSheet, sheetOpen, views, acts, bind, render, fab, runSync, scheduleSync, badge, syncConfigured, orderDetail, ticket, dayNo, NEXT, NEXT_LABEL, fmtClock, fmtWhen, untilText, batchLabel, batchHash, currentAlerts, kitchenQueue, orderForm, billText };
})();
