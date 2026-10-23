// Akses DB yang dipakai bersama beberapa endpoint. Tanpa foreign key di
// tgcloud, keberadaan baris induk dicek di sini.
import { db, EndpointError } from 'sdk';
import { eq, and, isNull } from 'sdk/db';
import { items, categories, suppliers } from '../schema.js';

export async function getItem(id) {
  const it = await db.select().from(items).where(and(eq(items.id, id), isNull(items.deletedAt))).get();
  if (!it) throw new EndpointError('Barang tidak ditemukan', { id });
  return it;
}

export async function getCategory(id) {
  const c = await db.select().from(categories).where(and(eq(categories.id, id), isNull(categories.deletedAt))).get();
  if (!c) throw new EndpointError('Kategori tidak ditemukan', { id });
  return c;
}

export async function getSupplier(id) {
  const s = await db.select().from(suppliers).where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt))).get();
  if (!s) throw new EndpointError('Supplier tidak ditemukan', { id });
  return s;
}

export async function touchItem(id, patch, now) {
  await db.update(items).set({ ...patch, updatedAt: now }).where(eq(items.id, id)).run();
}
