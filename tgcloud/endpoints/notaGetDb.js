// Database produk untuk pencocokan di klien. input.version = versi yang sudah dimiliki klien.
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { notaProducts, notaMeta } from '../schema.js';
import { requireRole } from '../lib/auth.js';
import { packProducts } from '../lib/nota.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  const meta = await db.select().from(notaMeta).where(eq(notaMeta.key, 'db_version')).get();
  const version = meta ? Number(meta.value) : 0;
  if (input?.version != null && Number(input.version) === version) return { unchanged: true, version };
  const rows = await db.select().from(notaProducts).all();
  return { version, count: rows.length, rows: packProducts(rows, { withCost: true }) };
}
