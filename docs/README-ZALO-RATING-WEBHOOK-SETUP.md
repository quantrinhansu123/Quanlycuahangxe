# Hướng dẫn nhận đánh giá dịch vụ từ Zalo (Webhook + đồng bộ thủ công)

Tài liệu này bổ sung cho `docs/README-ZALO-ZBS-SETUP.md`: module **Gửi ZNS hàng loạt** (gửi ZBS Template đánh giá dịch vụ) đã hoạt động, tài liệu này hướng dẫn nối dây phần **nhận kết quả đánh giá** của khách hàng — trang **Đánh giá dịch vụ qua Zalo** (`/zns/danh-gia`).

## 1. Cơ chế

Zalo có 2 cách để lấy dữ liệu đánh giá của 1 ZBS Template đánh giá dịch vụ:

1. **Webhook** (chính thức, thời gian thực) — sự kiện "Người dùng phản hồi template đánh giá dịch vụ" (`event_name: "user_feedback"`). Zalo POST payload này đến **Webhook URL** đã đăng ký trên App khi khách hàng gửi đánh giá.
2. **API "Lấy thông tin đánh giá của khách hàng"** (`POST https://business.openapi.zalo.me/rating/get`) — dùng để lấy lại dữ liệu cũ (trước khi cấu hình Webhook) hoặc đối soát định kỳ. Trang `/zns/danh-gia` có nút **Đồng bộ** gọi API này qua Edge Function `zns-ratings-sync`.

```text
Zalo (khách hàng gửi đánh giá)
        |
        v
Supabase Edge Function: zns-webhook  ---->  bảng zns_danh_gia
        ^
        | (đồng bộ thủ công/bù dữ liệu)
Supabase Edge Function: zns-ratings-sync
```

Cả 2 đường đều map đánh giá về đúng khách hàng/chiến dịch qua `msg_id` (đối chiếu với `zns_gui_log.zalo_msg_id` — cột này đã được lưu sẵn khi gửi ZNS).

## 2. Trạng thái hiện tại

- [x] Bảng `zns_danh_gia`, Edge Function `zns-webhook`, `zns-ratings-sync` và trang `/zns/danh-gia` đã có trong mã nguồn.
- [ ] Migration `supabase/migrations/20260817_zns_danh_gia.sql` chưa được xác nhận đã chạy trên Supabase production.
- [ ] Edge Functions `zns-webhook`, `zns-ratings-sync` chưa được deploy.
- [ ] Webhook URL chưa được đăng ký trên Zalo Developer.
- [ ] Quyền "Nhận sự kiện quản lý Message Template" chưa được cấp cho ứng dụng.
- [ ] Chưa nhận thử 1 đánh giá thật để xác nhận đúng công thức chữ ký (`X-ZEvent-Signature`).

## 3. Chạy migration

Giống cách đã làm với module ZNS hàng loạt (xem mục 10 của `README-ZALO-ZBS-SETUP.md`):

```powershell
npx supabase db push
```

Hoặc dán nội dung `supabase/migrations/20260817_zns_danh_gia.sql` vào Supabase SQL Editor. Sau khi chạy phải có bảng `zns_danh_gia`.

## 4. Deploy Edge Functions

```powershell
npx supabase functions deploy zns-webhook --project-ref crcqyaphmaxgkrhffevl
npx supabase functions deploy zns-ratings-sync --project-ref crcqyaphmaxgkrhffevl
```

Sau khi deploy, URL Webhook công khai của ứng dụng có dạng:

```text
https://crcqyaphmaxgkrhffevl.supabase.co/functions/v1/zns-webhook
```

Kiểm tra lại URL chính xác trong Supabase Dashboard → Edge Functions.

## 5. Đăng ký Webhook URL trên Zalo Developer

Mở:

```text
https://developers.zalo.me/app/3540981949545194380/oa/settings
```

hoặc mục cấu hình Webhook trong phần **Quản lý Template → Template Webhook** của ứng dụng (giao diện Zalo Developer có thể thay đổi theo thời gian — tìm mục "Webhook URL" của App).

1. Dán URL `zns-webhook` ở bước 4 vào ô Webhook URL.
2. Bật quyền **"Nhận sự kiện quản lý Message Template"**.
3. Lưu cấu hình.

## 6. Xác minh chữ ký Webhook (X-ZEvent-Signature) — tuỳ chọn nhưng nên bật

Zalo ký mỗi request Webhook bằng header `X-ZEvent-Signature = sha256(appId + data + timeStamp + OAsecretKey)`.

- `appId`, `timeStamp`: lấy từ chính payload JSON (`app_id`, `timestamp`).
- `data`: chuỗi JSON gốc của payload.
- `OAsecretKey`: **[CẦN XÁC NHẬN]** tài liệu Zalo không nói rõ đây có phải cùng giá trị với App Secret (`ZALO_APP_SECRET` đã cấu hình cho module ZNS hàng loạt) hay một khoá bí mật riêng cấp cho OA. Tìm mục này trong Zalo Developer (khu vực cấu hình Webhook/OA) — nếu không thấy khoá riêng, thử dùng App Secret hiện có.

Sau khi xác định đúng giá trị, lưu vào Supabase Edge Function Secrets với tên:

```text
ZALO_OA_SECRET_KEY
```

```powershell
npx supabase secrets set ZALO_OA_SECRET_KEY=<gia-tri> --project-ref crcqyaphmaxgkrhffevl
```

**Lưu ý:** Nếu chưa cấu hình `ZALO_OA_SECRET_KEY`, Edge Function `zns-webhook` vẫn nhận và lưu đánh giá bình thường (bỏ qua bước xác minh chữ ký) — để không chặn việc nối dây/kiểm thử ban đầu. Nên cấu hình sớm sau khi xác nhận đúng công thức, tránh nhận payload giả mạo.

## 7. Kiểm thử

1. Gửi 1 tin ZBS Template đánh giá dịch vụ thật cho 1 số điện thoại nội bộ (dùng lại luồng "Gửi ZNS hàng loạt" đã có, template `623794`).
2. Trên điện thoại nhận tin, bấm vào và gửi đánh giá (chọn số sao + để lại nhận xét).
3. Kiểm tra log Edge Function `zns-webhook` trên Supabase Dashboard — phải thấy request đến với `event_name: "user_feedback"`.
4. Mở trang **Đánh giá dịch vụ qua Zalo** trong ứng dụng — đánh giá vừa gửi phải xuất hiện, đúng tên khách hàng (map qua `msg_id`).
5. Nếu muốn lấy lại đánh giá cũ (trước khi Webhook hoạt động), dùng nút **Đồng bộ** trên trang, chọn đúng chiến dịch và khoảng thời gian.

## 8. Xử lý lỗi thường gặp

### Webhook không nhận được gì

- Kiểm tra URL đã đăng ký đúng, không có khoảng trắng/ký tự thừa.
- Kiểm tra quyền "Nhận sự kiện quản lý Message Template" đã được cấp.
- Kiểm tra Edge Function đã deploy (không lỗi 404 khi gọi thử `curl -X POST <url>`).

### Đánh giá xuất hiện nhưng không map được khách hàng/chiến dịch

- `msg_id` trong webhook không khớp với `zns_gui_log.zalo_msg_id` nào — có thể do tin được gửi trước khi module ZNS hàng loạt lưu `zalo_msg_id` (kiểm tra lại lịch sử gửi), hoặc do đánh giá đến từ 1 template không gửi qua module này.
- Vẫn hiển thị được (không mất dữ liệu), chỉ thiếu tên khách hàng/chiến dịch liên kết.

### Đồng bộ thủ công báo lỗi quyền

- Theo tài liệu Zalo: "Ứng dụng chỉ có thể lấy thông tin đánh giá từ template đánh giá dịch vụ được tạo bởi ứng dụng đó hoặc OA cấp quyền cho ứng dụng." — kiểm tra đúng OA đang kết nối là OA sở hữu/được cấp quyền template đó.

## 9. Các file liên quan

| File | Nội dung |
| --- | --- |
| `src/pages/ZnsRatingPage.tsx` | Giao diện xem đánh giá + đồng bộ thủ công |
| `src/data/znsRatingData.ts` | Truy cập dữ liệu và gọi Edge Function |
| `src/database/zns_danh_gia.sql`, `supabase/migrations/20260817_zns_danh_gia.sql` | SQL tạo bảng `zns_danh_gia` |
| `supabase/functions/_shared/zalo.ts` | Helper xác minh chữ ký Webhook + gọi API `rating/get` |
| `supabase/functions/zns-webhook/index.ts` | Nhận sự kiện Webhook từ Zalo |
| `supabase/functions/zns-ratings-sync/index.ts` | Đồng bộ thủ công qua API `rating/get` |
