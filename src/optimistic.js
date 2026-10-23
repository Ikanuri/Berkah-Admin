// Perubahan lokal SEKETIKA sebelum server menjawab ("optimistic UI"). Memakai aturan murni yang
// sama dengan server (lib/rules.js), jadi hasil lokal = hasil server. Server tetap sumber
// kebenaran: balasan polling menimpa baris lokal (updatedAt server >= lokal) dan bila panggilan
// gagal, sync-core memulihkan lewat undo + muat ulang penuh.
//
// Setiap entri: (state, input) => { input?, undo? } — input boleh diganti (mis. menambah `ids`).
import { toggle, adjustQty, setQty, parseLine, normName, mergeAddLine } from '../tgcloud/lib/rules.js';
import { mergeWorkerLine } from '../tgcloud/lib/receipts.js';
import { UNITS } from '../tgcloud/lib/units.js';
import { makeId } from '../tgcloud/lib/id.js';

const liveOf = (map) => [...map.values()].filter((r) => !r.deletedAt);

// Ganti baris di Map dengan salinan yang diubah (updatedAt TETAP, supaya baris server menimpanya).
function patchRow(map, id, patch) {
  const cur = map.get(id);
  if (!cur) return null;
  map.set(id, { ...cur, ...patch });
  return () => map.set(id, cur);
}

function patchMany(map, rows, patchOf) {
  const undos = [];
  for (const r of rows) { const u = patchRow(map, r.id, patchOf(r)); if (u) undos.push(u); }
  return () => undos.reverse().forEach((u) => u());
}

function qtyPatch(row, input) {
  const patch = {};
  if (typeof input.name === 'string' && input.name.trim()) patch.name = input.name.trim();
  if (input.qty != null) { const q = setQty(input.qty); if (q != null) patch.qty = q; }
  else if (input.delta != null) patch.qty = adjustQty(row.qty, Number(input.delta));
  if (input.unit != null && UNITS.includes(input.unit)) patch.unit = input.unit;
  return patch;
}

// Rencana tambah barang: dipakai tampilan (toast seketika) dan optimistic. `existing`: baris hidup.
export function planAdd(existing, text, { worker = false, now = Date.now() } = {}) {
  const lines = String(text ?? '').split('\n').map(parseLine).filter(Boolean);
  const byName = new Map(existing.map((i) => [normName(i.name), i]));
  const news = [], updates = [];
  for (const line of lines) {
    const key = normName(line.name);
    const m = worker ? mergeWorkerLine(byName.get(key), line, now) : mergeAddLine(byName.get(key), line, true, now);
    if (m.kind === 'new') { const row = { name: line.name, qty: line.qty, unit: line.unit }; news.push(row); byName.set(key, { ...row, id: null, _new: row, checked: false, checkedAt: null }); }
    else updates.push({ id: byName.get(key).id, _new: byName.get(key)._new, patch: m.patch });
  }
  return { added: news.length, updated: updates.length, news, updates };
}

function addOptimistic(map, existing, text, { worker, extra }) {
  const plan = planAdd(existing, text, { worker });
  let order = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1;
  const ids = plan.news.map(() => makeId());
  const created = [];
  const undos = [];
  plan.news.forEach((n, i) => {
    const row = { id: ids[i], name: n.name, qty: n.qty, unit: n.unit, checked: false, checkedAt: null, sortOrder: order++, updatedAt: 0, deletedAt: null, ...extra };
    map.set(row.id, row); created.push(row);
    n._row = row;
  });
  for (const u of plan.updates) {
    if (u.id != null) { const undo = patchRow(map, u.id, u.patch); if (undo) undos.push(undo); }
    else if (u._new && u._new._row) { Object.assign(u._new._row, u.patch); } // baris sama muncul dua kali dalam satu tempelan
  }
  return { ids, undo: () => { created.forEach((r) => map.delete(r.id)); undos.reverse().forEach((u) => u()); } };
}

export const OPTIMISTIC = {
  // ── daftar Bos ──
  toggleItem(state, { id }) {
    const it = state.items.get(id);
    if (!it || it.deletedAt) return {};
    return { undo: patchRow(state.items, id, toggle(it, Date.now()).patch) };
  },
  updateItem(state, input) {
    const it = state.items.get(input.id);
    if (!it || it.deletedAt) return {};
    const patch = qtyPatch(it, input);
    return Object.keys(patch).length ? { undo: patchRow(state.items, input.id, patch) } : {};
  },
  setChecked(state, { categoryId, checked }) {
    const now = Date.now();
    const rows = liveOf(state.items).filter((i) => (categoryId == null || i.categoryId === categoryId) && i.checked !== !!checked);
    return { undo: patchMany(state.items, rows, () => ({ checked: !!checked, checkedAt: checked ? now : null })) };
  },
  deleteItem(state, { id }) {
    return { undo: patchRow(state.items, id, { deletedAt: Date.now() }) };
  },
  reorderItems(state, { categoryId, ids }) {
    const rows = ids.map((id) => state.items.get(id)).filter(Boolean);
    const order = new Map(ids.map((id, i) => [id, i + 1]));
    void categoryId;
    return { undo: patchMany(state.items, rows, (r) => ({ sortOrder: order.get(r.id) })) };
  },
  addItems(state, input) {
    const existing = liveOf(state.items).filter((i) => i.categoryId === input.categoryId);
    if (!state.categories.get(input.categoryId)) return {};
    const { ids, undo } = addOptimistic(state.items, existing, input.text, { worker: false, extra: { categoryId: input.categoryId, isi: null, satuanHpp: null, hargaBeli: null, hargaJual: null } });
    return { input: { ...input, ids }, undo };
  },

  // ── daftar pribadi Karyawan (Penerimaan) ──
  wToggleItem(state, { id }) {
    const it = state.workerItems.get(id);
    if (!it || it.deletedAt) return {};
    return { undo: patchRow(state.workerItems, id, toggle(it, Date.now()).patch) };
  },
  wUpdateItem(state, input) {
    const it = state.workerItems.get(input.id);
    if (!it || it.deletedAt) return {};
    const patch = qtyPatch(it, { ...input, name: undefined });
    return Object.keys(patch).length ? { undo: patchRow(state.workerItems, input.id, patch) } : {};
  },
  wSetChecked(state, { checked }) {
    const now = Date.now();
    const rows = liveOf(state.workerItems).filter((i) => i.checked !== !!checked);
    return { undo: patchMany(state.workerItems, rows, () => ({ checked: !!checked, checkedAt: checked ? now : null })) };
  },
  wAddItems(state, input) {
    const existing = liveOf(state.workerItems);
    const { ids, undo } = addOptimistic(state.workerItems, existing, input.text, { worker: true, extra: { ownerId: state.me?.tgId } });
    return { input: { ...input, ids }, undo };
  },
};
