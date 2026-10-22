/* เก็บข้อผิดพลาดของหน้าเว็บลงตาราง lb_errors (ต้องรัน supabase/backup_logs.sql) ถ้ายังไม่มีตารางจะเงียบและหยุดส่ง */
(function () {
  var sent = 0, MAX = 5, seen = {}, ready = true;
  function send(msg, stack) {
    var c = window.__lbCloud, db = c && c.db && c.db();
    if (!db || !ready || sent >= MAX) return;
    var key = String(msg).slice(0, 120); if (seen[key]) return;
    seen[key] = 1; sent++;
    var I = c.info();
    db.from('lb_errors').insert({ user_name: I.user, job: I.job, msg: String(msg).slice(0, 500), stack: String(stack || '').slice(0, 2000), url: location.pathname, ua: navigator.userAgent.slice(0, 200) })
      .then(function (r) { if (r.error && /lb_errors|schema cache|does not exist/i.test(r.error.message || '')) ready = false; }, function () {});
  }
  window.addEventListener('error', function (e) { if (e.message) send(e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; send('Promise: ' + ((r && r.message) || r), r && r.stack); });
  window.lbLogError = send;
})();
