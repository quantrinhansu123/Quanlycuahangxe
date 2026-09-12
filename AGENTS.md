# AGENTS.md

## Mục tiêu

Khi sửa lỗi trong repository này, ưu tiên tìm nguyên nhân gốc thay vì chỉ vá triệu chứng.

## Quy trình debug bắt buộc

1. Trace toàn bộ luồng liên quan:
   UI -> component -> data layer -> Supabase RPC/query -> PostgreSQL/data.

2. Không kết luận chỉ dựa trên thông báo UI.
   Ví dụ:
   - "Không tìm thấy" có thể do timeout, abort, race condition hoặc query lỗi.
   - "Máy chủ chậm" có thể do RPC nặng, cold start hoặc quá nhiều request đồng thời.

3. Khi gặp lỗi search:
   - Xác định loại từ khóa người dùng nhập.
   - Kiểm tra có cần dùng cùng một query tổng quát cho mọi loại search hay không.
   - Nếu một loại search có thể truy vấn hẹp hơn, cân nhắc fast path riêng.
   - Ví dụ: mã, biển số, ID, số cuối có thể không cần chạy toàn bộ search pipeline.

4. Kiểm tra concurrency:
   - request cũ có bị hủy không;
   - request cũ có thể ghi đè request mới không;
   - dùng AbortController/request ID khi cần;
   - abort bình thường không được hiển thị như lỗi thật.

5. Không dùng tăng timeout làm giải pháp đầu tiên.
   Chỉ tăng timeout sau khi đã hiểu query nào chậm và vì sao.
   Timeout dài hơn chỉ là lớp bảo vệ, không thay thế tối ưu query.

6. Khi query chậm:
   - đo thời gian thực tế;
   - kiểm tra query plan/index;
   - tránh materialize toàn bộ dữ liệu rồi mới lọc;
   - lọc càng sớm càng tốt;
   - tránh gọi RPC nặng sau mỗi lần gõ;
   - cân nhắc cache/debounce/pagination.

7. Phân biệt:
   - lỗi frontend;
   - lỗi network;
   - lỗi Supabase/PostgreSQL;
   - lỗi dữ liệu;
   - lỗi thiết kế query.

8. Với dữ liệu production:
   - không DROP/TRUNCATE/DELETE hàng loạt khi chưa được yêu cầu rõ;
   - backup trước khi merge/deduplicate;
   - không tự merge dữ liệu chỉ dựa trên 1-2 trường;
   - kiểm tra foreign key và dữ liệu liên quan trước khi thay đổi.

9. Khi gặp dữ liệu trùng:
   - xác định bản ghi chính;
   - liệt kê các bản ghi liên quan;
   - remap dữ liệu tham chiếu;
   - xác minh;
   - chỉ sau đó mới archive/xóa bản ghi phụ.

10. Ưu tiên thay đổi:
   - nhỏ;
   - dễ test;
   - dễ rollback;
   - không làm thay đổi hành vi ngoài phạm vi lỗi nếu không cần.

## Trước khi sửa code

Phải trả lời được:
- lỗi xảy ra ở tầng nào;
- request/query nào gây lỗi;
- có bằng chứng nào xác nhận;
- thay đổi đề xuất sửa nguyên nhân gốc hay chỉ che triệu chứng.

## Sau khi sửa

Phải:
- chạy test liên quan;
- thử lặp lại thao tác nhiều lần;
- kiểm tra request đồng thời nếu lỗi liên quan search/load;
- đảm bảo lỗi server không bị hiển thị thành "không tìm thấy";
- kiểm tra không làm hỏng luồng khác.

## Nguyên tắc

Đừng chỉ hỏi:
"Code hiện tại sửa thế nào?"


Hãy luôn hỏi thêm:
"Có cần dùng thiết kế hiện tại cho trường hợp này không?"
