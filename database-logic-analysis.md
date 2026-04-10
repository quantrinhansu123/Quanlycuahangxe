# Phân tích Logic Database - Quản lý Cửa hàng Xe

Kế hoạch phân tích và tài liệu hóa mối quan hệ giữa các trường trong cơ sở dữ liệu.

## 1. Tổng quan (Overview)
Hệ thống sử dụng Supabase (PostgreSQL) để quản lý luồng dữ liệu từ Khách hàng -> Dịch vụ -> Tài chính. Việc hiểu rõ logic giữa các trường giúp đảm bảo tính toàn vẹn dữ liệu khi thực hiện các phép tính doanh thu và lợi nhuận.

## 2. Loại dự án: WEB

## Success Criteria
- [x] Xác định rõ các khóa ngoại (Foreign Keys) và mối quan hệ.
- [x] Tài liệu hóa các trường tính toán tự động (Generated Columns).
- [ ] Làm rõ luồng dữ liệu từ Thẻ bán hàng sang Thu chi (Tài chính).

## 3. Phân tích chi tiết các bảng

### A. Core Entities
1. **khach_hang**: Lưu thông tin khách, biển số xe, và nhắc lịch bảo trì (`ngay_thay_dau`, `so_km`).
2. **nhan_su**: Quản lý kỹ thuật viên và nhân viên.

### B. Transactional Entities
1. **the_ban_hang (Master)**: 
    - Liên kết `khach_hang_id`, `nhan_vien_id`.
    - Quản lý trạng thái đánh giá và nhắc lịch.
    - `ghi_chu`: Lưu trữ chú thích/lưu ý riêng cho từng đơn hàng (Added 2026-04-10).
2. **the_ban_hang_ct (Detail)**:
    - `don_hang_id` -> `the_ban_hang(id)`.
    - **Logic tính toán:**
        - `thanh_tien` = `gia_ban * so_luong`.
        - `lai` = `(gia_ban - gia_von) * so_luong`.
    - Đây là nơi tính toán hiệu quả kinh doanh trực tiếp.

### C. Financial Tracking
1. **thu_chi**:
    - Phân loại `phiếu thu` / `phiếu chi`.
    - Liên kết với `id_don` (Thẻ bán hàng) để đối soát dòng tiền.

## 4. Danh sách nhiệm vụ (Task Breakdown)

| Task ID | Nhiệm vụ | Agent | Skills | Priority | Dependencies |
|---------|----------|-------|--------|----------|--------------|
| T1 | Kiểm tra tính nhất quán kiểu dữ liệu giữa `id` (UUID) và các trường liên kết | `database-architect` | `database-design` | P0 | None |
| T2 | Tài liệu hóa chi tiết các trường tính toán trong `the_ban_hang_ct` | `backend-specialist` | `api-patterns` | P1 | T1 |
| T3 | Phân tích luồng dữ liệu từ Thẻ bán hàng chi tiết lên Thu chi tổng | `project-planner` | `clean-code` | P1 | T2 |

## ✅ PHASE X: VERIFICATION
- [ ] Chạy `npm run build` để đảm bảo không có lỗi TypeScript do sai lệch kiểu dữ liệu Database.
- [ ] Kiểm tra các RLS policies để đảm bảo quyền truy cập đồng bộ giữa các bảng liên quan.
