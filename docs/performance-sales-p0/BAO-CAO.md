# Phase P0 — Performance Sales

**Cập nhật P0.7 — trạng thái hiện tại:** P0 PASS trong bộ validation database/API và application read loaders đã chạy; LIVE giữ **P0.6 NEW**. Page1/page2 NEW vượt 5 warm lượt/page, 10/10 HTTP200, 14-case full JSON parity, 12 role comparisons và sáu caller pass. Không thay migration P0.6; chưa xác định nguyên nhân exact sample3021ms lịch sử. Xem [báo cáo P0.7](../performance-sales-p07/BAO-CAO.md). Các cập nhật P0.5/P0.6 và nội dung bên dưới giữ evidence lịch sử.

**Cập nhật P0.6:** Local all/page cải thiện, nhưng LIVE NEW page1 SQL **3021 ms** chậm hơn OLD warmed median **1590 ms**; đã rollback ngay và xác minh catalog OLD. **Chưa PASS P0.** Xem [báo cáo P0.6](../performance-sales-p06/BAO-CAO.md). Migration hiện tại chứa bản P0.6; migration P0.5 được archive trong thư mục báo cáo P0.6.

**Cập nhật P0.5 trên LIVE:** Đã snapshot, apply thử và đo database/API thật; NEW tái hiện **500 / 57014 ở all/page2**, đã rollback và xác minh LIVE trở về OLD. **Chưa PASS P0.** Xem [báo cáo P0.5](P0.5-BAO-CAO.md). Phần bên dưới lưu kết quả và trạng thái của giai đoạn P0 local trước lần validate LIVE này.

Ngày: **04/10/2026, Asia/Saigon**. Repository: `D:\xe\Quanlycuahangxe-main`. Branch **main**, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`; working tree sạch trước khi sửa.

**Đã triển khai và kiểm chứng local. Chưa xác nhận PASS P0 trên database/API thật.** Migration chưa được áp dụng lên production. Management API trả **401 Unauthorized**, nên chưa re-export definition hiện hành hoặc chạy EXPLAIN NEW trên database thật. Probe HTTP anon hiện tại vẫn tái hiện **500 / 57014** ở all/page1 và staff. Không suy diễn kết quả local thành kết quả production.

## 1. Root cause xác nhận

Audit và source cùng HEAD xác nhận `sales_query` gọi `app_sales_rows_searched` trước pagination. Helper dựng JSON khách hàng rộng, refs/phones MATERIALIZED, aggregate detail và JSON sale; wrapper lại đọc `j->>` để lọc staff/branch/reference/customer, phân loại khách, SUM/COUNT DISTINCT/group ngày và sort. First-date tính rộng; đổi page tính lại summary. Wide JSON làm intermediate lớn và spill.

Audit thật: all/page1 **2.170,137 ms SQL**, temp **17.000/15.495 blocks**; helper body có external merge **8.200 kB**. Reference limit1 **1.935,835 ms** dù lookup header đơn thuần khoảng 5 ms. HTTP có lỗi `57014`. [Audit gốc](../../../performance-audit-20261004/BAO-CAO.md).

## 2. File thay đổi

- [Migration SQL](../../supabase/migrations/202610040001_sales_p0.sql).
- [Rollback SQL](../../supabase/rollback/202610040001_sales_p0.sql).
- [Fixture local](../../scripts/sales-p0-fixture.mjs), [regression](../../scripts/test-sales-p0.mjs), [benchmark SQL local](../../scripts/measure-sales-p0.mjs).
- [Probe HTTP đọc anon](../../scripts/measure-sales-p0-http.mjs), [export definition qua Management API read-only](../../scripts/sales-p0-readonly.mjs).
- [package.json](../../package.json): thêm test P0 vào `npm test`, thêm command chạy test/benchmark.
- Thư mục báo cáo này: definition backup, regression, plans OLD/NEW, benchmark, HTTP và kiểm tra.

Không sửa frontend/data layer vì signature/contract được giữ. Không có shared helper ngoài Sales bị thay đổi.

## 3. PostgreSQL functions

Thay definition, giữ signature/return type: `sales_query(text,date,date,text,text,integer,integer,text,text)`, `app_sales_rows_searched(date,date,text)`, `app_sales_first_dates()`.

Thêm: `app_sales_customer_identities(boolean)`, `app_sales_filtered_typed(date,date,text,text,text,text,text)`, `app_sales_first_dates_for_keys(text[])`, `app_sales_page_json(uuid,text,text,text,numeric,text[])`.

Tất cả STABLE, SECURITY INVOKER; giữ `search_path=public`. CREATE OR REPLACE giữ owner/ACL của function cũ. Không đổi RLS, timeout, work_mem, index hoặc business schema. `app_customer_rows`, `app_customer_matches`, `app_sales_rows`, `sales_lookup`, `sales_details` giữ nguyên.

## 4–5. Kiến trúc OLD / NEW

OLD: customers JSON → refs/phones MATERIALIZED → date/search sales → detail aggregate → JSON toàn sale dataset → staff/branch/reference/customer filter → classified JSON/summary/daily → sort → LIMIT/OFFSET.

NEW: typed identity map → header date/reference/staff → resolve identity → customer/search typed → detail amount/branches → branch filter → narrow filtered rows → sort và page IDs → LIMIT/OFFSET → chỉ page header/customer JSON. Summary/daily lấy cột scalar từ cùng tập filtered; không đọc lại sale JSON.

Lookup reference dùng UUID primary key và index normalized code hiện có để tìm candidate, rồi kiểm tra raw-code equality của OLD. Chưa thêm index nào.

## 6. Filter trước LIMIT

| Filter | Vị trí và semantics được giữ |
| --- | --- |
| `p_start`, `p_end` | Header typed date, inclusive; trước identity/detail |
| `p_reference` | Exact UUID hoặc `lower(id_bh)=lower(btrim(input))` trước detail; giữ case/whitespace semantics cũ |
| `p_staff` | Trước detail; header CSV token và mapping tên/mã `nhan_su` hiện tại. Tập token hợp lệ được tính một lần. Không tự thêm staff-from-detail |
| `p_customer` | Sau UUID/code/unique-phone resolution, trước detail; exact raw customer ID/code, không tự trim/lower input |
| `p_search` | Sau name/identity resolution, trước detail; giữ tên tiếng Việt theo token, code/UUID substring, biển số, phone đủ dài, mã đơn, dịch vụ header. Chuẩn hóa input một lần |
| `p_branch` | **Sau aggregate detail, trước LIMIT**. Lấy các `ct.co_so` không rỗng; chỉ fallback địa chỉ khách khi không có branch detail hợp lệ |

Search dịch vụ hiện theo `s.dich_vu_id` khớp UUID/code/tên catalog; không có `p_service` riêng và không search `ct.san_pham`. Giữ semantics này. Amount vẫn gồm detail link UUID + legacy code, de-duplicate khi hai refs giống nhau. Amount bằng 0 không bị thay bằng header/catalog.

## 7. Pagination

Page IDs chỉ lấy sau toàn bộ điều kiện trên. Giữ sort `ngay DESC, gio DESC, id DESC` bằng dạng text tương ứng sort OLD hiện hành; giữ limit 0..1000 và cách xử lý page/limit null/âm. JSON aggregate ghi ORDER BY rõ ràng.

Instrumentation trên fixture **9.343 sales** xác nhận page1/20 và page2/20 mỗi lượt gọi `app_sales_page_json` đúng **20 lần**. Các page ghép lại đúng danh sách sorted đầy đủ, không trùng/thiếu ID. Với search, tên thiếu có thể cần recovery trước pagination để quyết định match; khi không search, recovery tên khách chỉ thực hiện cho page.

## 8. Summary và first-date

`totalCount`, `totalAmount`, `totalCustomers`, `newCustomersCount`, `returningCustomersCount`, `groupedSummary` vẫn tính trên **toàn tập filtered**, không phải page. Classified rows chỉ mang date/time, customer_key, amount, first_date. JSON summary dựng từ kết quả aggregate.

`app_sales_first_dates_for_keys` chỉ trả/aggregate các key cần cho filtered result; history không bị lọc theo tháng/ngày. Tập rỗng short-circuit history. `app_sales_first_dates()` giữ khả năng trả tất cả key cho caller cũ. Vẫn cần đọc identity map và lịch sử visible để giữ code collision, explicit precedence và phone uniqueness; không tuyên bố đã loại mọi history scan cho lookup nhỏ.

Fixture khách mua tháng 8, xem tháng 10: **new=0, returning=1**. Logic summary khi `p_start=NULL` và daily classification giữ đúng OLD, kể cả customer_key NULL.

## 9. Cache

**Không cache summary.** Chưa có revision/invalidation đảm bảo cho mọi sales/detail/customer/service/personnel mutation và user scope, nên không giữ summary giữa request. Không có cache key hay cache dùng chung user.

Chuyển page vẫn tính lại **summary typed nhẹ hơn**. Đây là giới hạn còn lại so với mong muốn bỏ tính lại summary; không giải quyết bằng cache có thể stale. Local test xác nhận insert/edit/delete sales, edit/delete detail, đổi tên khách tác động ngay lên kết quả.

## 10–11. Benchmark BEFORE / AFTER và temp I/O

Đây là **local PGlite PostgreSQL 18.3**, dữ liệu **synthetic**, cùng input/data OLD/NEW: 9.343 sales, 15.828 detail, 6.665 customers, 1.267 services. OLD lấy definition audit. `work_mem` local mặc định 4096 kB giữ nguyên; production audit là 2184 kB. Không so milliseconds local trực tiếp với hardware/role production PostgreSQL 17.6.

Mỗi case dùng một warmed `EXPLAIN (ANALYZE, BUFFERS)` OLD/NEW; thời gian có dao động do tải máy, không phải percentile hoặc SLA. NEW chạy trong transaction **READ ONLY**, giảm timeout local từ mặc định 0 xuống **3s**; cả 10 case hoàn tất không có `57014`. Không tăng timeout nào.

| Case | SQL OLD ms | SQL NEW ms | Temp R/W OLD -> NEW | Shared hits OLD -> NEW | Filtered/page | JSON bytes OLD=NEW |
| --- | ---: | ---: | --- | --- | --- | ---: |
| A_all_page1 | 4418.3 | 1780.4 | 11284/10374 -> 0/0 | 2205 -> 2166 | 9343/20 | 62239 |
| B_all_page2 | 3677.3 | 883.8 | 11284/10374 -> 0/0 | 2205 -> 2260 | 9343/20 | 62276 |
| C_month | 784.6 | 419.6 | 2237/2587 -> 0/0 | 2069 -> 2002 | 991/20 | 24320 |
| D_reference | 1344.3 | 373.7 | 3503/3853 -> 0/0 | 2205 -> 1058 | 1/1 | 1289 |
| E_customer | 1350.0 | 549.1 | 3503/3853 -> 0/0 | 2205 -> 1134 | 1/1 | 1288 |
| F_branch | 1485.2 | 602.2 | 7436/7149 -> 0/0 | 2205 -> 2095 | 4701/20 | 62194 |
| G_staff | 3010.9 | 1236.4 | 3503/3853 -> 0/0 | 8381 -> 2235 | 3153/20 | 61844 |
| H_search | 3040.8 | 1840.4 | 2237/2587 -> 0/0 | 2226 -> 2351 | 1/1 | 1282 |
| I_legacy | 1745.5 | 625.9 | 3503/3853 -> 0/0 | 2205 -> 991 | 1/1 | 776 |
| J_uuid | 2183.1 | 524.0 | 3503/3853 -> 0/0 | 2205 -> 1060 | 1/1 | 1289 |

Temp là **blocks** tại root, không cộng parent/child. Shared physical reads đều 0 trong các wrapper mẫu local. Số filtered/page trong bảng không được hiểu là toàn bộ rows scanned. [Metadata, scans, loops, sorts và số lần serialize](benchmark-local.json); các file `*-old/new.json` là wrapper plans, `*-old/new-inner.json` là helper bodies có nodes nội bộ.

| All helper inner | Sort có spill | Temp R/W |
| --- | --- | --- |
| OLD | external merge, 7400 kB, rows 13330, loops 1 | 2237/2587 |
| NEW | Không có; quicksort trong RAM | 0/0 |

Các inner plans cho từng case giữ `Actual Rows`, `Actual Loops`, scan type, sort method/space và spill. Reference plan NEW dùng index candidate hiện có; không dùng simple projected header lookup để giả là toàn RPC.

## 12. HTTP BEFORE / AFTER

Probe hiện tại chỉ dùng anon key từ cấu hình, không đọc/copy app session. Chỉ projected SELECT và audited STABLE `sales_query`; chạy tuần tự. Definition P0 **chưa deploy**, nên không có HTTP AFTER của NEW.

| Case | HTTP trước P0 hiện tại | Duration ms | Bytes | HTTP NEW |
| --- | --- | ---: | ---: | --- |
| A_all_page1 | 500 / 57014 | 3395 | 100 | Chưa deploy / chưa đo |
| B_all_page2 | 200 | 2704 | 67986 | Chưa deploy / chưa đo |
| C_month | 200 | 1079 | 28632 | Chưa deploy / chưa đo |
| D_reference | 200 | 1739 | 1531 | Chưa deploy / chưa đo |
| E_customer | 200 | 2149 | 2853 | Chưa deploy / chưa đo |
| F_branch | 200 | 2050 | 66461 | Chưa deploy / chưa đo |
| G_staff | 500 / 57014 | 3439 | 100 | Chưa deploy / chưa đo |
| H_search | 200 | 2297 | 174 | Chưa deploy / chưa đo |
| J_uuid | 200 | 2561 | 1531 | Chưa deploy / chưa đo |

Duration đến khi đọc xong body; bytes là JSON đã giải nén. Tổng probe: 1 projected sample lookup + 9 RPC đọc. Kết quả page2 hiện tại có **9.346 sales**, khác snapshot audit/local 9.343; không dùng hai tập này làm parity OLD/NEW. Reference/customer sample được redact trong evidence. Không tìm được sample legacy riêng cho remote, nên case I chỉ có benchmark/regression local.

[HTTP hiện tại](http-before-current.json). Audit trước: all/page1 median 2231 ms, page2 2446 ms; có timeout 4594–4860 ms. Request count caller giữ 1 `sales_query`/page; frontend không đổi. Các all-data loops/fan-out của caller vẫn thuộc phạm vi phase khác, không được chỉnh trong P0.

## 13–14. Regression, field differences và caller

**67 inputs × 3 scopes = 201 đối chiếu full-result**: superuser local và hai role RLS khác nhau. Thêm 10 đối chiếu trên fixture lớn, compatibility helper, first-date subset, pagination đủ dòng, rollback/ACL/data hash và local mutations. **Không có field khác OLD/NEW trong các input đã chạy.** [Regression](regression.json).

| Yêu cầu | Kiểm chứng |
| --- | --- |
| All page1/page2, date range, search | Full JSON deep equality; normalized plate, tên Việt, phone, code, header service, ký tự đặc biệt, blank/null |
| Staff/branch/customer | Exact staff CSV + tên/mã; branch nhiều detail trước LIMIT; raw customer ID/code sau resolution |
| UUID/id_bh/legacy | Exact, upper/lower, trim input, invalid UUID, missing, code padded không tự đổi match |
| totalCount/totalAmount/totalCustomers | Full-result equality cả page20, limit0 và filter hẹp |
| new/returning/groupedSummary | Full-result equality; historical first date không scope theo tháng |
| resolved_amount/customer_key/customer | Zero detail, UUID+code detail, duplicate ref, missing/deleted refs, ambiguous phone nhiều xe, recovered/empty name, explicit precedence |
| Sorting/pagination | Ghép mọi page bằng full sorted IDs, không duplicate/thiếu; summary không phụ thuộc page |
| User scope | Hai policy scopes trên sales, customer, detail, service, staff; page/summary/history equal OLD; không SECURITY DEFINER |
| Mutation correctness | Không cache; thêm/sửa/xóa sale, đổi detail và tên khách hiện ngay |

Caller trace: Bán hàng → `getSalesCardsPaginated`/`querySales`; Phiếu CT và Thu chi/Sổ quỹ → `getSalesCards`/`queryAllSales`; Báo cáo → `queryAllSales` theo kỳ; payroll/đối soát → sales/revenue header helpers. Signature và mọi field giữ nguyên. Existing sales-helper/business-report/UI tests và build pass. Chưa có end-to-end NEW RPC thật trong phiên app có quyền hiện hành; không coi mock UI/RLS local là xác minh phiên production.

Automated checks: `npm test` **64/64 pass**, `npm run test:sales-p0` **7/7 pass**, `npm run test:ui` **pass**, `npm run typecheck` **pass**, `npm run build` **pass**, `git diff --check` **pass**. UI tests chặn/mock external requests, không ghi business data. [Checks](checks.json).

## 15–16. Migration, backup và rollback

Migration và rollback đều transactional. Rollback khôi phục 3 definition OLD rồi DROP **chỉ các helper mới**; không DROP table/index hoặc DELETE data. Local test đã apply → rerun → rollback → apply và xác nhận business data hash/ACL giữ nguyên.

[definitions-before.json](definitions-before.json) là export catalog trong audit 04/10/2026, **không phải live re-export trong lần triển khai này** vì access 401. Trước bất kỳ lần apply lên shared database, cần quyền đọc hợp lệ và re-export definition hiện hành để tránh rollback đè một phiên bản mới hơn. Tool `node scripts/sales-p0-readonly.mjs --snapshot` chỉ đọc remote và lưu backup local; không apply migration.

Chỉ migration local/PGlite đã chạy. Không có mutation lên database thật; HTTP POST ở probe là RPC đọc STABLE. Không sửa `.env`, ID, data nghiệp vụ, RLS, timeout/work_mem hoặc index; không nâng CPU/RAM.

## 17–19. Git, trạng thái và điểm dừng

Tracked diff: `package.json` thêm test/benchmark commands. File mới: 1 migration, 1 rollback, 5 scripts P0, thư mục báo cáo/evidence. Không sửa source UI, Attendance, Reports datasets, inventory, ZNS hoặc phase khác. [Git status cuối](git-status.txt).

```text
 M package.json
?? docs/performance-sales-p0/
?? scripts/measure-sales-p0-http.mjs
?? scripts/measure-sales-p0.mjs
?? scripts/sales-p0-fixture.mjs
?? scripts/sales-p0-readonly.mjs
?? scripts/test-sales-p0.mjs
?? supabase/migrations/202610040001_sales_p0.sql
?? supabase/rollback/
```

**Chưa commit, chưa push, chưa merge, chưa deploy production.** Branch vẫn `main`, HEAD không đổi. Dừng ở Phase P0.

Chưa PASS đầy đủ: thiếu live definition revalidation, NEW database EXPLAIN/HTTP và app-session caller validation. Không thể tuyên bố production hết `57014`; probe hiện tại xác nhận lỗi vẫn tồn tại trước apply. Phần summary vẫn recompute typed mỗi page, vì chưa có invalidation an toàn. Các bước này chưa được che bằng tăng timeout hay thay đổi nghiệp vụ.
