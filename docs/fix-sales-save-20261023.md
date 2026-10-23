# Sửa đơn bán hàng và thứ tự khách hàng — 23/10/2026

Trạng thái phát hành: đã áp dụng RPC mới trên Supabase và ghi nhận migration
`202610230001`. Frontend phát hành qua commit chứa bản sửa này.
**Chưa sửa số liệu lịch sử trên production.**

## Nguyên nhân và bằng chứng

Luồng cũ: `SalesCardFormModal` → `SalesCardManagementPage.handleSubmit` →
`upsertSalesCard` → xóa chi tiết theo UUID/mã BH → chèn chi tiết mới → lưu
phiếu thu và xuất kho qua các request riêng.

`cleanData` mang `tong_tien` cũ khi mở đơn; đơn mới dùng mặc định 0. Thao tác
thay chi tiết không tính lại tổng phiếu. Đã đọc trực tiếp định nghĩa trigger
production: `the_ban_hang_ct.thanh_tien` là cột sinh tự động, nhưng không có
trigger cộng lại `the_ban_hang.tong_tien`. Các guard thanh toán dùng tổng phiếu;
báo cáo sản phẩm dùng chi tiết, còn công nợ/tiền thu có dùng phiếu gốc. Đây là
nguồn gây chênh số tiền, độc lập với bản sửa giữ giá bán/giá vốn ngày 21/10.
Các request xóa/chèn riêng còn có thể mất chi tiết cũ nếu request sau thất bại.

Đã đọc video 25 giây: mở đơn ngày 01/10, thay dịch vụ Puly côn bằng Puly côn
SH 2020 rồi lưu. Không suy đoán mã đơn từ chữ mờ trong video.

Kiểm tra production bằng Supabase Management API trong `BEGIN READ ONLY`:

- 1.715 đơn từ 01/10 tại thời điểm kiểm tra, **636 đơn có tổng phiếu khác tổng
  chi tiết**. Cả 636 đều có chi tiết, không phải các phiếu trống.
- 2.555 dòng chi tiết tháng 10: không có dòng lệch công thức giá bán × số lượng.
- Đã xuất danh sách cần đối chiếu, không tự tính lại tiền thu hay giá vốn.

Bằng chứng cục bộ: `D:/xe/customer-issues-20261023/live-*.json`;
danh sách Excel đọc được: `D:/xe/customer-issues-20261023/invoice-total-review.csv`.
`node scripts/audit-sales-save.mjs` tái xuất danh sách chỉ đọc, dùng thông tin
kết nối cục bộ, không ghi token vào báo cáo. Truy vấn gom chi tiết/phiếu thu
theo mã trước khi join, không quét lại toàn bộ thu chi cho từng đơn.

## Bản sửa

Migration `202610230001_save_sales_order_atomic.sql` thêm RPC
`save_sales_order(p_header,p_details)` cho quản trị viên/quản lý:

- Khóa phiếu khi cập nhật. Kiểm tra phiên/quyền, cơ sở, ngày, dịch vụ và số tiền.
- Tính tổng từ giá bán × số lượng của các dòng; bỏ qua tổng cũ gửi từ trình duyệt.
- Lưu phiếu gốc, thay chi tiết và đồng bộ phiếu thu tự động trong một transaction.
  Lỗi ở bất kỳ bước nào hoàn tác cả lần lưu, gồm UUID chi tiết và tiền trước đó.
- Phiếu thu tự động theo tổng mới; giữ trạng thái đang chờ khi chỉ sửa dịch vụ.
  Không thay tiền hoặc phân bổ của các phiếu thu thủ công/nhiều hóa đơn.
- Chặn tổng mới nhỏ hơn tiền đã thu thủ công; giữ chặn đổi cơ sở khi đã thu tiền.
- Giữ UUID đơn/phiếu thu. Khi đổi mã BH, xử lý cả liên kết theo mã cũ và UUID.

Frontend dùng một RPC thay cho chuỗi ghi riêng. Nếu database chưa cập nhật thì
báo rõ, không quay lại cách xóa/chèn cũ. Giá bán, giá vốn và chi phí đã lưu tiếp
tục được giữ; danh mục dùng cho dịch vụ mới. Luồng kỹ thuật viên dùng RPC hiện
có và vẫn không được sửa đơn đã lưu.

Xuất kho vẫn đồng bộ sau khi đơn đã lưu. Nếu phần này lỗi, thông báo rõ đơn đã
lưu và cần kiểm tra xuất kho, đóng form để tránh người dùng bấm lưu lại vì
tưởng toàn bộ lần lưu thất bại. Xuất kho không nằm trong transaction mới.

## Thứ tự khách hàng

Đã đọc RPC hiện hành `app_private.customers_query` và component hiển thị:

```sql
ORDER BY coalesce(last_order_at, created_at, ngay_dang_ky) DESC NULLS LAST,
         id DESC
```

Ưu tiên thời điểm giao dịch gần nhất; nếu thiếu thì ngày tạo, rồi ngày đăng ký;
UUID giảm dần dùng để phân định các dòng có cùng thời điểm. Trong khi đó, các
nhóm trên giao diện ghi **ngày đăng ký** và chỉ gộp các dòng liên tiếp cùng ngày.
Vì vậy khách đăng ký tháng 5 nhưng vừa quay lại vẫn có thể ở trên khách tháng
10; một ngày đăng ký có thể xuất hiện thành nhiều nhóm. Chưa thay đổi quy tắc
này vì phản ánh yêu cầu hỏi nguyên tắc xuất hiện, không yêu cầu đổi kiểu sắp xếp.

## Kiểm thử và phát hành

- `node --test scripts/test-sales-save.mjs`: quyền, tổng mới, thay dịch vụ lặp
  lại, tăng/giảm/miễn phí, thu tự động đang chờ, thu từng phần/nhiều hóa đơn,
  rollback khi lỗi chèn chi tiết hoặc lưu phiếu thu, đổi mã phiếu.
- `node scripts/test-sales-save-ui.mjs`: trình duyệt 1440px/375px, đổi dịch vụ,
  giá/số lượng, lỗi và thử lại, mở lại đơn, không ghi riêng bảng tiền/chi tiết,
  cảnh báo khi đồng bộ xuất kho lỗi. Phản hồi API giả, không ghi production.
- 32 kiểm thử hồi quy báo cáo, snapshot giá vốn và xóa đơn đạt.
- 42 kiểm thử bán hàng, tìm kiếm/phân trang và quyền cơ sở đạt.
- Build, ESLint các file thay đổi và `git diff --check` đạt.
- Bản checkout riêng chỉ gồm 9 file của bản sửa cũng qua build, 16 kiểm thử
  database/snapshot và kiểm thử trình duyệt 1440px/375px; không phụ thuộc các
  thay đổi chấm công/đối tượng còn dang dở trong workspace.

Ảnh kiểm thử: `.build-verification/sales-save/`; dữ liệu giả.
Database kiểm thử dùng PGlite một kết nối và các trigger kế toán thực từ
migration. Chưa đo cạnh tranh nhiều kết nối PostgreSQL production.

Đã kiểm tra cài RPC trên PostgreSQL production trong transaction ROLLBACK,
xác nhận chặn gọi không có phiên, rồi áp dụng và đối chiếu chính xác nội dung
hàm đã lưu. Migration chỉ thêm RPC và ghi nhận phiên bản, không backfill
636 đơn. Dữ liệu cũ cần được sao lưu và đối chiếu
trước một đợt sửa riêng; danh sách CSV là đầu vào cho việc đó.
