# Lưu, sửa và xoá phiếu bán hàng — 24/10/2026

Lỗi lưu trong video là PostgreSQL `57014` (statement timeout). Log cùng thời
điểm trỏ tới `save_sales_order` → trigger thu chi → `business_invoice_paid` →
`business_invoice_links`. Hàm cũ phân tích liên kết trên toàn bộ phiếu thu cho
mỗi lần tính tiền; luồng lưu gọi lại hàm này nhiều lần. Trong khoảng
12:00–15:00 có 33 timeout, 11 lần giảm giá dưới khoản thu thủ công và 3 lần
xoá bị chặn vì thanh toán liên kết. Hai nhóm sau giữ nguyên quy tắc kế toán
theo lựa chọn của người dùng.

## Thay đổi

Migration `202610240001` lọc các phiếu liên quan bằng nguồn/UUID, mã phiếu cũ
hoặc phân bổ trước khi phân tích liên kết. Thêm index `sales_payment` và tham
chiếu cũ; dùng GIN hiện có cho các phiếu phân bổ. Các nhánh loại trừ nhau nên
một phiếu không bị cộng hai lần. UUID trong phân bổ giữ cách diễn giải hiện
hành, gồm chữ hoa và dạng có dấu ngoặc.

`business_invoice_paid`, kiểm tra liên kết khi xoá và trigger bảo vệ hoá đơn
dùng cùng bộ lọc. `save_sales_order` cập nhật phiếu thu đã khóa bằng UPDATE,
tạo mới bằng INSERT; kiểm tra số tiền đã thu khi đổi cơ sở chỉ chạy khi cơ sở
thực sự đổi. Giữ nguyên API, quyền, tổng tiền, transaction và giới hạn timeout.
Hàm trợ giúp mới không được cấp EXECUTE cho anon/authenticated.

Frontend phân biệt timeout đã rollback với mất mạng chưa biết kết quả, giữ
thông báo đối chiếu thanh toán và khóa đồng bộ thao tác gửi form lặp. Xuất kho
tiếp tục được xử lý sau khi lưu như bản trước.

## Kiểm chứng

- Kiểm thử 11.000 đơn, 6.500 phiếu thu: 100 vòng tạo/tăng giá/giảm giá/xoá,
  tương đương 400 RPC; p95 104 ms, lớn nhất 219 ms trong lần chạy cùng các
  kiểm tra khác. PGlite một kết nối, chưa gồm HTTP hoặc cạnh tranh PostgreSQL
  nhiều kết nối.
- Đối chiếu tiền trước/sau cho khoản thu tự động, thủ công, phân bổ nhiều đơn,
  UUID/mã cũ, khoản đang chờ, loại trừ một phiếu và phiếu nhập hàng.
- Kiểm tra quyền, lỗi giữa transaction, hoàn tác schema, giữ nguyên dữ liệu
  liên quan; kiểm thử giá bán/giá vốn, báo cáo, tìm kiếm và kế toán đạt.
- Trình duyệt 1440px/375px: đổi dịch vụ/giá/số lượng, gửi form lặp chỉ một
  request, lỗi timeout/mạng giữ bản nháp, thử lại, mở lại đơn, xoá thất bại
  giữ phiếu và xoá thành công cập nhật danh sách. API giả, không ghi production.
- Build, ESLint các file thay đổi và `git diff --check` đạt.
- Đã kiểm tra migration trên production trong transaction ROLLBACK: quyền
  chặn gọi thiếu phiên và 18 mẫu bán hàng/nhập hàng có tiền thu khớp bản cũ.
- Đã áp dụng migration, xác minh chính xác 5 định nghĩa hàm và quyền; cấu hình
  timeout của các role giữ nguyên. Đo SELECT chỉ đọc trên PostgreSQL production:
  tính tiền đã thu giảm từ 395–694 ms xuống 7–28 ms qua 5 mẫu. Đây là thời gian
  truy vấn thanh toán, không phải thời gian hoàn thành một thao tác ghi.

## Phát hành và khôi phục

Checkout riêng dựa trên `923507c`, không gồm các thay đổi chấm công/đối tượng
còn dang dở ở workspace chính. Database được phát hành trước frontend qua
commit chứa bản sửa này. Migration không backfill dữ liệu lịch sử hoặc sửa
khoản thu thủ công; không thử ghi/xoá đơn khách hàng trên production.

`scripts/deploy-sales-operations.mjs` cung cấp backup, validate, apply, verify
và monitor. Bản sao định nghĩa/quyền và script khôi phục chính xác production
nằm tại `.build-verification/sales-operations/rollback-live.sql`. Bản rollback
schema theo repository nằm trong `supabase/rollback/202610240001_sales_payment_lookup_performance.sql`.
Hậu kiểm 30 phút lưu số lỗi theo SQLSTATE và số lần gọi/thời gian trung bình
của thao tác thực tế trong `.build-verification/sales-operations/monitor.json`;
không reset thống kê chung. Các artifact cục bộ được gitignore và không chứa token.
