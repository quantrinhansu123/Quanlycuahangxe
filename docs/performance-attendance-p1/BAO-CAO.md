# P1 — Optimize Attendance / Chấm công

**Cập nhật cuối P3:** frontend P1 đã được deploy production trong commit `d53e66c4140d8ea025ab613c9319281ece52ac5f`, smoke Attendance pass. Các trạng thái “chưa deploy” bên dưới là tại thời điểm kết thúc P1. [Kết quả final P0–P3](../performance-reports-p3/BAO-CAO.md).

Ngày **04/10/2026, Asia/Saigon**. Repository `D:\xe\Quanlycuahangxe-main`, branch `main`, HEAD `810f6f5630341b73d68579f08c390eb42b892a93`.

**P1 PASS trong bộ kiểm chứng đã chạy; thay đổi nằm trong working tree, chưa deploy.** Payload Attendance giảm **99,09%**, kết quả nghiệp vụ OLD/NEW bằng nhau. P1 giữ full dataset nhẹ của kỳ → grouping/calculation hiện hành → pagination UI. Không migration database. Sales P0.6 NEW trên LIVE giữ nguyên; READ ONLY catalog kiểm chứng cả **18 Sales/dependency function definitions** khớp snapshot cuối P0.7.

## 1. Root cause và source trace

Đã đọc [audit performance](../../../performance-audit-20261004/BAO-CAO.md), attendance columns/payload/plans, `AttendanceManagementPage`, `attendanceData`, settings/provider/personnel, timekeeping, import, AddAttendance/CheckIn, payroll read loader và detail modal. [Snapshot source trước sửa và hashes](source-before.json).

Route `/nhan-su/bang-cham-cong` → `loadRecords` → settings/personnel và staff-name/code/UUID resolution → `getAllAttendanceRecords` → `getAttendancePaginated` → PostgREST `cham_cong`. OLD `.select('*')` tải cả 13 cột cho toàn kỳ, chunk1000; UI mới group người/ngày, tính công, max late/day, sinh vắng, sort, daily stats, sau đó slice20. Ảnh và history chỉ dùng cho thumbnail/history/editor, không tham gia calculation.

LIVE tháng9 vẫn **285 logs**, **3 ảnh data URI**, tổng ảnh **9.876.285 bytes**, ảnh lớn nhất **4.790.323 bytes**; history **1.929 bytes**. SQL execution median chỉ khoảng0,17ms trong probe warmed mới. Bottleneck chính thuộc serializing/transferring/reading payload khoảng10MB. Không dùng EXPLAIN timing để giả là thời gian truyền ảnh REST.

## 2. Files sửa và projection

| File nguồn | Thay đổi |
| --- | --- |
| [attendanceData.ts](../../src/data/attendanceData.ts) | Explicit list projection11cột; `AttendanceListRecord`; full-record GET theo ID cho detail; bỏ cache/pending Attendance; normalize không tự chèn `anh:null` khi field bị omit |
| [AttendanceManagementPage.tsx](../../src/pages/AttendanceManagementPage.tsx) | List dùng compact records; ảnh/history/editor tải theo click; loading/error/cancel stale detail; personnel prewarm song song settings provider; calculation formulas giữ nguyên |
| [AddAttendancePage.tsx](../../src/pages/AddAttendancePage.tsx) | Form mở một record đã có thì fetch full detail trước khi edit; month stats vẫn dùng lightweight dataset đầy đủ |
| [package.json](../../package.json) | Thêm P1 regression vào npm test/UI suite và commands P1; giữ nguyên Sales test/benchmark commands |

Thêm scripts fixture/business regression/UI regression/HTTP+page-loader+SQL benchmark và thư mục evidence này. Không sửa `timekeeping`, attendance settings/provider, personnel data module, CheckIn source, payroll/CT/Financial/Reports hoặc Sales migration/functions.

**BEFORE:** `select('*')`:13cột, bao gồm `anh`, `lich_su_sua`.

**NEW list:**

```text
id,id_cham_cong,nhan_su,ngay,checkin,checkout,vi_tri,created_at,ghi_chu,bo_sung_boi,bo_sung_luc
```

Identity dùng id/mã/name; date/times dùng cho nhóm ca/công/late/OT; vi_tri cho list/search; created_at/id giữ stable order; ghi_chu/bo_sung giữ thông tin bổ sung hiện có. Schema LIVE đúng13cột, không có `company_id`, ca/type/công/OT/status scalar columns để select. Company/self visibility giữ filter/actor/session hiện có, không invent cột hoặc scope. Settings source thật là `attendance_settings(scope='global')`; không tự triển khai cấu hình theo company mới.

## 3. Ảnh/history/detail và mutation

List không tải `anh`/`lich_su_sua` và không có automatic detail request, kể cả đổi page. Không có thumbnail/has-photo/history-count nhẹ trong schema, nên dùng nút xem ảnh/history cho mỗi record thật; không phát minh flag hoặc tải base64 dưới alias khác. Dòng vắng dùng icon. History không còn cần JSON để quyết định bật nút; khi click mới biết có nội dung hay không.

`getAttendanceRecord(id,signal)` select11cột+`anh,lich_su_sua`, equality UUID và `.single()`, qua cùng Supabase client/session headers. Chỉ khi mở ảnh/history/editor hoặc form một record hiện có. Detail không cache, có AbortSignal/request version; request cũ không ghi đè lựa chọn mới, đổi filter hủy pending detail. Lỗi detail không mở editor thiếu dữ liệu; người dùng click lại để retry. Empty photo/history có thông báo rõ.

Editor nhận full original record trước khi save, giữ ảnh và nối history cũ. Form tạo từ dòng vắng giữ ảnh mặc định của nhân viên bằng dữ liệu personnel đã tải, chỉ khi mở form; không đưa ảnh vào các dòng list. Compact read **omit** ảnh/history, không giả `anh:null`; time-only CheckIn/upsert không tự xóa ảnh do normalize. Explicit upload/clear vẫn giữ cách ghi hiện hành. Không thử business write trên LIVE; edit/photo/history và transport payload preservation được test bằng mocked API, Attendance database rules được test local như suite cũ.

## 4. Full-month logic, requests và refresh

Giữ chunk1000, exact count batch đầu, mọi batch tiếp theo đến đủ; không đổi sang LIMIT20raw. `loadRecords` vẫn dùng đầy đủ `summaryRows` cho byPersonDay, historical/date handling, absence, summary, sorted UI rows và daily counts. Day credits vẫn dùng full `allRecords`; utilities/formulas/shift/lunch/grace/OT không sửa. Giữ cả semantics hiện hành của missing times và search-code/name, không âm thầm sửa công thức.

Bỏ cache Attendance5s và shared pending map vì không invalidation theo mutation/actor và có thể chia sẻ AbortSignal bị hủy giữa callers. Refresh sau create/edit/delete/manual/bulk/check-out phải đọc lại dữ liệu. Không thêm cache summary/Attendance. Page navigation vẫn chỉ slice dataset đã tải, không refetch. Hai callers độc lập có request riêng; không giữ kết quả giữa actor/session hoặc request.

Personnel/settings hiện có cache/in-flight15s/60s trong source cũ, không thêm global cache. Personnel được prewarm lúc settings provider đang đọc để hai read độc lập overlap; Attendance vẫn chờ personnel để resolve staff scope, và chờ đúng settings trước calculation. Request version/AbortController của list giữ nguyên, aborted read không thành lỗi UI.

## 5. Benchmark LIVE HTTP, cùng kỳ và input

Tháng **01–30/09/2026**, anon GET, không copy app session/service-role; đọc sequential3cặp OLD/NEW và đối chiếu chính xác 11field/order trước calculation. Không common DB transaction snapshot giữa HTTP calls; trong cả3cặp dữ liệu scalar/order thực tế bằng nhau. Không lưu base64/history/PII records vào evidence, chỉ metrics/aggregate/hash.

| Metric | OLD | NEW |
| --- | ---: | ---: |
| Attendance logs | **285** | **285** |
| Attendance requests mỗi load | **1** | **1** |
| Payload decoded JSON | **9.976.856B** | **91.238B** |
| Median API complete,3samples | **3573ms** | **269ms** |
| API complete samples | 4674/3269/3573ms | 538/136/269ms |
| HTTP status | 3/3 200 | 3/3 200 |

Payload giảm **99,09%**. Đây đúng dataset/bytes của case audit, nhưng duration lần audit10252ms và probe mới3573ms là các lần đo khác nhau; không dùng số audit làm paired baseline. Detail on-demand sample giữ đúng ảnh/history, tải1record/2.957.115B/1413ms khi yêu cầu, không tính vào list load. [HTTP full evidence](benchmark-live-http.json), [script](../../scripts/measure-attendance-p1.mjs).

## 6. Actual page loader và SQL

Mount OLD archived page/data và NEW page/data thật ở Vite local; real LIVE responses cho settings/personnel/attendance. Browser mới, ngày của page cố định tháng9, test identity chỉ mở read UI admin; mọi write bị chặn. Không claim phiên UI production có đăng nhập. Ba rounds mỗi version, **rendered summary và page1/page2 business text/hash bằng nhau**, đổi UI page không thêm requests.

| Actual page metric | OLD | NEW |
| --- | ---: | ---: |
| Total API reads mỗi mount | **3** | **3** |
| Total REST payload | **9.981.830B** | **96.212B** |
| Median mount → list rendered | **9658ms** | **1684ms** |
| Samples mount → rendered | 23415/9658/7070ms | 5408/1684/1066ms |

Loader duration gồm tải module/local Vite/render, không phải deployed bundled-frontend timing. Giữ cold sample23415ms; không loại outlier. [Page loader samples/hashes](benchmark-live-loader.json), [script](../../scripts/measure-attendance-p1-loader.mjs).

Management API **READ ONLY**, một warm-up+5rounds OLD/NEW trong **cùng REPEATABLE READ snapshot**, query ngày/order/range1000 đúng source. PostgreSQL17.6, work_mem2184kB giữ nguyên; diagnostic SET LOCAL6s giảm từ analyst2min, API/role default không tăng. Không DDL/DML.

| SQL median5warmed | OLD full13cột | NEW11cột |
| --- | ---: | ---: |
| Planning | 0,100ms | 0,089ms |
| Execution | **0,171ms** | **0,170ms** |
| Actual rows/loops | 285/1 | 285/1 |
| Shared hits, sample round1 | 63 | 63 |
| Temp read/write | 0/0 | 0/0 |

Index Scan `attendance_date_created_id`, không sort spill. EXPLAIN không truyền ảnh như REST. [Plans/settings/schema/payload sizes/Sales checksums](benchmark-live-sql.json), [READ ONLY script](../../scripts/measure-attendance-p1-sql.mjs).

## 7. OLD/NEW business correctness

LIVE3cặp HTTP đều **10nhân viên,30ngày,285logs,218person/day,398UIrows/20pages**, summary **94công,85phútmuộn,113buổinghỉ**. So toàn bộ scalar records/order, grouped credits/status/OT, daily counts, summary, các UI page IDs và bucket OT. [Live parity metrics](benchmark-live-http.json). Page benchmark còn so rendered summary và hai page đầu qua actual OLD/NEW component.

Local33comparisons =11scenarios×3settingsvariants: full month/day/no bounds/empty day/month/selected staff/search name+code/self/company-visible input datasets. Execute block calculation **thực từ source OLD và NEW**, không viết lại công thức đối chiếu. Cover multi shifts, UUID/code/name aliases, lunch/full-day fallback, missing in/out, early checkout/late/OT, nhân viên không log, absence and UI pagination không thiếu/trùng. [Regression local](regression-local.json), [business runner](../../scripts/attendance-p1-business.mjs).

UI mocked API có **7 kiểm tra pass**, gồm desktop/mobile on-demand, history append, failed detail/retry, stale detail cancellation, page navigation, full1034logs qua2batches, concurrent abort isolation, refresh sau mutation và ảnh mặc định của form tạo từ dòng vắng. [UI evidence](ui-regression.json). Mock writes chỉ trong test, không tới LIVE.

RLS/company scope: không thay request staff/date/search semantics hoặc custom session header; snapshot LIVE cho biết `cham_cong` RLS **disabled** hiện tại, có UPDATE/DELETE policy definitions giữ nguyên. Local company/self datasets và denied-detail test là regression visibility inputs; không claim đã test mọi production actor/company session hay rằng RLS đang enforce khi disabled. Không đổi policies/company data.

## 8. Checks, Git, giới hạn và điểm dừng

Kết quả kiểm tra cuối và process exits lưu ở [checks.json](checks.json); [Git status](git-status-final.txt). Npm test **67/67**, gồm Attendance14/14, P1 business3/3 và Sales P0 regression7/7. **UI suite, P1 UI 7/7, typecheck, build và git diff --check đều pass.** Sau rà soát cuối đã chạy lại P1 business, P1 UI, typecheck và build. Build đầu khi chạy cùng UI suite bị native OOM; đã lưu [build attempt1](build-attempt-1-oom.log) và [UI partial attempt1](ui-attempt-1-partial.log), sau đó chạy tuần tự giữ nguyên config và pass. Không nâng timeout/heap/hardware để che lỗi.

Giới hạn còn lại: detail một ảnh vẫn có thể vàiMB và chỉ tải khi yêu cầu; bỏ TTL Attendance làm explicit reload/remount luôn đọc lại nhẹ; personnel/settings caches là behavior có sẵn. Month calculation vẫn chạy client và đầy đủ mọi logs; chưa triển khai server person/day paging. Giữ cách bucket OT UI hiện hành theo page rows; không sửa công thức trong P1. Full authenticated production UI/mutation chưa được test vì không ghi data/session thật. Benchmark duration không phải SLA.

**P1 PASS trong phạm vi regression local, UI mocked và read-only LIVE đã kiểm chứng.** Không migration P1, không sửa `.env`, business data production, RLS/company_id, timeout/work_mem/index/CPU/RAM. Không sửa Sales P0 hoặc CT/Financial/Reports. Không commit/push/merge/deploy. Dừng ở P1, không tự chuyển P2.
