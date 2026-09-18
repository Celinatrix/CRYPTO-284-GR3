# Tổng kết bảo mật — Registration Section (Hội thảo Nghị định 284/2026)

> **Lưu ý quan trọng về nguồn gốc code:** Bạn có đính kèm file `DESIGN.md` (style
> guide màu sắc/typography) nhưng KHÔNG có các file backend gốc mà đề bài nhắc tới
> (`Config.gs`, `Utils.gs`, `genTicket()`, `sendConfirmEmail()`, `checkIn()`,
> `CheckinPage.html`). Vì vậy các file `.gs`/`.html` gửi kèm là bản dựng đầy đủ,
> hoạt động được, dùng ĐÚNG tên hàm/tên file mà đề bài yêu cầu — không phải diff
> thật trên code cũ của nhóm bạn. Cột "Trước" trong bảng "trước → sau" bên dưới là
> **giả định hợp lý** (một bản đăng ký Apps Script điển hình, chưa có bảo mật) để
> minh họa những gì cần sửa; khi ráp vào code thật, hãy đối chiếu lại tên biến/cột
> Sheet cho khớp. Các chỗ cần chỉnh (số cột trong Sheet, Sheet ID, PIN) đều được
> đánh dấu rõ bằng comment `SỬA LẠI` / `DÁN ... VÀO ĐÂY` trong code.

## 1. Cấu trúc file gửi kèm

| File | Vai trò |
|---|---|
| `registration-section.html` | Section đăng ký, dán vào landing page (GitHub Pages) |
| `Config.gs` | Hằng số không nhạy cảm + đọc secrets từ Script Properties + `setupSecrets()` |
| `Utils.gs` | Hàm dùng chung: escape, mask, HMAC token, sheet helper, response helper |
| `Registration.gs` | `doPost()`, `validateInput_()`, `rateLimit_()`, `checkHoneypot_()` |
| `1_GenTicket.gs` | `genTicket()` — sinh mã vé + token, ghi Sheet |
| `2_SendConfirmEmail.gs` | `sendConfirmEmail()` — gửi email kèm QR |
| `3_CheckIn.gs` | `checkIn()` — xác thực PIN + token, đánh dấu check-in |
| `0_WebApp.gs` | **File mới** — `doGet()` phục vụ `CheckinPage.html` (bắt buộc phải có vì 1 project chỉ có 1 `doGet`) |
| `CheckinPage.html` | Trang check-in cho nhân viên |
| `.gitignore` | Loại trừ file chứa secret, kèm hướng dẫn gitleaks |

**Lưu ý kiến trúc quan trọng:** `checkIn()` được gọi từ `CheckinPage.html` bằng
`google.script.run` (gọi hàm server trực tiếp trong cùng project Apps Script),
**không** qua `doPost()`. Lý do: mỗi Web App chỉ có đúng 1 `doPost(e)` và 1
`doGet(e)`; `doPost()` đã được dùng cho đăng ký. Đây là cách làm chuẩn và an toàn
hơn việc tự dựng thêm một API thứ hai.

## 2. Bảng tổng kết 20 quy tắc bảo mật

| STT | Quy tắc | Áp dụng thế nào | File / hàm |
|---|---|---|---|
| 1 | Ẩn API Key | Sheet ID, HMAC secret, hash PIN chuyển vào Script Properties; `setupSecrets()` chạy 1 lần rồi xóa giá trị thật khỏi code | `Config.gs` → `setupSecrets()`, `getSheetId_()`, `getHmacSecret_()` |
| 2 | Xóa Git Secrets | `.gitignore` loại `.clasp.json`/`.env`; hướng dẫn `gitleaks detect`; quy trình đổi khóa + xóa lịch sử Git nếu lỡ lộ | `.gitignore` |
| 3 | Bảo mật Database | Sheet không chia sẻ công khai; Web App chạy quyền chủ sở hữu (`Execute as: Me`); `getSheetId_()` chỉ dùng ở server, client không bao giờ nhận Sheet ID/link | `Utils.gs` → `getSheet_()`; frontend không có biến nào chứa Sheet ID |
| 4 | Row-Level Security | Không có endpoint nào trả danh sách người đăng ký; `doPost`/`checkIn` chỉ đọc/ghi đúng 1 bản ghi tương ứng với request | `Registration.gs`, `3_CheckIn.gs` |
| 5 | Mã hóa dữ liệu | Chỉ truyền qua HTTPS (Quy tắc #19); chỉ thu thập trường cần thiết; SĐT che dạng `09xx xxx 567` trong email; không đưa PII vào tiêu đề email/URL | `Utils.gs` → `maskPhone_()`; `2_SendConfirmEmail.gs` |
| 6 | Xác thực phía Server | `validateInput_()` kiểm tra lại toàn bộ trong `doPost`, không tin dữ liệu client dù frontend đã validate | `Registration.gs` → `validateInput_()` |
| 7 | Kiểm tra Input | Regex + giới hạn độ dài từng trường; dropdown chỉ nhận giá trị whitelist; checkbox phải `=== true`; payload > 5KB bị từ chối | `Registration.gs` → `validateInput_()`, `MAX_PAYLOAD_BYTES_` |
| 8 | Khóa quyền truy cập Record | Mã vé `ND284-####` kèm token HMAC-SHA256(mã vé+email); `checkIn()` yêu cầu token khớp VÀ PIN đúng | `Utils.gs` → `generateTicketToken_()`/`verifyTicketToken_()`; `3_CheckIn.gs` |
| 9 | Chặn sửa Field | `ALLOWED_FIELDS_` whitelist; mọi field lạ (`Mã vé`, `STT`, `Trạng thái check-in`...) từ client bị bỏ qua hoàn toàn | `Registration.gs` → `ALLOWED_FIELDS_`, `doPost()` |
| 10 | Bảo mật Cookie | Không dùng cookie. `CheckinPage.html` dùng `sessionStorage` (không phải `localStorage`) cho PIN, tự xóa sau 30 phút | `CheckinPage.html` |
| 11 | Băm Password | PIN nhân viên lưu `SHA-256(salt + PIN)` trong Script Properties; so sánh hash, không so PIN gốc | `Utils.gs` → `hashPin_()`; `Config.gs` → `setupSecrets()`; `3_CheckIn.gs` |
| 12 | Giới hạn đăng nhập | Check-in: sai PIN 5 lần/10 phút → khóa 15 phút (CacheService). Đăng ký: tối đa 3 lần/email/giờ, 30 lần/phút toàn hệ thống | `3_CheckIn.gs` → `checkPinLockout_()`; `Registration.gs` → `rateLimit_()` |
| 13 | Chặn Bot | Honeypot field ẩn `website`; từ chối nếu điền form < 3 giây (`formRenderedAt`); bot bị lừa nhận thông báo "thành công" nhưng không lưu gì | `Registration.gs` → `checkHoneypot_()`; `registration-section.html` |
| 14 | Tham số hóa Query | Không có SQL; chống Formula Injection: giá trị bắt đầu `= + - @` được thêm `'` phía trước; chỉ dùng `appendRow`/`setValue`, không ghép chuỗi công thức | `Utils.gs` → `sanitizeForSheet_()`; `1_GenTicket.gs` |
| 15 | Escape nội dung | Email HTML: `escapeHtml_()` toàn bộ dữ liệu người dùng. Frontend: chỉ `textContent`, không `innerHTML` với dữ liệu người dùng | `Utils.gs` → `escapeHtml_()`; `2_SendConfirmEmail.gs`; `registration-section.html`, `CheckinPage.html` |
| 16 | Giới hạn File Upload | Form không có trường upload; `doPost` từ chối request chứa `data:...;base64,` hoặc `multipart` | `Registration.gs` → `doPost()` |
| 17 | Giảm dữ liệu trả về từ API | `doPost`/`checkIn` chỉ trả `{ok, message}`; đăng ký mới và trùng email trả **cùng thông báo**; lỗi chi tiết chỉ vào `console.error`, không lộ stack trace | `Utils.gs` → `jsonResponse_()`; `Registration.gs`, `3_CheckIn.gs` |
| 18 | Thêm Security Headers | CSP + `referrer-policy: no-referrer` qua thẻ `<meta>` (ghi chú cách thêm vào `<head>` landing page); `CheckinPage` giữ `XFrameOptionsMode.DEFAULT` | `registration-section.html` (comment đầu file); `0_WebApp.gs` → `doGet()` |
| 19 | Bắt buộc HTTPS | Mọi URL dùng `https://`; frontend từ chối gửi nếu `location.protocol !== 'https:'` (trừ localhost); nhắc bật Enforce HTTPS trên GitHub Pages | `registration-section.html` |
| 20 | Quét Dependencies | Không dùng thư viện/CDN ngoài nào trong frontend/backend (chỉ 1 lệnh gọi API tạo ảnh QR qua `UrlFetchApp`, không phải "dependency" nạp vào trang); hướng dẫn bật Dependabot | Xem mục 4 bên dưới |

### Ghi chú cho Quy tắc #18 (giới hạn của Apps Script)
Apps Script Web App **không cho tự đặt HTTP response header** (không thể set
`Content-Security-Policy`, `X-Frame-Options`... như header thật cho response của
`doPost`/`doGet` trả JSON). Vì vậy:
- Với **trang tĩnh** (`registration-section.html` trên GitHub Pages): dùng thẻ
  `<meta http-equiv="Content-Security-Policy">` — cách duy nhất khả thi trên
  GitHub Pages (không có server để cấu hình header).
- Với **CheckinPage.html** (HtmlService): Apps Script cung cấp sẵn API riêng
  `.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)` để chống nhúng
  iframe — đây là cơ chế thay thế cho header `X-Frame-Options` mà Apps Script hỗ
  trợ, nên vẫn đạt được mục tiêu của quy tắc dù không dùng header thật.

### Ghi chú cho Quy tắc #20
Toàn bộ code không dùng bất kỳ thư viện/framework CDN nào ở frontend (thuần
HTML/CSS/JS) hay thư viện ngoài ở backend (thuần Apps Script built-in:
`PropertiesService`, `CacheService`, `Utilities`, `GmailApp`, `UrlFetchApp`,
`SpreadsheetApp`, `HtmlService`). Việc gọi `https://api.qrserver.com` trong
`fetchQrCodeBlob_()` là một **lời gọi API** để tạo ảnh QR (không nạp code JS nào
từ đó về chạy), nên không phát sinh rủi ro "dependency" theo nghĩa của quy tắc
này. Nếu nhóm muốn loại bỏ hoàn toàn phụ thuộc vào dịch vụ ngoài, có thể thay
bằng một thư viện sinh QR client-side đã tải sẵn và ghim phiên bản (không qua
CDN) — nhưng điều này nằm ngoài phạm vi Apps Script server-side.
Vì repo không có `package.json`/dependency file cho Node/npm, **Dependabot** vẫn
nên được bật cho phần cấu hình GitHub Actions (nếu nhóm dùng CI) qua: Repo →
Settings → Security → Code security and analysis → bật **Dependabot alerts** và
**Dependabot security updates**.

## 3. Các chỗ cần sửa trong file cũ (trước → sau)

> Vì không có code gốc thật, phần "Trước" dưới đây là bản dựng lại hợp lý theo
> mô tả trong đề bài, dùng để minh họa rõ những gì đã thay đổi và vì sao.

### Config.gs
**Trước (giả định):**
```javascript
const SHEET_ID = '1AbCxyzThatIsHardcoded';
const STAFF_PIN = '123456';
```
**Sau:** Không còn hằng số nhạy cảm nào trong file. `getSheetId_()`,
`getHmacSecret_()`, `getStaffPinHash_()`, `getStaffPinSalt_()` đọc từ
`PropertiesService`. Thêm `setupSecrets()` chạy 1 lần để nạp giá trị.

### Utils.gs
**Trước (giả định):** chỉ có vài hàm định dạng ngày tháng/chuỗi thông thường.
**Sau:** bổ sung `escapeHtml_`, `sanitizeForSheet_`, `maskPhone_`,
`generateTicketToken_`/`verifyTicketToken_`, `timingSafeEqual_`, `hashPin_`,
`getSheet_`, `jsonResponse_`.

### 1_GenTicket.gs (genTicket)
**Trước (giả định):**
```javascript
function genTicket(data) {
  const code = 'ND284-' + Math.floor(1000 + Math.random() * 9000);
  sheet.appendRow([data.hoTen, data.email, data.soDienThoai, data.donVi, data.cauHoi, code]);
  return code;
}
```
**Sau:** nhận dữ liệu ĐÃ được `validateInput_()` làm sạch; mỗi ô đi qua
`sanitizeForSheet_()` trước khi ghi (chống formula injection); sinh thêm
`token` HMAC gắn với mã vé + email; trả về `{code, token}` thay vì chỉ `code`.

### 2_SendConfirmEmail.gs (sendConfirmEmail)
**Trước (giả định):**
```javascript
const html = '<p>Chào ' + data.hoTen + ', SĐT: ' + data.soDienThoai + '</p>';
// QR chỉ encode: code
```
**Sau:** toàn bộ dữ liệu người dùng qua `escapeHtml_()`; SĐT hiển thị dạng che
`09xx xxx 567` qua `maskPhone_()`; QR encode URL check-in kèm token HMAC (không
phải mã vé trần); tiêu đề email không chứa PII.

### 3_CheckIn.gs (checkIn)
**Trước (giả định):**
```javascript
function checkIn(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.pin === STAFF_PIN) { /* check-in theo mã vé, không kiểm tra gì thêm */ }
}
```
**Sau:** nhận `payload` object từ `google.script.run` (không phải `e` của
`doPost`); so PIN bằng hash `SHA-256(salt+pin)`; khóa 15 phút sau 5 lần sai
trong 10 phút; bắt buộc token HMAC khớp với mã vé trước khi cho check-in; trả
về `{ok, message}` tối giản.

### CheckinPage.html
**Trước (giả định):**
```javascript
localStorage.setItem('staffPin', pin); // tồn tại vĩnh viễn
```
**Sau:** dùng `sessionStorage` (mất khi đóng tab) kèm mốc thời gian, tự xóa/bỏ
qua nếu đã quá 30 phút; giữ `XFrameOptionsMode.DEFAULT` ở `doGet()` (file mới
`0_WebApp.gs`) để chống nhúng iframe.

## 4. Kịch bản test tối thiểu

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| a | Đăng ký hợp lệ, đầy đủ trường | `{ok:true}`; nhận được email có đủ: tóm tắt thông tin, SĐT che, mã vé, QR, thông tin hội thảo, hướng dẫn check-in, link Calendar |
| b | Đăng ký lần 2 với cùng email đã đăng ký | Trả về **cùng** thông báo với đăng ký thành công (`{ok:true, message:"Đã gửi vé..."}`); **không** có dòng mới trong Sheet, **không** gửi email mới |
| c | Bỏ trống một trường bắt buộc (VD: Họ tên) | Frontend chặn ngay dưới ô; nếu cố gửi thẳng qua `fetch` bỏ qua frontend, `doPost` trả `{ok:false}` với thông báo lỗi trường tương ứng |
| d | SĐT sai định dạng (VD: `0123456789` — đầu số `01` không hợp lệ, hoặc thiếu số) | `{ok:false, message:"Số điện thoại không hợp lệ."}`, không ghi vào Sheet |
| e | Họ tên chứa `<script>alert(1)</script>` | Bị `NAME_REGEX` chặn ngay (không khớp regex chữ cái) → `{ok:false}`; giả sử vượt qua được validate (test riêng hàm `sanitizeForSheet_`/`escapeHtml_`), giá trị khi hiển thị trong email phải ra dạng escape `&lt;script&gt;...`, không thực thi |
| f | Câu hỏi bắt đầu bằng `=IMPORTXML(...)` | `sanitizeForSheet_()` thêm `'` phía trước → Sheet lưu dạng text `'=IMPORTXML(...)`, không bị Google Sheets thực thi thành công thức |
| g | Bot điền vào honeypot field `website` | `checkHoneypot_()` trả `false` → `doPost` trả `{ok:true, message:"Đã gửi vé..."}` (đánh lừa bot) nhưng **không** ghi Sheet, **không** gửi email |
| h | Gửi đăng ký 4 lần liên tiếp trong 1 giờ với cùng 1 email | 3 lần đầu xử lý bình thường (hoặc báo trùng nếu đã có); lần thứ 4 bị `rateLimit_()` chặn: `{ok:false, message:"...quá nhiều lần...thử lại sau 1 giờ."}` |
| i | Client tự thêm field `"Trạng thái check-in":"Đã"` vào payload | `doPost` chỉ đọc field trong `ALLOWED_FIELDS_`, field lạ bị bỏ qua hoàn toàn; dòng ghi vào Sheet vẫn có `Trạng thái check-in = "Chưa check-in"` mặc định từ `genTicket()`, không bị client ghi đè |
| j | Nhập sai PIN nhân viên 6 lần liên tiếp | 5 lần đầu: `{ok:false, message:"Sai PIN nhân viên."}`; từ lần thử tiếp theo (kể cả nếu PIN đúng): `{ok:false, message:"...đang bị khóa...thử lại sau 15 phút."}` |

### Cách chạy nhanh các test (a)-(j)
- **(a)-(f), (h)-(i):** dùng `curl` hoặc Postman gọi `POST` tới `WEBAPP_URL` với
  `Content-Type: text/plain;charset=utf-8`, body JSON tương ứng từng case; đọc
  Sheet `DangKy` để đối chiếu dữ liệu đã ghi.
- **(g):** gọi `POST` với payload có thêm `"website": "http://spam.com"`.
- **(j):** mở `CheckinPage.html` (qua `doGet`), nhập sai PIN 6 lần liên tiếp
  trong vòng chưa tới 10 phút.

## 5. Việc bạn cần làm trước khi deploy

1. Mở Apps Script Editor → dán 8 file `.gs`/`.html` vào đúng project (giữ đúng
   tên file để dễ đối chiếu thứ tự chạy: `0_WebApp`, `1_GenTicket`,
   `2_SendConfirmEmail`, `3_CheckIn`, cùng `Config`, `Utils`, `Registration`).
2. Sửa `Config.gs` → `setupSecrets()`: điền `SHEET_ID` thật và `STAFF_PIN_RAW`
   thật, **chạy hàm này 1 lần** trong Editor (không deploy), sau đó **xóa** 2
   giá trị thật đó khỏi code.
3. Kiểm tra lại số thứ tự cột trong `findRegistrationByEmail_`,
   `ticketCodeExists_`, `findRegistrationByTicket_` cho khớp với cấu trúc Sheet
   `DangKy` thật của nhóm (hiện giả định A..J theo thứ tự nêu trong comment).
4. Deploy → New deployment → Web app → Execute as: **Me**, Who has access:
   **Anyone** → copy URL, dán vào `WEBAPP_URL` trong `registration-section.html`.
5. Thêm 2 thẻ `<meta>` CSP + referrer-policy vào `<head>` của landing page (xem
   comment đầu file `registration-section.html`).
6. Bật **Enforce HTTPS** trong GitHub Pages settings.
7. Chạy thử đủ 10 kịch bản test ở mục 4 trước khi công bố form cho người dùng
   thật.
