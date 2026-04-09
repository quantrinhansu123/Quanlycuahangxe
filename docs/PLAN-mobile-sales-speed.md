# Kế hoạch Tối ưu Tốc độ Mobile (Trang Quản lý Bán hàng)

## 1. Phân tích nguyên nhân làm chậm (Bottlenecks)
Dựa theo triệu chứng ("chậm vào trang dữ liệu, chậm lúc Thêm mới"), nguyên nhân cốt lõi gây ra tình trạng đơ / lag trên điện thoại nằm ở 2 vị trí:

1. **Hiệu ứng nút cổ chai DOM (10.000 Khách hàng):**
   Mặc dù danh sách 10.000 khách hàng tải ngầm trong background nhanh (Chỉ tốn ~1 giây qua mạng), nhưng khi bạn bấm nút "Thêm mới", Component `SearchableSelect` phải nhồi toàn bộ 10,000 cái tên khách hàng này thành 10,000 thẻ HTML `<div class="option">` vào bộ nhớ RAM của Điện thoại. CPU điện thoại không tải nổi việc "vẽ" 10,000 thẻ này ra màn hình, gây ra tình trạng trắng trang, khựng, hoặc đứng máy vài giây.
   
2. **Quá trình Khởi tạo dữ liệu trên Mobile (Render Thrashing):**
   Khi vào trang, bảng xếp hạng 20 Phiếu Bán hàng có thể chứa nhiều layout, việc tính toán chiều rộng / khoảng cách trên mobile kết hợp với việc chờ đợi 10,000 khách hàng khiến trải nghiệm chạm (TTI - Time to Interactive) bị trễ.

---

## 2. Lộ trình triển khai Triệt phá Bottleneck (Task Breakdown)

### Giai đoạn 1: Giải cứu `SearchableSelect` và `MultiSearchableSelect` (Cứu nguy lúc Thêm Mới)
- **Giải pháp: In-memory Slice (Cắt ảo danh sách)**.
- **Thực thi:** Tôi sẽ can thiệp thẳng vào file `SearchableSelect.tsx` và `MultiSearchableSelect.tsx`. Thay vì bắt điện thoại in ra cả 10,000 khách hàng cùng lúc, hệ thống sẽ:
  1. Giữ 10,000 khách hàng trong bộ nhớ (cực nhẹ).
  2. **Chỉ in ra đúng 50 khách hàng đầu tiên** lên màn hình thả xuống.
  3. Khi bạn GÕ vào thanh tìm kiếm, hệ thống sẽ chắt lọc trong 10,000 người lấy ra 50 người đúng tên nhất để vẽ ra.
- **Kết quả:** Thao tác tìm kiếm vẫn hoàn hảo, nhưng Điện thoại chỉ phải "vẽ" 50 thẻ HTML thay vì 10,000 thẻ. Tốc độ bật "Thêm mới" sẽ tức thì (khung hình 60fps), hết bị đơ/chậm.

### Giai đoạn 2: Tối ưu UI Khởi động trang (Cứu nguy lúc Vào trang tải dữ liệu)
- **Chống chặn Main-Thread:** Bọc các phần tử nặng hoặc Model bật lên vào `React.memo` hoặc dời việc chuẩn bị 10K khách hàng xuống sau khi giao diện đã vẽ xong.
- **Visual Feedback:** Hiển thị mượt mà hơn bộ khung (Skeleton) hoặc Spinner cực nhẹ để khi vào trang trên 3G/4G Mobile ấn tượng không bị giật cứng.

---

## 3. Xác nhận Verification (Kiểm tra rủi ro)
- **KHÔNG mất tính năng tìm kiếm:** Ngay cả khi bạn chỉ thấy 50 khách khi mới bấm xổ xuống, nếu bạn gõ tên người thứ 9,999, hệ thống vẫn ngay lập tức lôi người đó lên Top 1 để bạn chọn. Toàn vẹn tuyệt đối dữ liệu.
- Rút ngắn thời gian nhấn "Thêm mới" / "Cập nhật" trên Mobile xuống **chưa tới 0.3 Giây**.

---
> Kế hoạch `docs/PLAN-mobile-sales-speed.md` đã được khởi tạo theo đúng vấn đề của bạn.
> Vui lòng gõ `/create` nếu bạn đồng ý tiến hành fix tận gốc vấn đề này ngay lập tức!
