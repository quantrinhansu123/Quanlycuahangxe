import { supabase } from '../lib/supabase';
import { normalizeBranchLabel } from '../constants/customerBranches';

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

/**
 * Lấy mã phiếu tiếp theo từ Database Sequence (an toàn khi nhiều người dùng cùng tạo).
 * Nếu database chưa chạy migration sequence, tự động fallback sang tìm max mã hiện tại.
 */
export const getNextPurchaseReceiptCode = async (): Promise<string> => {
  // 1. Thử gọi PostgreSQL function
  try {
    const { data, error } = await supabase.rpc('get_next_purchase_receipt_code');
    if (!error && data) {
      return String(data).trim();
    }
  } catch {
    // ignore and fallback
  }

  // 2. Fallback tìm max từ bảng phieu_nhap_hang
  const { data, error } = await supabase
    .from('phieu_nhap_hang')
    .select('ma_phieu')
    .order('ma_phieu', { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) {
    return 'NH-000001';
  }

  let maxNum = 0;
  for (const row of data) {
    const match = String(row.ma_phieu || '').match(/^NH-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `NH-${String(maxNum + 1).padStart(6, '0')}`;
};

/** Xóa toàn bộ bản ghi kho liên quan đến đúng phiếu nhập hàng cụ thể (bảo vệ nguồn khác) */
export const deleteInventoryByPurchaseReceiptId = async (
  receiptId: string,
  receiptCode?: string
): Promise<void> => {
  if (!receiptId && !receiptCode) return;

  if (receiptId) {
    const { error: err1 } = await supabase
      .from('nhap_xuat_kho')
      .delete()
      .eq('source_type', 'purchase_receipt')
      .eq('source_id', receiptId);

    if (err1) {
      console.warn('Lỗi khi xóa kho theo source_id:', err1.message);
    }
  }

  // Fallback an toàn: CHỈ xóa nếu đúng source_type = 'purchase_receipt'
  if (receiptCode) {
    const { error: err2 } = await supabase
      .from('nhap_xuat_kho')
      .delete()
      .eq('source_type', 'purchase_receipt')
      .eq('id_xuat_nhap_kho', receiptCode);

    if (err2) {
      console.warn('Lỗi khi xóa kho theo receiptCode & source_type:', err2.message);
    }
  }
};

/** Đồng bộ chi tiết hàng hóa của phiếu nhập sang bảng nhap_xuat_kho */
export const syncInventoryFromPurchaseReceipt = async (params: {
  receiptId: string;
  receiptCode: string;
  ngay: string;
  gio: string;
  coSo: string;
  nguoiThucHien: string;
  items: PurchaseReceiptItem[];
}): Promise<void> => {
  // 1. Dọn dẹp trước để không bao giờ bị ghi trùng (Idempotent cleanup)
  await deleteInventoryByPurchaseReceiptId(params.receiptId, params.receiptCode);

  const cleanItems = params.items
    .map((it) => ({
      ...it,
      ten_san_pham: String(it.ten_san_pham || '').trim(),
      so_luong: Math.max(0, Number(it.so_luong || 0)),
      gia_nhap: Math.max(0, Number(it.gia_nhap || 0)),
    }))
    .filter((it) => it.ten_san_pham && it.so_luong > 0);

  if (cleanItems.length === 0) return;

  const branch = normalizeBranchLabel(params.coSo) || params.coSo;

  // 2. Chuyển đổi thành các dòng nhap_xuat_kho
  const inventoryRows = cleanItems.map((it) => ({
    id_xuat_nhap_kho: params.receiptCode,
    loai_phieu: 'Nhập kho',
    id_don_hang: params.receiptCode,
    co_so: branch,
    ten_mat_hang: it.ten_san_pham,
    ton_dau_ky: 0,
    so_luong: it.so_luong,
    gia: it.gia_nhap,
    tong_tien: it.so_luong * it.gia_nhap,
    ngay: params.ngay,
    gio: params.gio || '00:00',
    nguoi_thuc_hien: params.nguoiThucHien || 'Hệ thống',
    source_type: 'purchase_receipt',
    source_id: params.receiptId,
    source_line_id: it.id || null,
  }));

  const { error } = await supabase.from('nhap_xuat_kho').insert(inventoryRows);
  if (error) {
    if (error.message.includes('column') || error.message.includes('source_')) {
      console.warn('Fallback: insert nhap_xuat_kho without source columns pending migration');
      const fallbackRows = inventoryRows.map((r) => {
        const copy: Record<string, unknown> = { ...r };
        delete copy.source_type;
        delete copy.source_id;
        delete copy.source_line_id;
        return copy;
      });
      const { error: fallbackError } = await supabase.from('nhap_xuat_kho').insert(fallbackRows);
      if (fallbackError) {
        console.error('Lỗi khi đồng bộ kho (fallback):', fallbackError);
        throw fallbackError;
      }
    } else {
      console.error('Lỗi khi đồng bộ chi tiết phiếu nhập sang kho:', error);
      throw error;
    }
  }

  // 3. Tự động cập nhật / tạo tên phụ tùng vào ds_san_pham nếu chưa có
  const productsToUpsert = cleanItems.map((it) => ({
    ten_san_pham: it.ten_san_pham,
    gia: it.gia_nhap,
  }));

  const { error: productError } = await supabase
    .from('ds_san_pham')
    .upsert(productsToUpsert, { onConflict: 'ten_san_pham' });

  if (productError) {
    console.error('Lỗi khi cập nhật ds_san_pham từ phiếu nhập:', productError);
    throw new Error(`Không thể cập nhật danh mục phụ tùng: ${productError.message}`);
  }
};

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

/** Lập phiếu nhập hàng mới (ưu tiên Atomic RPC) */
export const createPurchaseReceipt = async (
  formData: PurchaseReceiptFormData
): Promise<PurchaseReceipt> => {
  const cleanItems = formData.items
    .map((it) => ({
      san_pham_id: it.san_pham_id || null,
      ten_san_pham: it.ten_san_pham.trim(),
      so_luong: Math.max(1, Number(it.so_luong || 1)),
      gia_nhap: Math.max(0, Number(it.gia_nhap || 0)),
      thanh_tien: Math.max(1, Number(it.so_luong || 1)) * Math.max(0, Number(it.gia_nhap || 0)),
    }))
    .filter((it) => it.ten_san_pham);

  if (cleanItems.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một mặt hàng hợp lệ.');
  }

  // 1. Thử thực thi Atomic RPC qua save_purchase_receipt
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('save_purchase_receipt', {
      p_receipt: {
        ma_phieu: formData.ma_phieu,
        ngay: formData.ngay,
        gio: formData.gio || '00:00',
        co_so: formData.co_so,
        nha_cung_cap: formData.nha_cung_cap?.trim() || null,
        nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
        ghi_chu: formData.ghi_chu?.trim() || null,
        items: cleanItems,
      },
    });

    if (!rpcError && rpcData) {
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
    }

    if (rpcError && rpcError.code === '23505') {
      // Race condition trùng mã phiếu -> thử lại với mã mới sinh
      const newCode = await getNextPurchaseReceiptCode();
      return createPurchaseReceipt({ ...formData, ma_phieu: newCode });
    }

    // Nếu lỗi không phải do thiếu RPC (42883) thì báo lỗi cụ thể
    if (rpcError && rpcError.code !== '42883') {
      console.error('Lỗi RPC save_purchase_receipt:', rpcError);
      throw new Error(`Lỗi lưu phiếu nhập: ${rpcError.message}`);
    }
  } catch (err) {
    if ((err as Error)?.message?.includes('Lỗi lưu phiếu nhập')) {
      throw err;
    }
    console.warn('RPC save_purchase_receipt chưa khả dụng, chuyển sang fallback client-side');
  }

  // 2. Fallback client-side (với retry chống trùng mã 23505)
  const totalAmount = cleanItems.reduce((sum, it) => sum + it.thanh_tien, 0);
  let maPhieu = formData.ma_phieu?.trim();
  if (!maPhieu) {
    maPhieu = await getNextPurchaseReceiptCode();
  }

  const headerPayload = {
    ma_phieu: maPhieu,
    ngay: formData.ngay,
    gio: formData.gio || '00:00',
    co_so: formData.co_so,
    nha_cung_cap: formData.nha_cung_cap?.trim() || null,
    nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
    ghi_chu: formData.ghi_chu?.trim() || null,
    tong_tien: totalAmount,
  };

  const { data: header, error: headerError } = await supabase
    .from('phieu_nhap_hang')
    .insert(headerPayload)
    .select()
    .single();

  if (headerError) {
    if (headerError.code === '23505') {
      const retryCode = await getNextPurchaseReceiptCode();
      return createPurchaseReceipt({ ...formData, ma_phieu: retryCode });
    }
    console.error('Lỗi khi tạo phiếu nhập hàng:', headerError);
    throw new Error(`Không thể tạo phiếu nhập hàng: ${headerError.message}`);
  }

  const receiptId = header.id;

  const detailPayload = cleanItems.map((it) => ({
    phieu_nhap_id: receiptId,
    san_pham_id: it.san_pham_id,
    ten_san_pham: it.ten_san_pham,
    so_luong: it.so_luong,
    gia_nhap: it.gia_nhap,
    thanh_tien: it.thanh_tien,
  }));

  const { data: insertedItems, error: detailError } = await supabase
    .from('phieu_nhap_hang_ct')
    .insert(detailPayload)
    .select();

  if (detailError) {
    console.error('Lỗi khi lưu chi tiết phiếu nhập hàng:', detailError);
    await supabase.from('phieu_nhap_hang').delete().eq('id', receiptId);
    throw new Error(`Không thể lưu chi tiết phiếu nhập: ${detailError.message}`);
  }

  const finalItems = (insertedItems as PurchaseReceiptItem[]) || cleanItems;
  await syncInventoryFromPurchaseReceipt({
    receiptId,
    receiptCode: maPhieu,
    ngay: formData.ngay,
    gio: formData.gio || '00:00',
    coSo: formData.co_so,
    nguoiThucHien: formData.nguoi_thuc_hien,
    items: finalItems,
  });

  return {
    ...header,
    items: finalItems,
    tong_so_luong: cleanItems.reduce((sum, it) => sum + it.so_luong, 0),
  };
};

/** Cập nhật phiếu nhập hàng (ưu tiên Atomic RPC) */
export const updatePurchaseReceipt = async (
  id: string,
  formData: PurchaseReceiptFormData
): Promise<PurchaseReceipt> => {
  const cleanItems = formData.items
    .map((it) => ({
      san_pham_id: it.san_pham_id || null,
      ten_san_pham: it.ten_san_pham.trim(),
      so_luong: Math.max(1, Number(it.so_luong || 1)),
      gia_nhap: Math.max(0, Number(it.gia_nhap || 0)),
      thanh_tien: Math.max(1, Number(it.so_luong || 1)) * Math.max(0, Number(it.gia_nhap || 0)),
    }))
    .filter((it) => it.ten_san_pham);

  if (cleanItems.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một mặt hàng hợp lệ.');
  }

  // 1. Thử gọi Atomic RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('save_purchase_receipt', {
      p_receipt: {
        id,
        ma_phieu: formData.ma_phieu,
        ngay: formData.ngay,
        gio: formData.gio || '00:00',
        co_so: formData.co_so,
        nha_cung_cap: formData.nha_cung_cap?.trim() || null,
        nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
        ghi_chu: formData.ghi_chu?.trim() || null,
        items: cleanItems,
      },
    });

    if (!rpcError && rpcData) {
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
    }

    if (rpcError && rpcError.code !== '42883') {
      console.error('Lỗi RPC update save_purchase_receipt:', rpcError);
      throw new Error(`Lỗi cập nhật phiếu: ${rpcError.message}`);
    }
  } catch (err) {
    if ((err as Error)?.message?.includes('Lỗi cập nhật phiếu')) {
      throw err;
    }
    console.warn('RPC chưa khả dụng, thực hiện update qua client fallback');
  }

  // 2. Fallback client-side
  const totalAmount = cleanItems.reduce((sum, it) => sum + it.thanh_tien, 0);

  const headerPayload = {
    ngay: formData.ngay,
    gio: formData.gio || '00:00',
    co_so: formData.co_so,
    nha_cung_cap: formData.nha_cung_cap?.trim() || null,
    nguoi_thuc_hien: formData.nguoi_thuc_hien?.trim() || null,
    ghi_chu: formData.ghi_chu?.trim() || null,
    tong_tien: totalAmount,
    updated_at: new Date().toISOString(),
  };

  const { data: header, error: headerError } = await supabase
    .from('phieu_nhap_hang')
    .update(headerPayload)
    .eq('id', id)
    .select()
    .single();

  if (headerError) {
    console.error('Lỗi khi cập nhật phiếu nhập hàng:', headerError);
    throw new Error(`Lỗi cập nhật phiếu: ${headerError.message}`);
  }

  const { error: deleteOldError } = await supabase
    .from('phieu_nhap_hang_ct')
    .delete()
    .eq('phieu_nhap_id', id);

  if (deleteOldError) {
    console.error('Lỗi khi dọn dẹp chi tiết cũ:', deleteOldError);
    throw new Error(`Lỗi dọn chi tiết cũ: ${deleteOldError.message}`);
  }

  const detailPayload = cleanItems.map((it) => ({
    phieu_nhap_id: id,
    san_pham_id: it.san_pham_id,
    ten_san_pham: it.ten_san_pham,
    so_luong: it.so_luong,
    gia_nhap: it.gia_nhap,
    thanh_tien: it.thanh_tien,
  }));

  const { data: insertedItems, error: detailError } = await supabase
    .from('phieu_nhap_hang_ct')
    .insert(detailPayload)
    .select();

  if (detailError) {
    console.error('Lỗi khi lưu chi tiết mới:', detailError);
    throw new Error(`Lỗi lưu chi tiết mới: ${detailError.message}`);
  }

  const finalItems = (insertedItems as PurchaseReceiptItem[]) || cleanItems;
  await syncInventoryFromPurchaseReceipt({
    receiptId: id,
    receiptCode: header.ma_phieu,
    ngay: formData.ngay,
    gio: formData.gio || '00:00',
    coSo: formData.co_so,
    nguoiThucHien: formData.nguoi_thuc_hien,
    items: finalItems,
  });

  return {
    ...header,
    items: finalItems,
    tong_so_luong: cleanItems.reduce((sum, it) => sum + it.so_luong, 0),
  };
};

/** Xóa phiếu nhập hàng (ưu tiên Atomic RPC) */
export const deletePurchaseReceipt = async (id: string, maPhieu?: string): Promise<void> => {
  // 1. Thử gọi Atomic RPC
  try {
    const { error: rpcError } = await supabase.rpc('delete_purchase_receipt', {
      p_receipt_id: id,
    });
    if (!rpcError) return;
    if (rpcError.code !== '42883') {
      console.error('Lỗi RPC delete_purchase_receipt:', rpcError);
      throw new Error(`Lỗi xóa phiếu nhập: ${rpcError.message}`);
    }
  } catch (err) {
    if ((err as Error)?.message?.includes('Lỗi xóa phiếu nhập')) {
      throw err;
    }
    console.warn('RPC delete chưa khả dụng, thực hiện delete qua client fallback');
  }

  // 2. Fallback client-side
  await deleteInventoryByPurchaseReceiptId(id, maPhieu);

  const { error } = await supabase.from('phieu_nhap_hang').delete().eq('id', id);
  if (error) {
    console.error('Lỗi khi xóa phiếu nhập hàng:', error);
    throw new Error(`Lỗi xóa phiếu nhập: ${error.message}`);
  }
};
