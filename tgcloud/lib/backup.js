// Backup & restore (murni, tanpa DB). Dipakai endpoint server DAN LocalStore.
//
// Tiga tahap, masing-masing bisa diuji sendiri:
//   parseBackup(json)            -> { format, incoming, warnings }   (validasi + normalisasi)
//   planRestore(existing, incoming, opts) -> rencana + hitungan untuk preview
//   applyPlan(plan, io)          -> menulis lewat antarmuka `io` (server / LocalStore)
//
// Kebijakan merge (keputusan pemilik): restore TIDAK menimpa senyap.
//   - onConflict 'keep' (bawaan): data yang sudah ada dipertahankan, hanya yang baru ditambah.
//   - onConflict 'overwrite': barang yang sama (id atau nama di kategori yang sama) ditimpa isi backup.
//   - Riwayat harga (ledger) selalu union per id, tidak pernah dihapus/ditimpa.
import { UNITS } from './units.js';
import { normName } from './rules.js';
import { makeId } from './id.js';

export const OWN_APP = 'berkah-mini';
export const BACKUP_VERSION = 1;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS_SET = new Set(UNITS);

const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ── Pembuat backup (format sendiri) ─────────────────────────────────────────
export function makeBackup({ categories, items, suppliers, priceLog }, now = Date.now()) {
  return {
    app: OWN_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    tables: { categories, items, suppliers, priceLog },
  };
}

// ── Sanitasi per baris ──────────────────────────────────────────────────────
function cleanItem(raw, ctx) {
  const name = str(raw.name);
  if (!name) { ctx.invalid.items++; return null; }
  let unit = raw.unit;
  if (!UNITS_SET.has(unit)) { if (unit != null) ctx.warn(`satuan "${unit}" tidak dikenal → dus`); unit = 'dus'; }
  let qty = posNum(raw.qty);
  if (qty == null) { ctx.warn(`qty barang "${name}" tidak valid → 1`); qty = 1; }
  const checked = !!raw.checked;
  let id = str(raw.id);
  if (!id) id = makeId();
  if (ctx.ids.has(id)) { ctx.warn('id barang ganda → dibuat ulang'); id = makeId(); }
  ctx.ids.add(id);
  return {
    id, name, qty, unit, checked,
    checkedAt: checked ? (posNum(raw.checkedAt) ?? null) : null,
    isi: posNum(raw.isi),
    satuanHpp: UNITS_SET.has(raw.satuanHpp) ? raw.satuanHpp : null,
    hargaBeli: posNum(raw.hargaBeli),
    hargaJual: posNum(raw.hargaJual),
  };
}

function cleanLog(raw, ctx) {
  const hargaBeli = posNum(raw.hargaBeli);
  const supplierName = str(raw.supplier ?? raw.supplierName);
  const itemId = str(raw.itemId);
  const tanggal = str(raw.tanggal);
  if (!hargaBeli || !supplierName || !itemId || !DATE_RE.test(tanggal)) { ctx.invalid.priceLog++; return null; }
  const parsed = Date.parse(tanggal);
  return {
    id: str(raw.id) || makeId(), itemId, supplierName, tanggal, hargaBeli,
    unit: UNITS_SET.has(raw.unit) ? raw.unit : null,
    ts: posNum(raw.ts) ?? (Number.isFinite(parsed) ? parsed : Date.now()),
  };
}

function newCtx() {
  const warnings = [];
  return {
    warnings, ids: new Set(), invalid: { items: 0, priceLog: 0 },
    warn: (m) => { if (!warnings.includes(m)) warnings.push(m); },
  };
}

function finish(format, ctx, incoming) {
  if (ctx.invalid.items) ctx.warn(`${ctx.invalid.items} barang tidak valid dilewati`);
  if (ctx.invalid.priceLog) ctx.warn(`${ctx.invalid.priceLog} entri harga tidak valid dilewati`);
  return { format, incoming, warnings: ctx.warnings };
}

// ── Format lama (berkah-aio v1 dan "Backup Stok") ───────────────────────────
function fromLegacyStok(stok, supplierNames, pricelog) {
  const ctx = newCtx();
  const excluded = new Set((Array.isArray(stok.outCatEx) ? stok.outCatEx : []).map(normName));
  const cats = [];
  const seen = new Set();
  for (const c of Array.isArray(stok.cats) ? stok.cats : []) {
    const name = str(c);
    if (name && !seen.has(normName(name))) { seen.add(normName(name)); cats.push(name); }
  }
  const categories = cats.map((name, i) => ({ name, sortOrder: i + 1, excludeFromOrder: excluded.has(normName(name)) }));
  const items = [];
  for (const cat of cats) {
    const arr = Array.isArray(stok.items?.[cat]) ? stok.items[cat] : [];
    arr.forEach((raw, j) => {
      const it = cleanItem(raw || {}, ctx);
      if (it) items.push({ ...it, categoryName: cat, sortOrder: j + 1 });
    });
  }
  const suppliers = [];
  const supSeen = new Set();
  for (const s of Array.isArray(supplierNames) ? supplierNames : []) {
    const name = str(s);
    if (name && !supSeen.has(name)) { supSeen.add(name); suppliers.push({ name, deleted: false }); }
  }
  const priceLog = [];
  for (const raw of Array.isArray(pricelog) ? pricelog : []) {
    const e = cleanLog(raw || {}, ctx);
    if (!e) continue;
    if (!supSeen.has(e.supplierName)) {
      // supplier sudah dihapus di app lama tapi riwayatnya tetap: simpan sebagai supplier terhapus
      supSeen.add(e.supplierName);
      suppliers.push({ name: e.supplierName, deleted: true });
    }
    priceLog.push(e);
  }
  return finish('berkah-aio', ctx, { categories, items, suppliers, priceLog });
}

// ── Format sendiri ──────────────────────────────────────────────────────────
function fromOwn(data) {
  const ctx = newCtx();
  const t = data.tables || {};
  const cats = Array.isArray(t.categories) ? t.categories : [];
  const catName = new Map(cats.map((c) => [c.id, str(c.name)]));
  const categories = cats.filter((c) => str(c.name)).map((c, i) => ({
    name: str(c.name), sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : i + 1, excludeFromOrder: !!c.excludeFromOrder,
  }));
  const items = [];
  for (const raw of Array.isArray(t.items) ? t.items : []) {
    const categoryName = catName.get(raw.categoryId);
    if (!categoryName) { ctx.invalid.items++; continue; }
    const it = cleanItem(raw, ctx);
    if (it) items.push({ ...it, categoryName, sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0 });
  }
  const sups = Array.isArray(t.suppliers) ? t.suppliers : [];
  const supName = new Map(sups.map((s) => [s.id, str(s.name)]));
  const suppliers = sups.filter((s) => str(s.name)).map((s) => ({ name: str(s.name), deleted: !!s.deletedAt }));
  const priceLog = [];
  for (const raw of Array.isArray(t.priceLog) ? t.priceLog : []) {
    const e = cleanLog({ ...raw, supplier: supName.get(raw.supplierId) }, ctx);
    if (e) priceLog.push(e);
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  return finish(OWN_APP, ctx, { categories, items, suppliers, priceLog });
}

export function parseBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File bukan backup yang valid');
  if (data.app === OWN_APP) {
    if (data.version > BACKUP_VERSION) throw new Error('Backup dibuat oleh versi app yang lebih baru');
    return fromOwn(data);
  }
  if (data.app === 'berkah-aio') {
    if (!data.stok?.boss) throw new Error('Backup ini tidak berisi data Stok');
    return fromLegacyStok(data.stok.boss, data.stok.suppliers, data.stok.pricelog);
  }
  if (Array.isArray(data.cats) && data.items && typeof data.items === 'object') {
    return fromLegacyStok(data, data.hppSuppliers, data.hppLog); // "Backup Stok" app lama
  }
  throw new Error('Format backup tidak dikenal');
}

// ── Rencana merge ───────────────────────────────────────────────────────────
// existing: { categories, items, suppliers, priceLogIds:Set|array } (baris mentah, termasuk tombstone)
export function planRestore(existing, incoming, { onConflict = 'keep' } = {}) {
  const overwrite = onConflict === 'overwrite';
  const plan = {
    categories: { add: [], revive: [] },
    suppliers: { add: [], revive: [] },
    items: { add: [], overwrite: [], skip: 0, idMap: {} },
    priceLog: { add: [], dup: 0, orphan: 0 },
  };

  // kategori: dicocokkan lewat NAMA (app lama tidak punya id kategori)
  const catByName = new Map(existing.categories.map((c) => [normName(c.name), c]));
  const maxCatOrder = existing.categories.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0);
  const newCat = new Set();
  incoming.categories.forEach((c) => {
    const key = normName(c.name);
    const cur = catByName.get(key);
    if (!cur) { plan.categories.add.push({ name: c.name, sortOrder: maxCatOrder + plan.categories.add.length + 1, excludeFromOrder: c.excludeFromOrder }); newCat.add(key); }
    else if (cur.deletedAt) plan.categories.revive.push(cur.id);
  });

  // supplier: dicocokkan lewat nama (unik)
  const supByName = new Map(existing.suppliers.map((s) => [normName(s.name), s]));
  incoming.suppliers.forEach((s) => {
    const cur = supByName.get(normName(s.name));
    if (!cur) plan.suppliers.add.push({ name: s.name, deleted: s.deleted });
    else if (cur.deletedAt && !s.deleted) plan.suppliers.revive.push(cur.id);
  });

  // barang: id sama, atau (kategori, nama) sama dengan barang hidup = barang yang sama
  const byId = new Map(existing.items.map((i) => [i.id, i]));
  const liveByCatName = new Map();
  const catIdOf = (name) => catByName.get(normName(name))?.id;
  const maxOrder = new Map();
  for (const i of existing.items) {
    if (i.deletedAt) continue;
    liveByCatName.set(`${i.categoryId}|${normName(i.name)}`, i);
    maxOrder.set(i.categoryId, Math.max(maxOrder.get(i.categoryId) || 0, i.sortOrder || 0));
  }
  const addedPerCat = new Map();
  for (const it of incoming.items) {
    let cur = byId.get(it.id);
    if (!cur) {
      const cid = catIdOf(it.categoryName);
      if (cid != null) cur = liveByCatName.get(`${cid}|${normName(it.name)}`);
    }
    if (cur) {
      plan.items.idMap[it.id] = cur.id;
      if (!overwrite) { plan.items.skip++; continue; }
      plan.items.overwrite.push({
        id: cur.id, categoryName: it.categoryName,
        patch: {
          name: it.name, qty: it.qty, unit: it.unit, checked: it.checked, checkedAt: it.checkedAt,
          isi: it.isi, satuanHpp: it.satuanHpp, hargaBeli: it.hargaBeli, hargaJual: it.hargaJual, deletedAt: null,
        },
      });
    } else {
      const key = normName(it.categoryName);
      const base = catIdOf(it.categoryName) != null ? maxOrder.get(catIdOf(it.categoryName)) || 0 : 0;
      const k = (addedPerCat.get(key) || 0) + 1;
      addedPerCat.set(key, k);
      plan.items.idMap[it.id] = it.id;
      plan.items.add.push({ ...it, sortOrder: base + k });
    }
  }

  // riwayat harga: union per id; yatim (barang tidak ada) dilewati
  const knownLog = new Set(existing.priceLogIds || []);
  const liveOrDeadItem = new Set(existing.items.map((i) => i.id));
  const addedIds = new Set(plan.items.add.map((i) => i.id));
  for (const e of incoming.priceLog) {
    if (knownLog.has(e.id)) { plan.priceLog.dup++; continue; }
    const itemId = plan.items.idMap[e.itemId] ?? (liveOrDeadItem.has(e.itemId) ? e.itemId : null);
    if (!itemId || (!liveOrDeadItem.has(itemId) && !addedIds.has(itemId))) { plan.priceLog.orphan++; continue; }
    knownLog.add(e.id);
    plan.priceLog.add.push({ ...e, itemId });
  }

  plan.counts = {
    categories: { add: plan.categories.add.length, revive: plan.categories.revive.length },
    suppliers: { add: plan.suppliers.add.length, revive: plan.suppliers.revive.length },
    items: { add: plan.items.add.length, overwrite: plan.items.overwrite.length, skip: plan.items.skip },
    priceLog: { add: plan.priceLog.add.length, dup: plan.priceLog.dup, orphan: plan.priceLog.orphan },
  };
  plan.catByName = Object.fromEntries([...catByName].map(([k, c]) => [k, c.id]));
  plan.supByName = Object.fromEntries([...supByName].map(([k, s]) => [k, s.id]));
  return plan;
}

// ── Penerap rencana ─────────────────────────────────────────────────────────
// io (async): insertCategory(row)->id, reviveCategory(id), insertSupplier({name,deleted})->id,
//   reviveSupplier(id), insertItems(rows), updateItem(id, patch), insertLogs(rows)
export async function applyPlan(plan, io) {
  const catId = new Map(Object.entries(plan.catByName));
  const supId = new Map(Object.entries(plan.supByName));
  for (const id of plan.categories.revive) await io.reviveCategory(id);
  for (const c of plan.categories.add) catId.set(normName(c.name), await io.insertCategory(c));
  for (const id of plan.suppliers.revive) await io.reviveSupplier(id);
  for (const s of plan.suppliers.add) supId.set(normName(s.name), await io.insertSupplier(s));

  const resolveCat = (name) => catId.get(normName(name));
  const rows = plan.items.add.map((it) => {
    const { categoryName, ...rest } = it;
    return { ...rest, categoryId: resolveCat(categoryName) };
  });
  if (rows.length) await io.insertItems(rows);
  for (const o of plan.items.overwrite) {
    const patch = { ...o.patch };
    const cid = resolveCat(o.categoryName);
    if (cid != null) patch.categoryId = cid;
    await io.updateItem(o.id, patch);
  }
  const logs = plan.priceLog.add.map((e) => {
    const { supplierName, ...rest } = e;
    return { ...rest, supplierId: supId.get(normName(supplierName)) };
  });
  if (logs.length) await io.insertLogs(logs);
  return plan.counts;
}
