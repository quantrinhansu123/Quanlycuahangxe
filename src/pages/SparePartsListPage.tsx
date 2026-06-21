import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit2, Loader2, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import {
  deleteProductRecord,
  formatProductSaveError,
  getNextProductCode,
  getProductRecords,
  type ProductRecord,
  upsertProductRecord,
} from '../data/inventoryData';
import type { DichVu } from '../data/serviceData';
import { getServices } from '../data/serviceData';

const formatNumber = (n: number): string =>
  new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

type FormState = {
  id?: string;
  ma_san_pham: string;
  ten_san_pham: string;
  don_vi_tinh: string;
  gia: string;
  ton_dau_ky: string;
};

function emptyForm(): FormState {
  return { ma_san_pham: '', ten_san_pham: '', don_vi_tinh: 'Cái', gia: '0', ton_dau_ky: '0' };
}

const SparePartsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [services, setServices] = useState<DichVu[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [data, svc] = await Promise.all([getProductRecords(), getServices()]);
      setRows(data);
      setServices(svc);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.ten_san_pham.toLowerCase().includes(q) ||
        (r.ma_san_pham || '').toLowerCase().includes(q) ||
        (r.don_vi_tinh || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const usedProductNames = useMemo(
    () => new Set(rows.map((r) => r.ten_san_pham.trim().toLowerCase())),
    [rows]
  );

  const serviceOptions = useMemo(() => {
    const uniqueMap = new Map<string, DichVu>();
    services.forEach((s) => {
      if (s.ten_dich_vu && !uniqueMap.has(s.ten_dich_vu)) {
        uniqueMap.set(s.ten_dich_vu, s);
      }
    });
    const opts = Array.from(uniqueMap.values())
      .filter((s) => {
        if (form.ten_san_pham && s.ten_dich_vu === form.ten_san_pham) return true;
        return !usedProductNames.has(s.ten_dich_vu.trim().toLowerCase());
      })
      .map((s) => ({
        value: s.ten_dich_vu,
        label: `${s.id_dich_vu || 'DV'}: ${s.ten_dich_vu}`,
        searchKey: `${s.ten_dich_vu} ${s.id_dich_vu || ''} ${s.co_so || ''}`,
      }));

    if (form.ten_san_pham && !opts.some((o) => o.value === form.ten_san_pham)) {
      opts.unshift({ value: form.ten_san_pham, label: form.ten_san_pham, searchKey: form.ten_san_pham });
    }
    return opts;
  }, [services, usedProductNames, form.ten_san_pham]);

  const openCreate = async () => {
    const nextCode = await getNextProductCode();
    setForm({ ...emptyForm(), ma_san_pham: nextCode });
    setModalOpen(true);
  };

  const openEdit = (p: ProductRecord) => {
    setForm({
      id: p.id,
      ma_san_pham: p.ma_san_pham || '',
      ten_san_pham: p.ten_san_pham,
      don_vi_tinh: p.don_vi_tinh || 'Cái',
      gia: String(p.gia ?? 0),
      ton_dau_ky: String(p.ton_dau_ky ?? 0),
    });
    setModalOpen(true);
  };

  const handleServiceSelect = (val: string) => {
    const svc = services.find((s) => s.ten_dich_vu === val);
    setForm((f) => ({
      ...f,
      ten_san_pham: val,
      gia: svc ? String(svc.gia_nhap ?? 0) : f.gia,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ten = form.ten_san_pham.trim();
    if (!ten) {
      window.alert('Vui lòng chọn tên phụ tùng từ danh sách dịch vụ.');
      return;
    }
    setSaving(true);
    try {
      const maSanPham =
        form.ma_san_pham.trim() || (!form.id ? await getNextProductCode() : '');
      await upsertProductRecord({
        id: form.id,
        ma_san_pham: maSanPham || null,
        ten_san_pham: ten,
        don_vi_tinh: form.don_vi_tinh.trim() || 'Cái',
        gia: Number(form.gia.replace(/\D/g, '') || 0),
        ton_dau_ky: Number(form.ton_dau_ky.replace(/\D/g, '') || 0),
      });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      window.alert(formatProductSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: ProductRecord) => {
    if (!window.confirm(`Xóa phụ tùng "${p.ten_san_pham}"?`)) return;
    try {
      await deleteProductRecord(p.id);
      await loadData();
    } catch (err) {
      console.error(err);
      window.alert('Không xóa được phụ tùng.');
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col gap-4 p-4 lg:p-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/kho-van')}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[13px] text-muted-foreground hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2 min-w-0">
            <Package className="w-6 h-6 text-teal-600 shrink-0" />
            <span className="truncate">Danh sách phụ tùng</span>
          </h1>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 shrink-0"
          >
            <Plus size={18} /> Thêm phụ tùng
          </button>
        )}
      </div>

      <div className="bg-card p-3 rounded-xl border border-border shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã, tên phụ tùng..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-background outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex-1 min-h-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 border-b border-border text-muted-foreground text-xs font-bold uppercase">
                <th className="px-4 py-3 font-semibold">Mã phụ tùng</th>
                <th className="px-4 py-3 font-semibold">Tên phụ tùng</th>
                <th className="px-4 py-3 font-semibold">ĐVT</th>
                <th className="px-4 py-3 font-semibold text-right">Giá</th>
                <th className="px-4 py-3 font-semibold text-right">Tồn đầu kỳ</th>
                {isAdmin && (
                  <th className="px-4 py-3 font-semibold text-center w-24">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="animate-spin inline-block mr-2" size={20} />
                    Đang tải...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                    {search ? 'Không tìm thấy phụ tùng khớp.' : 'Chưa có phụ tùng nào.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{p.ma_san_pham || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.ten_san_pham}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.don_vi_tinh || 'Cái'}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-primary">
                      {formatNumber(p.gia ?? 0)}đ
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{formatNumber(p.ton_dau_ky)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded text-primary hover:bg-primary/10"
                            title="Sửa"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded text-destructive hover:bg-destructive/10"
                            title="Xóa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {filtered.length} phụ tùng
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold">{form.id ? 'Sửa phụ tùng' : 'Thêm phụ tùng'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-muted">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">Mã phụ tùng</span>
                <input
                  value={form.ma_san_pham}
                  readOnly
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted font-mono font-bold text-primary cursor-default"
                  placeholder="Tự sinh khi lưu"
                />
                {!form.id && (
                  <p className="text-[11px] text-muted-foreground">Mã tự sinh theo thứ tự PT-0001, PT-0002...</p>
                )}
              </label>
              <div className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  Tên phụ tùng <span className="text-red-500">*</span>
                </span>
                <SearchableSelect
                  options={serviceOptions}
                  value={form.ten_san_pham || ''}
                  onValueChange={handleServiceSelect}
                  placeholder="Chọn từ danh sách dịch vụ..."
                  searchPlaceholder="Tìm tên hoặc mã dịch vụ..."
                  emptyMessage="Không có dịch vụ khả dụng."
                />
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">Giá</span>
                <div className="relative">
                  <input
                    value={Number(form.gia.replace(/\D/g, '') || 0).toLocaleString('vi-VN')}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, gia: e.target.value.replace(/\D/g, '') }))
                    }
                    inputMode="numeric"
                    className="w-full px-3 py-2 pr-8 border border-border rounded-lg text-sm bg-background text-right font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    đ
                  </span>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">Đơn vị tính</span>
                <input
                  value={form.don_vi_tinh}
                  onChange={(e) => setForm((f) => ({ ...f, don_vi_tinh: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">Tồn đầu kỳ</span>
                <input
                  value={form.ton_dau_ky}
                  onChange={(e) => setForm((f) => ({ ...f, ton_dau_ky: e.target.value.replace(/[^\d]/g, '') }))}
                  inputMode="numeric"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-right font-mono"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={clsx(
                    'px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold',
                    saving && 'opacity-60'
                  )}
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SparePartsListPage;
