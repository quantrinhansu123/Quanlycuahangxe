/** Cấu hình các mẫu ZNS có ánh xạ dữ liệu đặc thù. */
export const ZNS_MAINTENANCE_TEMPLATE_ID = '629158';
export const ZNS_MAINTENANCE_TEMPLATE_NAME = 'Xác nhận đặt lịch hẹn bảo dưỡng xe new';

/** Các mẫu cũ không còn cho chọn trong màn hình gửi hàng loạt. */
export const HIDDEN_ZNS_TEMPLATE_IDS = new Set<string>(['625983', '626812', '628313']);

export const ZNS_MAINTENANCE_BRANCH_ADDRESSES: Record<string, string> = {
  'Cơ sở Bắc Ninh': 'Cs1 KCN Yên Phong, An Bình , Trần Xá Bắc Ninh',
  'Cơ sở Bắc Giang': 'Cs2 Vân Cốc 3, Phường Nếnh, Bắc Ninh',
};

/**
 * Bộ biến dùng để nhận diện mẫu nhắc bảo dưỡng kể cả khi Zalo cấp một Template ID mới.
 * Mẫu mới chỉ cần giữ nguyên các tên biến này; không phải sửa lại từng ánh xạ trong form.
 */
export const ZNS_MAINTENANCE_PARAMETER_KEYS = [
  'customer_name',
  'license_plate',
  'months_since_service',
  'service_name',
  'branch_address',
] as const;
