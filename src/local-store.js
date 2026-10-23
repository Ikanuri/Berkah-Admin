// BACKEND LOKAL untuk dev dan tes (?dev=boss|worker|pending). Meniru kontrak
// tgcloud/endpoints/* di memori + localStorage, memakai aturan murni yang SAMA
// (tgcloud/lib/rules.js, money.js, shape.js).
//
// PERINGATAN: ini salinan manual dari logika endpoint. Kalau endpoint berubah,
// file ini harus ikut diubah. Bukan sumber kebenaran dan bukan fallback produksi.
import { makeId } from '../tgcloud/lib/id.js';
import { UNITS } from '../tgcloud/lib/units.js';
import { shapeItemFor, canSeeSuppliers } from '../tgcloud/lib/shape.js';
import { round } from '../tgcloud/lib/money.js';
import {
  parseLine, normName, mergeAddLine, toggle, adjustQty, setQty, fulfill,
  applySupplierPrice, canDeleteCategory, bulkMargin,
} from '../tgcloud/lib/rules.js';
import { latestActivity, visibleActivity } from '../tgcloud/lib/activity.js';
import { makeBackup, parseBackup, planRestore, applyPlan } from '../tgcloud/lib/backup.js';

const KEY = 'berkah-dev-db';
const ME = 1;

function fail(msg) { throw new Error(msg); }

export class LocalStore {
  constructor(role, storage = globalThis.localStorage) {
    this.storage = storage;
    this.role = role;
    this.db = this.load();
    const now = Date.now();
    this.db.users = this.db.users.filter((u) => u.tgId !== ME);
    this.db.users.push({ tgId: ME, name: 'Anda (dev)', username: null, role, createdAt: now, updatedAt: now });
    this.save();
  }

  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* abaikan */ }
    const now = Date.now();
    return {
      categories: [], items: [], suppliers: [], priceLog: [], activity: [], seq: { cat: 0, sup: 0 },
      users: [
        { tgId: 2, name: 'Siti (karyawan)', username: 'siti', role: 'worker', createdAt: now, updatedAt: now },
        { tgId: 3, name: 'Budi (menunggu)', username: null, role: 'pending', createdAt: now, updatedAt: now },
      ],
    };
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.db)); } catch { /* abaikan */ }
  }

  need(...roles) {
    if (!roles.includes(this.role)) fail('Tidak punya akses');
  }

  log(action, detail) { this.db.activity.push({ ts: Date.now(), tgId: ME, action, detail }); }

  item(id) {
    const it = this.db.items.find((i) => i.id === id && !i.deletedAt);
    if (!it) fail('Barang tidak ditemukan');
    return it;
  }
  category(id) {
    const c = this.db.categories.find((x) => x.id === id && !x.deletedAt);
    if (!c) fail('Kategori tidak ditemukan');
    return c;
  }
  supplier(id) {
    const s = this.db.suppliers.find((x) => x.id === id && !x.deletedAt);
    if (!s) fail('Supplier tidak ditemukan');
    return s;
  }

  async call(name, input = {}) {
    const fn = this['ep_' + name];
    if (!fn) fail('Endpoint tidak dikenal: ' + name);
    const out = await fn.call(this, input || {});
    this.save();
    return JSON.parse(JSON.stringify(out ?? null));
  }

  ep_me() {
    const u = this.db.users.find((x) => x.tgId === ME);
    return { tgId: u.tgId, name: u.name, role: u.role };
  }

  ep_getChanges({ since }) {
    this.need('boss', 'worker');
    const s = Number(since) || 0;
    const out = {
      serverTime: Date.now(),
      categories: this.db.categories.filter((r) => r.updatedAt > s),
      items: this.db.items.filter((r) => r.updatedAt > s).map((r) => shapeItemFor(this.role, r)),
    };
    if (canSeeSuppliers(this.role)) {
      out.suppliers = this.db.suppliers.filter((r) => r.updatedAt > s);
      out.priceLog = this.db.priceLog.filter((r) => r.updatedAt > s);
    }
    const recent = this.db.activity.slice(-30).reverse();
    const last = latestActivity(visibleActivity(this.role, recent));
    if (last) {
      const who = this.db.users.find((x) => x.tgId === last.tgId);
      out.lastAct = { ts: last.ts, desc: last.desc, by: who ? who.name : null };
    }
    return out;
  }

  ep_addItems({ categoryId, text }) {
    this.need('boss', 'worker');
    const cat = this.category(categoryId);
    const lines = String(text ?? '').split('\n').map(parseLine).filter(Boolean);
    if (!lines.length) fail('Tidak ada baris valid');
    const existing = this.db.items.filter((i) => i.categoryId === cat.id && !i.deletedAt);
    const byName = new Map(existing.map((i) => [normName(i.name), i]));
    let next = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
    const now = Date.now();
    let added = 0, updated = 0;
    for (const line of lines) {
      const key = normName(line.name);
      const m = mergeAddLine(byName.get(key), line, this.role === 'boss', now);
      if (m.kind === 'new') {
        const row = {
          id: makeId(), categoryId: cat.id, name: line.name, qty: line.qty, unit: line.unit,
          checked: false, checkedAt: null, sortOrder: next++, isi: null, satuanHpp: null,
          hargaBeli: null, hargaJual: null, updatedAt: now, deletedAt: null,
        };
        this.db.items.push(row);
        byName.set(key, row);
        added++;
      } else {
        Object.assign(byName.get(key), m.patch, { updatedAt: now });
        updated++;
      }
    }
    this.log('addItems', { category: cat.name, added, updated });
    return { added, updated };
  }

  ep_updateItem(input) {
    this.need('boss', 'worker');
    const it = this.item(input.id);
    const patch = {};
    if (typeof input.name === 'string') {
      const n = input.name.trim();
      if (!n) fail('Nama kosong');
      patch.name = n;
    }
    if (input.qty != null) {
      const q = setQty(input.qty);
      if (q == null) fail('Qty harus lebih dari 0');
      patch.qty = q;
    } else if (input.delta != null) {
      patch.qty = adjustQty(it.qty, Number(input.delta));
    }
    if (input.unit != null) {
      if (!UNITS.includes(input.unit)) fail('Satuan tidak dikenal');
      patch.unit = input.unit;
    }
    this.log('updateItem', { id: it.id, name: it.name, unit: patch.unit ?? it.unit, patch });
    Object.assign(it, patch, { updatedAt: Date.now() });
    return { ok: true, ...patch };
  }

  ep_toggleItem({ id }) {
    this.need('boss', 'worker');
    const it = this.item(id);
    const now = Date.now();
    const { patch } = toggle(it, now);
    this.log(patch.checked ? 'check' : 'uncheck', { id: it.id, name: it.name, qty: it.qty, unit: it.unit });
    Object.assign(it, patch, { updatedAt: now });
    return { ok: true, ...patch };
  }

  ep_fulfillItem({ id, received }) {
    this.need('boss', 'worker');
    const it = this.item(id);
    const now = Date.now();
    const r = fulfill(it, received, now);
    if (!r) fail('Jumlah diterima harus lebih dari 0');
    this.log('fulfill', { id: it.id, name: it.name, received: Number(received), status: r.status });
    Object.assign(it, r.patch, { updatedAt: now });
    return { ok: true, status: r.status, ...r.patch };
  }

  ep_deleteItem({ id }) {
    this.need('boss', 'worker');
    const it = this.item(id);
    const now = Date.now();
    this.log('deleteItem', { id: it.id, name: it.name });
    Object.assign(it, { deletedAt: now, updatedAt: now });
    return { ok: true };
  }

  ep_reorderItems({ categoryId, ids }) {
    this.need('boss', 'worker');
    const now = Date.now();
    (ids || []).forEach((id, i) => {
      const it = this.item(id);
      if (it.categoryId === categoryId) Object.assign(it, { sortOrder: i + 1, updatedAt: now });
    });
    return { ok: true };
  }

  ep_saveCategory({ id, name, excludeFromOrder }) {
    this.need('boss', 'worker');
    const all = this.db.categories.filter((c) => !c.deletedAt);
    const n = typeof name === 'string' ? name.trim() : null;
    if (n != null && !n) fail('Nama kategori kosong');
    if (n != null && all.some((c) => c.id !== id && normName(c.name) === normName(n))) fail('Kategori sudah ada');
    const now = Date.now();
    if (id == null) {
      if (!n) fail('Nama kategori kosong');
      const order = all.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
      this.db.categories.push({
        id: ++this.db.seq.cat, name: n, sortOrder: order, excludeFromOrder: false, updatedAt: now, deletedAt: null,
      });
      return { ok: true };
    }
    const cat = this.category(id);
    if (n != null) cat.name = n;
    if (excludeFromOrder != null) {
      if (this.role !== 'boss') fail('Hanya Bos yang boleh mengubah filter order');
      cat.excludeFromOrder = !!excludeFromOrder;
    }
    cat.updatedAt = now;
    return { ok: true };
  }

  ep_deleteCategory({ id }) {
    this.need('boss');
    const cat = this.category(id);
    if (!canDeleteCategory(this.db.categories.filter((c) => !c.deletedAt).length)) fail('Minimal 1 kategori!');
    const now = Date.now();
    this.db.items.filter((i) => i.categoryId === cat.id && !i.deletedAt)
      .forEach((i) => Object.assign(i, { deletedAt: now, updatedAt: now }));
    this.log('deleteCategory', { id: cat.id, name: cat.name });
    Object.assign(cat, { deletedAt: now, updatedAt: now });
    return { ok: true };
  }

  ep_reorderCategories({ ids }) {
    this.need('boss');
    const now = Date.now();
    (ids || []).forEach((id, i) => Object.assign(this.category(id), { sortOrder: i + 1, updatedAt: now }));
    return { ok: true };
  }

  ep_setChecked({ categoryId, checked }) {
    const target = !!checked;
    const allCats = categoryId == null;
    this.need(...(allCats && target ? ['boss', 'worker'] : ['boss']));
    const cat = allCats ? null : this.category(categoryId);
    const now = Date.now();
    let n = 0;
    for (const it of this.db.items) {
      if (it.deletedAt || (cat && it.categoryId !== cat.id) || it.checked === target) continue;
      Object.assign(it, { checked: target, checkedAt: target ? now : null, updatedAt: now });
      n++;
    }
    if (n) this.log(target ? 'checkAll' : 'uncheckAll', { category: cat ? cat.name : null, n });
    return { changed: n };
  }

  ep_clearItems({ categoryId } = {}) {
    this.need('boss');
    const cat = categoryId == null ? null : this.category(categoryId);
    const now = Date.now();
    const rows = this.db.items.filter((i) => !i.deletedAt && (!cat || i.categoryId === cat.id));
    rows.forEach((i) => Object.assign(i, { deletedAt: now, updatedAt: now }));
    this.log('clearItems', { category: cat ? cat.name : null, n: rows.length });
    return { deleted: rows.length };
  }

  ep_setHpp(input) {
    this.need('boss');
    const it = this.item(input.id);
    const patch = {};
    for (const f of ['isi', 'hargaBeli', 'hargaJual']) {
      if (f in input) {
        const v = input[f] == null || input[f] === '' ? null : round(Number(input[f]), 6);
        if (v != null && !(v > 0)) fail('Nilai harus lebih dari 0');
        patch[f] = v;
      }
    }
    if ('satuanHpp' in input) patch.satuanHpp = input.satuanHpp || null;
    Object.assign(it, patch, { updatedAt: Date.now() });
    return { ok: true };
  }

  ep_applyMargin({ categoryId, mode, value }) {
    this.need('boss');
    const v = Number(value);
    if (!isFinite(v)) fail('Nilai margin tidak valid');
    if (categoryId != null) this.category(categoryId);
    const rows = this.db.items.filter((i) => !i.deletedAt && (categoryId == null || i.categoryId === categoryId));
    const { updates, skipped, invalid } = bulkMargin(rows, { mode: mode === 'pct' ? 'pct' : 'rp', value: v });
    const now = Date.now();
    for (const up of updates) Object.assign(this.db.items.find((i) => i.id === up.id), { hargaJual: up.hargaJual, updatedAt: now });
    this.log('applyMargin', { mode: mode === 'pct' ? 'pct' : 'rp', value: v, categoryId: categoryId ?? null, updated: updates.length, skipped, invalid });
    return { updated: updates.length, skipped, invalid };
  }

  // ── backup & restore (logika murni sama dengan server: lib/backup.js) ──
  ep_exportBackup() {
    this.need('boss');
    const d = this.db;
    const data = makeBackup({
      categories: d.categories.filter((c) => !c.deletedAt), items: d.items.filter((i) => !i.deletedAt),
      suppliers: d.suppliers, priceLog: d.priceLog.filter((e) => !e.deletedAt),
    });
    const counts = { categories: data.tables.categories.length, items: data.tables.items.length, suppliers: data.tables.suppliers.length, priceLog: data.tables.priceLog.length };
    return { sent: false, filename: 'berkah-dev.json', counts, data };
  }

  restorePlan({ data, onConflict }) {
    this.need('boss');
    let parsed;
    try { parsed = parseBackup(data); } catch (e) { fail(e.message); }
    const d = this.db;
    const mode = onConflict === 'overwrite' ? 'overwrite' : 'keep';
    const plan = planRestore({
      categories: d.categories, suppliers: d.suppliers, items: d.items, priceLogIds: d.priceLog.map((e) => e.id),
    }, parsed.incoming, { onConflict: mode });
    return { parsed, plan, mode };
  }

  ep_restorePreview(input) {
    const { parsed, plan, mode } = this.restorePlan(input);
    return { format: parsed.format, warnings: parsed.warnings, onConflict: mode, counts: plan.counts };
  }

  async ep_restoreApply(input) {
    const { parsed, plan, mode } = this.restorePlan(input);
    const d = this.db;
    const now = Date.now();
    await applyPlan(plan, {
      insertCategory: async (c) => { const id = ++d.seq.cat; d.categories.push({ id, name: c.name, sortOrder: c.sortOrder, excludeFromOrder: !!c.excludeFromOrder, updatedAt: now, deletedAt: null }); return id; },
      reviveCategory: async (id) => Object.assign(d.categories.find((c) => c.id === id), { deletedAt: null, updatedAt: now }),
      insertSupplier: async (s) => { const id = ++d.seq.sup; d.suppliers.push({ id, name: s.name, updatedAt: now, deletedAt: s.deleted ? now : null }); return id; },
      reviveSupplier: async (id) => Object.assign(d.suppliers.find((x) => x.id === id), { deletedAt: null, updatedAt: now }),
      insertItems: async (rows) => rows.forEach((r) => d.items.push({ ...r, checkedAt: r.checked ? (r.checkedAt ?? now) : null, updatedAt: now, deletedAt: null })),
      updateItem: async (id, patch) => Object.assign(d.items.find((i) => i.id === id), patch, { updatedAt: now }),
      insertLogs: async (rows) => rows.forEach((r) => d.priceLog.push({ ...r, createdBy: null, updatedAt: now, deletedAt: null })),
    });
    this.log('restore', { format: parsed.format, onConflict: mode, counts: plan.counts });
    return { format: parsed.format, warnings: parsed.warnings, onConflict: mode, counts: plan.counts };
  }

  ep_saveSupplier({ id, name }) {
    this.need('boss');
    const n = String(name ?? '').trim();
    if (!n) fail('Nama supplier kosong');
    const live = this.db.suppliers.filter((s) => !s.deletedAt);
    if (live.some((s) => s.id !== id && s.name === n)) fail('Supplier sudah ada!');
    const now = Date.now();
    if (id == null) {
      const dead = this.db.suppliers.find((s) => s.name === n);
      if (dead) Object.assign(dead, { deletedAt: null, updatedAt: now });
      else this.db.suppliers.push({ id: ++this.db.seq.sup, name: n, updatedAt: now, deletedAt: null });
      return { ok: true };
    }
    Object.assign(this.supplier(id), { name: n, updatedAt: now });
    return { ok: true };
  }

  ep_deleteSupplier({ id }) {
    this.need('boss');
    const now = Date.now();
    Object.assign(this.supplier(id), { deletedAt: now, updatedAt: now });
    return { ok: true };
  }

  ep_savePrices({ supplierId, tanggal, prices }) {
    this.need('boss');
    const sup = this.supplier(supplierId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal ?? ''))) fail('Tanggal tidak valid');
    const now = Date.now();
    let n = 0;
    for (const p of prices || []) {
      const it = this.item(p.itemId);
      const r = applySupplierPrice(it, p.hargaBeli);
      if (!r) continue;
      this.db.priceLog.push({
        id: makeId(), itemId: it.id, supplierId: sup.id, tanggal, hargaBeli: Number(p.hargaBeli),
        unit: r.unit, ts: now, createdBy: ME, updatedAt: now, deletedAt: null,
      });
      Object.assign(it, r.patch, { updatedAt: now });
      n++;
    }
    this.log('savePrices', { supplier: sup.name, tanggal, n });
    return { saved: n };
  }

  ep_deletePriceEntry({ id }) {
    this.need('boss');
    const e = this.db.priceLog.find((x) => x.id === id && !x.deletedAt);
    if (!e) fail('Entri tidak ditemukan');
    const now = Date.now();
    Object.assign(e, { deletedAt: now, updatedAt: now });
    return { ok: true };
  }

  ep_listUsers() {
    this.need('boss');
    return this.db.users;
  }

  ep_setUserRole({ tgId, role }) {
    this.need('boss');
    if (!['boss', 'worker', 'pending'].includes(role)) fail('Peran tidak valid');
    const u = this.db.users.find((x) => x.tgId === tgId);
    if (u) { u.role = role; u.updatedAt = Date.now(); }
    return { ok: true };
  }
}
