# Kiểm tra yêu cầu bổ sung ANC

Mở `http://localhost:5173`, Ctrl+F5 và đăng nhập bằng tài khoản quản lý/kế toán của cửa hàng. Các kiểm thử tự động dùng dữ liệu fixture riêng; chưa tạo chứng từ thử vào dữ liệu thật.

| Nội dung chị ghi | Cách kiểm tra | Kết quả cần thấy |
| --- | --- | --- |
| Một phiếu thu/chi thanh toán nhiều mã | Tạo hai hóa đơn cùng cơ sở còn nợ. Trong Thu chi, bấm **+ Thêm hóa đơn đối trừ** hai lần, chọn hóa đơn và số tiền từng dòng; nhập tổng tiền bằng tổng đối trừ. Lưu **Hoàn thành** với quỹ thực trả/thu. | Cả hai hóa đơn giảm nợ đúng phần thanh toán. Sổ quỹ chỉ có một khoản theo tổng phiếu. Sửa/hủy phiếu tính lại từng hóa đơn. Tổng sai, hóa đơn trùng, khác cơ sở hoặc trả vượt bị chặn. |
| Chi lương liên kết mã nhân viên | Tạo phiếu chi nhóm **Lương**, chọn mã nhân viên, kỳ tháng/năm, loại **Ứng trước lương**, tiền và quỹ. Mở bảng lương cùng kỳ; sau đó thử phiếu **Chi lương** cho phần còn lại. | Hiện số **Đã nhận / Ứng trước / Còn phải trả** đúng kỳ; bấm số tiền xem từng phiếu. Hủy/sửa phiếu cập nhật lại. |
| Cảnh báo sắp hết hàng | Vào Kho, đặt ngưỡng Dầu A = 10, phụ tùng = 5. Lọc cơ sở và ghi nhận nhập/xuất. | Tồn bằng hoặc thấp hơn ngưỡng có cảnh báo. Nhập thêm vượt ngưỡng thì hết cảnh báo. Ngưỡng 0 tắt cảnh báo. |
| Chi phí trả trước đúng kỳ | Tạo phiếu chi Thuê nhà 60.000.000, bật **Phân bổ chi phí theo tháng**, bắt đầu tháng cần ghi nhận, 6 tháng. | Tháng trả tiền: quỹ chi 60 triệu. Mỗi tháng trong 6 tháng: chi phí thuê nhà 10 triệu, trừ vào lợi nhuận trước thuế của tháng đó. Ngoài 6 tháng không còn phân bổ. |
| Chi tiết công nợ theo mã | Trong Tài chính tổng hợp, chọn **Công nợ**, bấm mã khách/NCC. Có thể điền mã NCC trực tiếp trên phiếu nhập. | Hiện dư đầu kỳ, từng phát sinh/đối trừ trong kỳ, hóa đơn liên quan, số dư sau mỗi dòng và dư cuối kỳ. Bấm mã PT/PC mở phiếu cha gồm tất cả đối trừ. |
| Chọn từng báo cáo | Chọn kỳ và cơ sở, lần lượt bấm các ô Kho, Công nợ, Chi phí, Giá vốn, Doanh thu, Lợi nhuận gộp, Lợi nhuận trước thuế, Dòng tiền. | Giữ các số tổng; nội dung bên dưới đổi đúng mục, kỳ và cơ sở. Bấm dòng để mở chi tiết. |
| Excel dễ đọc | Bấm **Xuất Excel** trong Tài chính tổng hợp. | Mười sheet, kẻ ô, tiêu đề rõ, bộ lọc, số tiền và phần trăm có định dạng; ngày là ngày Excel. Có chi tiết công nợ và phân bổ chi phí. |

Những khoản cũ chưa gắn đúng hóa đơn/nhân viên/kỳ phân bổ cần nhập bổ sung theo chứng từ thực tế. Hệ thống giữ dữ liệu cũ và không tự ghép người hay NCC chỉ vì trùng tên. Giá vốn thiếu và tồn đầu theo từng cơ sở vẫn cần dữ liệu thực tế để báo cáo chính xác.

Các kiểm tra chạy bằng `npm run test:anc-accounting`. Kiểm thử dữ liệu và ảnh UI nằm trong `.build-verification/anc-details` (Git bỏ qua). Kiểm tra schema/API Supabase sau triển khai ghi tại `docs/anc-accounting-validation.json`; thao tác ghi dữ liệu bằng phiên người dùng thật cần kiểm tra theo bảng trên.
