/* Chatruya Kitchens — record the stock actually used for each cooking batch */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, num, $, $$, esc, inr, qty, niceDay, toast, openSheet, closeSheet, acts, render, confirmAsk } = A;
  const r3 = (n) => Math.round(num(n) * 1000) / 1000;
  const itemOf = (id) => S.data.items[id] || { name: 'Removed item', unit: '' };

  // Section shown on the Prep screen for a batch
  A.prepUsageSection = (b, p) => {
    const key = encodeURIComponent(p.key);
    let h = '<div class="section"><h2>Stock used</h2>' + (p.recorded ? '<span class="sub">' + inr(p.usedValue) + '</span>' : '') + '</div>';
    if (!p.recorded) {
      h += '<div class="card" style="margin-bottom:12px"><p style="margin:0 0 10px">After cooking, enter what you actually took from stock for this batch. Stock levels, low-stock alerts and the cost of this batch update from it.</p>' +
        (p.orders.length ? '<p class="sub" style="margin:0 0 12px">Until then the app estimates from your recipes' + (p.planned.length ? '' : ', but no recipes are set up for these dishes yet') + '.</p>' : '') +
        '<button class="btn warm" data-act="usageForm:' + key + '">Record stock used</button></div>';
      return h;
    }
    const plates = p.plates || 0;
    h += '<div class="box">' + p.used.map((u) => {
      const it = itemOf(u.itemId); const left = C.stockOf(u.itemId); const low = num(it.min) > 0 && left <= num(it.min);
      return '<div class="need' + (low ? ' short' : '') + '"><span>' + esc(it.name) + '</span><span class="q">' + qty(u.qty, it.unit) + '</span><span class="s">' + (low ? 'low: ' : '') + qty(left, it.unit) + ' left</span></div>';
    }).join('') + '</div>';
    h += '<div class="grid2" style="margin-bottom:10px"><div class="kpi"><div class="l">Cost of ingredients</div><div class="v">' + inr(p.usedValue) + '</div><div class="h">for this batch</div></div>' +
      '<div class="kpi"><div class="l">Per plate</div><div class="v">' + (plates ? inr(p.usedValue / plates) : '—') + '</div><div class="h">' + plates + ' plates</div></div></div>';
    if (p.ordersAfterRecord) h += '<div class="note">' + p.ordersAfterRecord + ' order' + (p.ordersAfterRecord === 1 ? ' was' : 's were') + ' added after you recorded this. Update the stock used if you cooked more.</div>';
    h += '<div class="btns" style="margin-bottom:6px"><button class="btn small alt" data-act="usageForm:' + key + '">Edit stock used</button><button class="btn small danger" data-act="usageUndo:' + key + '">Undo</button></div>';
    return h;
  };

  function usageForm(key) {
    const b = { date: key.slice(0, 10), slot: key.slice(11) };
    const p = C.prepList(b.date, b.slot);
    const items = S.list('items');
    if (!items.length) { toast('Add your stock items first (Stock tab)'); return; }
    const plannedOf = {}; p.planned.forEach((u) => { plannedOf[u.itemId] = u.qty; });
    const usedOf = {}; p.used.forEach((u) => { usedOf[u.itemId] = (usedOf[u.itemId] || 0) + u.qty; });
    // every stock item gets a box: recorded amount, else the recipe estimate, else empty
    const q = {}; items.forEach((i) => { q[i.id] = p.recorded ? (usedOf[i.id] != null ? r3(usedOf[i.id]) : '') : (plannedOf[i.id] != null ? r3(plannedOf[i.id]) : ''); });
    // stock before this batch is taken out
    const addBack = {};
    if (p.recorded) p.used.forEach((u) => { addBack[u.itemId] = (addBack[u.itemId] || 0) + u.qty; });
    else p.orders.forEach((o) => { if (C.isCooked(o)) (o.consumption || []).forEach((c) => { addBack[c.itemId] = (addBack[c.itemId] || 0) + num(c.qty); }); });
    const before = {}; items.forEach((i) => { before[i.id] = r3(C.stockOf(i.id) + (addBack[i.id] || 0)); });
    // items in the recipes (or already recorded) first, then the rest A–Z
    const sorted = items.slice().sort((a, c) => ((q[c.id] !== '') - (q[a.id] !== '')) || a.name.localeCompare(c.name));
    const hint = (id) => {
      const it = itemOf(id); const v = num(q[id]); const left = r3(before[id] - v); const low = v > 0 && (left < 0 || (num(it.min) > 0 && left <= num(it.min)));
      const parts = [];
      if (plannedOf[id] != null) parts.push('recipe ' + qty(plannedOf[id], it.unit));
      parts.push('have ' + qty(before[id], it.unit));
      if (v > 0) parts.push(inr(v * C.unitCost(id)) + ' · ' + (left < 0 ? 'more than you have' : qty(left, it.unit) + ' left' + (low ? ' (low)' : '')));
      return '<span style="color:' + (low ? '#C2401F' : '#5D6B63') + '">' + parts.join(' · ') + '</span>';
    };
    const body = '<p class="sub" style="margin-top:0">' + esc(b.slot) + ', ' + esc(niceDay(b.date)) + (p.orders.length ? ' · ' + p.orders.length + ' order' + (p.orders.length === 1 ? '' : 's') + ' · ' + p.plates + ' plates' : '') + '. ' +
      'Type how much of each item you used. Leave the rest empty.' + (p.planned.length && !p.recorded ? ' Amounts from your recipes are filled in; change them to what you really used.' : '') + '</p>' +
      (items.length > 8 ? '<input class="search" type="search" id="uq" placeholder="Find an item (onion, oil…)">' : '') +
      '<div class="box" id="ulist">' + sorted.map((i) => '<div class="line" data-uitem="' + i.id + '" data-name="' + esc(i.name.toLowerCase()) + '"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="m" data-uh="' + i.id + '">' + hint(i.id) + '</div></div>' +
        '<input class="in" style="width:96px;min-height:42px;text-align:right" data-uv="' + i.id + '" inputmode="decimal" value="' + esc(q[i.id]) + '" placeholder="0" aria-label="' + esc(i.name) + ' used, in ' + esc(i.unit) + '"><span class="sub" style="width:44px">' + esc(i.unit) + '</span></div>').join('') + '</div>' +
      '<div class="box" id="utot"></div>';
    function total() { return items.reduce((s, i) => s + num(q[i.id]) * C.unitCost(i.id), 0); }
    function drawTotal() {
      const t = total(); const n = items.filter((i) => num(q[i.id]) > 0).length;
      $('#utot').innerHTML = '<div class="sum total"><span>Cost of ingredients · ' + n + ' item' + (n === 1 ? '' : 's') + '</span><span>' + inr(t) + '</span></div>' + (p.plates ? '<div class="sum sub"><span>' + p.plates + ' plates</span><span>' + inr(t / p.plates) + ' per plate</span></div>' : '');
    }
    openSheet('Stock used', body, [{ label: 'Save stock used', cls: 'warm', run: async () => {
      const clean = {}; items.forEach((i) => { if (num(q[i.id]) > 0) clean[i.id] = r3(q[i.id]); });
      if (!Object.keys(clean).length) { toast('Type how much you used of at least one item'); return; }
      for (const m of C.prepMoves(p.key)) await S.remove('stock', m.id);
      for (const itemId of Object.keys(clean)) {
        await S.put('stock', { type: 'prep', itemId, qty: -clean[itemId], cost: Math.round(clean[itemId] * C.unitCost(itemId) * 100) / 100, date: b.date, batch: p.key, note: b.slot + ' · ' + niceDay(b.date) });
      }
      const low = C.lowStock().map((i) => i.name);
      toast('Stock updated' + (low.length ? '. Running low: ' + low.slice(0, 3).join(', ') : ''));
      closeSheet();
    } }], (root) => {
      drawTotal();
      root.addEventListener('input', (e) => {
        if (e.target.id === 'uq') { const s = e.target.value.toLowerCase(); $$('#ulist .line').forEach((r) => { r.style.display = r.dataset.name.includes(s) ? '' : 'none'; }); return; }
        const id = e.target.dataset && e.target.dataset.uv; if (!id) return;
        q[id] = e.target.value; const h = root.querySelector('[data-uh="' + id + '"]'); if (h) h.innerHTML = hint(id); drawTotal();
      });
      root.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.uv) setTimeout(() => { try { e.target.select(); } catch (x) { /* ignore */ } }, 0); });
    });
  }
  acts.usageForm = (k) => usageForm(decodeURIComponent(k));
  acts.usageUndo = async (k) => {
    const key = decodeURIComponent(k);
    if (!confirmAsk('Remove the stock you recorded for this batch? The app goes back to estimating from recipes.')) return;
    for (const m of C.prepMoves(key)) await S.remove('stock', m.id);
    toast('Back to recipe estimates'); render();
  };
})();
