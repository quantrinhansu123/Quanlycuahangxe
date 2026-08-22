# Kế hoạch: Trang "Báo cáo đánh giá" (ZNS)

Vị trí: tab thứ 3 trong `/zns/gui-hang-loat` (`src/pages/ZnsBulkSendPage.tsx`), hiện là card
disabled "Báo cáo đánh giá — Sẽ cập nhật sau" (dòng 655-667).

## 1. Bối cảnh dữ liệu hiện có

Không cần bảng mới — dữ liệu đã đủ, chỉ cần tổng hợp:

- `zns_chien_dich` — chiến dịch gửi (`template_id`, `template_ten`, `tong_so_nguoi_nhan`,
  `so_luong_thanh_cong`, `so_luong_that_bai`, `created_at`).
- `zns_gui_log` — log từng người nhận (`khach_hang_id`, `so_dien_thoai`, `trang_thai`).
- `zns_danh_gia` — phản hồi đánh giá của khách (`rate` 1-5, `nhan_xet_nhanh` (tags),
  `ghi_chu`, `thoi_diem_danh_gia`, `nguon`, liên kết `chien_dich_id`, `khach_hang_id`, `gui_log_id`).
- Đã có `src/data/znsRatingData.ts` (`listRatings`) và trang thô `ZnsRatingPage`
  (`/zns/danh-gia`) hiển thị danh sách đánh giá + điểm TB + tổng số. Trang báo cáo mới
  **không thay thế** trang đó — nó là lớp phân tích/tổng hợp cao hơn (biểu đồ, xu hướng,
  so sánh theo cơ sở/mẫu, danh sách cảnh báo điểm thấp cần theo dõi).
- Cơ sở (chi nhánh) của khách hàng suy ra từ `khach_hang.dia_chi_hien_tai` qua
  `resolveCustomerBranch()` (`src/constants/customerBranches.ts`) — không có cột cơ sở
  trực tiếp trên `zns_danh_gia`/`zns_gui_log`, nên phải join qua `khach_hang`.
- Không có liên kết đánh giá → nhân viên/kỹ thuật viên phụ trách đơn hàng trong schema
  hiện tại, nên **không** làm breakdown "theo nhân viên" ở bản đầu (ghi chú làm sau nếu
  có nhu cầu, cần thêm cột liên kết đơn hàng/nhân viên vào `zns_gui_log` hoặc `zns_danh_gia`).
- Thư viện biểu đồ dùng chung của dự án: `recharts` (đã dùng ở `RevenueReportPage.tsx`,
  `FinancialCharts.tsx`) — tái dùng để đồng bộ phong cách, không thêm thư viện mới.

## 2. Mục tiêu trang báo cáo

Trả lời nhanh 3 câu hỏi cho quản lý:
1. Khách hàng đang hài lòng ở mức nào, xu hướng đang tăng hay giảm?
2. Chiến dịch/mẫu nào, cơ sở nào có tỷ lệ phản hồi và điểm số tốt/kém?
3. Có khách nào đánh giá thấp (1-2 sao) cần liên hệ chăm sóc lại ngay không?

## 3. Bố cục UI (từ trên xuống)

1. **Bộ lọc chung**: khoảng thời gian (từ ngày–đến ngày, mặc định 30 ngày gần nhất,
   dùng lại `DateInputVi`), lọc theo cơ sở (`CUSTOMER_BRANCH_OPTIONS`), lọc theo
   chiến dịch/mẫu ZNS (`SearchableSelect`, tái dùng cách làm ở `ZnsRatingPage`).
2. **Hàng thẻ KPI** (4 thẻ, kiểu card giống `ZnsRatingPage`/`RevenueReportPage`):
   - Điểm trung bình (X.X/5) + so với kỳ trước (▲/▼ %).
   - Tổng số đánh giá nhận được trong kỳ.
   - Tỷ lệ phản hồi = số đánh giá / số tin gửi thành công (`thanh_cong`) trong kỳ.
   - Số đánh giá 1-2 sao cần theo dõi (badge cảnh báo màu đỏ/cam).
3. **Biểu đồ phân bố sao** (bar chart 1→5 sao, số lượng mỗi mức) — recharts `BarChart`.
4. **Biểu đồ xu hướng theo thời gian** (line/area chart: điểm trung bình theo ngày/tuần
   trong khoảng lọc) — recharts `LineChart`, giống trục thời gian ở `RevenueReportPage`.
5. **Bảng so sánh theo cơ sở** (mỗi dòng 1 cơ sở: số đánh giá, điểm TB, tỷ lệ phản hồi).
6. **Bảng so sánh theo chiến dịch/mẫu ZNS** (mỗi dòng 1 chiến dịch: số gửi, số phản hồi,
   tỷ lệ phản hồi, điểm TB) — click để mở rộng xem chi tiết (tái dùng mẫu expand/collapse
   đã có ở lịch sử chiến dịch trong `ZnsBulkSendPage`).
7. **Nhận xét nhanh phổ biến** (tag cloud/list đếm tần suất `nhan_xet_nhanh`, sắp theo
   số lần xuất hiện giảm dần) — giúp thấy nhanh vấn đề lặp lại (vd "chờ lâu", "giá cao").
8. **Danh sách cảnh báo — đánh giá thấp cần theo dõi** (1-2 sao, sắp mới nhất trước,
   hiện tên KH, SĐT, ghi chú, nhận xét nhanh, thời điểm) — mỗi dòng có link/gợi ý xem
   hồ sơ khách hàng nếu có route sẵn.
9. (Tuỳ chọn, có thể để phiên bản sau) Nút "Xuất báo cáo" (CSV) cho bảng chiến tiêu/cơ sở.

## 4. Kế hoạch kỹ thuật

### 4.1 Data layer
- Thêm hàm tổng hợp trong `src/data/znsRatingData.ts` (hoặc file mới
  `znsRatingReportData.ts` nếu muốn tách biệt khỏi CRUD thô):
  - `listRatingsForReport(filter: { fromDate, toDate })` — có thể tái dùng `listRatings()`
    hiện có rồi lọc/group ở client (dữ liệu ZNS rating khối lượng nhỏ, không cần thêm
    RPC) — ưu tiên cách này trước để tránh phình schema.
  - Cần thêm field `khach_hang.dia_chi_hien_tai` vào select của `listRatings()` (hiện
    chỉ select `ho_va_ten, so_dien_thoai`) để tính được cơ sở.
  - Cần số tin gửi thành công theo chiến dịch để tính tỷ lệ phản hồi — đã có sẵn trong
    `zns_chien_dich.so_luong_thanh_cong` (từ `listCampaigns()` trong `znsData.ts`), ghép
    theo `chien_dich_id`.
- Tất cả tính toán (group theo ngày, theo cơ sở, theo chiến dịch, đếm tag, lọc 1-2 sao)
  làm bằng `useMemo` phía client, giống cách `ZnsRatingPage`/`ZnsBulkSendPage` đang làm —
  không cần Edge Function mới, không cần bảng/migration mới.

### 4.2 UI component
- Tạo component mới `src/components/zns/ZnsRatingReportPanel.tsx` (theo mẫu
  `OrderMessageApprovalPanel.tsx` đã tách riêng cho tab "Duyệt tin nhắn").
- Trong `ZnsBulkSendPage.tsx`:
  - Bỏ `disabled` ở card "Báo cáo đánh giá" (dòng 655-667), thêm vào `activeTab` union
    thêm giá trị `'rating-report'`, thêm `onClick` như 2 tab kia.
  - Render `<ZnsRatingReportPanel />` khi `activeTab === 'rating-report'`.
- Biểu đồ dùng `recharts` (đã có trong `package.json`), theme màu tái dùng token có sẵn
  (`text-foreground`, `bg-card`, `border-border`...) để tự động theo dark/light mode.

### 4.3 Việc không làm ở bản đầu (out of scope)
- Không thêm breakdown theo nhân viên/kỹ thuật viên (thiếu liên kết trong schema).
- Không thêm xuất PDF/Excel (chỉ CSV nếu có thời gian, không bắt buộc).
- Không đổi trang `/zns/danh-gia` hiện tại — giữ nguyên làm nơi xem/lọc từng đánh giá thô.

## 5. Thứ tự triển khai đề xuất

1. Mở rộng `listRatings()` để lấy thêm `dia_chi_hien_tai` của khách hàng.
2. Viết các hàm tổng hợp thuần (group theo ngày/cơ sở/chiến dịch, đếm tag, tính KPI)
   — có thể viết dạng hàm helper thuần TypeScript, dễ test độc lập.
3. Dựng `ZnsRatingReportPanel.tsx`: bộ lọc → KPI cards → 2 biểu đồ → 2 bảng so sánh
   → tag list → danh sách cảnh báo.
4. Gắn vào `ZnsBulkSendPage.tsx` (bỏ disabled, thêm tab).
5. Test thủ công trên trình duyệt: dữ liệu rỗng, dữ liệu có nhiều chiến dịch/cơ sở,
   responsive mobile, dark mode.

## 6. Câu hỏi cần xác nhận với người dùng trước khi code

- Khoảng thời gian mặc định khi mở trang: 30 ngày hay "tất cả"?
- Ngưỡng "đánh giá thấp cần theo dõi" là ≤2 sao hay có thể chỉnh?
- Có cần nút xuất CSV ngay ở bản đầu không, hay để sau?
