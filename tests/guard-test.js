// Guard keamanan: frontend tidak boleh mengimpor modul yang menarik BOSS_IDS
// atau SDK server. Jalankan: node tests/guard-test.js
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

const FORBIDDEN = [/boss-ids/, /\/config\.js/, /\/auth\.js/, /\/store\.js/, /from\s+['"]sdk/];

// graf impor transitif dari src/ -> pastikan tidak ada yang menyentuh modul terlarang
const seen = new Set();
const visit = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    for (const re of FORBIDDEN) assert.ok(!re.test(spec), `${file} mengimpor "${spec}" (terlarang di frontend)`);
    if (spec.startsWith('.') && spec.endsWith('.js')) {
      visit(join(file, '..', spec).replace(/\\/g, '/'));
    }
  }
};
walk('src').forEach(visit);
console.log(`✓ ${seen.size} modul terjangkau dari src/ tidak menyentuh boss-ids/config/auth/store/sdk`);
