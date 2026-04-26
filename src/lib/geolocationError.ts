/** Thông điệp đọc được cho GeolocationPositionError (và fallback). */
export function formatGeolocationError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as GeolocationPositionError;
    switch (e.code) {
      case 1:
        return 'Từ chối truy cập vị trí. Hãy bật quyền “Vị trí” cho trang này trong trình duyệt.';
      case 2:
        return 'Không lấy được tọa độ (mất tín hiệu hoặc dịch vụ vị trí không sẵn sàng).';
      case 3:
        return 'Hết thời gian chờ khi lấy vị trí. Thử lại sau.';
      default:
        return e.message || 'Lỗi Geolocation không xác định.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Không lấy được vị trí.';
}

/** Chỉ log khi cần gỡ lỗi; lỗi 1 (từ chối) rất thường gặp — không cần cảnh báo nặng. */
export function logGeolocationError(context: string, err: unknown): void {
  const msg = formatGeolocationError(err);
  const code = err && typeof err === 'object' && 'code' in err ? (err as GeolocationPositionError).code : undefined;
  if (import.meta.env.DEV) {
    if (code === 1) {
      console.debug(`[${context}]`, msg);
    } else {
      console.warn(`[${context}]`, msg, err);
    }
  } else if (code !== 1) {
    console.warn(`[${context}]`, msg);
  }
}
