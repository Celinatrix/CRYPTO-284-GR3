/**
 * Registration.gs
 * ============================================================
 * Xử lý đăng ký gửi từ registration-section.html: xác thực input,
 * chống bot, giới hạn tần suất, kiểm tra trùng email, rồi TÁI SỬ DỤNG
 * genTicket() + sendConfirmEmail() đã có sẵn để tạo vé và gửi email.
 *
 * LUỒNG: doPost(e)
 *   → giới hạn payload size (Quy tắc #7)
 *   → parse JSON, lọc theo whitelist field (Quy tắc #9)
 *   → checkHoneypot_() (Quy tắc #13)
 *   → validateInput_() — validate lại TOÀN BỘ ở server (Quy tắc #6, #7)
 *   → rateLimit_() (Quy tắc #12)
 *   → kiểm tra trùng email → nếu trùng, trả cùng thông báo (Quy tắc #17)
 *   → genTicket() → sendConfirmEmail()
 * ============================================================
 */

// Quy tắc #9 (chống mass assignment): CHỈ các field trong danh sách này
// mới được đọc từ request của client. Mọi field lạ như "Mã vé",
// "Trạng thái check-in", "STT", "Thời gian đăng ký"... bị bỏ qua hoàn toàn,
// vì các giá trị đó do SERVER tự sinh ra, không bao giờ nhận từ client.
const ALLOWED_FIELDS_ = [
  'hoTen', 'email', 'soDienThoai', 'donVi', 'tuCach', 'cauHoi',
  'dongY',            // checkbox đồng ý điều khoản
  'website',          // honeypot field ẩn — người thật sẽ luôn để trống
  'formRenderedAt'    // thời điểm form được hiển thị (ms), dùng chống bot
];

const TU_CACH_OPTIONS_ = [
  'Cá nhân đầu tư crypto',
  'Doanh nghiệp fintech',
  'Luật sư/tư vấn pháp lý',
  'Sinh viên/Nhà nghiên cứu',
  'Báo chí/Truyền thông',
  'Khác'
];

const MAX_PAYLOAD_BYTES_ = 5 * 1024; // Quy tắc #7: payload > 5KB bị từ chối
const MIN_FILL_SECONDS_ = 3;         // Quy tắc #13: điền form < 3 giây → nghi bot

/**
 * Điểm vào duy nhất nhận request POST từ frontend (registration-section.html).
 */
function doPost(e) {
  try {
    // ----- Quy tắc #7: giới hạn kích thước payload -----
    const rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    if (Utilities.newBlob(rawBody).getBytes().length > MAX_PAYLOAD_BYTES_) {
      return jsonResponse_(false, 'Invalid request data.');
    }

    // ----- Quy tắc #16: không có upload — từ chối mọi request kèm file/base64 -----
    if (/data:.*;base64,/i.test(rawBody) || (e.postData && /multipart/i.test(e.postData.type || ''))) {
      return jsonResponse_(false, 'Invalid request data.');
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseErr) {
      return jsonResponse_(false, 'Invalid request data.');
    }
    if (!data || typeof data !== 'object') {
      return jsonResponse_(false, 'Invalid request data.');
    }

    // ----- Quy tắc #9: chỉ đọc field trong whitelist -----
    const input = {};
    ALLOWED_FIELDS_.forEach(function (key) {
      input[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
    });

    // ----- Quy tắc #13: honeypot + thời gian điền form -----
    if (!checkHoneypot_(input)) {
      // Nghi là bot: giả vờ thành công (không lộ cho bot biết bị chặn) nhưng KHÔNG lưu gì cả.
      return jsonResponse_(true, 'Your pass has been emailed to you. Please check your Spam folder too.');
    }

    // ----- Quy tắc #6, #7: validate lại TOÀN BỘ ở server -----
    const validation = validateInput_(input);
    if (!validation.ok) {
      return jsonResponse_(false, validation.message);
    }
    const clean = validation.data;

    // ----- Quy tắc #12: giới hạn tần suất đăng ký -----
    const rate = rateLimit_(clean.email);
    if (!rate.ok) {
      return jsonResponse_(false, rate.message);
    }

    const SAME_SUCCESS_MESSAGE = 'Your pass has been emailed to you. Please check your Spam folder too.';

    // ----- Kiểm tra trùng email -----
    const sheet = getSheet_(SHEET_NAME_DANGKY);
    const existing = findRegistrationByEmail_(sheet, clean.email);
    if (existing) {
      // Quy tắc #17: đăng ký mới và đăng ký trùng trả CÙNG một thông báo,
      // không tạo vé mới / không gửi lại email, để không lộ email nào đã đăng ký.
      return jsonResponse_(true, SAME_SUCCESS_MESSAGE);
    }

    // TÁI SỬ DỤNG genTicket() và sendConfirmEmail() đã có sẵn trong project
    const ticket = genTicket(clean);
    sendConfirmEmail(clean, ticket);
    notifyAdminNewRegistration_(clean, ticket);

    return jsonResponse_(true, SAME_SUCCESS_MESSAGE);

  } catch (err) {
    // Quy tắc #17: không lộ stack trace ra ngoài; chỉ log nội bộ cho dev xem trong Executions.
    console.error('doPost error: ' + (err && err.stack ? err.stack : err));
    return jsonResponse_(false, 'Something went wrong. Please try again later.');
  }
}

/**
 * checkHoneypot_(input)
 * Quy tắc #13 — Chặn Bot:
 *  - Trường ẩn "website": người thật không thấy field này nên luôn để trống;
 *    bot quét form thường tự động điền mọi input tìm thấy.
 *  - "formRenderedAt": thời điểm (ms) lúc form được hiển thị cho người dùng,
 *    do JS phía client ghi vào lúc trang load. Nếu từ lúc đó tới lúc submit
 *    chưa tới 3 giây → rất có thể là script tự động điền + gửi ngay.
 */
function checkHoneypot_(input) {
  if (input.website && String(input.website).trim() !== '') {
    return false;
  }
  const renderedAt = Number(input.formRenderedAt);
  if (!renderedAt || isNaN(renderedAt)) return false;
  const elapsedSeconds = (Date.now() - renderedAt) / 1000;
  if (elapsedSeconds < MIN_FILL_SECONDS_) return false;
  return true;
}

/**
 * validateInput_(input)
 * Quy tắc #6 (Xác thực phía Server) + #7 (Kiểm tra Input):
 * validate lại TOÀN BỘ dữ liệu, không tin bất kỳ giá trị nào từ client,
 * kể cả khi frontend đã kiểm tra rồi.
 */
function validateInput_(input) {
  const errors = [];
  const clean = {};

  // Họ và tên: 2-60 ký tự, chỉ chữ cái tiếng Việt/khoảng trắng/gạch nối
  const hoTen = String(input.hoTen || '').trim().replace(/\s+/g, ' ');
  const nameRegex = /^[A-Za-zÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ\s-]{2,60}$/;
  if (!hoTen || !nameRegex.test(hoTen)) {
    errors.push('Full name must be 2–60 characters — letters, spaces and hyphens only.');
  } else {
    clean.hoTen = hoTen;
  }

  // Email: đúng định dạng, tối đa 100 ký tự
  const email = String(input.email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || email.length > 100 || !emailRegex.test(email)) {
    errors.push('Please enter a valid email address (max 100 characters).');
  } else {
    clean.email = email;
  }

  // Số điện thoại: số di động VN
  const phone = String(input.soDienThoai || '').trim();
  const phoneRegex = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
  if (!phone || !phoneRegex.test(phone)) {
    errors.push('Enter a valid Vietnamese mobile number, e.g. 0912345678 or +84912345678.');
  } else {
    clean.soDienThoai = phone;
  }

  // Đơn vị công tác: không bắt buộc, tối đa 100 ký tự
  const donVi = String(input.donVi || '').trim();
  if (donVi.length > 100) {
    errors.push('Organization name must be 100 characters or fewer.');
  } else {
    clean.donVi = donVi;
  }

  // Tư cách tham dự: phải nằm đúng trong whitelist (dropdown)
  const tuCach = String(input.tuCach || '').trim();
  if (TU_CACH_OPTIONS_.indexOf(tuCach) === -1) {
    errors.push('Please select a valid sector / capacity.');
  } else {
    clean.tuCach = tuCach;
  }

  // Câu hỏi gửi trước: không bắt buộc, tối đa 500 ký tự
  const cauHoi = String(input.cauHoi || '').trim();
  if (cauHoi.length > 500) {
    errors.push('Question must be 500 characters or fewer.');
  } else {
    clean.cauHoi = cauHoi;
  }

  // Checkbox đồng ý: phải là boolean true thật sự (không nhận chuỗi "true")
  if (input.dongY !== true) {
    errors.push('You must agree to the terms and personal data processing to continue.');
  }

  if (errors.length > 0) {
    return { ok: false, message: errors[0] };
  }
  return { ok: true, data: clean };
}

/**
 * rateLimit_(email)
 * Quy tắc #12 — Giới hạn đăng ký:
 *   - Tối đa 3 lần / email / giờ
 *   - Tối đa 30 lần / phút toàn hệ thống
 * Dùng CacheService (bộ đếm tự hết hạn, không cần dọn dẹp thủ công).
 */
function rateLimit_(email) {
  const cache = CacheService.getScriptCache();

  // Toàn hệ thống: đếm theo từng phút (key đổi mỗi phút)
  const globalKey = 'reg_global_' + Math.floor(Date.now() / 60000);
  const globalCount = Number(cache.get(globalKey) || 0) + 1;
  cache.put(globalKey, String(globalCount), 90);
  if (globalCount > 30) {
    return { ok: false, message: 'The system is busy right now. Please try again in a few minutes.' };
  }

  // Theo từng email: tối đa 3 lần / giờ
  const emailKey = 'reg_email_' + Utilities.base64EncodeWebSafe(email);
  const emailCount = Number(cache.get(emailKey) || 0) + 1;
  cache.put(emailKey, String(emailCount), 3600);
  if (emailCount > 10) {
    return { ok: false, message: 'You have submitted too many registrations. Please try again in 1 hour.' };
  }

  return { ok: true };
}

/**
 * Tìm bản ghi theo email trong sheet DangKy.
 * GIẢ ĐỊNH cấu trúc cột (SỬA LẠI chỉ số cột cho khớp Sheet thật của nhóm bạn):
 *   A=Thời gian, B=Họ tên, C=Email, D=SĐT, E=Đơn vị,
 *   F=Tư cách, G=Câu hỏi, H=Mã vé, I=Token, J=Trạng thái check-in.
 */
function findRegistrationByEmail_(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const emailCol = 3; // cột C
  const emails = sheet.getRange(2, emailCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).trim().toLowerCase() === email) {
      return { row: i + 2 };
    }
  }
  return null;
}
