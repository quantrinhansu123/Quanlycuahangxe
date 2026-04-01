# Kế hoạch Triển khai: Xem Chi Tiết KPI Nhân Sự Theo Ngày

## Overview
Dự án cần thêm một nút "Xem" (Eye icon) vào cột **Thao tác** trên bảng dữ liệu của trang Quản lý Nhân sự (`PersonnelManagementPage.tsx`). 
Khi click vào, hệ thống sẽ mở một Dialog/Modal hiển thị chi tiết các thông số của nhân viên đó **trong một ngày cụ thể** (mặc định là ngày hôm nay). Các thông số bao gồm:
- **Tổng đơn hàng:** Số phiếu bán hàng mà nhân sự đã phụ trách tạo/thực hiện trong ngày.
- **Doanh số:** Tổng tiền từ các phiếu bán hàng (và chi tiết dịch vụ) của nhân viên đó trong ngày.
- **Chấm công:** Lịch sử chấm công của ngày hôm đó (Giờ vào/ra, trạng thái đi làm).

## Project Type
**WEB** (Dashboards / Internal Tools)

## Success Criteria
- [ ] Bảng dữ liệu nhân sự có thêm nút "Xem" kế bên nút Sửa/Xóa.
- [ ] Click nút "Xem" sẽ mở Modal có chức năng chọn ngày (Date Picker), mặc định là ngày hiện tại.
- [ ] Modal gọi API lấy đúng danh sách và số lượng `thẻ bán hàng` của `nhan_vien_id` trong ngày được chọn.
- [ ] Modal tính tổng doanh số chính xác dựa trên danh sách hóa đơn trả về.
- [ ] Modal hiển thị trạng thái chấm công của nhân viên trong ngày đó (nếu có dữ liệu).

## Tech Stack
- **Frontend:** React, Tailwind CSS, Lucide-react (cho icon).
- **Backend/DB:** Supabase. Cần query: 
  - Bảng `the_ban_hang` (và `the_ban_hang_ct`) filter theo `nhan_vien_id` và `ngay`.
  - Bảng `cham_cong` (nếu có) filter theo `nhan_vien_id` và `ngay`.

## File Structure (Dự kiến)
```text
src/
  ├── components/
  │    └── modal/
  │         └── PersonnelDailyStatsModal.tsx   # [NEW] Cửa sổ popup hiển thị KPI theo ngày
  ├── pages/
  │    └── PersonnelManagementPage.tsx         # [MODIFY] Thêm nút "Xem" vào cột Action
  └── data/
       └── personnelStatsData.ts               # [NEW] Data Layer để fetch dữ liệu từ Supabase theo ID và Date
```

## Task Breakdown

### Task 1: Xây dựng Data Fetcher (Backend Logic)
- **Agent:** `backend-specialist` 
- **Skill:** `api-patterns`
- **Mô tả:** Tạo file `personnelStatsData.ts`. Viết hàm `getPersonnelDailyStats(personnelId, dateStr)`. 
  - Hàm này query Supabase bảng `the_ban_hang` (join bảng chi tiết nếu cần) dùng `.eq('nhan_vien_id', personnelId)` và `.eq('ngay', dateStr)`.
  - Nếu hệ thống có bảng chấm công, thực hiện truy vấn `.eq('nhan_vien_id', personnelId)` và `.eq('ngay', dateStr)` từ bảng `chấm công`.
- **INV→OUT→VER:** 
  - *Input:* ID nhân sự và Chuỗi ngày (`YYYY-MM-DD`).
  - *Output:* Object `{ orders: [], totalSales: number, attendance: any }`.
  - *Verify:* Test in dữ liệu thực trên console để đảm bảo kết quả tính ra khớp với ngày.

### Task 2: Giao diện Modal (Frontend UI)
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Mô tả:** Tạo component `PersonnelDailyStatsModal`. 
  - Thiết kế Header 1 ô DatePicker để người dùng có thể lùi ngày/tiến ngày.
  - Thiết kế 3 thẻ thống kê nhanh (Đơn hàng, Doanh số, Trạng thái chấm công).
  - Phía dưới hiển thị một bảng (hoặc danh sách dọc) tóm tắt các phiếu bán hàng mà người đó đã làm trong ngày.
- **INV→OUT→VER:**
  - *Input:* Props `isOpen`, `onClose`, `personnelId`, `personnelName`.
  - *Output:* Giao diện chuẩn, loading state rõ ràng khi đổi ngày.
  - *Verify:* Render không lỗi, các thẻ (Card) hiển thị số liệu nổi bật.

### Task 3: Tích hợp vào Bảng Nhân Sự
- **Agent:** `frontend-specialist`
- **Mô tả:** Sửa đổi `PersonnelManagementPage.tsx`. Nhúng icon `<Eye />` vào cột `Thao tác` của mỗi thẻ nhân viên. Tích hợp Component Modal ở Task 2 vào.
- **INV→OUT→VER:**
  - *Input:* File quản lý nhân sự hiện tại.
  - *Output:* Nút bấm hoạt động mượt mà, không giật lag.
  - *Verify:* Nhấp vào nhân viên nào thì Modal fetch đúng dữ liệu nhân viên đó vào khoảng thời gian hôm nay.

## Phase X: Verification
- [ ] **Data Query Audit:** Chắc chắn query theo `ngay` (Date) không bị lệch múi giờ.
- [ ] **Lint:** Check log và typescript strict rules.
- [ ] **UX Check:** Modal dễ nhìn, dễ đóng lại, layout reponsive cơ bản.

---
> Kế hoạch đã được cập nhật dựa trên phản hồi của bạn (Lấy theo NGÀY CỤ THỂ và đưa nút XEM vào màn Quản lý Nhân Sự).
