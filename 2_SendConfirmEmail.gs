/**
 * 2_SendConfirmEmail.gs
 * ============================================================
 * sendConfirmEmail(clean, ticket): gửi email xác nhận kèm QR, tóm tắt
 * thông tin đăng ký, thông tin hội thảo, link Google Calendar.
 * TÁI SỬ DỤNG tên hàm & mục đích như file gốc, chỉ sửa phần bảo mật.
 *
 * ĐÃ SỬA (giả định bản gốc ghép chuỗi HTML trực tiếp từ input người
 * dùng, hiển thị SĐT đầy đủ, và QR chỉ encode mã vé):
 *
 *   TRƯỚC (giả định):
 *     const html = '<p>Chào ' + data.hoTen + '</p>...'; // không escape
 *     ...SĐT: ' + data.soDienThoai + '...                // lộ đầy đủ SĐT
 *     QR chứa: data.ticketCode                            // dễ đoán/giả mạo
 *
 *   SAU:
 *     - Toàn bộ dữ liệu người dùng đi qua escapeHtml_() trước khi chèn
 *       vào email HTML, chống HTML injection trong chính email
 *       (Quy tắc #15).
 *     - SĐT hiển thị dạng che "09xx xxx 567" (Quy tắc #5).
 *     - Không đưa dữ liệu cá nhân vào tiêu đề email hay URL (Quy tắc #5).
 *     - QR encode URL check-in kèm token HMAC (không phải mã vé trần)
 *       (Quy tắc #8).
 * ============================================================
 */
function sendConfirmEmail(clean, ticket) {
  const checkinUrl = buildCheckinQrUrl_(ticket.code, ticket.token);
  const qrBlob = fetchQrCodeBlob_(checkinUrl);

  const maskedPhone = maskPhone_(clean.soDienThoai);
  const calendarLink = buildCalendarLink_();

  // Quy tắc #15: escape toàn bộ dữ liệu người dùng trước khi chèn vào HTML email
  const safe = {
    hoTen: escapeHtml_(clean.hoTen),
    email: escapeHtml_(clean.email),
    donVi: escapeHtml_(clean.donVi || '(not provided)'),
    tuCach: escapeHtml_(clean.tuCach),
    cauHoi: escapeHtml_(clean.cauHoi || '(none)'),
    phone: escapeHtml_(maskedPhone),
    eventName: escapeHtml_(EVENT_NAME_EN),
    eventDate: escapeHtml_(EVENT_DATE_TEXT),
    ticketCode: escapeHtml_(ticket.code)
  };

  // Quy tắc #5: KHÔNG đưa dữ liệu cá nhân (họ tên, email, SĐT...) vào tiêu đề email
  const subject = 'Registration Confirmed — ' + EVENT_NAME_EN;

  const htmlBody =
    '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E293B;">' +
      '<h2 style="color:#14285a;font-family:Montserrat,Arial,sans-serif;">Hello ' + safe.hoTen + ',</h2>' +
      '<p>You have successfully registered to attend <strong>' + safe.eventName + '</strong>.</p>' +

      '<h3 style="color:#14285a;">Registration Summary</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
        '<tr><td style="padding:4px 0;color:#64748B;">Full Name</td><td style="padding:4px 0;">' + safe.hoTen + '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748B;">Email</td><td style="padding:4px 0;">' + safe.email + '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748B;">Phone Number</td><td style="padding:4px 0;">' + safe.phone + '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748B;">Organization</td><td style="padding:4px 0;">' + safe.donVi + '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748B;">Sector / Capacity</td><td style="padding:4px 0;">' + safe.tuCach + '</td></tr>' +
        '<tr><td style="padding:4px 0;color:#64748B;">Advance Question</td><td style="padding:4px 0;">' + safe.cauHoi + '</td></tr>' +
      '</table>' +

      '<h3 style="color:#14285a;">Your Ticket</h3>' +
      '<p style="font-family:monospace;font-size:20px;font-weight:bold;color:#14285a;">' + safe.ticketCode + '</p>' +
      '<p>Please present the QR code below at the check-in desk:</p>' +
      '<img src="cid:qrCodeImage" alt="Check-in QR code" style="width:220px;height:220px;" />' +

      '<h3 style="color:#14285a;">Event Information</h3>' +
      '<p>' + safe.eventName + '<br/>Date &amp; Time: ' + safe.eventDate + '</p>' +

      '<h3 style="color:#14285a;">Check-in Instructions</h3>' +
      '<p>Please arrive 15–30 minutes before the opening session and present the QR code above ' +
      '(open the email directly or show a screenshot) at the reception desk to be checked in.</p>' +

      '<p><a href="' + calendarLink + '" style="color:#B8860B;">Add this event to Google Calendar</a></p>' +

      '<p style="color:#94A3B8;font-size:12px;margin-top:24px;">This is an automated email — please do not reply directly.</p>' +
    '</div>';

  GmailApp.sendEmail(clean.email, subject, 'Please view this email in HTML format to see the full details and QR code.', {
    htmlBody: htmlBody,
    inlineImages: { qrCodeImage: qrBlob },
    name: EVENT_NAME_EN
  });
}

/**
 * notifyAdminNewRegistration_(clean, ticket)
 * ------------------------------------------------------------
 * Gửi email thông báo ngắn cho ADMIN_EMAIL (Config.gs) mỗi khi có đăng
 * ký mới thành công. Đây chỉ là tiện ích thông báo, KHÔNG phải bước bắt
 * buộc của luồng đăng ký — nếu gửi lỗi (vd hết quota Gmail), doPost()
 * vẫn phải trả "thành công" cho khách vì vé đã ghi Sheet và email khách
 * đã gửi rồi. Vì vậy hàm này tự bọc try/catch, không throw ra ngoài.
 */
function notifyAdminNewRegistration_(clean, ticket) {
  try {
    const subject = '🎟️ Đăng ký mới — ' + clean.hoTen + ' (' + ticket.code + ')';
    const body =
      'Có 1 đăng ký mới cho ' + EVENT_NAME + ':\n\n' +
      'Họ và tên: ' + clean.hoTen + '\n' +
      'Email: ' + clean.email + '\n' +
      'Số điện thoại: ' + clean.soDienThoai + '\n' +
      'Đơn vị công tác: ' + (clean.donVi || '(không cung cấp)') + '\n' +
      'Tư cách tham dự: ' + clean.tuCach + '\n' +
      'Câu hỏi gửi trước: ' + (clean.cauHoi || '(không có)') + '\n' +
      'Mã vé: ' + ticket.code + '\n' +
      'Thời gian: ' + new Date().toLocaleString('vi-VN');

    GmailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (err) {
    console.error('notifyAdminNewRegistration_ error: ' + (err && err.stack ? err.stack : err));
  }
}

/**
 * Dựng URL check-in nhúng vào QR: trỏ về chính Web App này (doGet),
 * kèm mã vé + token. Khi nhân viên quét QR, trang CheckinPage.html sẽ
 * tự điền sẵn 2 giá trị này (chỉ để tiện thao tác — checkIn() vẫn xác
 * thực lại đầy đủ ở server).
 */
function buildCheckinQrUrl_(ticketCode, token) {
  const base = ScriptApp.getService().getUrl();
  return base + '?code=' + encodeURIComponent(ticketCode) + '&token=' + encodeURIComponent(token);
}

/**
 * Gọi dịch vụ tạo ảnh QR ngoài. Nội dung QR chỉ là URL check-in nội bộ
 * (không chứa họ tên/email/SĐT), phù hợp Quy tắc #5 (data minimization).
 */
function fetchQrCodeBlob_(content) {
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(content);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return response.getBlob().setName('qr.png');
}

function buildCalendarLink_() {
  // 08:00–12:30 ngày 20/09/2026 giờ Việt Nam (UTC+7) = 01:00–05:30 UTC
  const start = '20260920T010000Z';
  const end = '20260920T053000Z';
  const text = encodeURIComponent(EVENT_NAME_EN);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + text + '&dates=' + start + '/' + end;
}
