/**
 * 3_CheckIn.gs
 * ============================================================
 * checkIn(payload): được gọi từ CheckinPage.html qua google.script.run
 * (KHÔNG qua doPost — vì mỗi Web App chỉ có 1 doPost/doGet, và trang
 * check-in nằm cùng project Apps Script nên dùng cơ chế gọi hàm trực
 * tiếp của HtmlService, an toàn và đơn giản hơn tự dựng thêm API).
 * TÁI SỬ DỤNG tên hàm & mục đích như file gốc, chỉ sửa phần bảo mật.
 *
 * ĐÃ SỬA (giả định bản gốc so PIN dạng chuỗi thô, không giới hạn số
 * lần thử, không kiểm tra token gắn với vé):
 *
 *   TRƯỚC (giả định):
 *     function checkIn(e) {
 *       const data = JSON.parse(e.postData.contents);
 *       if (data.pin === STAFF_PIN) { ...check-in theo mã vé... }
 *     }
 *
 *   SAU:
 *     - So sánh PIN bằng hash SHA-256(salt+pin), không so chuỗi gốc
 *       (Quy tắc #11).
 *     - Giới hạn 5 lần sai / 10 phút, khóa 15 phút bằng CacheService
 *       (Quy tắc #12).
 *     - Bắt buộc token HMAC khớp với mã vé mới cho check-in, chống
 *       đoán/giả mạo mã vé (Quy tắc #8).
 *     - Trả về đúng {ok, message}, không lộ thông tin thừa (Quy tắc #17).
 *     - Nhận "payload" là object thuần từ google.script.run, không phải
 *       "e" của doPost (khác cơ chế gọi so với bản gốc dùng doPost).
 * ============================================================
 */
function checkIn(payload) {
  try {
    const ticketCode = String((payload && payload.ticketCode) || '').trim();
    const token = String((payload && payload.token) || '').trim();
    const pin = String((payload && payload.pin) || '').trim();

    // ----- Quy tắc #12: kiểm tra đang bị khóa do sai PIN nhiều lần chưa -----
    const lock = checkPinLockout_();
    if (!lock.ok) {
      return lock;
    }

    if (!pin) {
      return { ok: false, message: 'Vui lòng nhập PIN nhân viên.' };
    }

    // ----- Quy tắc #11: so sánh PIN bằng hash, KHÔNG so chuỗi gốc -----
    const salt = getStaffPinSalt_();
    const expectedHash = getStaffPinHash_();
    const actualHash = hashPin_(pin, salt);
    if (!timingSafeEqual_(actualHash, expectedHash)) {
      registerFailedPinAttempt_();
      return { ok: false, message: 'Sai PIN nhân viên.' };
    }
    clearPinAttempts_();

    if (!ticketCode || !token) {
      return { ok: false, message: 'Thiếu thông tin vé (mã vé hoặc token QR).' };
    }

    const sheet = getSheet_(SHEET_NAME_DANGKY);
    const record = findRegistrationByTicket_(sheet, ticketCode);
    if (!record) {
      return { ok: false, message: 'Không tìm thấy vé.' };
    }

    // ----- Quy tắc #8: token phải khớp mã vé + email thì mới cho check-in -----
    if (!verifyTicketToken_(ticketCode, record.email, token)) {
      return { ok: false, message: 'Mã vé không hợp lệ.' };
    }

    if (record.status === 'Đã check-in') {
      return { ok: false, message: 'Vé này đã check-in trước đó.' };
    }

    sheet.getRange(record.row, record.statusCol).setValue('Đã check-in');
    logCheckIn_(ticketCode);

    return { ok: true, message: 'Check-in thành công cho vé ' + ticketCode + '.' };
  } catch (err) {
    console.error('checkIn error: ' + (err && err.stack ? err.stack : err));
    return { ok: false, message: 'Có lỗi xảy ra, vui lòng thử lại.' };
  }
}

/**
 * Tìm bản ghi theo mã vé trong sheet DangKy.
 * GIẢ ĐỊNH cấu trúc cột giống findRegistrationByEmail_ ở Registration.gs
 * (A..J). SỬA LẠI chỉ số cột cho khớp Sheet thật của nhóm bạn.
 */
function findRegistrationByTicket_(sheet, ticketCode) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues(); // cột A..J
  for (let i = 0; i < values.length; i++) {
    if (values[i][7] === ticketCode) { // cột H = Mã vé
      return {
        row: i + 2,
        email: values[i][2],   // cột C = Email
        status: values[i][9],  // cột J = Trạng thái check-in
        statusCol: 10
      };
    }
  }
  return null;
}

/** Ghi log check-in vào sheet "CheckIn" (thời gian + mã vé, không lưu thêm PII). */
function logCheckIn_(ticketCode) {
  const sheet = getSheet_(SHEET_NAME_CHECKIN);
  sheet.appendRow([new Date(), sanitizeForSheet_(ticketCode)]);
}

// ----- Quy tắc #12: giới hạn số lần nhập sai PIN (5 lần / 10 phút → khóa 15 phút) -----

function checkPinLockout_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('pin_lock')) {
    return { ok: false, message: 'Chức năng check-in đang bị khóa do nhập sai PIN nhiều lần. Vui lòng thử lại sau 15 phút.' };
  }
  return { ok: true };
}

function registerFailedPinAttempt_() {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get('pin_attempts') || 0) + 1;
  cache.put('pin_attempts', String(attempts), 600); // cửa sổ 10 phút
  if (attempts >= 5) {
    cache.put('pin_lock', '1', 900); // khóa 15 phút
    cache.remove('pin_attempts');
  }
}

function clearPinAttempts_() {
  CacheService.getScriptCache().remove('pin_attempts');
}
