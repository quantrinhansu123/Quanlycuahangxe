# Tối ưu tải ứng dụng — 18/10/2026

Đã rà soát đường tải chung và đo 22 màn hình bằng bản build thật, tài khoản được cấp và API production. So sánh JavaScript/payload theo số byte thực nhận, không suy diễn giảm byte thành mức tăng tốc cố định.

## Thay đổi đã thực hiện

1. Tách Excel khỏi đường tải ban đầu của 9 trang: khách hàng, bán hàng, chi tiết bán hàng, thu chi/sổ quỹ, kho, nhân sự, chấm công, dịch vụ và bảng lương. Nhập/xuất/tải mẫu mới tải thư viện; giữ nguyên nội dung Excel và báo lỗi khi tải thư viện thất bại.
2. Tách biểu đồ doanh thu khỏi tab báo cáo dạng bảng; tải Recharts khi mở phần biểu đồ. Giữ bộ lọc và snapshot giữa các tab.
3. Giữ MainLayout/Topbar khi chuyển route; ErrorBoundary chỉ reset phần nội dung. Bỏ exit transition giữ nhiều Outlet cùng lúc — regression test đã bắt trường hợp mount trang mới 3 lần. Giữ reset tìm kiếm toàn cục/scroll khi đổi trang và giữ riêng nhóm route báo cáo.
4. Progress bar dùng CSS, không tải Framer Motion hoặc tạo interval khi khởi động. MainLayout chỉ tải sau khi vào phần cần đăng nhập.
5. Font chỉ tải family đang chọn sau paint, thay stylesheet chặn render chứa cả 6 family. Các lựa chọn font vẫn dùng được.
6. Cấu hình chấm công chỉ tải khi có consumer. Trang chủ, khách hàng, kho... không phát sinh read cấu hình không liên quan.
7. Bán hàng, danh sách phụ tùng và kho không tải toàn bộ dịch vụ khi chỉ xem danh sách. Form tải danh mục khi mở; kiểm tra lập đơn cũ/mới, tham chiếu UUID/mã, chọn cơ sở và lỗi lưu.
8. Kho tách effect tải danh mục khỏi phân trang. Đổi trang/tìm kiếm không tải lại toàn bộ lịch sử tồn; chỉ mutation thành công mới refresh cảnh báo tồn. Memoize phép tính tồn, thêm deadline/hủy request và hiển thị lỗi server.
9. Dịch vụ bỏ effect bổ sung trang mặc định vào state vốn đã có fallback `?? 1`. Effect đó kích hoạt thêm một lượt fetch toàn bộ cơ sở. Thêm abort/request version và thông báo lỗi có retry.
10. Khách hàng hủy list/statistics cũ; phản hồi cũ không ghi đè kết quả mới. Tách lỗi server/timeout khỏi kết quả rỗng. Không thêm cache kết quả nghiệp vụ qua phiên/người dùng.
11. Bảng lương chấm công chạy các read độc lập song song: đơn giá, lương đã lưu, doanh số, chấm công. Giữ thứ tự áp dụng và công thức, bắt lỗi từng nguồn, hủy read doanh số/chấm công khi đổi kỳ hoặc rời trang. Không thay canonical Sales RPC dùng tính lương.
12. Cache một năm cho `/assets/` chứa tên file có hash. Không áp dụng immutable cho HTML hay API.
13. Gộp bản sửa treo do phiên Supabase Auth cũ và deadline đăng nhập từ [điều tra trước](../performance-login-attendance.md). Ứng dụng vẫn dùng `x-app-session` và kiểm tra quyền phía server.

Không sửa SQL hoặc thực hiện ghi dữ liệu nghiệp vụ production. Phiên đăng nhập kiểm tra riêng được thu hồi khi kết thúc.

## Số đo và cách hiểu

| Màn hình | JS ban đầu trước → sau | Dữ liệu API trước → sau |
| --- | ---: | ---: |
| Khách hàng | 1.260.356 → 796.937 B (−36,8%) | 46.627 → 45.926 B |
| Bán hàng | 1.273.689 → 810.039 B (−36,4%) | 953.244 → 332.738 B (−65,1%) |
| Chấm công | 1.208.246 → 744.183 B (−38,4%) | 46.733 → 46.733 B |
| Dịch vụ | 1.219.814 → 757.339 B (−37,9%) | 43.584 → 21.976 B (−49,6%) |
| Kho | 1.250.939 → 787.838 B (−37,0%) | 2.380.265 → 1.756.079 B (−26,2%) |
| Danh sách phụ tùng | 754.770 → 755.782 B | 628.438 → 8.274 B (−98,7%) |
| Báo cáo bảng | 1.217.933 → 816.653 B (−32,9%) | 69.221 → 71.826 B (LIVE data thay đổi) |

Giữ khung ứng dụng giảm notification reads khi chuyển qua 4 màn hình từ 4 xuống 1. Regression xác nhận phân trang kho không đọc lại lịch sử/danh mục và trang dịch vụ không còn vòng cập nhật trang mặc định gây fetch lặp. Cả 22 route LIVE kết thúc không có page error/alert/API ngoài HTTP 2xx.

Chi tiết từng route ở [metrics.json](metrics.json). Baseline là build local chụp trước đợt tối ưu này, đã có bản sửa treo phiên trước đó. Hai build đều dùng LIVE API, browser context mới và cùng tài khoản. Production tiếp tục có người sử dụng giữa các lượt, nên không coi đây là cùng snapshot database.

Các số thời gian là một lượt cold load/route, gồm network idle và cả request font bên ngoài. Chúng dao động theo mạng/CPU và có lượt sau chậm hơn trước; không dùng chúng để tuyên bố mọi màn hình nhanh hơn theo một tỷ lệ. Bằng chứng ổn định hơn là bỏ hẳn thư viện không dùng, giảm request/payload và kiểm tra hồi quy deterministic.

JavaScript trong báo cáo là byte của file minified sau giải nén, không phải dung lượng gzip truyền trên mạng. API bytes cũng là JSON sau giải nén. Phân trang có thể trả HTTP 206 hợp lệ.

## Kiểm tra

- `npm run test:project-load`: build/TypeScript/secret check; 6 ca UI bằng production build và 10 ca auth/network. API được mock trong regression, tách biệt với số đo LIVE.
- `npm test`: toàn bộ suite chấm công, khách hàng/bán hàng, phân trang, thu chi, báo cáo, mua hàng, query performance và phiên đăng nhập.
- `test-attendance-p1-ui.mjs`: 7 ca ảnh/history, phân trang, các ca chấm công và refresh.
- `test-reports-p3-ui.mjs`: 7 ca snapshot/tab/filter, xuất Excel và lỗi server.
- `test-report-charts-ui.mjs`: desktop/mobile, sáng/tối, đủ ngày, nhãn và giá trị lớn/nhiều series.
- `test-technician-privacy-ui.mjs`: 3 vai trò × 2 kích thước.
- `test-sales-order-branch-ui.mjs` và `test-customer-order-create-ui.mjs`: khóa cơ sở, customer/order reference, lặp thao tác, deferred customer và server rejection.
- ESLint các file TypeScript thay đổi: 0 errors; 4 hook warnings đã có ở các đoạn không sửa.
- Hai fixture UI được cập nhật để mock font CSS ngoài API, tiếp tục assert header phiên cho API. Fixture sales dùng UUID cố định để UUID ngẫu nhiên không vô tình chứa từ khóa tìm kiếm số; không giảm assertion nghiệp vụ.

Các thư viện Excel động được khai báo trước cho dependency optimizer khi chạy dev, tránh reload mất trạng thái khi phát hiện dependency muộn. Cấu hình này chỉ dành cho dev, theo [Vite dependency optimization](https://vite.dev/config/dep-optimization-options.html#optimizedeps-include).

## Giới hạn còn lại

- Đối soát/bảng lương vẫn phải đọc canonical Sales RPC và dòng chi tiết; kho vẫn cần lịch sử để tính tồn. Đây là các đường còn nhiều dữ liệu. Bước tối ưu sâu tiếp theo cần RPC trả aggregate/projection hẹp, đo execution plan/index và kiểm tra parity trên database; phiên ứng dụng được cấp không phải quyền quản trị PostgreSQL.
- Không cam kết thời gian phản hồi tối đa cho mọi mạng/Safari/thiết bị. Chưa chạy trên iPhone vật lý trong ảnh.
- Không kích hoạt gửi ZNS, tự ghi/sync lương hay thanh toán production trong phép đo. Luồng ghi được kiểm tra bằng fixture.
- Cache assets chỉ có hiệu lực trên hosting sau khi triển khai cấu hình mới; push Git không tự chứng minh deploy thành công.

## Chạy lại

`npm run test:project-load` để kiểm tra hồi quy. `PERF_VARIANT=after node scripts/measure-project-load.mjs` đo build hiện tại với LIVE reads; script cần phiên kiểm tra riêng trong thư mục gitignored hoặc biến môi trường tài khoản kiểm thử. Không đưa token/mật khẩu vào Git.
