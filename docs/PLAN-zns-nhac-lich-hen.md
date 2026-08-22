# Kế hoạch: Mẫu ZNS "Thông báo nhắc đến lịch hẹn" (ID 626812)

Vị trí: tab "Gửi đánh giá đơn hàng" trong `/zns/gui-hang-loat`
(`src/pages/ZnsBulkSendPage.tsx`) — khi người dùng chọn mẫu Zalo
**"Thông báo nhắc đến lịch hẹn — ID 626812"** ở ô "Mẫu Zalo đã duyệt".

## 1. Hiện trạng

- Mẫu `626812` đã được Zalo duyệt và đã hiện sẵn trong dropdown "Mẫu Zalo đã
  duyệt" (lấy trực tiếp từ API `listZnsTemplates()` — không phải mẫu được
  gắn cứng trong code như `ORDER_REVIEW_TEMPLATE`).
- Tuy nhiên hiện tại, khối "Chọn khách hàng" (`ZnsBulkSendPage.tsx:810`) chỉ
  hiện ra khi `templateId === ORDER_REVIEW_TEMPLATE.template_id`
  (`'623794'`). Khi chọn mẫu `626812`, trang chỉ hiện phần xem trước
  template — **không có cách nào chọn khách hàng để gửi**. Đây là phần cần bổ
  sung.
- Luồng hiện có cho mẫu đánh giá đơn hàng (`623794`) lọc khách theo: cơ sở +
  dịch vụ đã dùng + **khoảng ngày đã dùng dịch vụ đó** (`serviceFromDate` →
  `serviceToDate`, xem `ZnsBulkSendPage.tsx:860-884`). Yêu cầu mới giữ nguyên
  toàn bộ phần cơ sở/dịch vụ/tìm kiếm/chọn tất cả, chỉ thay khối lọc ngày này
  bằng **"đã bao nhiêu tháng chưa dùng lại dịch vụ đó"**.

## 2. Mục tiêu nghiệp vụ

Nhắc khách hàng quay lại bảo dưỡng/sử dụng dịch vụ mà họ **đã từng dùng**
nhưng đã lâu chưa quay lại — vd "khách đã dùng dịch vụ thay nhớt nhưng hơn 3
tháng chưa quay lại".

Phạm vi khách hợp lệ = khách có ít nhất 1 lần dùng dịch vụ đã chọn (ở cơ sở
đã lọc, nếu có), **và** lần dùng gần nhất cách hôm nay ≥ N tháng. Khách chưa
từng dùng dịch vụ đó thì **không** thuộc danh sách này (khác với mẫu đánh
giá đơn hàng vốn không cần điều kiện "đã từng dùng").

## 3. Thiết kế UI

### 3.1 Điều kiện hiện khối "Chọn khách hàng"
- Thêm hằng số `APPOINTMENT_REMINDER_TEMPLATE_ID = '626812'` cạnh
  `ORDER_REVIEW_TEMPLATE` (`ZnsBulkSendPage.tsx:70`).
- Đổi điều kiện render ở dòng 810 từ so sánh 1 ID sang so sánh tập hợp:
  `const showCustomerPicker = templateId === ORDER_REVIEW_TEMPLATE.template_id || templateId === APPOINTMENT_REMINDER_TEMPLATE_ID;`
- Phần tìm kiếm, lọc cơ sở, lọc dịch vụ, "Chọn tất cả", danh sách khách hàng
  — giữ nguyên, dùng chung cho cả 2 mẫu.

### 3.2 Khối lọc thay thế "Đã dùng dịch vụ đã chọn trong khoảng" (dòng 860-884)
Chỉ hiện khi có chọn dịch vụ (`serviceFilters.length > 0`), tuỳ theo mẫu
đang chọn:

- **Mẫu đánh giá đơn hàng (623794)**: giữ nguyên khối "Từ ngày – Đến ngày"
  hiện tại (lọc khách **đã dùng dịch vụ trong khoảng**).
- **Mẫu nhắc lịch hẹn (626812)**: hiện khối mới **"Chưa quay lại dùng dịch
  vụ đã chọn từ"**, gồm 1 input số tháng (mặc định 3, cho chọn nhanh
  1/2/3/6/9/12 tháng qua `SearchableSelect` hoặc input number có nút +/-)
  — validate số nguyên dương.

### 3.3 Số liệu hiển thị thêm (tuỳ chọn, nên có)
Trong danh sách khách hàng, khi ở chế độ nhắc lịch hẹn, hiện thêm cột nhỏ
"Lần dùng gần nhất: dd/mm/yyyy" bên cạnh SĐT để người gửi dễ kiểm tra trước
khi gửi — dùng lại `serviceUsageDatesMap` đã có sẵn trong state, không cần
gọi thêm API.

## 4. Logic lọc khách hàng

Tận dụng nguyên trạng khối tính `serviceUsageDatesMap` (`getServiceUsageDatesMap`,
đã lấy toàn bộ ngày dùng dịch vụ đã chọn cho từng khách, `ZnsBulkSendPage.tsx:349-376`).

Trong `filteredCustomers` (`ZnsBulkSendPage.tsx:378-416`), thay nhánh
`usedSelectedServiceInRange` bằng logic theo mẫu đang chọn:

```
const lastUsageDate = getCustomerLinkKeys(c)
  .map((key) => serviceUsageDatesMap.get(key.trim().toLowerCase()) || [])
  .flat()
  .sort()
  .at(-1); // ngày lớn nhất (gần nhất), do map đã sort tăng dần

if (isAppointmentReminder) {
  if (!lastUsageDate) return false; // chưa từng dùng dịch vụ này -> loại
  const monthsSince = monthsBetween(lastUsageDate, todayIso);
  if (monthsSince < reminderMonthsThreshold) return false;
} else {
  // giữ logic hiện tại: usedSelectedServiceInRange theo serviceFromDate/serviceToDate
}
```

Cần viết hàm thuần `monthsBetween(fromIso, toIso): number` (chênh lệch theo
tháng dương lịch, làm tròn xuống) — không phụ thuộc thư viện ngoài.

## 5. Field mapping (dữ liệu điền vào tin ZNS)

- **Việc bắt buộc trước khi code phần này**: chọn mẫu `626812` trong dropdown,
  bấm "Xem trước Template" (tính năng đã có) để lấy đúng danh sách tham số
  thực tế do Zalo trả về (`templateDetail.parameters`) — hiện chưa biết chắc
  các key là gì (có thể là `customer_name`, `last_service_date`,
  `service_name`, `next_appointment_date`...). Không đoán trước tên tham số.
- `mappingRowsForTemplate()` (`ZnsBulkSendPage.tsx:91-100`) đã tự động map
  `customer_name` → `ho_va_ten`; các tham số lạ khác hiện rơi về `static`
  (người dùng phải tự gõ) — **đủ dùng ở bản đầu** nếu mẫu chỉ cần tên khách.
- Nếu mẫu cần "ngày dùng dịch vụ gần nhất", trường này **khác** với
  `last_order.ngay` hiện có (vốn lấy đơn hàng gần nhất bất kỳ dịch vụ nào,
  qua `getCustomerServiceHistory`, xem `znsData.ts:229-264`). Cần:
  1. Thêm `ZnsFieldSource` mới, vd `'last_service_usage.ngay'`
     (`znsData.ts:9`).
  2. Mở rộng `renderTemplateDataForCustomer`/`renderTemplateDataForCustomers`
     nhận thêm tham số tuỳ chọn `serviceUsageDatesMap` (dùng lại map đã có
     sẵn ở `ZnsBulkSendPage`, không gọi thêm Supabase) để tra ngày gần nhất
     theo `getCustomerLinkKeys`.
  3. Map tham số Zalo tương ứng (tên thật lấy được ở bước xem trước) sang
     nguồn mới này trong `mappingRowsForTemplate()`.
  - Việc này chỉ làm nếu bước xem trước xác nhận mẫu thực sự cần trường
    ngày dùng dịch vụ; nếu mẫu chỉ cần tên khách thì bỏ qua toàn bộ mục 3.

## 6. File cần sửa

| File | Thay đổi |
|---|---|
| `src/pages/ZnsBulkSendPage.tsx` | Thêm hằng `APPOINTMENT_REMINDER_TEMPLATE_ID`; mở điều kiện hiện khối chọn khách hàng; thêm state `reminderMonthsThreshold`; thêm UI lọc theo số tháng (thay thế có điều kiện cho khối ngày); sửa `filteredCustomers` theo mục 4; thêm hàm `monthsBetween`. |
| `src/data/znsData.ts` | (Chỉ nếu mục 5.3 cần) thêm `ZnsFieldSource` mới + mở rộng logic render field mapping. |

Không cần bảng/migration mới — toàn bộ dữ liệu (dịch vụ, lịch sử đơn hàng,
khách hàng) đã có sẵn.

## 7. Thứ tự triển khai đề xuất

1. Chọn thử mẫu `626812` trên trang thật, xem tham số thực tế qua "Xem
   trước Template" — xác nhận có cần trường ngày dùng dịch vụ hay không.
2. Thêm hằng số mẫu + mở điều kiện hiện khối "Chọn khách hàng" cho mẫu này.
3. Viết `monthsBetween()` và thay logic lọc trong `filteredCustomers`.
4. Thêm UI chọn số tháng (thay khối ngày khi ở chế độ nhắc lịch hẹn).
5. (Nếu cần) mở rộng field mapping cho ngày dùng dịch vụ gần nhất.
6. Test thủ công: chọn dịch vụ + số tháng, đối chiếu danh sách khách hiện ra
   với dữ liệu thật (vài khách mẫu), test trường hợp không có khách nào
   thoả điều kiện, test đổi cơ sở/dịch vụ reset đúng bộ lọc.

## 8. Câu hỏi cần xác nhận với người dùng trước khi code

- Ngưỡng số tháng mặc định khi mở bộ lọc là bao nhiêu (đề xuất 3 tháng)?
- Cho chọn số tháng tự do (input số) hay chỉ các mốc dựng sẵn
  (1/2/3/6/9/12 tháng)?
- Khách **chưa từng** dùng dịch vụ đã chọn có nên xuất hiện trong danh sách
  không, hay chắc chắn loại như phương án ở mục 2?
