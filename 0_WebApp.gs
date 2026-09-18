/**
 * 0_WebApp.gs
 * ============================================================
 * FILE MỚI (không có trong bộ file gốc) — cần thiết vì một project
 * Apps Script Web App chỉ có DUY NHẤT một doGet(e). Đây là nơi phục vụ
 * trang Check-in cho nhân viên (CheckinPage.html) qua HtmlService.
 *
 * Trang đăng ký (registration-section.html) KHÔNG được phục vụ ở đây —
 * nó nằm trên GitHub Pages (HTML tĩnh) và gọi doPost() của Web App này
 * qua fetch().
 * ============================================================
 */
function doGet(e) {
  // Quy tắc #9: chỉ đọc 2 tham số "code" và "token" từ query string,
  // dùng để tự điền sẵn ô Mã vé khi nhân viên quét QR trong email.
  // Đây chỉ là tiện ích điền sẵn — không phải bước xác thực, nên KHÔNG
  // ảnh hưởng tới bảo mật: checkIn() vẫn kiểm tra lại token + PIN ở server.
  const template = HtmlService.createTemplateFromFile('CheckinPage');
  template.prefillCode = (e && e.parameter && e.parameter.code) ? String(e.parameter.code) : '';
  template.prefillToken = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';

  return template.evaluate()
    .setTitle('Check-in — ' + EVENT_NAME)
    // Quy tắc #18: giữ mặc định (không cho phép nhúng trang này trong iframe của site khác)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
