# Kế hoạch tối ưu tốc độ Quản lý Bán hàng (Được duyệt)

## 1. Yêu cầu Đặc biệt từ hệ thống
1. **Tuyệt đối ĐẢM BẢO giữ nguyên toàn bộ logic nghiệp vụ (Thu chi, update chi tiết phiếu, v.v.).**
2. **KHÔNG** chuyển mã `id_bh` sang UUID. Mã phải luôn giữ đúng định dạng `BH-XXXXXX`.
3. **KHÔNG** giới hạn danh sách khách hàng xuống 500 hay bắt thay đổi luồng tìm kiếm khách hàng. Vẫn giữ nguyên việc load danh sách khách hàng đầy đủ.

---

## 2. Phân tích nguyên nhân làm chậm hệ thống (Bottlenecks)

### Khâu tải trang (Initial Load chậm)
- **Cổ chai 1:** Hàm `enrichSalesCards` gọi 4 vòng lặp truy vấn bổ sung (chi tiết, khách, nhân viên, dịch vụ). Chúng tốn nhiều round trips tới DB qua mạng.
- **Cổ chai 2:** Kéo cả 10K khách hàng chung với danh sách thẻ bán hàng, khiến trang đợi tải xong 10K khách mới hiện lên giao diện.
- **Cổ chai 3:** Việc gọi hàm đồng bộ `normalizeSalesCards()` bị chạy lặp lại ở mọi lần người dùng vào trang.

### Khâu lưu phiếu (Submit Delay lâu)
- **Cổ chai 4:** Tốn tới **8 quá trình** gọi đi gọi lại lên Database (Lưu phiếu gốc -> Xóa chi tiết -> Thêm chi tiết -> Load Thu Chi -> Lưu Thu Chi -> Sửa KH). Chạy tuần tự khiến tổng thời gian chờ lâu.
- **Cổ chai 5 (Nặng Nhất):** Cuối hàm `handleSubmit`, gọi lại hàm `loadData()` chạy lại toàn bộ => Buộc hệ thống nạp lại 10.000 khách, toàn bộ nhân sự, thiết bị từ đầu dù chúng không hề thay đổi sau khi lưu!

---

## 3. Lộ trình triển khai (Task Breakdown)

### Giai đoạn 1: Tối ưu dữ liệu Nạp Trang (Không mất Logic)
- **Tách `loadData` thành 2 phần độc lập chạy song song, không chờ đợi nhau**:
  - `loadReferenceData()`: Nạp Khách hàng, Nhân sự, Dịch vụ. Chạy **đúng 1 lần ẩn dưới nền (Background)** khi mở trang. Giao diện bảng danh sách 20 phiếu bán hàng KHÔNG PHẢI CHỜ 10K khách hàng tải xong mới hiển thị.
  - `loadSalesCards()`: Ưu tiên tải cực nhanh danh sách 20 Phiếu bán hàng và hiển thị ra màn hình ngay lập tức.
- **Không giới hạn danh sách khách (Theo ý Admin)**: Vẫn fetch toàn bộ khách hàng như cũ, nhưng đưa việc fetch này xuống chạy background để không làm chặn (blocking) tốc độ hiển thị giao diện. Nhờ đó dropdown vẫn có đủ tất cả khách để xài.

### Giai đoạn 2: Tối ưu Delay khi Bấm Lưu (Giữ Đúng Logic, Giữ đúng chuẩn ID)
- **Tuyệt đối giữ nguyên logic `BH-XXXXXX`**: Module lưu phiếu bán hàng và chi tiết vẫn thực thi theo đúng chuẩn.
- Gộp các API chạy **Song song (Promise.all)** thay vì Tuần tự. Xóa chi tiết cũ, chèn chi tiết mới, tạo phiếu thu sẽ được gọi đồng thời không phải xếp hàng chờ mạng phản hồi.
- **Bỏ `loadData()` ở cuối bước Lưu**: Thay bằng `await loadSalesCards()`. Chỉ lấy nhanh lại 20 items vừa cập nhật thay vì mất thời gian đẩy lại toàn bộ hàng nghìn Database.

### Giai đoạn 3: Xử lý luồng chạy ngầm của `normalizeSalesCards`
- Rút `normalizeSalesCards` ra khỏi việc chặn tiến trình Load Data.
- Hàm này tự hiểu mã `id_bh` phải là `BH-XXXXXX`, và sẽ được chạy nền chỉ xử lý các phiếu trống mã.

---

## 4. Verification Checklist (Kiểm tra chéo)
- [ ] UI Danh sách phiếu bán hàng hiển thị gần như ngay lập tức khi chuyển tab (Không bị nghẽn do chờ khách hàng).
- [ ] Dropdown khách hàng khi bấm Thêm mới MỚI mở lên vẫn chứa ĐẦY ĐỦ số lượng khách hàng.
- [ ] Logic "Đồng bộ doanh thu" và "Cập nhật ngày nhắc thay dầu" giữ nguyên hoàn toàn.
- [ ] Mã phiếu `id_bh` xuất ra vẫn là `BH-XXXX` và tăng chuẩn.
- [ ] Lưu đơn xong pop-up tắt gần như tức thời.

---
Mọi yêu cầu của bạn đã được ghi nhận đúng chuẩn. Vui lòng gõ /create để tôi bắt đầu viết mã triển khai ngay.
