# Plan: Transactional Customer-Order Creation Flow

## Mô tả vấn đề

Hiện tại, khi user bấm nút **"Lên đơn"** trong form thêm khách hàng mới:
1. Khách hàng được **lưu ngay vào DB** (`upsertCustomer`)
2. Rồi mới navigate sang trang Phiếu Bán Hàng

→ **Vấn đề**: Nếu user không lưu đơn hàng (đóng modal, huỷ bỏ), khách hàng vẫn **tồn tại trong DB** → dữ liệu rác.

## Yêu cầu

> Khi bấm "Lên đơn" → Chuyển sang form thêm đơn hàng. Nếu đơn hàng **không được lưu** → khách hàng **cũng không được lưu**.

---

## Proposed Changes

### Chiến lược: **Deferred Save (Lưu trễ)**

Thay vì lưu khách hàng trước rồi navigate, ta sẽ:
1. **Không lưu khách hàng** khi bấm "Lên đơn"
2. **Truyền formData khách hàng tạm thời** (qua `location.state`) sang trang Phiếu Bán Hàng
3. **Trang Phiếu Bán Hàng** nhận data tạm → hiển thị trong dropdown
4. **Khi lưu đơn hàng thành công** → mới gọi `upsertCustomer()` để tạo khách hàng
5. **Nếu huỷ/đóng modal** → không lưu gì cả → khách hàng không tồn tại

> **Lưu ý:**
> Cách tiếp cận này **không ảnh hưởng** flow hiện tại của nút "Lưu" (vẫn lưu khách hàng bình thường).
> Chỉ thay đổi flow khi bấm "Lên đơn".

---

### Component: CustomerFormModal

#### `src/components/CustomerFormModal.tsx`

**Thay đổi tại `handleSubmit`:**
- Khi `shouldOrder = true` và **là thêm mới** (không phải edit):
  - **Không** gọi `upsertCustomer()`
  - Thay vào đó, truyền `formData` tạm qua `navigate()` với `state.pendingCustomerData`
  - Gọi `onClose()` trực tiếp

**Callback `onSuccess` sẽ cần thêm overload mới:**
- Tùy chọn 1 (đề xuất): **handle navigate trực tiếp trong `handleSubmit`** thay vì delegate qua parent (hiện tại `navigate` có được gọi thông qua component cha không? Component cha có `onSuccess` sẽ gọi navigation).
- Sửa đổi trong `CustomerManagementPage` (component cha) để nhận data tạm.

---

### Component: CustomerManagementPage

#### `src/pages/CustomerManagementPage.tsx`

- Cập nhật `handleCustomerSuccess` để xử lý trường hợp mới:
  - Hàm `onSuccess` sẽ có thêm signature cho temp customer data.
  - Khi `shouldCreateOrder = true` mà customer **chưa lưu** → navigate với `pendingCustomerData` thay vì `pendingCustomerId`
  - Không reload customer list (vì chưa có gì mới trong DB)

---

### Component: SalesCardManagementPage

#### `src/pages/SalesCardManagementPage.tsx`

**Thay đổi tại logic auto-open modal:**
- Nhận thêm `pendingCustomerData` từ `location.state`
- Nếu có `pendingCustomerData` (khách hàng tạm, chưa lưu):
  - Tạo **temporary option** trong danh sách khách hàng để `customerOptions` có thể hiển thị trong dropdown. Thậm chí chèn thẳng khách hàng trực tiếp vào state `customers`.
  - Khi set `formData`, dùng `pendingCustomerData.ma_khach_hang` làm `khach_hang_id`.
  - Lưu `pendingCustomerData` vào state `pendingNewCustomer` để dùng khi submit.

**Thay đổi tại `handleSubmit`:**
- Trước khi upsert sales card, kiểm tra:
  - Nếu có `pendingNewCustomer` và `khach_hang_id === pendingNewCustomer.ma_khach_hang`:
    1. Gọi `upsertCustomer(pendingNewCustomer)` → nhận `savedCustomer`
    2. Xóa state `pendingNewCustomer`.
    3. Gán ID thật vào form đơn hàng và tiếp tục.
- Nếu user **đóng modal** (handleCloseModal), `pendingNewCustomer` bị xóa → không lưu gì.

---

## Các vấn đề cần Cân nhắc (Open Questions)

1. **Flow biển số xe & số điện thoại trùng:**
   - Hiện tại có debounce check duplicate biển số/SĐT. Nếu trùng, nó báo lỗi và hỏi có muốn tạo đơn với khách hàng HIỆN CÓ không.
   - Khi đó, flow vẫn dùng khách hàng hiện có (ID thật).
   - => Trạng thái "thêm mới" chỉ apply khi biển số/SĐT CHƯA TỒN TẠI.

2. **Khi lưu đơn hàng thành công, ta sẽ phải tạo khách hàng TRƯỚC, lấy UID mới nhất và gắn vào hoá đơn.**

---

## Các bước triển khai

1. Thay đổi logic trả về trong `CustomerFormModal.tsx` để hỗ trợ temp data.
2. Cập nhật `CustomerManagementPage.tsx` logic gọi callback.
3. Thay đổi `SalesCardManagementPage.tsx` để chấp nhận state từ React Router và handle create customer "on the fly".
4. Sửa `SalesCardFormModal` (nếu cần thiết để handle khách hàng tạm thời, nhưng thông thường nó select dựa trên `customers` list được parent cung cấp).

---

## Agent assignment
- **[X] Project Planner** (`project-planner`): Lập plan.
- **[ ] Orchestrator** (`orchestrator`)/ **App Builder** (`app-builder`): Implement code dựa theo plan này.
