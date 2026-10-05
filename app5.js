/* Chatruya Kitchens — record the stock actually used for each cooking batch */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, num, $, $$, esc, inr, qty, niceDay, toast, openSheet, closeSheet, acts, render, confirmAsk } = A;
  const r3 = (n) => Math.round(num(n) * 1000) / 1000;
  const itemOf = (id) => S.data.items[id] || { name: 'Removed item', unit: '' };

  // Section shown on the Prep screen for a batch
  A.prepUsageSection = (b, p) => {
    if (!p.orders.length) return '';
    const key = encodeURIComponent(p.key);
    let h = '<div class="section"><h2>Stock used</h2>' + (p.recorded ? '<span class="sub">' + inr(p.usedValue) + '</span>' : '') + '</div>';
    if (!p.recorded) {
      h += '<div class="card" style="margin-bottom:12px"><p style="margin:0 0 10px">After cooking, enter what you actually took from stock for this batch. Stock levels, low-stock alerts and the cost of this batch update from it.</p>' +
        '<p class="sub" style="margin:0 0 12px">Until then the app estimates from your recipes' + (p.planned.length ? '' : ', but no recipes are set up for these dishes yet') + '.</p>' +
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
    const items = S.list('items').sort((a, c) => a.name.localeCompare(c.name));
    if (!items.length) { toast('Add your stock items first (Stock tab)'); return; }
    // rows: what was recorded before, otherwise the recipe estimate
    let rows = (p.recorded ? p.used : p.planned).map((u) => ({ itemId: u.itemId, qty: r3(u.qty) }));
    const plannedOf = {}; p.planned.forEach((u) => { plannedOf[u.itemId] = u.qty; });
    const opts = (sel) => items.map((i) => '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('');
    const before = {}; // stock before this batch's recorded usage is applied
    const addBack = {};
    if (p.recorded) p.used.forEach((u) => { addBack[u.itemId] = (addBack[u.itemId] || 0) + u.qty; });
    else p.orders.forEach((o) => { if (C.isCooked(o)) (o.consumption || []).forEach((c) => { addBack[c.itemId] = (addBack[c.itemId] || 0) + num(c.qty); }); });
    items.forEach((i) => { before[i.id] = r3(C.stockOf(i.id) + (addBack[i.id] || 0)); });
    function rowsHtml() {
      if (!rows.length) return '<p class="sub" style="margin:0 0 10px">No items yet. Tap “Add item” for each thing you used.</p>';
      return rows.map((r, i) => {
        const it = itemOf(r.itemId); const left = r3(before[r.itemId] - num(r.qty)); const low = left < 0 || (num(it.min) > 0 && left <= num(it.min));
        return '<div class="box" style="padding:10px 12px;margin-bottom:8px"><div class="recipe-line" style="margin-bottom:6px"><select class="in" data-ui="' + i + '">' + opts(r.itemId) + '</select>' +
          '<input class="in" data-uq="' + i + '" inputmode="decimal" value="' + esc(r.qty) + '" aria-label="Quantity used in ' + esc(it.unit) + '">' +
          '<button type="button" class="x" data-urm="' + i + '" aria-label="Remove">&times;</button></div>' +
          '<div class="m" style="font-size:13px;color:' + (low ? '#C2401F' : '#5D6B63') + '">' + (plannedOf[r.itemId] != null ? 'Recipe says ' + qty(plannedOf[r.itemId], it.unit) + ' · ' : '') + inr(num(r.qty) * C.unitCost(r.itemId)) + ' · ' + (left < 0 ? 'more than you have (' + qty(before[r.itemId], it.unit) + ')' : qty(left, it.unit) + ' left' + (low ? ', running low' : '')) + '</div></div>';
      }).join('');
    }
    function total() { return rows.reduce((s, r) => s + num(r.qty) * C.unitCost(r.itemId), 0); }
    function draw() {
      $('#urows').innerHTML = rowsHtml();
      const t = total(); $('#utot').innerHTML = '<div class="sum total"><span>Cost of ingredients</span><span>' + inr(t) + '</span></div>' + (p.plates ? '<div class="sum sub"><span>' + p.plates + ' plates</span><span>' + inr(t / p.plates) + ' per plate</span></div>' : '');
    }
    const body = '<p class="sub" style="margin-top:0">' + esc(b.slot) + ', ' + esc(niceDay(b.date)) + ' · ' + p.orders.length + ' order' + (p.orders.length === 1 ? '' : 's') + ' · ' + p.plates + ' plates. ' + (p.recorded ? 'Change anything that is wrong.' : 'Filled in from your recipes. Change the numbers to what you actually used.') + '</p>' +
      '<div id="urows"></div><button type="button" class="btn small alt" id="uadd" style="margin-bottom:14px">Add item</button><div class="box" id="utot"></div>';
    openSheet('Stock used', body, [{ label: 'Save stock used', cls: 'warm', run: async () => {
      const clean = {}; rows.forEach((r) => { if (r.itemId && num(r.qty) > 0) clean[r.itemId] = r3((clean[r.itemId] || 0) + num(r.qty)); });
      if (!Object.keys(clean).length) { toast('Enter at least one item, or use Undo to go back to recipe estimates'); return; }
      for (const m of C.prepMoves(p.key)) await S.remove('stock', m.id);
      for (const itemId of Object.keys(clean)) {
        await S.put('stock', { type: 'prep', itemId, qty: -clean[itemId], cost: Math.round(clean[itemId] * C.unitCost(itemId) * 100) / 100, date: b.date, batch: p.key, note: b.slot + ' · ' + niceDay(b.date) });
      }
      const low = C.lowStock().map((i) => i.name);
      toast('Stock updated' + (low.length ? '. Running low: ' + low.slice(0, 3).join(', ') : ''));
      closeSheet();
    } }], (root) => {
      draw();
      root.addEventListener('click', (e) => {
        if (e.target.closest('#uadd')) { const used = new Set(rows.map((r) => r.itemId)); const next = items.find((i) => !used.has(i.id)) || items[0]; rows.push({ itemId: next.id, qty: '' }); draw(); const q = $$('#urows [data-uq]'); if (q.length) q[q.length - 1].focus(); return; }
        const rm = e.target.closest('[data-urm]'); if (rm) { rows.splice(Number(rm.dataset.urm), 1); draw(); }
      });
      root.addEventListener('change', (e) => { const i = e.target.dataset.ui; if (i !== undefined) { rows[i].itemId = e.target.value; draw(); } });
      root.addEventListener('input', (e) => {
        const i = e.target.dataset.uq; if (i === undefined) return;
        rows[i].qty = e.target.value;
        // update only the totals while typing so the keyboard stays open
        const t = total(); $('#utot').innerHTML = '<div class="sum total"><span>Cost of ingredients</span><span>' + inr(t) + '</span></div>' + (p.plates ? '<div class="sum sub"><span>' + p.plates + ' plates</span><span>' + inr(t / p.plates) + ' per plate</span></div>' : '');
      });
      root.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.uq !== undefined) setTimeout(() => { if (!root.contains(document.activeElement) || !document.activeElement.dataset || document.activeElement.dataset.uq === undefined) draw(); }, 0); });
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
