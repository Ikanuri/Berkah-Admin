// Menulis tgcloud/lib/boss-ids.js dari env BOSS_IDS ("123456, 789012").
// Dipakai workflow deploy. Gagal keras bila kosong atau bukan angka, supaya
// deploy tidak pernah jalan dengan nol Bos.
import { writeFileSync } from 'node:fs';

export function parseBossIds(raw) {
  const ids = String(raw ?? '').split(/[,\s]+/).filter(Boolean);
  if (!ids.length) throw new Error('BOSS_IDS kosong: isi GitHub Secret BOSS_IDS (id Telegram dipisah koma).');
  const bad = ids.filter((x) => !/^\d{1,15}$/.test(x));
  if (bad.length) throw new Error(`BOSS_IDS berisi nilai bukan angka (${bad.length} entri). Format: 123456,789012`);
  return [...new Set(ids.map(Number))];
}

export function render(ids) {
  return `// DIHASILKAN oleh scripts/ci/gen-boss-ids.mjs dari GitHub Secret. Jangan di-commit.\nexport const BOSS_IDS = ${JSON.stringify(ids)};\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const ids = parseBossIds(process.env.BOSS_IDS);
    writeFileSync('tgcloud/lib/boss-ids.js', render(ids));
    console.log(`boss-ids.js ditulis (${ids.length} Bos)`);
  } catch (e) {
    console.error('::error::' + e.message);
    process.exit(1);
  }
}
