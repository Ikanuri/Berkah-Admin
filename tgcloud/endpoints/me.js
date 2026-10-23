import { currentUser } from '../lib/auth.js';

export default async function (input, ctx) {
  const u = await currentUser(ctx);
  return { tgId: u.tgId, name: u.name, role: u.role };
}
