import {
  ArrowLeft,
  Building2,
  Calculator,
  Download,
  Edit2,
  FileText,
  Loader2,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { getCustomers } from '../data/customerData';
import type { SalesCardCT } from '../data/salesCardCTData';
import { bulkUpsertSalesCardCTs, deleteSalesCardCT, getSalesCardCTsPaginated, upsertSalesCardCT, deleteAllSalesCardCTs } from '../data/salesCardCTData';
import Pagination from '../components/Pagination';
import type { SalesCard } from '../data/salesCardData';
import { getSalesCards } from '../data/salesCardData'; // Header cards
import type { DichVu } from '../data/serviceData';
import { bulkUpsertServices, getServices } from '../data/serviceData'; // Services data

const SalesCardCTManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SalesCardCT[]>([]);
  const [salesCards, setSalesCards] = useState<SalesCard[]>([]);
  const [services, setServices] = useState<DichVu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SalesCardCT | null>(null);
  const [formData, setFormData] = useState<Partial<SalesCardCT>>({});

  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];

  const loadData = async () => {
    try {
      setLoading(true);
      const [ctsResult, cards, servs] = await Promise.all([
        getSalesCardCTsPaginated(currentPage, pageSize, searchQuery),
        getSalesCards(),
        getServices()
      ]);
      setItems(ctsResult.data);
      setTotalCount(ctsResult.totalCount);
      setSalesCards(cards);
      setServices(servs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPage, pageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage !== 1) setCurrentPage(1);
      else loadData();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Since we use Server-side pagination, 'items' IS already the filtered list for the current page
  const displayItems = items;

  const handleOpenModal = (item?: SalesCardCT) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item });
    } else {
      setEditingItem(null);
      setFormData({
        don_hang_id: '',
        ten_don_hang: '',
        san_pham: '',
        co_so: 'Cơ sở Bắc Giang',
        ghi_chu: '',
        gia_ban: 0,
        gia_von: 0,
        so_luong: 1,
        chi_phi: 0,
        ngay: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['gia_ban', 'gia_von', 'so_luong', 'chi_phi'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { thanh_tien, lai, ...cleanData } = formData as any;
      await upsertSalesCardCT(cleanData);
      await loadData();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu chi tiết phiếu.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "don_hang_id": "",
        "Ngày": "2024-03-24",
        "ID": "Optional: UUID format",
        "Tên đơn hàng": "Bảo dưỡng xe SH 2023",
        "Sản phẩm": "Thay dầu máy",
        "Cơ sở": "Cơ sở Bắc Giang",
        "Giá bán": 150000,
        "Giá vốn": 100000,
        "Số lượng": 1,
        "Chi phí": 0,
        "Ghi chú": "Khách quen"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauSalesCardsCT");
    XLSX.writeFile(workbook, "Mau_nhap_chi_tiet_ban_hang.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const formatExcelDate = (val: any) => {
          if (val === undefined || val === null || val === '') return undefined;
          if (typeof val === 'number' && val > 40000) {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            return d.toISOString().split('T')[0];
          }
          const s = String(val).trim();
          const dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (dateMatch) {
            const p1 = parseInt(dateMatch[1]);
            const p2 = parseInt(dateMatch[2]);
            const p3 = dateMatch[3];
            if (p1 > 12) return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
            if (p2 > 12) return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
            return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          }
          return s || undefined;
        };

        // --- FORCE IMPORT LOGIC ---

        // Pass 1: Auto-create missing Services
        const toUpsertServices: Partial<DichVu>[] = [];
        const seenServiceKeys = new Set<string>();

        data.forEach(item => {
          const norm: any = {};
          Object.keys(item).forEach(k => { norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = item[k]; });
          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const productName = String(getValue(['Sản phẩm', 'sản phẩm', 'dịch vụ', 'item', 'tên sản phẩm']) || '').trim();
          if (productName && !services.find(s => s.ten_dich_vu.toLowerCase() === productName.toLowerCase())) {
            if (!seenServiceKeys.has(productName.toLowerCase())) {
              seenServiceKeys.add(productName.toLowerCase());
              toUpsertServices.push({
                ten_dich_vu: productName,
                gia_nhap: 0,
                gia_ban: 0,
                co_so: 'Cơ sở chính'
              });
            }
          }
        });

        if (toUpsertServices.length > 0) {
          await bulkUpsertServices(toUpsertServices);
        }

        // Re-fetch everything
        const [latestSalesCards, latestCustomers, latestServices] = await Promise.all([
          getSalesCards(),
          getCustomers(),
          getServices()
        ]);

        const formattedData: Partial<SalesCardCT>[] = data.map((item) => {
          const norm: any = {};
          Object.keys(item).forEach(k => { norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = item[k]; });
          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const rawDonHangId = String(getValue(['ID đơn hàng', 'Mã đơn hàng', 'id đơn hàng', 'don_hang_id', 'mã đơn hàng', 'phiếu id', 'mã phiếu', 'id khách hàng']) || '').trim();

          // Match Parent Order
          const parentOrder = latestSalesCards.find(card => {
            const cleanCardId = card.id.replace(/-/g, '').toLowerCase();
            const cleanRawId = rawDonHangId.replace(/-/g, '').toLowerCase();
            const matchOrderId = cleanCardId === cleanRawId || (cleanRawId.length >= 6 && cleanCardId.startsWith(cleanRawId));

            // Also check if the raw ID matches the customer attached to this card
            const customerMatch = latestCustomers.find(c => {
              const cleanCId = c.id.replace(/-/g, '').toLowerCase();
              return cleanCId === cleanRawId || (cleanRawId && c.ma_khach_hang === rawDonHangId);
            });
            return matchOrderId || (customerMatch && card.khach_hang_id === customerMatch.id);
          });

          const productName = String(getValue(['Sản phẩm', 'sản phẩm', 'dịch vụ', 'item', 'tên sản phẩm']) || '').trim();
          const serviceMatch = latestServices.find(s => s.ten_dich_vu.toLowerCase() === productName.toLowerCase());

          let ngay = formatExcelDate(getValue(['Ngày', 'ngày', 'ngày lập', 'ngay', 'date']));
          if (!ngay) ngay = new Date().toISOString().split('T')[0];

          const giaBan = Math.round(Number(getValue(['Giá', 'giá', 'giá bán', 'đơn giá', 'price', 'doanh thu', 'bán'])) || serviceMatch?.gia_ban || 0);
          const giaVon = Math.round(Number(getValue(['Giá vốn', 'giá vốn', 'vốn', 'cost', 'giá nhập'])) || serviceMatch?.gia_nhap || 0);
          const soLuong = Math.round(Number(getValue(['Số lượng', 'số lượng', 'sl', 'quantity'])) || 1);
          const chiPhi = Math.round(Number(getValue(['Chi phí', 'chi phí', 'phát sinh', 'overhead', 'chi phí phụ'])) || 0);

          const res: any = {
            don_hang_id: parentOrder?.id || null, // Allow orphaned records
            ngay,
            ten_don_hang: getValue(['Tên đơn hàng', 'tên đơn hàng', 'đơn hàng', 'tên phiếu', 'tên đơn', 'nội dung', 'lý do', 'order name', 'tên thẻ']) || (parentOrder ? `Đơn hàng ${parentOrder.id.slice(0, 8)}` : 'Đơn hàng từ Excel'),
            san_pham: productName || 'Sản phẩm lẻ',
            co_so: getValue(['Cơ sở', 'cơ sở', 'chi nhánh', 'branch']) || 'Cơ sở Bắc Giang',
            gia_ban: giaBan,
            gia_von: giaVon,
            so_luong: soLuong,
            chi_phi: chiPhi,
            ghi_chu: getValue(['Ghi chú', 'ghi chú', 'note', 'nhận xét']) || ''
          };

          const rawId = String(getValue(['id', 'mã', 'uuid', 'mã chi tiết']) || '').trim();
          if (rawId.length >= 32) res.id = rawId;
          return res;
        }).filter(Boolean) as Partial<SalesCardCT>[];

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertSalesCardCTs(formattedData);
          await loadData();
          alert(`🚀 THÀNH CÔNG: Đã nhập ${formattedData.length} hạng mục chi tiết.\n\nĐã tự động tạo ${toUpsertServices.length} sản phẩm/dịch vụ mới.`);
        } else {
          alert(`❌ Không tìm thấy dữ liệu hợp lệ (Thiếu liên kết Đơn hàng gốc).`);
        }
      } catch (error) {
        console.error(error);
        alert("Lỗi khi đọc file Excel.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDeleteAll = async () => {
    if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu chi tiết bán hàng. Bạn có chắc chắn muốn tiếp tục?')) {
      try {
        setLoading(true);
        await deleteAllSalesCardCTs();
        await loadData();
        alert('Đã xóa toàn bộ dữ liệu.');
      } catch (error) {
        alert('Lỗi: Không thể xóa toàn bộ dữ liệu.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa hạng mục này?')) {
      try {
        await deleteSalesCardCT(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa hạng mục.');
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pt-8">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <FileText size={24} />
            </div>
            Thẻ bán hàng CT (Chi tiết)
          </h1>
        </div>

        {/* Toolbar */}
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors">
              <ArrowLeft size={18} /> Quay lại
            </button>
            <div className="relative w-full sm:w-[350px]">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
                <Search size={18} />
              </div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
                placeholder="Tìm sản phẩm, tên đơn hàng..."
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                title="Tải mẫu Excel"
              >
                <Download size={18} />
                <span>Tải mẫu</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => document.getElementById('excel-import')?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                  title="Nhập chi tiết từ Excel"
                >
                  <Upload size={18} />
                  <span>Nhập Excel</span>
                </button>
                <input
                  id="excel-import"
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={handleImportExcel}
                />
              </div>
            </div>

            <button
              onClick={handleDeleteAll}
              className="px-3 py-1.5 border border-red-200 rounded text-[13px] text-red-600 hover:bg-red-50 transition-colors font-medium bg-white flex items-center gap-2"
              title="Xóa toàn bộ dữ liệu"
            >
              <Trash2 size={18} />
              <span>Xóa tất cả</span>
            </button>

            <button
              onClick={() => handleOpenModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors shadow-lg shadow-blue-500/20"
            >
              <Plus size={20} /> Thêm hạng mục CT
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Ngày</th>
                  <th className="px-4 py-3 font-semibold">Tên đơn hàng</th>
                  <th className="px-4 py-3 font-semibold">Sản phẩm</th>
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá bán</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá vốn</th>
                  <th className="px-4 py-3 font-semibold text-center">SL</th>
                  <th className="px-4 py-3 font-semibold text-right">Thành tiền</th>
                  <th className="px-4 py-3 font-semibold text-right text-emerald-600">Lãi</th>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu chi tiết...
                    </td>
                  </tr>
                ) : displayItems.map(item => (
                  <tr key={item.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4">{new Date(item.ngay).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-4 font-bold text-foreground truncate max-w-[150px]">{item.ten_don_hang || '—'}</td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-blue-600">{item.san_pham}</div>
                      {item.ghi_chu && <div className="text-[11px] text-muted-foreground">{item.ghi_chu}</div>}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{item.co_so}</td>
                    <td className="px-4 py-4 text-right font-medium">{formatCurrency(item.gia_ban)}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{formatCurrency(item.gia_von)}</td>
                    <td className="px-4 py-4 text-center font-bold">x{item.so_luong}</td>
                    <td className="px-4 py-4 text-right font-black text-foreground">{formatCurrency(item.thanh_tien)}</td>
                    <td className="px-4 py-4 text-right font-black text-emerald-600">{formatCurrency(item.lai)}</td>
                    <td className="px-4 py-4 font-mono text-[10px] text-muted-foreground max-w-[80px] truncate" title={item.id}>
                      {item.id}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleOpenModal(item)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && displayItems.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Chưa có hạng mục chi tiết nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination 
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            loading={loading}
          />
        </div>
      </div>

      {/* Modal - CT Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex: 1000 }}>
          <div className="bg-card w-full max-w-3xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-blue-600/5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Calculator className="text-blue-600" size={20} />
                {editingItem ? 'Sửa Hạng mục CT' : 'Thêm Hạng mục Bán hàng CT'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Link to Order Header */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Chọn Đơn hàng (ID)</label>
                    <select
                      name="don_hang_id" value={formData.don_hang_id || ''} onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                    >
                      <option value="">-- Chọn đơn hàng gốc --</option>
                      {salesCards.map(c => <option key={c.id} value={c.id}>{new Date(c.ngay).toLocaleDateString()} - {c.khach_hang?.ho_va_ten}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tên đơn hàng</label>
                    <input
                      type="text" name="ten_don_hang" value={formData.ten_don_hang || ''} onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                      placeholder="Vd: Bảo dưỡng xe Honda SH..."
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Package size={14} className="text-blue-600" />
                      Sản phẩm / Dịch vụ chi tiết
                    </label>
                    <select
                      name="san_pham" value={formData.san_pham || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const selectedService = services.find(s => s.ten_dich_vu === val);
                        setFormData(prev => ({
                          ...prev,
                          san_pham: val,
                          gia_ban: selectedService?.gia_ban || prev.gia_ban,
                          gia_von: selectedService?.gia_nhap || prev.gia_von,
                          ten_don_hang: prev.ten_don_hang || (val ? `Bán ${val}` : '')
                        }));
                      }}
                      required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold"
                    >
                      <option value="">-- Chọn sản phẩm/dịch vụ --</option>
                      {services.map(s => <option key={s.id} value={s.ten_dich_vu}>{s.ten_dich_vu} ({formatCurrency(s.gia_ban)})</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Building2 size={14} /> Cơ sở
                    </label>
                    <select
                      name="co_so" value={formData.co_so || ''} onChange={handleInputChange} required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                    >
                      {branchOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ngày thực hiện</label>
                    <input
                      type="date" name="ngay" value={formData.ngay || ''} onChange={handleInputChange} required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá bán (Niêm yết)</label>
                    <input
                      type="number" name="gia_ban" value={formData.gia_ban || 0} onChange={handleInputChange} required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-blue-600/20 text-[14px] font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá vốn</label>
                    <input
                      type="number" name="gia_von" value={formData.gia_von || 0} onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Số lượng</label>
                    <input
                      type="number" name="so_luong" value={formData.so_luong || 1} onChange={handleInputChange} required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold uppercase tracking-wider text-rose-500">Chi phí bổ sung</label>
                    <input
                      type="number" name="chi_phi" value={formData.chi_phi || 0} onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 text-[14px]"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ghi chú</label>
                    <textarea
                      name="ghi_chu" value={formData.ghi_chu || ''} onChange={handleInputChange}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] min-h-[80px]"
                    />
                  </div>
                </div>

                {/* Live Preview Calculation */}
                <div className="bg-muted/30 p-4 rounded-2xl flex justify-between items-center border border-border border-dashed">
                  <div className="text-[12px] font-bold text-muted-foreground uppercase">Tạm tính:</div>
                  <div className="flex gap-6">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground uppercase">Thành tiền</div>
                      <div className="text-lg font-black text-foreground">{formatCurrency((formData.gia_ban || 0) * (formData.so_luong || 0))}</div>
                    </div>
                    <div className="text-right border-l border-border pl-6">
                      <div className="text-[10px] text-emerald-600 uppercase">Lãi ước tính</div>
                      <div className="text-lg font-black text-emerald-600">{formatCurrency(((formData.gia_ban || 0) - (formData.gia_von || 0)) * (formData.so_luong || 0))}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
                  <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2">
                    <Save size={18} /> <span>{editingItem ? 'Lưu thay đổi' : 'Lưu hạng mục'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesCardCTManagementPage;
