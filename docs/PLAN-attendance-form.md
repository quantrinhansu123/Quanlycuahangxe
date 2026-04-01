# Kế hoạch điều chỉnh Form Chấm Công (Attendance Form)

Mục tiêu: Đơn giản hóa form "Thêm bản ghi chấm công", thiết lập các giá trị tự động, không cho chỉnh sửa các trường quan trọng (Nhân sự, Ngày) và ẩn các trường phức tạp với người dùng cuối (Tọa độ) để tránh nhầm lẫn.

## Các thay đổi dự kiến (src/pages/AttendanceManagementPage.tsx)

### 1. Nhân sự (Không cho chọn, tự động dùng người đang đăng nhập)
- Gỡ bỏ thẻ `<select>` danh sách toàn bộ nhân sự.
- Thay thế bằng thẻ khóa (ReadOnly) với tên `useAuth().currentUser?.ho_ten`.

### 2. Ngày chấm công (Không cho sửa, format DD/MM/YYYY)
- Thay thế input date mặc định.
- Parser giá trị hiển thị dạng DD/MM/YYYY. Date gốc gửi API là YYYY-MM-DD.

### 3. Vị trí tọa độ (Ẩn khỏi giao diện)
- Xóa component hiển thị tọa độ trên UI nhưng giữ lấy thông số ở logic ngầm.

---

## Các câu hỏi chưa xác định (Socratic Gate)
1. Cách xử lý khi người dùng chặn quyền vị trí (do không hiện bảng cảnh báo nữa).
2. Thay đổi label "Chấm công hộ" sang "Thêm chấm công".
3. Style UI cho ô nhập ngày tháng và nhân sự (Text tĩnh hay Input Disabled).
