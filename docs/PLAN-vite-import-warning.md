# Kế hoạch Khắc phục Lỗi Dynamic Import của Vite (PayrollPage)

## 1. Phân tích nguyên nhân cảnh báo (Context Check)
Vite báo lỗi:
`(!) ...payrollData.ts is dynamically imported by .../PayrollPage.tsx but also statically imported by .../PayrollPage.tsx, dynamic import will not move module into another chunk.`

### Giải thích dễ hiểu:
Trong React / Javascript hiện đại, có 2 cách để nạp một file code (ví dụ `payrollData.ts`) vào trang:
1. **Tiêm cứng ở đầu trang (Static Import):** Mở trang là bắt buộc phải tải về hết.
2. **Tiêm mềm lúc cần (Dynamic Import):** Chỉ khi nào người dùng bấm nút mới âm thầm tải file đó về. Kỹ thuật này giúp giảm nhẹ dung lượng lúc đầu.

**Lỗi của chúng ta là gì?**
Bên trong file `PayrollPage.tsx`, chúng ta vô tình gọi file `payrollData.ts` bằng cả 2 cách cùng 1 lúc:
- **Dòng 8:** `import { getPayrollBatch, ... } from '../data/payrollData';` (Tiêm cứng ở đầu trang).
- **Dòng 178:** `const { deletePayrollBatch } = await import('../data/payrollData');` (Lại bắt hệ thống tiêm mềm khi bấm nút Xoá).

Do hệ thống đã lỡ tiêm cứng file này ngay từ lúc mới mở trang rồi, nên đến lúc nút xoá bắt nó "tiêm mềm" để đỡ tốn dung lượng thì Vite mới nhắc nhở: *"Ê, cái file này tao tải về máy từ nãy rồi, mày xài lệnh tiêm mềm ở dưới cũng vô dụng thôi, file này không được tách nhỏ ra đâu (will not move module into another chunk)."*

---

## 2. Kế hoạch triệt tiêu cảnh báo (Task Breakdown)

Lỗi này **không gây sập app**, nó chỉ là Cảnh báo Hiệu suất. Cách giải quyết cực kỳ đơn giản:

### Hành động duy nhất: Đồng bộ cách Import.
Vì ở trang Lương (`PayrollPage`), lúc nào vừa vào cũng phải tải bảng lương (`getPayrollBatch`), nên kiểu gì cũng phải **Tiêm cứng** file `payrollData.ts`.
Do đó, tôi sẽ gom hàm `deletePayrollBatch` mang lên dòng 8 để "tiêm cứng" chung với các hàm khác, lôi cổ nó lên trên và xoá lệnh `await import(...)` ở dòng 178.

Sự mâu thuẫn sẽ biến mất và Vite sẽ không còn phàn nàn nữa. `npm run build` sẽ 100% xanh và không có Warning.

---

## 3. Xác nhận (Socratic Gate)
> [!IMPORTANT]
> Đây là một chỉnh sửa mã nguồn cực nhỏ và an toàn tuyệt đối. 
> Bạn có muốn tôi tiến hành sửa ngay lỗi Cảnh báo Biên dịch này không? (Gõ `/create` để tôi thực hiện sửa nhanh nhé!)
