/**
 * Utils.gs
 * ============================================================
 * Các hàm dùng chung cho toàn bộ project: escape dữ liệu, che thông tin
 * cá nhân, chống Formula Injection, tạo/kiểm tra token HMAC cho vé,
 * so sánh chuỗi an toàn (chống timing attack), helper thao tác Sheet,
 * và helper dựng response chuẩn hoá cho Web App.
 *
 * ĐÃ SỬA so với bản gốc (giả định Utils.gs gốc chỉ có vài hàm định dạng
 * ngày tháng / chuỗi thông thường, CHƯA có các hàm bảo mật bên dưới):
 *   SAU: bổ sung escapeHtml_, sanitizeForSheet_, maskPhone_,
 *        generateTicketToken_/verifyTicketToken_, timingSafeEqual_,
 *        getSheet_, jsonResponse_ — phục vụ trực tiếp Quy tắc #5, #8,
 *        #14, #15, #17.
 * ============================================================
 */

// ---------- Escape / sanitize ----------

/**
 * Escape HTML để chèn AN TOÀN vào email (Quy tắc #15).
 * Lưu ý: đây là escape cho phía SERVER khi dựng email HTML.
 * Ở phía FRONTEND, không dùng cách này — chỉ dùng textContent, không
 * bao giờ dùng innerHTML với dữ liệu người dùng.
 */
function escapeHtml_(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Chống Formula Injection khi ghi vào Google Sheets (Quy tắc #14).
 * Nếu chuỗi bắt đầu bằng = + - @ (Sheets/Excel hiểu là công thức),
 * thêm dấu nháy đơn (') phía trước để Sheets luôn hiểu là văn bản thuần,
 * không thực thi thành công thức (vd "=IMPORTXML(...)").
 */
function sanitizeForSheet_(value) {
  if (value === null || value === undefined) return '';
  let s = String(value).trim();
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }
  return s;
}

/**
 * Che số điện thoại dạng "09xx xxx 567" khi hiển thị trong email (Quy tắc #5).
 * Input: "0912345567" hoặc "+84912345567" → Output: "09xx xxx 567"
 */
function maskPhone_(phone) {
  const digits = String(phone).replace(/\D/g, '');
  const normalized = digits.startsWith('84') ? '0' + digits.slice(2) : digits;
  if (normalized.length < 10) return '0xxx xxx xxx';
  const first2 = normalized.slice(0, 2);
  const last3 = normalized.slice(-3);
  return first2 + 'xx xxx ' + last3;
}

// ---------- HMAC token cho vé (Quy tắc #8) ----------

/**
 * Tạo token ký (HMAC-SHA256) gắn với mã vé + email, dùng để chống đoán
 * mã vé dạng ND284-#### (chỉ 10.000 khả năng, rất dễ dò). Link QR trong
 * email sẽ chứa cả mã vé lẫn token này; checkIn() chỉ chấp nhận khi
 * token khớp VÀ PIN nhân viên đúng.
 */
function generateTicketToken_(ticketCode, email) {
  const secret = getHmacSecret_();
  const raw = ticketCode + '|' + String(email).toLowerCase();
  const signatureBytes = Utilities.computeHmacSha256Signature(raw, secret);
  return signatureBytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function verifyTicketToken_(ticketCode, email, token) {
  if (!token) return false;
  const expected = generateTicketToken_(ticketCode, email);
  return timingSafeEqual_(expected, String(token));
}

/**
 * So sánh 2 chuỗi theo thời gian không đổi — tránh lộ thông tin qua
 * "timing attack" khi so token / hash PIN (dùng cho Quy tắc #8, #11).
 */
function timingSafeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * hashPin_(pin, salt): Băm PIN nhân viên bằng SHA-256(salt + pin) (Quy tắc #11).
 * Không bao giờ so sánh PIN gốc dạng chuỗi thô.
 */
function hashPin_(pin, salt) {
  const raw = salt + '|' + pin;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// ---------- Sheet helpers ----------

/** Mở sheet theo tên, luôn qua Sheet ID lấy từ Script Properties (Quy tắc #1, #3). */
function getSheet_(sheetName) {
  const ss = SpreadsheetApp.openById(getSheetId_());
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName);
  return sheet;
}

// ---------- Response chuẩn hoá cho Web App (Quy tắc #17) ----------

/**
 * Luôn trả về đúng {ok, message} — KHÔNG bao giờ trả mã vé, thông tin
 * người dùng, hay stack trace ra ngoài. Lỗi chi tiết chỉ ghi bằng
 * console.error() ở phía server.
 */
function jsonResponse_(ok, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: ok, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
