# Kế hoạch: Tách biệt quy trình Lập đơn hàng và Thu tiền

Hiện tại, hệ thống mặc định tạo một phiếu thu ngay khi lưu đơn hàng mới. Theo yêu cầu, chúng ta sẽ chuyển sang quy trình:
1. Lập đơn hàng (Chưa tạo phiếu thu).
2. Thu tiền thủ công (Nhấn nút "THU TIỀN" sau khi đơn hàng đã tồn tại).
3. Nếu đơn hàng đã thu tiền, việc chỉnh sửa đơn hàng sẽ tự động cập nhật lại số tiền trong phiếu thu hiện có.

## User Review Required

> [!IMPORTANT]
> - Đơn hàng mới sẽ **không** được ghi nhận doanh thu ngay lập tức cho đến khi người dùng nhấn nút "THU TIỀN".
> - Nếu đơn hàng đã thanh toán, mọi thay đổi về số lượng/giá dịch vụ khi sửa đơn sẽ **tự động** cập nhật vào phiếu thu cũ để đảm bảo tính đồng bộ dữ liệu.

## Proposed Changes

### 1. Phân hệ Bán hàng (Sales Management)

#### [MODIFY] [SalesCardManagementPage.tsx](file:///c:/Users/dungv/quan_ly_cua_hang_xe/src/pages/SalesCardManagementPage.tsx)

- Chỉnh sửa hàm `handleSubmit`:
    - Tìm đoạn code gọi `getTransactionByOrderId` và `upsertTransaction` (Dòng ~483).
    - Thêm điều kiện: Chỉ thực hiện `upsertTransaction` nếu `existingTx` tồn tại.
- **Khóa chỉnh sửa đơn đã thanh toán:**
    - Trong `SalesCardManagementPage.tsx`, ẩn nút **Sửa** (Edit) nếu đơn hàng đã có `thu_chi`.
    - Trong `handleOpenModal`, nếu đơn hàng đã được thanh toán, hiển thị thông báo "Đơn hàng đã thu tiền, không thể chỉnh sửa" và chuyển sang chế độ Xem (View).

## Verification Plan

### Automated Tests
- Kiểm tra tính đúng đắn của logic điều kiện trong code.

### Manual Verification
1. **Tạo đơn hàng mới:**
    - Lập một phiếu bán hàng mới.
    - Xác nhận đơn hàng hiển thị trong danh sách.
    - Mở chi tiết (nút Xem/Sửa): Phải thấy nút **THU TIỀN** (màu xanh lá) thay vì dòng chữ "ĐÃ THU".
2. **Xác nhận thanh toán:**
    - Nhấn nút **THU TIỀN** trong đơn hàng vừa tạo.
    - Kiểm tra xem bản ghi tài chính có được tạo đúng không.
3. **Cập nhật tự động:**
    - Sửa một đơn hàng đã thanh toán, thay đổi giá tiền.
    - Lưu lại và kiểm tra xem số tiền trong phiếu thu có tự động khớp với tổng tiền mới không.
