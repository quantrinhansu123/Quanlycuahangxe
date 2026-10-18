# Kiểm tra quay chờ đăng nhập và bảng chấm công — 18/10/2026

## Phạm vi và bằng chứng

- Video dài 38,47 giây: `/nhan-su/bang-cham-cong`, bộ lọc tháng 9/2026, bảng hiển thị “Đang tải dữ liệu...” xuyên suốt video.
- Đã đăng nhập bằng tài khoản người dùng cung cấp trong một browser context riêng; đọc dữ liệu thật trên `https://quanlycuahangxe.vercel.app`.
- Đăng nhập → đổi trang: **329 ms**. Ba lượt tải lại trang chấm công cùng tháng: **2479 / 2802 / 2623 ms**, gồm tải trang, kiểm tra phiên, API, render và chờ network idle của Playwright.
- Dataset lúc kiểm tra: 286 lượt chấm công, 12 nhân sự. Attendance list khoảng **91.560 bytes**; danh sách nhân sự khoảng **5.266 bytes**. API của các lượt UI thành công trong khoảng 0,15–0,41 giây/request.
- Các phép đo này không tái hiện được tình trạng 38 giây trên thiết bị của người dùng. Không kết luận PostgreSQL luôn nhanh hoặc đã xác định chính xác trạng thái Safari trong ảnh.

## Cơ chế gây treo đã tái hiện

Luồng thực tế: `LoginPage` / `AuthProvider` / `AttendanceManagementPage` → data layer → Supabase client → `_getAccessToken()` → `supabase.auth.getSession()` → khôi phục/làm mới phiên Supabase Auth → mới gửi REST/RPC.

Ứng dụng dùng `login_with_phone` và header `x-app-session`; không dùng Supabase Auth để đăng nhập. Tuy nhiên client mặc định vẫn khởi tạo Supabase Auth, đọc phiên SDK cũ từ localStorage và chờ lock/refresh trước mọi request.

Trong phép thử có kiểm soát với một phiên SDK đã hết hạn và refresh không trả về, nút đăng nhập giữ “Đang đăng nhập...”, có 1 refresh Auth nhưng **0 RPC đăng nhập được gửi đến network**. Đây là điểm nghẽn trước fetch, nên tăng timeout SQL không giải quyết được. Phép thử này chứng minh cơ chế treo, không chứng minh trình duyệt trong video có đúng phiên SDK đó.

Ngoài ra, RPC đăng nhập, kiểm tra phiên, lookup nhân sự, danh sách nhân sự và cấu hình chấm công trước đây không có deadline; một fetch không kết thúc có thể giữ loading/pending vô hạn.

## Thay đổi

- Client dùng `accessToken: async () => null`: SDK dùng anon key như trước, bỏ khởi tạo/lock/refresh của Supabase Auth. Header `x-app-session` vẫn lấy tại thời điểm gửi request; quyền dữ liệu vẫn được server kiểm tra.
- Đặt deadline 20 giây cho các request chưa được giới hạn. Dùng lại `readRequest` hiện có cho các read; không tăng timeout hiện có của attendance/query.
- Đăng nhập có AbortController, hủy khi rời trang, chặn submit đồng thời, báo riêng timeout. Không tự gửi lại đăng nhập khi mất mạng.
- Lỗi đọc hồ sơ/kiểm tra phiên không bị đổi thành tài khoản không tồn tại và không xóa phiên đang lưu. Lỗi danh sách nhân sự không thành danh sách rỗng.
- Cấu hình chấm công giữ fallback mặc định hiện có khi read lỗi; request bị treo cũng kết thúc và pending được giải phóng.

Không thay đổi SQL, công thức tính công hoặc dữ liệu nghiệp vụ production. Hai lần đăng nhập kiểm tra tạo hai phiên ứng dụng riêng, được thu hồi khi hoàn tất.

## Kiểm tra

Đã chạy thành công:

- `npm run build` (gồm TypeScript và kiểm tra secret frontend), `npm test`, ESLint cho 4 file nguồn sửa.
- `npm run test:auth-performance`: 10 ca, dùng client, LoginPage, AuthProvider và data layer thật, API mock. Bao gồm phiên SDK hết hạn với refresh treo, desktop/mobile, reload, read đồng thời, deduplicate personnel, lỗi 503/sai mật khẩu, deadline, submit trùng và retry thủ công.
- `node scripts/test-auth-session-ui.mjs`: 23 ca, gồm lỗi server/network, token không hợp lệ và response cũ không ghi đè phiên mới.
- `node scripts/test-attendance-p1-ui.mjs`: 7 ca, gồm tổng công, phân trang, ảnh/lịch sử tải theo yêu cầu và request cũ bị hủy.
- `node scripts/test-technician-privacy-ui.mjs`: kỹ thuật viên/quản lý/admin trên desktop và mobile; header phiên và bảo vệ dữ liệu vẫn hoạt động.

Bản build local kết nối API production, cố tình lưu phiên Supabase Auth cũ và làm refresh treo: đăng nhập **481 ms**, bảng chấm công desktop **4073 / 2488 / 2372 ms**, mobile **4538 / 3375 / 2909 ms**. Có sample cold; không loại bỏ. Mobile không gửi refresh Auth nào. Tổng công **100,5**, đi muộn **1h25p**, nghỉ **172 buổi**, 286 lượt chấm công khớp baseline ở cả 6 lượt. Không có lỗi API/page trong các lượt này.

Đây là kiểm tra chống treo và bảo toàn kết quả. Thời gian tải bình thường giữa production và local bị ảnh hưởng bởi mạng, cold load và môi trường chạy; không dùng các số này để tuyên bố tốc độ luôn tăng theo một tỷ lệ. Chưa kiểm tra trên Safari vật lý hoặc mạng của thiết bị trong video. Số liệu không chứa token/payload cá nhân: [performance-login-attendance.json](performance-login-attendance.json).

Artifacts chi tiết của lần điều tra nằm trong `.build-verification/lag-investigation/` và `.build-verification/app-session-performance/` (gitignored); không commit mật khẩu, token, ảnh hoặc payload cá nhân.

## Triển khai

Bản sửa được gộp trong đợt [tối ưu tải toàn dự án](performance-project-load/BAO-CAO.md). Xem báo cáo đó và trạng thái Git/deploy của đợt bàn giao mới nhất.
