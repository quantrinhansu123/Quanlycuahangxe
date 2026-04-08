# Kế hoạch sửa lỗi kẹt mã phiếu bán hàng do sắp xếp chuỗi (Lexicographical Sorting)

## Phân tích nguyên nhân gốc rễ
Qua quan sát hình ảnh và dữ liệu thực tế:
1. Các mã phiếu cũ trong hệ thống đều đang ở định dạng ngẫu nhiên (chứa chữ cái) như `BH-455QX7`, `BH-LZJPKD`.
2. Khi code thực hiện lấy 100 phiếu trong Database, nó đang sắp xếp giảm dần theo mã thẻ (chuỗi ký tự).
3. Trong bảng chữ cái (chữ và số ASCII), các chữ cái `A, B, C... Z` có giá trị lớn hơn các số `0, 1, 2... 9`. Do đó, khi sắp xếp giảm dần, hàng trăm mã có chữ cái sẽ nằm đè lên trên cùng, còn những mã bắt đầu bằng số như `BH-000001` bị đẩy xuống tận đáy danh sách.
4. Vì hàm giới hạn chỉ lấy 100 mã đầu tiên (`limit(100)`), nó đã hoàn toàn "bỏ sót" mã `BH-000001` nằm ở bên dưới. Hàm không tìm thấy số nào cả nên lại cấp tiếp mã `BH-000001`.

## Giải pháp: Sắp xếp theo Thời gian tạo (created_at) thay vì mã chuỗi

### [MODIFY] [salesCardData.ts](file:///c:/Users/dungv/quan_ly_cua_hang_xe/src/data/salesCardData.ts)
Thay đổi logic từ:
```typescript
.order('id_bh', { ascending: false, nullsFirst: false })
```
Thành sắp xếp theo thời gian mới nhất:
```typescript
.order('created_at', { ascending: false })
```
- Khi sắp xếp theo `created_at`, phiếu `BH-000001` mới tạo của bạn sẽ luôn là phiếu ở top 1, hoặc ít nhất là nằm trong top 100 phiếu gần đây nhất.
- Hàm sẽ dễ dàng đọc ra số `1` từ đó và tạo số tiếp theo là `BH-000002`.

#### Tuỳ chọn mở rộng
Bên cạnh việc sửa lỗi sắp xếp, nếu bạn muốn dùng lại cơ chế "Sinh mã ngẫu nhiên" như các phiếu cũ (`BH-XXXXXX`), bạn có thể phản hồi lại để tôi chỉnh lại định dạng. Tuy nhiên, định dạng số tăng dần (`BH-000001`, `BH-000002`) là chuẩn mực chuyên nghiệp hơn cho phần mềm bán hàng.

## Kế hoạch triển khai
- [ ] Cập nhật file `salesCardData.ts` sửa lại trường sắp xếp (`order`).
- [ ] Chạy lệnh xác nhận xem file đã ưu tiên lấy đúng phiếu dựa trên thời gian chưa.

Bạn hãy xem kế hoạch này và bấm lệnh `/create` (hoặc trả lời "được") để tôi thực hiện cập nhật ngay nhé. Thao tác này sẽ dứt điểm được hoàn toàn lỗi trùng mã.
