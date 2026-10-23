// Panggilan mutasi + sinkronisasi. Setelah tiap mutasi, tarik delta supaya UI
// memakai kebenaran server, bukan tebakan lokal.
import { call } from './api.js';
import { applyChanges } from './state.js';
import { toast } from './dom.js';

export function createSync(state, onChange) {
  let busy = false;
  let timer = null;

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const since = state.serverTime ? state.serverTime - 2000 : 0;
      const delta = await call('getChanges', { since });
      if (applyChanges(state, delta)) onChange();
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }

  async function act(name, input, okMsg) {
    try {
      const out = await call(name, input);
      if (okMsg) toast(okMsg);
      await refresh();
      return out;
    } catch (e) {
      toast(e.message);
      return null;
    }
  }

  function start(intervalMs = 4000) {
    stop();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  function stop() { clearInterval(timer); }

  return { refresh, act, start, stop };
}
