# Hướng dẫn hoàn tất tích hợp Zalo OA và gửi ZBS Template Message

Tài liệu này hướng dẫn triển khai module **Gửi ZNS hàng loạt** của dự án từ trạng thái mã nguồn hiện tại đến khi có thể gửi tin thật qua Zalo Official Account.

> Tên gọi hiện tại của Zalo là **ZBS Template Message**. Trong mã nguồn và giao diện dự án vẫn còn sử dụng tên `ZNS` để tương thích với tên module ban đầu.

## 1. Thông tin của dự án

| Thành phần | Giá trị |
| --- | --- |
| Zalo App ID | `3540981949545194380` |
| Tên ứng dụng Zalo | `Sửa chữa xe Anh Công Nhân` |
| OA | `Trung tâm sửa chữa xe Anh Công Nhân` |
| Website production | `https://quanlycuahangxe.vercel.app` |
| OAuth callback | `https://quanlycuahangxe.vercel.app/zalo/oauth-callback` |
| Supabase project ref | `crcqyaphmaxgkrhffevl` |
| Trang gửi hàng loạt | `/zns/gui-hang-loat` |

Không đưa Zalo App Secret, access token hoặc refresh token vào tài liệu, Git hay biến môi trường có tiền tố `VITE_`.

## 2. Chi phí sử dụng

Việc kết nối ứng dụng với OA không tự động phát sinh phí gửi tin. Phí ZBS được tính khi lệnh gửi tin được Zalo xử lý thành công.

- Template thông thường có giá tham khảo từ khoảng `200đ/tin`.
- Một số loại như template xác thực, voucher hoặc thanh toán có giá cao hơn.
- CTA bổ sung, nút phản hồi hoặc thành phần đặc biệt có thể làm tăng đơn giá.
- Giá công bố thường chưa bao gồm VAT.
- Giá chính xác của từng template phải được kiểm tra trong ZBS Template Library trước khi gửi.

Nguồn tham khảo:

- [Bảng giá Business Message](https://zalo.solutions/business-message/pricing)
- [Chính sách Business Message](https://zalo.solutions/terms)
- [Bảng giá dịch vụ OA](https://zalo.solutions/oa/pricing)

Không nên hard-code đơn giá trong ứng dụng vì Zalo có thể thay đổi chính sách.

## 3. Kiến trúc bảo mật

```text
Trình duyệt của quản trị viên
        |
        | Chọn khách hàng, Template ID và dữ liệu biến
        v
Supabase Edge Function: zns-send-batch
        |
        | Access token được lấy và làm mới phía server
        v
Zalo Business Message API
```

Các bí mật được xử lý như sau:

- `VITE_ZALO_APP_ID` là thông tin công khai và được dùng ở frontend.
- `VITE_ZALO_OAUTH_REDIRECT_URI` là URL callback công khai.
- `ZALO_APP_SECRET` chỉ được lưu trong Supabase Edge Function Secrets.
- Access token và refresh token được lưu trong bảng `zns_oa_token`.
- Bảng token không cấp quyền đọc cho `anon` hoặc `authenticated`.

## 4. Trạng thái hiện tại

- [x] Module frontend gửi hàng loạt đã được tạo.
- [x] Route callback `/zalo/oauth-callback` đã được tạo.
- [x] Migration và ba Edge Functions đã có trong mã nguồn.
- [x] App ID và callback production đã được xác định.
- [x] Thẻ meta xác thực Zalo đã được thêm vào `index.html` ở máy local.
- [ ] Phiên bản chứa thẻ meta chưa được publish lên Vercel.
- [ ] URL Vercel chưa được Zalo xác thực.
- [ ] Callback chưa được Zalo lưu chính thức.
- [ ] Ứng dụng chưa được OA cấp quyền.
- [ ] Migration chưa được xác nhận đã chạy trên Supabase production.
- [ ] Edge Functions và `ZALO_APP_SECRET` chưa được xác nhận trên đúng Supabase project.
- [ ] Chưa gửi thử tin thật.

## 5. Bước 1 — Đăng nhập và liên kết Vercel CLI

Chạy tại thư mục dự án:

```powershell
npx vercel login
```

Đăng nhập bằng đúng tài khoản sở hữu domain `quanlycuahangxe.vercel.app`. Sau đó liên kết thư mục local với project hiện có:

```powershell
npx vercel link
```

Khi được hỏi, chọn project đang phục vụ domain:

```text
quanlycuahangxe.vercel.app
```

Kiểm tra thư mục `.vercel` đã xuất hiện:

```powershell
Get-Content .vercel\project.json
```

Không tạo project Vercel mới nếu project chứa domain trên đã tồn tại.

## 6. Bước 2 — Cấu hình biến môi trường Vercel

Trong Vercel Dashboard, mở project tương ứng, vào **Settings → Environment Variables** và thêm:

```env
VITE_ZALO_APP_ID=3540981949545194380
VITE_ZALO_OAUTH_REDIRECT_URI=https://quanlycuahangxe.vercel.app/zalo/oauth-callback
```

Hai biến Supabase hiện có cũng phải được cấu hình cho production:

```env
VITE_SUPABASE_URL=https://crcqyaphmaxgkrhffevl.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-của-project>
```

Áp dụng các biến ít nhất cho môi trường **Production**. Có thể áp dụng thêm cho Preview nếu cần kiểm thử preview deployment.

Không thêm biến sau vào Vercel frontend:

```env
ZALO_APP_SECRET=...
```

## 7. Bước 3 — Build và deploy Vercel

Kiểm tra mã nguồn trước khi deploy:

```powershell
pnpm build
```

Nếu build thành công, deploy production:

```powershell
npx vercel --prod
```

Sau khi deploy, mở trang chủ và kiểm tra thẻ xác thực:

```text
view-source:https://quanlycuahangxe.vercel.app/
```

Trong mã nguồn HTML phải có:

```html
<meta name="zalo-platform-site-verification" content="Ee6_2UEA424rghyEmAal8I6zgGhDotDICp8p" />
```

Nếu không thấy thẻ, deployment chưa dùng phiên bản mã nguồn mới hoặc domain đang trỏ sang project Vercel khác.

## 8. Bước 4 — Xác thực URL trên Zalo Developer

Mở:

```text
https://developers.zalo.me/app/3540981949545194380/verify-domain
```

Trong phần **Tiền tố URL**, nhập:

```text
https://quanlycuahangxe.vercel.app
```

Thực hiện:

1. Bấm **Xác thực**.
2. Chọn **Xác thực ngay**.
3. Chọn phương thức **Thêm thẻ meta vào trang web của bạn**.
4. Xác nhận mã hiển thị trùng với mã trong `index.html`.
5. Bấm **Xác thực** ở cuối hộp thoại.

Zalo có cảnh báo việc phát hiện thẻ meta có thể mất thời gian. Không xóa thẻ meta sau khi xác thực thành công.

## 9. Bước 5 — Lưu Official Account Callback URL

Sau khi URL đã được xác thực, mở:

```text
https://developers.zalo.me/app/3540981949545194380/oa/settings
```

Trong phần **Official Account Callback Url**:

1. Bấm **Cập nhật**.
2. Nhập chính xác:

   ```text
   https://quanlycuahangxe.vercel.app/zalo/oauth-callback
   ```

3. Bấm **Lưu** cạnh ô callback.
4. Kéo xuống cuối phần quyền và bấm **Lưu** lần nữa.
5. Tải lại trang để xác nhận callback vẫn còn và đường dẫn yêu cầu cấp quyền phía trên đã có `redirect_uri`.

Với phiên bản mã nguồn hiện tại:

- Để trống `Code Challenge` vì dự án chưa triển khai PKCE.
- Để trống `State` vì dự án chưa phát sinh và xác minh OAuth state.
- Bắt buộc chọn quyền **Gửi tin qua số điện thoại**.
- Không cấp các quyền khác nếu module không sử dụng.

Nếu Zalo báo `-14003: Invalid redirect uri`, kiểm tra:

- URL đã được xác thực chưa.
- Callback có dùng HTTPS không.
- Callback trên Zalo và `VITE_ZALO_OAUTH_REDIRECT_URI` có trùng tuyệt đối không.
- Có khác dấu `/` cuối URL, chữ hoa/chữ thường hoặc path không.

## 10. Bước 6 — Chuẩn bị Supabase

Đăng nhập CLI bằng tài khoản có quyền với project `crcqyaphmaxgkrhffevl`:

```powershell
npx supabase login
npx supabase projects list
```

Chỉ tiếp tục khi project ref sau xuất hiện trong danh sách:

```text
crcqyaphmaxgkrhffevl
```

Liên kết project:

```powershell
npx supabase link --project-ref crcqyaphmaxgkrhffevl
```

### Chạy migration

Cách 1 — dùng CLI:

```powershell
npx supabase db push
```

Cách 2 — dùng Supabase SQL Editor:

1. Mở Supabase Dashboard của project.
2. Vào **SQL Editor**.
3. Mở file `supabase/migrations/20260814_zns_bulk_send.sql` trong dự án.
4. Dán toàn bộ nội dung và chạy.

Sau khi chạy phải có ba bảng:

- `zns_oa_token`
- `zns_chien_dich`
- `zns_gui_log`

## 11. Bước 7 — Lưu Zalo App Secret

Lấy App Secret tại:

```text
Zalo Developer → Ứng dụng → Cài đặt → Khóa bí mật của ứng dụng
```

Lưu App Secret trong **Supabase Dashboard → Edge Functions → Secrets** với tên:

```text
ZALO_APP_SECRET
```

Hoặc dùng CLI:

```powershell
npx supabase secrets set ZALO_APP_SECRET=<app-secret> --project-ref crcqyaphmaxgkrhffevl
```

Không ghi App Secret vào:

- `.env`
- `.env.example`
- `index.html`
- mã React/TypeScript frontend
- tài liệu hoặc Git commit

## 12. Bước 8 — Deploy Supabase Edge Functions

Chạy:

```powershell
npx supabase functions deploy zns-oauth-exchange --project-ref crcqyaphmaxgkrhffevl
npx supabase functions deploy zns-oa-status --project-ref crcqyaphmaxgkrhffevl
npx supabase functions deploy zns-send-batch --project-ref crcqyaphmaxgkrhffevl
```

Vai trò từng function:

| Function | Vai trò |
| --- | --- |
| `zns-oauth-exchange` | Đổi authorization code lấy access/refresh token |
| `zns-oa-status` | Kiểm tra trạng thái kết nối OA |
| `zns-send-batch` | Gửi tin theo lô và ghi log |

## 13. Bước 9 — Cấp quyền OA cho ứng dụng

Đăng nhập tài khoản quản trị tại:

```text
https://quanlycuahangxe.vercel.app
```

Sau đó:

1. Mở menu **Gửi ZNS hàng loạt**.
2. Bấm **Kết nối Zalo OA**.
3. Zalo mở trang yêu cầu cấp quyền.
4. Chọn OA `Trung tâm sửa chữa xe Anh Công Nhân`.
5. Đồng ý quyền gửi tin qua số điện thoại.
6. Zalo chuyển về `/zalo/oauth-callback?code=...`.
7. Trang callback gọi `zns-oauth-exchange` và lưu token vào Supabase.
8. Ứng dụng chuyển về `/zns/gui-hang-loat`.

Kết quả đúng là banner hiển thị **Đã kết nối OA**.

Không chia sẻ hoặc lưu thủ công authorization code. Code OAuth chỉ dùng một lần và có thời hạn ngắn.

## 14. Bước 10 — Chuẩn bị Template ID

Mở ZBS Template Library và tạo hoặc chọn template đã được duyệt:

```text
https://account.zalo.solutions/
```

Lấy **Template ID**, không lấy tên template.

Mỗi biến trong giao diện gửi phải trùng tuyệt đối với biến được khai báo trong template. Cấu hình mặc định của dự án:

| Biến template | Nguồn dữ liệu |
| --- | --- |
| `customer_name` | Tên khách hàng |
| `order_code` | Mã đơn hàng gần nhất |
| `order_date` | Ngày đơn hàng gần nhất |

Nếu template thật dùng tên biến khác, phải sửa phần ánh xạ trên giao diện trước khi gửi.

## 15. Bước 11 — Gửi thử an toàn

Không gửi hàng loạt ngay lần đầu. Thực hiện:

1. Chọn đúng một khách hàng nội bộ có số điện thoại thật.
2. Nhập Template ID đã được duyệt.
3. Bấm **Xem trước**.
4. Kiểm tra tất cả biến đều có dữ liệu.
5. Kiểm tra giá của template trong ZBS Account.
6. Bấm gửi cho một người.
7. Mở lịch sử chiến dịch và kiểm tra trạng thái.
8. Xác nhận người nhận đã nhận được nội dung đúng.

Chỉ gửi hàng loạt sau khi lần thử đầu tiên thành công.

## 16. Xử lý lỗi thường gặp

### `-14003: Invalid redirect uri`

Nguyên nhân thường gặp:

- URL chưa được Zalo xác thực.
- Callback không dùng HTTPS.
- Callback trên Zalo khác biến môi trường Vercel.
- Deployment production vẫn dùng biến môi trường cũ.

### Callback chuyển về `/login`

Trang callback dành cho quản trị viên. Trước khi bấm kết nối OA, phải đăng nhập ứng dụng production bằng tài khoản admin trong cùng trình duyệt.

### `Thiếu VITE_ZALO_APP_ID` hoặc `Thiếu VITE_ZALO_OAUTH_REDIRECT_URI`

Hai biến chưa được đặt trên Vercel hoặc project chưa redeploy sau khi thêm biến.

### `Thiếu cấu hình ZALO_APP_SECRET`

Secret chưa được đặt trong đúng Supabase project hoặc function chưa được deploy lại.

### Supabase CLI không thấy project

Tài khoản CLI đang đăng nhập không có quyền với project. Chạy lại:

```powershell
npx supabase logout
npx supabase login
npx supabase projects list
```

### Kết nối thành công nhưng gửi thất bại

Kiểm tra:

- Template đã được duyệt và đang hoạt động.
- Template ID đúng.
- Tên biến và dữ liệu truyền vào đúng cấu trúc.
- Số điện thoại được chuẩn hóa về `84xxxxxxxxx`.
- ZBS Account có đủ số dư hoặc hạn mức.
- OA có quyền sử dụng loại Business Message tương ứng.
- Access token còn hiệu lực và refresh token chưa bị thu hồi.

### Tin bị gửi trùng

Module có `idempotency_key` để giảm rủi ro gửi trùng khi retry. Tuy nhiên không nên mở nhiều tab và chạy cùng một danh sách cùng lúc.

### Đóng tab khi đang gửi

Phiên bản hiện tại gửi theo lô từ trình duyệt. Nếu đóng tab giữa quá trình, chiến dịch có thể dừng ở trạng thái `Đang gửi`. Kiểm tra lịch sử trước khi tạo chiến dịch mới để tránh gửi lại người đã nhận.

## 17. Checklist nghiệm thu

- [ ] Vercel CLI liên kết đúng project.
- [ ] Biến môi trường Zalo đã được đặt trên Vercel Production.
- [ ] Production đã được deploy lại.
- [ ] Thẻ meta Zalo xuất hiện trong HTML production.
- [ ] URL/prefix đã được Zalo xác thực.
- [ ] Callback được lưu và còn tồn tại sau khi reload trang Zalo Developer.
- [ ] Quyền gửi tin qua số điện thoại được chọn.
- [ ] Supabase CLI thấy project `crcqyaphmaxgkrhffevl`.
- [ ] Migration đã tạo đủ ba bảng.
- [ ] `ZALO_APP_SECRET` đã được lưu trong Supabase Secrets.
- [ ] Ba Edge Functions đã deploy thành công.
- [ ] OA đã cấp quyền cho ứng dụng.
- [ ] Banner ứng dụng hiển thị OA đã kết nối.
- [ ] Có Template ID đã duyệt và biết đơn giá.
- [ ] Gửi thử một số điện thoại thành công.
- [ ] Lịch sử chiến dịch ghi đúng kết quả.

## 18. Các file liên quan

| File | Nội dung |
| --- | --- |
| `index.html` | Thẻ meta xác thực URL Zalo |
| `.env.example` | Mẫu biến môi trường frontend |
| `src/pages/ZnsBulkSendPage.tsx` | Giao diện gửi hàng loạt |
| `src/pages/ZaloOauthCallbackPage.tsx` | Xử lý OAuth callback |
| `src/data/znsData.ts` | Truy cập dữ liệu và gọi Edge Functions |
| `src/database/zns.sql` | SQL tạo bảng |
| `supabase/migrations/20260814_zns_bulk_send.sql` | Migration Supabase |
| `supabase/functions/_shared/zalo.ts` | Helper Zalo API/token |
| `supabase/functions/zns-oauth-exchange/index.ts` | Đổi code lấy token |
| `supabase/functions/zns-oa-status/index.ts` | Trạng thái kết nối |
| `supabase/functions/zns-send-batch/index.ts` | Gửi tin theo lô |

## 19. Nguyên tắc vận hành

- Luôn gửi thử cho một người trước chiến dịch lớn.
- Luôn kiểm tra giá template trước khi xác nhận gửi.
- Không gửi nội dung khác mục đích template đã được Zalo duyệt.
- Không gửi cho danh sách khách hàng không đủ điều kiện theo chính sách Zalo.
- Không đưa App Secret hoặc token vào frontend.
- Không xóa thẻ meta xác thực Zalo khỏi website production.
- Kiểm tra lịch sử và lỗi từng người nhận sau mỗi chiến dịch.

