/* โหลดไลบรารี Excel เฉพาะตอนที่ใช้ (นำเข้า / ส่งออก / ดาวน์โหลดแม่แบบ) เพื่อให้หน้าเว็บเปิดเร็วบนมือถือและเน็ตโรงงาน */
(function (root) {
  var URLS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
  }, GLOBAL = { xlsx: 'XLSX', exceljs: 'ExcelJS' }, pending = {};
  function one(k) {
    if (root[GLOBAL[k]]) return Promise.resolve(true);
    if (pending[k]) return pending[k];
    return (pending[k] = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = URLS[k];
      s.onload = function () { ok(true); };
      s.onerror = function () { delete pending[k]; s.remove(); ok(false); };
      document.head.appendChild(s);
    }));
  }
  root.lbLoaded = function (ks) { return ks.every(function (k) { return !!root[GLOBAL[k]]; }); };
  root.lbLoad = function (ks) { return Promise.all(ks.map(one)); }; /* ไม่ reject: ถ้าโหลดไม่ได้ โค้ดเดิมจะแจ้งข้อความเองอยู่แล้ว */
})(window);
