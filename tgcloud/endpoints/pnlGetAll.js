import { requireRole } from '../lib/auth.js';
import { readAll } from '../lib/pnl-store.js';

export default async function (input, ctx) {
  await requireRole(ctx, 'boss');
  return readAll();
}
