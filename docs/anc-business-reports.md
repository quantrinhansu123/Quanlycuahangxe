# Cập nhật công nợ và báo cáo kinh doanh ANC

## Cách sử dụng

- **Thu chi:** khi tạo phiếu chi trả nhà cung cấp, chọn **Phiếu nhập đối trừ**; khi thu tiền khách, chọn **Đơn bán đối trừ**. Chọn **Hoàn thành** và quỹ tiền mặt/ngân hàng khi tiền đã thực nhận hoặc thực trả. Thanh toán từng phần tự giảm số còn nợ; sửa, hủy hoặc xóa thanh toán tính lại số dư. Phiếu tự động thể hiện phần còn lại của hóa đơn.
- **Nhập hàng:** danh sách hiển thị số đã thanh toán, còn nợ và trạng thái thanh toán. **+ Thêm hàng hóa** tạo mã dùng chung và chọn vào dòng đang nhập; số lượng và thông tin phiếu được giữ.
- **Bán hàng:** **+ Thêm khách hàng** và **+ Thêm hàng hóa / dịch vụ** tạo và chọn ngay trên phiếu. **Cơ sở chính** trong danh mục hàng hóa/dịch vụ có nghĩa dùng chung cho các cơ sở; nhập/xuất vẫn ghi theo cơ sở của phiếu bán.
- **Báo cáo kinh doanh → Tài chính tổng hợp:** chọn toàn hệ thống hoặc từng cơ sở và khoảng ngày. Có doanh thu, số xe, đã thu, giá vốn, lợi nhuận gộp/biên gộp, chi phí và lợi nhuận trước thuế/biên trước thuế. Ngày so với ngày trước; tháng/năm đầy đủ so với tháng/năm trước; khoảng tùy chọn so với khoảng liền trước cùng số ngày.
- Bấm tên sản phẩm trong **Giá vốn** để xem từng dòng bán. Admin nhập giá vốn trên dòng bị thiếu; giá trị xuất kho liên quan được cập nhật cùng trong giao dịch PostgreSQL. Các dòng có giá vốn 0/chưa nhập được chỉ rõ trên báo cáo.
- Bấm tên sản phẩm trong **Nhập – xuất – tồn** để mở các phiếu trong kỳ; bấm quỹ hoặc mã PT/PC để mở chứng từ và mã hóa đơn đối trừ.
- **Xuất Excel** tạo tám sheet: Tổng hợp, Công nợ, Giá vốn, Chi phí, Dòng tiền, Sổ thu chi, Nhập xuất tồn, Chi tiết kho.

## Quy tắc tính số liệu

Công nợ được tính đến cuối ngày kết thúc, kể cả hóa đơn phát sinh trước kỳ báo cáo. Chỉ chứng từ hoàn thành giảm nợ. Số đã thu trên KPI là thu từ các đơn phát sinh trong kỳ, theo ngày ghi nhận thu trong kỳ.

Doanh thu và giá vốn dùng chi tiết dòng bán. Giá vốn là giá vốn một đơn vị nhân số lượng. Lợi nhuận gộp = doanh thu − giá vốn; lợi nhuận trước thuế = lợi nhuận gộp − chi phí đã chi. Biên lợi nhuận chia cho doanh thu và bằng 0 nếu doanh thu bằng 0. Chi nhập hàng được loại khỏi chi phí vận hành để tránh tính trùng với giá vốn. Chi phí chưa chi nằm trong cột chờ chi; chưa được trừ vào lợi nhuận trước thuế theo quy tắc hiện tại.

Quỹ tiền mặt/ngân hàng chỉ cộng chứng từ hoàn thành vào dòng tiền thực tế. Chứng từ chờ thu/chi có cột riêng; chứng từ hủy và phiếu đã đối trừ không làm tăng dòng tiền. Sổ thu chi vẫn hiển thị các trạng thái để truy vết.

Số xe dùng khóa khách hàng duy nhất của các đơn trong kỳ (fallback tên khách/mã đơn nếu thiếu khóa), theo cách mô hình hiện tại quản lý hồ sơ khách và xe. Nếu nhiều xe dùng chung một hồ sơ khách, cần tách hồ sơ để số xe phản ánh đúng từng xe.

Danh mục sản phẩm dùng chung. Tồn kho từng cơ sở dùng các nhập/xuất tại cơ sở đó. `ds_san_pham.ton_dau_ky` cũ chỉ có giá trị toàn hệ thống, chưa có phân bổ cơ sở: báo cáo toàn hệ thống giữ nguyên; báo cáo cơ sở không sao chép cùng số tồn đầu sang từng cơ sở. Cần bổ sung dữ liệu phân bổ tồn đầu nếu cửa hàng có tồn trước khi bắt đầu ghi phiếu.

Chứng từ cũ chỉ được liên kết khi đã chứa UUID/mã hóa đơn chính xác. Phiếu chưa có mã đối trừ cần người dùng chọn đúng hóa đơn. Nhiều phiếu thu tự động cũ cùng một đơn được giữ nguyên để kiểm tra; không tự gộp/xóa. Giá vốn thiếu cần nhập dữ liệu thực tế; hệ thống không tự suy đoán giá vốn lịch sử.

## Cập nhật cơ sở dữ liệu

Đã áp dụng thành công ba migration bên dưới vào Supabase đang dùng ngày **11/10/2026**, trong một giao dịch và ghi nhận vào lịch sử migration. Đã sao lưu các trường thanh toán và phiếu nhập bị ảnh hưởng vào `.build-verification/anc-deployment-backup.json` trên máy local; bản sao này được Git bỏ qua. Số chứng từ, số dòng bán/kho, khách hàng, sản phẩm và tổng tiền thu/chi hoàn thành không đổi sau cập nhật. Các trigger bảo vệ quyền vẫn bật.

Khi cài trên một CSDL khác, áp dụng các migration cũ của repository trước, bao gồm bản nhập hàng/thanh toán, phân quyền cơ sở và view bảo vệ dữ liệu `the_ban_hang_visible` trong `202610100001_technician_customer_privacy.sql`. Sau đó chạy ba migration theo thứ tự:

1. `202610100003_purchase_payment_reconciliation.sql`
2. `202610100004_business_report_sources.sql`
3. `202610100005_sales_payment_reconciliation.sql`

Nếu chạy bằng SQL Editor, dùng `supabase/anc-business-reports.sql`: chứa đúng ba migration trên trong một giao dịch để lỗi ở bất kỳ phần nào sẽ rollback toàn bộ. Chạy file gộp hoặc chạy ba migration; không cần cả hai. Triển khai frontend cùng bản cập nhật CSDL vì báo cáo mới dùng view `business_order_headers`.

Migration bổ sung cột, view, index và trigger; cập nhật liên kết/trạng thái trên các chứng từ có tham chiếu xác định. Không xóa hóa đơn hay gộp chứng từ lịch sử. Quyền sửa thanh toán tại cơ sở được kiểm tra trong trigger; kỹ thuật viên không được sửa thanh toán liên kết đơn bán. View báo cáo tiếp tục đi qua view bảo vệ dữ liệu hiện có.

## Kiểm chứng

- `npm test`: toàn bộ bộ kiểm thử dữ liệu hiện có đã chạy qua.
- `npm run test:business-workflows`: tính số liệu, migration PostgreSQL/PGlite, thanh toán từng phần/đủ/vượt/hủy/xóa/khác cơ sở/không có quyền, chạy lại migration, đồng bộ lặp lại, lọc báo cáo với cache nguồn, xuất Excel, chi tiết kho và thêm mới giữ phiếu trên 1440px/375px.
- `npm run build`, `npm run typecheck`: chạy qua.
- Triển khai Supabase: cả ba migration được ghi nhận; không có lỗi liên kết nguồn đơn bán hoặc số dư phiếu nhập. API của view báo cáo, cột công nợ nhập hàng và nguồn thanh toán đều trả HTTP 200. Đối chiếu dữ liệu trước/sau và trạng thái trigger đã qua; kết quả rút gọn tại `docs/anc-deployment-validation.json`.
- Trước triển khai, chạy lại `node scripts/test-purchase-receipt.mjs` và `node --test scripts/test-technician-privacy.mjs`: qua, bao gồm migration với trigger bảo vệ quyền đã có và quyền truy cập báo cáo.
- ESLint các file TypeScript thay đổi: không có lỗi; còn hai cảnh báo hook trong `RevenueReportPage.tsx`. Lint toàn dự án còn lỗi có sẵn trong `ReportOrdersModal.tsx:22` (`react-hooks/set-state-in-effect`).
- Probe UI trên component thật ở 375/768/1024/1440px và kiểm tra ảnh: sửa kích thước bấm, tương phản chữ, định dạng phần trăm tiếng Việt và ghim cột đầu bảng. Các bảng tài chính giữ đủ cột số liệu và cuộn ngang trong khung trên điện thoại, có hướng dẫn vuốt; probe vẫn đánh dấu cột ngoài khung. Viền, thanh cuộn và vòng focus theo giao diện hiện có của dự án được giữ. Preview dùng fixture cục bộ, không phải dữ liệu Supabase thực tế.

Các kiểm thử nghiệp vụ tự động dùng PGlite hoặc API giả lập. Schema, API, số chứng từ và tổng thu/chi trên Supabase thực tế đã được kiểm tra sau triển khai. Chưa thử tạo/sửa chứng từ bằng phiên đăng nhập người dùng thực tế hoặc đo hiệu năng báo cáo trên toàn bộ dữ liệu triển khai. Local đang phục vụ tại `http://localhost:5173`; tải lại bằng Ctrl+F5 để thử luồng nhập hàng, thu chi và báo cáo với tài khoản của cửa hàng.
