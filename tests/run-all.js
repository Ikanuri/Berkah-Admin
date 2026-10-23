import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

// 1) uji lib murni  2) semua modul tgcloud lolos parse sintaks
execFileSync('node', ['tests/lib-test.js'], { stdio: 'inherit' });
let n = 0;
for (const dir of ['tgcloud', 'tgcloud/lib', 'tgcloud/endpoints', 'tgcloud/handlers']) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    execFileSync('node', ['--check', `${dir}/${f}`]);
    n++;
  }
}
console.log(`✓ ${n} modul lolos cek sintaks`);
