# PLAN: Kiểm tra & Bổ sung Check Trùng khi Import Excel

## Mục tiêu
Đánh giá toàn bộ 8 điểm Import Excel trong hệ thống để xác định nơi nào đã có cơ chế **check trùng (dedup)** và nơi nào còn thiếu, có nguy cơ tạo dữ liệu trùng lặp khi nhập Excel lần thứ 2.

---

## Kết quả Kiểm tra

### Tóm tắt nhanh

| # | Trang | File | Check trùng Frontend | Backend (Supabase) | Đánh giá |
|---|-------|------|----------------------|--------------------|----------|
| 1 | **Khách hàng** | `CustomerManagementPage.tsx` | ✅ **ĐẦY ĐỦ** — So sánh ID, `ma_khach_hang`, SĐT với danh sách hiện có. Gán `res.id = existing.id` để upsert | `.upsert()` trên `id` | ✅ AN TOÀN |
| 2 | **Phiếu Bán hàng** | `SalesCardManagementPage.tsx` | ✅ **ĐẦY ĐỦ** — Fetch toàn bộ `the_ban_hang` rồi so sánh `id`/`id_bh`. Gán `res.id = cardToUpdate.id` | `.upsert()` trên `id` | ✅ AN TOÀN |
| 3 | **Dịch vụ** | `ServiceManagementPage.tsx` | ⚠️ **MỘT PHẦN** — Chỉ check UUID hợp lệ hoặc `id_dich_vu`. KHÔNG so sánh `ten_dich_vu` để tìm bản ghi trùng | `.upsert()` trên `id` | ⚠️ CẦN CẢI THIỆN |
| 4 | **Nhân sự** | `PersonnelManagementPage.tsx` | ❌ **THIẾU** — Chỉ check `db_id`/`system_id` (UUID). KHÔNG so sánh `ho_ten`, `sdt`, hay `id_nhan_su` với dữ liệu hiện có | `.upsert()` trên `id` | ❌ NGUY HIỂM |
| 5 | **Tài chính** | `FinancialManagementPage.tsx` | ❌ **THIẾU** — Chỉ check UUID. KHÔNG tra cứu bản ghi hiện có theo bất kỳ trường nào khác | `.upsert()` trên `id` | ❌ NGUY HIỂM |
| 6 | **Kho vận** | `InventoryManagementPage.tsx` | ❌ **THIẾU** — Dùng `bulkInsertInventoryRecords` (INSERT, không phải UPSERT!). Không check trùng | `.insert()` (KHÔNG upsert) | ❌ **RẤT NGUY HIỂM** |
| 7 | **Chi tiết Bán hàng** | `SalesCardCTManagementPage.tsx` | *(Chưa kiểm tra chi tiết)* | `.upsert()` trên `id` | ⚠️ CẦN KIỂM TRA |
| 8 | **Chấm công** | `AttendanceManagementPage.tsx` | *(Chưa kiểm tra chi tiết)* | `.upsert()` trên `id` | ⚠️ CẦN KIỂM TRA |

---

## Phân tích Chi tiết

### ✅ ĐÃ AN TOÀN

#### 1. Khách hàng (`CustomerManagementPage.tsx`)
- **Cơ chế:** Fetch toàn bộ danh sách khách hàng nhẹ (`getCustomersForSelect`), sau đó so sánh từng dòng Excel với 3 tiêu chí: UUID, `ma_khach_hang`, và `so_dien_thoai`.
- **Kết quả:** Nếu tìm thấy bản ghi trùng, gán `res.id = existing.id` → Supabase sẽ UPDATE thay vì INSERT.
- **Nhận xét:** Đây là mẫu check trùng tốt nhất trong toàn bộ hệ thống.

#### 2. Phiếu Bán hàng (`SalesCardManagementPage.tsx`)  
- **Cơ chế:** Fetch danh sách `the_ban_hang` hiện có (`id`, `id_bh`), so sánh `id` và `id_bh` với dữ liệu Excel.
- **Kết quả:** Nếu tìm thấy phiếu trùng, gán `res.id = cardToUpdate.id` → UPDATE.
- **Nhận xét:** Hoạt động tốt.

---

### ⚠️ CẦN CẢI THIỆN

#### 3. Dịch vụ (`ServiceManagementPage.tsx`)
- **Cơ chế hiện tại:** Chỉ kiểm tra nếu cột `id` trong Excel là UUID hợp lệ → gán `record.id`. Nếu không, gán `record.id_dich_vu`.
- **Thiếu:** KHÔNG so sánh `ten_dich_vu` (tên dịch vụ) hay `id_dich_vu` với database hiện có.
- **Rủi ro:** Nếu nhập Excel 2 lần cùng tên dịch vụ nhưng không có UUID → **TẠO BẢN GHI TRÙNG**.
- **Khuyến nghị:** Fetch danh sách dịch vụ hiện có, so sánh `ten_dich_vu` + `co_so` hoặc `id_dich_vu` để gán `record.id`.

---

### ❌ THIẾU HOÀN TOÀN

#### 4. Nhân sự (`PersonnelManagementPage.tsx`)
- **Cơ chế hiện tại:** Chỉ check UUID từ cột `db_id`/`system_id`.
- **Thiếu:** KHÔNG so sánh `ho_ten`, `sdt`, `email`, hay `id_nhan_su` với danh sách nhân sự hiện có.
- **Rủi ro:** Nhập Excel 2 lần → **NHÂN ĐÔI SỐ LƯỢNG NHÂN SỰ**.
- **Khuyến nghị:** Fetch `getPersonnel()`, so sánh bằng `ho_ten` + `sdt` hoặc `id_nhan_su`.

#### 5. Tài chính (`FinancialManagementPage.tsx`)
- **Cơ chế hiện tại:** Chỉ check UUID.
- **Thiếu:** KHÔNG có bất kỳ logic nào để phát hiện giao dịch trùng.
- **Rủi ro:** Nhập Excel 2 lần → **TỔNG THU/CHI BỊ TÍNH GẤP ĐÔI**.
- **Khuyến nghị:** So sánh theo tổ hợp `ngay` + `gio` + `so_tien` + `danh_muc` hoặc `id_don`.

#### 6. Kho vận (`InventoryManagementPage.tsx`)  
- **Cơ chế hiện tại:** Dùng `bulkInsertInventoryRecords` (INSERT thuần, không phải UPSERT!).
- **Thiếu:** Không check trùng ở cả frontend lẫn backend.
- **Rủi ro:** **RẤT NGUY HIỂM** — Mỗi lần nhập Excel đều tạo bản ghi mới bất kể dữ liệu có trùng hay không.
- **Khuyến nghị:** 
  1. Đổi từ `bulkInsertInventoryRecords` sang `bulkUpsertInventoryRecords` (hoặc tạo mới).
  2. Thêm logic check trùng theo `id_xuat_nhap_kho` hoặc `id_don_hang` + `ten_mat_hang` + `ngay`.

---

## Kế hoạch Sửa lỗi (Nếu được phê duyệt)

### Ưu tiên Cao (Rủi ro lớn)
1. **Kho vận** — Chuyển từ INSERT sang UPSERT + thêm check trùng frontend
2. **Tài chính** — Thêm check trùng theo `id_don` hoặc tổ hợp `ngay+gio+so_tien+danh_muc`
3. **Nhân sự** — Thêm check trùng theo `ho_ten` + `sdt` hoặc `id_nhan_su`

### Ưu tiên Trung bình
4. **Dịch vụ** — Thêm check trùng theo `ten_dich_vu` + `co_so` hoặc `id_dich_vu`
5. **Chi tiết Bán hàng** — Kiểm tra và bổ sung nếu cần
6. **Chấm công** — Kiểm tra và bổ sung nếu cần

### Mẫu Logic Check Trùng (Tham khảo từ Khách hàng)
```typescript
// 1. Fetch danh sách hiện có
const existingList = await getDataForSelect();

// 2. Với mỗi dòng Excel, tìm bản ghi trùng
const existing = existingList.find(item => {
  // So sánh theo nhiều tiêu chí
  return item.unique_field === excelRow.unique_field 
    || item.phone === excelRow.phone;
});

// 3. Nếu trùng, gán ID của bản ghi cũ để UPSERT thay vì INSERT
if (existing) {
  record.id = existing.id;
}
```

---

## Verification Plan
- Nhập Excel lần 1 → Xác nhận dữ liệu được tạo đúng.
- Nhập lại cùng file Excel lần 2 → Xác nhận số lượng bản ghi **KHÔNG TĂNG** (UPDATE thay vì CREATE).
- Sửa 1 dòng trong Excel rồi nhập lại → Xác nhận bản ghi cũ được CẬP NHẬT đúng.
