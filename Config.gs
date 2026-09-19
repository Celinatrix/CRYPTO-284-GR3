/**
 * Config.gs
 * ============================================================
 * ĐÃ SỬA (Quy tắc bảo mật #1 — Ẩn API Key):
 *   TRƯỚC: các file gốc (giả định) khai báo trực tiếp trong code, ví dụ:
 *
 *       const SHEET_ID = '1AbCxyz...';
 *       const STAFF_PIN = '123456';
 *
 *   SAU: KHÔNG còn secret nào nằm trong mã nguồn. Mọi giá trị nhạy cảm
 *   (Sheet ID, khóa HMAC, hash PIN nhân viên) được lưu trong
 *   PropertiesService (Script Properties) — nơi lưu trữ riêng của từng
 *   project Apps Script, không xuất hiện trong file .gs, không bị commit
 *   lên Git. Hàm setupSecrets() bên dưới chỉ chạy 1 LẦN DUY NHẤT trong
 *   trình soạn thảo Apps Script (không chạy qua Web App).
 * ============================================================
 */

// ===== Hằng số KHÔNG nhạy cảm — an toàn khi để trong code =====
const SHEET_NAME_DANGKY = 'DangKy';
const SHEET_NAME_CHECKIN = 'CheckIn';
const EVENT_NAME = 'Hội thảo Nghị định 284/2026 — Tiền điện tử & Tài sản mã hóa'; // Dùng nội bộ: trang Check-in, email thông báo cho admin
const EVENT_NAME_EN = 'Decree 284/2026 Compliance Seminar'; // Dùng cho nội dung gửi khách (hội thảo quốc tế) — khớp tiêu đề trên website
const EVENT_DATE_TEXT = 'September 20, 2026, 08:00 AM – 12:30 PM (ICT)';
const TICKET_PREFIX = 'ND284-';
const ADMIN_EMAIL = 'kiethuynh.31241024506@st.ueh.edu.vn'; // Email nhận thông báo mỗi khi có đăng ký mới — đổi nếu cần

// ===== Đọc secrets từ Script Properties (KHÔNG bao giờ hard-code ở đây) =====

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

/** Sheet ID — KHÔNG bao giờ để client (frontend) biết giá trị này (Quy tắc #3). */
function getSheetId_() {
  const id = getScriptProps_().getProperty('SHEET_ID');
  if (!id) throw new Error('Chưa cấu hình SHEET_ID. Hãy chạy setupSecrets() trong Apps Script Editor trước.');
  return id;
}

/** Khóa bí mật dùng để ký (HMAC-SHA256) token gắn với mã vé (Quy tắc #8). */
function getHmacSecret_() {
  const s = getScriptProps_().getProperty('HMAC_SECRET');
  if (!s) throw new Error('Chưa cấu hình HMAC_SECRET. Hãy chạy setupSecrets() trong Apps Script Editor trước.');
  return s;
}

/** Hash SHA-256(salt + PIN) của PIN nhân viên — không lưu PIN gốc ở đâu cả (Quy tắc #11). */
function getStaffPinHash_() {
  const h = getScriptProps_().getProperty('STAFF_PIN_HASH');
  if (!h) throw new Error('Chưa cấu hình STAFF_PIN_HASH. Hãy chạy setupSecrets() trong Apps Script Editor trước.');
  return h;
}

function getStaffPinSalt_() {
  const s = getScriptProps_().getProperty('STAFF_PIN_SALT');
  if (!s) throw new Error('Chưa cấu hình STAFF_PIN_SALT. Hãy chạy setupSecrets() trong Apps Script Editor trước.');
  return s;
}

/**
 * setupSecrets()
 * ------------------------------------------------------------
 * CHẠY HÀM NÀY ĐÚNG 1 LẦN, TRỰC TIẾP TRONG APPS SCRIPT EDITOR
 * (menu Run ▶ setupSecrets). KHÔNG deploy hàm này ra Web App.
 *
 * Sau khi chạy xong và thấy log "Đã lưu secrets...", hãy XÓA hoặc
 * comment lại 2 dòng có giá trị thật (SHEET_ID, STAFF_PIN_RAW) bên dưới
 * để không ai đọc được PIN gốc / Sheet ID khi xem lại code hoặc khi
 * code được đẩy lên Git.
 * ------------------------------------------------------------
 */
function setupSecrets() {
  const props = getScriptProps_();

  // 1) ID của Google Sheet chứa 2 tab "DangKy" và "CheckIn"
  //    (lấy từ URL Sheet: https://docs.google.com/spreadsheets/d/ĐÂY_LÀ_ID/edit)
  const SHEET_ID = 'DÁN_SHEET_ID_THẬT_VÀO_ĐÂY';

  // 2) Khóa bí mật cho HMAC — sinh ngẫu nhiên, không cần nhớ, chỉ cần lưu 1 lần
  const HMAC_SECRET = Utilities.getUuid() + '-' + Utilities.getUuid();

  // 3) PIN nhân viên gốc — CHỈ dùng tại đây để băm, KHÔNG lưu ở nơi khác.
  //    Sau khi chạy xong hàm này, XÓA dòng chứa PIN thật khỏi code.
  const STAFF_PIN_RAW = 'DÁN_PIN_NHÂN_VIÊN_THẬT_VÀO_ĐÂY';
  const STAFF_PIN_SALT = Utilities.getUuid();
  const STAFF_PIN_HASH = hashPin_(STAFF_PIN_RAW, STAFF_PIN_SALT);

  props.setProperties({
    'SHEET_ID': SHEET_ID,
    'HMAC_SECRET': HMAC_SECRET,
    'STAFF_PIN_SALT': STAFF_PIN_SALT,
    'STAFF_PIN_HASH': STAFF_PIN_HASH
  }, true);

  Logger.log('Đã lưu secrets vào Script Properties. HÃY XÓA giá trị SHEET_ID / STAFF_PIN_RAW khỏi code ngay bây giờ!');
}
