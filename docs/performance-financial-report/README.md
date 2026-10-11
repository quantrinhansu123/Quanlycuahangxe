# Tối ưu tải báo cáo tài chính và xuất Excel

Ngày kiểm chứng: 12/10/2026. Phạm vi: tab **Báo cáo → Tài chính tổng hợp**, bộ lọc kỳ/cơ sở và file Excel mười sheet hiện có.

## Nguyên nhân và thay đổi

Trước đây, báo cáo tải sáu nguồn lịch sử theo từng trang 1.000 dòng. Mỗi nguồn chờ trang trước hoàn tất rồi mới tải trang kế tiếp. View đơn bán còn phải tính lại cơ sở của đơn cũ tại từng trang. Với quy mô dữ liệu hiện tại, một lần tổng hợp cần 32 request trong fixture có cùng số lượng nguồn chính.

- `business_report_snapshot` lấy đủ sáu nguồn lịch sử trong một lần đọc. Dữ liệu trả về gồm một danh sách cột và các mảng giá trị, tránh lặp tên cột trên mỗi dòng. Chi tiết bán kỳ hiện tại và kỳ trước tiếp tục chạy song song, nên fixture dùng tổng cộng 3 request. Khi kỳ có nhiều hơn 1.000 dòng bán, phần chi tiết vẫn phân trang đầy đủ.
- Nguồn lịch sử vẫn dùng lại khi đổi cơ sở trong cùng kỳ. Công thức tính số liệu giữ nguyên; không cắt lịch sử ở 1.000 dòng hay chỉ lấy chứng từ trong kỳ. Phiếu chi trả trước/lương ngoài kỳ vẫn có mặt để ghi nhận chi phí đúng tháng.
- Hàm dùng `SECURITY INVOKER`, view đơn bán được bảo vệ và quyền/RLS của phiên gọi hiện có. Chỉ truyền các trường báo cáo cũ, không thêm số điện thoại hay ảnh.
- Tạo, định dạng và nén Excel chạy trong Web Worker. Luồng giao diện chỉ gửi dữ liệu sheet và nhận file; chuyển kỳ/cơ sở hoặc rời trang sẽ hủy tác vụ cũ. Lỗi tải/xuất được hiển thị để thử lại. Workbook giữ đủ mười sheet, viền, số, ngày và phần trăm.
- Bộ định dạng tiền/số/tỷ lệ được dùng lại giữa các ô, tránh tạo `Intl.NumberFormat` hàng nghìn lần.

## Kết quả đo

Đối chiếu nguồn trên Supabase trong cùng một snapshot: 10.021 đơn, 5.478 thu/chi, 8.115 dòng kho, 1.292 dịch vụ, 26 sản phẩm và 11 phiếu nhập. Cả sáu nguồn giải nén khớp cách truy vấn cũ. JSON nguồn giảm từ **8.981.667 xuống 5.003.854 byte**, giảm **44,3%**; đây là kích thước JSON đo trong CSDL, trước nén HTTP.

Một mẫu EXPLAIN của RPC trên dữ liệu thật chạy khoảng **1.778 ms**. Phép đo này là truy vấn quản trị có phạm vi đọc đầy đủ, không phải thời gian tải giao diện bằng phiên đăng nhập của cửa hàng.

Benchmark Playwright dùng component dữ liệu thật, API fixture và độ trễ 120 ms/request: tải nguồn **1.867 → 455 ms**, **32 → 3 request**, doanh thu/công nợ/tồn kho khớp. Worker xuất 10.000 dòng × 8 cột trong **1.204 ms** ở lần đo này; bộ đếm giao diện tiếp tục chạy và nút vẫn bấm được khi đang xuất. Đây là số đo fixture trên máy kiểm thử, không cam kết thời gian trên thiết bị người dùng. Số liệu chi tiết ở `ui-validation.json`.

## Triển khai và kiểm tra

Migration `202610120001_financial_report_snapshot.sql` đã áp dụng lên Supabase đang dùng và ghi nhận vào lịch sử migration. Định nghĩa schema cũ được sao lưu cục bộ trong `.build-verification/finance-performance/snapshot-schema-backup.json`, Git bỏ qua. Giao dịch triển khai đối chiếu số chứng từ, tổng tiền thu/chi hoàn thành và trạng thái trigger bảo vệ quyền trước/sau; tất cả không đổi. Kết quả rút gọn, không chứa chứng từ hay thông tin đăng nhập, ở `live-validation.json`.

Kiểm thử tự động:

- `npm run test:financial-report-performance`: migration thực tế với PGlite, đầy đủ lịch sử vượt 1.000 dòng, chi trả trước ngoài kỳ, RLS, ngày không hợp lệ, định dạng gói và hủy request; Playwright đo request, kiểm tra lỗi đọc, cache cơ sở, phản hồi giao diện khi xuất và file Excel đủ dòng/định dạng.
- `npm test`, `node scripts/test-reports-p3-ui.mjs`, `node scripts/test-anc-accounting-ui.mjs`: các phép tính báo cáo và luồng nghiệp vụ trước đó.
- `npm run build`, `npm run typecheck` và ESLint các file TypeScript thay đổi.

Để thử: mở `http://localhost:5173`, Ctrl+F5, đăng nhập và vào **Báo cáo → Tài chính tổng hợp**. Chọn kỳ, đổi cơ sở rồi xuất Excel; có thể thao tác trên trang trong lúc tạo file. Không dùng fixture kiểm thử để ghi chứng từ lên Supabase thật.
