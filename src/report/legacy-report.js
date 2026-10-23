// Laporan PDF PNL dan Arsip. Kode di bawah = SALINAN PERSIS dari legacy/berkah-admin-1.5.0.html
// (pnBuildReportHTML, pnReportCSS, pnReportScript, arsBuildReportHTML, arsReportScript) supaya
// tampilannya identik. Satu-satunya tambahan: ekspor di akhir file dan pengubah data hari/arsip
// ke bentuk lama ({tanggal: ms lokal}). Skrip laporan dijalankan di jendela baru lewat
// Function.prototype.toString, jadi fungsi *ReportScript harus tetap mandiri (tanpa variabel luar).
function pnBuildReportHTML(data){
  const p = [];
  p.push('<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">');
  p.push('<meta name="viewport" content="width=device-width,initial-scale=1.0">');
  p.push('<title>Laporan PNL — Toko Berkah</title>');
  p.push('<link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">');
  p.push('<style>' + pnReportCSS() + '</style></head><body>');
  p.push('<div class="topbar"><div class="brand">Toko <em>Berkah</em> &mdash; Laporan PNL</div>');
  p.push('<button class="btn-pdf" id="btn-print">&#8659; Download PDF</button></div>');
  p.push('<div class="page" id="page"></div>');
  p.push('<script>document.getElementById("btn-print").addEventListener("click",function(){window.print();});');
  p.push('(' + pnReportScript.toString() + ')(' + JSON.stringify(data) + ');<\/script>');
  p.push('</body></html>');
  return p.join('');
}
function pnReportCSS(){
  // Font: serif "PT Serif" (baca utama, ala koran — bukan lagi serif dekoratif
  // tipis + label monospace kecil yang bikin "kurang cocok/susah dibaca").
  // Hanya SATU family di-load dari Google Fonts (vs 3 sebelumnya) — sans &
  // monospace pakai font sistem supaya tetap tampil benar walau font gagal
  // load pas window.print() dipanggil (root sebab tampilan font "aneh").
  return ':root{--cream:#f7f4ef;--cream2:#ede9e0;--ink:#1a1714;--ink2:#3d3530;--ink3:#6b5f58;--ink4:#7d716a;--rust:#8b3a2a;--rust2:#b04a37;--rust3:#d4604a;--green:#2a4a35;--amber:#93690f;--border:rgba(26,23,20,.14);--border2:rgba(26,23,20,.08);--serif:"PT Serif",Georgia,"Times New Roman",serif;--sans:Arial,Helvetica,sans-serif;--num:Consolas,"Liberation Mono",Menlo,monospace;}' +
  // print-color-adjust:exact — paksa browser cetak WARNA LATAR (kartu gelap,
  // bar chart, header tabel) walau opsi "background graphics" user tidak
  // dicentang. Tanpa ini, .kpi-card.dark kehilangan latar hitamnya saat
  // print/PDF, sehingga teks terang yang didesain untuk latar gelap jadi
  // abu-abu pudar di atas kertas putih — inilah sebab "total income/kulakan
  // samar, tidak terang" pada laporan sebelumnya.
  '*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;color-adjust:exact;print-color-adjust:exact;}' +
  'body{background:var(--cream);color:var(--ink);font-family:var(--serif);font-size:14px;line-height:1.65;}' +
  '.topbar{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--ink);padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:52px;}' +
  '.brand{font-family:var(--serif);font-size:18px;color:var(--cream);}.brand em{font-style:italic;color:var(--rust3);}' +
  '.btn-pdf{padding:7px 16px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:none;background:var(--rust2);color:#fff;font-family:var(--sans);}' +
  '.page{max-width:900px;margin:0 auto;padding:76px 28px 60px;}' +
  '.hero{display:grid;grid-template-columns:1fr auto;align-items:end;gap:24px;padding-bottom:32px;border-bottom:3px solid var(--ink);margin-bottom:44px;}' +
  '.eyebrow{font-family:var(--sans);font-size:11px;letter-spacing:1px;color:var(--rust2);text-transform:uppercase;font-weight:700;margin-bottom:10px;}' +
  '.h-title{font-family:var(--serif);font-size:44px;font-weight:400;line-height:1.15;}.h-title strong{font-weight:700;}' +
  '.h-meta{font-size:12px;color:var(--ink3);margin-top:10px;font-family:var(--sans);}' +
  '.period{text-align:right;}.period-label{font-size:10px;color:var(--ink3);font-family:var(--sans);letter-spacing:1px;font-weight:700;}' +
  '.period-val{font-family:var(--serif);font-size:21px;font-weight:400;line-height:1.35;}' +
  '.sec{display:flex;align-items:center;gap:12px;margin:44px 0 18px;}.sec-line{flex:1;height:1px;background:var(--border);}' +
  '.sec-text{font-family:var(--sans);font-size:11px;letter-spacing:1.5px;color:var(--ink3);text-transform:uppercase;font-weight:700;white-space:nowrap;}' +
  '.kpi{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--border);border-radius:2px;overflow:hidden;margin-bottom:44px;}' +
  '.kpi-card{padding:18px 16px 14px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:#fff;}' +
  '.kpi-card:nth-child(4n){border-right:none;}.kpi-card.dark{background:var(--ink);}' +
  '.kpi-card.dark .kpi-l{color:rgba(255,255,255,.72);}.kpi-card.dark .kpi-v{color:#fff;}.kpi-card.dark .kpi-s{color:rgba(255,255,255,.58);}' +
  '.kpi-l{font-family:var(--sans);font-size:11px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;color:var(--ink3);margin-bottom:8px;}' +
  '.kpi-v{font-family:var(--serif);font-size:23px;font-weight:700;line-height:1.15;}' +
  '.kpi-v.pos{color:var(--green);}.kpi-v.neg{color:var(--rust2);}.kpi-v.warn{color:var(--amber);}' +
  '.kpi-s{font-size:11px;color:var(--ink3);margin-top:4px;font-family:var(--sans);}' +
  '.bar-chart{display:flex;flex-direction:column;gap:6px;margin-bottom:44px;}.bar-row{display:flex;align-items:center;gap:10px;}' +
  '.bar-lbl{font-family:var(--sans);font-size:11px;color:var(--ink3);width:88px;text-align:right;flex-shrink:0;}' +
  '.bar-lbl.wide{width:150px;line-height:1.3;}' +
  '.bar-tr{flex:1;height:18px;background:var(--cream2);}.bar-f{height:100%;background:var(--ink);}' +
  '.bar-v{font-family:var(--num);font-size:11px;color:var(--ink2);width:84px;flex-shrink:0;}' +
  'table{width:100%;border-collapse:collapse;font-size:12.5px;}.tw{overflow-x:auto;border:1px solid var(--border);margin-bottom:44px;}' +
  'thead tr{border-bottom:2px solid var(--ink);}thead th{padding:9px 12px;text-align:left;font-family:var(--sans);font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;color:var(--ink2);white-space:nowrap;background:var(--cream2);}' +
  'thead th.r{text-align:right;}tbody tr{border-bottom:1px solid var(--border2);}tbody td{padding:8px 12px;color:var(--ink2);font-family:var(--serif);}' +
  'tbody td.r{text-align:right;font-family:var(--num);font-size:11.5px;}tbody td.l{font-weight:700;color:var(--ink);}' +
  'tbody td.pos{text-align:right;font-family:var(--num);font-size:11.5px;color:var(--green);}' +
  'tbody td.neg{text-align:right;font-family:var(--num);font-size:11.5px;color:var(--rust2);}' +
  'tbody td.warn{text-align:right;font-family:var(--num);font-size:11.5px;color:var(--amber);}' +
  'tbody td.mu{color:var(--ink3);font-size:11.5px;font-family:var(--sans);}' +
  '.tot td{font-weight:700;border-top:2px solid var(--ink);background:var(--cream2);font-family:var(--num);font-size:11.5px;}' +
  '.tot td.l{font-family:var(--sans);}' +
  '.rin-day{margin-bottom:20px;}.rin-head{display:flex;align-items:baseline;gap:10px;padding-bottom:7px;border-bottom:1px solid var(--border);margin-bottom:8px;}' +
  '.rin-date{font-family:var(--serif);font-size:17px;font-weight:700;}' +
  '.rin-hari{font-family:var(--sans);font-size:10.5px;color:var(--ink3);letter-spacing:.5px;}' +
  '.rin-item{display:flex;justify-content:space-between;padding:3px 0 3px 8px;border-bottom:1px solid var(--border2);}' +
  '.rin-cat{font-size:9.5px;font-family:var(--sans);font-weight:700;color:var(--ink3);margin-right:6px;}' +
  '.rin-ket{font-size:12.5px;color:var(--ink2);font-family:var(--serif);}.rin-val{font-family:var(--num);font-size:11.5px;color:var(--ink2);}' +
  '.footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}' +
  '.footer-brand{font-family:var(--serif);font-size:15px;font-weight:700;color:var(--ink3);}' +
  '.footer-meta{font-family:var(--sans);font-size:10px;color:var(--ink3);letter-spacing:.5px;text-align:right;}' +
  '@media print{.topbar,.btn-pdf{display:none!important;}.page{padding-top:20px!important;max-width:100%!important;}@page{margin:18mm 14mm;size:A4;}}' +
  '@media(max-width:640px){.kpi{grid-template-columns:repeat(2,1fr);}.hero{grid-template-columns:1fr;}.page{padding:68px 14px 40px;}}';
}
function pnReportScript(data){
  function R(n){ const a = Math.abs(Math.round(n)); return (n<0?'−':'') + a.toLocaleString('id-ID'); }
  function D(t){ return new Date(t).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); }
  function Ds(t){ return new Date(t).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}); }
  function H(t){ return ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][new Date(t).getDay()]; }
  function Hf(t){ return ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(t).getDay()]; }
  function E(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function sum(a,k){ return a.reduce(function(s,r){ return s + (r[k]||0); }, 0); }
  function mpCls(mp){ return mp >= 15 ? 'pos' : mp >= 0 ? 'warn' : 'neg'; }
  var ti=sum(data,'income'), tk=sum(data,'kulakan'), tg=sum(data,'gross'), tn=sum(data,'netPos');
  var tp=sum(data,'totalPengeluaran'), tpr=sum(data,'totalPrive');
  var mp = ti>0?tg/ti*100:0, mc = ti>0?tn/ti*100:0;
  var d0 = data[0].tanggal, d1 = data[data.length-1].tanggal;
  var now = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  var maxI = Math.max.apply(null, data.map(function(r){ return r.income; }).concat([1]));
  var html = '';
  html += '<div class="hero"><div><div class="eyebrow">Laporan Keuangan Harian</div>';
  html += '<div class="h-title">Profit &amp; <strong>Loss</strong><br>Toko Berkah</div>';
  html += '<div class="h-meta">'+data.length+' hari data &middot; Digenerate '+now+'</div></div>';
  html += '<div class="period"><div class="period-label">PERIODE</div><div class="period-val">'+D(d0)+'<br>'+D(d1)+'</div></div></div>';
  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Ringkasan Eksekutif</div><div class="sec-line"></div></div><div class="kpi">';
  var kpis = [
    {l:'Total Income', v:'Rp '+R(ti), s:data.length+' hari operasional', dark:1},
    {l:'Total Kulakan', v:'Rp '+R(tk), s:'HPP total', dark:1},
    {l:'Total Gross', v:'Rp '+R(tg), s:'Income − Kulakan', c:tg>=0?'pos':'neg'},
    {l:'Net Position', v:'Rp '+R(tn), s:'Cash − Kulakan', c:tn>=0?'pos':'neg'},
    {l:'Pengeluaran', v:'Rp '+R(tp), s:'Operasional total'},
    {l:'Prive', v:'Rp '+R(tpr), s:'Ambil pribadi total'},
    {l:'Margin Performa', v:mp.toFixed(1)+'%', s:'Tertimbang · target ≥15%', c:mpCls(mp)},
    {l:'Margin Cash', v:mc.toFixed(1)+'%', s:'Tertimbang · target ≥0%', c:mc>=0?'pos':'neg'},
  ];
  kpis.forEach(function(k){
    html += '<div class="kpi-card'+(k.dark?' dark':'')+'"><div class="kpi-l">'+k.l+'</div><div class="kpi-v'+(k.c?' '+k.c:'')+'">'+k.v+'</div><div class="kpi-s">'+k.s+'</div></div>';
  });
  html += '</div>';
  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Income Harian</div><div class="sec-line"></div></div><div class="bar-chart">';
  data.forEach(function(r){
    html += '<div class="bar-row"><div class="bar-lbl">'+Ds(r.tanggal)+'</div><div class="bar-tr"><div class="bar-f" style="width:'+(r.income/maxI*100).toFixed(1)+'%"></div></div><div class="bar-v">'+R(r.income)+'</div></div>';
  });
  html += '</div>';
  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Detail Harian</div><div class="sec-line"></div></div>';
  html += '<div class="tw"><table><thead><tr><th>Tanggal</th><th>Hari</th><th class="r">Income</th><th class="r">Kulakan</th><th class="r">Pnglrn</th><th class="r">Prive</th><th class="r">Gross</th><th class="r">Net Pos</th><th class="r">Margin%</th><th class="r">Cash%</th></tr></thead><tbody>';
  data.forEach(function(r){
    html += '<tr><td class="l">'+D(r.tanggal)+'</td><td class="mu">'+H(r.tanggal)+'</td><td class="r">'+R(r.income)+'</td><td class="r">'+R(r.kulakan)+'</td><td class="r">'+R(r.totalPengeluaran)+'</td><td class="r">'+R(r.totalPrive)+'</td>';
    html += '<td class="'+(r.gross>=0?'pos':'neg')+'">'+R(r.gross)+'</td><td class="'+(r.netPos>=0?'pos':'neg')+'">'+R(r.netPos)+'</td>';
    html += '<td class="'+mpCls(r.marginP)+'">'+r.marginP.toFixed(1)+'%</td><td class="'+(r.marginC>=0?'pos':'neg')+'">'+r.marginC.toFixed(1)+'%</td></tr>';
  });
  html += '<tr class="tot"><td colspan="2">TOTAL</td><td class="r">'+R(ti)+'</td><td class="r">'+R(tk)+'</td><td class="r">'+R(tp)+'</td><td class="r">'+R(tpr)+'</td>';
  html += '<td class="'+(tg>=0?'pos':'neg')+'">'+R(tg)+'</td><td class="'+(tn>=0?'pos':'neg')+'">'+R(tn)+'</td>';
  html += '<td class="'+mpCls(mp)+'">'+mp.toFixed(1)+'%</td><td class="'+(mc>=0?'pos':'neg')+'">'+mc.toFixed(1)+'%</td></tr></tbody></table></div>';
  var byBulan = {};
  data.forEach(function(r){
    var k = new Date(r.tanggal).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
    (byBulan[k] = byBulan[k] || []).push(r);
  });
  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Rekap Bulanan</div><div class="sec-line"></div></div>';
  html += '<div class="tw"><table><thead><tr><th>Bulan</th><th class="r">Hari</th><th class="r">Income</th><th class="r">Kulakan</th><th class="r">Gross</th><th class="r">Net Pos</th><th class="r">Margin%</th><th class="r">Cash%</th></tr></thead><tbody>';
  Object.keys(byBulan).forEach(function(b){
    var rows = byBulan[b];
    var bi=sum(rows,'income'), bk=sum(rows,'kulakan'), bg=sum(rows,'gross'), bn=sum(rows,'netPos');
    var bmp=bi>0?bg/bi*100:0, bmc=bi>0?bn/bi*100:0;
    html += '<tr><td class="l">'+b+'</td><td class="r mu">'+rows.length+'</td><td class="r">'+R(bi)+'</td><td class="r">'+R(bk)+'</td>';
    html += '<td class="'+(bg>=0?'pos':'neg')+'">'+R(bg)+'</td><td class="'+(bn>=0?'pos':'neg')+'">'+R(bn)+'</td>';
    html += '<td class="'+mpCls(bmp)+'">'+bmp.toFixed(1)+'%</td><td class="'+(bmc>=0?'pos':'neg')+'">'+bmc.toFixed(1)+'%</td></tr>';
  });
  html += '</tbody></table></div>';
  var hasRin = data.some(function(r){ return (r.rincianPengeluaran||[]).length + (r.rincianPrive||[]).length > 0; });
  if (hasRin){
    html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Rincian Pengeluaran &amp; Prive</div><div class="sec-line"></div></div>';
    data.forEach(function(r){
      var items = (r.rincianPengeluaran||[]).map(function(i){ return {c:'PENGELUARAN', k:i.ket, j:i.jumlah}; })
        .concat((r.rincianPrive||[]).map(function(i){ return {c:'PRIVE', k:i.ket, j:i.jumlah}; }));
      if (!items.length) return;
      html += '<div class="rin-day"><div class="rin-head"><div class="rin-date">'+new Date(r.tanggal).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})+'</div><div class="rin-hari">'+Hf(r.tanggal)+'</div></div>';
      items.forEach(function(it){
        html += '<div class="rin-item"><div><span class="rin-cat">'+it.c+'</span><span class="rin-ket">'+E(it.k)+'</span></div><div class="rin-val">Rp '+R(it.j)+'</div></div>';
      });
      html += '</div>';
    });
  }
  html += '<div class="footer"><div class="footer-brand">Toko Berkah</div>';
  html += '<div class="footer-meta">LAPORAN PNL &middot; '+D(d0)+' – '+D(d1)+'<br>DIGENERATE '+now+' &middot; ✳ CLAUDE FABLE 5</div></div>';
  document.getElementById('page').innerHTML = html;
}

function arsBuildReportHTML(entries){
  const p = [];
  p.push('<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">');
  p.push('<meta name="viewport" content="width=device-width,initial-scale=1.0">');
  p.push('<title>Laporan Arsip Pengeluaran & Prive — Toko Berkah</title>');
  p.push('<link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">');
  p.push('<style>' + pnReportCSS() + '</style></head><body>');
  p.push('<div class="topbar"><div class="brand">Toko <em>Berkah</em> &mdash; Laporan Arsip</div>');
  p.push('<button class="btn-pdf" id="btn-print">&#8659; Download PDF</button></div>');
  p.push('<div class="page" id="page"></div>');
  p.push('<script>document.getElementById("btn-print").addEventListener("click",function(){window.print();});');
  p.push('(' + arsReportScript.toString() + ')(' + JSON.stringify(entries) + ');<\/script>');
  p.push('</body></html>');
  return p.join('');
}
function arsReportScript(data){
  function R(n){ const a = Math.abs(Math.round(n)); return (n<0?'−':'') + a.toLocaleString('id-ID'); }
  function E(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function normKet(k){ return String(k).toLowerCase().replace(/\s+/g,' ').trim() || '-'; }
  var now = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  var tp = 0, tv = 0;
  data.forEach(function(e){ if (e.j==='p') tp += e.amt; else tv += e.amt; });
  var total = tp + tv;
  var dsSet = {}; data.forEach(function(e){ dsSet[e.ds] = 1; });
  var dsAll = Object.keys(dsSet).sort();
  var nDays = dsAll.length;
  var rata = nDays ? total/nDays : 0;
  function fmtDs(ds){
    var parts = ds.split('-').map(Number);
    var dt = new Date(parts[0], parts[1]-1, parts[2]);
    return dt.getDate()+' '+['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][dt.getMonth()]+' '+dt.getFullYear();
  }
  function hariOf(ds){
    var parts = ds.split('-').map(Number);
    var dt = new Date(parts[0], parts[1]-1, parts[2]);
    return ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][dt.getDay()];
  }
  var html = '';
  html += '<div class="hero"><div><div class="eyebrow">Laporan Kas Keluar</div>';
  html += '<div class="h-title">Pengeluaran &amp; <strong>Prive</strong><br>Toko Berkah</div>';
  html += '<div class="h-meta">'+data.length+' entri &middot; '+nDays+' hari &middot; Digenerate '+now+'</div></div>';
  html += '<div class="period"><div class="period-label">PERIODE</div><div class="period-val">' +
    (dsAll.length ? fmtDs(dsAll[0])+'<br>'+fmtDs(dsAll[dsAll.length-1]) : '—') + '</div></div></div>';

  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Ringkasan</div><div class="sec-line"></div></div><div class="kpi">';
  var kpis = [
    {l:'Total Pengeluaran', v:'Rp '+R(tp), s:'Operasional', dark:1},
    {l:'Total Prive', v:'Rp '+R(tv), s:'Ambil pribadi', dark:1},
    {l:'Total Gabungan', v:'Rp '+R(total), s:'Pengeluaran + Prive'},
    {l:'Jumlah Entri', v:String(data.length), s:'Tercatat pada filter ini'},
    {l:'Cakupan Hari', v:String(nDays)+' hari', s:'Hari dengan entri'},
    {l:'Rata-rata / Hari', v:'Rp '+R(rata), s:'Gabungan ÷ hari'},
  ];
  kpis.forEach(function(k){
    html += '<div class="kpi-card'+(k.dark?' dark':'')+'"><div class="kpi-l">'+k.l+'</div><div class="kpi-v">'+k.v+'</div><div class="kpi-s">'+k.s+'</div></div>';
  });
  html += '</div>';

  var groups = {}, order = [];
  data.forEach(function(e){
    var k = normKet(e.ket) + '|' + e.j;
    if (!groups[k]){ groups[k] = { label:(e.ket==='-'?'(tanpa keterangan)':e.ket)+(e.j==='p'?' · Pengeluaran':' · Prive'), total:0 }; order.push(k); }
    groups[k].total += e.amt;
  });
  var sorted = order.map(function(k){ return groups[k]; }).sort(function(a,b){ return b.total-a.total; });
  var maxG = Math.max.apply(null, sorted.map(function(g){ return g.total; }).concat([1]));
  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Porsi per Keterangan</div><div class="sec-line"></div></div><div class="bar-chart">';
  sorted.forEach(function(g){
    html += '<div class="bar-row"><div class="bar-lbl wide">'+E(g.label)+'</div><div class="bar-tr"><div class="bar-f" style="width:'+(g.total/maxG*100).toFixed(1)+'%"></div></div><div class="bar-v">'+R(g.total)+'</div></div>';
  });
  html += '</div>';

  html += '<div class="sec"><div class="sec-line"></div><div class="sec-text">Rincian per Tanggal</div><div class="sec-line"></div></div>';
  var byDs = {};
  data.forEach(function(e){ (byDs[e.ds] = byDs[e.ds] || []).push(e); });
  Object.keys(byDs).sort(function(a,b){ return b.localeCompare(a); }).forEach(function(ds){
    var items = byDs[ds];
    var sub = items.reduce(function(s,e){ return s+e.amt; }, 0);
    html += '<div class="rin-day"><div class="rin-head" style="justify-content:space-between;">' +
      '<span><span class="rin-date">'+fmtDs(ds)+'</span> <span class="rin-hari">'+hariOf(ds)+'</span></span>' +
      '<span class="rin-val" style="font-weight:700;">Rp '+R(sub)+'</span></div>';
    items.forEach(function(it){
      html += '<div class="rin-item"><div><span class="rin-cat">'+(it.j==='p'?'PENGELUARAN':'PRIVE')+'</span><span class="rin-ket">'+E(it.ket)+'</span></div><div class="rin-val">Rp '+R(it.amt)+'</div></div>';
    });
    html += '</div>';
  });
  html += '<div class="tw" style="border:none;margin-top:-8px;"><table><tbody><tr class="tot"><td class="l">TOTAL GABUNGAN</td><td class="r">Rp '+R(total)+'</td></tr></tbody></table></div>';

  html += '<div class="footer"><div class="footer-brand">Toko Berkah</div>';
  html += '<div class="footer-meta">LAPORAN ARSIP &middot; '+(dsAll.length ? fmtDs(dsAll[0])+' – '+fmtDs(dsAll[dsAll.length-1]) : '—')+'<br>DIGENERATE '+now+' &middot; ✳ CLAUDE FABLE 5</div></div>';
  document.getElementById('page').innerHTML = html;
}

// Hari PNL kita (string YYYY-MM-DD) -> bentuk lama dengan tanggal = ms tengah malam LOKAL.
export function legacyDays(days) {
  return days.map((d) => {
    const [y, m, dd] = d.ds.split('-').map(Number);
    const { ds, ...rest } = d;
    void ds;
    return { ...rest, tanggal: new Date(y, m - 1, dd, 0, 0, 0, 0).getTime() };
  });
}

export const pnlReportHtml = (days) => pnBuildReportHTML(legacyDays(days));
export const arsipReportHtml = (entries) => arsBuildReportHTML(entries);
