// Inti sinkronisasi tanpa DOM (bisa diuji di Node): antrean mutasi berurutan, perubahan lokal
// seketika (optimistic), dan polling delta.
//
// Aturan:
//  - Tiap act() menerapkan perubahan lokal dulu (bila ada di OPTIMISTIC), lalu mengantre panggilan
//    ke server. Panggilan dikirim SATU PER SATU sesuai urutan, jadi hasil akhir di server sama dengan
//    urutan ketukan pengguna walau jaringan lambat.
//  - Polling ditahan selama ada panggilan yang belum selesai, dan balasan polling yang berangkat
//    sebelum sebuah ketukan dibuang (generation), supaya data lama tidak menimpa tampilan terbaru.
//  - Setelah antrean kosong, tarik delta sekali. Bila ada panggilan gagal: undo lokal + muat ulang
//    penuh (since = 0) supaya tampilan kembali sama dengan server.
import { applyChanges } from './state.js';
import { OPTIMISTIC } from './optimistic.js';

export function createSyncCore(state, onChange, { call, toast }) {
  let polling = false;
  let timer = null;
  let polls = 0; // tick pengingat tiap ~15 poll (~1 menit); poll pertama langsung
  const queue = [];
  let draining = false;
  let pending = 0;
  let generation = 0;
  let needFull = false;

  async function refresh({ full = false } = {}) {
    if (polling || pending > 0) return;
    polling = true;
    const gen = generation;
    try {
      const since = full || !state.serverTime ? 0 : state.serverTime - 2000;
      const delta = await call('getChanges', { since, tick: polls++ % 15 === 0 });
      if (gen !== generation || pending > 0) return; // ada ketukan selama menunggu: jawaban ini sudah basi
      if (applyChanges(state, delta)) onChange();
    } catch (e) {
      toast(e.message);
    } finally {
      polling = false;
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const job = queue.shift();
      await job();
      pending--;
    }
    draining = false;
    generation++;
    const full = needFull;
    needFull = false;
    await refresh({ full });
  }

  // act(nama, input, pesanSukses) -> Promise<hasil server | null bila gagal>
  function act(name, input, okMsg) {
    let undo = null;
    let sendInput = input;
    const opt = OPTIMISTIC[name];
    if (opt) {
      try {
        const r = opt(state, input) || {};
        undo = r.undo || null;
        if (r.input) sendInput = r.input;
        if (r.undo || r.input) onChange();
      } catch { /* gagal menghitung lokal: lanjut tanpa tampilan seketika */ }
    }
    pending++;
    generation++;
    return new Promise((resolve) => {
      queue.push(async () => {
        try {
          const out = await call(name, sendInput);
          if (okMsg) toast(okMsg);
          resolve(out);
        } catch (e) {
          toast(e.message);
          if (undo) { try { undo(); onChange(); } catch { /* abaikan */ } }
          needFull = true;
          resolve(null);
        }
      });
      drain();
    });
  }

  function start(intervalMs = 4000) {
    stop();
    timer = setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
  function stop() { clearInterval(timer); }

  return { refresh, act, start, stop, get pending() { return pending; } };
}
