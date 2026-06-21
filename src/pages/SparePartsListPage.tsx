import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit2, Loader2, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import {
  deleteProductRecord,
  getProductRecords,
  type ProductRecord,
  upsertProductRecord,
} from '../data/inventoryData';

const formatNumber = (n: number): string =>
  new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

type FormState = {
  id?: string;
  ma_san_pham: string;
  ten_san_pham: string;
  don_vi_tinh: string;
  ton_dau_ky: string;
};

function emptyForm(): FormState {
  return { ma_san_pham: '', ten_san_pham: '', don_vi_tinh: 'Cái', ton_dau_ky: '0' };
}

const SparePartsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProductRecords();
      setRows(data);
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

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (p: ProductRecord) => {
    setForm({
      id: p.id,
      ma_san_pham: p.ma_san_pham || '',
      ten_san_pham: p.ten_san_pham,
      don_vi_tinh: p.don_vi_tinh || 'Cái',
      ton_dau_ky: String(p.ton_dau_ky ?? 0),
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ten = form.ten_san_pham.trim();
    if (!ten) {
      window.alert('Vui lòng nhập tên phụ tùng.');
      return;
    }
    setSaving(true);
    try {
      await upsertProductRecord({
        id: form.id,
        ma_san_pham: form.ma_san_pham.trim() || null,
        ten_san_pham: ten,
        don_vi_tinh: form.don_vi_tinh.trim() || 'Cái',
        ton_dau_ky: Number(form.ton_dau_ky.replace(/\D/g, '') || 0),
      });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      window.alert('Không lưu được phụ tùng. Kiểm tra tên trùng hoặc quyền truy cập.');
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
                <th className="px-4 py-3 font-semibold text-right">Tồn đầu kỳ</th>
                {isAdmin && (
                  <th className="px-4 py-3 font-semibold text-center w-24">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="animate-spin inline-block mr-2" size={20} />
                    Đang tải...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-muted-foreground">
                    {search ? 'Không tìm thấy phụ tùng khớp.' : 'Chưa có phụ tùng nào.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{p.ma_san_pham || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{p.ten_san_pham}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.don_vi_tinh || 'Cái'}</td>
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
                  onChange={(e) => setForm((f) => ({ ...f, ma_san_pham: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  placeholder="Tùy chọn"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  Tên phụ tùng <span className="text-red-500">*</span>
                </span>
                <input
                  value={form.ten_san_pham}
                  onChange={(e) => setForm((f) => ({ ...f, ten_san_pham: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
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
