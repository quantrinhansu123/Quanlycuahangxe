# Kế hoạch triển khai: Khắc phục lag khi nhập liệu form Phiếu Bán Hàng CT

## Vấn đề 
Hiện tại khi thêm mới/sửa `Hạng mục Bán hàng CT`, thao tác gõ chữ trên các ô nhập liệu (ví dụ: Số lượng, Giá bán) bị "giật lag" và phản hồi rất chậm.

**Nguyên nhân kĩ thuật**:
Trong component `SalesCardCTFormModal`, đang sử dụng thẻ `<select>` mặc định của HTML để hiển thị toàn bộ danh sách Hàng hóa/Dịch vụ và Đơn hàng gốc. Nếu có hàng ngàn dịch vụ hoặc đơn hàng, thẻ `<select>` sẽ phải kết xuất (render) hàng ngàn thẻ `<option>` mỗi khi người dùng gõ vào bất kỳ ô text nào (do state thay đổi kích hoạt re-render). Điều này làm khóa (block) luồng xử lý chính của trình duyệt gây ra lag.

## User Review Required

> [!IMPORTANT]
> **Giải pháp đề xuất**:
> Thay thế các thẻ `<select>` native hiện tại chứa danh sách dài thành Component `SearchableSelect` (đã có sẵn trong dự án). `SearchableSelect` có khả năng giới hạn số lượng mục hiển thị (ví dụ 50 mục đầu tiên) và hỗ trợ tìm kiếm linh hoạt, giải phóng DOM và loại bỏ hoàn toàn hiện tượng tụt FPS/lag khi nhập liệu.

## Proposed Changes

### Thay Đổi Component

#### [MODIFY] [src/components/SalesCardCTFormModal.tsx](file:///c:/Users/dungv/quan_ly_cua_hang_xe/src/components/SalesCardCTFormModal.tsx)
- Import `SearchableSelect` từ thư mục `components/ui`.
- Thay thế dropdown "Mã đơn hàng (Số phiếu)" (`name="id_don_hang"`) thành `SearchableSelect`.
- Thay thế dropdown "Sản phẩm" (`name="san_pham"`) thành `SearchableSelect`.
- Điều chỉnh các hàm `onChange` cho phù hợp: từ sự kiện `e.target.value` chuyển sang giá trị chuỗi (string value) được gởi ra từ `SearchableSelect`.
- Tách (Memoize) các mảng cấu hình `options` (dùng `useMemo`) để tránh tính toán lại mỗi lần render.

## Open Questions

- `SearchableSelect` sẽ chặn hiển thị tối đa 50 kết quả đầu tiên và yêu cầu gõ thông tin để tìm kiếm. Bạn có thấy hợp lý không, hay cần tăng số lượng hiển thị thêm?
- Bạn có muốn áp dụng `SearchableSelect` cho ô chọn Cơ sở không (hay giữ nguyên `<select>` do Cơ sở chỉ có 2-3 tùy chọn)?

## Verification Plan

### Manual Verification
- Mở danh sách `Hạng mục Bán hàng CT`.
- Bấm nút "Thêm mới".
- Thử gõ nhanh nội dung vào ô "Mã chi tiết", "Ngày", "Số lượng", "Ghi chú". Xác nhận nét chữ hiện ra tức thì không có đỗ trễ (lag free).
- Mở dropdown "Sản phẩm", xác nhận giao diện đẹp hơn, có khả năng tìm kiếm nhanh và chỉ hiển thị vừa đủ để làm nhẹ trang web.
