import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

// 1) uji lib murni  2) semua modul tgcloud lolos parse sintaks
execFileSync('node', ['tests/lib-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/ci-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/local-store-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/state-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/backup-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/reminders-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/match-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/nota-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/pnl-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/pnl-store-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/receipts-test.js'], { stdio: 'inherit' });
execFileSync('node', ['tests/guard-test.js'], { stdio: 'inherit' });
let n = 0;
for (const dir of ['tgcloud', 'tgcloud/lib', 'tgcloud/endpoints', 'tgcloud/handlers', 'src', 'src/views']) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    execFileSync('node', ['--check', `${dir}/${f}`]);
    // Kompiler tgcloud menolak karakter kontrol mentah (mis. NUL) di sumber: tulis sebagai escape.
    const bad = [...readFileSync(`${dir}/${f}`)].findIndex((c) => (c < 32 && ![9, 10, 13].includes(c)) || c === 127);
    if (bad >= 0) throw new Error(`${dir}/${f}: karakter kontrol mentah di byte ${bad}`);
    n++;
  }
}
console.log(`✓ ${n} modul lolos cek sintaks`);
