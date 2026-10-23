// State klien. Murni (tanpa DOM) supaya bisa diuji di Node.
// Server mengirim delta; baris terhapus datang sebagai tombstone (deletedAt).
import { rankFromEntries, tierSummary } from '../tgcloud/lib/tier.js';
import { orderLine } from '../tgcloud/lib/rules.js';

export function createState() {
  return {
    me: null,
    categories: new Map(),
    items: new Map(),
    suppliers: new Map(),
    priceLog: new Map(),
    remRecurring: new Map(), // kunci: supplierId
    remOneoff: new Map(),
    alerts: [],              // pesan pengingat yang baru dibunyikan (untuk spanduk)
    serverTime: 0,
    activeCat: null,
    lastAct: null,
    filter: { preset: 'all', from: null, to: null }, // filter tanggal centang (khusus tampilan Bos)
  };
}

// tabel -> nama kolom kunci
const TABLES = { categories: 'id', items: 'id', suppliers: 'id', priceLog: 'id', remRecurring: 'supplierId', remOneoff: 'id' };

// Terapkan balasan getChanges. Mengembalikan true bila ada baris yang berubah.
export function applyChanges(state, delta) {
  let changed = false;
  for (const [key, idField] of Object.entries(TABLES)) {
    for (const row of delta[key] || []) {
      const cur = state[key].get(row[idField]);
      if (!cur || row.updatedAt >= cur.updatedAt) { state[key].set(row[idField], row); changed = true; }
    }
  }
  if (delta.alerts?.length) { state.alerts.push(...delta.alerts); changed = true; }
  if (delta.serverTime) state.serverTime = delta.serverTime;
  if ('lastAct' in delta) { state.lastAct = delta.lastAct; changed = true; }
  return changed;
}

const live = (m) => [...m.values()].filter((r) => !r.deletedAt);
const bySort = (a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id));

export function categoriesOf(state) { return live(state.categories).sort(bySort); }
export function itemsOf(state, categoryId) {
  return live(state.items).filter((i) => i.categoryId === categoryId).sort(bySort);
}
export function suppliersOf(state) {
  return live(state.suppliers).sort((a, b) => a.name.localeCompare(b.name, 'id'));
}
// Nama supplier termasuk yang sudah dihapus (riwayat harga tetap menunjuknya).
export function supplierName(state, id) {
  const s = state.suppliers.get(id);
  return s ? s.name : '(dihapus)';
}
// Jadwal mingguan hidup untuk satu supplier (atau null).
export function recurringOf(state, supplierId) {
  const r = state.remRecurring.get(supplierId);
  return r && !r.deletedAt ? r : null;
}
// Sekali-jadwal yang masih menunggu (belum berbunyi), terdekat dulu.
export function oneOffsOf(state) {
  return [...state.remOneoff.values()].filter((o) => !o.deletedAt && !o.firedAt).sort((a, b) => a.ts - b.ts);
}

export function logOf(state, itemId) {
  return live(state.priceLog).filter((e) => e.itemId === itemId).sort((a, b) => b.ts - a.ts);
}
export function tierOf(state, itemId) {
  return tierSummary(rankFromEntries(logOf(state, itemId)));
}
export function rankedOf(state, itemId) {
  return rankFromEntries(logOf(state, itemId));
}

const p2 = (n) => String(n).padStart(2, '0');
export const dayStr = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// skInRange (app lama): apakah waktu centang masuk filter tanggal.
export function inRange(filter, ts, now = Date.now()) {
  if (!filter || filter.preset === 'all') return true;
  if (!ts) return false;
  const ds = dayStr(ts), today = dayStr(now);
  if (filter.preset === 'today') return ds === today;
  if (filter.preset === '7d') {
    const f = new Date(now); f.setDate(f.getDate() - 6);
    return ds >= dayStr(f.getTime()) && ds <= today;
  }
  if (filter.preset === 'custom' && filter.from && filter.to) return ds >= filter.from && ds <= filter.to;
  return true;
}

// Teks order untuk disalin ke WhatsApp (skBuildOutput). Filter kategori hanya
// berlaku untuk Bos (applyExclude). Filter tanggal memengaruhi isi order. Bila
// ada lebih dari satu tanggal dan tsHeaders, tiap tanggal diberi header.
export function buildOrderText(state, { applyExclude = false, filter = null, tsHeaders = true, now = Date.now() } = {}) {
  let all = [];
  for (const cat of categoriesOf(state)) {
    if (applyExclude && cat.excludeFromOrder) continue;
    all.push(...itemsOf(state, cat.id).filter((i) => i.checked));
  }
  if (filter && filter.preset !== 'all') all = all.filter((i) => inRange(filter, i.checkedAt, now));
  if (!all.length) return '';
  const groups = {};
  for (const i of all) (groups[i.checkedAt ? dayStr(i.checkedAt) : 'tanpa-tanggal'] ||= []).push(i);
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const today = dayStr(now), yest = dayStr(now - 86400000);
  const lines = [];
  for (const ds of dates) {
    if (dates.length > 1 && tsHeaders) {
      const [, mm, dd] = ds.split('-');
      lines.push(ds === today ? '── Hari ini ──' : ds === yest ? '── Kemarin ──' : ds === 'tanpa-tanggal' ? '── Sebelumnya ──'
        : `── ${parseInt(dd, 10)} ${MONTHS[parseInt(mm, 10) - 1]} ──`);
    }
    groups[ds].forEach((i) => lines.push(orderLine(i)));
  }
  return lines.join('\n');
}

// "baru saja", "5 menit lalu", ... (skRelTime)
export function relTime(ts, now = Date.now()) {
  if (!ts) return null;
  const diff = now - ts;
  if (diff < 45000) return 'baru saja';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// Semua barang hidup, urut kategori lalu sortOrder (untuk pencarian lintas kategori).
export function allLiveItems(state) {
  return categoriesOf(state).flatMap((c) => itemsOf(state, c.id));
}

export function checkedCount(state) {
  return live(state.items).filter((i) => i.checked).length;
}
