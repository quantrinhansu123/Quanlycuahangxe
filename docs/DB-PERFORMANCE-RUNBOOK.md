# Kiểm tra hiệu năng Supabase/Vercel — 13/09/2026

## Kết quả và giới hạn truy cập

Đã đo HTTP trên project `crcqyaphmaxgkrhffevl`, chạy EXPLAIN ANALYZE trên PostgreSQL/PGlite và DB production, kiểm tra RPC bằng đối chiếu trước/sau, rồi áp dụng migration `202609130001_query_performance` lúc 08:16 UTC ngày 13/09/2026. Bảy index đều `indisvalid=true`, `indisready=true`; owner, ACL và SECURITY INVOKER của RPC được giữ nguyên. Đã chạy ANALYZE các bảng liên quan.

Migration `202609120001_purchase_receipt_manual_code.sql` cũng đã được áp dụng production lúc 08:25 UTC (Supabase ghi version triển khai `20260913082537`). Hai RPC phiếu nhập được cập nhật để cấp mã sau khi kiểm tra hợp lệ, hỗ trợ mã thủ công và khóa cạnh tranh; owner, ACL và `SECURITY DEFINER` giữ nguyên. Không có dữ liệu nghiệp vụ bị ghi trong lần triển khai.

Hotfix `202609140001_purchase_receipt_time_type_fix.sql` đã được áp dụng production lúc 08:33 UTC ngày 14/09/2026 (Supabase ghi version `20260914083300`). RPC giờ parse chuỗi giờ sang `time without time zone` trước khi đồng bộ vào `nhap_xuat_kho.gio`, trong khi vẫn giữ `phieu_nhap_hang.gio` dạng text tương thích dữ liệu cũ. Owner, ACL, `SECURITY DEFINER`, `search_path` và kiểu cột production đã được đối chiếu trước/sau; không thay đổi dữ liệu nghiệp vụ.

Migration `202609140002_purchase_receipt_payment.sql` đã được áp dụng production lúc 09:21 UTC ngày 14/09/2026 (Supabase ghi version `20260914092114`). Phiếu nhập hỗ trợ Tiền mặt, Chuyển khoản và Chưa thanh toán; RPC đồng bộ nguyên tử đúng một phiếu chi theo `source_id`. Giao dịch đã trả ở trạng thái hoàn thành nên đi vào dòng tiền, còn chưa trả ở trạng thái chờ để theo dõi công nợ. Ca tạo, đổi trạng thái và xóa đã chạy trực tiếp trên production trong transaction rollback; số bản ghi trước/sau giữ nguyên.

Đã dùng scoped Supabase Management token lưu trong `.env.local` (được gitignore) để đọc metadata, chạy SQL/EXPLAIN có giới hạn và áp dụng migration. Endpoint plan công khai vẫn trả **406/PGRST107**, nên EXPLAIN được chạy qua Management API với role `anon`; không bật plan công khai. Chưa có quyền Vercel private để xem Runtime Logs hoặc compute addon.

## Baseline HTTP production

Mẫu trước lúc 07:46 UTC và mẫu sau lúc 08:19 UTC (14:19 Việt Nam), ba request tuần tự cho mỗi trường hợp, scope anon. Sau triển khai số dòng: 5.978 khách, 7.971 đơn, 13.726 chi tiết, 3.399 thu/chi, 628 chấm công.

| Trường hợp | Trung vị | Cao nhất |
|---|---:|---:|
| Danh sách khách, 20 dòng | 329 ms | 489 ms |
| Bán hàng 01–13/09/2026, 20 dòng | 950 ms | 1.027 ms |
| Bán hàng toàn kỳ, 20 dòng | 1.527 ms | 1.844 ms |
| Thống kê danh sách khách rỗng | 1.018 ms | 1.044 ms |
| Thống kê một khách có đơn | 1.026 ms | 1.102 ms |

Sau migration (median/max, ms): customers 189/430; bán hàng tháng 802/958; bán hàng toàn kỳ 1.484/1.526; thống kê rỗng 119/135; thống kê một khách 382/428. Đây là hai mẫu nhỏ, không phải p95; số liệu bán hàng toàn kỳ vẫn cao vì `sales_query` chưa được viết lại trong migration này.

Đây là thời gian gồm mạng, PostgREST, DB và đọc response; ba mẫu chưa đủ để kết luận p95. Scope có phiên đăng nhập/RLS có thể cho kết quả khác. Dữ liệu đo và request ID để đối chiếu nằm ở `.build-verification/db-performance/http-baseline.json` (được gitignore).

Chạy lại từ thư mục project:

```powershell
npm run db:measure -- --repeat=3
```

Script chỉ gọi API đọc, HEAD và OPTIONS, không ghi dữ liệu hay gửi tin ZNS. Có thể đặt `APP_PERF_SESSION_TOKEN` trong môi trường local để đo scope của tài khoản thật; không dùng tiền tố VITE cho biến này và không commit token. Kết quả không chứa nội dung hồ sơ, từ khóa, request body hoặc credentials.

## Thay đổi đã chuẩn bị

Migration: [202609130001_query_performance.sql](../supabase/migrations/202609130001_query_performance.sql).

| Truy vấn thực tế | Thay đổi |
|---|---|
| `shortNumericSearchData.ts`: `bien_so_xe/ma_khach_hang ILIKE '%digits%'` | Hai GIN trigram index trên cột gốc |
| Tìm đơn: `id_bh/khach_hang_id ILIKE '%digits%'` | Hai GIN trigram index trên cột gốc |
| Báo cáo chi tiết theo ngày | `the_ban_hang_ct(ngay,id)` |
| Thu chi theo ngày, phân trang | `thu_chi(ngay,id)` |
| Chấm công theo ngày/thời điểm tạo/ID | `cham_cong(ngay DESC,created_at DESC,id DESC)` |
| `customer_order_stats` | Lọc đơn của khách yêu cầu trước khi cộng chi tiết; bỏ JSON khách/ảnh/phục hồi tên khỏi luồng thống kê; trả ngay khi danh sách rỗng |

GIN phục vụ LIKE/ILIKE chứa chuỗi; B-tree trên biển số chuẩn hóa hoặc reverse-prefix không hỗ trợ trực tiếp biểu thức ILIKE của fast path này. Các truy vấn `position(...)` trong RPC tìm kiếm tổng quát vẫn cần tối ưu riêng; migration này không tuyên bố làm chúng dùng trigram. [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

Giữ các index hiện có `sales_date_page`, `sales_customer_ref_search`, `sales_detail_ref_search`. Đã loại các index nháp trùng hoặc không khớp predicate (staff token phân cách dấu phẩy không dùng được B-tree trên cả chuỗi). Extension pg_trgm được tìm theo schema hiện hữu để tương thích `public` và `extensions`.

RPC vẫn giải quyết toàn bộ **định danh nhẹ** của khách trong phạm vi RLS. Việc này cần thiết để giữ đúng ưu tiên UUID → mã → số điện thoại duy nhất, đặc biệt khi một số điện thoại có nhiều xe. Bản mới không gán đơn của khách không được yêu cầu sang một khách khác chỉ vì cùng số điện thoại. Không thay dữ liệu nghiệp vụ, quyền EXECUTE, SECURITY INVOKER hoặc RLS.

## EXPLAIN và test local

```powershell
npm run test:performance
```

Test tự tạo khoảng 6.000 khách, 8.000 đơn, 16.000 chi tiết (cộng các ca biên), cập nhật thống kê và VACUUM để phản ánh GIN đã được bảo trì. Không tải dữ liệu khách production vào máy.

Lần kiểm tra cuối trên PGlite (khi chạy toàn bộ npm test):

| Trường hợp | Trước | Sau |
|---|---:|---:|
| Thống kê một khách | 937 ms | 263 ms |
| Danh sách khách rỗng | 790 ms | 0,12 ms |
| Tìm khách theo chuỗi số | 9,46 ms | 1,64 ms |
| Tìm đơn theo chuỗi số | 12,71 ms | 0,12 ms |

Planner chọn đủ bảy index mới cho các predicate tương ứng trong fixture, không tắt seq scan để ép index. Kết quả JSON chứa cả plan phần thân RPC nằm ở `.build-verification/db-performance/explain-local.json`. Các số trên là mẫu đo local, không dự đoán mức cải thiện production.

EXPLAIN ANALYZE production sau triển khai (role `anon`, cùng transaction READ ONLY): `customer_order_stats` rỗng 5,2 ms, một khách 255 ms; raw ILIKE khách 4,1 ms và đơn 4,4 ms, planner chọn `Bitmap Heap Scan`. `sales_query` tháng 644 ms và toàn kỳ 1.300 ms trong lần đo này; vẫn có temp spill nên đây là hạng mục tối ưu tiếp theo.

Test bao phủ: mã/UUID/điện thoại, chủ đơn khác, hai xe chung số, mã chuẩn hóa trùng, UUID trùng mã, tham chiếu chi tiết kép, số tiền 0, giá dịch vụ cũ, số km mới nhất, RLS trên khách/đơn/chi tiết/dịch vụ, chạy lại migration và giữ nguyên ACL/dữ liệu. Test helper cũ đã cập nhật theo hành vi ứng dụng sẵn có: biển số đầy đủ dùng RPC, timeout đọc 20 giây; không đổi hành vi search hay tăng timeout.

Kiểm tra cuối: npm test đạt (bao gồm bộ performance/diagnostics mới), npm run build đạt, ESLint các file TypeScript thay đổi đạt. Các khối metadata, EXPLAIN và pg_stat_statements đã chạy READ ONLY trên DB production qua Management API; artifact chi tiết được gitignore.

## Kiểm tra production và rollback

1. Đã chạy metadata, EXPLAIN và pg_stat_statements qua Management API. Bản definition/ACL RPC trước triển khai và inventory index nằm trong artifact gitignored `.build-verification/db-performance/` để rollback/đối chiếu; không coi file `supabase/migrations.sql` cũ là toàn bộ schema.
2. Chạy EXPLAIN trên cùng tham số, role, request headers/JWT với request chậm. SQL Editor mặc định thường là owner và có thể bỏ qua RLS. Script giữ transaction READ ONLY, giới hạn lock wait 2 giây và EXPLAIN 15 giây; nếu lỗi, ROLLBACK trước khi chạy phần tiếp theo.
3. Nếu EXPLAIN chỉ có `Result/Function Scan`, đó là tổng thời gian function, chưa phải plan bên trong. Xem phần SQL bên trong function hoặc artifact local để tìm CTE/detail join cụ thể.
4. Migration đã kiểm tra index hiện có, dùng `IF NOT EXISTS`, `lock_timeout=3s`, và ghi version `202609130001` vào `supabase_migrations.schema_migrations`. Bảng hiện có khoảng 6–14 nghìn dòng nên tạo index trong transaction hoàn tất; bảng lớn/bận nên tạo `CONCURRENTLY` riêng.
5. Sau áp dụng đã chạy ANALYZE, kiểm tra đủ 7 index hợp lệ, so sánh RPC cũ/mới trên toàn bộ ID với role owner và anon (6 ca gồm rỗng/null/missing), rồi đo HTTP lại. Không đặt ngưỡng pass cố định bằng số đo local.
6. Rollback RPC bằng definition đã lưu từ **DB thật**. Chỉ gỡ index mới do lần triển khai này tạo nếu cần; giữ dữ liệu và extension dùng chung.

`Rows Removed by Filter` lớn, nhiều vòng lặp trên detail join hoặc spill ra temp giúp xác định phần cần tối ưu. Seq scan có thể là lựa chọn đúng khi cần đọc phần lớn bảng. `Buffers read` không tự chứng minh thiếu index; cần xét độ chọn lọc, cache và I/O. Không tăng timeout/work_mem chỉ dựa vào một dòng plan.

## Pool, connection limit và region

Luồng hiện tại: trình duyệt → Supabase PostgREST/RPC trực tiếp qua một singleton client trong `src/lib/supabase.ts`. Các Edge Function dùng supabase-js HTTP. Không có driver pg/postgres hoặc pool PostgreSQL trong frontend/Vercel. File SSR client khác hiện không có call site trong ứng dụng.

Đã xác minh `max_connections=60`, `superuser_reserved_connections=3`, `work_mem=2184 kB`; lúc chụp có 14 backend (11 PostgREST authenticator, 2 Supabase service, 1 Management API), không có khóa chờ. Pooler đang `transaction` nhưng API không trả `default_pool_size`/`max_client_conn` (null), nên chưa suy diễn giới hạn client từ số backend. Cần xem Dashboard Observability/Database Settings để biết pool client thực tế và chừa kết nối cho PostgREST/Auth/Storage. [Supabase pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)

Script SQL kiểm tra role/application, active/idle-in-transaction, khóa chờ, setting và override theo role. Nếu thêm backend dùng PostgreSQL sau này, chọn endpoint direct hoặc pooler theo workload từ Connect dialog; không thay VITE_SUPABASE_URL bằng connection string. [Supabase connection management](https://supabase.com/docs/guides/database/connection-management)

Kết quả region đã quan sát:

| Thành phần | Bằng chứng | Kết luận |
|---|---|---|
| Vercel website | HEAD 200, `x-vercel-id=hkg1::...`, cache HIT | CDN edge xử lý mẫu đo là hkg1 |
| Supabase Edge Function | OPTIONS `zns-oa-status`: 200, `x-sb-edge-region=ap-northeast-2` | Invocation preflight chạy tại Seoul |
| Vercel rewrite `/api/zns-oa-status` | OPTIONS 200; hkg1 → ap-northeast-2 | Proxy hoạt động trong mẫu đo |
| Supabase PostgreSQL | Management API project trả `region=ap-northeast-2` | Đã xác minh Seoul, cùng region Edge Function |
| Vercel Function compute | Repo là Vite SPA, không có Vercel API function | Không có cấu hình compute region trong repo để điều chỉnh |

`regions` trong vercel.json điều khiển Vercel Functions; static assets vẫn qua CDN. Vì vậy chưa thêm giá trị region suy đoán vào SPA này. [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)

Header Edge Function chỉ chứng minh region của invocation, không phải DB region hay region cố định cho mọi request. Khi có DB region, so sánh với function; workload nhiều lượt DB có thể thử region cùng DB. Việc ép region ảnh hưởng tự động chuyển vùng khi sự cố, cần đo trước khi chọn. [Supabase regional invocations](https://supabase.com/docs/guides/functions/regional-invocation)

## Log request chậm

Đã thêm log cấu trúc, ngưỡng 1.000 ms:

- `[supabase-slow-request]`: áp dụng cho mọi request qua singleton Supabase client, có endpoint (không query string), HTTP status, duration đến response headers, timestamp và `sb-request-id` nếu trình duyệt đọc được.
- `[slow-request]`: thời gian hoàn tất readRequest gồm đọc/parse dữ liệu, outcome ok/error/timeout. Hủy request cũ khi đổi bộ lọc không bị ghi là request chậm.

Đây là log **console trình duyệt**, chưa gửi tới hệ thống lưu trữ tập trung và không tự xuất hiện ở Vercel Runtime Logs. Hai phase đo khác nhau, không cộng duration của chúng.

Khi có quyền dashboard: dùng timestamp UTC, endpoint và request ID đối chiếu Supabase API logs; xem Postgres logs/Query Performance cho timeout, thời gian SQL, đọc đĩa, khóa chờ. `pg_stat_statements` là thống kê tích lũy, không phải từng request hay p95; lấy hai snapshot cùng khoảng đo, không reset chung. [Supabase Logs](https://supabase.com/docs/guides/observability/logs)

Vercel Runtime Logs chỉ quan sát được request qua Vercel (bao gồm external rewrite nếu được ghi), không bao phủ REST/RPC browser gọi trực tiếp Supabase. Lọc đường dẫn `/api/*`, thời gian, status và region để tách độ trễ proxy. [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)

Log 6 giờ gần nhất cho thấy `sales_query` trung bình 1.739 ms, p95 origin 4.209 ms (326 request, 31 lỗi 5xx); `customer_order_stats` trung bình 1.529 ms, p95 4.280 ms (371 request, 32 lỗi 5xx). Có 95 lỗi Postgres SQLSTATE 57014 do statement timeout. Sau migration, stats một khách/rỗng giảm rõ trong mẫu trực tiếp; các log tích lũy gồm cả thời gian trước triển khai. `sales_query` toàn kỳ và việc dựng toàn bộ khách/ngày mua đầu vẫn là điểm cần tối ưu tiếp; RLS chạy theo từng hàng, báo cáo nhiều trang và fast path có thể phát nhiều request chi tiết song song. Chưa thay pool size/compute/region vì chưa có số liệu compute addon và pool client đầy đủ.
