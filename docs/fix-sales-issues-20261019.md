# Sửa các lỗi được phản ánh ngày 19/10/2026

## Bằng chứng và phạm vi

- Hai video đính kèm quay danh sách phiếu bán hàng; video thứ hai hiện thông báo chung “Lỗi: Không thể xóa phiếu”. Các đơn cùng tổng tiền có dịch vụ khác nhau.
- Ảnh tin nhắn phản ánh sai báo cáo khi có nhiều sản phẩm. Không có file âm thanh riêng để kiểm tra lại nội dung nhận dạng giọng nói.
- Không thay đổi hay gộp hồ sơ của Văn Huân. Sau khi được cấp token mới, đã đọc được schema và dữ liệu production; xác nhận các trigger kế toán gây lỗi thứ tự xóa như mô tả bên dưới.

## Nguyên nhân và thay đổi

### Xóa phiếu bán hàng

Luồng cũ gọi DELETE đơn, sau đó DELETE thu chi và xuất kho bằng các request riêng. Trigger kế toán yêu cầu hóa đơn còn tồn tại khi xóa phiếu thu. Đơn có phiếu thu tự động có thể bị xóa trước rồi request xóa thu chi thất bại; đơn có thanh toán thủ công bị trigger chặn ngay. Chi tiết đơn cũng chưa được dọn trong luồng này. UI bỏ toàn bộ lỗi cụ thể.

Luồng mới gọi `delete_sales_order(uuid)` một lần. RPC kiểm tra phiên và quyền admin/quản lý, khóa đơn, kiểm tra thanh toán thủ công/đối trừ nhiều đơn, rồi xóa phiếu thu tự động, xuất kho tự động, chi tiết theo UUID/mã phiếu và cuối cùng đơn. Nếu bất kỳ bước nào lỗi, toàn bộ giao dịch rollback. Phiếu nhập và xuất kho thủ công được giữ. Phiếu có đối trừ thủ công yêu cầu gỡ thanh toán trước; lỗi cụ thể được hiển thị.

### Báo cáo lợi nhuận

Tổng quan, báo cáo theo ngày/dịch vụ/cơ sở/nhân viên và chi tiết đơn có cách xử lý `thanh_tien = 0`, `thanh_tien = null` và `so_luong = 0` khác nhau. Đặc biệt tổng quan không suy ra doanh thu thiếu khi tính lợi nhuận, dù đã suy ra khi tính doanh thu.

Các màn này nay dùng cùng `lineRevenue`, `lineCost`, `lineQuantity` với báo cáo tài chính: ưu tiên thành tiền được lưu kể cả 0; chỉ tính giá bán × số lượng khi thành tiền thiếu; giá vốn là giá vốn đơn vị × số lượng đúng một lần. Số lượng 0 giữ nguyên, thiếu số lượng mặc định 1. Ví dụ giá bán 150.000đ, vốn 62.000đ: lãi một sản phẩm 88.000đ, hai sản phẩm 176.000đ. Chưa đủ dữ liệu để khẳng định đây là toàn bộ nguyên nhân của đơn thực tế trong phản ánh.

Đối chiếu production trong kỳ 01–19/10: 2.118 dòng chi tiết, 10 dòng số lượng lớn hơn 1, không có thành tiền/số lượng thiếu hoặc số lượng 0. Mẫu bán 140.000đ, vốn 62.000đ có lãi 78.000đ; mẫu bán 150.000đ có lãi 88.000đ. Một số dòng nhiều sản phẩm có giá vốn 0; không tự điền giá vốn lịch sử khi chưa có chứng từ xác nhận.

### Cảnh báo nghi trùng trong doanh số nhân viên

Đã dò các luồng tạo nhân sự, chấm công, phiếu bán hàng và chi tiết doanh số nhân viên. Phát hiện tiêu chí nghi trùng của doanh số quá rộng: cùng ngày + SĐT (hoặc tên khách) + tổng tiền làm các xe khác nhau hoặc dịch vụ khác nhau bị cảnh báo. Nút nghi trùng lại dẫn về chính phiếu đang xem, chỉ ghi mã phiếu còn lại trong tooltip.

Nay chỉ gợi ý đối chiếu khi cùng hồ sơ khách/xe, ngày, cơ sở, danh sách dịch vụ, số lượng và số tiền chính xác. Không dùng riêng tên/SĐT để kết luận; không cảnh báo nếu thiếu chi tiết đối chiếu. Mã phiếu còn lại được hiển thị ngay dưới mã đơn và có liên kết mở trực tiếp, kể cả khi phiếu đó thuộc nhân viên khác. Cảnh báo không loại đơn khỏi doanh số và không tự xóa/gộp dữ liệu.

## Kiểm tra

- `npm test`: gồm hồi quy cũ và kiểm thử mới về báo cáo, nghi trùng, xóa giao dịch.
- `npm run test:sales-issues`: kiểm thử tính tiền, tiêu chí nghi trùng, trigger PostgreSQL thật trong PGlite và UI desktop/mobile với API giả lập.
- `npm run build`: kiểm tra bí mật, TypeScript và production bundle.
- ESLint các file chạm tới: còn một lỗi `react-hooks/set-state-in-effect` có sẵn trong `ReportOrdersModal.tsx`; đã kiểm tra cùng lỗi trên phiên bản HEAD trước sửa. Không thay đổi vòng đời modal trong bản sửa phép tính này.
- Các test xóa tái hiện lỗi cũ, kiểm tra quyền, lặp thao tác, thanh toán hoàn thành/đang chờ, giữ đối trừ nhiều đơn, rollback và không xóa phiếu nhập/xuất thủ công.

## Áp dụng

1. Chạy `supabase/migrations/202610190001_delete_sales_order_atomic.sql` trên database đã có các migration kế toán 10–12/10/2026. Migration chỉ cài hàm, không xóa dữ liệu.
2. Triển khai frontend sau migration. Không có fallback xóa từng bảng khi RPC chưa tồn tại.
3. Kiểm tra lại phiếu được phản ánh bằng tài khoản quản lý. Cần quyền truy cập Supabase hợp lệ để kiểm tra dữ liệu thực tế và các phiếu thu/chi tiết mồ côi có thể đã phát sinh từ luồng cũ. Không tự xóa các dữ liệu lịch sử này.

Ngày 19/10/2026 đã áp dụng migration `202610190001` lên production và ghi lịch sử migration. Kiểm tra lại xác nhận hàm tồn tại, bật `SECURITY DEFINER`, quyền gọi dành cho `anon`/`authenticated`, và request không có phiên bị từ chối với mã `42501`. Số lượng dữ liệu trước/sau giữ nguyên: 10.698 đơn, 17.803 dòng chi tiết, 6.158 phiếu thu/chi, 9.121 dòng kho. Không xóa phiếu thật để kiểm thử trên production.

Phát hiện 3 phiếu thu tự động đang tham chiếu đơn không còn tồn tại. Đã lưu thông tin chẩn đoán cục bộ trong thư mục bị Git bỏ qua; giữ nguyên các phiếu này để đối chiếu chứng từ, không tự xóa lịch sử tiền. Token mới chỉ lưu trong `.env.local`, không đưa vào commit.
