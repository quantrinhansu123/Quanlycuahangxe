# Báo cáo: Module Gửi ZNS hàng loạt (Zalo Official Account)

Đã xây dựng xong module gửi tin ZNS (Zalo Notification Service) hàng loạt tới khách hàng theo số điện thoại, tích hợp Zalo Official Account. Module nằm trong sidebar admin: **Gửi ZNS hàng loạt** (`/zns/gui-hang-loat`).

## Kiến trúc

App này không có backend Node riêng — mọi logic có bí mật (App Secret, access token) chạy trong **Supabase Edge Function** (giống cách `invite-nhan-vien` đã làm), không lộ ra trình duyệt.

```
Trình duyệt (admin)
   │  chọn khách hàng + Template ID + gửi
   ▼
Edge Function: zns-send-batch  ──►  Zalo ZNS API (business.openapi.zalo.me)
   │  tự làm mới access_token nếu sắp hết hạn
   ▼
Bảng zns_oa_token (chỉ Edge Function đọc/ghi được)
```

## Các thành phần đã tạo

### Database (`src/database/zns.sql`, đã copy vào `supabase/migrations/20260814_zns_bulk_send.sql`)

| Bảng | Vai trò |
| --- | --- |
| `zns_oa_token` | Lưu access/refresh token Zalo OA. **Không có policy RLS nào cho anon/authenticated** — chỉ Edge Function (service-role key) đọc/ghi được, khác với quy ước "cho phép tất cả" ở các bảng khác trong app vì bảng này chứa bí mật. |
| `zns_chien_dich` | 1 dòng = 1 chiến dịch gửi (tên, Template ID, cách ánh xạ dữ liệu, đếm số thành công/thất bại, trạng thái). |
| `zns_gui_log` | 1 dòng = 1 lần gửi cho 1 khách hàng cụ thể (SĐT, dữ liệu đã gửi, kết quả, lỗi nếu có). Có `idempotency_key` chống gửi trùng khi retry. |

### Edge Functions (`supabase/functions/`)

- **`_shared/zalo.ts`** — helper dùng chung: làm mới access token, gọi API gửi ZNS, chuẩn hoá SĐT sang định dạng Zalo (`84xxxxxxxxx`).
- **`zns-oauth-exchange`** — đổi `code` (Zalo trả về sau khi admin cấp quyền) lấy access/refresh token, lưu DB.
- **`zns-oa-status`** — trả trạng thái kết nối OA cho banner trên giao diện (không bao giờ trả token thật).
- **`zns-send-batch`** — gửi 1 lô tối đa 30 người nhận/lần gọi (tránh timeout), ghi log từng người, cộng dồn số liệu chiến dịch.

### Frontend

- **`src/data/znsData.ts`** — lớp truy cập dữ liệu (tạo chiến dịch, render dữ liệu mẫu theo khách hàng, gọi Edge Function gửi, đọc lịch sử).
- **`src/pages/ZnsBulkSendPage.tsx`** — trang chính: banner trạng thái kết nối OA, form chiến dịch + ánh xạ biến, chọn khách hàng (tìm kiếm/lọc theo cơ sở/chọn tất cả), xem trước dữ liệu gửi, nút gửi có thanh tiến trình, lịch sử chiến dịch xem chi tiết từng người nhận.
- **`src/pages/ZaloOauthCallbackPage.tsx`** — trang nhận redirect từ Zalo sau khi admin bấm "Đồng ý" cấp quyền, tự động hoàn tất kết nối.
- Đã nối vào `src/App.tsx` (route, admin-only), `src/data/viewPermissions.ts` (quyền `zns-gui-hang-loat`), `src/data/sidebarMenu.ts` (menu).

## Việc cần làm trước khi dùng thật

> [!WARNING]
> Đây là phần **bạn phải tự thực hiện** — tôi không có quyền truy cập tài khoản Zalo Developer hay Supabase CLI của bạn.

1. **Chạy migration**: dán `src/database/zns.sql` vào Supabase SQL Editor (hoặc `npx supabase db push`).
2. **Lấy App ID + App Secret** tại developers.zalo.me → ứng dụng của bạn → Thông tin ứng dụng.
3. **Điền `.env`**:
   ```
   VITE_ZALO_APP_ID=...
   VITE_ZALO_OAUTH_REDIRECT_URI=https://<domain-của-bạn>/zalo/oauth-callback
   ```
   (URI này phải đăng ký trùng khớp trong Zalo App console.)
4. **Set secret + deploy Edge Functions**:
   ```
   npx supabase secrets set ZALO_APP_SECRET=your-secret --project-ref <project-ref>
   npx supabase functions deploy zns-oauth-exchange
   npx supabase functions deploy zns-oa-status
   npx supabase functions deploy zns-send-batch
   ```
5. Vào trang **Gửi ZNS hàng loạt** → **Kết nối Zalo OA** → đồng ý cấp quyền trên Zalo → tự động quay lại app.
6. Dán **Template ID** lấy từ ZNS Template Library. Form đã điền sẵn 3 biến mặc định khớp mẫu "Chăm sóc, thu thập ý kiến của KH sau khi mua hàng": `customer_name` ← Tên khách hàng, `order_code` ← Mã đơn hàng gần nhất, `order_date` ← Ngày đơn hàng gần nhất.

## Verification Checklist

- [x] `npx tsc --noEmit` không lỗi.
- [x] `npm run build` build thành công, 2 trang mới lên bundle riêng (`ZnsBulkSendPage`, `ZaloOauthCallbackPage`).
- [x] Route admin-only đã nối menu/phân quyền, không phá route hiện có.
- [ ] **Chưa test với tài khoản Zalo OA thật** — xem lưu ý bên dưới.

> [!CAUTION]
> Phần gọi API Zalo (endpoint, tên field trong `_shared/zalo.ts`) được viết theo tài liệu Zalo đã biết trước đó, **chưa được xác minh với tài liệu Zalo mới nhất hay tài khoản thật**. Sau khi có Template ID + kết nối OA thật, hãy gửi thử 1 SĐT thật trước — nếu lỗi, thông điệp lỗi trả về từ Zalo (hiển thị ngay trong lịch sử chiến dịch) sẽ cho biết cần chỉnh gì (thường là tên field hoặc định dạng SĐT).

## Giới hạn đã biết (v1)

- Chỉ hỗ trợ **1 Zalo OA kết nối tại 1 thời điểm**.
- Ánh xạ biến template phải nhập tay (chưa lấy tự động danh sách biến từ Zalo).
- Nếu đóng tab giữa lúc đang gửi, chiến dịch dừng ở trạng thái "Đang gửi" — chưa có nút "gửi tiếp cho người còn lại" (cần bổ sung nếu thực tế gặp trường hợp này).
