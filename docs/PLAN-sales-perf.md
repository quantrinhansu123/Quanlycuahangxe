# Kế hoạch tối ưu hiệu suất trang Quản lý Bán hàng

## 1. Phân tích nguyên nhân làm chậm hệ thống

Qua kiểm tra mã nguồn tại `SalesCardManagementPage.tsx`, `salesCardData.ts`, và các file liên quan, tôi xác định 2 nguyên nhân cốt lõi gây chậm:

### Vấn đề 1: Tốc độ tải trang chậm (Initial Load)
- **Bottleneck 1 (`enrichSalesCards`):** Hàm `getSalesCardsPaginated` sau khi lấy ds phiếu (limit 20) sẽ chạy `enrichSalesCards`. Hàm này tự động kích hoạt **4 sub-queries song song** tới bảng `the_ban_hang_ct`, `khach_hang`, `nhan_su`, `dich_vu`. Mỗi query dùng `.in()`.
- **Bottleneck 2 (`getCustomersForSelect`):** Gọi `limit(10000)` từ bảng `khach_hang`. Tuy chỉ lấy vài cột nhưng 10,000 dòng tải qua mạng làm chậm và phình to bộ nhớ trình duyệt.
- **Bottleneck 3 (`normalizeSalesCards`):** Một hàm migration được đặt vào luồng `loadData()`. Hàm này tìm các phiếu thiếu `id_bh` để cấp mã mới. Nếu DB nhiều dữ liệu, query này làm chậm đáng kể, lại làm tuần tự N+1 query để update.
- **Bottleneck 4 (`getPersonnel` / `getServices`):** Đang lấy `SELECT *` kéo theo tất cả hình ảnh/cột không thiết yếu vào bộ nhớ client ngay lần tải đầu tiên.

### Vấn đề 2: Lưu đơn hàng rất chậm (Submit Delay)
Hàm `handleSubmit` đang chạy **8 quá trình** khi bấm "Lưu thay đổi" / "Lập phiếu":
1. `upsertSalesCard`: Lưu phiếu chính.
2. `deleteSalesCardCTsByOrderId`: Tuần tự gọi DB xóa dữ liệu chi tiết cũ.
3. `bulkUpsertSalesCardCTs`: Tuần tự insert lại dữ liệu chi tiết mới.
4. `getTransactionByOrderId` + `upsertTransaction`: Truy vấn rồi tiếp tục lưu vào bảng Thu Chi.
5. Cập nhật `created_at` trên Khách hàng.
6. Mất nhiều thời gian nhất là bước cuối: gọi lại **`loadData()`**. Việc này load lại TOÀN BỘ 10K khách hàng, toàn bộ nhân sự, dịch vụ và chạy toàn bộ enricher. Điều này làm trang bị 'đơ' vài giây sau khi bấm Lưu.

---

## 2. Kế hoạch triển khai tối ưu hiệu năng (Action Plan)

### Giai đoạn 1: Sửa logic loadData và giảm dung lượng tải ban đầu (Tránh Refetch thừa)
1. **Tách việc lấy Master Data khỏi việc lấy Data Danh Sách**:
   - Master Data (`nhan_su`, `dich_vu`, `khach_hang`) chỉ cần load 1 lần lúc vào trang (tạo `loadReferenceData()`).
   - Danh sách phiếu `the_ban_hang` load riêng khi đổi trang hoặc vừa thêm phiếu (tạo `loadSalesCards()`).
2. **Loại bỏ `normalizeSalesCards()`**:
   - Bỏ hoàn toàn lời gọi này ra khỏi hàm `loadData()`.
3. **Giới hạn số lượng Dropdown Search Khách hàng**:
   - Ở `getCustomersForSelect`, đổi `.limit(10000)` thành `.limit(500)`.
   - Ta sẽ kết hợp với component Search có sẵn để khi người dùng gõ tìm, nếu chưa có thì refetch cụ thể chứ không đẩy hết DB lên browser.

### Giai đoạn 2: Refactor quá trình lưu (`handleSubmit`)
1. Thay vì gọi `loadData()` ở cuối sau khi `upsert`, ta chỉ gọi `loadSalesCards()`.
2. Gộp bước hoặc cho chạy song song các hàm không phụ thuộc:
   - Các API tạo Phiếu chi tiết và Thu chi có thể chạy Promise.all.

### Giai đoạn 3: Rework SalesCardData Enrichment
1. Ở hàm `enrichSalesCards`, bỏ việc fetch lại khách hàng và nhân sự nếu ta đã có Master Data ở client. Ta có thể map data trực tiếp ở client (`SalesCardManagementPage` đã có sẵn state khách hàng/nhân sự).
2. Tối ưu code tìm ID mới (`getNextSalesCardCode`): Hiện đang lấy `limit(1000)` records dạng text để regex tìm phần lớn nhất. Nên thêm index trên cột đó, lấy `.order('id_bh', { descending: true }).limit(1)`.

---

## 3. Câu hỏi cho Admin trước khi tiến hành

1. Hàm `normalizeSalesCards` đang cập nhật mã `id_bh` (chuyển UUID sang dạng BH-XXXXXX) tự động. Bạn đã chuyển đổi xong mã của các đơn hàng cũ chưa? Nếu đã xong, tôi có thể xóa hàm này khỏi luồng load trang không?
2. Có ổn không nếu tôi thiết lập hệ thống Tối ưu Khách hàng: khi bạn mở Dropdown chỉ hiển thị 500 người mới nhất, khi bạn bắt đầu gõ tìm kiếm thì nó mới lên DB tìm nếu khách chưa có trong list? (Nhằm giảm thiểu 10K records).

Vui lòng Review và xác nhận để tôi bắt đầu chạy lệnh `/create` tiến hành viết code.
