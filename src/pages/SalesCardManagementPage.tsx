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
import type { KhachHang } from '../data/customerData';
import { bulkUpsertCustomers, getCustomersForSelect, getCustomers } from '../data/customerData';
import type { NhanSu } from '../data/personnelData';
import { getPersonnel } from '../data/personnelData';
import type { SalesCard } from '../data/salesCardData';
import { bulkUpsertSalesCards, deleteSalesCard, getSalesCardsPaginated, upsertSalesCard } from '../data/salesCardData';
import type { DichVu } from '../data/serviceData';
import { bulkUpsertServices, getServices } from '../data/serviceData';
import SalesCardFormModal from '../components/SalesCardFormModal';
import { bulkUpsertSalesCardCTs } from '../data/salesCardCTData';
import { getTransactionByOrderId, upsertTransaction, deleteTransactionByOrderId } from '../data/financialData';
import type { ThuChi } from '../data/financialData';
import { useAuth } from '../context/AuthContext';

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

  // Handle auto-open for specific customer from navigation state
  useEffect(() => {
    if (location.state?.customerId && !loading && customers.length > 0) {
      const custId = location.state.customerId;
      const customer = customers.find(c => c.id === custId);
      
      if (customer) {
        // Initial data for the new card
        const matchedUser = personnel.find(p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase()) || personnel[0];
        
        setFormData({
          ngay: new Date().toISOString().split('T')[0],
          gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          khach_hang_id: customer.id,
          nhan_vien_id: matchedUser ? matchedUser.id : '',
          dich_vu_id: '',
          dich_vu_ids: [],
          danh_gia: 'hài lòng',
          so_km: customer.so_km || 0,
          ngay_nhac_thay_dau: ''
        });
        setIsModalOpen(true);
        
        // Clear state to prevent re-opening
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, loading, customers, personnel, currentUser]);

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
        nhan_vien_id: matchedUser ? matchedUser.id : '',
        dich_vu_id: '',
        dich_vu_ids: [],
        danh_gia: 'hài lòng',
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
      const { khach_hang, nhan_su, dich_vu, dich_vu_ids, service_items, ...cleanData } = formDataHeader as any;
      
      // Sanitize date fields to avoid "invalid input syntax for type date" error in Supabase
      if (cleanData.ngay_nhac_thay_dau === '') cleanData.ngay_nhac_thay_dau = null;

      // Set the first service as the primary ID for the master record
      if (dich_vu_ids && dich_vu_ids.length > 0) {
        cleanData.dich_vu_id = dich_vu_ids[0];
      }

      const savedCard = await upsertSalesCard(cleanData);

      // Automatically create detail records for all selected services
      if (formDataHeader.service_items && formDataHeader.service_items.length > 0) {
        const detailRecords = formDataHeader.service_items.map((item) => {
          const service = services.find(s => s.id === item.id);
          return {
            don_hang_id: savedCard.id,
            ten_don_hang: `Phiếu bán hàng ${savedCard.id.slice(0, 8)}`,
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

        const cleanPhone = (p: any) => String(p || '').replace(/\D/g, '');

        const toUpsertCustomersLoc: Partial<KhachHang>[] = [];
        const seenCustKeys = new Set<string>();

        const toUpsertServicesLoc: Partial<DichVu>[] = [];
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
              toUpsertCustomersLoc.push({
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
              toUpsertServicesLoc.push({
                ten_dich_vu: tenDichVu,
                gia_nhap: 0,
                gia_ban: 0,
                co_so: 'Cơ sở chính'
              });
            }
          }
        });

        if (toUpsertCustomersLoc.length > 0) {
          await bulkUpsertCustomers(toUpsertCustomersLoc);
        }
        if (toUpsertServicesLoc.length > 0) {
          await bulkUpsertServices(toUpsertServicesLoc);
        }

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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
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
              const totalAmount = items.reduce((sum: number, ct: any) => sum + (ct.gia_ban * (ct.so_luong || 1)), 0);
              const branch = items.length > 0 ? items[0].co_so : (card.dich_vu?.co_so || 'Cơ sở chính');

              return (
                <div key={card.id} className="bg-card p-4 rounded-xl border border-border shadow-sm space-y-4 relative group hover:border-primary/30 transition-all">
                  {/* Row 1: Ngày / Giờ */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
                      <Calendar size={16} />
                      {new Date(card.ngay).toLocaleDateString('vi-VN')} {card.gio}
                    </div>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      card.danh_gia === 'hài lòng' ? "bg-emerald-50 text-emerald-600" :
                        card.danh_gia === 'bình thường' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {card.danh_gia}
                    </span>
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
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          👤 {card.nhan_su?.ho_ten || 'N/A'} 
                          <span className="text-muted-foreground/30 px-1">|</span>
                          🏢 {branch}
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
                <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-wider">Tổng trang này:</span>
                <span className="text-primary font-black text-lg">
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
        </div>

        {/* Data Table (Desktop View) */}
        <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold text-center">Ngày & Giờ</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold">Dịch vụ</th>
                  <th className="px-4 py-3 font-semibold">Đánh giá</th>
                  <th className="px-4 py-3 font-semibold text-right">Số Km</th>
                  <th className="px-4 py-3 font-semibold text-right text-primary">Tổng chi phí dịch vụ</th>
                  <th className="px-4 py-3 font-semibold text-center">Nhắc thay dầu</th>
                  <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu phiếu bán hàng...
                    </td>
                  </tr>
                ) : displayItems.map(card => (
                  <tr key={card.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center">
                      <div className="font-bold text-foreground">{new Date(card.ngay).toLocaleDateString('vi-VN')}</div>
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
                    <td className="px-4 py-4 text-right font-black text-primary">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        ((card as any).the_ban_hang_ct || []).reduce((sum: number, ct: any) => sum + (ct.gia_ban * (ct.so_luong || 1)), 0)
                      )}
                    </td>
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
                        <button onClick={() => handleViewCard(card)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Xem chi tiết"><Eye size={15} /></button>
                        <button onClick={() => handleOpenModal(card)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors" title="Chỉnh sửa"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(card.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors" title="Xóa"><Trash2 size={15} /></button>
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
                    <td colSpan={8} className="px-4 py-4 text-right text-muted-foreground uppercase text-[11px] tracking-widest">Tổng cộng trang này:</td>
                    <td className="px-4 py-4 text-right text-primary text-lg">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        displayItems.reduce((grandSum, card) => {
                          const items = (card as any).the_ban_hang_ct || [];
                          return grandSum + items.reduce((sum: number, ct: any) => sum + (ct.gia_ban * (ct.so_luong || 1)), 0);
                        }, 0)
                      )}
                    </td>
                    <td colSpan={2}></td>
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

const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default SalesCardManagementPage;
