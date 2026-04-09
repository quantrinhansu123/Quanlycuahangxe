# Project Plan: Sales Flow & Customer Sorting Update

## 1. Goal
- Ngừng tự động chuyển hướng về trang Khách hàng sau khi Lên đơn hàng (Lập phiếu/Thu tiền) hoàn tất.
- Sau khi có một đơn hàng mới, Khách hàng thực hiện đơn đó sẽ tự động được đẩy lên dòng đầu tiên của danh sách ở tab Quản lý Khách hàng.

## 2. Technical Approach

**Phần 1: Chặn Tự động Chuyển Trang (Auto-navigate)**
- **File**: `src/pages/SalesCardManagementPage.tsx`
- **Action**: Xóa bỏ các lệnh `navigate('/ban-hang/khach-hang')` và `setTimeout` trong các hàm xử lý submit (`handleSubmit`, `handleCollectPayment`).
- **Kết quả**: Modal chỉ cần báo Toast thành công và tự đóng lại, dữ liệu trên trang hiện hành tự load lại.

**Phần 2: Đẩy Khách Hàng mới lên đầu**
- **File**: `src/data/customerData.ts` & `src/data/salesCardData.ts`
- **Hiện tại**: Hàm `getCustomersPaginated` đang sắp xếp theo mặc định `ngay_dang_ky` và `created_at`.
- **Giải pháp**: 
  1. Đổi sorting của danh sách khách hàng sang ưu tiên `updated_at` (thời điểm cập nhật gần nhất) DESCENDING, sau đó mới đến `created_at` DESCENDING.
  2. Mỗi khi hàm `upsertSalesCard` (lập phiếu mới) được gọi, chúng ta sẽ gửi một trigger nhẹ để "touch" (cập nhật) thời gian `updated_at` của khách hàng tương ứng. Nhờ vậy họ sẽ nhảy ngay lên đầu bảng mà không làm xáo trộn các số liệu khác.

## 3. Agents Assigned
- `frontend-specialist`: Xử lý UX/UI (loại bỏ navigate, giữ lại layout của modal).
- `backend-specialist`: Refactor câu query Supabase (chuyển đổi order theo `updated_at`) và tạo hook trigger đẩy `updated_at` của bảng `khach_hang` khi có phiếu lên thành công.

## 4. Open Questions (Socratic Gate)
1. Để bảng khách hàng luôn logic, khi bạn chỉnh sửa thông tin (VD: đổi số điện thoại) thì khách hàng đó cũng sẽ nhảy lên đầu danh sách do cơ chế tính `updated_at`. Bạn có đồng ý với nguyên tắc sắp xếp ưu tiên **những người tương tác gần nhất** hiển thị ở đầu bảng luôn không?
2. Sau khi lập xong phiếu bán hàng (form đóng lại, ngừng chuyển tab), bạn có muốn lưới dữ liệu của bảng "Phiếu Bán Hàng" ngay bên dưới tự động load lại hiển thị luôn phiếu vừa lập trên top không?

## 5. Verification Checklist
- [ ] Thực hiện lập phiếu từ Quản lý phiếu thu -> Form báo thành công và Đóng -> Vẫn ở nguyên trang hiện hành.
- [ ] Mở thẻ Quản lý Khách hàng -> Khách vừa lập hóa đơn xuất hiện ở vị trí trên cùng trang số 1.
