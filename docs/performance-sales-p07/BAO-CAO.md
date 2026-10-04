# P0.7 — Isolate LIVE CPU/planning bottleneck

Ngày **04/10/2026, Asia/Saigon**. Repository `D:\xe\Quanlycuahangxe-main`, branch `main`, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`.

**P0 PASS trong bộ validation database/API và application read loaders đã chạy. LIVE cuối phiên giữ P0.6 NEW.** Cả page1/page2 vượt gate qua 5 warm lượt mỗi page; 10/10 NEW HTTP200, không `57014`. Full JSON 14 cases, 12 role comparisons và sáu caller đọc thật đều pass. Không thay SQL migration P0.6 trong P0.7 vì dynamic/static không khác biệt đáng kể.

**Chưa tái hiện hoặc xác định nguyên nhân chính xác của sample P0.6 3021 ms.** Plans lịch sử không lộ inner nodes của sample đó. Probe mới không chứng minh dynamic planning là bottleneck; không quy kết nguyên nhân lịch sử là cold start hoặc CPU contention. Typed helper chiếm phần lớn execution hiện tại. [Outcome cuối](live-validation-20261004/outcome.json), [catalog NEW sau profiling](live-validation-20261004/definitions-live-final.json).

Đường dẫn yêu cầu `docs/performance-sales-p0/P0.6-BAO-CAO.md` không tồn tại; đã đọc [báo cáo P0.6 thực tế](../performance-sales-p06/BAO-CAO.md), [P0.5](../performance-sales-p0/P0.5-BAO-CAO.md), migration và **271 file evidence**, gồm **192 plans**. [Index/hash/parse evidence](evidence-read-index.json).

## 1. Phạm vi và giới hạn phép đo

Ở diagnostic READ ONLY ban đầu, LIVE chỉ có OLD; cả bốn helper P0.6 đã bị rollback. Không thể gọi `app_sales_filtered_typed`/`app_sales_page_json` P0.6 hoặc đo đúng function `RETURN QUERY EXECUTE` nếu không CREATE function. Do đó đã đo cùng body bằng anonymous PL/pgSQL `EXECUTE ... USING`, static/inline và prepared static; helper vắng mặt được expand từ migration đã archive. **Bảng phần2 là proxy planning/body.** Sau đó người dùng cho phép probe private functions; actual-function và public NEW evidence nằm ở phần4–8. Expand identity/page body có thể đổi row estimates và plan so với call qua function boundary.

Page-only, first-date-only và summary/daily dùng bản narrow filtered rows trong GUC transaction-local, rồi restore về tám cột typed. GUC được xóa khi ROLLBACK, không lưu business rows vào file và không cache summary giữa request. Đo riêng baseline bridge để thấy overhead JSON/typed conversion của diagnostic; không đưa bridge này vào migration. Full inline/dynamic main sử dụng body SQL trực tiếp, không qua bridge đó.

Mỗi round có cùng snapshot/input giữa OLD, dynamic và static. Snapshot có thể khác giữa rounds khi app tiếp tục ghi. TotalCount round0 = 9353; rounds1–5 = 9354. HTTP Management duration không phải HTTP RPC Sales duration.

[Source queries/limitations](live-diagnostic-20261004/diagnostic-source.json), [script SQL builder](../../scripts/sales-p07-sql.mjs), [supervisor chỉ READ ONLY](../../scripts/sales-p07-readonly.mjs).

## 2. Planning/JIT/Execution — median 5 warm rounds

PostgreSQL **17.6**, work_mem **2184kB** giữ nguyên. `jit=off`, `pg_jit_available=false`; tất cả plans không có JIT block. `track_functions=none`, `pg_stat_xact_user_functions` không cung cấp per-call timing. Không bật tracking/JIT hoặc thay config server. SQL diagnostic cap 6s giảm từ analyst default 2min; không tăng API/role timeout. [LIVE snapshot/settings](live-diagnostic-20261004/snapshot-live-before.json).

| Component | Planning ms | Execution ms | Wall ms | Shared hits | Temp R/W blocks |
| --- | ---: | ---: | ---: | --- | --- |
| OLD `sales_query` page1/20 | 0,016 | **1542,984** | 1543,586 | 9964–10238 | 17020/15513 |
| OLD `sales_query` page2/20 | 0,015 | **1542,979** | 1543,373 | 9964–10186 | 17020/15513 |
| Typed body inline | 2,398 | **484,507** | 490,867 | 1068 | 470/235 |
| Cùng typed body, dynamic EXECUTE parameters | 2,282 | **482,182** | 488,528 | 1068 | 470/235 |
| Cùng typed body, warmed prepared static | 0,031 | **471,170** | 473,444 | 1068 | 470/235 |
| Full main inline page1 | 3,688 | **574,824** | 585,354 | 1221 | 1091/442 |
| Full main inline page2 | 3,529 | **560,619** | 569,459 | 1198 | 1091/442 |
| Full main dynamic EXECUTE page1 | 3,759 | **579,397** | 590,668 | 1221–1222 | 1091/442 |
| Full main warmed prepared static page1 | 0,039 | **569,128** | 573,673 | 1221 | 1091/442 |
| OLD first-date function | 0,018 | **248,009** | 248,345 | 666 | 0/0 |
| ALL first-date aggregate, gồm bridge | 0,057 | **71,407** | 71,949 | 0 | 207/413 |
| Bridge baseline | 0,019 | **60,542** | 60,963 | 0 | 207/207 |
| Page JSON cho 20 rows, inline body | 0,646 | **1,911** | 3,501 | 153 | 0/0 |
| Summary/daily, gồm bridge | 0,223 | **128,467** | 129,606 | 0 | 621/414 |

[Full samples, medians, ranges, scans/loops/sorts](live-diagnostic-20261004/benchmark-readonly-summary.json). `round-0.json` là warm-up; `round-1.json` … `round-5.json` là full plans. Giữ cả samples chậm, không loại outlier: OLD page1 warm range **1499,878–2484,150 ms**, page2 **1518,922–2768,446 ms**. Warm-up OLD page1 mất **3476,814 ms**, rồi median warm giảm còn 1543 ms; không dùng hiện tượng này để khẳng định nguyên nhân lần NEW 3021 ms trước đó.

Planning proxy dynamic khoảng 2,3–3,8 ms; prepared static bỏ phần lớn planning nhưng full-main execution median chỉ khác khoảng **10 ms**, không giải thích thêm gần 1,5 giây của lần NEW P0.6. Dynamic typed và inline typed có execution tương đương. Chưa chứng minh dynamic planning là bottleneck; không sửa migration và không tạo fast path chỉ dựa trên chênh lệch này. `EXECUTE` lập plan lại mỗi lần theo [tài liệu PostgreSQL 17](https://www.postgresql.org/docs/17/plpgsql-statements.html#PLPGSQL-STATEMENTS-EXECUTING-DYN); EXPLAIN Planning Time ở wrapper không bao gồm mọi nested function planning, nên không lấy 0,067 ms wrapper P0.6 để kết luận nested planning bằng 0.

## 3. Nodes quan sát được

Lượt warm-up typed inline: customers **6673 rows / 1 loop / 414 hits / 72,708 ms**; refs unique **13344 rows / 1 loop / 124,786 ms**; resolved merge join **9353 rows / 1 loop / 344,708 ms**; details aggregate **8857 rows / 1 loop / 378 hits / 148,213 ms**; final join **9353 rows / 1 loop / 1068 hits / 509,761 ms**. Thời gian node inclusive, không cộng các số này thành tổng CPU.

Page JSON warmed là scalar SubPlan **1 row / 20 loops**, header/customer index scans mỗi loại **20 loops**; missing-name recovery chỉ chạy khi cần. `page_rows` đúng **20 rows / 1 loop**. Full main `CTE filtered` **9354 rows / 1 loop**; các consumer dùng lại CTE scalar. First-date aggregate trên FULL main chỉ dùng key/date từ filtered, không thêm lịch sử date-filtered. Không có bằng chứng dataset được rebuild cho từng summary/page.

Round3 typed/full-main sorts đều **quicksort trong RAM**; page sort là **top-N heapsort, 20 rows, 34kB**. Temp còn ở root dù không có external-merge sort trong các expanded plans này; không suy diễn temp=0 từ sort method. Bridge/scalar plans có temp riêng của diagnostic. Buffers là inclusive; không cộng parent/child hoặc CTE consumer counters.

Các observations trên thuộc expanded/proxy plans mới. **Không thể gán chúng thành exact nodes của wrapper P0.6 3021 ms đã rollback.** Actual function boundary, tuplestore và cached-plan behavior còn cần đo trực tiếp.

## 4. Probe tạm được cho phép — actual dynamic/static functions

Để đo đúng A `RETURN QUERY EXECUTE` và B static với cùng helper/function boundaries, đã chuẩn bị [temp-probe-review.sql](temp-probe-review.sql). Probe tạo bản sao P0.6 trong **schema phiên pg_temp**, qualify mọi helper nội bộ về pg_temp; các business tables/functions nền vẫn public. Thêm static ALL probe được sinh từ chính typed body, không sửa migration sản phẩm.

Probe kiểm tra LIVE definition hashes trước DDL, đo một warm-up + **5 lượt** OLD/dynamic/static page1/page2 và helper/body/identity/empty-first-date trong một REPEATABLE READ snapshot `101610:101610:`. Mỗi statement cap6s. Function STABLE/INVOKER/search_path public; benchmark dưới `anon`. Không CREATE OR REPLACE public functions, không business DML/index changes; cuối script **ROLLBACK**. Public Sales vẫn OLD trong probe này.

Local rehearsal pass dưới role chỉ SELECT: dynamic/static full JSON = OLD, public definitions không đổi, ROLLBACK loại bỏ toàn bộ temp Sales functions. [Local test](../../scripts/test-sales-p07-temp-probe.mjs), [probe metadata](temp-probe-review.json). Local rehearsal không chứng minh LIVE performance.

Người dùng trả lời **“Cho phép probe tạm”**, sau đó probe đã chạy thành công. Lượt đầu chuyển sang `supabase_read_only_user` bị `42501`; transaction không thay public functions. Đổi sang `anon` rồi chạy lại, không cấp thêm quyền role. Lưu cả [lỗi đầu](live-diagnostic-20261004/attempt-1-temp-probe-error.json), [actual plans](live-diagnostic-20261004/temp-probe-result.json), [medians](live-diagnostic-20261004/temp-probe-summary.json), [verification public OLD và private ROLLBACK](live-diagnostic-20261004/temp-probe-final-verification.json).

| Actual function, median5 | Execution ms | Shared hits | Temp R/W blocks |
| --- | ---: | ---: | --- |
| OLD page1 / page2 | 1600,920 / 1522,387 | 9964 / 9964 | 17020/15513 |
| Dynamic P0.6 page1 / page2 | **502,217 / 498,189** | 1221 / 1198 | 1298/649 |
| Static ALL page1 / page2 | **497,777 / 499,060** | 1221 / 1198 | 1298/649 |
| Typed dynamic / static | **414,477 / 414,779** | 1068 / 1068 | 677/442 |
| Identity riêng | 12,199 | 414 | 0/0 |
| First-date empty keys | 0,929 | 0 | 0/0 |

Full JSON OLD/dynamic/static bằng nhau. Dynamic/static page1 chỉ chênh4,4ms; page2 static hơi chậm hơn. Cold dynamic page1 đầu probe là1385,300ms, không tái hiện3021ms. **Không thêm static ALL fast path**, không thay migration P0.6: SHA-256 `e8ff0437eabd7f3ffdb78122fddb591bae3f75fcc410a0ddc1aa1821d68b794b`.

## 5. Local gate, fresh LIVE snapshot và apply

Ba local rehearsal P0.7 pass: READ ONLY diagnostic, temp role/rollback, paired benchmark. Tiny paired fixture xác minh correctness, không dùng làm performance gate. **Đã chạy lại `npm test`:64/64**, gồm toàn bộ P0 suite **7/7**, 67inputs×3scopes, pagination, totals/new-returning/history, resolved amount/legacy refs, mutations và rollback/data hash/ACL. Migration không đổi; [local steady gate P0.6](../performance-sales-p06/benchmark-local.json) cùng hash vẫn pass: page1/page2 NEW574/587ms vs OLD1863/2085ms và P0.5 2057/2196ms. Không so synthetic PGlite timing với LIVE hardware.

[Re-export kết thúc diagnostic READ ONLY](live-diagnostic-20261004/final-old-verification.json) xác nhận OLD trước public apply. Sau local gate và private diagnostic, đã **snapshot LIVE lại**: ba OLD definition/signature khớp audit và rollback; helpers vắng mặt, owner/ACL/STABLE/INVOKER/search_path/dependencies/projection pass. RLS/table ACL/index/settings được snapshot. Tạo [rollback LIVE mới](live-validation-20261004/rollback-live.sql), thêm definition-drift guard trong cùng apply transaction.

[Definitions trước public apply](live-validation-20261004/definitions-live-before.json), [so sánh](live-validation-20261004/snapshot-comparison.json), [precheck](live-validation-20261004/precheck.json), [apply](live-validation-20261004/apply-result.json). Public apply **201/COMMIT**, giữ đúng migration P0.6. Baseline9354sales/15850detail/6673customers khác P0.6 nên đo OLD lại; không deploy frontend.

## 6. Public SQL/HTTP — 5 warm lượt mỗi page

Mỗi version warm-up rồi đo5lượt/page; limit20, cùng input. SQL là wrapper `EXPLAIN (ANALYZE, BUFFERS)` qua Management, không coi analyst SQL là anon API role timing. HTTP anon đo đến đọc hết body. OLD/NEW timing dưới đây ở hai phase riêng; parity và paired timing dùng cùng snapshot ở phần7.

| Case | SQL OLD median ms | SQL NEW median ms | HTTP OLD median ms | HTTP NEW median ms | OLD → NEW warm HTTP |
| --- | ---: | ---: | ---: | ---: | --- |
| Page1/20 | **1692,091** | **560,904** | 2304 | **1064** | 5/5 200 → 5/5 200 |
| Page2/20 | **1661,601** | **597,674** | 3113* | **1061** | 4/5 200+1/5 500/57014 → 5/5 200 |

*OLD page2 median3113 gồm failed request4132ms; successful-only median2962ms. Không bỏ failed sample. NEW range page1 675–2063ms, page2 709–1451ms. Successful payload OLD=NEW67624/67942bytes; không dùng OLD error body100bytes làm payload parity.

| Root blocks | OLD page1/page2 | NEW page1 | NEW page2 |
| --- | ---: | ---: | ---: |
| Shared hits | 12328 | **3468** | **3445** |
| Temp read | 17020 | **1298** | **1298** |
| Temp write | 15513 | **649** | **649** |
| Shared physical reads | 0 | 0 | 0 |

SQL median giảm66,9%/64,0%; hits giảm khoảng72%; temp read/write giảm92,4%/95,8%. Gate yêu cầu cả median NEW dưới75%OLD và không core57014: **pass; 10/10 NEW warmHTTP200**, không sample bị bỏ. [BEFORE và warm samples](live-validation-20261004/benchmark-before.json), [AFTER và gates](live-validation-20261004/benchmark-after.json), [core summary](live-validation-20261004/benchmark-core-summary.json).

## 7. Same-snapshot paired timing, parity, roles và caller

Sau core gate chạy thêm5paired rounds dưới anon: exact LIVE OLD definitions trong pg_temp, **NEW gọi public thực**, dependencies nền vẫn public. Mỗi round một REPEATABLE READ snapshot, warm cả hai version, đảo measured order, ROLLBACK private copies; public không bị thay. [Paired evidence](live-validation-20261004/paired-old-public-new-summary.json).

| Case | OLD private-copy median ms | Actual public NEW median ms | Full JSON |
| --- | ---: | ---: | --- |
| Page1/20 | **1496,891** | **505,703** | Bằng nhau |
| Page2/20 | **1483,579** | **510,959** | Bằng nhau |

**14/14 full JSON OLD=NEW** dưới anon, cùng snapshot mỗi pair qua hai statements READ ONLY cap6s. Bao gồm all/page1/page2/month/reference/customer/branch/empty và positive staff/search/UUID/detail branch/history/code candidate. Mọi data field, totalCount, summary, groupedSummary, resolved customer/amount bằng nhau. Page1+page2 đúng page40, duplicate0, summary/groupedSummary không phụ thuộc page. Code candidate không đại diện mọi legacy LIVE; P0 synthetic suite giữ legacy edge cases.

Reference SQL sample1749→440ms, customer1724→574ms, positive staff3697→1237ms; NEW cả14HTTP200. Month sample769→813ms: không cải thiện đồng đều mọi case. Narrow timing chỉ một sample/case, không phải percentile. [14-case AFTER/parity](live-validation-20261004/benchmark-after.json).

**12/12 role comparisons** pass: page1/page2/reference/positive staff/customer/history×anon/authenticated. Không copy JWT/session; SET ROLE không xác minh mọi authenticated claims. [Role matrix](live-validation-20261004/role-parity.json).

| Caller đọc thật | Kết quả NEW |
| --- | --- |
| Bán hàng | Page1/page2 40rows, reference, detail/customer/service/personnel/financial enrichment pass |
| Phiếu bán hàng CT | `getSalesCards()` đủ9354headers, enrichment và pagination hoàn tất; detailpage20/total15850 |
| Thu chi/Sổ quỹ | Loader Sales chung pass; transactionspage20/total4798 |
| Báo cáo | Pagination tháng hoàn tất, summary hữu hạn,12personnel groups |
| Bảng lương | Read payroll/revenue pass, payroll0rows/revenue12staff; không mount auto-sync ghi data |
| Đối soát doanh số | Personnel10/revenue2018orders/payroll0rows; read sources pass |

**612 requests đọc thật**, network tất cả2xx, concurrency cap6; blocked writes0, remote business writes0. Browser mới, anon, không demo/mock/copy app session. Đây là application read loaders thực, không là tương tác UI trong mọi authenticated session. CT all-data/enrichment vẫn mất27,3s và nhiều request; fan-out caller chưa được tối ưu ở phase này. [Caller evidence](live-validation-20261004/caller-validation.json).

## 8. Public NEW component breakdown — 5 warm, một snapshot

Sau core/role/caller pass, bổ sung **READ ONLY** actual public helpers: một warm-up+5rounds×12components trong snapshot `101617:101617:`. Không apply thêm. [Full plans](live-validation-20261004/public-components.json), [medians, Actual Rows/Loops/Buffers/sorts](live-validation-20261004/public-components-summary.json).

| Component | Planning ms | Execution ms | Shared hits | Temp R/W blocks |
| --- | ---: | ---: | ---: | --- |
| Public wrapper page1/page2 | 0,014/0,013 | **542,655/543,747** | 1221/1198 | 1298/649 |
| Public typed helper | 0,020 | **451,713** | 1068 | 677/442 |
| Cùng typed body inline, native identity | **1,844** | 479,350 | 1068 | 470/235 |
| Cùng typed body dynamic, native identity | **1,873** | 484,510 | 1068 | 470/235 |
| Public identity riêng | 0,019 | **12,900** | 414 | 0/0 |
| First-date compatibility function, full history | 0,015 | 264,951 | 666 | 0/0 |
| First-date subset, empty keys của ALL | 0,023 | **1,061** | 0 | 0/0 |
| Public page JSON20 | 0,062 | **3,838** | 153 | 0/0 |
| MAIN inline, public native helpers | 0,345 | 557,451 | 1221 | 1298/649 |
| Summary/daily, gồm bridge | 0,252 | 134,036 | 0 | 621/414 |
| Bridge baseline | 0,022 | 59,706 | 0 | 207/207 |

Typed helper hiện chiếm phần lớn execution, khoảng452ms so wrapper543ms. Không trừ/cộng medians độc lập thành exclusive CPU. Bridge chỉ diagnostic, gồm JSON/typed conversion baseline59,7ms; không cache request hoặc đưa vào migration. Compatibility first-date function264,9ms phục vụ caller cũ; ALL RPC lấy min date từ filtered full history, subset helper empty1,1ms.

Actual public MAIN warm-up ghi `CTE filtered`9354rows/1loop/1068hits/409,611ms; `page_rows`Limit20/1; first_dates Append6039/1/8,748ms; subset helper0/1/1,096ms. Typed inner: identity6673/1/414hits/63,819ms, refs13344/1/109,352ms, resolved9354/1/291,647ms, details aggregate8858/1/378hits/162,375ms, detail Seq Scan15850/1/378hits/4,112ms. Time/buffers inclusive; không cộng parent/child. Filtered/identity/detail tính một lần trong các plans này; không có evidence rebuild cho từng consumer. Scan toàn detail là phần tính summary, không coi page20 là chỉ scan20sales.

MAIN page sort top-N heapsort20rows/34kB; typed sorts quicksort RAM1479/1413kB. Các expanded warm plans này không external merge; root vẫn có temp intermediate/tuplestore. Function wrapper và expanded body có temp khác nhau. Single-backend component wrapper hits1221/1198, khác bộ API-phase SQL3468/3445; lưu hai phương pháp/session riêng, không dùng số thấp thay số API-phase hoặc suy đoán nguyên nhân chênh lệch.

JIT off/availablefalse; generation/optimization/emission không áp dụng. track_functions none, không per-call stats; giữ Function Scan timing khi expose. Không bật tracking. Execution Time gồm execution/waits, không đo CPU thuần. **Không thể gán node thời gian mới thành exact node của historical3021ms.**

## 9. Catalog, rollback và trạng thái cuối

[Catalog validation](live-validation-20261004/catalog-validation.json): owner/ACL/signature/security/volatility/config của function cũ, dependencies, RLS/table ACL/index/settings không đổi; helpers mới STABLE/INVOKER. [Re-export READ ONLY cuối sau profiling](live-validation-20261004/definitions-live-final.json) xác nhận toàn bộ definitions/metadata/dependencies khớp NEW đã validate.

Rollback được tạo trực tiếp từ fresh LIVE OLD và đối chiếu đúng trước apply. Ba OLD definitions giống rollback đã thực thi/verify trên server ở P0.5/P0.6. Private probe/paired copies P0.7 ROLLBACK và kiểm chứng. **Không chạy public rollback trong lượt P0.7 thành công; LIVE giữ NEW.** Không tuyên bố rehearsal public rollback thêm lần này.

Credential chỉ giữ memory qua raw stdin không echo, không ghi env/report; tất cả credential processes đã đóng. Final catalog query thành công, lưu artifact trước Windows PTY/Node handle-closing assertion lúc thoát(exit1); lưu process diagnostic trong checks/outcome, không coi là query/catalog failure.

Branch/HEAD không đổi; tracked diff vẫn package.json từ P0, thêm scripts/evidence P0.7 và cập nhật báo cáo. Migration không đổi so P0.6. Không sửa `.env`, frontend, RLS, indexes, business data hoặc Attendance; không tăng work_mem/API/role timeout. Diagnostic SET LOCAL6s giảm từ analyst2min. **Chưa commit/push/merge/deploy frontend**, không chuyển P1. [Checks](checks.json), [Git status](git-status-final.txt).

**P0 PASS trong bộ database/API/roles và sáu application read loaders đã kiểm chứng; LIVE NEW.** Exact root cause historical3021ms còn chưa xác định. Warm evidence chứng minh bản P0.6 đáp ứng các gate đã yêu cầu; không thêm static fast path dựa trên suy đoán, không đảm bảo SLA hoặc mọi app session chưa được test.
