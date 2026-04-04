import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { addInventoryRecord } from '../../../data/inventoryData';

interface AddInventoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddInventoryDialog: React.FC<AddInventoryDialogProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    id_xuat_nhap_kho: '',
    loai_phieu: 'Nhập kho',
    id_don_hang: '',
    co_so: 'Cơ sở Bắc Giang',
    ten_mat_hang: '',
    so_luong: 0,
    gia: 0,
    ngay: new Date().toISOString().split('T')[0],
    gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    nguoi_thuc_hien: ''
  });

  const [tongTien, setTongTien] = useState(0);

  useEffect(() => {
    setTongTien(formData.so_luong * formData.gia);
  }, [formData.so_luong, formData.gia]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ten_mat_hang) {
      setError('Vui lòng nhập tên mặt hàng');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await addInventoryRecord({
        ...formData,
        tong_tien: tongTien
      });
      onSuccess();
    } catch (err) {
      setError('Đã xảy ra lỗi khi lưu dữ liệu. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
          <h2 className="text-xl font-bold text-foreground">Thêm Phiếu Mới</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 text-sm border border-red-100 dark:bg-red-950/20 dark:border-red-900/30">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Loại phiếu */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Loại phiếu</label>
              <select
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.loai_phieu}
                onChange={(e) => setFormData(prev => ({ ...prev, loai_phieu: e.target.value }))}
              >
                <option value="Nhập kho">Nhập kho</option>
                <option value="Phiếu nhập">Phiếu nhập</option>
              </select>
            </div>

            {/* Mã Phiếu */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Mã Phiếu Xuất/Nhập</label>
              <input
                type="text"
                placeholder="VD: NK-001"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-bold text-blue-600"
                value={formData.id_xuat_nhap_kho}
                onChange={(e) => setFormData(prev => ({ ...prev, id_xuat_nhap_kho: e.target.value }))}
              />
            </div>

            {/* Cơ sở */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Cơ sở</label>
              <select
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.co_so}
                onChange={(e) => setFormData(prev => ({ ...prev, co_so: e.target.value }))}
              >
                <option value="Cơ sở Bắc Giang">Cơ sở Bắc Giang</option>
                <option value="Cơ sở Bắc Ninh">Cơ sở Bắc Ninh</option>
              </select>
            </div>

            {/* ID đơn hàng */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">ID Đơn hàng</label>
              <input
                type="text"
                placeholder="Ví dụ: ĐH-001"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.id_don_hang}
                onChange={(e) => setFormData(prev => ({ ...prev, id_don_hang: e.target.value }))}
              />
            </div>

            {/* Tên mặt hàng */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Tên mặt hàng</label>
              <input
                type="text"
                placeholder="Nhập tên sản phẩm..."
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.ten_mat_hang}
                onChange={(e) => setFormData(prev => ({ ...prev, ten_mat_hang: e.target.value }))}
                required
              />
            </div>

            {/* Số lượng */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Số lượng</label>
              <input
                type="number"
                min="0"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.so_luong}
                onChange={(e) => setFormData(prev => ({ ...prev, so_luong: Number(e.target.value) }))}
              />
            </div>

            {/* Giá */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Giá (VNĐ)</label>
              <input
                type="number"
                min="0"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.gia}
                onChange={(e) => setFormData(prev => ({ ...prev, gia: Number(e.target.value) }))}
              />
            </div>

            {/* Ngày */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Ngày</label>
              <input
                type="date"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.ngay}
                onChange={(e) => setFormData(prev => ({ ...prev, ngay: e.target.value }))}
              />
            </div>

            {/* Giờ */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Giờ</label>
              <input
                type="time"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.gio}
                onChange={(e) => setFormData(prev => ({ ...prev, gio: e.target.value }))}
              />
            </div>

            {/* Người thực hiện */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Người thực hiện</label>
              <input
                type="text"
                placeholder="Tên nhân viên..."
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                value={formData.nguoi_thuc_hien}
                onChange={(e) => setFormData(prev => ({ ...prev, nguoi_thuc_hien: e.target.value }))}
              />
            </div>

            {/* Tổng tiền (Computed) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Tổng tiền</label>
              <div className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-primary">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tongTien)}
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-border hover:bg-muted transition-all text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Save size={18} />
              )}
              Lưu phiếu
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddInventoryDialog;
