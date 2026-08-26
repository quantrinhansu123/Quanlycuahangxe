-- Chuyển các chiến dịch đã tạo bằng mẫu cũ sang mẫu ZBS mới.
-- zns_gui_log không có template_id riêng; log liên kết qua chien_dich_id nên
-- tự động tiếp tục thuộc đúng chiến dịch sau khi cập nhật zns_chien_dich.
-- Các khóa dữ liệu cũ được giữ lại trong log, đồng thời bổ sung khóa mới để
-- dữ liệu lịch sử phản ánh đúng cấu trúc template 628313.
UPDATE public.zns_gui_log AS log
SET template_data = log.template_data || jsonb_build_object(
    'customer_name', COALESCE(log.template_data -> 'customer_name', '""'::jsonb),
    'license_plate', COALESCE(log.template_data -> 'license_plate', log.template_data -> 'vehicle_name', '""'::jsonb),
    'service_name', COALESCE(log.template_data -> 'service_name', '""'::jsonb),
    'branch_address', COALESCE(log.template_data -> 'branch_address', '""'::jsonb),
    'months_since_service', COALESCE(log.template_data -> 'months_since_service', '""'::jsonb)
)
WHERE EXISTS (
    SELECT 1
    FROM public.zns_chien_dich AS campaign
    WHERE campaign.id = log.chien_dich_id
      AND campaign.template_id = '626812'
);

UPDATE public.zns_chien_dich
SET template_id = '628313',
    template_ten = 'Xác nhận đặt lịch hẹn bảo dưỡng xe',
    field_mapping = jsonb_build_object(
        'customer_name', COALESCE(field_mapping -> 'customer_name', '{"source":"ho_va_ten"}'::jsonb),
        'license_plate', COALESCE(field_mapping -> 'license_plate', field_mapping -> 'vehicle_name', '{"source":"bien_so_xe"}'::jsonb),
        'service_name', COALESCE(field_mapping -> 'service_name', '{"source":"selected_service.name"}'::jsonb),
        'branch_address', COALESCE(field_mapping -> 'branch_address', '{"source":"dia_chi_hien_tai"}'::jsonb),
        'months_since_service', COALESCE(field_mapping -> 'months_since_service', '{"source":"last_service_usage.months"}'::jsonb)
    )
WHERE template_id = '626812';
