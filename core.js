/* Chatruya Kitchens — data, costing and sync core.
   Works in the browser (window.Core) and in Node (module.exports) for testing. */
(function (G) {
  'use strict';

  const TABLES = ['orders', 'expenses', 'items', 'stock', 'dishes', 'config'];
  const ORDER_STATUSES = ['New', 'Preparing', 'Ready', 'Delivered'];
  const EXPENSE_CATEGORIES = [
    'Groceries', 'Vegetables', 'Meat & fish', 'Dairy', 'Gas', 'Packaging',
    'Rent', 'Salaries', 'Electricity & water', 'Delivery', 'Marketing', 'Repairs', 'Other'
  ];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  // ---------- dates (local time, string based) ----------
  const pad = (n) => String(n).padStart(2, '0');
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowLocal() { const d = new Date(); return dayKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); }
  function monthStart(key) { return key.slice(0, 8) + '01'; }
  function monthEnd(key) { const [y, m] = key.split('-').map(Number); return dayKey(new Date(y, m, 0)); }

  // ---------- storage adapters ----------
  function memoryAdapter() {
    let recs = {}, meta = {};
    return {
      kind: 'memory',
      async loadAll() { return { records: Object.values(recs).map((r) => JSON.parse(JSON.stringify(r))), meta: { ...meta } }; },
      async putRecords(list) { list.forEach((r) => { recs[r.id] = JSON.parse(JSON.stringify(r)); }); },
      async putMeta(k, v) { meta[k] = v; },
      async clear() { recs = {}; meta = {}; }
    };
  }

  function idbAdapter() {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        const req = indexedDB.open('chatruya-kitchens', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return dbp;
    }
    function tx(store, mode, fn) {
      return open().then((db) => new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const out = fn(t.objectStore(store));
        t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
        t.onerror = () => rej(t.error);
      }));
    }
    return {
      kind: 'indexeddb',
      async loadAll() {
        const records = await tx('records', 'readonly', (s) => s.getAll());
        const metaRows = await tx('meta', 'readonly', (s) => s.getAll());
        const meta = {}; metaRows.forEach((r) => { meta[r.k] = r.v; });
        return { records, meta };
      },
      putRecords(list) { return tx('records', 'readwrite', (s) => { list.forEach((r) => s.put(r)); }); },
      putMeta(k, v) { return tx('meta', 'readwrite', (s) => { s.put({ k, v }); }); },
      clear() { return Promise.all([tx('records', 'readwrite', (s) => s.clear()), tx('meta', 'readwrite', (s) => s.clear())]); }
    };
  }

  // ---------- store ----------
  const Store = {
    adapter: null,
    data: {},
    meta: {},
    listeners: [],
    syncing: false,

    async init(adapter) {
      this.adapter = adapter;
      this.data = {}; TABLES.forEach((t) => { this.data[t] = {}; });
      const { records, meta } = await adapter.loadAll();
      records.forEach((r) => { if (this.data[r.t]) this.data[r.t][r.id] = r; });
      this.meta = meta || {};
      if (!this.meta.device) { this.meta.device = 'phone-' + uid().slice(-4); await adapter.putMeta('device', this.meta.device); }
    },

    on(fn) { this.listeners.push(fn); },
    emit(kind) { this.listeners.forEach((fn) => { try { fn(kind); } catch (e) { console.error(e); } }); },

    get(t, id) { const r = this.data[t] && this.data[t][id]; return r && !r.deleted ? r : null; },
    list(t) { return Object.values(this.data[t] || {}).filter((r) => !r.deleted); },
    raw(t) { return Object.values(this.data[t] || {}); },

    async put(t, rec) {
      const prev = this.data[t][rec.id];
      const now = Date.now();
      const r = { ...rec, t };
      r.id = r.id || uid();
      r.createdAt = r.createdAt || (prev && prev.createdAt) || now;
      r.updatedAt = Math.max(now, prev ? (prev.updatedAt || 0) + 1 : 0);
      r.by = r.by || this.meta.userName || this.meta.device;
      r._d = 1;
      this.data[t][r.id] = r;
      await this.adapter.putRecords([r]);
      this.emit('change');
      return r;
    },

    async remove(t, id) {
      const prev = this.data[t][id];
      if (!prev) return;
      await this.put(t, { ...prev, deleted: true });
    },

    async setMeta(k, v) { this.meta[k] = v; await this.adapter.putMeta(k, v); },

    dirtyRecords() { return TABLES.flatMap((t) => Object.values(this.data[t]).filter((r) => r._d)); },

    // remote record from the server: last write (by updatedAt) wins
    applyRemote(rec) {
      if (!rec || !rec.id || !this.data[rec.t]) return null;
      const local = this.data[rec.t][rec.id];
      if (local && local._d && (local.updatedAt || 0) > (rec.updatedAt || 0)) return null;
      const r = { ...rec }; delete r._d; delete r._view;
      this.data[rec.t][rec.id] = r;
      return r;
    },

    async sync(fetchFn) {
      const url = (this.meta.syncUrl || '').trim();
      const key = (this.meta.syncKey || '').trim();
      if (!url || !key) return { skipped: true };
      if (this.syncing) return { busy: true };
      this.syncing = true; this.emit('sync');
      try {
        const changes = this.dirtyRecords().map((r) => { const c = { ...r }; delete c._d; c._view = viewOf(c.t, c); return c; });
        const body = { action: 'sync', key, since: this.meta.lastServerTs || 0, device: this.meta.device, changes };
        let res;
        try {
          res = await fetchFn(url, {
            method: 'POST', redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body)
          });
        } catch (netErr) {
          throw new Error('Could not reach the Google Sheet. Open the sync link in a new tab: it should show {"ok":true…}. If you see a Google sign-in or error page instead, redeploy the script with "Who has access: Anyone".');
        }
        let out;
        try { out = await res.json(); } catch (e) { throw new Error('The sync link did not return data. Check that the web app is deployed with access "Anyone".'); }
        if (!out.ok) throw new Error(out.error || 'Sync failed');
        const toSave = [];
        changes.forEach((c) => {
          const local = this.data[c.t][c.id];
          if (local && local._d && local.updatedAt === c.updatedAt) { delete local._d; toSave.push(local); }
        });
        (out.records || []).forEach((r) => { const a = this.applyRemote(r); if (a) toSave.push(a); });
        if (toSave.length) await this.adapter.putRecords(toSave);
        await this.setMeta('lastServerTs', out.serverTs || 0);
        await this.setMeta('lastSyncAt', Date.now());
        await this.setMeta('lastSyncError', '');
        return { pushed: changes.length, pulled: (out.records || []).length };
      } catch (e) {
        await this.setMeta('lastSyncError', e.message || String(e));
        throw e;
      } finally {
        this.syncing = false; this.emit('sync');
      }
    },

    async importRecords(list, markDirty) {
      const out = [];
      list.forEach((r) => {
        if (!r || !r.id || !this.data[r.t]) return;
        const local = this.data[r.t][r.id];
        if (local && (local.updatedAt || 0) >= (r.updatedAt || 0)) return;
        const c = { ...r }; delete c._view;
        if (markDirty) c._d = 1; else delete c._d;
        this.data[r.t][r.id] = c; out.push(c);
      });
      if (out.length) await this.adapter.putRecords(out);
      this.emit('change');
      return out.length;
    },

    async eraseAll() {
      await this.adapter.clear();
      const device = this.meta.device;
      this.meta = {}; TABLES.forEach((t) => { this.data[t] = {}; });
      await this.setMeta('device', device);
      this.emit('change');
    }
  };

  // ---------- costing ----------
  function unitCost(itemId) {
    const item = Store.get('items', itemId);
    const moves = Store.list('stock')
      .filter((m) => m.itemId === itemId && (m.type === 'purchase' || m.type === 'opening') && num(m.qty) > 0 && num(m.cost) > 0)
      .sort((a, b) => (a.date + a.createdAt) < (b.date + b.createdAt) ? 1 : -1);
    if (moves.length) return num(moves[0].cost) / num(moves[0].qty);
    return item ? num(item.cost) : 0;
  }

  function stockOf(itemId) {
    let q = 0;
    Store.list('stock').forEach((m) => { if (m.itemId === itemId) q += num(m.qty); });
    const rec = recordedBatches();
    Store.list('orders').forEach((o) => {
      if (!isCooked(o) || rec.has(batchKey(serveDate(o), slotOf(o)))) return;
      (o.consumption || []).forEach((c) => { if (c.itemId === itemId) q -= num(c.qty); });
    });
    return round2(q * 1000) === 0 ? 0 : Math.round(q * 1000) / 1000;
  }

  // ---------- stock actually used for a cooking batch ----------
  // Once a batch has its usage recorded, those numbers replace the recipe estimate for its orders.
  function prepMoves(key) { return Store.list('stock').filter((m) => m.type === 'prep' && m.batch === key); }
  function recordedBatches() { const s = new Set(); Store.list('stock').forEach((m) => { if (m.type === 'prep' && m.batch) s.add(m.batch); }); return s; }
  function usedOf(itemId, from, to) {
    const rec = recordedBatches(); let q = 0;
    Store.list('orders').forEach((o) => {
      if (!isCooked(o) || rec.has(batchKey(serveDate(o), slotOf(o)))) return;
      const d = serveDate(o); if (d < from || d > to) return;
      (o.consumption || []).forEach((c) => { if (c.itemId === itemId) q += num(c.qty); });
    });
    Store.list('stock').forEach((m) => { if (m.itemId === itemId && m.type === 'prep' && m.date >= from && m.date <= to) q -= num(m.qty); });
    return Math.round(q * 1000) / 1000;
  }

  // ---------- delivery slots, cut-offs and prep lists ----------
  // An order's ingredients leave stock once cooking starts (or once its delivery day has passed).
  function isCooked(o) {
    if (!o || o.status === 'Cancelled') return false;
    if (o.status && o.status !== 'New') return true;
    return serveDate(o) < dayKey();
  }
  const DEFAULT_SLOTS = [
    { name: 'Lunch', cutoff: '10:00', dayBefore: false, deliver: '12:30' },
    { name: 'Dinner', cutoff: '16:00', dayBefore: false, deliver: '19:30' }
  ];
  function slots() {
    const c = Store.get('config', 'slots');
    return c && Array.isArray(c.slots) && c.slots.length ? c.slots : DEFAULT_SLOTS;
  }
  function serveDate(o) { return (o && (o.deliveryDate || (o.date || '').slice(0, 10))) || ''; }
  function slotOf(o) {
    const s = slots();
    if (o && o.slot && s.some((x) => x.name === o.slot)) return o.slot;
    if (o && o.slot) return o.slot;
    const hm = ((o && o.date) || '').slice(11, 16) || '00:00';
    const later = s.filter((x) => hm <= (x.deliver || '23:59'));
    return (later[0] || s[s.length - 1]).name;
  }
  function slotIndex(name) { const i = slots().findIndex((x) => x.name === name); return i < 0 ? 99 : i; }
  function atTime(key, hm) { const [y, m, d] = key.split('-').map(Number); const [h, mi] = String(hm || '00:00').split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0); }
  function slotDef(name) { return slots().find((x) => x.name === name) || { name, cutoff: '23:59', dayBefore: false, deliver: '23:59' }; }
  function cutoffAt(date, slot) { const s = slotDef(slot); return atTime(s.dayBefore ? addDays(date, -1) : date, s.cutoff); }
  function deliverAt(date, slot) { return atTime(date, slotDef(slot).deliver); }
  function batchKey(date, slot) { return date + '_' + slot; }
  function parseBatch(key) { const i = String(key || '').indexOf('_'); return i < 0 ? null : { date: key.slice(0, i), slot: decodeURIComponent(key.slice(i + 1)) }; }
  function batchCmp(a, b) { return a.date === b.date ? slotIndex(a.slot) - slotIndex(b.slot) : (a.date < b.date ? -1 : 1); }
  // first batch that still accepts orders
  function nextOpenBatch(now) {
    now = now || new Date(); const t = dayKey(now);
    for (let i = 0; i < 14; i++) {
      const d = addDays(t, i);
      for (const s of slots()) if (cutoffAt(d, s.name) > now) return { date: d, slot: s.name };
    }
    return { date: t, slot: slots()[0].name };
  }
  function batchOrders(date, slot) {
    return Store.list('orders').filter((o) => o.status !== 'Cancelled' && serveDate(o) === date && slotOf(o) === slot)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  // all batches (date+slot) that have orders, between from and to (inclusive)
  function batchesWithOrders(from, to) {
    const map = {};
    Store.list('orders').forEach((o) => {
      if (o.status === 'Cancelled') return; const d = serveDate(o); if (d < from || d > to) return;
      const k = batchKey(d, slotOf(o)); map[k] = map[k] || { date: d, slot: slotOf(o), key: k };
    });
    return Object.values(map).sort(batchCmp);
  }
  // chutneys / pachadis are side items: counted separately, not as plates
  const SIDE_RE = /chutney|pachadi/i;
  function isSideDish(d) { return !!d && SIDE_RE.test(d.category || ''); }
  function isSideLine(l) { if (l && l.side != null) return !!l.side; return isSideDish(l && Store.data.dishes[l.dishId]); }
  function platesOf(items) { return (items || []).reduce((x, l) => x + (isSideLine(l) ? 0 : num(l.qty)), 0); }

  function prepList(date, slot) {
    const orders = batchOrders(date, slot);
    const dishes = {}; const need = {};
    orders.forEach((o) => {
      (o.items || []).forEach((l) => {
        const k = l.dishId || l.name;
        const d = dishes[k] || (dishes[k] = { dishId: l.dishId, name: l.name, qty: 0, toStart: 0, side: isSideLine(l) });
        d.qty += num(l.qty); if (o.status === 'New') d.toStart += num(l.qty);
      });
      if (o.status === 'New') (o.consumption || []).forEach((c) => { need[c.itemId] = (need[c.itemId] || 0) + num(c.qty); });
    });
    // stock already promised to earlier batches that haven't started cooking
    const me = { date, slot }; const reserved = {}; const rec = recordedBatches();
    const key = batchKey(date, slot); const used = prepMoves(key); const recorded = used.length > 0;
    const recordedAt = used.reduce((m, x) => Math.max(m, x.updatedAt || 0), 0);
    if (recorded) Object.keys(need).forEach((k) => { delete need[k]; });
    const plan = {};
    orders.forEach((o) => (o.consumption || []).forEach((c) => { plan[c.itemId] = (plan[c.itemId] || 0) + num(c.qty); }));
    Store.list('orders').forEach((o) => {
      if (o.status !== 'New' || isCooked(o)) return;
      if (rec.has(batchKey(serveDate(o), slotOf(o)))) return;
      if (batchCmp({ date: serveDate(o), slot: slotOf(o) }, me) >= 0) return;
      (o.consumption || []).forEach((c) => { reserved[c.itemId] = (reserved[c.itemId] || 0) + num(c.qty); });
    });
    const ingredients = Object.keys(need).map((itemId) => {
      const it = Store.data.items[itemId] || {};
      const stock = Math.round((stockOf(itemId) - (reserved[itemId] || 0)) * 1000) / 1000;
      const n = Math.round(need[itemId] * 1000) / 1000;
      return { itemId, name: it.name || 'Removed item', unit: it.unit || '', need: n, stock, short: Math.max(0, Math.round((n - stock) * 1000) / 1000) };
    }).sort((a, b) => (b.short > 0) - (a.short > 0) || a.name.localeCompare(b.name));
    const plates = orders.reduce((s, o) => s + platesOf(o.items), 0);
    const all = Object.values(dishes).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    return {
      date, slot, orders, plates,
      toStart: orders.filter((o) => o.status === 'New').length,
      dishes: all.filter((d) => !d.side), sides: all.filter((d) => d.side),
      ingredients, shortages: ingredients.filter((i) => i.short > 0),
      notes: orders.filter((o) => (o.notes || '').trim()).map((o) => ({ id: o.id, customer: o.customer || 'Walk-in', notes: o.notes.trim() })),
      cutoff: cutoffAt(date, slot), deliver: deliverAt(date, slot),
      key, recorded, recordedAt,
      ordersAfterRecord: recorded ? orders.filter((o) => (o.createdAt || 0) > recordedAt).length : 0,
      planned: Object.keys(plan).map((itemId) => ({ itemId, qty: Math.round(plan[itemId] * 1000) / 1000 })),
      used: used.map((m) => ({ id: m.id, itemId: m.itemId, qty: -num(m.qty), value: num(m.cost) })),
      usedValue: round2(used.reduce((s, m) => s + num(m.cost), 0))
    };
  }

  function lowStock() {
    return Store.list('items').filter((i) => num(i.min) > 0 && stockOf(i.id) <= num(i.min))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function dishCost(dish) {
    if (!dish) return 0;
    let c = num(dish.extraCost);
    (dish.recipe || []).forEach((l) => { c += num(l.qty) * unitCost(l.itemId); });
    return round2(c);
  }

  // Snapshot of cost and stock usage for an order's lines, using today's recipes and prices.
  function orderSnapshot(lines) {
    let cost = 0; const use = {};
    (lines || []).forEach((l) => {
      const dish = Store.get('dishes', l.dishId);
      const q = num(l.qty);
      if (!dish) return;
      cost += dishCost(dish) * q;
      (dish.recipe || []).forEach((r) => { use[r.itemId] = (use[r.itemId] || 0) + num(r.qty) * q; });
    });
    return { cost: round2(cost), consumption: Object.keys(use).map((itemId) => ({ itemId, qty: Math.round(use[itemId] * 1000) / 1000 })) };
  }

  function orderTotals(lines, discount, delivery) {
    const subtotal = round2((lines || []).reduce((s, l) => s + num(l.qty) * num(l.price), 0));
    const total = round2(Math.max(0, subtotal - num(discount) + num(delivery)));
    return { subtotal, total };
  }

  // ---------- reporting ----------
  function stats(from, to) {
    const inRange = (d) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
    const orders = Store.list('orders').filter((o) => inRange(serveDate(o)) && o.status !== 'Cancelled');
    const expenses = Store.list('expenses').filter((e) => inRange(e.date));
    const sales = round2(orders.reduce((s, o) => s + num(o.total), 0));
    const foodCost = round2(orders.reduce((s, o) => s + num(o.cost), 0));
    const spent = round2(expenses.reduce((s, e) => s + num(e.amount), 0));
    const unpaid = round2(orders.filter((o) => !o.paid).reduce((s, o) => s + num(o.total), 0));
    const byCat = {}; expenses.forEach((e) => { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + num(e.amount); });
    const byDay = {};
    for (let d = from; d <= to; d = addDays(d, 1)) { byDay[d] = { sales: 0, spent: 0, orders: 0 }; if (Object.keys(byDay).length > 400) break; }
    orders.forEach((o) => { const k = serveDate(o); if (byDay[k]) { byDay[k].sales += num(o.total); byDay[k].orders++; } });
    expenses.forEach((e) => { const k = e.date.slice(0, 10); if (byDay[k]) byDay[k].spent += num(e.amount); });
    const dishes = {};
    orders.forEach((o) => (o.items || []).forEach((l) => {
      const k = l.dishId || l.name;
      dishes[k] = dishes[k] || { name: l.name, qty: 0, sales: 0 };
      dishes[k].qty += num(l.qty); dishes[k].sales += num(l.qty) * num(l.price);
    }));
    return {
      from, to, orders, expenses, count: orders.length, sales, foodCost, spent, unpaid,
      gross: round2(sales - foodCost), net: round2(sales - spent),
      avg: orders.length ? round2(sales / orders.length) : 0,
      foodPct: sales ? Math.round((foodCost / sales) * 100) : 0,
      byCat, byDay, topDishes: Object.values(dishes).sort((a, b) => b.qty - a.qty)
    };
  }

  function phoneKey(p) { return String(p || '').replace(/\D/g, '').slice(-10); }
  function contacts() { return Store.list('config').filter((r) => r.kind === 'contact'); }
  // everyone from orders, plus people saved in the phone book (saved details win)
  function customers() {
    const map = {};
    const blank = () => ({ name: '', phone: '', address: '', notes: '', contactId: '', orders: 0, spent: 0, last: '', key: '' });
    Store.list('orders').forEach((o) => {
      if (o.status === 'Cancelled') return;
      const k = phoneKey(o.phone) || (o.customer || '').trim().toLowerCase();
      if (!k) return;
      const c = map[k] || (map[k] = blank());
      c.key = k; c.orders++; c.spent += num(o.total);
      if (!c.last || o.date > c.last) { c.last = o.date; c.name = o.customer || c.name; c.phone = o.phone || c.phone; c.address = o.address || c.address; }
    });
    contacts().forEach((r) => {
      const k = phoneKey(r.phone) || (r.name || '').trim().toLowerCase(); if (!k) return;
      const c = map[k] || (map[k] = blank());
      c.key = k; c.contactId = r.id; c.name = r.name || c.name; c.phone = r.phone || c.phone; c.address = r.address || c.address; c.notes = r.notes || '';
    });
    return Object.values(map).sort((a, b) => (b.last || '').localeCompare(a.last || '') || (a.name || '').localeCompare(b.name || ''));
  }

  // ---------- bill numbers: CK-2026-0001, never reused (deleted orders keep theirs) ----------
  function nextBillNo(year) {
    year = String(year || new Date().getFullYear()); let max = 0;
    Store.raw('orders').forEach((o) => { const m = /^CK-(\d{4})-(\d+)$/.exec(o.billNo || ''); if (m && m[1] === year) max = Math.max(max, Number(m[2])); });
    const last = /^CK-(\d{4})-(\d+)$/.exec(Store.meta.lastBillNo || ''); if (last && last[1] === year) max = Math.max(max, Number(last[2]));
    const no = 'CK-' + year + '-' + String(max + 1).padStart(4, '0');
    Store.meta.lastBillNo = no; if (Store.adapter) Store.adapter.putMeta('lastBillNo', no);
    return no;
  }

  // ---------- readable columns for Google Sheets ----------
  function viewOf(t, r) {
    if (r.deleted) return { Deleted: 'Yes' };
    const itemName = (id) => { const i = Store.data.items[id]; return i ? i.name : ''; };
    if (t === 'orders') return {
      'Deliver on': serveDate(r), Slot: slotOf(r), 'Taken at': (r.date || '').replace('T', ' '), Customer: r.customer || '', Phone: r.phone || '', Channel: r.channel || '',
      Items: (r.items || []).map((l) => l.qty + ' x ' + l.name).join(', '),
      Total: num(r.total), 'Food cost': num(r.cost), Profit: round2(num(r.total) - num(r.cost)),
      Status: r.status || '', Payment: r.payMode || '', Paid: r.paid ? 'Yes' : 'No', Address: r.address || '', Notes: r.notes || '', By: r.by || '',
      'Bill no': r.billNo || '', 'Bill date': r.billDate || '', 'Bill sent': r.billSentAt ? r.billSentAt.replace('T', ' ') + (r.billSentVia ? ' (' + r.billSentVia + ')' : '') : ''
    };
    if (t === 'expenses') return { Date: r.date || '', Category: r.category || '', Amount: num(r.amount), 'Paid via': r.payMode || '', Note: r.note || '', By: r.by || '' };
    if (t === 'items') return { Name: r.name || '', Unit: r.unit || '', 'Low stock at': num(r.min), 'Cost per unit': num(r.cost) };
    if (t === 'stock') return { Date: r.date || '', Item: itemName(r.itemId), Type: r.type || '', Qty: num(r.qty), Unit: (Store.data.items[r.itemId] || {}).unit || '', Cost: num(r.cost), Vendor: r.vendor || '', Note: r.note || '' };
    if (t === 'dishes') return {
      Name: r.name || '', Category: r.category || '', Price: num(r.price), 'Packaging & other': num(r.extraCost),
      Recipe: (r.recipe || []).map((l) => num(l.qty) + ' ' + ((Store.data.items[l.itemId] || {}).unit || '') + ' ' + itemName(l.itemId)).join(', '),
      Active: r.active === false ? 'No' : 'Yes'
    };
    if (t === 'config' && r.kind === 'contact') return { Setting: 'Customer', Value: [r.name, r.phone, r.address, r.notes].filter(Boolean).join(' · ') };
    if (t === 'config' && r.kind === 'poster') return { Setting: 'Poster', Value: (r.name || '') + ': ' + (r.ids || []).length + ' dishes' };
    if (t === 'config' && r.id === 'kitchen') return { Setting: 'Kitchen', Value: [r.name, r.phone].filter(Boolean).join(' · ') };
    if (t === 'config') return { Setting: r.id, Value: (r.slots || []).map((x) => x.name + ': order by ' + (x.dayBefore ? 'day before ' : '') + x.cutoff + ', deliver ' + x.deliver).join(' | ') };
    return {};
  }

  const Core = {
    TABLES, ORDER_STATUSES, EXPENSE_CATEGORIES, Store, uid, round2, num,
    dayKey, nowLocal, addDays, monthStart, monthEnd,
    memoryAdapter, idbAdapter,
    unitCost, stockOf, lowStock, dishCost, orderSnapshot, orderTotals, stats, customers, viewOf,
    DEFAULT_SLOTS, isCooked, slots, serveDate, slotOf, slotIndex, slotDef, cutoffAt, deliverAt, batchKey, parseBatch, batchCmp, nextOpenBatch, batchOrders, batchesWithOrders, prepList, isSideDish, isSideLine, platesOf, phoneKey, contacts, prepMoves, recordedBatches, usedOf, nextBillNo
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else G.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
