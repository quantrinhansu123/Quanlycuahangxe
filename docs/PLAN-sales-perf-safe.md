# Kế hoạch tối ưu tốc độ Quản lý Bán hàng (Đảm bảo Giữ Nguyên Logic)

## 1. Yêu cầu Đặc biệt
**Tối ưu tốc độ tải và lưu (initial load & submit) một cách an toàn nhất, tuyệt đối KHÔNG làm mất, thiếu sót, hay thay đổi bất kỳ logic nghiệp vụ nào** đang có:
- Không mất logic tự xóa chi tiết cũ và rải lại chi tiết phiếu mới.
- Không mất logic tự tạo các khoản "Thu chi" (tự động gom về mảng Tài chính).
- Không mất việc tự động Cập nhật ngày tháng nổi lên của khách hàng.
- Không mất chức năng normalize `id_bh` (chỉ là chuyển về chạy ngầm (background) hoặc kiểm tra thông minh để không chặn UI loading).

---

## 2. Phân tích nguyên nhân làm chậm hệ thống (Bottlenecks)

### Khâu tải trang (Initial Load)
- **Cổ chai 1:** Hàm `enrichSalesCards` gọi 4 vòng lặp truy vấn bổ sung (chi tiết, khách, nhân viên, dịch vụ). Chúng tốn nhiều round trips tới DB qua mạng.
- **Cổ chai 2:** `limit(10,000)` khách hàng được kéo trực tiếp về client ở mỗi lần tải. Việc load khối dữ liệu khủng này làm đứng trình duyệt.
- **Cổ chai 3:** Việc gọi hàm đồng bộ `normalizeSalesCards()` trên tất cả document trống `id_bh` được kích hoạt một cách "tuần tự, chặn request" ở mọi lần người dùng vào trang.

### Khâu lặp lại khi "Lưu" hoặc "Tạo" (Submit Delay)
- **Cổ chai 4:** Tốn tới **8 quá trình** gọi đi gọi lại lên Database (Lưu phiếu gốc -> Xóa chi tiết -> Thêm chi tiết -> Load Thu Chi -> Lưu Thu Chi -> Sửa KH).
- **Cổ chai 5 (Nặng Nhất):** Cuối hàm `handleSubmit`, thay vì chỉ nạp lại đúng phần Danh sách Phiếu, lại đang ép hàm `loadData()` chạy lại toàn bộ => Buộc hệ thống phải nạp lại 10.000 khách, toàn bộ nhân sự, thiết bị từ đầu dù chúng không thay đổi!

---

## 3. Lộ trình triển khai (Task Breakdown)

### Giai đoạn 1: Tối ưu dữ liệu Nạp Trang (Bảo toàn Logic)
- Tách `loadData` thành:
  - `loadReferenceData()`: Nạp Khách hàng, Nhân sự, Dịch vụ **đúng 1 lần duy nhất** khi vừa mở trang hoặc khi có lệnh reload tổng.
  - `loadSalesCards()`: Chỉ nạp danh sách 20 Phiếu bán hàng và dùng ngay data Khách/Nhân Sự đã cache ở trên để map dữ liệu. (Đảm bảo logic hiển thị `enrichSalesCards` giữ nguyên).
- Hạn chế Data List: API nạp 10K khách sẽ kéo xuống còn vài trăm hiển thị sẵn, khi người dùng cần tìm, sử dụng `onValueChange` trên `SearchableSelect` kết hợp DB full-search (Không mất khả năng tìm kiếm khách cũ).

### Giai đoạn 2: Tối ưu Delay khi Bấm Lưu (Giữ Đúng Logic Tạo/Cập Nhật)
- Giải thiểu việc chặn: Thay `await loadData()` ở cuối bước Lưu bằng `await loadSalesCards()`. Chỉ lấy 20 items vừa cập nhật thay vì reload hàng chục MB JSON.
- Tận dụng `Promise.all`: Quá trình 'Xóa chi tiết cũ', 'Tạo chi tiết mới', 'Kiểm tra Tài Chính', 'Bơm Tài Chính', 'Update Khách' thay vì viết theo thứ tự chờ đợi nhau (sequential async/await), ta tống vào 1 cụm `.all` cho chạy đồng thời, **tuyệt đối không bỏ bước nào**.

### Giai đoạn 3: Tối ưu Luồng Chạy Ngầm (Normalize process)
- Chuyển `normalizeSalesCards()` (Đoạn sửa lỗi thiếu ID) chạy theo nguyên tắc tách biệt. Hàm này sẽ được "thả nổi" không để từ khóa `await` chặn đường render UI chính. Nó sẽ quét và sửa `id_bh` nhưng vẫn đảm bảo khách mở trang thấy dsác lập tức.

---

## 4. Verification Checklist (Kiểm tra chéo)
- [ ] Tính năng Lập phiếu: Tổng tiền tự động được mang qua Quản lý Tài Chính bằng phiếu "Hoàn Thành".
- [ ] Tính năng Sửa phiếu: Xóa tự động các dịch vụ cũ và chèn thay thế được các khoản dịch vụ mới (cùng với update phiếu Thu Chi).
- [ ] Tốc độ truy cập Trang chính phải phản hồi xong trong vòng <2 Giây.
- [ ] Tốc độ từ lúc ấn "Lập phiếu" đến lúc màn hình tắt Pop-up báo Thành Công phải phản hồi <1.5 Giây.

---
Vui lòng Review Kế hoạch mới có đảm bảo giữ an toàn "Logic" cho anh không. Nếu đồng ý, xin tiếp tục với `/create`!
