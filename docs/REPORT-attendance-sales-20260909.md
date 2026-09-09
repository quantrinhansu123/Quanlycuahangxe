# Báo cáo sửa chấm công và Bán hàng — 09/09/2026

Đã sửa và kiểm thử trong workspace. Người dùng đã yêu cầu commit/push GitHub sau khi kiểm thử. Hai migration mới **chưa áp dụng lên Supabase đang chạy**. Sau khi người dùng yêu cầu tiếp tục triển khai, đã tìm thấy phiên đăng nhập Supabase CLI trong hệ thống; tuy nhiên tài khoản này không có quyền với dự án `crcqyaphmaxgkrhffevl` (`quan_ly_cua_hang_xe`). Lệnh link bị Supabase từ chối: “Your account does not have the necessary privileges to access this endpoint.” Danh sách 11 dự án mà CLI được truy cập không có dự án này. Các biến kết nối quản trị DATABASE_URL/SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD cũng không có. Phép đo Supabase bên dưới chỉ đọc bằng cấu hình API hiện có.

## 1. Nguyên nhân và sửa chữa

| Vấn đề | Nguyên nhân trong mã | Sửa |
|---|---|---|
| Nửa ngày thành 1 công | Bảng quản lý và tính lương đếm ngày có check-in; trang cá nhân đếm ngày có bản ghi; Trạm Chấm Công đếm số dòng | Dùng cùng phép hợp các khoảng giờ hoàn chỉnh, cộng 0,5 cho từng ca đủ giờ |
| Ca thứ hai ghi đè ca thứ nhất | Trạm Chấm Công tìm một bản ghi theo nhân viên/ngày rồi thay giờ; nhập Excel cũng ghép theo người/ngày | Trạm mở dòng mới sau ca đã kết thúc; Excel chỉ ghép cùng người/ngày/giờ vào hoặc ID chỉ định |
| Chấm ra sau lần chấm vào đầu tiên có thể thêm dòng mới | Trang cá nhân không giữ ID database trả về sau upsert | Lưu kết quả trả về vào form; không cập nhật form lạc quan trước khi lưu thành công |
| Tổng hợp khác nhau giữa màn hình | Các màn hình có công thức riêng; một số lượt tải bị giới hạn số dòng | Dùng chung hàm tính ca; đọc đầy đủ tháng; tổng ngày tính trên dữ liệu đã gộp trước phân trang |
| Bổ sung thủ công thiếu ca, kiểm tra trùng và dấu vết | Form cũ chỉ tạo/sửa dòng giờ, chưa có giao dịch bổ sung theo ca | Thêm modal và RPC kiểm tra người quản lý, nhân viên, ca, giờ và lý do; lưu người/thời điểm bổ sung |
| Khách có trong danh mục nhưng tìm ở Bán hàng không thấy | Ô chọn khách chỉ lọc danh sách đã tải; tải toàn bộ khách tốn nhiều request, lỗi bị ghi console; cách so khớp cục bộ khác SQL chuẩn hóa biển/SĐT/tên | Tìm qua customers_query trong database, debounce 300 ms, 50 kết quả/lượt; hủy truy vấn cũ và giữ khách đã chọn |
| Đổi ngày/trang chậm hoặc kết quả cũ | Effect của Bán hàng tải lại dữ liệu tham chiếu và toàn bộ khách khi đổi bộ lọc/trang; request cũ không bị hủy | Tách effect; chỉ tải tham chiếu khi mở trang; hủy request trước và bỏ phản hồi lỗi thời |
| Truy vấn tổng hợp Bán hàng nặng | Tạo dữ liệu chi tiết của toàn bộ lịch sử trước khi lọc ngày; tìm ngày mua đầu tiên dùng cả JSON phiếu đầy đủ | Lọc bảng phiếu gốc trước khi tổng hợp chi tiết; ngày mua đầu tiên chỉ cần định danh khách và ngày, vẫn xét toàn bộ lịch sử |
| Chấm công tải lặp | Bảng quản lý tải toàn bộ dữ liệu lại khi đổi trang; sinh mã CC quét toàn bộ bảng; count exact lặp ở từng trang dữ liệu | Phân trang trên dữ liệu bộ lọc đã tải; mặc định tháng hiện tại; sequence sinh mã; chỉ count ở lượt đầu, trang tải 1.000 dòng |

Các hàm SQL chuẩn hóa SĐT/biển số/tên và migration tối ưu ngày 09/09 trước đó đã tồn tại trong repository. Bản sửa này sử dụng và kiểm thử lại chúng, không nhận các thay đổi cũ là thay đổi mới.

## 2. File thay đổi

- `src/utils/timekeeping.ts`: hàm tính công dùng chung, xác thực giờ và độ chính xác đến giây.
- `src/data/payrollAttendanceSalary.ts`: tổng công tháng theo ca; luồng đồng bộ lương/đối soát hiện có dùng hàm này.
- `src/data/attendanceData.ts`: RPC bổ sung/sinh mã, phân trang đầy đủ, hủy request, chuẩn hóa giờ nhập, escape bộ lọc.
- `src/pages/AttendanceManagementPage.tsx`: tổng/ngày công, dữ liệu trước phân trang, nút bổ sung, ghi chú, định danh nhân viên, nhập Excel, phản hồi lỗi thời.
- `src/pages/AddAttendancePage.tsx`: công tháng và giữ ID sau lần lưu đầu.
- `src/pages/CheckInPage.tsx`: công tháng, mở ca thứ hai, chặn chấm ra khi chưa có ca, chỉ đọc tháng hiện tại.
- `src/components/PersonnelAttendanceDetailsModal.tsx`: công từng ngày và tổng.
- `src/components/ManualAttendanceModal.tsx`: form bổ sung theo ca.
- `src/components/ui/SearchableSelect.tsx`: tùy chọn tìm qua API, debounce/hủy, trạng thái tải/lỗi; dropdown khác vẫn dùng tìm cục bộ như cũ.
- `src/components/SalesCardFormModal.tsx`, `src/pages/SalesCardManagementPage.tsx`: nối tìm khách qua database, tách tải tham chiếu, hủy lượt cũ.
- `src/data/salesQueryData.ts`, `src/data/salesCardData.ts`, `src/lib/readRequest.ts`: hủy và đo request đọc, thời hạn phản hồi.
- `supabase/migrations/202609090003_attendance_shifts.sql`.
- `supabase/migrations/202609090004_sales_date_scope.sql`.
- `scripts/test-attendance.mjs`, `scripts/test-attendance-ui.mjs`, `scripts/test-sales-data.mjs`, `scripts/test-sales-helpers.mjs`, `package.json`: kiểm thử.
- Báo cáo này.

`supabase/.temp/cli-latest` đã có thay đổi trước khi bắt đầu và được giữ nguyên.

## 3. Database / triển khai

Áp dụng hai migration mới theo thứ tự 003 rồi 004, trước khi đưa frontend mới vào sử dụng. Chúng phụ thuộc các bảng hiện có, helper phiên đăng nhập `current_app_nhan_su_uuid()` và các migration truy vấn Bán hàng ngày 08–09/09 đã có trong dự án.

Để tiếp tục tự động: đăng nhập CLI bằng tài khoản có quyền quản trị đúng dự án qua `npx supabase login`, rồi liên kết `npx supabase link --project-ref crcqyaphmaxgkrhffevl`. Không gửi token hoặc mật khẩu vào hội thoại. Sau khi có quyền, cần kiểm tra schema thật, áp dụng riêng hai file mới và đo lại API. Không chạy đẩy toàn bộ lịch sử migration vì có thể bao gồm thay đổi ngoài phạm vi tác vụ.

Migration 003 thêm `ghi_chu`, `bo_sung_boi`, `bo_sung_luc`, index ngày/nhân viên, sequence mã CC, hàm tính công ngày, RPC bổ sung và trigger kiểm tra khoảng giờ trùng. RPC kiểm tra quyền từ phiên đăng nhập phía database; danh tính người bổ sung không lấy từ form. Giao dịch khóa theo nhân viên/ngày bằng advisory lock, dùng chung với trigger của lượt ghi thông thường. Không xóa bản ghi trùng cũ; các khoảng giờ cũ trùng nhau không được cộng công nhiều lần.

Migration 004 thêm index phân trang theo ngày, các hàm đọc phục vụ lọc ngày và thay nội dung `sales_query`. Giữ `SECURITY INVOKER` để áp dụng RLS của người gọi; không thay dữ liệu phiếu, khách, chi nhánh hoặc thanh toán.

Không tự ghi lại kỳ lương đã lưu/khóa/chi trả. Kỳ cần tính lại sử dụng luồng đồng bộ/đối soát hiện có sau khi triển khai; công thức mới được dùng khi tính lại. Không thử tải/ghi dữ liệu thật bằng tài khoản quản lý vì môi trường không có phiên quản lý phục vụ kiểm thử.

## 4. Công thức

- Sáng 07:30–11:30: 0,5 công.
- Chiều 14:00–19:30: 0,5 công.
- Tổng tối đa 1 công/người/ngày; tổng tháng cộng các tổng ngày.
- Các dòng trùng hoặc khoảng giờ chồng nhau chỉ được tính một lần; các đoạn liền nhau có thể ghép phủ đủ ca.
- Quy ước áp dụng cho giờ chỉnh tay: phải phủ đủ khoảng giờ chuẩn mới nhận 0,5 công cho ca. Thiếu giờ vào/ra, về sớm hoặc đến sau đầu ca thì ca đó chưa đủ công. Không suy ra công từ sự tồn tại của một dòng. Giao diện xem trước công trước khi bổ sung.
- Giữ nguyên quy tắc đi muộn, tăng ca sau 19:40, tiền ăn và các thành phần lương khác.

## 5. Bổ sung thủ công

Người quản lý mở **Bổ sung chấm công**, chọn nhân viên, ngày, ca và nhập lý do. Ca sáng/chiều có giờ mặc định và cho sửa giờ; cả ngày tạo hai dòng theo hai ca chuẩn trong cùng giao dịch. Có ca sáng thì vẫn bổ sung được ca chiều. Chọn lại ca đã có sẽ báo lỗi. Chọn cả ngày khi một ca đã có cũng bị chặn và không lưu một phần; chọn riêng ca còn thiếu để bổ sung. Có bản ghi thiếu giờ thì sửa bản ghi đó trước thay vì tạo bản ghi khác chồng ca.

## 6. Kết quả kiểm thử

| Test yêu cầu | Kết quả |
|---|---|
| 1. 07:30–11:30 | Đạt: 0,5 ở hàm frontend và SQL |
| 2. 14:00–19:30 | Đạt: 0,5 ở hàm frontend và SQL |
| 3. Hai ca cùng ngày | Đạt: 1 |
| 4. Quản lý bổ sung sáng | Đạt: +0,5, lưu lý do/người bổ sung |
| 5. Bổ sung lại sáng | Đạt: lỗi 23505, không thêm dòng |
| 6. Sáng có sẵn, bổ sung chiều | Đạt: tổng 1 |

Ví dụ 08/09 đủ ngày + 09/09 sáng + 10/09 chiều: **2 công**. Có kiểm thử thêm rollback cả ngày, quyền nhân viên/phiên trống, tên và mã NV, ID sinh không trùng, cập nhật giờ chồng nhau, thiếu giờ và giây lẻ.

`npm test`: **29 test đạt** (9 chấm công, 13 SQL Bán hàng/khách, 7 helper). SQL chạy bằng PGlite với dữ liệu giả, không phải production. Advisory lock đã có trong triển khai; chưa chạy kiểm thử hai kết nối PostgreSQL thật ghi đồng thời.

Playwright chạy component/trang thật với API giả lập: giờ mặc định ba lựa chọn, payload bổ sung, lỗi trùng, tổng lương 2 công, tìm khách theo tên/SĐT/biển số ngoài options đã tải; bảng quản lý hiển thị công ngày 1 và đổi trang không gọi lại database; Trạm Chấm Công tính 10,5 từ 21 dòng và mở bản ghi mới sau ca sáng. Browser tests không ghi lên Supabase thật.

Build TypeScript/Vite và kiểm tra bảo mật Zalo đã đạt. Lint các module mới cốt lõi đã đạt.

`npm run test:ui` toàn bộ đã đạt, gồm bộ hồi quy sẵn có trên desktop 1365px/mobile 390px: phân trang Bán hàng giữ tổng ngày, bộ lọc chi nhánh gửi đúng API, timeout và thử lại, quyền chi nhánh, mở/lưu/mở lại form thu chi, và bảng thu chi khi dữ liệu tham chiếu đang tải/lỗi; cộng bộ kiểm thử chấm công mới.

## 7. Timeout

Các nguyên nhân tăng tải xác định từ mã và kiểm thử: tải toàn bộ khách lặp theo mỗi thay đổi bộ lọc, đọc lại toàn bộ chấm công khi phân trang, quét toàn bảng để sinh mã, và tổng hợp chi tiết toàn lịch sử trước lọc ngày. Đã xử lý các nguồn tải này; không chỉ giảm timeout.

Request đọc `sales_query`, `customers_query`, `attendance_page` có AbortController và thời hạn 8 giây, thông báo **“Máy chủ phản hồi chậm. Vui lòng thử lại.”**. Tìm kiếm/bộ lọc cũ bị hủy; lỗi cũ không ghi đè dữ liệu mới. Các số đo từng request lưu trong Performance API theo tên RPC, không kèm nội dung khách hàng. Không tự retry lệnh ghi.

Lượt đo production hiện tại không tái hiện timeout. Chưa thể khẳng định nguyên nhân của mọi lỗi kết nối trước đây hay thời gian toàn bộ lượt tải màn hình, vì ngoài RPC chính còn các request bổ sung chi tiết/thanh toán/dịch vụ.

## 8. Thời gian trước/sau

| Phép đo | Trước | Sau | Phạm vi |
|---|---:|---:|---|
| SQL lọc 07/09 trên fixture có thêm 2.400 phiếu, 1.200 khách, 300 dịch vụ ngoài ngày lọc | 132 ms | 69 ms | PGlite cục bộ, so với mã repository trước sửa; kết quả JSON bằng nhau |
| Tìm khách `customers_query`, trả 1 kết quả | 1.684 ms | Chưa đo sau triển khai | Supabase thực tế, HTTP 200 |
| `sales_query` lọc 08–09/09, trả tối đa 1 phiếu | 1.443 ms | Chưa đo sau triển khai | Supabase thực tế, HTTP 200 |

Các lần chạy cục bộ khác ghi nhận 130→67 ms. Đây là phép đo một lượt trên dữ liệu giả, không phải p95 hoặc cam kết tốc độ production. Log benchmark còn có phép so với migration cũ hơn nữa (1.651→206 ms); không dùng số này để quy toàn bộ lợi ích cho bản sửa hiện tại.

Sau khi áp dụng migration/frontend, cần đo lại đúng request và bộ lọc trên Supabase để có cột “sau” thực tế.
