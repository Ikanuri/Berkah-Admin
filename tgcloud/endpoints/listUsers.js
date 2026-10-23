import { db } from 'sdk';
import { users } from '../schema.js';
import { requireRole } from '../lib/auth.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  return db.select().from(users).all();
}
