/**
 * 1_GenTicket.gs
 * ============================================================
 * genTicket(clean): sinh mã vé ND284-####, chống trùng, ghi vào sheet DangKy.
 * TÁI SỬ DỤNG tên hàm & mục đích như file gốc, chỉ sửa phần bảo mật.
 *
 * ĐÃ SỬA (giả định bản gốc dạng đơn giản, ghi thẳng dữ liệu thô từ client
 * và chỉ sinh mã ngẫu nhiên không kèm token):
 *
 *   TRƯỚC (giả định):
 *     function genTicket(data) {
 *       const code = 'ND284-' + Math.floor(1000 + Math.random() * 9000);
 *       sheet.appendRow([data.hoTen, data.email, data.soDienThoai, ...]); // ghi thẳng
 *       return code;
 *     }
 *
 *   SAU:
 *     - Mọi ô dữ liệu đi qua sanitizeForSheet_() trước khi ghi, chống
 *       Formula Injection (Quy tắc #14).
 *     - Dùng appendRow() với mảng giá trị — KHÔNG ghép chuỗi thành công
 *       thức (Quy tắc #14).
 *     - Sinh thêm token HMAC-SHA256 gắn với mã vé + email, chống đoán
 *       mã vé (mã vé chỉ có 10.000 khả năng, dễ dò) (Quy tắc #8).
 *     - Nhận "clean" — dữ liệu ĐÃ được validateInput_() làm sạch ở
 *       Registration.gs, không nhận thẳng dữ liệu thô từ client
 *       (Quy tắc #6, #9).
 * ============================================================
 */
function genTicket(clean) {
  const sheet = getSheet_(SHEET_NAME_DANGKY);

  // Sinh mã vé ND284-#### không trùng (thử tối đa 20 lần)
  let ticketCode = null;
  for (let i = 0; i < 20; i++) {
    const candidate = TICKET_PREFIX + String(Math.floor(1000 + Math.random() * 9000));
    if (!ticketCodeExists_(sheet, candidate)) {
      ticketCode = candidate;
      break;
    }
  }
  if (!ticketCode) {
    throw new Error('Không thể sinh mã vé duy nhất, vui lòng thử lại.');
  }

  // Quy tắc #8: token chống đoán mã vé, gắn liền với mã vé + email người đăng ký
  const token = generateTicketToken_(ticketCode, clean.email);

  // Quy tắc #14: sanitizeForSheet_() từng ô trước khi ghi; dùng appendRow (không ghép công thức)
  sheet.appendRow([
    new Date(),
    sanitizeForSheet_(clean.hoTen),
    sanitizeForSheet_(clean.email),
    "'" + clean.soDienThoai, // dấu ' ép Sheets lưu dạng chữ, không mất số 0 đầu (vd 0912345678)
    sanitizeForSheet_(clean.donVi),
    sanitizeForSheet_(clean.tuCach),
    sanitizeForSheet_(clean.cauHoi),
    ticketCode,
    token,
    'Chưa check-in'
  ]);

  return { code: ticketCode, token: token };
}

/** Kiểm tra mã vé đã tồn tại trong Sheet chưa (chống trùng mã). */
function ticketCodeExists_(sheet, code) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const codeCol = 8; // cột H = Mã vé — sửa lại nếu Sheet của bạn khác
  const codes = sheet.getRange(2, codeCol, lastRow - 1, 1).getValues();
  return codes.some(function (row) { return row[0] === code; });
}
