// Penyimpanan PNL di DB (dipakai endpoint dan skrip uji). Tanpa transaksi: tiap
// tanggal ditulis berurutan (upsert hari, hapus arsip tanggal itu, sisip ulang).
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { pnlDays, pnlArsip } from '../schema.js';
import { arsipOf } from './pnl.js';

const CHUNK = 60; // 4 kolom per baris arsip

export async function readAll() {
  const days = {};
  for (const r of await db.select().from(pnlDays).all()) {
    const { tanggal, updatedAt, ...rest } = r;
    void updatedAt;
    days[tanggal] = rest;
  }
  const arsip = {};
  for (const r of await db.select().from(pnlArsip).orderBy(pnlArsip.id).all()) {
    (arsip[r.tanggal] ??= []).push({ j: r.jenis, amt: r.amt, ket: r.ket });
  }
  return { days, arsip };
}

export async function writeArsipDate(ds, entries) {
  await db.delete(pnlArsip).where(eq(pnlArsip.tanggal, ds)).run();
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.insert(pnlArsip).values(entries.slice(i, i + CHUNK).map((e) => ({ tanggal: ds, jenis: e.j, amt: e.amt, ket: e.ket }))).run();
  }
}

export async function upsertDay(ds, data, now) {
  await db.insert(pnlDays).values({ tanggal: ds, ...data, updatedAt: now })
    .onConflictDoUpdate({ target: pnlDays.tanggal, set: { ...data, updatedAt: now } }).run();
}

export async function writeDay(ds, data, now) {
  await upsertDay(ds, data, now);
  await writeArsipDate(ds, arsipOf(data));
}
