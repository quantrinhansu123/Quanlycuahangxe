# Cập nhật công nợ và báo cáo kinh doanh ANC

## Cách sử dụng

- **Thu chi:** khi tạo phiếu chi trả nhà cung cấp, chọn **Phiếu nhập đối trừ**; khi thu tiền khách, chọn **Đơn bán đối trừ**. Dùng **+ Thêm hóa đơn đối trừ** để một phiếu trả nhiều hóa đơn cùng cơ sở, nhập số tiền cho từng dòng sao cho tổng bằng số tiền phiếu. Chọn **Hoàn thành** và quỹ tiền mặt/ngân hàng khi tiền đã thực nhận hoặc thực trả. Thanh toán từng phần tự giảm số còn nợ; sửa, hủy hoặc xóa thanh toán tính lại số dư. Phiếu tự động thể hiện phần còn lại của hóa đơn; dòng tiền chỉ tính phiếu cha một lần.
- **Nhập hàng:** danh sách hiển thị số đã thanh toán, còn nợ và trạng thái thanh toán. **+ Thêm hàng hóa** tạo mã dùng chung và chọn vào dòng đang nhập; số lượng và thông tin phiếu được giữ.
- **Bán hàng:** **+ Thêm khách hàng** và **+ Thêm hàng hóa / dịch vụ** tạo và chọn ngay trên phiếu. **Cơ sở chính** trong danh mục hàng hóa/dịch vụ có nghĩa dùng chung cho các cơ sở; nhập/xuất vẫn ghi theo cơ sở của phiếu bán.
- **Báo cáo kinh doanh → Tài chính tổng hợp:** chọn toàn hệ thống hoặc từng cơ sở và khoảng ngày. Có doanh thu, số xe, đã thu, giá vốn, lợi nhuận gộp/biên gộp, chi phí và lợi nhuận trước thuế/biên trước thuế. Ngày so với ngày trước; tháng/năm đầy đủ so với tháng/năm trước; khoảng tùy chọn so với khoảng liền trước cùng số ngày.
- Bấm tên sản phẩm trong **Giá vốn** để xem từng dòng bán. Admin nhập giá vốn trên dòng bị thiếu; giá trị xuất kho liên quan được cập nhật cùng trong giao dịch PostgreSQL. Các dòng có giá vốn 0/chưa nhập được chỉ rõ trên báo cáo.
- Bấm tên sản phẩm trong **Nhập – xuất – tồn** để mở các phiếu trong kỳ; bấm quỹ hoặc mã PT/PC để mở chứng từ và mã hóa đơn đối trừ.
- Bấm ô **Kho / Công nợ / Chi phí / Giá vốn / Doanh thu / Lợi nhuận gộp / Lợi nhuận trước thuế / Dòng tiền** để xem chi tiết của mục đó. Các ô vẫn giữ số tổng theo kỳ và cơ sở đang lọc. Trong **Công nợ**, bấm mã khách hàng/nhà cung cấp để xem dư đầu kỳ, từng hóa đơn, từng thanh toán, số dư chạy và dư cuối kỳ; bấm mã PT/PC để xem phiếu gốc.
- **Chi lương:** phiếu chi nhóm **Lương** chọn mã nhân viên, kỳ lương và **Chi lương / Ứng trước lương**. Bảng lương cùng kỳ hiện **Đã nhận / Ứng trước / Còn phải trả**; bấm số tiền để xem chứng từ. Sửa/hủy phiếu sẽ tính lại các số này. Trạng thái duyệt bảng lương hiện có vẫn do quy trình bảng lương quản lý.
- **Chi phí trả trước:** trên phiếu chi riêng bật **Phân bổ chi phí theo tháng**, chọn tháng bắt đầu và số tháng. Ví dụ tiền thuê nhà 60 triệu cho 6 tháng: quỹ chi 60 triệu tại ngày trả, báo cáo chi phí nhận 10 triệu mỗi tháng. Bấm nhóm chi phí để xem ngày trả, tiền đã chi và phần chi phí trong kỳ.
- **Kho → Cảnh báo hàng sắp hết:** quản lý đặt ngưỡng theo mã hàng, ví dụ Dầu A = 10, phụ tùng = 5. Tồn hiện tại bằng hoặc thấp hơn ngưỡng sẽ cảnh báo; ngưỡng 0 tắt cảnh báo. Phần cảnh báo dùng cơ sở đang lọc và toàn bộ phiếu nhập/xuất đến hôm nay.
- **Xuất Excel** tạo mười sheet: Tổng hợp, Công nợ, Giá vốn, Chi phí, Dòng tiền, Sổ thu chi, Nhập xuất tồn, Chi tiết kho, Chi tiết công nợ, Phân bổ chi phí. Các ô được kẻ viền, tiêu đề nổi rõ, có bộ lọc; tiền là số, tỷ lệ là phần trăm và ngày có định dạng ngày Excel.

## Quy tắc tính số liệu

Công nợ được tính đến cuối ngày kết thúc, kể cả hóa đơn phát sinh trước kỳ báo cáo. Chỉ chứng từ hoàn thành giảm nợ. Số đã thu trên KPI là thu từ các đơn phát sinh trong kỳ, theo ngày ghi nhận thu trong kỳ.

Doanh thu và giá vốn dùng chi tiết dòng bán. Giá vốn là giá vốn một đơn vị nhân số lượng. Lợi nhuận gộp = doanh thu − giá vốn; lợi nhuận trước thuế = lợi nhuận gộp − chi phí được ghi nhận trong kỳ. Phiếu chi hoàn thành có phân bổ được chia đều tại ngày đầu mỗi tháng, phần lẻ vào tháng cuối; chi lương/ứng trước được ghi vào kỳ lương đã chọn. Phiếu cũ chưa đặt kỳ phân bổ tiếp tục nhận chi phí tại ngày chi. Biên lợi nhuận chia cho doanh thu và bằng 0 nếu doanh thu bằng 0. Chi nhập hàng được loại khỏi chi phí vận hành để tránh tính trùng với giá vốn. Chi phí chưa chi nằm trong cột chờ chi; chưa được trừ vào lợi nhuận trước thuế theo quy tắc hiện tại.

Quỹ tiền mặt/ngân hàng chỉ cộng chứng từ hoàn thành vào dòng tiền thực tế. Chứng từ chờ thu/chi có cột riêng; chứng từ hủy và phiếu đã đối trừ không làm tăng dòng tiền. Sổ thu chi vẫn hiển thị các trạng thái để truy vết.

Số xe dùng khóa khách hàng duy nhất của các đơn trong kỳ (fallback tên khách/mã đơn nếu thiếu khóa), theo cách mô hình hiện tại quản lý hồ sơ khách và xe. Nếu nhiều xe dùng chung một hồ sơ khách, cần tách hồ sơ để số xe phản ánh đúng từng xe.

Danh mục sản phẩm dùng chung. Tồn kho từng cơ sở dùng các nhập/xuất tại cơ sở đó. `ds_san_pham.ton_dau_ky` cũ chỉ có giá trị toàn hệ thống, chưa có phân bổ cơ sở: báo cáo toàn hệ thống giữ nguyên; báo cáo cơ sở không sao chép cùng số tồn đầu sang từng cơ sở. Cần bổ sung dữ liệu phân bổ tồn đầu nếu cửa hàng có tồn trước khi bắt đầu ghi phiếu.

Chứng từ cũ chỉ được liên kết khi đã chứa UUID/mã hóa đơn chính xác. Phiếu chưa có mã đối trừ cần người dùng chọn đúng hóa đơn. Nhiều phiếu thu tự động cũ cùng một đơn được giữ nguyên để kiểm tra; không tự gộp/xóa. Giá vốn thiếu cần nhập dữ liệu thực tế; hệ thống không tự suy đoán giá vốn lịch sử. Mã nhà cung cấp có thể nhập trên phiếu nhập; phiếu cũ chưa có mã được hiển thị rõ. Mã nhân viên, kỳ phân bổ và ngưỡng tồn của dữ liệu cũ cần người dùng chọn, không tự đoán theo tên.

## Cập nhật cơ sở dữ liệu

Đã áp dụng thành công ba migration bên dưới vào Supabase đang dùng ngày **11/10/2026**, trong một giao dịch và ghi nhận vào lịch sử migration. Đã sao lưu các trường thanh toán và phiếu nhập bị ảnh hưởng vào `.build-verification/anc-deployment-backup.json` trên máy local; bản sao này được Git bỏ qua. Số chứng từ, số dòng bán/kho, khách hàng, sản phẩm và tổng tiền thu/chi hoàn thành không đổi sau cập nhật. Các trigger bảo vệ quyền vẫn bật.

Khi cài trên một CSDL khác, áp dụng các migration cũ của repository trước, bao gồm bản nhập hàng/thanh toán, phân quyền cơ sở và view bảo vệ dữ liệu `the_ban_hang_visible` trong `202610100001_technician_customer_privacy.sql`. Sau đó chạy ba migration theo thứ tự:

1. `202610100003_purchase_payment_reconciliation.sql`
2. `202610100004_business_report_sources.sql`
3. `202610100005_sales_payment_reconciliation.sql`
4. `202610110001_anc_accounting_details.sql` — phần bổ sung theo ảnh viết tay: nhiều đối trừ, liên kết lương, phân bổ tháng, mã NCC, ngưỡng tồn và view truy vấn phiếu theo hóa đơn.

Nếu chạy bằng SQL Editor, dùng `supabase/anc-business-reports.sql` cho ba migration đầu trong một giao dịch. Sau đó chạy riêng migration thứ tư. Triển khai frontend cùng bản cập nhật CSDL vì giao diện mới dùng các cột/view/RPC bổ sung.

Migration bổ sung cột, view, index và trigger; cập nhật liên kết/trạng thái trên các chứng từ có tham chiếu xác định. Không xóa hóa đơn hay gộp chứng từ lịch sử. Quyền sửa thanh toán tại cơ sở được kiểm tra trong trigger; kỹ thuật viên không được sửa thanh toán liên kết đơn bán. View báo cáo tiếp tục đi qua view bảo vệ dữ liệu hiện có.

Migration thứ tư đã áp dụng ngày **12/10/2026** và ghi nhận lịch sử migration. Trước khi cập nhật đã sao lưu định nghĩa hàm/trigger/view vào `.build-verification/anc-details-schema-backup.json` (Git bỏ qua). Giao dịch triển khai đối chiếu số bản ghi, dấu kiểm dữ liệu cũ, tổng thu/chi hoàn thành và trạng thái bảo vệ quyền trước/sau; tất cả khớp. Bảy API cột/view mới trả HTTP 200; các trigger bảo vệ vẫn bật và không có lỗi số dư phiếu nhập. Hàm công nợ cũ được kiểm tra lại quyền gọi sau cập nhật.

## Kiểm chứng

- `npm test`: toàn bộ bộ kiểm thử dữ liệu hiện có đã chạy qua.
- `npm run test:business-workflows`: tính số liệu, migration PostgreSQL/PGlite, thanh toán từng phần/đủ/vượt/hủy/xóa/khác cơ sở/không có quyền, chạy lại migration, đồng bộ lặp lại, lọc báo cáo với cache nguồn, xuất Excel, chi tiết kho và thêm mới giữ phiếu trên 1440px/375px.
- `npm run build`, `npm run typecheck`: chạy qua.
- `npm run test:anc-accounting`: kiểm tra phần bổ sung bằng PostgreSQL/PGlite và component thật với API fixture cục bộ; bao gồm thanh toán nhiều hóa đơn, chặn trả vượt/khác cơ sở, hủy/xóa tính lại số dư, lương/ứng trước, chi phí 60 triệu trong 6 tháng, bảng Excel có viền và thao tác trên 1440px/375px. Kết quả triển khai bổ sung được ghi riêng tại `docs/anc-accounting-validation.json`.
- Triển khai Supabase: cả ba migration được ghi nhận; không có lỗi liên kết nguồn đơn bán hoặc số dư phiếu nhập. API của view báo cáo, cột công nợ nhập hàng và nguồn thanh toán đều trả HTTP 200. Đối chiếu dữ liệu trước/sau và trạng thái trigger đã qua; kết quả rút gọn tại `docs/anc-deployment-validation.json`.
- Trước triển khai, chạy lại `node scripts/test-purchase-receipt.mjs` và `node --test scripts/test-technician-privacy.mjs`: qua, bao gồm migration với trigger bảo vệ quyền đã có và quyền truy cập báo cáo.
- ESLint các file TypeScript thay đổi: không có lỗi; còn hai cảnh báo hook trong `RevenueReportPage.tsx`. Lint toàn dự án còn lỗi có sẵn trong `ReportOrdersModal.tsx:22` (`react-hooks/set-state-in-effect`).
- Probe UI trên component thật ở 375/768/1024/1440px và kiểm tra ảnh: sửa kích thước bấm, tương phản chữ, định dạng phần trăm tiếng Việt và ghim cột đầu bảng. Các bảng tài chính giữ đủ cột số liệu và cuộn ngang trong khung trên điện thoại, có hướng dẫn vuốt; probe vẫn đánh dấu cột ngoài khung. Viền, thanh cuộn và vòng focus theo giao diện hiện có của dự án được giữ. Preview dùng fixture cục bộ, không phải dữ liệu Supabase thực tế.

Các kiểm thử nghiệp vụ tự động dùng PGlite hoặc API giả lập. Schema, API, số chứng từ và tổng thu/chi trên Supabase thực tế đã được kiểm tra sau triển khai. Chưa thử tạo/sửa chứng từ bằng phiên đăng nhập người dùng thực tế hoặc đo hiệu năng báo cáo trên toàn bộ dữ liệu triển khai. Local đang phục vụ tại `http://localhost:5173`; tải lại bằng Ctrl+F5 để thử luồng nhập hàng, thu chi và báo cáo với tài khoản của cửa hàng.
