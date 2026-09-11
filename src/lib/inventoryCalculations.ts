export interface ProductStockInput {
  id: string;
  ma_san_pham?: string | null;
  ten_san_pham: string;
  don_vi_tinh?: string | null;
  gia?: number | null;
  ton_dau_ky?: number | null;
}

export interface InventoryMovementInput {
  id?: string;
  id_xuat_nhap_kho?: string | null;
  loai_phieu?: string | null;
  ten_mat_hang: string;
  so_luong: number;
  gia?: number | null;
  tong_tien?: number | null;
  ngay: string;
  gio?: string | null;
}

export interface InventoryStockSummaryRow {
  id: string;
  ma_hang: string;
  ten_hang: string;
  dvt: string;
  dau_ky_so_luong: number;
  dau_ky_gia_tri: number;
  nhap_so_luong: number;
  nhap_gia_tri: number;
  xuat_so_luong: number;
  xuat_gia_tri: number;
  cuoi_ky_so_luong: number;
  cuoi_ky_gia_tri: number;
}

/** Nhận diện loại phiếu có phải là nhập hàng/nhập kho hay không (hỗ trợ cả tiếng Việt có dấu và không dấu). */
export const isNhapRecord = (loai: string | null | undefined): boolean => {
  const normalized = String(loai || '').trim().toLowerCase();
  return normalized.includes('nhap') || normalized.includes('nhập');
};

/**
 * Hàm thuần túy tính toán báo cáo Nhập - Xuất - Tồn kho cho bất kỳ khoảng ngày nào:
 *
 * Quy ước thống nhất:
 * 1. Tồn đầu hệ thống = ds_san_pham.ton_dau_ky (baseline)
 * 2. Tồn đầu kỳ = Tồn đầu hệ thống + (Tổng Nhập trước fromDate) - (Tổng Xuất trước fromDate)
 * 3. Tồn cuối kỳ = Tồn đầu kỳ + (Tổng Nhập trong kỳ) - (Tổng Xuất trong kỳ)
 */
export function calculateInventoryStockSummary(
  products: ProductStockInput[],
  inventoryRows: InventoryMovementInput[],
  fromDate: string,
  toDate: string
): InventoryStockSummaryRow[] {
  const fromDateStr = fromDate ? fromDate.slice(0, 10) : '';
  const toDateStr = toDate ? toDate.slice(0, 10) : '';

  const byName = new Map<string, InventoryStockSummaryRow>();

  // 1. Khởi tạo từ danh sách sản phẩm với baseline là p.ton_dau_ky
  for (const p of products) {
    const name = String(p.ten_san_pham || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();

    const baseQty = Number(p.ton_dau_ky || 0);
    const unitPrice = Math.max(0, Number(p.gia || 0));
    const baseVal = baseQty * unitPrice;

    byName.set(key, {
      id: p.id,
      ma_hang: p.ma_san_pham || '',
      ten_hang: name,
      dvt: p.don_vi_tinh || 'Cái',
      dau_ky_so_luong: baseQty,
      dau_ky_gia_tri: baseVal,
      nhap_so_luong: 0,
      nhap_gia_tri: 0,
      xuat_so_luong: 0,
      xuat_gia_tri: 0,
      cuoi_ky_so_luong: 0,
      cuoi_ky_gia_tri: 0,
    });
  }

  // 2. Duyệt qua các dòng biến động trong nhap_xuat_kho
  for (const r of inventoryRows) {
    const name = String(r.ten_mat_hang || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();

    if (!byName.has(key)) {
      byName.set(key, {
        id: r.id || '',
        ma_hang: '',
        ten_hang: name,
        dvt: 'Cái',
        dau_ky_so_luong: 0,
        dau_ky_gia_tri: 0,
        nhap_so_luong: 0,
        nhap_gia_tri: 0,
        xuat_so_luong: 0,
        xuat_gia_tri: 0,
        cuoi_ky_so_luong: 0,
        cuoi_ky_gia_tri: 0,
      });
    }

    const row = byName.get(key)!;
    const qty = Number(r.so_luong || 0);
    const amount = Number(r.tong_tien ?? (Number(r.gia || 0) * qty));
    const rDate = String(r.ngay || '').slice(0, 10);
    const isNhap = isNhapRecord(r.loai_phieu);

    // Phát sinh trước fromDate -> cộng dồn vào tồn đầu kỳ của khoảng thời gian
    if (fromDateStr && rDate < fromDateStr) {
      if (isNhap) {
        row.dau_ky_so_luong += qty;
        row.dau_ky_gia_tri += amount;
      } else {
        row.dau_ky_so_luong -= qty;
        row.dau_ky_gia_tri -= amount;
      }
      continue;
    }

    // Phát sinh sau toDate -> không nằm trong kỳ này
    if (toDateStr && rDate > toDateStr) {
      continue;
    }

    // Phát sinh trong kỳ [fromDate, toDate]
    if (isNhap) {
      row.nhap_so_luong += qty;
      row.nhap_gia_tri += amount;
    } else {
      row.xuat_so_luong += qty;
      row.xuat_gia_tri += amount;
    }
  }

  // 3. Tính tồn cuối kỳ
  const result = Array.from(byName.values()).map((r) => ({
    ...r,
    cuoi_ky_so_luong: r.dau_ky_so_luong + r.nhap_so_luong - r.xuat_so_luong,
    cuoi_ky_gia_tri: r.dau_ky_gia_tri + r.nhap_gia_tri - r.xuat_gia_tri,
  }));

  result.sort((a, b) => a.ten_hang.localeCompare(b.ten_hang, 'vi'));
  return result;
}
