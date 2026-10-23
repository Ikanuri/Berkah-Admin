// Tier Termurah. Port supRankFromEntries/supTierLabelHtml (baris 5351-5370
// legacy v1.5.0), tanpa HTML. Entri: { supplierId, hargaBeli, ts }.

// Harga TERBARU tiap supplier, termurah dulu. Map menjaga urutan sisip.
export function rankFromEntries(entries) {
  const latest = new Map();
  for (const e of entries) {
    const cur = latest.get(e.supplierId);
    if (!cur || e.ts > cur.ts) latest.set(e.supplierId, e);
  }
  return [...latest.values()].sort((a, b) => a.hargaBeli - b.hargaBeli);
}

// Pemenang = SEMUA supplier dengan harga sama dengan yang termurah
// (bandingkan harga, bukan nama). Perbandingan === disengaja, sama seperti app lama.
export function winners(ranked) {
  if (!ranked.length) return [];
  return ranked.filter((r) => r.hargaBeli === ranked[0].hargaBeli);
}

// { kind:'single', supplierId, price } | { kind:'tied', count, price } | null
export function tierSummary(ranked) {
  const w = winners(ranked);
  if (!w.length) return null;
  const price = ranked[0].hargaBeli;
  return w.length > 1
    ? { kind: 'tied', count: w.length, price }
    : { kind: 'single', supplierId: w[0].supplierId, price };
}
