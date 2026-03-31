import {
  ArrowLeft,
  Calendar, Clock,
  Download,
  Edit2,
  History,
  Loader2,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Star,
  Trash2,
  Upload,
  User, Wrench,
  X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import type { KhachHang } from '../data/customerData';
import { bulkUpsertCustomers, getCustomers } from '../data/customerData';
import type { NhanSu } from '../data/personnelData';
import { getPersonnel } from '../data/personnelData';
import type { SalesCard } from '../data/salesCardData';
import { bulkUpsertSalesCards, deleteSalesCard, getSalesCardsPaginated, upsertSalesCard } from '../data/salesCardData';
import type { DichVu } from '../data/serviceData';
import { bulkUpsertServices, getServices } from '../data/serviceData';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { MultiSearchableSelect } from '../components/ui/MultiSearchableSelect';
import CustomerFormModal from '../components/CustomerFormModal';
import { bulkUpsertSalesCardCTs } from '../data/salesCardCTData';

const SalesCardManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [salesCards, setSalesCards] = useState<SalesCard[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [services, setServices] = useState<DichVu[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<SalesCard | null>(null);
  const [formData, setFormData] = useState<Partial<SalesCard>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [cardsResult, custData, persData, servData] = await Promise.all([
        getSalesCardsPaginated(currentPage, pageSize, searchQuery),
        customers.length === 0 ? getCustomers() : Promise.resolve(customers),
        personnel.length === 0 ? getPersonnel() : Promise.resolve(personnel),
        services.length === 0 ? getServices() : Promise.resolve(services)
      ]);
      setSalesCards(cardsResult.data);
      setTotalCount(cardsResult.totalCount);
      if (customers.length === 0) setCustomers(custData);
      if (personnel.length === 0) setPersonnel(persData);
      if (services.length === 0) setServices(servData);
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

  // Server-side filtering, so we use salesCards directly
  const displayItems = salesCards;

  const handleOpenModal = (card?: SalesCard) => {
    if (card) {
      setEditingCard(card);
      setFormData({ ...card });
    } else {
      setEditingCard(null);
      setFormData({
        ngay: new Date().toISOString().split('T')[0],
        gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        khach_hang_id: '',
        nhan_vien_id: '',
        dich_vu_id: '',
        dich_vu_ids: [],
        danh_gia: 'hài lòng',
        so_km: 0,
        ngay_nhac_thay_dau: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCard(null);
    setFormData({});
  };

  const handleSubmit = async (formData: Partial<SalesCard & { dich_vu_ids?: string[] }>) => {
    try {
      const { khach_hang, nhan_su, dich_vu, dich_vu_ids, ...cleanData } = formData as any;
      
      // Sanitize date fields to avoid "invalid input syntax for type date" error in Supabase
      if (cleanData.ngay_nhac_thay_dau === '') cleanData.ngay_nhac_thay_dau = null;

      // Set the first service as the primary ID for the master record
      if (dich_vu_ids && dich_vu_ids.length > 0) {
        cleanData.dich_vu_id = dich_vu_ids[0];
      }

      const savedCard = await upsertSalesCard(cleanData);

      // Automatically create detail records for all selected services
      if (dich_vu_ids && dich_vu_ids.length > 0) {
        const detailRecords = dich_vu_ids.map((sId: string) => {
          const service = services.find(s => s.id === sId);
          return {
            don_hang_id: savedCard.id,
            ten_don_hang: `Phiếu bán hàng ${savedCard.id.slice(0, 8)}`,
            san_pham: service?.ten_dich_vu || 'Dịch vụ',
            co_so: service?.co_so || 'Cơ sở chính',
            gia_ban: service?.gia_ban || 0,
            gia_von: service?.gia_nhap || 0,
            so_luong: 1,
            chi_phi: 0,
            ngay: savedCard.ngay
          };
        });
        await bulkUpsertSalesCardCTs(detailRecords);
      }

      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error(error);
      alert('Lỗi: Không thể lưu phiếu bán hàng.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "",
        "Ngày": "2024-03-24",
        "Giờ": "08:30:00",
        "id khách hàng": "",
        "Tên KH": "Nguyễn Văn A",
        "SĐT": "0912345678",
        "Người phụ trách": "Nguyễn Văn B",
        "ĐÁNH GIÁ DỊCH VỤ": "hài lòng",
        "Dịch vụ sử dụng": "Thay dầu máy",
        "Số Km": 12000,
        "Ngày nhắc thay dầu": "2024-05-24"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauSalesCards");
    XLSX.writeFile(workbook, "Mau_nhap_phieu_ban_hang.xlsx");
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
          // Intelligent Date Parser (supports DD/MM/YYYY and MM/DD/YYYY)
          const dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (dateMatch) {
            const p1 = parseInt(dateMatch[1]);
            const p2 = parseInt(dateMatch[2]);
            const p3 = dateMatch[3];
            if (p1 > 12) { // Format: DD/MM/YYYY
              return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
            } else if (p2 > 12) { // Format: MM/DD/YYYY
              return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
            } else { // Ambiguous (both <= 12), assume DD/MM/YYYY
              return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
            }
          }
          return s || undefined;
        };

        const formatExcelTime = (val: any) => {
          if (val === undefined || val === null || val === '') return null;
          if (typeof val === 'number') {
            const totalSeconds = Math.round(val * 24 * 3600);
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          }
          const str = String(val).trim();
          if (!str) return null;

          const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(:(\d{2}))?\s*(AM|PM|SA|CH)$/i);
          if (ampmMatch) {
            let h = parseInt(ampmMatch[1]);
            const m = ampmMatch[2];
            const s = ampmMatch[4] || '00';
            const suffix = ampmMatch[5].toUpperCase();
            const p = (suffix === 'CH' || suffix === 'PM') ? 'PM' : 'AM';
            if (p === 'PM' && h < 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:${m}:${s}`;
          }

          if (str.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
            return str.split(':').map(v => v.padStart(2, '0')).join(':');
          }

          if (str.match(/^\d{1,2}:\d{2}$/)) {
            return str.split(':').map(v => v.padStart(2, '0')).join(':') + ':00';
          }
          return str;
        };

        const cleanPhone = (p: any) => String(p || '').replace(/\D/g, '');

        // --- FORCE IMPORT LOGIC ---

        // Prep work: Create placeholder customers & services for unrecognized ones
        const toUpsertCustomers: Partial<KhachHang>[] = [];
        const seenCustKeys = new Set<string>();

        const toUpsertServices: Partial<DichVu>[] = [];
        const seenServiceKeys = new Set<string>();

        data.forEach(row => {
          const norm: any = {};
          Object.keys(row).forEach(k => { norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = row[k]; });
          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const rawCustId = String(getValue(['id khách hàng', 'mã khách hàng', 'cust id', 'khách hàng id', 'don_hang_id']) || '').trim();
          const sdtKhach = cleanPhone(getValue(['sđt', 'số điện thoại', 'phone', 'sdt']));
          const tenKhach = String(getValue(['tên kh', 'khách hàng', 'tên khách hàng', 'họ và tên', 'họ tên', 'người mua']) || '').trim();

          const exists = customers.find(c => {
            const cId = c.id.replace(/-/g, '').toLowerCase();
            const rId = rawCustId.replace(/-/g, '').toLowerCase();
            const matchId = (rId && cId === rId) || (rId && rId.length >= 6 && cId.startsWith(rId)) || (rawCustId && c.ma_khach_hang === rawCustId);
            const matchPhone = sdtKhach && cleanPhone(c.so_dien_thoai) === sdtKhach;
            const matchName = tenKhach && c.ho_va_ten.toLowerCase() === tenKhach.toLowerCase();
            return matchId || matchPhone || matchName;
          });

          if (!exists && (tenKhach || sdtKhach || rawCustId)) {
            const key = `${tenKhach}-${sdtKhach}-${rawCustId}`;
            if (!seenCustKeys.has(key)) {
              seenCustKeys.add(key);
              toUpsertCustomers.push({
                ho_va_ten: tenKhach || `Khách hàng ${rawCustId || 'mới'}`,
                so_dien_thoai: sdtKhach || '',
                ma_khach_hang: rawCustId || undefined,
                ngay_dang_ky: new Date().toISOString().split('T')[0],
                bien_so_xe: 'Xe Chưa Biển'
              });
            }
          }

          const tenDichVu = String(getValue(['dịch vụ sử dụng', 'dịch vụ', 'tên dịch vụ', 'service', 'sản phẩm', 'loại', 'hạng mục']) || '').trim();
          const sExists = services.find(sv => sv.ten_dich_vu.toLowerCase() === tenDichVu.toLowerCase());
          if (!sExists && tenDichVu) {
            if (!seenServiceKeys.has(tenDichVu.toLowerCase())) {
              seenServiceKeys.add(tenDichVu.toLowerCase());
              toUpsertServices.push({
                ten_dich_vu: tenDichVu,
                gia_nhap: 0,
                gia_ban: 0,
                co_so: 'Cơ sở chính'
              });
            }
          }
        });

        if (toUpsertCustomers.length > 0) {
          await bulkUpsertCustomers(toUpsertCustomers);
        }
        if (toUpsertServices.length > 0) {
          await bulkUpsertServices(toUpsertServices);
        }

        // Re-fetch everything to get the new IDs
        const [updatedCustomers, updatedPersonnel, updatedServices] = await Promise.all([
          getCustomers(),
          getPersonnel(),
          getServices()
        ]);

        const formattedData = data.map((row) => {
          const norm: any = {};
          Object.keys(row).forEach(k => { norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = row[k]; });
          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const rawId = String(getValue(['id', 'mã phiếu', 'mã', 'uuid']) || '').trim();
          const rawCustId = String(getValue(['id khách hàng', 'mã khách hàng', 'cust id', 'khách hàng id', 'don_hang_id']) || '').trim();
          const sdtKhach = cleanPhone(getValue(['sđt', 'số điện thoại', 'phone', 'sdt']));
          const tenKhach = String(getValue(['tên kh', 'khách hàng', 'tên khách hàng', 'họ và tên', 'họ tên', 'người mua']) || '').trim();

          const customerMatch = updatedCustomers.find(c => {
            const cId = c.id.replace(/-/g, '').toLowerCase();
            const rId = rawCustId.replace(/-/g, '').toLowerCase();
            const matchId = (rId && cId === rId) || (rId && rId.length >= 6 && cId.startsWith(rId)) || (rawCustId && c.ma_khach_hang === rawCustId);
            const matchPhone = sdtKhach && cleanPhone(c.so_dien_thoai) === sdtKhach;
            const matchName = tenKhach && c.ho_va_ten.toLowerCase() === tenKhach.toLowerCase();
            return matchId || matchPhone || matchName;
          });

          const tenNhanVien = String(getValue(['người phụ trách', 'ngươi phụ trách', 'nhân viên', 'tên nhân viên', 'phụ trách', 'kỹ thuật', 'thợ']) || '').trim();
          const personnelMatch = updatedPersonnel.find(p => p.ho_ten.toLowerCase() === tenNhanVien.toLowerCase());
          const tenDichVu = String(getValue(['dịch vụ sử dụng', 'dịch vụ', 'tên dịch vụ', 'service', 'sản phẩm', 'loại', 'hạng mục']) || '').trim();
          const serviceMatch = updatedServices.find(s => s.ten_dich_vu.toLowerCase() === tenDichVu.toLowerCase());

          // FALLBACKS for FORCE IMPORT
          let ngay = formatExcelDate(getValue(['ngày', 'ngày lập', 'ngay', 'date', 'thời gian']));
          if (!ngay) ngay = new Date().toISOString().split('T')[0];

          let gio = formatExcelTime(getValue(['giờ', 'thời gian', 'gio', 'time', 'tiết đi']));
          if (!gio) gio = "00:00:00";

          const cardToUpdate = salesCards.find(c => {
            const cleanId = c.id.replace(/-/g, '').toLowerCase();
            const cleanRawId = rawId.replace(/-/g, '').toLowerCase();
            return cleanId === cleanRawId || (cleanRawId.length >= 8 && cleanId.startsWith(cleanRawId));
          });

          const res: any = {
            ngay,
            gio,
            khach_hang_id: customerMatch?.id || null,
            nhan_vien_id: personnelMatch?.id || null,
            dich_vu_id: serviceMatch?.id || null,
            danh_gia: getValue(['đánh giá dịch vụ', 'đánh giá', 'đánh giá dv', 'evaluation']) || 'hài lòng',
            so_km: Number(getValue(['số km', 'km', 'kilometer'])) || 0,
            ngay_nhac_thay_dau: formatExcelDate(getValue(['ngày nhắc thay dầu', 'nhắc thay dầu', 'hạn thay dầu', 'ngay nhac', 'ngày thay']))
          };

          if (cardToUpdate) res.id = cardToUpdate.id;
          return res as Partial<SalesCard>;
        }).filter(Boolean);

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertSalesCards(formattedData);
          await loadData();
          alert(`🚀 THÀNH CÔNG: Đã nhập ${formattedData.length} phiếu bán hàng.\n\nĐã tự động tạo ${(toUpsertCustomers.length)} khách hàng mới từ danh sách.`);
        } else {
          alert(`❌ Không tìm thấy dữ liệu hợp lệ trong file Excel.`);
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

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa phiếu này?')) {
      try {
        await deleteSalesCard(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa phiếu.');
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pt-8">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
              <ShoppingCart size={24} />
            </div>
            Quản lý Phiếu Bán hàng
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
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary placeholder-slate-400 outline-none"
                placeholder="Tìm khách hàng, SĐT, dịch vụ..."
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
                  title="Nhập phiếu từ Excel"
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
              onClick={() => handleOpenModal()}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors shadow-lg shadow-primary/20"
            >
              <Plus size={20} /> Lập phiếu mới
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                  <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold">Dịch vụ</th>
                  <th className="px-4 py-3 font-semibold">Đánh giá</th>
                  <th className="px-4 py-3 font-semibold text-right">Số Km</th>
                  <th className="px-4 py-3 font-semibold text-center">Nhắc thay dầu</th>
                  <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu phiếu bán hàng...
                    </td>
                  </tr>
                ) : displayItems.map(card => (
                  <tr key={card.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center">
                      <div className="font-bold text-foreground">{new Date(card.ngay).toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-[12px] text-muted-foreground">{card.gio}</div>
                    </td>
                    <td className="px-4 py-4 font-bold text-primary">{card.khach_hang?.ho_va_ten || 'N/A'}</td>
                    <td className="px-4 py-4 text-muted-foreground">{card.khach_hang?.so_dien_thoai || 'N/A'}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                          {(card.nhan_su?.ho_ten || 'X')[0]}
                        </div>
                        {card.nhan_su?.ho_ten || 'Chưa phân công'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium text-[11px] flex items-center gap-1.5 w-fit">
                        {card.dich_vu?.ten_dich_vu || 'N/A'}
                        {/* Note: This is a placeholder since the master card only stores one service name in the join. 
                            In a real many-to-many setup, we'd count details here. */}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[11px] font-bold capitalize",
                        card.danh_gia === 'hài lòng' ? "bg-emerald-50 text-emerald-600" :
                          card.danh_gia === 'bình thường' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {card.danh_gia}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-foreground">{card.so_km?.toLocaleString()} km</td>
                    <td className="px-4 py-4 text-center">
                      {card.ngay_nhac_thay_dau ? (
                        <div className="flex items-center justify-center gap-1.5 text-rose-600 font-bold">
                          <Calendar size={14} />
                          {new Date(card.ngay_nhac_thay_dau).toLocaleDateString('vi-VN')}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleOpenModal(card)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(card.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && displayItems.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Chưa có phiếu bán hàng nào được lập.</td>
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

      {/* Modal */}
      {isModalOpen && (
        <SalesCardFormModal
          isOpen={isModalOpen}
          editingCard={editingCard}
          initialData={formData}
          customers={customers}
          personnel={personnel}
          services={services}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          onCustomerAdded={loadData}
        />
      )}
    </div>
  );
};

const SalesCardFormModal: React.FC<{
  isOpen: boolean;
  editingCard: SalesCard | null;
  initialData: Partial<SalesCard>;
  customers: KhachHang[];
  personnel: NhanSu[];
  services: DichVu[];
  onClose: () => void;
  onSubmit: (data: Partial<SalesCard & { dich_vu_ids?: string[] }>) => Promise<void>;
  onCustomerAdded: () => Promise<void>;
}> = React.memo(({ editingCard, initialData, customers, personnel, services, onClose, onSubmit, onCustomerAdded }) => {
  const [formData, setFormData] = useState<Partial<SalesCard & { dich_vu_ids?: string[] }>>(initialData);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'so_km') {
      // Fix: remove leading zeros and handle formatting like Customer page
      const numericValue = value.replace(/\D/g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10);
      setFormData(prev => ({ ...prev, [name]: isNaN(num) ? undefined : num }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null || isNaN(num)) return '';
    return num.toLocaleString('vi-VN');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 1000 }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden" style={{ zIndex: 1001 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="text-primary" size={20} />
            {editingCard ? 'Cập nhật Phiếu Bán hàng' : 'Lập Phiếu Bán hàng Mới'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleFormSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date & Time */}
              <InputField label="Ngày lập" name="ngay" type="date" value={formData.ngay || ''} onChange={handleInputChange} icon={Calendar} required />
              <InputField label="Giờ lập" name="gio" type="time" value={formData.gio || ''} onChange={handleInputChange} icon={Clock} required />

              {/* Customer Selection */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-primary/70" />
                    Khách hàng <span className="text-red-500">*</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsCustomerModalOpen(true)}
                    className="text-primary hover:text-primary/80 flex items-center gap-1 normal-case font-bold transition-all px-2 py-0.5 rounded-lg hover:bg-primary/5"
                  >
                    <Plus size={14} /> Thêm mới
                  </button>
                </label>
                <SearchableSelect
                  options={customers.map(c => ({
                    value: c.id,
                    label: c.ho_va_ten
                  }))}
                  value={formData.khach_hang_id || undefined}
                  onValueChange={(val: string) => setFormData(prev => ({ ...prev, khach_hang_id: val }))}
                  placeholder="-- Chọn hoặc tìm khách hàng --"
                  searchPlaceholder="Tìm tên, SĐT, biển số..."
                  className="font-bold overflow-hidden"
                />
              </div>

              {/* Personnel Selection */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <User size={14} className="text-primary/70" />
                  Người phụ trách (Nhân viên) <span className="text-red-500">*</span>
                </label>
                <select
                  name="nhan_vien_id" value={formData.nhan_vien_id || ''} onChange={handleInputChange} required
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} ({p.vi_tri})</option>)}
                </select>
              </div>

              {/* Service Selection */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Wrench size={14} className="text-primary/70" />
                  Dịch vụ sử dụng <span className="text-red-500">*</span>
                </label>
                <MultiSearchableSelect
                  options={services.map(s => ({
                    value: s.id,
                    label: s.ten_dich_vu,
                    price: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(s.gia_ban)
                  }))}
                  value={formData.dich_vu_ids || []}
                  onValueChange={(vals: string[]) => setFormData(prev => ({ ...prev, dich_vu_ids: vals }))}
                  placeholder="-- Chọn hoặc tìm nhiều dịch vụ --"
                  searchPlaceholder="Tìm tên dịch vụ..."
                  className="font-bold"
                />
              </div>

              {/* Evaluation */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Star size={14} className="text-primary/70" />
                  Đánh giá dịch vụ
                </label>
                <div className="flex gap-2">
                  {['hài lòng', 'bình thường', 'không hài lòng'].map(opt => (
                    <button
                      key={opt} type="button" onClick={() => setFormData(prev => ({ ...prev, danh_gia: opt }))}
                      className={clsx(
                        "flex-1 py-2 px-3 rounded-xl border text-[12px] font-bold transition-all capitalize",
                        formData.danh_gia === opt ? "bg-primary text-white border-primary shadow-md" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <InputField label="Số Km" name="so_km" value={formatNumber(formData.so_km)} onChange={handleInputChange} icon={History} placeholder="12.000" />

              <InputField label="Ngày nhắc thay dầu" name="ngay_nhac_thay_dau" type="date" value={formData.ngay_nhac_thay_dau || ''} onChange={handleInputChange} icon={Calendar} />
            </div>

            {/* Live Total Calculation */}
            {formData.dich_vu_ids && formData.dich_vu_ids.length > 0 && (
              <div className="mt-8 bg-primary/5 p-5 rounded-2xl border border-primary/20 border-dashed flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-0.5">
                  <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tổng chi phí dự tính</div>
                  <div className="text-[11px] text-muted-foreground">({formData.dich_vu_ids.length} dịch vụ đã chọn)</div>
                </div>
                <div className="text-2xl font-black text-primary tracking-tight">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                    formData.dich_vu_ids.reduce((sum, sId) => {
                      const service = services.find(s => s.id === sId);
                      return sum + (service?.gia_ban || 0);
                    }, 0)
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
              <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2">
                <Save size={18} /> <span>{editingCard ? 'Lưu thay đổi' : 'Lập phiếu'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <CustomerFormModal 
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customer={null}
        onSuccess={async (newCust: KhachHang) => {
          await onCustomerAdded();
          setFormData(prev => ({ ...prev, khach_hang_id: newCust.id }));
          setIsCustomerModalOpen(false);
        }}
      />
    </div>,
    document.body
  );
});

const InputField: React.FC<{
  label: string,
  name: string,
  value?: string | number,
  onChange: (e: any) => void,
  icon: React.ElementType,
  type?: 'text' | 'date' | 'time' | 'select',
  options?: string[],
  required?: boolean,
  placeholder?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, required, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === 'select' ? (
      <select name={name} value={value ?? ''} onChange={onChange} required={required} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : (
      <input
        type={type} name={name} value={value ?? ''} onChange={onChange}
        onFocus={(e) => e.target.select()}
        required={required} placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
      />
    )}
  </div>
);

// Helper for dynamic classes
const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default SalesCardManagementPage;
