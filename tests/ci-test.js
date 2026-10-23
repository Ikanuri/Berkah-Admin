// Uji skrip CI tanpa jaringan. Jalankan: node tests/ci-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBossIds, render } from '../scripts/ci/gen-boss-ids.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('parseBossIds: koma, spasi, duplikat', () => {
  assert.deepEqual(parseBossIds('123456, 789012'), [123456, 789012]);
  assert.deepEqual(parseBossIds('1\n2 2'), [1, 2]);
});

t('parseBossIds: menolak kosong dan bukan angka', () => {
  assert.throws(() => parseBossIds(''), /kosong/);
  assert.throws(() => parseBossIds(undefined), /kosong/);
  assert.throws(() => parseBossIds('12,abc'), /bukan angka/);
  assert.throws(() => parseBossIds('-5'), /bukan angka/);
});

t('render menghasilkan modul ES yang valid', () => {
  const src = render([42, 7]);
  assert.match(src, /export const BOSS_IDS = \[42,7\];/);
});

t('gen-boss-ids gagal tanpa env dan tidak menulis file', () => {
  const r = spawnSync('node', ['scripts/ci/gen-boss-ids.mjs'], { env: { PATH: process.env.PATH } });
  assert.equal(r.status, 1);
  assert.match(String(r.stderr), /::error::/);
  assert.match(readFileSync('tgcloud/lib/boss-ids.js', 'utf8'), /BOSS_IDS = \[\]/);
});

t('diagnose.sh: tanpa secret gagal cepat, tanpa memanggil jaringan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diag-'));
  try {
    const report = join(dir, 'r.md');
    const r = spawnSync('bash', ['scripts/ci/diagnose.sh'], { env: { PATH: process.env.PATH, REPORT: report } });
    assert.equal(r.status, 1);
    const txt = readFileSync(report, 'utf8');
    assert.match(txt, /TGCLOUD_TOKEN belum diisi/);
    assert.match(txt, /BOSS_IDS kosong/);
    assert.doesNotMatch(txt, /Status proyek/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('diagnose.sh: sintaks bash valid', () => {
  execFileSync('bash', ['-n', 'scripts/ci/diagnose.sh']);
});

console.log(`\nHASIL: ${n} uji CI lulus`);
