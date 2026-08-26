-- Chuyển các chiến dịch đã cấu hình theo mẫu số tháng kiểu date sang mẫu mới
-- 629158, trong đó months_since_service là kiểu number.
UPDATE public.zns_chien_dich
SET
  template_id = '629158',
  template_ten = 'Xác nhận đặt lịch hẹn bảo dưỡng xe new'
WHERE template_id = '628313';
