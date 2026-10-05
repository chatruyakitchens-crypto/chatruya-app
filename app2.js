/* Chatruya Kitchens — stock, spend, menu, reports, settings */
(function () {
  'use strict';
  const A = window.App;
  const { C, S, num, r2, $, $$, esc, inr, qty, today, niceDay, MONTHS, UNITS, PAYMODES, DISH_CATS, ui, toast, chips, field, group, val, confirmAsk, itemName, itemUnit, openSheet, closeSheet, views, acts, bind, render, fab } = A;

  // ================= STOCK =================
  views.stock = () => {
    const q = ui.stockQ.trim().toLowerCase();
    const items = S.list('items').filter((i) => !q || i.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    let value = 0; S.list('items').forEach((i) => { value += Math.max(0, C.stockOf(i.id)) * C.unitCost(i.id); });
    let h = '<div class="screen-title"><h1>Stock</h1><button class="btn small alt" data-act="newItem">Add item</button></div>';
    if (!S.list('items').length) {
      return h + '<div class="empty"><p>List the raw materials you buy: rice, chicken, oil, masala, takeaway boxes. Each order then takes its share out of stock automatically.</p><button class="btn small" data-act="newItem">Add your first item</button></div>';
    }
    h += '<p class="sub" style="margin:-6px 0 12px">Stock on hand is worth about ' + inr(value) + '</p>';
    h += '<input class="search" id="sq" type="search" placeholder="Find an item" value="' + esc(ui.stockQ) + '" data-input="stockQ">';
    const low = items.filter((i) => num(i.min) > 0 && C.stockOf(i.id) <= num(i.min));
    const rest = items.filter((i) => !low.includes(i));
    const row = (i) => {
      const s = C.stockOf(i.id), isLow = low.includes(i);
      return '<button class="rowc" data-act="item:' + i.id + '"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="m">' + inr(C.unitCost(i.id)) + ' per ' + esc(i.unit) + (num(i.min) ? ' · alert at ' + qty(i.min, i.unit) : '') + '</div></div>' +
        (isLow ? '<span class="chip low">' + (s <= 0 ? 'Out · ' : '') + qty(s, i.unit) + '</span>' : '<span class="amt">' + qty(s, i.unit) + '</span>') + '</button>';
    };
    if (low.length) h += '<div class="day-h"><span>Running low</span><span>' + low.length + '</span></div><div class="list">' + low.map(row).join('') + '</div>';
    if (rest.length) h += '<div class="day-h"><span>' + (low.length ? 'Everything else' : 'All items') + '</span><span>' + rest.length + '</span></div><div class="list">' + rest.map(row).join('') + '</div>';
    return h + fab('Record purchase', 'purchase');
  };
  acts.newItem = () => itemForm();
  acts.item = (id) => itemDetail(id);
  acts.purchase = (id) => purchaseForm(id);
  acts.adjust = (id) => adjustForm(id);
  acts.editItem = (id) => itemForm(id);

  function itemForm(id) {
    const it = id ? S.get('items', id) : null;
    let b = '<form id="itf">' + field('Item name', '<input class="in" name="name" value="' + esc(it ? it.name : '') + '" placeholder="Basmati rice" required>') +
      group('Measured in', chips('unit', UNITS, it ? it.unit : 'kg'), 'Use the same unit in recipes. For example, rice in kg means 150 g is 0.15.') +
      field('Price per unit (₹)', '<input class="in" name="cost" inputmode="decimal" value="' + esc(it ? it.cost : '') + '" placeholder="110">', 'Your latest purchase price replaces this automatically.');
    if (!it) b += field('Stock you have now', '<input class="in" name="opening" inputmode="decimal" placeholder="0">', 'Count what is in the kitchen today. Leave empty if none.');
    b += field('Warn me when stock falls to', '<input class="in" name="min" inputmode="decimal" value="' + esc(it && it.min ? it.min : '') + '" placeholder="e.g. 2">') + '</form>';
    const actions = [{ label: it ? 'Save item' : 'Add item', run: async () => {
      const f = $('#itf'); const name = val(f, 'name').trim(); if (!name) { toast('Give the item a name'); return; }
      const dup = S.list('items').find((x) => x.name.toLowerCase() === name.toLowerCase() && (!it || x.id !== it.id));
      if (dup) { toast(name + ' is already in your stock list'); return; }
      const saved = await S.put('items', { ...(it || {}), name, unit: val(f, 'unit') || 'kg', cost: num(val(f, 'cost')), min: num(val(f, 'min')) });
      const opening = it ? 0 : num(val(f, 'opening'));
      if (opening > 0) await S.put('stock', { type: 'opening', itemId: saved.id, qty: opening, cost: r2(opening * num(val(f, 'cost'))), date: today(), note: 'Starting stock' });
      toast(it ? 'Item saved' : name + ' added'); itemDetail(saved.id);
    } }];
    openSheet(it ? 'Edit ' + it.name : 'Add stock item', b, actions);
  }

  function itemDetail(id) {
    const it = S.get('items', id); if (!it) { closeSheet(); return; }
    const s = C.stockOf(id), uc = C.unitCost(id);
    const usedIn = S.list('dishes').filter((d) => (d.recipe || []).some((l) => l.itemId === id));
    const moves = S.list('stock').filter((m) => m.itemId === id).sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1)).slice(0, 25);
    const usedToday = C.usedOf(id, today(), today()), used7 = C.usedOf(id, C.addDays(today(), -6), today());
    let b = '<div class="grid2" style="margin-bottom:12px"><div class="kpi"><div class="l">In stock</div><div class="v ' + (num(it.min) && s <= num(it.min) ? 'neg' : '') + '">' + qty(s, it.unit) + '</div><div class="h">' + (num(it.min) ? 'alert at ' + qty(it.min, it.unit) : 'no alert set') + '</div></div>' +
      '<div class="kpi"><div class="l">Price</div><div class="v">' + inr(uc) + '</div><div class="h">per ' + esc(it.unit) + '</div></div>' +
      '<div class="kpi"><div class="l">Used today</div><div class="v">' + qty(usedToday, it.unit) + '</div><div class="h">in cooking</div></div>' +
      '<div class="kpi"><div class="l">Last 7 days</div><div class="v">' + qty(used7, it.unit) + '</div><div class="h">' + (used7 > 0 && s > 0 ? 'lasts ~' + Math.max(1, Math.round(s / (used7 / 7))) + ' more days' : 'by orders') + '</div></div></div>';
    b += '<div class="btns" style="margin-bottom:14px"><button class="btn small" data-act="purchase:' + id + '">Record purchase</button><button class="btn small alt" data-act="adjust:' + id + '">Correct stock</button></div>';
    if (usedIn.length) b += '<div class="day-h"><span>Used in</span></div><p style="margin:0 0 6px">' + usedIn.map((d) => esc(d.name)).join(', ') + '</p>';
    b += '<div class="day-h"><span>History</span></div>';
    b += moves.length ? '<div class="box">' + moves.map((m) => '<div class="line"><div class="grow"><div class="t">' + ({ purchase: 'Bought', opening: 'Starting stock', prep: 'Used in cooking', adjust: num(m.qty) < 0 ? 'Used / wasted' : 'Correction' }[m.type] || m.type) + (m.vendor ? ' · ' + esc(m.vendor) : '') + '</div><div class="m">' + niceDay(m.date) + (num(m.cost) ? ' · ' + inr(m.cost) : '') + (m.note ? ' · ' + esc(m.note) : '') + '</div></div>' +
      '<span class="amt ' + (num(m.qty) < 0 ? 'neg' : '') + '">' + (num(m.qty) > 0 ? '+' : '') + qty(m.qty, it.unit) + '</span><button class="x" aria-label="Remove this entry" data-act="delMove:' + m.id + '">&times;</button></div>').join('') + '</div>'
      : '<p class="sub">No purchases recorded yet.</p>';
    b += '<div class="btns" style="margin-top:14px"><button class="btn small alt" data-act="editItem:' + id + '">Edit item</button><button class="btn small danger" data-act="delItem:' + id + '">Delete item</button></div>';
    openSheet(it.name, b, []);
    bind($('#sheetBody'));
  }
  acts.delMove = async (id) => {
    const m = S.get('stock', id); if (!m) return;
    const linked = m.expenseId && S.get('expenses', m.expenseId);
    if (!confirmAsk('Remove this stock entry?' + (linked ? ' Its expense of ' + inr(linked.amount) + ' is removed too.' : ''))) return;
    await S.remove('stock', id); if (linked) await S.remove('expenses', linked.id);
    toast('Entry removed'); itemDetail(m.itemId);
  };
  acts.delItem = async (id) => {
    const it = S.get('items', id); const used = S.list('dishes').filter((d) => (d.recipe || []).some((l) => l.itemId === id));
    if (!confirmAsk('Delete ' + it.name + '?' + (used.length ? ' It is used in ' + used.length + ' dish recipe(s); those lines stop counting cost.' : ''))) return;
    await S.remove('items', id); toast(it.name + ' deleted'); closeSheet();
  };

  function itemOptions(sel) {
    return S.list('items').sort((a, b) => a.name.localeCompare(b.name)).map((i) => '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('');
  }

  function purchaseForm(itemId) {
    if (!S.list('items').length) { toast('Add a stock item first'); itemForm(); return; }
    const first = itemId || S.list('items').sort((a, b) => a.name.localeCompare(b.name))[0].id;
    const b = '<form id="pf">' + field('Item', '<select class="in" name="itemId">' + itemOptions(first) + '</select>') +
      '<div class="row2">' + field('Quantity', '<input class="in" name="qty" inputmode="decimal" placeholder="5">', '<span id="pu">' + esc(itemUnit(first)) + '</span>') +
      field('Total paid (₹)', '<input class="in" name="amount" inputmode="decimal" placeholder="550">', '<span id="pp">&nbsp;</span>') + '</div>' +
      field('Bought from', '<input class="in" name="vendor" placeholder="Rythu Bazaar, Ramesh Stores…">') +
      '<div class="row2">' + field('Date', '<input class="in" type="date" name="date" value="' + today() + '">') + field('Spend category', '<select class="in" name="category">' + C.EXPENSE_CATEGORIES.map((c) => '<option' + (c === 'Groceries' ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>') + '</div>' +
      group('Paid by', chips('payMode', PAYMODES.filter((p) => p !== 'Pay later').concat(['On credit']), 'UPI')) +
      '<label class="check"><input type="checkbox" name="asExpense" checked> Also add to Spend</label></form>';
    openSheet('Record purchase', b, [{ label: 'Save purchase', run: async () => {
      const f = $('#pf'); const q = num(val(f, 'qty')), amt = num(val(f, 'amount')), iid = val(f, 'itemId');
      if (q <= 0) { toast('Enter how much you bought'); return; }
      const it = S.get('items', iid);
      let exp = null;
      if (val(f, 'asExpense') && amt > 0) exp = await S.put('expenses', { date: val(f, 'date') || today(), category: val(f, 'category'), amount: amt, payMode: val(f, 'payMode'), note: it.name + ' ' + qty(q, it.unit) + (val(f, 'vendor') ? ' from ' + val(f, 'vendor').trim() : '') });
      const m = await S.put('stock', { type: 'purchase', itemId: iid, qty: q, cost: amt, date: val(f, 'date') || today(), vendor: val(f, 'vendor').trim(), expenseId: exp ? exp.id : '' });
      if (exp) await S.put('expenses', { ...S.get('expenses', exp.id), stockId: m.id });
      toast('Added ' + qty(q, it.unit) + ' ' + it.name); itemDetail(iid);
    } }], (root) => {
      root.addEventListener('input', () => {
        const f = $('#pf'); const u = itemUnit(val(f, 'itemId')); const q = num(val(f, 'qty')), a = num(val(f, 'amount'));
        $('#pu').textContent = u; $('#pp').textContent = q > 0 && a > 0 ? '= ' + inr(a / q) + ' per ' + u : ' ';
      });
      root.addEventListener('change', () => root.dispatchEvent(new Event('input')));
    });
  }

  function adjustForm(itemId) {
    const it = S.get('items', itemId); const cur = C.stockOf(itemId);
    const b = '<form id="af"><p class="sub" style="margin-top:0">The app thinks you have <b>' + qty(cur, it.unit) + '</b> of ' + esc(it.name) + '.</p>' +
      group('What happened', chips('kind', [{ v: 'count', l: 'I counted it' }, { v: 'waste', l: 'Used or wasted' }, { v: 'add', l: 'Got some extra' }], 'count')) +
      field('Quantity (' + esc(it.unit) + ')', '<input class="in" name="qty" inputmode="decimal">', '<span id="ah">Enter what is actually in the kitchen now.</span>') +
      field('Note', '<input class="in" name="note" placeholder="Spilled, staff meal, gift from family…">') + '</form>';
    openSheet('Correct ' + it.name, b, [{ label: 'Save correction', run: async () => {
      const f = $('#af'); const kind = val(f, 'kind'); const q = num(val(f, 'qty'));
      if (val(f, 'qty') === '') { toast('Enter a quantity'); return; }
      const delta = kind === 'count' ? q - cur : kind === 'waste' ? -Math.abs(q) : Math.abs(q);
      if (Math.abs(delta) < 0.0005) { toast('Stock already matches'); itemDetail(itemId); return; }
      await S.put('stock', { type: 'adjust', itemId, qty: Math.round(delta * 1000) / 1000, cost: 0, date: today(), note: val(f, 'note').trim() || (kind === 'count' ? 'Stock count' : '') });
      toast('Stock corrected'); itemDetail(itemId);
    } }], (root) => root.addEventListener('change', () => {
      const k = val($('#af'), 'kind');
      $('#ah').textContent = { count: 'Enter what is actually in the kitchen now.', waste: 'This amount is taken out of stock.', add: 'This amount is added to stock (no expense).' }[k];
    }));
  }

  // ================= SPEND =================
  views.spend = () => {
    const mk = ui.spendMonth; const [y, m] = mk.split('-').map(Number);
    const from = mk + '-01', to = C.monthEnd(from);
    const list = S.list('expenses').filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1));
    const total = list.reduce((s, e) => s + num(e.amount), 0);
    const byCat = {}; list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + num(e.amount); });
    const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]); const max = cats.length ? byCat[cats[0]] : 1;
    let h = '<div class="screen-title"><h1>Spend</h1></div>' +
      '<div class="month"><button data-act="month:-1" aria-label="Previous month">‹</button><b>' + MONTHS[m - 1] + ' ' + y + '</b><button data-act="month:1" aria-label="Next month">›</button></div>';
    if (!list.length) return h + '<div class="empty"><p>Nothing spent in ' + MONTHS[m - 1] + ' yet. Add gas, vegetables, packaging, rent and salaries here to see your real profit.</p><button class="btn small warm" data-act="newExpense">Add an expense</button></div>' + fab('Add expense', 'newExpense');
    h += '<div class="card" style="margin-bottom:6px"><div class="sub">Total spent</div><div style="font-family:var(--round);font-size:30px;font-weight:800">' + inr(total) + '</div>' +
      cats.map((c) => '<div class="hbar"><span class="lbl">' + esc(c) + '</span><div class="track"><div class="fill" style="width:' + Math.max(3, (byCat[c] / max) * 100) + '%"></div></div><b>' + inr(byCat[c]) + '</b></div>').join('') + '</div>';
    let last = '';
    list.forEach((e) => {
      if (e.date !== last) { const dt = list.filter((x) => x.date === e.date).reduce((s, x) => s + num(x.amount), 0); h += (last ? '</div>' : '') + '<div class="day-h"><span>' + niceDay(e.date) + '</span><span>' + inr(dt) + '</span></div><div class="list">'; last = e.date; }
      h += '<button class="rowc" data-act="expense:' + e.id + '"><div class="grow"><div class="t">' + esc(e.category) + '</div><div class="m">' + esc(e.note || e.payMode || '') + '</div></div><span class="amt">' + inr(e.amount) + '</span></button>';
    });
    return h + '</div>' + fab('Add expense', 'newExpense');
  };
  acts.month = (d) => { const [y, m] = ui.spendMonth.split('-').map(Number); const dt = new Date(y, m - 1 + Number(d), 1); ui.spendMonth = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); render(); };
  acts.newExpense = () => expenseForm();
  acts.expense = (id) => expenseForm(id);

  function expenseForm(id) {
    const e = id ? S.get('expenses', id) : null;
    const b = '<form id="ef">' + field('Amount (₹)', '<input class="in big" name="amount" inputmode="decimal" value="' + esc(e ? e.amount : '') + '" placeholder="0">') +
      group('Category', chips('category', C.EXPENSE_CATEGORIES, e ? e.category : 'Vegetables')) +
      field('Note', '<input class="in" name="note" value="' + esc(e ? e.note : '') + '" placeholder="2 gas cylinders, helper salary…">') +
      field('Date', '<input class="in" type="date" name="date" value="' + esc(e ? e.date : today()) + '">') +
      group('Paid by', chips('payMode', ['Cash', 'UPI', 'Card', 'Bank transfer', 'On credit'], e ? e.payMode : 'UPI')) +
      (e && e.stockId ? '<div class="note">This came from a stock purchase. Deleting it also removes that stock entry.</div>' : '') + '</form>';
    const actions = [{ label: e ? 'Save changes' : 'Add expense', run: async () => {
      const f = $('#ef'); const amount = num(val(f, 'amount')); if (amount <= 0) { toast('Enter the amount'); return; }
      await S.put('expenses', { ...(e || {}), amount, category: val(f, 'category') || 'Other', note: val(f, 'note').trim(), date: val(f, 'date') || today(), payMode: val(f, 'payMode') });
      toast(e ? 'Expense saved' : inr(amount) + ' added to ' + val(f, 'category')); closeSheet();
    } }];
    if (e) actions.unshift({ label: 'Delete', cls: 'danger', run: async () => {
      if (!confirmAsk('Delete this expense of ' + inr(e.amount) + '?')) return;
      await S.remove('expenses', e.id); if (e.stockId && S.get('stock', e.stockId)) await S.remove('stock', e.stockId);
      toast('Expense deleted'); closeSheet();
    } });
    openSheet(e ? 'Edit expense' : 'Add expense', b, actions, () => { if (!e) setTimeout(() => $('#ef').elements.amount.focus(), 260); });
  }

  // ================= MORE =================
  views.more = () => {
    const row = (to, t, m) => '<button class="rowc" data-act="go:' + to + '"><div class="grow"><div class="t">' + t + '</div><div class="m">' + m + '</div></div><span aria-hidden="true">›</span></button>';
    return '<div class="screen-title"><h1>More</h1></div><div class="list">' +
      row('menu', 'Menu & dish costs', S.list('dishes').length + ' dishes, with cost per plate and margin') +
      row('slots', 'Slots & alerts', C.slots().map((s) => s.name + ' closes ' + (s.dayBefore ? 'day before ' : '') + s.cutoff).join(' · ')) +
      row('reports', 'Reports', 'Sales, profit, spending and best sellers') +
      row('customers', 'Phone book', A.C.customers().length + ' customers · call, WhatsApp, save to phone') +
      row('poster', 'Menu posters', 'Breakfast, lunch, dinner and special-event menus to share') +
      row('settings', 'Settings & sync', A.syncConfigured() ? 'Sharing with other phones' : 'Connect phones, backups') + '</div>';
  };

  // ================= MENU =================
  function marginCls(pct) { return pct < 40 ? 'margin-bad' : pct < 55 ? 'margin-ok' : 'margin-good'; }
  views.menu = () => {
    const dishes = S.list('dishes').sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
    let h = '<div class="screen-title"><h1>Menu</h1><button class="btn small alt" data-act="newDish">Add dish</button></div>';
    if (!dishes.length) return h + '<div class="empty"><p>Add each dish with its selling price and recipe. The app works out what one plate costs you and how much you keep.</p><button class="btn small" data-act="newDish">Add your first dish</button></div>';
    h += '<p class="sub" style="margin:-6px 0 6px">Margin is what you keep from the price after ingredients and packaging. Under 40% is shown in red.</p>';
    let last = null;
    dishes.forEach((d) => {
      const cost = C.dishCost(d), price = num(d.price), pct = price ? Math.round(((price - cost) / price) * 100) : 0;
      if ((d.category || 'Dishes') !== last) { h += (last !== null ? '</div>' : '') + '<div class="day-h"><span>' + esc(d.category || 'Dishes') + '</span></div><div class="list">'; last = d.category || 'Dishes'; }
      h += '<button class="rowc" data-act="dish:' + d.id + '"' + (d.active === false ? ' style="opacity:.55"' : '') + '><div class="grow"><div class="t">' + esc(d.name) + (d.active === false ? ' (hidden)' : '') + '</div><div class="m">Sells ' + inr(price) + ' · costs ' + inr(cost) + ((d.recipe || []).length ? '' : ' · no recipe yet') + '</div></div>' + (C.isSideDish(d) && !price ? '<span class="chip">Free side</span>' : '<span class="' + marginCls(pct) + '">' + pct + '%</span>') + '</button>';
    });
    return h + '</div>';
  };
  acts.newDish = () => dishForm();
  acts.dish = (id) => dishForm(id);

  function dishForm(id) {
    const d = id ? S.get('dishes', id) : null;
    const recipe = d ? (d.recipe || []).map((l) => ({ ...l })) : [];
    const cats = Array.from(new Set(DISH_CATS.concat(S.list('dishes').map((x) => x.category).filter(Boolean))));
    const hasItems = S.list('items').length > 0;
    const b = '<form id="df">' + field('Dish name', '<input class="in" name="name" value="' + esc(d ? d.name : '') + '" placeholder="Chicken dum biryani">') +
      '<div class="row2">' + field('Selling price (₹)', '<input class="in" name="price" inputmode="decimal" value="' + esc(d ? d.price : '') + '">') +
      field('Category', '<input class="in" name="category" list="dcats" value="' + esc(d ? d.category : '') + '" placeholder="Biryani">') + '</div>' +
      '<datalist id="dcats">' + cats.map((c) => '<option value="' + esc(c) + '"></option>').join('') + '</datalist>' +
      '<div class="f"><span>Recipe for one plate</span>' + (hasItems ? '<div id="rl"></div><button type="button" class="btn small alt" id="addLine">Add ingredient</button>' : '<div class="note">Add stock items first (rice, chicken…). Then come back to build the recipe.</div>') + '</div>' +
      field('Packaging & other cost per plate (₹)', '<input class="in" name="extraCost" inputmode="decimal" value="' + esc(d && d.extraCost ? d.extraCost : '') + '" placeholder="e.g. 8">', 'Box, bag, spoon, gas share. Leave empty if your box is already a stock item in the recipe.') +
      '<div class="box" id="dsum"></div>' +
      '<label class="check"><input type="checkbox" name="active"' + (!d || d.active !== false ? ' checked' : '') + '> Show in new orders</label></form>';
    function drawLines() {
      const box = $('#rl'); if (!box) return;
      box.innerHTML = recipe.map((l, i) => '<div class="recipe-line"><select class="in" data-ri="' + i + '" data-k="itemId">' + itemOptions(l.itemId) + '</select>' +
        '<input class="in" data-ri="' + i + '" data-k="qty" inputmode="decimal" value="' + esc(l.qty) + '" placeholder="' + esc(itemUnit(l.itemId)) + '" aria-label="Quantity in ' + esc(itemUnit(l.itemId)) + '">' +
        '<button type="button" class="x" data-rm="' + i + '" aria-label="Remove ingredient">&times;</button></div>').join('') || '<p class="sub" style="margin:0 0 8px">No ingredients yet.</p>';
    }
    function drawSum() {
      const f = $('#df'); const tmp = { recipe, extraCost: num(val(f, 'extraCost')) };
      const cost = C.dishCost(tmp), price = num(val(f, 'price')); const pct = price ? Math.round(((price - cost) / price) * 100) : 0;
      $('#dsum').innerHTML = recipe.filter((l) => l.itemId && num(l.qty)).map((l) => '<div class="sum sub"><span>' + qty(l.qty, itemUnit(l.itemId)) + ' ' + esc(itemName(l.itemId)) + '</span><span>' + inr(num(l.qty) * C.unitCost(l.itemId)) + '</span></div>').join('') +
        '<div class="sum total"><span>Cost per plate</span><span>' + inr(cost) + '</span></div>' +
        (price ? '<div class="sum"><span>You keep</span><span class="' + marginCls(pct) + '">' + inr(price - cost) + ' (' + pct + '%)</span></div>' : '');
    }
    const actions = [{ label: d ? 'Save dish' : 'Add dish', run: async () => {
      const f = $('#df'); const name = val(f, 'name').trim(); if (!name) { toast('Give the dish a name'); return; }
      if (num(val(f, 'price')) <= 0 && !C.isSideDish({ category: val(f, 'category') })) { toast('Enter the selling price (chutneys in category Chutney can be ₹0)'); return; }
      await S.put('dishes', { ...(d || {}), name, price: num(val(f, 'price')), category: val(f, 'category').trim(), extraCost: num(val(f, 'extraCost')), active: val(f, 'active'), recipe: recipe.filter((l) => l.itemId && num(l.qty) > 0).map((l) => ({ itemId: l.itemId, qty: num(l.qty) })) });
      toast(d ? 'Dish saved' : name + ' added to menu'); closeSheet();
    } }];
    if (d) actions.unshift({ label: 'Delete', cls: 'danger', run: async () => { if (!confirmAsk('Delete ' + d.name + '? Past orders keep their numbers.')) return; await S.remove('dishes', d.id); toast('Dish deleted'); closeSheet(); } });
    openSheet(d ? d.name : 'Add dish', b, actions, (root) => {
      drawLines(); drawSum();
      const add = $('#addLine'); if (add) add.addEventListener('click', () => { recipe.push({ itemId: S.list('items').sort((a, b2) => a.name.localeCompare(b2.name))[0].id, qty: '' }); drawLines(); drawSum(); const ins = $$('#rl [data-k=itemId]'); ins[ins.length - 1].focus(); });
      root.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { recipe.splice(Number(rm.dataset.rm), 1); drawLines(); drawSum(); } });
      root.addEventListener('input', (e) => { const ri = e.target.dataset.ri; if (ri !== undefined) { recipe[ri][e.target.dataset.k] = e.target.value; if (e.target.dataset.k === 'itemId') { drawLines(); } } drawSum(); });
      root.addEventListener('change', (e) => { const ri = e.target.dataset.ri; if (ri !== undefined && e.target.dataset.k === 'itemId') { recipe[ri].itemId = e.target.value; drawLines(); drawSum(); } });
    });
  }

  // ================= REPORTS =================
  function periodRange() {
    const t = today();
    if (ui.period === 'today') return [t, t];
    if (ui.period === '7d') return [C.addDays(t, -6), t];
    if (ui.period === 'month') return [C.monthStart(t), t];
    if (ui.period === 'last') { const s = C.monthStart(C.addDays(C.monthStart(t), -1)); return [s, C.monthEnd(s)]; }
    return [ui.from <= ui.to ? ui.from : ui.to, ui.from <= ui.to ? ui.to : ui.from];
  }
  function barChart(byDay) {
    const keys = Object.keys(byDay); if (keys.length < 2) return '';
    const W = 600, H = 180, P = 22; const max = Math.max(1, ...keys.map((k) => Math.max(byDay[k].sales, byDay[k].spent)));
    const bw = (W - P) / keys.length;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + (H + 24) + '" role="img" aria-label="Daily sales and spending">';
    [0.5, 1].forEach((g) => { s += '<line x1="' + P + '" x2="' + W + '" y1="' + (H - (H - 10) * g) + '" y2="' + (H - (H - 10) * g) + '" stroke="#D3DBD6" stroke-dasharray="3 4"/>'; });
    keys.forEach((k, i) => {
      const x = P + i * bw; const sh = (byDay[k].sales / max) * (H - 10), eh = (byDay[k].spent / max) * (H - 10);
      const w = Math.max(2, bw * 0.38);
      s += '<rect x="' + (x + bw * 0.1) + '" y="' + (H - sh) + '" width="' + w + '" height="' + sh + '" rx="2" fill="#24563F"><title>' + k + ' sales ' + inr(byDay[k].sales) + '</title></rect>';
      s += '<rect x="' + (x + bw * 0.1 + w + 1) + '" y="' + (H - eh) + '" width="' + w + '" height="' + eh + '" rx="2" fill="#F4B400"><title>' + k + ' spent ' + inr(byDay[k].spent) + '</title></rect>';
      if (keys.length <= 10 || i % Math.ceil(keys.length / 8) === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (H + 17) + '" font-size="15" text-anchor="middle" fill="#5D6B63">' + Number(k.slice(8)) + '</text>';
    });
    s += '<text x="0" y="16" font-size="14" fill="#5D6B63">' + inr(max) + '</text></svg>';
    return s + '<div class="legend"><span><i style="background:#24563F"></i>Sales</span><span><i style="background:#F4B400"></i>Spent</span></div>';
  }
  views.reports = () => {
    const [from, to] = periodRange(); const st = C.stats(from, to);
    let h = '<div class="screen-title"><h1>Reports</h1></div><div class="seg">' + [['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Pick dates']].map(([k, l]) => '<button type="button" aria-pressed="' + (ui.period === k) + '" data-act="period:' + k + '">' + l + '</button>').join('') + '</div>';
    if (ui.period === 'custom') h += '<div class="row2"><label class="f"><span>From</span><input class="in" type="date" id="rf" value="' + from + '"></label><label class="f"><span>To</span><input class="in" type="date" id="rt" value="' + to + '"></label></div>';
    else h += '<p class="sub" style="margin:-4px 0 12px">' + niceDay(from) + (from !== to ? ' to ' + niceDay(to) : '') + '</p>';
    h += '<div class="grid2">' +
      '<div class="kpi"><div class="l">Sales</div><div class="v">' + inr(st.sales) + '</div><div class="h">' + st.count + ' orders · avg ' + inr(st.avg) + '</div></div>' +
      '<div class="kpi"><div class="l">Food cost</div><div class="v">' + inr(st.foodCost) + '</div><div class="h">' + st.foodPct + '% of sales</div></div>' +
      '<div class="kpi"><div class="l">Gross profit</div><div class="v pos">' + inr(st.gross) + '</div><div class="h">sales − recipe cost of what sold</div></div>' +
      '<div class="kpi"><div class="l">Spent</div><div class="v">' + inr(st.spent) + '</div><div class="h">everything in Spend</div></div>' +
      '<div class="kpi"><div class="l">Cash profit</div><div class="v ' + (st.net < 0 ? 'neg' : 'pos') + '">' + inr(st.net) + '</div><div class="h">sales − spent</div></div>' +
      '<div class="kpi"><div class="l">To collect</div><div class="v ' + (st.unpaid ? 'neg' : '') + '">' + inr(st.unpaid) + '</div><div class="h">unpaid orders</div></div></div>';
    h += '<div class="note" style="margin-top:12px">Gross profit shows how well your dishes are priced. Cash profit is what is left after every rupee spent, including rent, gas and salaries.</div>';
    const chart = barChart(st.byDay);
    if (chart) h += '<div class="section"><h2>Day by day</h2></div><div class="card">' + chart + '</div>';
    const cats = Object.keys(st.byCat).sort((a, b) => st.byCat[b] - st.byCat[a]);
    if (cats.length) { const mx = st.byCat[cats[0]]; h += '<div class="section"><h2>Where the money went</h2></div><div class="card">' + cats.map((c) => '<div class="hbar"><span class="lbl">' + esc(c) + '</span><div class="track"><div class="fill" style="width:' + Math.max(3, (st.byCat[c] / mx) * 100) + '%"></div></div><b>' + inr(st.byCat[c]) + '</b></div>').join('') + '</div>'; }
    if (st.topDishes.length) h += '<div class="section"><h2>Best sellers</h2></div><div class="card"><table class="t"><thead><tr><th>Dish</th><th class="n">Plates</th><th class="n">Sales</th></tr></thead><tbody>' + st.topDishes.slice(0, 10).map((d) => '<tr><td>' + esc(d.name) + '</td><td class="n">' + d.qty + '</td><td class="n">' + inr(d.sales) + '</td></tr>').join('') + '</tbody></table></div>';
    const dishes = S.list('dishes').filter((d) => d.active !== false && num(d.price) > 0);
    if (dishes.length) h += '<div class="section"><h2>Dish margins</h2><button class="link" data-act="go:menu">Menu</button></div><div class="card"><table class="t"><thead><tr><th>Dish</th><th class="n">Price</th><th class="n">Cost</th><th class="n">Margin</th></tr></thead><tbody>' +
      dishes.map((d) => { const c = C.dishCost(d), p = num(d.price), pct = p ? Math.round(((p - c) / p) * 100) : 0; return { d, c, p, pct }; }).sort((a, b) => a.pct - b.pct)
        .map((x) => '<tr><td>' + esc(x.d.name) + '</td><td class="n">' + inr(x.p) + '</td><td class="n">' + inr(x.c) + '</td><td class="n ' + marginCls(x.pct) + '">' + x.pct + '%</td></tr>').join('') + '</tbody></table></div>';
    h += '<div class="section"><h2>Export</h2></div><div class="btns"><button class="btn small alt" data-act="csv:orders">Orders (CSV)</button><button class="btn small alt" data-act="csv:expenses">Expenses (CSV)</button></div>';
    setTimeout(() => {
      const rf = $('#rf'), rt = $('#rt');
      if (rf) rf.addEventListener('change', () => { ui.from = rf.value; render(); });
      if (rt) rt.addEventListener('change', () => { ui.to = rt.value; render(); });
    });
    return h;
  };
  acts.period = (k) => { ui.period = k; render(); };
  acts.csv = (t) => {
    const [from, to] = periodRange(); const st = C.stats(from, to);
    const rows = t === 'orders' ? st.orders.map((o) => C.viewOf('orders', o)) : st.expenses.map((e) => C.viewOf('expenses', e));
    if (!rows.length) { toast('Nothing to export for these dates'); return; }
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"').join(','))).join('\n');
    download(t + '-' + from + '-to-' + to + '.csv', '﻿' + csv, 'text/csv');
  };
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ================= CUSTOMERS =================
  views.customers = () => {
    const list = C.customers();
    let h = '<div class="screen-title"><h1>Customers</h1></div>';
    if (!list.length) return h + '<div class="empty"><p>Customers appear here once you save orders with a name or phone number.</p></div>';
    return h + '<div class="list">' + list.map((c) => '<div class="rowc"><div class="grow"><div class="t">' + esc(c.name || c.phone) + '</div><div class="m">' + c.orders + ' order' + (c.orders === 1 ? '' : 's') + ' · ' + inr(c.spent) + ' · last ' + niceDay(c.last) + '</div></div>' +
      (c.phone ? '<a class="btn small alt" href="tel:' + esc(c.phone.replace(/\s/g, '')) + '">Call</a>' : '') + '</div>').join('') + '</div>';
  };

  // ================= SETTINGS =================
  views.settings = () => {
    const m = S.meta; const pending = S.dirtyRecords().length;
    let status = 'This phone only. Connect a Google Sheet to share data with other phones.';
    if (A.syncConfigured()) status = m.lastSyncError ? 'Last sync failed: ' + m.lastSyncError : m.lastSyncAt ? 'Last synced ' + new Date(m.lastSyncAt).toLocaleString('en-IN') + (pending ? ' · ' + pending + ' changes waiting' : '') : 'Not synced yet.';
    const hasData = C.TABLES.some((t) => S.list(t).length);
    return '<div class="screen-title"><h1>Settings</h1></div><form id="setf">' +
      '<div class="section" style="margin-top:0"><h2>Kitchen</h2></div>' +
      field('Kitchen name', '<input class="in" name="kitchenName" value="' + esc(m.kitchenName || 'Chatruya Kitchens') + '">', 'Shown on top and on WhatsApp bills.') +
      field('Kitchen WhatsApp number', '<input class="in" name="kitchenPhone" type="tel" value="' + esc((S.get('config', 'kitchen') || {}).phone || '') + '" placeholder="98765 43210">', 'Printed on PDF bills and menu posters. Shared with every phone.') +
      field('Your name on this phone', '<input class="in" name="userName" value="' + esc(m.userName || '') + '" placeholder="Priya">', 'Saved with each order and expense so you know who entered it.') +
      '<div class="section"><h2>Share between phones</h2></div>' +
      '<div class="note">' + esc(status) + '</div>' +
      field('Sync link', '<input class="in" name="syncUrl" type="url" value="' + esc(m.syncUrl || '') + '" placeholder="https://script.google.com/macros/s/…/exec">', 'The web app link from your Google Sheet. See the setup guide.') +
      field('Sync key', '<input class="in" name="syncKey" type="password" value="' + esc(m.syncKey || '') + '" autocomplete="off">', 'Same secret word on every phone.') +
      '<div class="btns" style="margin-bottom:8px"><button class="btn" data-act="saveSettings">Save settings</button>' + (A.syncConfigured() ? '<button class="btn alt" data-act="syncNow">Sync now</button>' : '') + '</div>' +
      '<div class="section"><h2>Backup</h2></div><p class="sub" style="margin-top:0">Keep a copy of everything on this phone as a file. Good to do every week, even with sync on.</p>' +
      '<div class="btns"><button class="btn small alt" data-act="backup">Download backup</button><label class="btn small alt" style="cursor:pointer">Restore from file<input type="file" id="restoreFile" accept=".json,application/json" hidden></label></div>' +
      (!hasData && !A.syncConfigured() ? '<div class="section"><h2>Try it out</h2></div><p class="sub" style="margin-top:0">Fill the app with a sample menu, stock and 10 days of orders so you can explore.</p><button class="btn small alt" data-act="demo">Load sample data</button>' : '') +
      '<div class="section"><h2>Start fresh</h2></div><p class="sub" style="margin-top:0">Removes everything stored on this phone. Data already in the Google Sheet stays there and comes back on next sync.</p>' +
      '<button class="btn small danger" data-act="erase">Erase this phone’s data</button>' +
      '<p class="sub" style="margin-top:24px">Version 1.6 · device ' + esc(m.device || '') + ' · stored in ' + esc(S.adapter.kind) + '</p></form>';
  };
  acts.saveSettings = async (arg, el) => {
    const f = $('#setf');
    await S.setMeta('kitchenName', val(f, 'kitchenName').trim() || 'Chatruya Kitchens');
    const kc = S.get('config', 'kitchen') || {}; const kName = S.meta.kitchenName, kPhone = val(f, 'kitchenPhone').trim();
    if (kc.name !== kName || (kc.phone || '') !== kPhone) await S.put('config', { ...kc, id: 'kitchen', name: kName, phone: kPhone });
    await S.setMeta('userName', val(f, 'userName').trim());
    const url = val(f, 'syncUrl').trim(), key = val(f, 'syncKey').trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { toast('The sync link should start with https://script.google.com/'); return; }
    const changed = url !== (S.meta.syncUrl || '') || key !== (S.meta.syncKey || '');
    await S.setMeta('syncUrl', url); await S.setMeta('syncKey', key);
    if (changed) { await S.setMeta('lastServerTs', 0); await S.setMeta('lastSyncError', ''); await S.setMeta('lastSyncAt', 0); await markAllDirty(); }
    toast('Settings saved'); render();
    if (A.syncConfigured()) { await A.runSync(true); render(); }
  };
  async function markAllDirty() {
    // after connecting a new sheet, send everything this phone has
    const all = C.TABLES.flatMap((t) => S.raw(t)); all.forEach((r) => { r._d = 1; });
    if (all.length) await S.adapter.putRecords(all);
  }
  acts.syncNow = async () => { await A.runSync(true); render(); };
  acts.backup = () => {
    const recs = C.TABLES.flatMap((t) => S.raw(t)).map((r) => { const c = { ...r }; delete c._d; return c; });
    download('chatruya-backup-' + today() + '.json', JSON.stringify({ app: 'chatruya-kitchens', version: 1, exportedAt: new Date().toISOString(), records: recs }), 'application/json');
    toast('Backup downloaded');
  };
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'restoreFile' || !e.target.files[0]) return;
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!data || !Array.isArray(data.records)) throw new Error('This is not a Chatruya backup file');
      const n = await S.importRecords(data.records, true);
      toast(n + ' records restored'); A.scheduleSync(500); render();
    } catch (err) { toast(err.message); }
  });
  acts.erase = async () => {
    if (!confirmAsk('Erase all data on this phone?')) return;
    if (S.dirtyRecords().length && A.syncConfigured() && !confirmAsk(S.dirtyRecords().length + ' changes have not synced yet and will be lost. Erase anyway?')) return;
    await S.eraseAll(); toast('This phone is empty now'); location.hash = '#today'; render();
  };

  // ================= SAMPLE DATA =================
  acts.demo = async () => {
    if (C.TABLES.some((t) => S.list(t).length) && !confirmAsk('Add sample data to what you already have?')) return;
    toast('Loading sample data…');
    const t = today(); const start = C.addDays(t, -9);
    const items = [
      ['Basmati rice', 'kg', 110, 25, 5], ['Chicken', 'kg', 240, 9, 3], ['Paneer', 'kg', 380, 2.2, 1], ['Onion', 'kg', 40, 15, 4],
      ['Tomato', 'kg', 30, 10, 3], ['Toor dal', 'kg', 140, 6, 1.5], ['Wheat atta', 'kg', 48, 10, 3], ['Cooking oil', 'L', 150, 10, 2],
      ['Ghee', 'kg', 600, 2, 0.5], ['Curd', 'kg', 70, 16, 2], ['Masala & spices', 'kg', 500, 2, 0.4], ['Gongura leaves', 'bunch', 10, 40, 6], ['Takeaway box', 'pcs', 7, 300, 60]
    ];
    const id = {};
    for (const [name, unit, cost, opening, min] of items) {
      const it = await S.put('items', { name, unit, cost, min });
      id[name] = it.id;
      await S.put('stock', { type: 'opening', itemId: it.id, qty: opening, cost: r2(opening * cost), date: start, note: 'Starting stock' });
    }
    const R = (pairs) => pairs.map(([n, q]) => ({ itemId: id[n], qty: q }));
    const dishes = [
      ['Chicken dum biryani', 'Biryani', 249, 5, R([['Basmati rice', 0.15], ['Chicken', 0.2], ['Onion', 0.08], ['Cooking oil', 0.02], ['Ghee', 0.01], ['Curd', 0.03], ['Masala & spices', 0.01], ['Takeaway box', 1]])],
      ['Veg biryani', 'Biryani', 179, 5, R([['Basmati rice', 0.15], ['Onion', 0.08], ['Tomato', 0.05], ['Cooking oil', 0.02], ['Ghee', 0.01], ['Curd', 0.03], ['Masala & spices', 0.01], ['Takeaway box', 1]])],
      ['Gongura chicken', 'Curries', 229, 3, R([['Chicken', 0.2], ['Gongura leaves', 1], ['Onion', 0.05], ['Cooking oil', 0.03], ['Masala & spices', 0.01], ['Takeaway box', 1]])],
      ['Paneer butter masala', 'Curries', 199, 3, R([['Paneer', 0.15], ['Onion', 0.06], ['Tomato', 0.1], ['Cooking oil', 0.02], ['Ghee', 0.01], ['Masala & spices', 0.008], ['Curd', 0.03], ['Takeaway box', 1]])],
      ['Dal tadka', 'Curries', 129, 2, R([['Toor dal', 0.08], ['Onion', 0.03], ['Tomato', 0.05], ['Cooking oil', 0.015], ['Ghee', 0.005], ['Masala & spices', 0.005], ['Takeaway box', 1]])],
      ['Chapati (2 pcs)', 'Breads', 40, 2, R([['Wheat atta', 0.1], ['Cooking oil', 0.005]])],
      ['Curd rice', 'Rice', 99, 2, R([['Basmati rice', 0.1], ['Curd', 0.15], ['Takeaway box', 1]])],
      ['Veg meals', 'Meals', 169, 10, R([['Basmati rice', 0.15], ['Toor dal', 0.05], ['Tomato', 0.05], ['Onion', 0.03], ['Curd', 0.1], ['Cooking oil', 0.02], ['Masala & spices', 0.005], ['Takeaway box', 2]])]
    ];
    const dishRecs = [];
    for (const [name, category, price, extraCost, recipe] of dishes) dishRecs.push(await S.put('dishes', { name, category, price, extraCost, recipe, active: true }));
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const people = [['Lakshmi', '98480 11223', 'Flat 302, Sai Residency'], ['Ravi Kumar', '99890 44556', 'Plot 18, Kondapur'], ['Anitha', '90000 77889', 'Gachibowli, near DLF gate'], ['Suresh', '97010 22334', 'Madhapur, Ayyappa Society'], ['Meena', '93910 55667', 'Walk-in'], ['Kiran', '88860 99001', 'Office, Hitech City']];
    for (let i = 0; i <= 10; i++) {
      const day = C.addDays(start, i); const n = 4 + Math.floor(rnd() * 5); const future = day > t;
      for (let j = 0; j < n; j++) {
        const p = people[Math.floor(rnd() * people.length)];
        const lines = []; const k = 1 + Math.floor(rnd() * 3);
        for (let x = 0; x < k; x++) { const d = dishRecs[Math.floor(rnd() * dishRecs.length)]; const ex = lines.find((l) => l.dishId === d.id); if (ex) ex.qty++; else lines.push({ dishId: d.id, name: d.name, qty: 1 + Math.floor(rnd() * 2), price: d.price }); }
        const delivery = p[2] === 'Walk-in' ? 0 : 30; const t2 = C.orderTotals(lines, 0, delivery); const snap = C.orderSnapshot(lines);
        const hr = 12 + Math.floor((j / n) * 9); const isToday = day === t;
        const status = future ? 'New' : isToday ? ['Delivered', 'Delivered', 'Ready', 'Preparing', 'New', 'New', 'New', 'New'][j] || 'New' : 'Delivered';
        const slot = hr < 15 ? 'Lunch' : 'Dinner'; const taken = future ? t : day;
        await S.put('orders', { items: lines, discount: 0, delivery, subtotal: t2.subtotal, total: t2.total, cost: snap.cost, consumption: snap.consumption, customer: p[0], phone: p[1], address: p[2], channel: p[2] === 'Walk-in' ? 'Walk-in' : rnd() > 0.3 ? 'WhatsApp' : 'Phone call', payMode: rnd() > 0.35 ? 'UPI' : 'Cash', paid: future ? false : !isToday || status === 'Delivered' ? rnd() > 0.08 : false, status, deliveryDate: day, slot, date: taken + 'T' + String(future ? 9 + j : Math.max(7, hr - 3)).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0'), notes: rnd() > 0.85 ? ['Less spicy please', 'No onion in raita', 'Extra gravy', 'Pack chutney separately'][Math.floor(rnd() * 4)] : '' });
      }
      if (future) continue;
      await S.put('expenses', { date: day, category: 'Vegetables', amount: 180 + Math.round(rnd() * 200), payMode: 'UPI', note: 'Daily vegetables' });
      if (i % 3 === 0) await S.put('expenses', { date: day, category: 'Delivery', amount: 300, payMode: 'Cash', note: 'Petrol for deliveries' });
    }
    const lastMonth = C.monthStart(C.addDays(C.monthStart(t), -1));
    await S.put('expenses', { date: lastMonth, category: 'Rent', amount: 6000, payMode: 'Bank transfer', note: 'Kitchen rent' });
    await S.put('expenses', { date: lastMonth, category: 'Salaries', amount: 9000, payMode: 'Bank transfer', note: 'Helper salary' });
    await S.put('expenses', { date: C.addDays(t, -4), category: 'Gas', amount: 1850, payMode: 'UPI', note: 'Commercial cylinder' });
    const pc = await S.put('expenses', { date: C.addDays(t, -2), category: 'Groceries', amount: 1250, payMode: 'UPI', note: 'Chicken 5 kg from Hyderabad Chicken Centre' });
    const mv = await S.put('stock', { type: 'purchase', itemId: id['Chicken'], qty: 5, cost: 1250, date: C.addDays(t, -2), vendor: 'Hyderabad Chicken Centre', expenseId: pc.id });
    await S.put('expenses', { ...S.get('expenses', pc.id), stockId: mv.id });
    toast('Sample data loaded'); location.hash = '#today'; render();
  };

  // ---------- start ----------
  async function start() {
    let adapter;
    try { adapter = C.idbAdapter(); await adapter.loadAll(); } catch (e) { console.warn('IndexedDB unavailable, using memory', e); adapter = C.memoryAdapter(); }
    await S.init(adapter);
    S.on((kind) => { if (kind === 'change') { render(); A.scheduleSync(); } else A.badge(); });
    render();
    A.scheduleSync(800);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', () => {
      // a new version was just installed: reload now unless someone is in the middle of a form
      if (!A.sheetOpen()) location.reload(); else toast('App updated. Close and reopen it to see the new version.');
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  document.addEventListener('submit', (e) => e.preventDefault()); // Enter in a field must not reload the app
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button') { e.preventDefault(); e.target.click(); } });
  start();
})();
