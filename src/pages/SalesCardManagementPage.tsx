import {
  ArrowLeft,
  Calendar,
  Download,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import SalesCardFormModal from '../components/SalesCardFormModal';
import { useAuth } from '../context/AuthContext';
import type { KhachHang } from '../data/customerData';
import { getCustomersForSelect } from '../data/customerData';
import type { ThuChi } from '../data/financialData';
import { deleteTransactionByOrderId, getTransactionByOrderId, upsertTransaction } from '../data/financialData';
import type { NhanSu } from '../data/personnelData';
import { getPersonnel } from '../data/personnelData';
import { bulkUpsertSalesCardCTs, deleteSalesCardCTsByOrderId } from '../data/salesCardCTData';
import type { SalesCard } from '../data/salesCardData';
import { bulkUpsertSalesCards, deleteAllSalesCards, deleteSalesCard, getSalesCardsPaginated, upsertSalesCard, normalizeSalesCards } from '../data/salesCardData';
import { deleteSalesTransactions } from '../data/financialData';
import type { DichVu } from '../data/serviceData';
import { getServices } from '../data/serviceData';
import { supabase } from '../lib/supabase';

const SalesCardManagementPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [salesCards, setSalesCards] = useState<SalesCard[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [services, setServices] = useState<DichVu[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const location = useLocation();

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
  const [editingCard, setEditingCard] = useState<SalesCard | null>(null);
  const [formData, setFormData] = useState<Partial<SalesCard & { dich_vu_ids?: string[], service_items?: any[] }>>({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cardsResult, custData, persData, servData] = await Promise.all([
        getSalesCardsPaginated(currentPage, pageSize, debouncedSearch),
        getCustomersForSelect(), // Lightweight: only id, name, phone, plate, legacy_id
        getPersonnel(),
        getServices()
      ]);

      // One-time data normalization to fix legacy data (missing id_bh, etc.)
      await normalizeSalesCards();
      setSalesCards(cardsResult.data);
      setTotalCount(cardsResult.totalCount);
      setCustomers(custData as KhachHang[]);
      setPersonnel(persData);
      setServices(servData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, location.pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Server-side filtering, so we use salesCards directly
  const displayItems = useMemo(() => salesCards, [salesCards]);

  // ---- AUTO-OPEN MODAL WHEN REDIRECTED FROM CUSTOMER PAGE ----
  // Fetch the single customer directly by UUID — no need to wait for full list
  useEffect(() => {
    const pendingId = sessionStorage.getItem('pendingCustomerId');
    if (!pendingId) return;

    sessionStorage.removeItem('pendingCustomerId');

    const openFormForCustomer = async () => {
      try {
        const { data: customer } = await supabase
          .from('khach_hang')
          .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, so_km')
          .eq('id', pendingId)
          .maybeSingle();

        if (!customer) {
          console.warn('[DEBUG] Customer not found for id:', pendingId);
          return;
        }

        // Wait for personnel to load (lightweight, fast)
        const persData = personnel.length > 0 ? personnel : await getPersonnel();
        const matchedUser = persData.find(
          p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase()
        ) || persData[0];

        setEditingCard(null);
        setIsReadOnlyModal(false);
        setFormData({
          ngay: new Date().toISOString().split('T')[0],
          gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          khach_hang_id: customer.ma_khach_hang || customer.id,
          nhan_vien_id: matchedUser ? matchedUser.ho_ten : '',
          dich_vu_id: '',
          dich_vu_ids: [],
          so_km: customer.so_km || 0,
          ngay_nhac_thay_dau: ''
        });
        setIsModalOpen(true);
      } catch (err) {
        console.error('Error auto-opening form:', err);
      }
    };

    openFormForCustomer();
  }, []); // Runs once on mount

  const handleOpenModal = (card?: SalesCard) => {
    setIsReadOnlyModal(false);
    if (card) {
      setEditingCard(card);

      const mappedServiceItems = ((card as any).the_ban_hang_ct || []).map((ct: any) => ({
        id: ct.dich_vu_id || ct.san_pham_vat_tu_id || Math.random().toString(),
        ten_dich_vu: ct.san_pham || 'Dịch vụ',
        gia_ban: ct.gia_ban || 0,
        so_luong: ct.so_luong || 1
      }));
      const mappedIds = mappedServiceItems.map((item: any) => item.id).filter((id: any) => !id.startsWith('0.'));

      setFormData({
        ...card,
        dich_vu_ids: mappedIds,
        service_items: mappedServiceItems
      } as any);
    } else {
      setEditingCard(null);

      // Tự động gán người phụ trách là tên user đăng nhập hiện tại từ AuthContext
      const matchedUser = personnel.find(p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase()) || personnel[0];

      setFormData({
        ngay: new Date().toISOString().split('T')[0],
        gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        khach_hang_id: '',
        nhan_vien_id: matchedUser ? matchedUser.ho_ten : '', // TEXT ID (ho_ten)
        dich_vu_id: '',
        dich_vu_ids: [],
        so_km: 0,
        ngay_nhac_thay_dau: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleViewCard = (card: SalesCard) => {
    setIsReadOnlyModal(true);
    setEditingCard(card);

    const mappedServiceItems = ((card as any).the_ban_hang_ct || []).map((ct: any) => ({
      id: ct.dich_vu_id || ct.san_pham_vat_tu_id || Math.random().toString(),
      ten_dich_vu: ct.san_pham || 'Dịch vụ',
      gia_ban: ct.gia_ban || 0,
      so_luong: ct.so_luong || 1
    }));
    const mappedIds = mappedServiceItems.map((item: any) => item.id).filter((id: any) => !id.startsWith('0.'));

    setFormData({
      ...card,
      dich_vu_ids: mappedIds,
      service_items: mappedServiceItems
    } as any);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsReadOnlyModal(false);
    setEditingCard(null);
    setFormData({});
  };

  const handleSubmit = async (formDataHeader: Partial<SalesCard & { dich_vu_ids?: string[], service_items?: { id: string, ten_dich_vu: string, gia_ban: number, so_luong?: number }[] }>) => {
    try {
      // Exclude all virtual/joined fields that don't exist in the database
      const { 
        khach_hang, 
        nhan_su, 
        nhan_su_list, 
        dich_vu, 
        dich_vu_ids, 
        service_items, 
        the_ban_hang_ct,
        ...cleanData 
      } = formDataHeader as any;

      // Sanitize date fields to avoid "invalid input syntax for type date" error in Supabase
      if (cleanData.ngay_nhac_thay_dau === '') cleanData.ngay_nhac_thay_dau = null;

      // Set the first service as the primary ID for the master record
      if (dich_vu_ids && dich_vu_ids.length > 0) {
        cleanData.dich_vu_id = dich_vu_ids[0];
      }

      const savedCard = await upsertSalesCard(cleanData);

      // 1. Clear OLD detail records for this specific order to prevent duplication
      await deleteSalesCardCTsByOrderId(savedCard.id_bh || savedCard.id);

      // 2. Automatically create NEW detail records for all selected services
      if (formDataHeader.service_items && formDataHeader.service_items.length > 0) {
        const detailRecords = formDataHeader.service_items.map((item) => {
          const service = services.find(s => s.id === item.id);
          return {
            id_don_hang: savedCard.id_bh || savedCard.id,
            ten_don_hang: formDataHeader.id_bh || `Đơn hàng ${savedCard.id_bh || savedCard.id.slice(0, 8)}`,
            san_pham: item.ten_dich_vu,
            co_so: service?.co_so || 'Cơ sở chính',
            gia_ban: item.gia_ban,
            gia_von: service?.gia_nhap || 0,
            so_luong: 1,
            chi_phi: 0,
            ngay: savedCard.ngay
          };
        });
        await bulkUpsertSalesCardCTs(detailRecords);
      } else if (dich_vu_ids && dich_vu_ids.length > 0) {
        const detailRecords = dich_vu_ids.map((sId: string) => {
          const service = services.find(s => s.id === sId);
          return {
            id_don_hang: savedCard.id_bh || savedCard.id,
            ten_don_hang: formDataHeader.id_bh || `Đơn hàng ${savedCard.id_bh || savedCard.id.slice(0, 8)}`,
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

      // AUTOMATION: Create or Update Finance Record (Phiếu thu)
      const itemsToCalc = (formDataHeader.service_items && formDataHeader.service_items.length > 0)
        ? formDataHeader.service_items
        : ((formDataHeader as any).the_ban_hang_ct || []);
      const totalAmount = itemsToCalc.reduce((sum: number, item: any) => sum + ((item.gia_ban || 0) * (item.so_luong || 1)), 0);

      const existingTx = await getTransactionByOrderId(savedCard.id);

      const financialRecord: Partial<ThuChi> = {
        id: existingTx?.id, // If it exists, update it
        loai_phieu: 'phiếu thu',
        id_don: savedCard.id,
        so_tien: totalAmount,
        ngay: savedCard.ngay,
        gio: savedCard.gio,
        co_so: (formDataHeader.service_items && formDataHeader.service_items.length > 0)
          ? (services.find(s => s.id === formDataHeader.service_items![0].id)?.co_so || 'Cơ sở chính')
          : 'Cơ sở chính',
        id_khach_hang: savedCard.khach_hang_id,
        danh_muc: 'Doanh thu dịch vụ',
        trang_thai: 'Hoàn thành',
        ghi_chu: `Hệ thống tự động: Thu tiền đơn hàng ${savedCard.id.slice(0, 8)}`
      };

      await upsertTransaction(financialRecord);

      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error(error);
      alert('Lỗi: Không thể lưu phiếu bán hàng.');
    }
  };

  const handleCollectPayment = async (data: any) => {
    if (!editingCard) return;

    try {
      const items = (data.service_items && data.service_items.length > 0) ? data.service_items : (data.the_ban_hang_ct || []);
      const totalAmount = items.reduce((sum: number, item: any) => sum + ((item.gia_ban || 0) * (item.so_luong || 1)), 0);

      if (totalAmount <= 0) {
        alert('Cảnh báo: Đơn hàng chưa có dịch vụ hoặc tổng tiền bằng 0.');
        return;
      }

      const existingTx = await getTransactionByOrderId(editingCard.id);

      const financialRecord: Partial<ThuChi> = {
        id: existingTx?.id,
        loai_phieu: 'phiếu thu',
        id_don: editingCard.id,
        so_tien: totalAmount,
        ngay: data.ngay || new Date().toISOString().split('T')[0],
        gio: data.gio || new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        co_so: (items.length > 0)
          ? (services.find(s => s.id === items[0].id)?.co_so || 'Cơ sở chính')
          : 'Cơ sở chính',
        id_khach_hang: editingCard.khach_hang_id,
        danh_muc: 'Doanh thu dịch vụ',
        trang_thai: 'Hoàn thành',
        ghi_chu: `Thu tiền đơn hàng ${editingCard.id.slice(0, 8)} (Thao tác nhanh)`
      };

      await upsertTransaction(financialRecord);
      alert(`✅ Đã thu tiền thành công: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}`);
      await loadData();
      handleCloseModal();
    } catch (error) {
      console.error(error);
      alert('Lỗi: Không thể thực hiện thu tiền.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "BH-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        "Ngày": "2024-03-24",
        "Giờ": "08:30:00",
        "id khách hàng": "KH-XXXXXX",
        "Người phụ trách": "Nguyễn Văn B",
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
          const dateMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (dateMatch) {
            const p1 = parseInt(dateMatch[1]);
            const p2 = parseInt(dateMatch[2]);
            const p3 = dateMatch[3];
            if (p1 > 12) {
              return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
            } else if (p2 > 12) {
              return `${p3}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
            } else {
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

        const toUpsertServicesLoc: Partial<DichVu>[] = [];
        const seenServiceKeys = new Set<string>();

        data.forEach(row => {
          const norm: any = {};
          Object.keys(row).forEach(k => { norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = row[k]; });
          
          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const tenDichVu = String(getValue(['dịch vụ sử dụng', 'dịch vụ', 'tên dịch vụ', 'service', 'sản phẩm', 'loại', 'hạng mục']) || '').trim();
          const sExists = services.find(sv => sv.ten_dich_vu.toLowerCase() === tenDichVu.toLowerCase());
          if (!sExists && tenDichVu) {
            if (!seenServiceKeys.has(tenDichVu.toLowerCase())) {
              seenServiceKeys.add(tenDichVu.toLowerCase());
              toUpsertServicesLoc.push({
                ten_dich_vu: tenDichVu,
                gia_nhap: 0,
                gia_ban: 0,
                co_so: 'Cơ sở chính'
              });
            }
          }
        });

        await loadData(); // Ensure base data is current
        const { data: salesCards } = await supabase.from('the_ban_hang').select('id, id_bh');

        const formattedData = data.map((row) => {
          const norm: any = {};
          // Normalize keys: trim, lower case and replace multiple spaces with single space
          Object.keys(row).forEach(k => { 
            const cleanKey = String(k).trim().toLowerCase().replace(/\s+/g, ' ');
            norm[cleanKey] = row[k]; 
          });

          const getValue = (keys: string[]) => {
            const k = keys.find(z => norm[z.toLowerCase()] !== undefined);
            return k ? norm[k.toLowerCase()] : undefined;
          };

          const rawSalesId = String(getValue(['id', 'mã phiếu', 'id_bh', 'mã', 'uuid']) || '').trim();
          const excelCustId = String(getValue(['id khách hàng', 'mã khách hàng', 'cust id', 'khách hàng id']) || '').trim();
          const rawNhanVien = String(getValue(['người phụ trách', 'ngươi phụ trách', 'nhân viên', 'tên nhân viên', 'phụ trách', 'kỹ thuật', 'thợ']) || '').trim();
          // Normalize: replace line breaks or semicolons with commas
          const tenNhanVien = rawNhanVien.replace(/[\n\r;]+/g, ', ').replace(/\s{2,}/g, ' ');
          
          const tenDichVu = String(getValue(['dịch vụ sử dụng', 'dịch vụ', 'tên dịch vụ', 'service', ' sản phẩm', 'loại', 'hạng mục']) || '').trim();

          let ngay = formatExcelDate(getValue(['ngày', 'ngày lập', 'ngay', 'date', 'thời gian']));
          if (!ngay) ngay = new Date().toISOString().split('T')[0];

          let gio = formatExcelTime(getValue(['giờ', 'thời gian', 'gio', 'time', 'tiết đi']));
          if (!gio) gio = "00:00:00";

          const cardToUpdate = (salesCards || []).find((c: any) => {
            if (!rawSalesId) return false;
            const cleanRawId = rawSalesId.replace(/[-\s]/g, '').toLowerCase();
            const cleanDbId = c.id.replace(/[-\s]/g, '').toLowerCase();
            const cleanDbBh = (c.id_bh || '').replace(/[-\s]/g, '').toLowerCase();
            return cleanDbId === cleanRawId || cleanDbBh === cleanRawId;
          });

          const res: any = {
            ngay,
            gio,
            id_bh: rawSalesId || undefined,
            khach_hang_id: excelCustId || null,
            nhan_vien_id: tenNhanVien || null,
            dich_vu_id: tenDichVu || null, // Lưu trực tiếp tên dịch vụ (TEXT)
            so_km: Number(getValue(['số km', 'km', 'kilometer', 'số ki lô mét'])) || 0,
            ngay_nhac_thay_dau: formatExcelDate(getValue(['ngày nhắc thay dầu', 'nhắc thay dầu', 'hạn thay dầu', 'ngay nhac', 'ngày thay', 'hẹn thay dầu', 'thay dầu tiếp']))
          };

          if (cardToUpdate) {
            res.id = cardToUpdate.id;
          }

          return res as Partial<SalesCard>;
        }).filter(item => item !== null);

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertSalesCards(formattedData);
          await loadData();
          alert(`🚀 THÀNH CÔNG: Đã nhập ${formattedData.length} phiếu bán hàng.`);
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
        // Delete linked finance record automatically
        await deleteTransactionByOrderId(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa phiếu.');
      }
    }
  };

  const handleDeleteAll = async () => {
    const confirm1 = window.confirm('⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ dữ liệu phiếu bán hàng không?\n(Dữ liệu chi tiết và phiếu thu tiền liên quan cũng sẽ bị xóa sạch)');
    if (!confirm1) return;

    const confirm2 = window.confirm('⚠️ XÁC NHẬN CUỐI CÙNG: Hành động này không thể hoàn tác. Bạn vẫn muốn tiếp tục xóa SẠCH tất cả phiếu bán hàng?');
    if (!confirm2) return;

    try {
      setLoading(true);
      await deleteAllSalesCards();
      // Only delete transactions related to sales (safer than deleting ALL)
      if (window.confirm('Bạn có muốn xóa luôn các Phiếu Thu liên quan trong mục Tài chính không?')) {
        await deleteSalesTransactions();
      }
      await loadData();
      alert('🚀 Đã xóa sạch toàn bộ dữ liệu bán hàng.');
    } catch (error) {
      console.error(error);
      alert('Lỗi: Không thể xóa toàn bộ dữ liệu.');
    } finally {
      setLoading(false);
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
        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-2 py-1 sm:px-4 sm:py-2 hover:bg-muted rounded-lg text-muted-foreground transition-all border border-transparent hover:border-border shrink-0">
              <ArrowLeft className="size-4 sm:size-5" />
              <span className="font-medium text-[11px] sm:text-[14px]">Quay lại</span>
            </button>
            <div className="relative group shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-7 sm:pl-9 pr-3 sm:pr-4 py-1 sm:py-2 bg-muted/50 border-border rounded-lg text-[11px] sm:text-[13px] focus:ring-1 focus:ring-primary focus:border-primary transition-all w-[120px] sm:w-[220px] lg:w-[300px] outline-none"
                placeholder="Tìm khách, dịch vụ..."
                type="text"
              />
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="px-2.5 py-1 sm:px-5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
            >
              <Plus className="size-4 sm:size-5" />
              <span>Lập hóa đơn</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              onClick={handleDownloadTemplate}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground transition-all shrink-0"
              title="Tải mẫu Excel"
            >
              <Download className="size-4 sm:size-5" />
              <span>Tải mẫu</span>
            </button>

            <div className="relative shrink-0">
              <button
                onClick={() => document.getElementById('excel-import')?.click()}
                className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                title="Nhập dữ liệu Excel"
              >
                <Upload className="size-4 sm:size-5" />
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

              {/* Delete All Button */}
              <button
                onClick={handleDeleteAll}
                className="px-2 py-1 sm:px-4 sm:py-2 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                title="Xóa tất cả phiếu bán hàng"
              >
                <Trash2 className="size-4 sm:size-5" />
                <span>Xóa tất cả</span>
              </button>
            </div>
          </div>

        {/* Summary Bar - Tổng đơn & Tổng tiền */}
        {!loading && displayItems.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tổng đơn:</span>
              <span className="text-sm sm:text-base font-black text-primary">{totalCount}</span>
            </div>
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tổng tiền (trang):</span>
              <span className="text-sm sm:text-base font-black text-emerald-600">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                  displayItems.reduce((grandSum, card) => {
                    const items = (card as any).the_ban_hang_ct || [];
                    return grandSum + items.reduce((sum: number, ct: any) => sum + (ct.gia_ban * (ct.so_luong || 1)), 0);
                  }, 0)
                )}
              </span>
            </div>
          </div>
        )}

        {/* Data List (Mobile View - Blocks) */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {loading ? (
            <div className="bg-card p-8 text-center text-muted-foreground border border-border rounded-xl">
              <Loader2 className="animate-spin inline-block mr-2" size={20} />
              Đang tải dữ liệu phiếu bán hàng...
            </div>
          ) : displayItems.length > 0 ? (
            displayItems.map(card => {
              const items = (card as any).the_ban_hang_ct || [];
              const totalAmount = items.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
              const branch = items.length > 0 ? items[0].co_so : (card.dich_vu?.co_so || 'Cơ sở chính');

              return (
                <div key={card.id} className="bg-card p-4 rounded-xl border border-border shadow-sm space-y-4 relative group hover:border-primary/30 transition-all">
                  {/* Row 1: Ngày / Giờ */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
                      <Calendar size={16} />
                      {new Date(card.ngay).toLocaleDateString('vi-VN')} {card.gio}
                    </div>
                  </div>

                  {/* Row 2: Khách hàng / SĐT */}
                  <div className="space-y-1">
                    <div className="text-[16px] font-black text-foreground">
                      {card.khach_hang?.ho_va_ten || 'N/A'}
                    </div>
                    <div className="text-[13px] text-muted-foreground flex items-center gap-1.5 font-medium">
                      📱 {card.khach_hang?.so_dien_thoai || 'N/A'}
                    </div>
                  </div>

                  {/* Row 3: Dịch vụ - Số tiền - Người phụ trách - Cơ sở */}
                  <div className="bg-muted/30 p-3 rounded-lg border border-border/40 space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {items.length > 0 ? (
                        items.map((ct: any, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                            {ct.san_pham}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                          {card.dich_vu?.ten_dich_vu || 'N/A'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[13px]">
                      <div className="flex flex-col gap-0.5">
                        <div className="text-muted-foreground text-[11px]">Người phụ trách / Cơ sở</div>
                        <div className="font-bold text-foreground flex flex-col gap-0.5">
                          {card.nhan_su_list && card.nhan_su_list.length > 0 ? (
                            card.nhan_su_list.map((p, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 truncate max-w-[150px]">
                                👤 {p.ho_ten}
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center gap-1.5">👤 {card.nhan_vien_id || 'N/A'}</div>
                          )}
                          <div className="flex items-center gap-1.5 opacity-60 text-[11px]">🏢 {branch}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-primary font-black text-[15px]">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Số KM - Ngày nhắc thay dầu */}
                  <div className="flex items-center justify-between text-[13px] pt-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-600">
                      🚗 {card.so_km?.toLocaleString()} km
                    </div>
                    {card.ngay_nhac_thay_dau && (
                      <div className="flex items-center gap-1.5 text-rose-600 font-bold">
                        🛢️ Nhắc: {new Date(card.ngay_nhac_thay_dau).toLocaleDateString('vi-VN')}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar for Mobile Card */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                    <button onClick={() => handleViewCard(card)} className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-[12px] font-bold border border-blue-100 transition-colors">
                      <Eye size={14} /> Xem
                    </button>
                    <button onClick={() => handleOpenModal(card)} className="flex items-center gap-1 px-3 py-1.5 text-primary hover:bg-primary/10 rounded-lg text-[12px] font-bold border border-primary/20 transition-colors">
                      <Edit2 size={14} /> Sửa
                    </button>
                    <button onClick={() => handleDelete(card.id)} className="flex items-center gap-1 px-3 py-1.5 text-destructive hover:bg-destructive/10 rounded-lg text-[12px] font-bold border border-destructive/20 transition-colors">
                      <Trash2 size={14} /> Xóa
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-card p-12 text-center text-muted-foreground border border-border border-dashed rounded-xl">
              Chưa có phiếu bán hàng nào được lập.
            </div>
          )}

          {/* Mobile Summary Row */}
          {!loading && displayItems.length > 0 && (
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-widest font-sans">Tổng trang này:</span>
                <span className="text-primary font-black text-lg">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                    displayItems.reduce((grandSum, card) => {
                      const items = (card as any).the_ban_hang_ct || [];
                      return grandSum + items.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
                    }, 0)
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Data Table (Desktop View) */}
        <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[13px] font-bold tracking-tight">
                  <th className="px-4 py-3 font-semibold text-center">id</th>
                  <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                  <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                  <th className="px-4 py-3 font-semibold">Tên khách hàng</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold text-center">ĐÁNH GIÁ DỊCH VỤ</th>
                  <th className="px-4 py-3 font-semibold">Dịch vụ sử dụng</th>
                  <th className="px-4 py-3 font-semibold text-right">Tổng tiền</th>
                  <th className="px-4 py-3 font-semibold text-right">Số Km</th>
                  <th className="px-4 py-3 font-semibold text-center">Ngày nhắc thay dầu</th>
                  <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu phiếu bán hàng...
                    </td>
                  </tr>
                ) : displayItems.map(card => (
                  <tr key={card.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center font-mono text-[12px] font-bold text-muted-foreground">
                      {card.id_bh || card.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-foreground">
                      {new Date(card.ngay).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-4 text-center text-muted-foreground">
                      {card.gio}
                    </td>
                    <td className="px-4 py-4 font-bold text-primary">{card.khach_hang?.ho_va_ten || 'N/A'}</td>
                    <td className="px-4 py-4 text-muted-foreground">{card.khach_hang?.so_dien_thoai || 'N/A'}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        {card.nhan_su_list && card.nhan_su_list.length > 0 ? (
                          card.nhan_su_list.map((p, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {(p.ho_ten || 'X')[0]}
                              </div>
                              <span className="font-bold whitespace-nowrap">{p.ho_ten}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground italic font-medium">{card.nhan_vien_id || 'N/A'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-muted-foreground">—</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(card as any).the_ban_hang_ct && (card as any).the_ban_hang_ct.length > 0 ? (
                          (card as any).the_ban_hang_ct.map((ct: any, idx: number) => (
                            <span key={idx} className="px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium text-[11px] flex items-center gap-1.5 w-fit">
                              {ct.san_pham}
                            </span>
                          ))
                        ) : (
                          <span className="px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium text-[11px] flex items-center gap-1.5 w-fit">
                            {card.dich_vu?.ten_dich_vu || 'N/A'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-black text-primary">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        ((card as any).the_ban_hang_ct || []).reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0)
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-foreground">{card.so_km?.toLocaleString()} km</td>
                    <td className="px-4 py-4 text-center">
                      {card.ngay_nhac_thay_dau ? (
                        <div className="flex items-center justify-center gap-1.5 text-rose-600 font-bold">
                          <Calendar size={18} />
                          {new Date(card.ngay_nhac_thay_dau).toLocaleDateString('vi-VN')}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleViewCard(card)} className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Xem chi tiết"><Eye size={18} /></button>
                        <button onClick={() => handleOpenModal(card)} className="p-2 text-primary hover:bg-primary/10 rounded transition-colors" title="Chỉnh sửa"><Edit2 size={18} /></button>
                        <button onClick={() => handleDelete(card.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors" title="Xóa"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && displayItems.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Chưa có phiếu bán hàng nào được lập.</td>
                  </tr>
                )}
                {!loading && displayItems.length > 0 && (
                  <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                    <td colSpan={9} className="px-4 py-4 text-right text-muted-foreground text-[11px] tracking-widest">Tổng cộng trang này:</td>
                    <td colSpan={2} className="px-4 py-4 text-right text-primary text-lg">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        displayItems.reduce((grandSum, card) => {
                          const items = (card as any).the_ban_hang_ct || [];
                          return grandSum + items.reduce((sum: number, ct: any) => sum + (ct.gia_ban * (ct.so_luong || 1)), 0);
                        }, 0)
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
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
          isReadOnly={isReadOnlyModal}
          onCollectPayment={handleCollectPayment}
        />
      )}
    </div>
  );
};

export default SalesCardManagementPage;
