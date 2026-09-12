import { supabase } from '../lib/supabase';
import { normalizeBranchLabel } from '../constants/customerBranches';
import {
  isMissingPurchaseReceiptCodeRpcError,
  normalizePurchaseReceiptCode,
} from '../lib/purchaseReceiptCode';
export {
  isMissingPurchaseReceiptCodeRpcError,
  normalizePurchaseReceiptCode,
} from '../lib/purchaseReceiptCode';

export interface PurchaseReceiptItem {
  id?: string;
  phieu_nhap_id?: string;
  san_pham_id?: string | null;
  ten_san_pham: string;
  so_luong: number;
  gia_nhap: number;
  thanh_tien: number;
  created_at?: string;
}

export interface PurchaseReceipt {
  id: string;
  ma_phieu: string;
  ngay: string;
  gio: string | null;
  co_so: string;
  nha_cung_cap: string | null;
  nguoi_thuc_hien: string | null;
  ghi_chu: string | null;
  tong_tien: number;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseReceiptItem[];
  tong_so_luong?: number;
}

export interface PurchaseReceiptFormData {
  id?: string;
  ma_phieu: string;
  /** Create only: true lets the database assign the next committed code. */
  ma_phieu_tu_dong?: boolean;
  code_mode?: 'auto' | 'manual';
  ngay: string;
  gio: string;
  co_so: string;
  nha_cung_cap: string;
  nguoi_thuc_hien: string;
  ghi_chu: string;
  items: Array<{
    id?: string;
    san_pham_id?: string | null;
    ten_san_pham: string;
    so_luong: number;
    gia_nhap: number;
    thanh_tien?: number;
  }>;
}

export interface PurchaseReceiptFilters {
  co_so?: string[];
  fromDate?: string;
  toDate?: string;
}

/** Map common RPC errors to a message that tells the operator what to fix. */
export function formatPurchaseReceiptRpcError(error: unknown, action = 'lưu phiếu nhập'): string {
  const rpcError = error as { code?: string; message?: string } | null | undefined;
  const message = String(rpcError?.message || '').trim();
  const lower = message.toLowerCase();

  if (
    rpcError?.code === '23505' ||
    lower.includes('duplicate key') ||
    (lower.includes('mã phiếu') && (lower.includes('tồn tại') || lower.includes('duplicate')))
  ) {
    return 'Mã phiếu đã tồn tại. Vui lòng chọn mã khác.';
  }

  if (lower.includes('mã phiếu thủ công') || lower.includes('ma_phieu_tu_dong')) {
    return message || 'Mã phiếu thủ công không hợp lệ.';
  }

  if (rpcError?.code === '42501') {
    return message || 'Bạn không có quyền thao tác phiếu nhập hàng tại cơ sở này.';
  }

  return message ? `${action}: ${message}` : `Không thể ${action}.`;
}

/**
 * Lấy mã phiếu preview chỉ đọc từ database.
 * Việc cấp mã thật chỉ xảy ra bên trong save_purchase_receipt khi create commit.
 */
export const getNextPurchaseReceiptCode = async (): Promise<string> => {
  // 1. Thử gọi PostgreSQL function
  let shouldUseFallback = false;
  try {
    const { data, error } = await supabase.rpc('get_next_purchase_receipt_code');
    if (error) {
      if (!isMissingPurchaseReceiptCodeRpcError(error)) {
        const detail = String(error.message || error.code || 'Lỗi không xác định').trim();
        throw new Error(`Không thể tải mã phiếu nhập preview: ${detail}`);
      }
      shouldUseFallback = true;
    } else {
      const code = String(data ?? '').trim();
      if (!code) {
        throw new Error('Không thể tải mã phiếu nhập preview: database trả về mã rỗng.');
      }
      return code;
    }
  } catch (error) {
    if (!isMissingPurchaseReceiptCodeRpcError(error)) throw error;
    shouldUseFallback = true;
  }

  if (!shouldUseFallback) {
    throw new Error('Không thể tải mã phiếu nhập preview.');
  }

  // 2. Compatibility fallback for an environment that has not applied the RPC.
  const allCodes: Array<{ ma_phieu: string | null }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('phieu_nhap_hang')
      .select('ma_phieu')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      const detail = String(error.message || error.code || 'Lỗi không xác định').trim();
      throw new Error(`Không thể tải mã phiếu nhập preview từ bảng dữ liệu: ${detail}`);
    }
    allCodes.push(...((data || []) as Array<{ ma_phieu: string | null }>));
    if (!data || data.length < pageSize) break;
  }

  if (allCodes.length === 0) return 'NH-000001';

  let maxNum = 0;
  let hasValidCode = false;
  for (const row of allCodes) {
    const match = String(row.ma_phieu || '').match(/^NH-(\d+)$/i);
    if (match) {
      hasValidCode = true;
      maxNum = Math.max(maxNum, Number(match[1]));
    }
  }

  if (!hasValidCode) {
    throw new Error('Không thể tải mã phiếu nhập preview: bảng không có mã NH hợp lệ.');
  }

  return `NH-${String(maxNum + 1).padStart(6, '0')}`;
};

import { validateReceiptItems } from '../lib/inventoryCalculations';
export { validateReceiptItems };

/** Lấy danh sách phiếu nhập hàng phân trang kèm tìm kiếm & bộ lọc */
export const getPurchaseReceiptsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: PurchaseReceiptFilters
): Promise<{ data: PurchaseReceipt[]; totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('phieu_nhap_hang')
    .select('*, phieu_nhap_hang_ct(*)', { count: 'exact' });

  if (searchQuery) {
    const q = searchQuery.trim();
    query = query.or(
      `ma_phieu.ilike.%${q}%,nha_cung_cap.ilike.%${q}%,nguoi_thuc_hien.ilike.%${q}%,ghi_chu.ilike.%${q}%`
    );
  }

  if (filters?.co_so && filters.co_so.length > 0) {
    query = query.in('co_so', filters.co_so);
  }

  if (filters?.fromDate) {
    query = query.gte('ngay', filters.fromDate);
  }

  if (filters?.toDate) {
    query = query.lte('ngay', filters.toDate);
  }

  const { data, count, error } = await query
    .order('ngay', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Lỗi khi lấy danh sách phiếu nhập hàng:', error);
    throw error;
  }

  const receipts: PurchaseReceipt[] = (data || []).map((row) => {
    const items = (row.phieu_nhap_hang_ct || []) as PurchaseReceiptItem[];
    const tongSoLuong = items.reduce((sum, it) => sum + Number(it.so_luong || 0), 0);
    return {
      id: row.id,
      ma_phieu: row.ma_phieu,
      ngay: row.ngay,
      gio: row.gio,
      co_so: row.co_so,
      nha_cung_cap: row.nha_cung_cap,
      nguoi_thuc_hien: row.nguoi_thuc_hien,
      ghi_chu: row.ghi_chu,
      tong_tien: Number(row.tong_tien || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      items,
      tong_so_luong: tongSoLuong,
    };
  });

  return {
    data: receipts,
    totalCount: count || 0,
  };
};

/** Lấy chi tiết một phiếu nhập theo ID */
export const getPurchaseReceiptById = async (id: string): Promise<PurchaseReceipt | null> => {
  const { data, error } = await supabase
    .from('phieu_nhap_hang')
    .select('*, phieu_nhap_hang_ct(*)')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Lỗi khi lấy chi tiết phiếu nhập:', error);
    return null;
  }

  const items = (data.phieu_nhap_hang_ct || []) as PurchaseReceiptItem[];
  return {
    ...data,
    items,
    tong_so_luong: items.reduce((sum, it) => sum + Number(it.so_luong || 0), 0),
  };
};

/**
 * Lập phiếu nhập hàng mới (BẮT BUỘC ATOMIC QUA POSTGRESQL RPC).
 * KHÔNG fallback ghi client-side để bảo đảm toàn vẹn Header + Details + Kho.
 */
export const createPurchaseReceipt = async (
  formData: PurchaseReceiptFormData
): Promise<PurchaseReceipt> => {
  const branch = normalizeBranchLabel(formData.co_so) || formData.co_so?.trim();
  if (!branch) {
    throw new Error('Vui lòng chọn cơ sở nhập hàng.');
  }

  // Validate nghiêm ngặt: không Math.max, không filter bỏ row lỗi
  const cleanItems = validateReceiptItems(formData.items);
  const autoCode = formData.code_mode
    ? formData.code_mode === 'auto'
    : formData.ma_phieu_tu_dong !== false;
  const code = autoCode
    ? formData.ma_phieu?.trim() || null
    : normalizePurchaseReceiptCode(formData.ma_phieu);

  // Thực thi Atomic RPC qua save_purchase_receipt
  const { data: rpcData, error: rpcError } = await supabase.rpc('save_purchase_receipt', {
    p_receipt: {
      ma_phieu: code,
      ma_phieu_tu_dong: autoCode,
      code_mode: autoCode ? 'auto' : 'manual',
      ngay: formData.ngay,
      gio: formData.gio || '00:00',
      co_so: branch,
      nha_cung_cap: formData.nha_cung_cap?.trim() || null,
      nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
      ghi_chu: formData.ghi_chu?.trim() || null,
      items: cleanItems,
    },
  });

  if (rpcError) {
    // Nếu RPC chưa tồn tại (chưa chạy migration 202609110003)
    if (
      rpcError.code === '42883' ||
      (rpcError.message && (
        rpcError.message.includes('save_purchase_receipt') ||
        rpcError.message.includes('function') ||
        rpcError.message.includes('does not exist')
      ))
    ) {
      throw new Error('Database chưa áp dụng migration 202609110003_purchase_receipt_atomic_rpc.sql');
    }

    console.error('Lỗi RPC save_purchase_receipt:', rpcError);
    throw new Error(formatPurchaseReceiptRpcError(rpcError, 'lưu phiếu nhập'));
  }

  if (!rpcData) {
    throw new Error('Không nhận được dữ liệu phản hồi từ database.');
  }

  const items = (rpcData.items || []) as PurchaseReceiptItem[];
  return {
    id: rpcData.id,
    ma_phieu: rpcData.ma_phieu,
    ngay: rpcData.ngay,
    gio: rpcData.gio,
    co_so: rpcData.co_so,
    nha_cung_cap: rpcData.nha_cung_cap,
    nguoi_thuc_hien: rpcData.nguoi_thuc_hien,
    ghi_chu: rpcData.ghi_chu,
    tong_tien: Number(rpcData.tong_tien || 0),
    items,
    tong_so_luong: items.reduce((sum, it) => sum + Number(it.so_luong || 0), 0),
  };
};

/**
 * Cập nhật phiếu nhập hàng (BẮT BUỘC ATOMIC QUA POSTGRESQL RPC).
 * KHÔNG fallback ghi client-side để tránh mất dữ liệu chi tiết cũ khi chèn mới lỗi.
 */
export const updatePurchaseReceipt = async (
  id: string,
  formData: PurchaseReceiptFormData
): Promise<PurchaseReceipt> => {
  if (!id) {
    throw new Error('Thiếu ID phiếu nhập hàng cần cập nhật.');
  }

  const branch = normalizeBranchLabel(formData.co_so) || formData.co_so?.trim();
  if (!branch) {
    throw new Error('Vui lòng chọn cơ sở nhập hàng.');
  }

  // Validate nghiêm ngặt
  const cleanItems = validateReceiptItems(formData.items);

  const { data: rpcData, error: rpcError } = await supabase.rpc('save_purchase_receipt', {
    p_receipt: {
      id,
      ma_phieu: formData.ma_phieu?.trim() || null,
      ngay: formData.ngay,
      gio: formData.gio || '00:00',
      co_so: branch,
      nha_cung_cap: formData.nha_cung_cap?.trim() || null,
      nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
      ghi_chu: formData.ghi_chu?.trim() || null,
      items: cleanItems,
    },
  });

  if (rpcError) {
    if (
      rpcError.code === '42883' ||
      (rpcError.message && (
        rpcError.message.includes('save_purchase_receipt') ||
        rpcError.message.includes('function') ||
        rpcError.message.includes('does not exist')
      ))
    ) {
      throw new Error('Database chưa áp dụng migration 202609110003_purchase_receipt_atomic_rpc.sql');
    }

    console.error('Lỗi RPC update save_purchase_receipt:', rpcError);
    throw new Error(formatPurchaseReceiptRpcError(rpcError, 'cập nhật phiếu'));
  }

  if (!rpcData) {
    throw new Error('Không nhận được dữ liệu phản hồi từ database.');
  }

  const items = (rpcData.items || []) as PurchaseReceiptItem[];
  return {
    id: rpcData.id,
    ma_phieu: rpcData.ma_phieu,
    ngay: rpcData.ngay,
    gio: rpcData.gio,
    co_so: rpcData.co_so,
    nha_cung_cap: rpcData.nha_cung_cap,
    nguoi_thuc_hien: rpcData.nguoi_thuc_hien,
    ghi_chu: rpcData.ghi_chu,
    tong_tien: Number(rpcData.tong_tien || 0),
    items,
    tong_so_luong: items.reduce((sum, it) => sum + Number(it.so_luong || 0), 0),
  };
};

/**
 * Xóa phiếu nhập hàng (BẮT BUỘC ATOMIC QUA POSTGRESQL RPC).
 * KHÔNG fallback ghi client-side để đảm bảo xóa sạch kho và chi tiết trong cùng một transaction.
 */
export const deletePurchaseReceipt = async (id: string, maPhieu?: string): Promise<void> => {
  void maPhieu;
  if (!id) {
    throw new Error('Thiếu ID phiếu nhập hàng cần xóa.');
  }

  const { error: rpcError } = await supabase.rpc('delete_purchase_receipt', {
    p_receipt_id: id,
  });

  if (rpcError) {
    if (
      rpcError.code === '42883' ||
      (rpcError.message && (
        rpcError.message.includes('delete_purchase_receipt') ||
        rpcError.message.includes('function') ||
        rpcError.message.includes('does not exist')
      ))
    ) {
      throw new Error('Database chưa áp dụng migration 202609110003_purchase_receipt_atomic_rpc.sql');
    }

    console.error('Lỗi RPC delete_purchase_receipt:', rpcError);
    throw new Error(`Lỗi xóa phiếu nhập: ${rpcError.message}`);
  }
};
