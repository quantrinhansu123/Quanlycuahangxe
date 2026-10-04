# P0.6 — Fix all/page path của Sales

**Trạng thái mới sau P0.7:** Cùng migration P0.6 đã qua diagnostic, 5 warm lượt/page, 14-case parity, role matrix và sáu caller thật. LIVE giữ **NEW; P0 PASS trong bộ validation đã chạy**. Xem [P0.7](../performance-sales-p07/BAO-CAO.md). Sample3021ms chưa tái hiện hoặc xác định nguyên nhân exact; báo cáo bên dưới giữ nguyên kết quả P0.6 lịch sử.

Ngày **04/10/2026, Asia/Saigon**. Repository `D:\xe\Quanlycuahangxe-main`, branch `main`, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`.

**CHƯA PASS P0. LIVE đã rollback OLD và kiểm chứng catalog.** Local cải thiện rõ cả hai page, nhưng lần SQL NEW page1 đầu tiên trên LIVE là **3021,193 ms**, chậm hơn median OLD **1590,157 ms**. Đã rollback ngay theo điều kiện người dùng, không thử page2, không chạy warm NEW, role matrix hoặc caller NEW và không apply lại.

[Kết quả cuối](live-validation-20261004/outcome.json), [rollback thực thi](live-validation-20261004/rollback-result.json), [catalog verification](live-validation-20261004/rollback-final-verification.json).

## 1. Node tạo shared hits và phần work lặp

Đã đọc báo cáo P0.5, migration và **69 file evidence/plans** trong attempt-2/attempt-3. [Danh sách, hash và trạng thái parse](evidence-read-index.json). Migration P0.5 được giữ nguyên trong [migration-p05-before.sql](migration-p05-before.sql).

Production P0.5 expanded MAIN page1/page2 ghi nhận:

| Node | Actual Rows / Loops | Shared hits | Actual Total Time ms |
| --- | --- | ---: | ---: |
| `CTE filtered` → `app_sales_filtered_typed`, page1 | 9346 / 1 | 49810 | 483,522 |
| Cùng node, page2 | 9346 / 1 | 49810 | 473,190 |
| `app_sales_first_dates_for_keys`, page1 | 6032 / 1 | 684 | 1017,433 |
| Cùng first-date node, page2 | 6032 / 1 | 684 | 1046,091 |

Nguồn: [MAIN page1 P0.5](../performance-sales-p0/live-validation-20261004/attempt-2/A_all_page1-new-main-inner.json), [MAIN page2 P0.5](../performance-sales-p0/live-validation-20261004/attempt-2/B_all_page2-new-main-inner.json).

**Filtered set được tính một lần.** Page, count, summary và daily đọc lại CTE scalar đã materialize; không có bằng chứng chúng gọi lại toàn helper. Buffers trên CTE scans là counter inclusive, không cộng các node đó để suy ra thêm physical work. Phần page JSON thêm khoảng 4549/5414 hits cho 20 rows ở hai page; customer lookup dùng `c.id::text` trong P0.5.

Ngược lại, expanded filtered body với hằng NULL trên LIVE chỉ scan detail **15831 rows / 1 loop / 378 hits**, customer **6667 rows / 1 loop / 414 hits**. Nó khác đáng kể với opaque Function Scan 49810 hits. Expand body thay cách lập plan, nên không lấy số body đó làm số RPC thực.

Đã tái hiện cơ chế bằng **cùng body P0.5**, prepared parameters và fixture có index detail tương ứng loại index LIVE:

| Local prepared body | Detail scan | Actual Rows / Loops | Detail hits | Root hits |
| --- | --- | --- | ---: | ---: |
| `force_generic_plan` | Index Scan | 0,85 / **18685** | **53131** | 53559 |
| `force_custom_plan` | Seq Scan | **15828 / 1** | **305** | 665 |

[Diagnostic nodes](local-plan-diagnosis.json), [generic plan](local-p05-force_generic_plan.json), [custom plan](local-p05-force_custom_plan.json). Generic plan lựa chọn nhiều index probes cho refs UUID/code thay vì scan detail một lần trên đường all. Đây là cơ chế đã đo trực tiếp **local**. Production P0.5 định vị phần lớn hits tại opaque typed helper, nhưng không lộ leaf loops của cached function plan; chưa xác minh riêng số 18685 loops trên LIVE. Không trình bày số local đó thành production fact. Một diagnostic timing đơn lẻ cũng không chứng minh custom plan luôn nhanh hơn; gate dùng bộ benchmark warmed bên dưới.

First-date helper P0.5 còn đọc identity/history một lần riêng và kiểm tra tập key lớn, dù đường all đã có toàn lịch sử visible trong filtered. Source và node 6032 rows/1 loop/~1 giây xác nhận phần work riêng này. Identity map trong một typed invocation đã materialize; không thấy nó rebuild cho từng summary/page node.

## 2. Sửa trong migration

[Migration hiện tại](../../supabase/migrations/202610040001_sales_p0.sql), SHA-256 `e8ff0437eabd7f3ffdb78122fddb591bae3f75fcc410a0ddc1aa1821d68b794b`:

- `app_sales_filtered_typed` dùng PL/pgSQL `RETURN QUERY EXECUTE ... USING` với typed parameters để lập custom plan theo filter thực. Giữ cùng một query body cho all và các filter, không nội suy input vào SQL và không sao chép business resolution.
- Khi **cả bảy filter/search đều NULL**, first dates lấy `min(ngay)` theo key từ chính narrow filtered dataset. Dataset này gồm toàn bộ caller-visible history nên vẫn đúng historical first date. Với filter/date/search khác NULL, giữ helper full-history theo requested keys. Empty string không tự chuyển thành fast path.
- Page customer join dùng UUID typed với guard UUID lowercase canonical, thay cast column thành text. Guard giữ exact semantics của lookup text cũ, đồng thời cho phép primary-key lookup.

Page/summary/classification vẫn dùng cột scalar; page JSON vẫn sau LIMIT. Giữ CSV staff, UUID/code/phone precedence, legacy detail refs và zero amount. Không cache giữa request, không sửa frontend, không tăng timeout/work_mem, không sửa index/RLS hoặc business data. Index thêm trong fixture chỉ tồn tại ở PGlite để chẩn đoán plan; không có production index mutation.

## 3. Local gate và regression

Synthetic fixture: **9343 sales, 15828 details, 6665 customers, 1267 services**, PGlite PostgreSQL 18.3, work_mem 4096kB giữ nguyên. Không copy production rows. Steady benchmark warm **6 calls mỗi version**, sau đó đo **5 lượt mỗi page**; median:

| Version | Page1 SQL ms | Page2 SQL ms | Shared hits page1/page2 | Temp R/W |
| --- | ---: | ---: | --- | --- |
| OLD | 1862,915 | 2085,343 | 2205 / 2205 | 11283 / 10373 |
| P0.5 | 2056,836 | 2196,405 | 55059 / 55153 | 0 / 0 |
| P0.6 | **574,429** | **587,101** | **785 / 790** | **0 / 0** |

Local gate yêu cầu cả page1/page2 P0.6 dưới 75% median OLD và P0.5: **pass**. [Benchmark, toàn bộ samples và hash gate](benchmark-local.json), [script steady benchmark](../../scripts/measure-sales-p06-all.mjs). Các plans local ghi sort/temp/buffers thực; không so milliseconds synthetic với hardware LIVE.

Giữ nguyên tests P0: `npm test` **64/64**, `npm run test:sales-p0` **7/7**, gồm **67 inputs × 3 scopes**, pagination đầy đủ, totals/new-returning, historical dates, resolved amount/legacy refs, hai RLS roles, mutation correctness và rollback/data hash. Thêm 14 case bulk OLD/P0.5/P0.6: **28 full JSON comparisons**, không field diff. Narrow cases đều có parity; timing narrow mỗi case chỉ một plan, không đủ tuyên bố percentile hoặc mọi narrow filter không regression trên LIVE. [Checks local](checks-local.json), [regression P0 đã chạy lại với migration hiện tại](../performance-sales-p0/regression.json).

## 4. LIVE snapshot, BEFORE và lần thử NEW

Re-export LIVE trước apply: ba function OLD có definition/signature khớp backup audit và rollback; helpers P0 chưa tồn tại. Owner/ACL, STABLE/INVOKER, projection và transaction pass. Tạo rollback mới trực tiếp từ snapshot; guard trong cùng apply transaction kiểm tra definition chưa drift. [Snapshot LIVE](live-validation-20261004/definitions-live-before.json), [so sánh](live-validation-20261004/snapshot-comparison.json), [precheck](live-validation-20261004/precheck.json), [rollback LIVE](live-validation-20261004/rollback-live.sql).

LIVE PostgreSQL 17.6, work_mem **2184kB**. BEFORE có **9351 sales / 15837 details / 6671 customers**, khác snapshot P0.5 9346 sales. SQL diagnostic read-only cap 6s giảm từ analyst default 2min; không đổi API/role default timeout hoặc work_mem. HTTP dùng anon key, không service-role, không copy app session. Credential Management API giữ trong bộ nhớ qua stdin raw, không sửa `.env`.

Đo lại 14 case BEFORE và 5 warm rounds mỗi all/page. Mỗi warm OLD all/page đều HTTP 200; các probes initial BEFORE còn có 57014 ở page1, positive staff và positive search code. Positive staff SQL BEFORE dưới cap 6s trả Management 400; không có timing SQL hợp lệ cho mẫu đó. [BEFORE đầy đủ](live-validation-20261004/benchmark-before.json).

Apply P0.6 transactional trả **201 / COMMIT**. NEW page1 HTTP 200, schema kiểm tra qua, full JSON parity OLD/NEW dưới anon trong một transaction REPEATABLE READ READ ONLY qua hai statement đã qua; sau đó mới EXPLAIN NEW. Những kiểm tra này được suy ra từ control flow thành công trước SQL guard; chưa có standalone parity artifact được lưu ở lượt này.

| Case | SQL OLD median 5 warm ms | SQL NEW ms | HTTP OLD median / range ms | HTTP NEW |
| --- | ---: | ---: | --- | --- |
| Page1 / 20 | **1590,157** | **3021,193** — một lượt | **2028 / 1823–2762**, 5/5 HTTP 200 | HTTP **200**; duration/bytes chưa được lưu |
| Page2 / 20 | **1569,580** | Chưa chạy | **2225 / 1980–5873**, 5/5 HTTP 200 | Chưa chạy |

Timing OLD/NEW trong bảng thuộc hai pha đo riêng, không nằm trong cùng transaction snapshot. Full JSON parity page1 dùng một snapshot chung; không suy diễn điều đó thành timing parity cùng snapshot. Bộ paired timing/inner diagnostic còn lại chưa chạy vì điều kiện dừng đã kích hoạt.

| LIVE root blocks | OLD warmed all | P0.5 page1 lịch sử | P0.6 page1 lần này |
| --- | ---: | ---: | ---: |
| Shared hits | 12328 | 55455 | **3468** |
| Temp read | 17012 | 1298 | **1298** |
| Temp write | 15506 | 649 | **649** |

[NEW page1 wrapper plan](live-validation-20261004/A_all_page1-new-plan.json). Shared physical reads = 0. Temp không trở lại mức OLD; hits thấp hơn OLD khoảng 71,9% và thấp hơn P0.5 khoảng 93,7%, nhưng SQL NEW vẫn chậm hơn OLD khoảng **90%** trong phép đo này. P0.5 dùng snapshot cũ, chỉ là mốc lịch sử để đọc mức hits, không phải parity cùng dữ liệu lần này. Wrapper NEW không lộ inner nodes để quy kết phần thời gian còn lại hoặc kết luận sort nào spill. Không suy đoán nguyên nhân chậm từ buffers riêng.

SQL guard kích hoạt **rollback ngay**, không đo thêm NEW và không apply lại. **Warm NEW hoàn tất: 0/8 mỗi page**. Không xác nhận hết 57014; không có repeated NEW sample đủ để kết luận độ ổn định. Chưa đo narrow LIVE AFTER hoặc validation caller/role matrix đầy đủ. [Apply result](live-validation-20261004/apply-result.json), [partial và lý do dừng](live-validation-20261004/benchmark-after-partial.json).

Công cụ chưa lưu successful HTTP metrics trước khi SQL guard throw, nên không có duration/bytes NEW page1. Đã sửa công cụ để lưu metrics và parity ngay khi nhận cho lần dùng sau; không chạy lại probe để bù số thiếu. Final read-only helper ghi verification thành công trước khi tiến trình Windows PTY gặp Node handle-closing assertion khi thoát; đây là exit diagnostic sau xác minh, không phải lỗi query/catalog. Trạng thái đó được ghi trong outcome, không che process exit code.

## 5. Rollback và trạng thái cuối

Rollback transactional lấy từ LIVE trả **201**, khôi phục ba OLD definition, drop chỉ bốn helper mới. Read-only re-export cuối xác nhận **mọi function/dependency đã snapshot khớp definition và metadata**, owner/ACL giữ nguyên, helpers vắng mặt; RLS/policies/table ACL, indexes và settings khớp BEFORE. [Catalog OLD cuối](live-validation-20261004/catalog-final-old.json), [verification](live-validation-20261004/rollback-final-verification.json). Credential-owning processes đã đóng.

Branch/HEAD giữ nguyên, **chưa commit/push/merge/deploy frontend**, không chuyển P1 Attendance. Migration P0.6 ở working tree để review, bản P0.5 trước sửa đã archive. Tracked diff vẫn chỉ `package.json` từ P0; thêm scripts/evidence P0.6. [Git status cuối](git-status-final.txt).

**Chưa PASS P0:** điều kiện all/page SQL bị vi phạm ngay page1, database cuối là OLD; thiếu NEW page2, warm repeats, 14-case LIVE AFTER, role matrix và caller validation. Local pass và giảm hits/temp không thay thế các điều kiện này. Dừng đúng P0.6; không apply thêm.
