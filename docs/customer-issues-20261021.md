# Kiểm tra hai mật khẩu và báo cáo sản phẩm — 21/10/2026

**Trạng thái cuối:** đã áp dụng migration trên Supabase và triển khai hai bản
sửa ứng dụng (`5c01683`, `4bb2478`) lên production. Đã kiểm chứng trực tiếp
đổi mật khẩu, thu hồi phiên và trang đăng nhập. Phần chẩn đoán bên dưới ghi
nhận dữ liệu tại thời điểm kiểm tra ban đầu.

## Kết quả đối chiếu production (chỉ đọc)

Đọc định nghĩa RPC, trigger, dữ liệu nhân sự, phiên đăng nhập, các khóa ngoại
và chi tiết bán hàng bằng Supabase Management API trong `BEGIN READ ONLY`.
Không chạy đăng nhập thật, đổi mật khẩu, sửa giá vốn hay gộp/xóa hồ sơ.
Chứng cứ cục bộ: `D:/xe/customer-issues-20261021/`.
Không ghi mật khẩu, token phiên hay số điện thoại đầy đủ vào báo cáo.

### Hai mật khẩu

Số điện thoại đuôi **9866** có hai hồ sơ **Văn Nam**, cùng vị trí Quản lý,
cùng Cơ sở Bắc Ninh, nhưng mật khẩu khác nhau:

| Hồ sơ (đầu UUID) | Lần cập nhật hồ sơ | Phiên còn hiệu lực khi kiểm tra | Phiếu lương tham chiếu |
| --- | --- | ---: | ---: |
| `91c46df1…` | 16/10/2026 | 2 | 2 |
| `00000000…95da9a5b` | 05/06/2026 | 91 | 4 |

Cả hai đều có đăng nhập ngày 21/10. Ngày cập nhật không chứng minh hồ sơ nào
là hồ sơ chính. Hồ sơ thứ hai còn có tham chiếu từ chiến dịch ZNS, thông báo,
lịch sử lương và chấm công. Không được chọn bản ghi chính chỉ theo ngày sửa,
gộp tùy ý hoặc xóa một hồ sơ: các khóa ngoại có cả `ON DELETE CASCADE`.

Luồng: form Nhân sự → `upsertPersonnel` → bảng `nhan_su`.
Đăng nhập: `LoginPage.callPhoneLoginRpc` → `login_with_phone` →
`WHERE trim(ns.sdt) = trim(p_sdt) AND ns.password = p_password LIMIT 1` →
`app_sessions`. Do lọc mật khẩu trước khi xác định một hồ sơ duy nhất, mỗi
mật khẩu chọn một hồ sơ khác nhau. Production cũng chưa có trigger thu hồi
phiên khi đổi mật khẩu.

### Giá nhập, doanh thu và lợi nhuận

Luồng: danh mục `dich_vu.gia_nhap` → lưu vào `the_ban_hang_ct.gia_von` khi
lập đơn → `fetchAllCTRecords` → `lineRevenue` / `lineCost` → tổng hợp báo cáo
→ bảng Sản phẩm / Dịch vụ. Báo cáo dùng giá vốn đã lưu trên từng dòng đơn,
không lấy giá nhập hiện tại để viết lại lịch sử bán hàng.

- Doanh thu = thành tiền đã lưu; nếu thiếu thì lấy giá bán × số lượng.
- Tổng giá vốn = giá vốn mỗi đơn vị × số lượng.
- Lợi nhuận gộp = doanh thu − tổng giá vốn. Chi phí hoạt động được tính riêng
  trong phần báo cáo kinh doanh/lợi nhuận trước thuế.

Các phép trừ trong ảnh đúng: 1.140.000 − 390.000 = 750.000;
980.000 − 760.000 = 220.000; 960.000 − 90.000 = 870.000 đồng.
Khoảng 18–20/10, dữ liệu lúc kiểm tra có **371 dòng**, trong đó **192 dòng có
giá vốn bằng 0 hoặc NULL**. Tổng doanh thu 76.799.000 đồng, giá vốn
12.246.000 đồng. Dữ liệu có thể thay đổi sau thời điểm chụp ảnh.

Ví dụ Làm Máy, Làm côn và Lốp sau Sh đều có giá vốn đơn bằng 0; danh mục
tương ứng lúc kiểm tra cũng bằng 0. Dịch vụ thuần công có thể hợp lệ với giá
vốn bằng 0, nên không coi toàn bộ 192 dòng là dữ liệu sai. Những dòng thực tế
có giá nhập cần được đối chiếu và cập nhật giá vốn từng đơn bằng chức năng
sẵn có. Không tự điền giá nhập hiện tại cho đơn cũ hoặc sửa công thức đang đúng.

## Bản sửa trong repository

Migration `202610210001_phone_login_integrity.sql`:

- Chuẩn hóa định dạng số điện thoại, tìm hồ sơ trước khi so mật khẩu.
- Báo rõ số điện thoại có nhiều hồ sơ; không tự chọn hồ sơ bằng mật khẩu.
- Chặn tạo thêm số trùng, kể cả khác định dạng; khóa giao dịch theo số điện
  thoại để tuần tự hóa các lần ghi đồng thời.
- Thu hồi phiên của hồ sơ khi mật khẩu/số điện thoại đăng nhập thay đổi.
- Khóa dòng trong lúc tạo phiên để đổi mật khẩu không bỏ sót phiên được tạo
  bởi yêu cầu đăng nhập đang chạy.

`upsertPersonnel` không được bỏ trường mật khẩu/SĐT khi database thiếu cột
rồi báo lưu thành công. Bỏ log chứa toàn bộ payload nhân sự để không ghi
mật khẩu vào console.

## Triển khai và giới hạn

Người dùng đã xác nhận giữ đăng nhập hồ sơ tạo ngày 16/10 và áp dụng giá vốn
hiện tại cho 82 dòng đã liệt kê (tổng dự kiến 443.000 đồng). Đã sao lưu hồ sơ,
phiên, định nghĩa hàm và dòng bán/xuất kho trong các bảng
`app_private.issue_20261021_*`, bật RLS và thu hồi quyền PUBLIC/anon/authenticated.

Đã áp dụng `202610210001_phone_login_integrity.sql`. Hồ sơ còn lại chỉ được
đặt `password = NULL`; giữ nguyên SĐT liên hệ, hai UUID nhân sự và toàn bộ
lịch sử. Sau xử lý vẫn có đủ 6 phiếu lương tham chiếu hai hồ sơ. Mật khẩu của
hồ sơ giữ đăng nhập không thay đổi, phiên cũ của hồ sơ ngừng đăng nhập đều
đã bị thu hồi. RPC chỉ xét hồ sơ có mật khẩu, không tính hồ sơ đã tắt đăng nhập
là một tài khoản trùng đang hoạt động.

Đã kiểm thử trực tiếp trên PostgreSQL production trong giao dịch ROLLBACK:
mật khẩu cũ bị từ chối, mật khẩu đang dùng đăng nhập được, hai lần đổi liên
tiếp đều chặn mật khẩu/phiên trước và chấp nhận mật khẩu/phiên mới. Các thay
đổi mật khẩu và phiên dùng để kiểm thử đều được hoàn tác.

Đã sửa luồng mở/lưu đơn để giữ giá bán, giá vốn, chi phí và tổng tiền của
các dòng đã lưu; giá danh mục chỉ dùng cho mặt hàng mới. Chọn dịch vụ có giá
bằng 0 cũng không còn giữ nhầm giá của dịch vụ chọn trước. Bản sửa được kiểm
thử tự động và trên trình duyệt ở 1440px/375px, build đạt và đã triển khai.

Đã cập nhật **81 dòng**, tăng giá vốn **433.000 đồng** và giảm lợi nhuận gộp
tương ứng; doanh thu không đổi. Một dòng Chân van đã được người dùng sửa đơn
trong lúc xử lý, nên UUID cũ không còn; dòng thay thế cùng đơn đã có đúng giá
vốn 10.000 đồng. Không tạo lại dòng đã xóa. Như vậy cả 82 mặt hàng trong danh
sách duyệt đều đã có giá vốn đúng theo xác nhận. Kiểm tra 81 dòng xuất kho
liên quan không có chênh lệch giá vốn với chi tiết đơn.

Giá vốn lịch sử cần thông tin giá nhập thực tế từ người quản lý. Không suy
ra được giá đúng chỉ từ ảnh hoặc danh mục hiện tại.

Danh sách từng dòng để đối chiếu: `D:/xe/customer-issues-20261021/zero-cost-review.csv`
(UTF-8, mở được bằng Excel), được xuất lại sau khi xử lý. Ban đầu có 80/192
dòng khớp tên/cơ sở với giá nhập dương trong danh mục; dữ liệu tiếp tục thay
đổi và danh sách được duyệt sau đó gồm 82 dòng. Các mặt hàng chưa có giá nhập
thực tế vẫn cần người quản lý nhập giá đúng; không tự đặt giá cho phần còn thiếu.

## Kiểm chứng

- `npm run test:phone-login`: PostgreSQL cục bộ (PGlite + pgcrypto), tái hiện
  hai mật khẩu, chặn số trùng, lặp đổi mật khẩu, thu hồi phiên, giữ quyền RPC
  và chặn truy cập trực tiếp bảng phiên; kiểm thử lớp lưu nhân sự và phiên.
- `node --test scripts/test-report-line-amounts.mjs scripts/test-business-report.mjs scripts/test-report-order-details.mjs`:
  kiểm tra thống nhất báo cáo tổng, sản phẩm, ngày, cơ sở, nhân sự và chi tiết,
  gồm các số liệu trong ảnh, số lượng > 1, giá sửa tay và dòng miễn phí.
- `npm run typecheck`.
- `node scripts/test-auth-session-ui.mjs`: trình duyệt dùng phản hồi API giả,
  kiểm tra phiên bị thu hồi, lỗi máy chủ/mạng và phản hồi cũ sau đăng nhập mới.

Kiểm thử PostgreSQL chạy trong một kết nối PGlite, chưa đo cạnh tranh nhiều
kết nối trên PostgreSQL production. Không có thao tác ghi production trong
các bài kiểm thử.

Kết quả: 8 kiểm thử đăng nhập/lưu nhân sự, 6 kiểm thử phiên, 23 kiểm thử báo
cáo và 23 tình huống trình duyệt đạt; typecheck và `git diff --check` đạt.
Lần chạy trình duyệt đầu timeout khi tải trang kiểm thử cục bộ; lần chẩn đoán
và chạy lại toàn bộ đều đạt, không thay đổi mã ứng dụng hay tăng timeout.
