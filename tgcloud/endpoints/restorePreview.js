// Restore backup (format baru atau format lama) dengan MERGE, bukan timpa senyap.
// input: { data, onConflict: 'keep' | 'overwrite' }. Khusus Bos.
import { EndpointError } from 'sdk';
import { requireRole, logActivity } from '../lib/auth.js';
import { parseBackup, planRestore } from '../lib/backup.js';
import { loadExisting } from '../lib/restore-io.js';

export default async function (input, ctx) {
  const u = await requireRole(ctx, 'boss');
  let parsed;
  try { parsed = parseBackup(input?.data); } catch (e) { throw new EndpointError(e.message); }
  const onConflict = input?.onConflict === 'overwrite' ? 'overwrite' : 'keep';
  const plan = planRestore(await loadExisting(), parsed.incoming, { onConflict });

  return { format: parsed.format, warnings: parsed.warnings, onConflict, counts: plan.counts };
}
