# Tổng quan
Mục tiêu là thêm trường "Hình thức thanh toán" với 2 tùy chọn "Tiền mặt" và "Chuyển khoản" khi tạo một phiếu bán hàng mới (Lập Phiếu Bán hàng). Điều này cho phép người dùng ghi nhận hình thức thanh toán ngay từ đầu tại thời điểm lập phiếu bán hàng.

## Loại dự án
WEB

## Tiêu chí thành công
- [ ] Người dùng thấy một dropdown hoặc tuỳ chọn "Hình thức thanh toán" khi mở giao diện "Lập Phiếu Bán hàng Mới".
- [ ] Danh sách tùy chọn bao gồm: "Trống" (Chưa thanh toán), "Tiền mặt", và "Chuyển khoản".
- [ ] Khi lập phiếu, nếu người dùng có chọn hình thức thanh toán, ứng dụng sẽ tự động xử lý thanh toán và tạo phiếu thu ngay lập tức.

## Công nghệ sử dụng (Tech Stack)
- Frontend: React (TypeScript)
- UI: Tailwind CSS
- Data: Supabase

## Cấu trúc File
- `src/components/SalesCardFormModal.tsx` - Cập nhật để chứa trường chọn hình thức thanh toán mới.
- `src/pages/SalesCardManagementPage.tsx` - Cập nhật logic để nhận giá trị trường dữ liệu này và thực thi thu tiền ngay khi tạo phiếu.
- `src/data/salesCardData.ts` (Tuỳ chọn) - Thêm type tạm thời nếu cần thiết để hỗ trợ nhận diện trường `phuong_thuc_thanh_toan`.

## Phân chia tiến độ công việc (Task Breakdown)

- `[x]` **Task 1: Thêm giao diện Hình thức thanh toán** 
  - **Agent:** `frontend-specialist`
  - **Skill:** `frontend-design`
  - **INPUT:** `SalesCardFormModal.tsx`
  - **OUTPUT:** Xuất hiện một dropdown mới cho "Hình thức thanh toán" ở giao diện biểu mẫu. Trường này lưu vào giá trị `formData.phuong_thuc_thanh_toan`. Mặc định để chế độ bỏ trống (chưa có giao dịch thu tiền).
  - **VERIFY:** Giao diện hiển thị đúng với các tuỳ chọn: Trống, Tiền mặt, Chuyển khoản.

- `[x]` **Task 2: Xử lý logic gộp lúc gọi mã API lập phiếu**
  - **Agent:** `frontend-specialist`
  - **Skill:** `clean-code`
  - **INPUT:** `SalesCardManagementPage.tsx`
  - **OUTPUT:** Trong quá trình tạo phiếu mới, nếu `formData.phuong_thuc_thanh_toan` được chọn, tự động gọi qua hàm tài chính `createTransaction` ngay sau bước lưu hóa đơn thành công - qua đó tự động thu tiền cho hóa đơn vừa tạo.
  - **VERIFY:** Tạo một phiếu mới, chọn "Chuyển khoản". Xác nhận và truy xuất tab lịch sử phiếu bán xem đã thấy Đơn hàng ở trạng thái ĐÃ THU với mức tiền tương ứng hay chưa.

## ✅ Giai đoạn X: Kiểm tra lần cuối
- [x] Chạy chạy lint và typescript check (`npx tsc --noEmit`) ✅ Pass
- [x] Không sử dụng mã hex màu tím/violet trong UI. ✅ Pass
- [x] Ứng dụng biên dịch và hoạt động mượt mà. ✅ Pass
- [x] Chạy thử trọn bộ (mở modal > điền chi tiết > chọn hình thức thanh toán > Lưu lại > check). ✅ Pass
