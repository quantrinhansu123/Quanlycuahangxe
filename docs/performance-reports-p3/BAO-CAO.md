# P3 — Reports và final validation P0–P3

Ngày **04/10/2026, Asia/Saigon**, repository `D:\xe\Quanlycuahangxe-main`. Baseline `main`, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`.

**P3 regression và benchmark đã pass. Commit/push/deploy chỉ thực hiện sau toàn bộ final gates.** Trạng thái triển khai và production smoke sẽ được cập nhật sau khi kiểm chứng. Không migration P3; không re-apply P0/P2.

## Root cause và mapping

`RevenueReportPage.loadAll` gọi năm helper độc lập, mỗi helper tải lại cùng CT. Tháng 9 có 2724 CT rows: năm dataset loads × ba REST pages = **15 CT calls**. Personnel helper còn dùng Sales RPC tháng, trả canonical JSON/summary/customer mà công thức personnel chỉ cần bốn header fields.

`App.ErrorBoundary` và `MainLayout.motion.div` đều key theo `location.pathname`, nên đổi tab remount Reports và mất dữ liệu. Financial panel có loader riêng khi mount, đọc CT hiện tại thêm lần nữa và đọc product/inventory đầy đủ field ngoài nhu cầu. [Snapshot source trước sửa](source-before.json).

| Tab | Dataset/API OLD | NEW |
| --- | --- | --- |
| Sản phẩm/DV, Theo ngày, Theo cơ sở | Mỗi helper CT GET; cả năm helpers chạy trước khi mở tab | `loadReportSnapshot`: một CT dataset, pagination1000 đầy đủ; summary/service/day/branch tính từ cùng array |
| Nhân sự, Biểu đồ | CT GET thêm lần nữa + canonical monthly Sales RPC | Lazy compact header GET `id,id_bh,ngay,nhan_vien_id`; dùng lại CT snapshot và giữ personnel result trong parent |
| Tài chính tổng hợp | CT/current/prior orders/transactions và inventory mỗi mount | Lazy current/prior orders/transactions + prior CT; reuse current CT; compact product/inventory; parent giữ kết quả |

Không service catalog hoặc personnel lookup trong base report. Payroll vẫn dùng canonical Sales RPC và personnel như trước. Inventory report giữ REST cap hiện hành của movement loader; không âm thầm sửa công thức/cap ngoài P3.

## Source sửa và invalidation

- [reportData.ts](../../src/data/reportData.ts): snapshot chung, helper nhận optional shared typed records, compact personnel header pagination và cancellation. Các công thức revenue/profit/orders/quantity/staff/daily/branch giữ nguyên.
- [businessReportData.ts](../../src/data/businessReportData.ts): reuse current CT; reads độc lập song song; giữ OLD ID iteration order bằng array chứa references, không clone records; compact inventory projections dùng calculation cũ.
- [RevenueReportPage.tsx](../../src/pages/RevenueReportPage.tsx): parent sở hữu snapshot và lazy results, error/retry/refresh, AbortController/version. Snapshot invalidated theo date range, user/session, branch/role và khi rời Reports. Local table search/branch/staff/date filters vẫn tính trên derived data như OLD; không invent filter API.
- [BusinessReportsPanel.tsx](../../src/components/reports/BusinessReportsPanel.tsx): nhận shared result, không mount loader thứ hai; standalone use vẫn có abort/error.
- [App.tsx](../../src/App.tsx), [MainLayout.tsx](../../src/components/layout/MainLayout.tsx): cùng key `/bao-cao` cho report tabs; các route khác giữ behavior.
- `package.json`: P3 business/UI tests và benchmark command. Scripts/evidence ở thư mục này.

Không global cache, TTL hoặc cross-user map. Returning tab reuse dữ liệu trong cùng mounted parent; explicit **Làm mới** hoặc đổi filter/scope reset cả base/lazy sources. Rời Reports để sửa nghiệp vụ rồi quay lại tải fresh. Reads cũ bị abort và version guard chặn stale state. Retry riêng cho base/personnel/financial; API error không giả thành empty success.

## Benchmark Reports LIVE

Actual OLD archived và NEW modules qua Vite local, anon real API, cùng tháng **01–30/09/2026**, ba paired rounds. Duration gồm module/local Vite và loader, không production bundled UI/SLA. Các HTTP pha không common DB snapshot; full OLD calculation chạy thêm trên chính scalar inputs NEW đã đọc, bảo đảm **same-input full JSON parity cả năm outputs**. Không lưu rows/PII vào evidence, chỉ metrics/hashes.

| Metric | OLD | NEW |
| --- | ---: | ---: |
| CT rows mỗi dataset | 2724 | 2724 |
| CT dataset loads / REST calls | 5 / 15 | **1 / 3** |
| Sales canonical RPC / compact header GET | 2 / 0 | **0 / 2**, lazy personnel |
| Total API reads của cả năm outputs | **17** | **5** |
| Decoded payload | **5.002.056 B** | **805.897 B** |
| Loader median 3 samples | **3774 ms** | **1855 ms** |
| Samples | 11130 / 3587 / 3774 ms | 1667 / 1932 / 1855 ms |
| Status | All 2xx | All 2xx |
| Same-input full JSON comparisons | — | **3/3 pass** |

Payload giảm **83,89%**. Initial base tabs không tải header riêng: ba CT requests; con số năm requests trong bảng bao gồm mở personnel/charts. Cold OLD 11130 ms được giữ, không bỏ sample. [Full benchmark](benchmark-live.json).

## Correctness và final checks

P3 local **18 date/scope comparisons**, ba full business/inventory/prior-period comparisons; execute đúng OLD/NEW function bodies, không viết lại formula oracle. Cover default/no bounds/month/day/range/empty, branch-visible inputs, staff aliases/CSV, zero/null amount/quantity, all totals/charts and mutation refresh. [Regression](regression-local.json).

Actual App/router/layout UI với mocked API xác nhận CT full pagination, shared/repeated tab navigation, lazy personnel/financial, current CT reuse, compact inventory, rapid filters/cancellation, retry/refresh và same-user branch/role invalidation. [UI](ui-regression.json). Mock writes không tới LIVE. Full UI lần đầu có assertion quá sớm trước route activation; công cụ đã wait selected tab rồi chạy lại cả suite pass, không sửa công thức để xử lý test.

Full npm tests **74/74**, gồm P0 **7/7 (67 inputs × 3 scopes)**, P1 business, P2 **4/4** và P3 **3/3**. Full UI suite, typecheck/build/diff gates và actual read-loader validation lưu ở [checks](checks-predeploy.json). Các protected source/migration hashes giữ nguyên; không `.env`, business DML, RLS, timeout/work_mem/index/hardware change.

Final READ ONLY SQL có một warm-up + năm lượt/page trong REPEATABLE READ. Sales SQL median **518,170 / 520,753 ms**; PostgreSQL17.6, work_mem2184kB giữ nguyên. **18 P0/dependency + 4 P2 definitions/metadata** và RLS/policies/indexes khớp P2 cuối; không reapply DB. [Catalog/plans](final-live-db.json). Payroll/reconciliation chỉ mount read modules, không mount payroll auto-sync writer. [Final read loaders](final-live-loaders.json).

## Bảng performance P0–P3

Mỗi hàng lấy paired inputs trong phase riêng, phương pháp và snapshots khác nhau; không dùng bảng để so hardware/percentile giữa features. Sales là HTTP page1 P0.7; Attendance là REST list; CT/Financial là module loaders P2; Reports là module loader P3. Tất cả bytes decoded JSON.

| Feature | Duration BEFORE → AFTER | Requests BEFORE → AFTER | Payload BEFORE → AFTER |
| --- | --- | --- | --- |
| Sales page1/20 | 2304 → 1064 ms (P0.7 HTTP median5) | 1 RPC → 1 RPC | 67.624 → 67.624 B |
| Attendance tháng9 | 3573 → 269 ms (P1 median3) | 1 → 1 | 9.976.856 → 91.238 B |
| CT page1/20 | 43706 → 1957 ms (P2 loader single pair) | 580 → 2 | 21.248.272 → 18.997 B |
| Thu chi tháng9/page1 | 42916 → 1029 ms (P2 single pair) | 587 → 3 | 24.383.778 → 38.336 B |
| Sổ quỹ cùng kỳ | 34488 → 2487 ms (P2 single pair) | 587 → 3 | 24.383.778 → 38.336 B |
| Reports tháng9/cả năm outputs | 3774 → 1855 ms (P3 median3) | 17 → 5 | 5.002.056 → 805.897 B |

[Sales P0.7](../performance-sales-p07/BAO-CAO.md), [Attendance P1](../performance-attendance-p1/BAO-CAO.md), [CT/Financial P2](../performance-ct-financial-p2/BAO-CAO.md). App continued writing independently during previous phase probes; existing phase reports document drift/limits. P0 historical slow3021ms root cause chưa xác định; warm gates/current definitions pass, không tuyên bố SLA.

## Deploy plan và giới hạn

Theo yêu cầu P3, sau final gates/review/secret scan sẽ commit/push main theo Git→Vercel workflow hiện có. Baseline rollback SHA `810f6f5630341b73d68579f08c390eb42b892a93`. Nếu frontend regression, revert implementation commit và push để Vercel redeploy; DB P0/P2 giữ nguyên cho lỗi frontend. Không force push hoặc ghi business data.

Production smoke dùng actual built App trong browser/storage mới với synthetic identity chỉ để mở read UI, **không demo dataset/JWT/copy app session**; LIVE anon reads, chặn writes. Đây không kiểm chứng mọi authenticated company session hoặc production mutations. Attendance detail ảnh lớn vẫn on-demand; Reports còn full-period client calculation và inventory movement cap hiện hành; callers ngoài P2 có ALL-loader như cũ. Không mở thêm phase.
