# Kế hoạch Tối ưu Tốc độ Ứng dụng trên Thiết bị Di động (Mobile Speed)

## 1. Đặt câu hỏi khảo sát (Socratic Gate)
Trước khi bắt đầu, tôi cần hiểu rõ bạn đang gặp tình trạng chậm như thế nào trên điện thoại:
1. **Chậm khi làm gì?** Bạn thấy chậm khi mới vuốt mở ứng dụng (màn hình trắng lâu), chậm khi cuộn danh sách (giật lag màn hình - jank), hay chậm khi mở các Popup/Dropdown (đặc biệt là Dropdown chọn Khách hàng)?
2. **Khu vực nào chậm nhất?** Tình trạng chậm này xuất hiện ở mọi trang hay tập trung ở trang Quản lý Bán hàng / trang Thêm Mới khách hàng?
3. **Mức độ ưu tiên:** Bạn muốn tập trung vào việc cuộn mượt mà (60fps) hay việc ứng dụng từ lúc bấm vào đến lúc tải xong nhanh hơn?

> [!WARNING]
> Mặc dù chúng ta đã kéo việc lấy dữ liệu 10K khách hàng chạy ngầm, nhưng nếu thả 10,000 khách hàng này vào một thanh `Dropdown` (`SearchableSelect`) trên điện thoại, chip của điện thoại sẽ phải xử lý việc render 10,000 thẻ div HTML cùng lúc. Điều này có thể làm đơ toàn bộ trình duyệt Safari/Chrome trên mobile mất 2-3 giây. 

---

## 2. Phân tích nguyên nhân làm chậm UI trên Mobile (Mobile UI Bottlenecks)

1. **Main Thread Blocking do DOM quá lớn:** React render hàng nghìn thẻ HTML cho `SearchableSelect` hoặc các bảng danh sách khiến CPU di động bị quá tải.
2. **Heavy Bundle Size (Kích thước JS lớn):** Lần đầu mở link trên 4G di động tải rất nhiều mã Javascript (React, Supabase, Lucide icons, Recharts) trong 1 cục duy nhất (`index.js` có thể lên tới hàng MB).
3. **Chưa có Lazy Loading (Tải lười):** Không chia nhỏ file tải cho các Page chưa vào tới.
4. **Layout Thrashing & Repaints:** Các hiệu ứng, bóng đổ (shadows), hoặc việc tính toán lại chiều cao bảng trên màn hình dọc (portrait) trên điện thoại khiến GPU di động phải làm việc liên tục khi vuốt.

---

## 3. Lộ trình triển khai dự kiến (Task Breakdown)

### Giai đoạn 1: Triển khai Virtualization cho các danh sách khổng lồ (Giảm đơ/lag/jank giật)
- **Công việc:** Áp dụng `Windowing` (hoặc `Virtual List`) cho component `SearchableSelect` và `MultiSearchableSelect`. 
- **Lý do:** Thay vì render tất cả 10.000 khách hàng vào thanh tìm kiếm, ta chỉ render 10 người đang nằm trong khung hình vuốt của điện thoại. Khi vuốt xuống, DOM mới được vẽ tiếp. Việc này **triệt tiêu hoàn toàn** sự đơ máy khi bấm xổ xuống danh sách thả.

### Giai đoạn 2: Giảm dung lượng tải (Code Splitting & Lazy Loading)
- **Công việc:** Sử dụng `React.lazy` và `Suspense` trên cấp độ Router (`App.tsx`). Tách các trang bự (Sales, Quản trị, Dashboard) ra thành các file Javascript riêng lẻ (`chunk`).
- **Lý do:** Mở điện thoại ở đường truyền 3G/4G sẽ chỉ tải những đoạn mã JS dành cho trang đó, ứng dụng sẽ lên cực nhanh thay vì bắt điện thoại tải nguyên cả khối dự án.

### Giai đoạn 3: Tối ưu tương tác chạm (Touch & Layout optimizations)
- Bỏ cấu hình thừa làm giật cuộn (CSS `will-change` cho các modal, bảng danh sách).
- Chỉnh lại phần cuộn bảng (table overflow) để vuốt ngang cực mượt bằng Native Scrolling (`-webkit-overflow-scrolling: touch`).

---

## 4. Verification Checklist
- [ ] Mở Pop-up thanh chọn Khách hàng trên điện thoại sẽ không bị đứng máy hay giật lag.
- [ ] Cuộn danh sách bảng phiếu bán hàng (dù dài đến cỡ nào) vẫn đạt tốc độ khung hình 60fps trên Safari/Chrome Mobile.
- [ ] Thời gian hiển thị lần đầu khi Mở mới ứng dụng trên điện thoại báo "DOM Loaded" dưới 1 giây.

---

> Lệnh theo chuẩn: `docs/PLAN-mobile-speed.md` đã được khởi tạo.
> **Kế tiếp:** Vui lòng cung cấp giải đáp cho mục (1) hoặc yêu cầu sửa đổi kế hoạch. Nếu kế hoạch này đã đi đúng hướng, vui lòng gõ lệnh `/create`!
