# Kế hoạch khắc phục lỗi trùng mã phiếu bán hàng

Hệ thống đang gặp sự cố nghiêm trọng: Mã phiếu khi lập mới luôn bị kẹt ở `BH-000001`, dẫn đến việc ghi đè lên các phiếu cũ có cùng mã này.

## Phân tích kỹ thuật (Research)
- **Hàm lỗi**: `getNextSalesCardCode` trong `src/data/salesCardData.ts`.
- **Triệu chứng**: `supabase.from('the_ban_hang').select('id_bh').order('id_bh', { ascending: false }).limit(1)` có vẻ không trả về đúng mã lớn nhất hoặc gặp lỗi regex khiến kết quả mặc định là `BH-000001`.
- **Hậu quả**: `upsertSalesCard` sử dụng `onConflict: 'id_bh'` nên âm thầm ghi đè dữ liệu mà không báo lỗi trùng lặp.

## Kế hoạch triển khai

### Giai đoạn 1: Sửa lỗi lấy mã (Logic Fix)
- Cải thiện hàm `getNextSalesCardCode` để lấy top 50 mã thay vì chỉ 1, sau đó tìm MAX số thực sự ở phía client.
- Thêm kiểm tra định dạng chặt chẽ hơn để tránh các mã "rác" làm hỏng logic.

### Giai đoạn 2: Bảo vệ dữ liệu (Safety)
- Chuyển từ `upsert` sang `insert` khi tạo phiếu mới. Điều này sẽ khiến database báo lỗi (Duplicate Key Error) thay vì ghi đè nếu chẳng may mã phiếu bị trùng.
- Chỉ cho phép `upsert` (cập nhật) khi người dùng đang ở chế độ chỉnh sửa phiếu có sẵn (`editingCard !== null`).

### Giai đoạn 3: Kiểm tra (Verification)
- Kiểm tra tính liên tục của mã phiếu khi lập 5 phiếu mới liên tiếp.
- Xác nhận không còn tình trạng mất dữ liệu phiếu cũ.

## Danh sách công việc (Task Breakdown)
- [ ] Cập nhật `src/data/salesCardData.ts` - Hàm `getNextSalesCardCode`
- [ ] Cập nhật `src/data/salesCardData.ts` - Hàm `upsertSalesCard` (thêm logic check Create/Update)
- [ ] Kiểm tra thực tế trên giao diện

## Người thực hiện
- Agent: `project-planner` (Lead), `frontend-specialist` (Implementation)

## Câu hỏi cho người dùng
- Bạn có đồng ý với việc hệ thống sẽ báo lỗi thay vì ghi đè nếu phát hiện mã trùng không? (Điều này giúp bảo vệ dữ liệu tuyệt đối).
