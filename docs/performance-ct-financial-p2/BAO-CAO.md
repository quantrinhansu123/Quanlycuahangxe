# P2 — Sales CT + Thu chi / Sổ quỹ

Ngày **04/10/2026, Asia/Saigon**. Repository `D:\xe\Quanlycuahangxe-main`, branch `main`, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`.

**P2 PASS trong bộ regression và LIVE read validation đã chạy.** Bốn function DB P2 được giữ NEW theo quyền người dùng; frontend nằm trong working tree, **chưa deploy**. Sales P0.6 NEW giữ nguyên: 18 definition/metadata khớp P0.7. P1 và Reports source hashes giữ nguyên. Không chuyển P3.

## 1. Root cause, files và kiến trúc

CT `loadData` trước đây chờ CT page20, `getSalesCards()` và toàn bộ catalog. `queryAllSales` đọc 10 RPC chunks1000; `getSalesCards` enrich mọi header bằng UUID/code detail refs chunks50 và financial refs chunks50. Financial mount cũng tải toàn bộ sales/customers; summary keyset1000 kéo scalar financial rows về client để sum. Các page dùng vài refs nhưng đường lookup vẫn tải hơn9k header. Audit P0.7 khoảng27,3s được tái hiện cùng kiểu workload; baseline mới là34–44s dưới concurrency cap6, không dùng27,3s làm paired baseline.

BEFORE: ALL sales → toàn-system detail/financial fan-out → tìm refs page. AFTER: list page20 → dedup refs → batch RPC đúng refs → canonical header/customer/amount của các order đó. Financial list/count/completed thu/chi trong cùng RPC; summary SQL trên toàn tập filtered, không phụ thuộc pagination. Không HTTP request detail/financial enrichment ngoài page; server vẫn đọc relevant details để tính resolved amount. Identity map có thể đọc khách ngoài page để giữ phone uniqueness/precedence; không tuyên bố DB chỉ scan20rows.

Nguồn sửa: `src/data/ctFinancialLookupData.ts` mới; `salesCardCTData.ts`, `financialData.ts`; CT/Financial pages; CT/Financial form modals; `FinancialCharts.tsx`; `scripts/test-cashbook-ui.mjs`; package commands. Thêm migration/rollback, scripts regression/benchmark và evidence ở thư mục này. [Source trước P2](source-before.json) và `source-before/` có backup. Không sửa `salesCardData`, `salesQueryData`, `customerData`, `serviceData`, `cashBookData`, P0/P1/Reports sources đã bảo vệ.

## 2. Lookup, filters và summary

Batch client tối đa80refs, tuần tự nếu nhiều batch; server tối đa100. UUID và raw-code equality theo P0 hiện hành, normalize input một lần, hỗ trợ mixed/legacy refs, dedup sale ID. Resolver typed sinh từ body P0 pin SHA-256; chỉ thêm candidate header predicate trước identity/detail. Không viết lại amount/customer business logic. JSON dùng helper P0 cho matching headers. Missing refs trả rỗng; lỗi API hiện retry thay vì giả không có data.

Financial summary dùng đúng date inclusive, branch/type arrays, search danh mục/note/order/customer/amount/name và completed status hiện hành; không invent staff filter. OLD PostgREST search `so_tien::text.ilike` từng bị PGRST100; NEW bound SQL ILIKE giữ intended substring/wildcard semantics, gồm quote/special/numeric. Search parity là so với SQL intended filter, không tuyên bố OLD lỗi parser đã trả cùng response.

Page Financial giữ đầy đủ row fields cần list/editor/photo preservation, chỉ20rows JSON/transfer. Summary không tải rows về client. Charts đọc aggregate theo date range như source cũ, không tự thêm branch/type/search mới vào tab. Charts SQL tính đầy đủ kỳ; OLD `getTransactions(range)` mặc định REST cap1000 có thể truncate kỳ lớn. Đây là sửa giới hạn cap của summary theo mục tiêu P2; không tuyên bố full raw-response parity của chart OLD khi kỳ>1000. Local1034rows xác nhận daily/category/branch đúng full-period totals.

Cashbook giữ opening balance localStorage theo branch/date và closing=opening+completed income−expense. Row credits/debits vẫn dùng current page, sort ascending date/time và trạng thái như source cũ; không đổi thành running balance qua mọi page. LIVE browser mới opening=0; local UI giữ kiểm chứng edit/opening/closing. Không chạm dữ liệu opening balance của phiên người dùng.

Form order/customer dùng remote options50 theo search; service catalog compact chỉ tải khi mở CT form, bỏ ảnh khỏi options. Per-open options giữ nhãn lựa chọn ngoài current page. Explicit import/export/sync flows giữ behavior hiện có; không chạy mutation trên LIVE. Không thêm cache summary/ref, TTL hoặc global user maps. AbortController/version hủy stale page/search/chart/form reads; mutation gọi refresh loader hiện hành.

## 3. Benchmark BEFORE → AFTER LIVE loader

Anon real API qua local Vite, browser/storage mới, cùng inputs: CT page1/20 và Financial/Sổ quỹ tháng09/2026 page1/20. Mỗi case một sample mỗi phase; module/pipeline timing không là production bundled UI/SLA. Concurrency benchmark cap6, không production write. Payload là decoded JSON. [BEFORE](benchmark-live-before.json), [AFTER](benchmark-live-after.json).

| Workload | Requests | Payload bytes | Duration ms | Sales headers | Detail rows | Financial rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| CT | 580 → 2 | 21,248,272 → 18,997 | 43706 → 1957 | 9355 → 9 | 14864 → 20 | 4794 → 0 |
| Thu chi | 587 → 3 | 24,383,778 → 38,336 | 42916 → 1029 | 9355 → 20 | 14844 → 0 | 6578 → 20 |
| Sổ quỹ | 587 → 3 | 24,383,778 → 38,336 | 34488 → 2487 | 9355 → 20 | 14844 → 0 | 6578 → 20 |

CT detail enrichment batches375→0, financial enrichment188→0, một sales-ref RPC. Financial/Sổ quỹ detail375→0, financial GET batches191→0, một page+summary RPC và một sales-ref RPC, thêm bounded explicit-customer lookup. Row counts là fetched API rows, không toàn bộ DB rows scanned. BEFORE Financial6578rows gồm1784list/summary rows và4794enrichment rows; không hiểu thành6578unique transactions. Không còn current-page lookup tải9355headers hoặc hàng trăm batches.

Hai pha HTTP không chung transaction. Ứng dụng tiếp tục ghi độc lập: snapshot Sales9355→9356, Financial4799→4800, CT total15851→15854 giữa probes. Thu chi và Sổ quỹ full page/header hashes, count, totals và balance vẫn bằng BEFORE; CT cross-phase page/header hashes/count thay đổi và được lưu rõ. Same-snapshot SQL kiểm canonical batch theo current refs xác nhận đúng P0; không tuyên bố CT cross-phase full JSON equality. [Lượt đầu](attempt-1/benchmark-live-before.json) + [AFTER lượt đầu](attempt-1/benchmark-live-after.json) có cả ba workload full HTTP hashes bằng nhau, trước khi app có thêm records.

## 4. Actual NEW pages, warm repeats và SQL

Mount các component/data layer thật, LIVE responses; clock page cố định30/09 để cùng kỳ. Auth chỉ là read UI test stub, anon; không copy app session. Mọi write chặn. Ba rounds mỗi màn, page1+page2 có40IDs khác nhau, no alert/page error, mọi API reads2xx và không57014. Financial còn mở chart và đọc aggregate thật. Duration mount gồm local Vite/module/render và chờ network idle500ms, không so trực tiếp với loader-only duration bên trên. [9 warm page samples](benchmark-live-ui.json).

| Actual NEW page | Samples mount ms | Median ms | Mount reads | Reads gồm page2/chart | Pass |
| --- | --- | ---: | ---: | ---: | --- |
| CT | 4498/1890/1964 | 1964 | 2 | 4 | 3/3 |
| Financial | 7953/2327/1941 | 2327 | 4 | 8 | 3/3 |
| Cashbook | 2398/2340/2372 | 2372 | 4 | 5 | 3/3 |

READ ONLY cùng REPEATABLE READ snapshot: một warm-up+5 SQL lượt/component. PostgreSQL17.6, work_mem2184kB giữ nguyên, diagnostic cap6s giảm từ analyst default2min; API/role timeout không đổi. [Full wrapper plans và parity](validation-live-sql.json), [median SQL](benchmark-sql-summary.json).

| Component | Planning median ms | Execution median ms | Shared hits sample1 | Temp R/W |
| --- | ---: | ---: | ---: | --- |
| financial_page1 | 0.020 | 7.270 | 350 | 0/0 |
| financial_page2 | 0.018 | 7.283 | 350 | 0/0 |
| page_reference_batch | 0.010 | 132.581 | 835 | 0/0 |

Plans là wrapper Result rows1/loop1, opaque function calls; không có inner leaf loops trong số này. Không cộng parent/child buffers, không lấy wrapper rows1 thành headercount. Probe sales batch trả20 matching headers; không enrich unrelated order datasets.

## 5. Business parity và checks

Local4tests pass: 11 nhóm sale refs FULL JSON=P0 canonical, 17financial filter/page/search cases full fields/totals, pagination1034unique, charts full1034rows, mutations refresh ngay, hai financial/sales/customer RLS scopes và transactional rollback giữ P0. Thêm63rows trùng ngày/giờ qua4pages:63IDs không trùng/thiếu, giống OLD. [Regression](regression-local.json), [ties](pagination-ties-local.json). P0 67inputs×3scopes và P1 business/UI suite giữ pass.

LIVE same-snapshot14financial cases pass toàn bộ fields/page ID sets/count/income/expense; 13/14 raw JSON bằng đúng thứ tự, 1/14 chỉ khác thứ tự trong nhóm trùng ngày/giờ. Bộ đối chiếu chỉ cho phép khác thứ tự khi date/time sequence và mọi row field/page ID set bằng nhau; đổi boundary/field/totals vẫn fail. Không đổi sort business hai cột của OLD. Sales batch UUID/code/current CT+Financial/missing refs FULL JSON bằng canonical P0, gồm customer/resolved_amount. Legacy corner cases được cover local, không khẳng định mọi linkage legacy LIVE có sample. [Read-only tie diagnosis](parity-diagnosis-live.json).

**npm test71/71, UI suite pass, P2 UI7/7, typecheck, build, diff check và syntax pass.** [Gates trước apply](checks-before-apply.json). UI tests gồm list no ALL/catalog, page2, remote form search, edit giữ ảnh+refresh, query retry, independent lookup failure và charts aggregate. Thử đầu UI bị native OOM khi PGlite/browser giữ tài nguyên; đã tách fixture child process đóng trước browser, giữ nguyên heap/RAM/timeout. Một LIVE UI probe đóng context khi enrichment chưa xong; công cụ đã chờ network idle/drain rồi chạy đủ9samples. Không coi lỗi công cụ là API57014 hoặc bỏ outlier warm sample.

## 6. Snapshot, migration, rollback và trạng thái cuối

Người dùng cho phép **“apply migration DB sau khi mọi precheck/test pass”**, ngoại lệ cụ thể cho DB; frontend chưa deploy. Fresh LIVE snapshot trước mỗi apply kiểm18P0 definitions/owner/ACL/STABLE/INVOKER/search_path và dependencies, new function names absent, RLS/table ACL/policies/indexes/settings. Guard cùng apply transaction từ chối P0 drift hoặc P2 name tồn tại. [Snapshot](definitions-live-before.json), [precheck](precheck.json), [apply guard](apply-review.sql).

Migration [202610040002_ct_financial_p2.sql](../../supabase/migrations/202610040002_ct_financial_p2.sql) chỉ CREATE4new STABLE/INVOKER functions, giữ signatures caller cũ. Không CREATE OR REPLACE P0, business DML/index/RLS change. Rollback [SQL](rollback-live.sql) drop chỉ4new functions, transactional; snapshot xác nhận trước apply chúng chưa tồn tại.

Lượt1 apply201, HTTP ba workload pass, SQL comparator strict báo tie-order mismatch ở month; rollback201 ngay và xác minh P0/4new helpers vắng. READ ONLY diagnosis chứng minh không đổi row/field/totals, chỉ tie order. Công cụ được sửa/rehearse local; SQL migration không đổi. Lượt2 fresh snapshot/guard/apply201, same-snapshot parity và warm page tests pass, **giữ4P2 NEW**. Rollback lượt1 đã chạy và kiểm chứng trên server; không rollback lượt2 thành công. Evidence lượt1 giữ ở `attempt-1/`. Một catalog READ ONLY fetch failed rồi retry pass; final catalog evidence được lưu.

[Catalog cuối](definitions-live-final.json), [catalog validation](catalog-validation.json): 18P0 definitions/metadata nguyên,4new helpers STABLE/INVOKER/search_path public; RLS/policies/table ACL/indexes/financial schema không đổi. 11 source/protected hashes khớp đầu P2. Không sửa.env hoặc dùng service-role. Credential giữ memory raw stdin không echo, không lưu env/evidence. Không có business write LIVE do tools.

## 7. Git, PASS và giới hạn

Branch/main HEAD giữ nguyên. Package có P0/P1 scripts cũ và P2 tests/commands mới; thay đổi P1 dirty từ trước giữ nguyên hashes. Sources P2, migration/rollback/scripts/evidence trong working tree. **Chưa commit/push/merge hoặc deploy frontend.** DB apply có quyền riêng ở trên. [Git status](git-status-final.txt), [outcome](outcome.json).

**P2 PASS trong local regression, mocked UI, LIVE anon read loaders/pages và same-snapshot SQL đã chạy.** Production frontend hiện hành còn dùng OLD loaders cho đến khi được yêu cầu deploy; không tuyên bố mọi authenticated company session/mutation production đã pass. Summary không cache; lookup identity vẫn cần global visible identity consistency; explicit imports và callers ngoài P2 vẫn có ALL-loader behavior hiện có. Chart kỳ>1000 sửa cap như đã nêu, chưa thay công thức cashbook running balance. HTTP phases có concurrent data drift; không đặt SLA. Dừng P2, không chuyển P3.
