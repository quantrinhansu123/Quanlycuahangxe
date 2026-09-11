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

/** Tự sinh mã phiếu nhập hàng tiếp theo dạng NH-000001, NH-000002... */
export const getNextPurchaseReceiptCode = async (): Promise<string> => {
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

/** Xóa toàn bộ bản ghi kho liên quan đến một phiếu nhập hàng cụ thể */
export const deleteInventoryByPurchaseReceiptId = async (
  receiptId: string,
  receiptCode?: string
): Promise<void> => {
  if (!receiptId && !receiptCode) return;

  // Xóa theo source_id (chính xác nhất)
  if (receiptId) {
    const { error: err1 } = await supabase
      .from('nhap_xuat_kho')
      .delete()
      .eq('source_type', 'purchase_receipt')
      .eq('source_id', receiptId);

    if (err1) {
      console.warn('Xóa kho theo source_id gặp lỗi (có thể cột chưa được tạo):', err1.message);
    }
  }

  // Dự phòng: Xóa theo id_xuat_nhap_kho = receiptCode nếu là loại Nhập kho
  if (receiptCode) {
    const { error: err2 } = await supabase
      .from('nhap_xuat_kho')
      .delete()
      .eq('id_xuat_nhap_kho', receiptCode)
      .eq('loai_phieu', 'Nhập kho');

    if (err2) {
      console.error('Lỗi khi xóa kho theo receiptCode:', err2);
      throw err2;
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

  // Thử insert kèm source_type, source_id, source_line_id
  const { error } = await supabase.from('nhap_xuat_kho').insert(inventoryRows);
  if (error) {
    // Nếu db chưa chạy migration thêm 3 cột source_*, fallback sang insert không kèm 3 cột đó
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

  try {
    await supabase.from('ds_san_pham').upsert(productsToUpsert, { onConflict: 'ten_san_pham' });
  } catch (err) {
    console.warn('Cập nhật ds_san_pham từ phiếu nhập thất bại (không chặn lưu phiếu):', err);
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

/** Lập phiếu nhập hàng mới */
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

  const totalAmount = cleanItems.reduce((sum, it) => sum + it.thanh_tien, 0);

  // Đảm bảo mã phiếu luôn có và không trùng
  let maPhieu = formData.ma_phieu?.trim();
  if (!maPhieu) {
    maPhieu = await getNextPurchaseReceiptCode();
  }

  // 1. Tạo phiếu master
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
    console.error('Lỗi khi tạo phiếu nhập hàng:', headerError);
    throw headerError;
  }

  const receiptId = header.id;

  // 2. Tạo chi tiết phiếu
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
    // Cố gắng dọn dẹp header vừa tạo để tránh mồ côi
    await supabase.from('phieu_nhap_hang').delete().eq('id', receiptId);
    throw detailError;
  }

  // 3. Đồng bộ sang kho
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

/** Cập nhật phiếu nhập hàng */
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

  const totalAmount = cleanItems.reduce((sum, it) => sum + it.thanh_tien, 0);

  // 1. Cập nhật header
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
    throw headerError;
  }

  // 2. Xóa các chi tiết cũ và thêm lại danh sách mới
  const { error: deleteOldError } = await supabase
    .from('phieu_nhap_hang_ct')
    .delete()
    .eq('phieu_nhap_id', id);

  if (deleteOldError) {
    console.error('Lỗi khi dọn dẹp chi tiết cũ:', deleteOldError);
    throw deleteOldError;
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
    throw detailError;
  }

  // 3. Đồng bộ lại kho (tự động dọn kho cũ và ghi lại kho mới)
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

/** Xóa phiếu nhập hàng và xóa sạch các bản ghi kho tương ứng */
export const deletePurchaseReceipt = async (id: string, maPhieu?: string): Promise<void> => {
  // 1. Xóa các dòng kho tương ứng trước
  await deleteInventoryByPurchaseReceiptId(id, maPhieu);

  // 2. Xóa phiếu master (cascade sẽ xóa phieu_nhap_hang_ct)
  const { error } = await supabase.from('phieu_nhap_hang').delete().eq('id', id);
  if (error) {
    console.error('Lỗi khi xóa phiếu nhập hàng:', error);
    throw error;
  }
};
