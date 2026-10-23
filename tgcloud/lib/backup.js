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
import { validateRecurring } from './reminders.js';
import { cleanLines } from './nota.js';
import { satClassOf } from './match.js';
import { canonDate, derive } from './pnl.js';

export const OWN_APP = 'berkah-mini';
export const BACKUP_VERSION = 1;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS_SET = new Set(UNITS);

const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

// ── Pembuat backup (format sendiri) ─────────────────────────────────────────
export function makeBackup({ categories, items, suppliers, priceLog, remRecurring = [], remOneoff = [], nota = null, pnl = null }, now = Date.now()) {
  return {
    app: OWN_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    tables: { categories, items, suppliers, priceLog, remRecurring, remOneoff, nota, pnl },
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

// supplierName: nama supplier pemilik jadwal. Mengembalikan baris bersih atau null.
function cleanRecurring(raw, supplierName, ctx) {
  try {
    const v = validateRecurring({ days: raw.days, time: raw.time, preAlertMin: raw.preAlertMin });
    return { supplierName, ...v, lastFiredDate: str(raw.lastFiredDate) || null, lastPreFiredDate: str(raw.lastPreFiredDate) || null };
  } catch { ctx.invalid.reminders++; return null; }
}

function cleanOneOff(raw, supplierName, ctx) {
  const ts = posNum(raw.ts);
  if (!ts) { ctx.invalid.reminders++; return null; }
  let pre = null;
  if (raw.preAlertMin != null && raw.preAlertMin !== '') pre = [15, 30, 60].includes(Number(raw.preAlertMin)) ? Number(raw.preAlertMin) : null;
  return { id: str(raw.id) || makeId(), supplierName, ts, preAlertMin: pre, firedAt: posNum(raw.firedAt), preFiredAt: posNum(raw.preFiredAt) };
}


const fin = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Nota: kamus belajar (objek lama {kunci:nilai} atau larik baris), riwayat, dan database produk.
function cleanNota(raw, ctx) {
  const out = { learn: [], hist: [], products: [] };
  if (!raw || typeof raw !== 'object') return out;
  const entries = Array.isArray(raw.learn) ? raw.learn.map((r) => [r?.kunci, r?.nilai])
    : Object.entries(raw.learn && typeof raw.learn === 'object' ? raw.learn : {});
  const seenLearn = new Set();
  for (const [k, v] of entries) {
    const kunci = str(k), nilai = str(v);
    if (!kunci || !nilai) { ctx.invalid.nota++; continue; }
    if (seenLearn.has(kunci)) continue;
    seenLearn.add(kunci);
    out.learn.push({ kunci, nilai });
  }
  const seenHist = new Set();
  for (const h of Array.isArray(raw.hist) ? raw.hist : []) {
    let c;
    try { c = cleanLines(h?.lines); } catch { ctx.invalid.nota++; continue; }
    let id = str(h.id) || makeId();
    if (seenHist.has(id)) id = makeId();
    seenHist.add(id);
    out.hist.push({
      id, num: str(h.num) || '-', dateStr: str(h.dateStr), timeStr: str(h.timeStr), ket: str(h.ket) || 'Kulakan Harian',
      total: c.total, savedAt: posNum(h.savedAt) ?? Date.now(), lines: c.lines,
    });
  }
  for (const r of Array.isArray(raw.db) ? raw.db : Array.isArray(raw.products) ? raw.products : []) {
    const nama = str(r?.nama), satuan = str(r?.satuan);
    if (!nama || !satuan) { ctx.invalid.nota++; continue; }
    out.products.push({
      nama, satuan, satClass: str(r.satClass) || satClassOf(satuan), hargaJual: Math.max(0, fin(r.hargaJual)), hargaPokok: Math.max(0, fin(r.hargaPokok)),
      kode: str(r.kode) || null, barcode: str(r.barcode) || null,
    });
  }
  return out;
}

// PNL: hari (kunci YYYY-MM-DD) dan arsip per tanggal.
function cleanPnl(raw, ctx) {
  const out = { days: {}, arsip: {} };
  if (!raw || typeof raw !== 'object') return out;
  const rinci = (arr) => (Array.isArray(arr) ? arr : []).map((x) => ({ jumlah: fin(x?.jumlah), ket: str(x?.ket) || '-' }));
  for (const [k, v] of Object.entries(raw.days && typeof raw.days === 'object' ? raw.days : {})) {
    const ds = canonDate(k);
    if (!ds || !v || typeof v !== 'object') { ctx.invalid.pnl++; continue; }
    const rp = rinci(v.rincianPengeluaran), rv = rinci(v.rincianPrive);
    const sumJ = (a) => a.reduce((x, r) => x + r.jumlah, 0);
    out.days[ds] = derive({
      income: fin(v.income), kulakan: fin(v.kulakan), cash: fin(v.cash), receh: fin(v.receh),
      totalPengeluaran: Number.isFinite(Number(v.totalPengeluaran)) ? Number(v.totalPengeluaran) : sumJ(rp),
      totalPrive: Number.isFinite(Number(v.totalPrive)) ? Number(v.totalPrive) : sumJ(rv),
      rincianPengeluaran: rp, rincianPrive: rv,
    });
  }
  for (const [k, list] of Object.entries(raw.arsip && typeof raw.arsip === 'object' ? raw.arsip : {})) {
    const ds = canonDate(k);
    if (!ds || !Array.isArray(list)) { ctx.invalid.pnl++; continue; }
    const entries = list.filter((e) => (e?.j === 'p' || e?.j === 'v') && Number.isFinite(Number(e.amt))).map((e) => ({ j: e.j, amt: Number(e.amt), ket: str(e.ket) || '-' }));
    if (entries.length) out.arsip[ds] = entries;
  }
  return out;
}

function newCtx() {
  const warnings = [];
  return {
    warnings, ids: new Set(), invalid: { items: 0, priceLog: 0, reminders: 0, nota: 0, pnl: 0 },
    warn: (m) => { if (!warnings.includes(m)) warnings.push(m); },
  };
}

function finish(format, ctx, incoming) {
  if (ctx.invalid.items) ctx.warn(`${ctx.invalid.items} barang tidak valid dilewati`);
  if (ctx.invalid.priceLog) ctx.warn(`${ctx.invalid.priceLog} entri harga tidak valid dilewati`);
  if (ctx.invalid.reminders) ctx.warn(`${ctx.invalid.reminders} jadwal pengingat tidak valid dilewati`);
  if (ctx.invalid.nota) ctx.warn(`${ctx.invalid.nota} data Nota tidak valid dilewati`);
  if (ctx.invalid.pnl) ctx.warn(`${ctx.invalid.pnl} data PNL tidak valid dilewati`);
  return { format, incoming, warnings: ctx.warnings };
}

// ── Format lama (berkah-aio v1 dan "Backup Stok") ───────────────────────────
function fromLegacyStok(stok, supplierNames, pricelog, reminders, extra = {}) {
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
  const remRecurring = [], remOneoff = [];
  for (const [name0, rem] of Object.entries(reminders && typeof reminders === 'object' ? reminders : {})) {
    const name = str(name0);
    if (!name || !rem) continue;
    if (!supSeen.has(name)) { supSeen.add(name); suppliers.push({ name, deleted: true }); }
    if (rem.recurring) { const r = cleanRecurring(rem.recurring, name, ctx); if (r) remRecurring.push(r); }
    for (const o of Array.isArray(rem.oneOff) ? rem.oneOff : []) { const r = cleanOneOff(o || {}, name, ctx); if (r) remOneoff.push(r); }
  }
  const nota = cleanNota(extra.nota, ctx), pnl = cleanPnl(extra.pnl, ctx);
  return finish('berkah-aio', ctx, { categories, items, suppliers, priceLog, remRecurring, remOneoff, nota, pnl });
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
  const remRecurring = [], remOneoff = [];
  for (const raw of Array.isArray(t.remRecurring) ? t.remRecurring : []) {
    const name = supName.get(raw.supplierId);
    const r = name ? cleanRecurring(raw, name, ctx) : (ctx.invalid.reminders++, null);
    if (r) remRecurring.push(r);
  }
  for (const raw of Array.isArray(t.remOneoff) ? t.remOneoff : []) {
    const name = supName.get(raw.supplierId);
    const r = name ? cleanOneOff(raw, name, ctx) : (ctx.invalid.reminders++, null);
    if (r) remOneoff.push(r);
  }
  const nota = cleanNota(t.nota, ctx), pnl = cleanPnl(t.pnl, ctx);
  return finish(OWN_APP, ctx, { categories, items, suppliers, priceLog, remRecurring, remOneoff, nota, pnl });
}

export function parseBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('File bukan backup yang valid');
  if (data.app === OWN_APP) {
    if (data.version > BACKUP_VERSION) throw new Error('Backup dibuat oleh versi app yang lebih baru');
    return fromOwn(data);
  }
  if (data.app === 'berkah-aio') {
    if (!data.stok?.boss) throw new Error('Backup ini tidak berisi data Stok');
    return fromLegacyStok(data.stok.boss, data.stok.suppliers, data.stok.pricelog, data.stok.reminders, { nota: data.nota, pnl: data.pnl });
  }
  if (Array.isArray(data.cats) && data.items && typeof data.items === 'object') {
    return fromLegacyStok(data, data.hppSuppliers, data.hppLog, data.hppReminders); // "Backup Stok" app lama
  }
  throw new Error('Format backup tidak dikenal');
}

// ── Rencana merge ───────────────────────────────────────────────────────────
// existing: { categories, items, suppliers, priceLogIds:Set|array } (baris mentah, termasuk tombstone)
export function planRestore(existing, incoming, { onConflict = 'keep', now = Date.now() } = {}) {
  const overwrite = onConflict === 'overwrite';
  const plan = {
    categories: { add: [], revive: [] },
    suppliers: { add: [], revive: [] },
    items: { add: [], overwrite: [], skip: 0, idMap: {} },
    priceLog: { add: [], dup: 0, orphan: 0 },
    reminders: { recurring: [], oneOff: [], recSkip: 0, oneDup: 0, oneExpired: 0 },
    nota: { learn: [], learnSame: 0, hist: [], histDup: 0, products: null, productsSkip: 0 },
    pnl: { days: [], daySkip: 0, arsip: [], arsipSkip: 0 },
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

  // pengingat (kebijakan app lama): sekali-jadwal = union per id; mingguan = hanya
  // mengisi supplier yang belum punya jadwal (kecuali 'overwrite'). Sekali-jadwal
  // yang sudah lewat tidak diimpor supaya tidak langsung berbunyi.
  const liveRec = new Map((existing.remRecurring || []).filter((r) => !r.deletedAt).map((r) => [r.supplierId, r]));
  const knownOne = new Set(existing.remOneoffIds || []);
  const supIdOf = (name) => supByName.get(normName(name))?.id;
  for (const r of incoming.remRecurring || []) {
    const sid = supIdOf(r.supplierName);
    if (sid != null && liveRec.has(sid) && !overwrite) { plan.reminders.recSkip++; continue; }
    plan.reminders.recurring.push(r);
  }
  for (const o of incoming.remOneoff || []) {
    if (knownOne.has(o.id)) { plan.reminders.oneDup++; continue; }
    if (!o.firedAt && o.ts < now - 60000) { plan.reminders.oneExpired++; continue; }
    knownOne.add(o.id);
    plan.reminders.oneOff.push(o);
  }

  // Nota: kamus = union per kunci; riwayat = union per id (yang pernah dihapus tidak hidup lagi);
  // database produk hanya diisi bila kosong (atau 'overwrite').
  const inN = incoming.nota || { learn: [], hist: [], products: [] };
  const liveLearn = new Map((existing.notaLearn || []).filter((r) => !r.deletedAt).map((r) => [r.kunci, r.nilai]));
  for (const l of inN.learn) {
    const cur = liveLearn.get(l.kunci);
    if (cur === undefined || (overwrite && cur !== l.nilai)) plan.nota.learn.push(l); else plan.nota.learnSame++;
  }
  const knownHist = new Set(existing.notaHistIds || []);
  for (const hh of inN.hist) {
    if (knownHist.has(hh.id)) { plan.nota.histDup++; continue; }
    knownHist.add(hh.id);
    plan.nota.hist.push(hh);
  }
  if (inN.products.length) {
    if (!(existing.notaProductCount > 0) || overwrite) plan.nota.products = inN.products; else plan.nota.productsSkip = inN.products.length;
  }

  // PNL: hari dan arsip per tanggal; tanggal yang sudah ada dipertahankan kecuali 'overwrite'.
  const inP = incoming.pnl || { days: {}, arsip: {} };
  const haveDays = new Set(existing.pnlDays || []);
  const haveArs = new Set(existing.pnlArsipDates || []);
  for (const [ds, data] of Object.entries(inP.days)) {
    if (haveDays.has(ds) && !overwrite) plan.pnl.daySkip++; else plan.pnl.days.push({ ds, data });
  }
  for (const [ds, entries] of Object.entries(inP.arsip)) {
    if (haveArs.has(ds) && !overwrite) plan.pnl.arsipSkip++; else plan.pnl.arsip.push({ ds, entries });
  }

  plan.counts = {
    categories: { add: plan.categories.add.length, revive: plan.categories.revive.length },
    suppliers: { add: plan.suppliers.add.length, revive: plan.suppliers.revive.length },
    items: { add: plan.items.add.length, overwrite: plan.items.overwrite.length, skip: plan.items.skip },
    priceLog: { add: plan.priceLog.add.length, dup: plan.priceLog.dup, orphan: plan.priceLog.orphan },
    reminders: { recurring: plan.reminders.recurring.length, recSkip: plan.reminders.recSkip, oneOff: plan.reminders.oneOff.length, oneDup: plan.reminders.oneDup, oneExpired: plan.reminders.oneExpired },
    nota: { learn: plan.nota.learn.length, hist: plan.nota.hist.length, histDup: plan.nota.histDup, products: plan.nota.products ? plan.nota.products.length : 0, productsSkip: plan.nota.productsSkip },
    pnl: { days: plan.pnl.days.length, daySkip: plan.pnl.daySkip, arsip: plan.pnl.arsip.length, arsipSkip: plan.pnl.arsipSkip },
  };
  plan.catByName = Object.fromEntries([...catByName].map(([k, c]) => [k, c.id]));
  plan.supByName = Object.fromEntries([...supByName].map(([k, s]) => [k, s.id]));
  return plan;
}

// ── Penerap rencana ─────────────────────────────────────────────────────────
// io (async): insertCategory(row)->id, reviveCategory(id), insertSupplier({name,deleted})->id,
//   reviveSupplier(id), insertItems(rows), updateItem(id, patch), insertLogs(rows),
//   upsertRecurring(row), insertOneOffs(rows), replaceProducts(rows), upsertLearn(rows),
//   insertHist(rows), writePnlDay(ds, data), writeArsipDate(ds, entries)
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
  for (const r of plan.reminders.recurring) {
    const { supplierName, ...rest } = r;
    await io.upsertRecurring({ ...rest, supplierId: supId.get(normName(supplierName)) });
  }
  if (plan.reminders.oneOff.length) {
    await io.insertOneOffs(plan.reminders.oneOff.map((o) => {
      const { supplierName, ...rest } = o;
      return { ...rest, supplierId: supId.get(normName(supplierName)) };
    }));
  }
  if (plan.nota.products) await io.replaceProducts(plan.nota.products);
  if (plan.nota.learn.length) await io.upsertLearn(plan.nota.learn);
  if (plan.nota.hist.length) await io.insertHist(plan.nota.hist);
  for (const d of plan.pnl.days) await io.writePnlDay(d.ds, d.data);
  for (const a of plan.pnl.arsip) await io.writeArsipDate(a.ds, a.entries);
  return plan.counts;
}
