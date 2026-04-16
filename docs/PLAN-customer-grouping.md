# Plan: Group Customers by Registration Date

Tính năng này cho phép người dùng chuyển đổi giữa chế độ xem danh sách phẳng hiện tại và chế độ xem gộp theo ngày đăng ký, giúp dễ dàng theo dõi lượng khách hàng mới gia tăng theo từng mốc thời gian.

## Mô tả (Goal)
Gộp danh sách khách hàng theo định dạng: `Ngày/Tháng/Năm : Tổng số lượng` và hiển thị chi tiết các khách hàng thuộc nhóm đó ở bên dưới.

## Proposed Changes

### 1. Logic xử lý dữ liệu (Data Processing)

#### [MODIFY] [CustomerManagementPage.tsx](file:///c:/Users/dungv/quan_ly_cua_hang_xe/src/pages/CustomerManagementPage.tsx)
- Triển khai logic `groupedCustomers` (useMemo) để nhóm `displayCustomers` theo phần ngày của `ngay_dang_ky` một cách mặc định.
- Kết quả là mảng các object: `{ date: string, count: number, items: KhachHang[] }`.

### 2. Giao diện (UI/UX)

#### [MODIFY] [CustomerManagementPage.tsx](file:///c:/Users/dungv/quan_ly_cua_hang_xe/src/pages/CustomerManagementPage.tsx)
- **Danh sách khách hàng**: Luôn hiển thị theo phân đoạn thời gian.
- **Mobile View**: 
    - Hiển thị Header `dd/mm/yyyy : {n} khách hàng` giữa các nhóm.
- **Desktop View**:
    - Chèn hàng `<tr>` tiêu đề (colspan) cho mỗi nhóm ngày.

## Open Questions
- Bạn muốn sắp xếp nhóm ngày mới nhất lên đầu hay cũ nhất lên đầu? (Mặc định: Mới nhất lên đầu).

## Verification Plan
- Kiểm tra nút bật/tắt trên toolbar.
- Xác nhận số lượng tổng hiển thị khớp với số bản ghi bên dưới.
- Kiểm tra tính đúng đắn khi chuyển trang (Pagination).
