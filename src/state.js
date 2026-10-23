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
    serverTime: 0,
    activeCat: null,
  };
}

const TABLES = { categories: 'categories', items: 'items', suppliers: 'suppliers', priceLog: 'priceLog' };

// Terapkan balasan getChanges. Mengembalikan true bila ada baris yang berubah.
export function applyChanges(state, delta) {
  let changed = false;
  for (const key of Object.keys(TABLES)) {
    for (const row of delta[key] || []) {
      const cur = state[key].get(row.id);
      if (!cur || row.updatedAt >= cur.updatedAt) { state[key].set(row.id, row); changed = true; }
    }
  }
  if (delta.serverTime) state.serverTime = delta.serverTime;
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
export function logOf(state, itemId) {
  return live(state.priceLog).filter((e) => e.itemId === itemId).sort((a, b) => b.ts - a.ts);
}
export function tierOf(state, itemId) {
  return tierSummary(rankFromEntries(logOf(state, itemId)));
}
export function rankedOf(state, itemId) {
  return rankFromEntries(logOf(state, itemId));
}

// Teks order untuk disalin ke WhatsApp. Seperti app lama (skCatExcluded), filter
// kategori hanya berlaku untuk Bos: Karyawan menyalin semua yang tercentang.
export function buildOrderText(state, { applyExclude = false } = {}) {
  const lines = [];
  for (const cat of categoriesOf(state)) {
    if (applyExclude && cat.excludeFromOrder) continue;
    for (const it of itemsOf(state, cat.id)) if (it.checked) lines.push(orderLine(it));
  }
  return lines.join('\n');
}

// Semua barang hidup, urut kategori lalu sortOrder (untuk pencarian lintas kategori).
export function allLiveItems(state) {
  return categoriesOf(state).flatMap((c) => itemsOf(state, c.id));
}

export function checkedCount(state) {
  return live(state.items).filter((i) => i.checked).length;
}
