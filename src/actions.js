// Penyambung sync-core ke API sungguhan dan toast. Logika ada di sync-core.js (diuji di Node).
import { call } from './api.js';
import { toast } from './dom.js';
import { createSyncCore } from './sync-core.js';

export function createSync(state, onChange) {
  return createSyncCore(state, onChange, { call, toast });
}
