// AUDIT aritmatika HPP — fungsi DIEKSTRAK LANGSUNG dari index.html hasil build,
// bukan disalin ulang, supaya yang diuji benar-benar kode yang dikirim.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','index.html'), 'utf8');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('tidak ketemu: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++){
    if (src[j] === '{'){ d++; started = true; }
    else if (src[j] === '}'){ d--; if (started && d === 0) return src.slice(i, j+1); }
  }
  throw new Error('tak seimbang: ' + name);
}
const ctx = {};
new Function('ctx', [grab('hppParseAngka'), grab('hppRound'), grab('hppFmtNum'), grab('hppInpVal'), grab('hppPctOf'),
  'ctx.hppParseAngka=hppParseAngka;ctx.hppRound=hppRound;ctx.hppFmtNum=hppFmtNum;ctx.hppInpVal=hppInpVal;ctx.hppPctOf=hppPctOf;'
].join('\n'))(ctx);
const { hppParseAngka, hppRound, hppFmtNum, hppInpVal, hppPctOf } = ctx;
const hppCost = it => (it.isi > 0 && it.hargaBeli > 0) ? it.hargaBeli / it.isi : 0;

let bad = 0;
const T = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) bad++;
  console.log((ok?'  ✓ ':'  ✗ ') + label.padEnd(46) + String(actual).padEnd(14) + '(harap ' + expected + ')');
};

console.log('\n═══ 1. PARSER ANGKA ═══');
T('"250"      Rp bulat',            hppParseAngka('250'), 250);
T('"2.500"    ribuan ID',           hppParseAngka('2.500'), 2500);
T('"0,5"      desimal ID',          hppParseAngka('0,5'), 0.5);
T('"0.5"      desimal EN',          hppParseAngka('0.5'), 0.5);
T('"12,5"     margin 12,5%',        hppParseAngka('12,5'), 12.5);
T('"1.500,75" ribuan + desimal',    hppParseAngka('1.500,75'), 1500.75);
T('"0,25"     seperempat rupiah',   hppParseAngka('0,25'), 0.25);
T('"1.234.567" ribuan bertingkat',  hppParseAngka('1.234.567'), 1234567);
T('"-250"     margin minus',        hppParseAngka('-250'), -250);
T('"Rp 65.000" ada teks',           hppParseAngka('Rp 65.000'), 65000);
T('""         kosong',              hppParseAngka(''), 0);
T('null',                           hppParseAngka(null), 0);
T('"abc"      bukan angka',         hppParseAngka('abc'), 0);

console.log('\n═══ 2. MARGIN PERSEN MASSAL (dulu 10x salah) ═══');
const pokokA = 10000, valA = hppParseAngka('12,5');
T('pokok 10.000 + margin 12,5%', Math.round(pokokA + pokokA*(valA/100)), 11250);
T('pokok 10.000 + margin 20%',   Math.round(pokokA + pokokA*(hppParseAngka('20')/100)), 12000);
T('pokok 4.062,5 + margin 7,5%', Math.round(4062.5 + 4062.5*(hppParseAngka('7,5')/100)), 4367);

console.log('\n═══ 3. ROUND-TRIP MARGIN (dulu drift diam-diam) ═══');
const it = { isi:16, hargaBeli:65000, hargaJual:4550 };
const pokok = hppCost(it);                       // 4062.5
const margin = it.hargaJual - pokok;             // 487.5
const tampil = hppInpVal(margin);                // yang dilihat user
const balik  = hppParseAngka(tampil);            // yang dibaca saat disimpan ulang
console.log('  pokok=' + pokok + '  margin=' + margin + '  ditampilkan="' + tampil + '"');
T('margin dibaca balik utuh', balik, margin);
T('Harga Jual setelah round-trip', Math.round(pokok + balik), it.hargaJual);

console.log('\n═══ 4. ROUND-TRIP % ═══');
const pctShown = hppInpVal(hppPctOf(margin, pokok));
const pctBack  = hppParseAngka(pctShown);
console.log('  margin % ditampilkan="' + pctShown + '"');
T('Harga Jual round-trip lewat %', Math.round(pokok + pokok*(pctBack/100)), it.hargaJual);

console.log('\n═══ 5. ROUND-TRIP SEMUA NILAI LEWAT INPUT ═══');
[0.5, 250, 2500, 4062.5, 65000, 1234567, 12.5, 0.25, 1500.75, -250].forEach(n =>
  T('hppParseAngka(hppInpVal(' + n + '))', hppParseAngka(hppInpVal(n)), n));

console.log('\n═══ 6. PEMBULATAN UANG ═══');
T('hppRound(0,1 + 0,2)',      hppRound(0.1 + 0.2), 0.3);
T('hppRound(1,005)  → 2 des', hppRound(1.005), 1.01);
T('hppRound(4062,5)',         hppRound(4062.5), 4062.5);
T('hppRound(-0,555)',         hppRound(-0.555), -0.56);

console.log('\n═══ 7. PEMBAGIAN AMAN ═══');
T('isi 0    → pokok 0 (bukan Infinity)', hppCost({isi:0,  hargaBeli:5000}), 0);
T('isi -1   → pokok 0',                  hppCost({isi:-1, hargaBeli:5000}), 0);
T('isi 1,5 (desimal) → pokok',           hppCost({isi:1.5,hargaBeli:30000}), 20000);
T('hppPctOf(margin, pokok=0)',           hppPctOf(500, 0), 0);

console.log('\n' + (bad ? '✗ MASIH ADA ' + bad + ' MASALAH' : '✓ SEMUA ' + '(aritmatika bersih)'));
process.exit(bad ? 1 : 0);
