// Uji mesin pencocokan Nota Kulakan — diekstrak LANGSUNG dari index.html
// (single source of truth) lalu dijalankan terhadap 43 baris template nyata.
// data/Products.csv memakai skema rujukan resmi:
//   nama,kode_produk,barcode,satuan,harga_jual,harga_beli,induk_nama,induk_kode,satuan_dasar,rasio
// (satuan sudah label teks langsung — lihat parseProductsCSV di index.html)
// Jalankan: node tests/match-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'berkah-admin-1.5.0.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m){ console.error('Marker ENGINE tidak ditemukan di index.html'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.E = { matchProduct, parseKulakanLine, parseProductsCSV };', ctx);
const E = ctx.E;

const csv = fs.readFileSync(path.join(__dirname, '..', 'data', 'Products.csv'), 'utf8');
const db = E.parseProductsCSV(csv);
console.log('DB:', db.length, 'baris produk');

// harapan per baris: {p} = harga benar (status ok/ambiguous, top tepat)
//                    {flag} = WAJIB ditandai untuk review (bukan tebakan senyap)
const CASES = [
  ['1 dus Glukol',                {p:26000}],
  ['4 bj Sonice',                 {flag:'satuan_missing'}],
  ['4 sak Tinta 10kg',            {p:141000}],
  ['8 sak Tinta 5kg',             {p:71500}],
  ['1 dus Tulip 1kg',             {p:86500}],
  ['1 sak Payung 25kg',           {p:175000}],
  ['1 bal Garam 1k',              {p:14000}],
  ['3 kg Kacang Osik',            {p:34000}],
  ['3 kg Bawang Putih',           {p:34000}],
  ['1 bal Kanji Naga 500g',       {p:72500}],
  ['3 kg Palmboom',               {flag:'satuan_missing'}],
  ['2 kg Kopi Nangka',            {p:75000}],
  ['4 ret Boncabe 30',            {p:10000, nama:'Boncabe Level 30'}],
  ['4 dus 3 Ayam',                {p:38500}],
  ['2 dus Intermie Pedas',        {p:54000}],
  ['2 dus Sarimie Gelas Soto',    {flag:'satuan_missing'}],
  ['6 ikt Mie Panda',             {p:25000}],
  ['15 biji Roti 2k random',      {p:1750}],
  ['8 biji Roti Nanas',           {p:2800}],
  ['1 slp Kratingdaeng',          {p:48000}],
  ['2 biji Frisian Flag Kaleng Putih', {p:12000}],
  ['8 biji Indomilk Kaleng Coklat',    {p:11750}],
  ['3 biji Tiga Sapi',            {p:12500}],
  ['1 dus Tea Jus Gula Batu',     {p:110000}],
  ['1 pak Jasjus Kepala Muda',    {p:15500}],
  ['1 pak Adem Sari isi 24',      {p:52500}],
  ['1 slp Amplop You!',           {p:22000}],
  ['8 pak Bodrex',                {p:9000}],
  ['1 slp Raptor',                {p:166000}],
  ['4 slp Gajah Baru F',          {p:170000}],
  ['1 slp Warkop',                {p:110000}],
  ['1 slp 76 12',                 {p:156000}],
  ['1 slp Sampoerna Prima',       {p:148500}],
  ['3 slp CD Nelayan',            {p:22500}],
  ['2 slp Lawet Ijo',             {p:70000}],
  ['1 ikt HD 1/2 12',             {p:32000}],
  ['1 ikt Kresek Putih tg',       {flag:'satuan_missing'}],
  ['5 pak Lilin Popular',         {flag:'notfound'}],
  ['5 pak Lilin Abadi',           {p:7250}],
  ['1 biji Slic',                 {p:10500}],
  ['2 bal Foam Tajin',            {p:32500}],
  ['1 biji King',                 {flag:'ambiguous', notNama:'Baking Powder Rw'}],
  ['15.1 kg Filma',               {p:19500}],
];

let pass = 0, fail = 0, autoOk = 0;
const fails = [];
CASES.forEach(([line, exp], i) => {
  const parsed = E.parseKulakanLine(line);
  if (!parsed){ fails.push((i+1)+'. "'+line+'" GAGAL PARSE'); fail++; return; }
  const r = E.matchProduct(db, parsed.nama, parsed.satuan, {});
  const nama = r.best ? r.best.nama.trim() : '—';
  const harga = r.best ? r.best.hargaJual : 0;
  let ok = false;
  if (exp.p !== undefined){
    ok = (r.status === 'ok' || r.status === 'ambiguous') && harga === exp.p &&
         (!exp.nama || nama === exp.nama);
    if (ok && r.status === 'ok') autoOk++;
  } else {
    ok = r.status === exp.flag && (!exp.notNama || nama !== exp.notNama);
  }
  console.log((ok?'✓':'✗')+' '+String(i+1).padStart(2)+'. ['+r.status.padEnd(14)+'] "'+line+'" → '+nama+' ['+(r.best?r.best.satuan:'—')+'] Rp '+harga.toLocaleString('id-ID'));
  if (ok) pass++;
  else { fail++; fails.push((i+1)+'. "'+line+'" → '+r.status+'/'+nama+'/'+harga+' ≠ '+JSON.stringify(exp)); }
});
console.log('\nHASIL: '+pass+'/'+CASES.length+' sesuai harapan · '+autoOk+' hijau otomatis');
if (fails.length){ console.log('GAGAL:'); fails.forEach(f => console.log(' - '+f)); process.exit(1); }
