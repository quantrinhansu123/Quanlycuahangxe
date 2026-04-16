import {
  ArrowLeft,
  Building,
  Calendar,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  User,
  X
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { KhachHang } from '../data/customerData';
import { getCustomersForSelect, upsertCustomer } from '../data/customerData';
import type { ThuChi } from '../data/financialData';
import { deleteSalesTransactions, deleteTransactionByOrderId, getTransactionByOrderId, upsertTransaction } from '../data/financialData';
import type { NhanSu } from '../data/personnelData';
import { getPersonnel } from '../data/personnelData';
import { bulkUpsertSalesCardCTs, deleteSalesCardCTsByOrderId } from '../data/salesCardCTData';
import type { SalesCard } from '../data/salesCardData';
import { bulkUpsertSalesCards, deleteAllSalesCards, deleteSalesCard, getNextSalesCardCode, getSalesCardsPaginated, normalizeSalesCards, upsertSalesCard } from '../data/salesCardData';
import { computeChanges, saveEditHistory } from '../data/salesCardHistoryData';
import type { DichVu } from '../data/serviceData';
import { getServices } from '../data/serviceData';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const SalesCardFormModal = React.lazy(() => import('../components/SalesCardFormModal'));

const SalesCardManagementPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { showToast } = useToast();
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

  // Date filtering states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'>('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const hasLoadedRefData = React.useRef(false);

  const loadReferenceData = useCallback(async () => {
    if (hasLoadedRefData.current) return;
    try {
      const [custData, persData, servData] = await Promise.all([
        getCustomersForSelect(), // Lightweight: only id, name, phone, plate, legacy_id
        getPersonnel(),
        getServices()
      ]);
      setCustomers(custData as KhachHang[]);
      setPersonnel(persData);
      setServices(servData);
      hasLoadedRefData.current = true;
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  }, []);

  const loadSalesCards = useCallback(async () => {
    try {
      setLoading(true);
      const cardsResult = await getSalesCardsPaginated(
        currentPage,
        pageSize,
        debouncedSearch,
        startDate || undefined,
        endDate || undefined,
        isAdmin ? (selectedStaff || undefined) : (currentUser?.ho_ten || undefined),
        isAdmin ? (selectedBranch || undefined) : undefined
      );

      setSalesCards(cardsResult.data);
      setTotalCount(cardsResult.totalCount);
    } catch (error) {
      console.error('Error loading sales cards:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, startDate, endDate, selectedStaff, selectedBranch, isAdmin, currentUser]);

  const loadData = useCallback(async () => {
    loadReferenceData(); // Non-blocking background load for dropdowns
    await loadSalesCards();
  }, [loadReferenceData, loadSalesCards]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Luồng chạy ngầm để chuẩn hóa mã trống
    normalizeSalesCards().catch(err => console.error("Error normalizing sales cards:", err));
  }, []);

  // Server-side filtering, so we use salesCards directly
  const displayItems = useMemo(() => salesCards, [salesCards]);

  const groupedSales = useMemo(() => {
    const groups: Record<string, {
      date: string;
      items: SalesCard[];
      totalAmount: number;
      uniqueCustomers: Set<string>;
      latestTime: string;
    }> = {};

    displayItems.forEach(card => {
      const date = card.ngay;
      if (!groups[date]) {
        groups[date] = {
          date,
          items: [],
          totalAmount: 0,
          uniqueCustomers: new Set(),
          latestTime: card.gio || '00:00'
        };
      }
      
      const itemsDetail = (card as any).the_ban_hang_ct || [];
      const cardTotal = itemsDetail.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
      
      groups[date].items.push(card);
      groups[date].totalAmount += cardTotal;
      
      // Use any identifying customer field
      const customerId = card.khach_hang_id || card.ten_khach_hang || 'unknown';
      groups[date].uniqueCustomers.add(customerId);
      
      // Keep track of the latest activity time in this group
      if (card.gio && card.gio > groups[date].latestTime) {
        groups[date].latestTime = card.gio;
      }
    });

    // Sort by date descending
    return Object.values(groups).sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [displayItems]);

  // ---- AUTO-OPEN MODAL WHEN REDIRECTED FROM CUSTOMER PAGE ----
  // Use a ref to store the pending customer ID so it survives re-renders
  const pendingCustomerRef = React.useRef<string | null>(null);
  const pendingMaRef = React.useRef<string | null>(null);
  const pendingCustomerDataRef = React.useRef<KhachHang | null>(null);
  const [pendingNewCustomer, setPendingNewCustomer] = useState<KhachHang | null>(null);

  // Giải tỏa Mobile UI: Tính toán 10.000 customer string ở Parent 1 lần rồi share cho Modal
  const customerOptions = useMemo(() => {
    let list = customers;
    // Đảm bảo pendingNewCustomer không bị xoá mất khi loadReferenceData fetched xong từ DB
    if (pendingNewCustomer && !list.some(c => c.ma_khach_hang === pendingNewCustomer.ma_khach_hang)) {
      list = [{ ...pendingNewCustomer, ho_va_ten: `${pendingNewCustomer.ho_va_ten}` } as KhachHang, ...list];
    }
    const rawOptions = list.map(c => {
      const searchParts = [c.ho_va_ten];
      if (c.so_dien_thoai) searchParts.push(c.so_dien_thoai);
      if (c.bien_so_xe) searchParts.push(c.bien_so_xe);
      if (c.ma_khach_hang) searchParts.push(c.ma_khach_hang);

      return {
        value: c.ma_khach_hang || c.id,
        label: `${c.ho_va_ten}${c.so_dien_thoai ? ` - ${c.so_dien_thoai}` : ''}`,
        searchKey: searchParts.join(' ')
      };
    });

    // Remove duplicates based on value (key)
    const uniqueOptions = [];
    const seenValues = new Set();
    for (const opt of rawOptions) {
      if (opt.value && !seenValues.has(opt.value)) {
        seenValues.add(opt.value);
        uniqueOptions.push(opt);
      }
    }
    return uniqueOptions;
  }, [customers, pendingNewCustomer]);

  // Capture pending ID immediately on first render (before any async work)
  if (pendingCustomerRef.current === null) {
    const state = location.state as any;
    const pendingData = state?.pendingCustomerData;
    const id = pendingData ? pendingData.ma_khach_hang : (state?.pendingCustomerId || sessionStorage.getItem('pendingCustomerId'));
    const ma = state?.pendingMaKhachHang || '';

    pendingCustomerRef.current = id || '';
    pendingMaRef.current = ma || '';
    pendingCustomerDataRef.current = pendingData || null;

    // Clear storage immediately (without re-triggering location change)
    if (id || pendingData) {
      sessionStorage.removeItem('pendingCustomerId');
      // Clear location.state via history API directly — does NOT trigger React Router re-render
      window.history.replaceState({}, '');
    }
  }

  // After loadData completes and lists are ready, auto-open the modal
  useEffect(() => {
    const pendingId = pendingCustomerRef.current;
    const pendingMa = pendingMaRef.current;
    const pendingData = pendingCustomerDataRef.current;
    if ((!pendingId && !pendingData) || loading) return; // Wait until loading is done
    if (customers.length === 0 && !pendingData) return; // Wait until customers list is loaded

    // Reset the ref so this only runs once
    pendingCustomerRef.current = '';
    pendingMaRef.current = '';
    pendingCustomerDataRef.current = null;

    const openFormForCustomer = async () => {
      try {
        let customer: KhachHang | null = null;
        if (pendingData) {
          customer = pendingData as KhachHang;
          setPendingNewCustomer(customer);
          setCustomers(prev => [{ ...customer!, ho_va_ten: `${customer!.ho_va_ten}` } as KhachHang, ...prev]);
        } else {
          // 1. Find the customer in the already-loaded list or fetch directly
          customer = customers.find(c => {
            const optionValue = c.ma_khach_hang || c.id;
            return c.id === pendingId || c.ma_khach_hang === pendingId || optionValue === pendingId
              || (pendingMa && (c.ma_khach_hang === pendingMa || optionValue === pendingMa));
          }) || null;

          if (!customer) {
            // Fallback: fetch from Supabase if not in list — try UUID first, then ma_khach_hang
            let query = supabase
              .from('khach_hang')
              .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, so_km, bien_so_xe');

            const { data: fetchedCustomer } = await query
              .or(`id.eq.${pendingId}${pendingMa ? `,ma_khach_hang.eq.${pendingMa}` : ''}`)
              .limit(1)
              .maybeSingle();

            if (!fetchedCustomer) {
              console.warn('[DEBUG] Customer not found for id:', pendingId);
              return;
            }
            customer = fetchedCustomer as KhachHang;
            // Add to customers list so dropdown can resolve it
            setCustomers(prev => [customer!, ...prev]);
          }
        }

        // 2. Find last person in charge from sales history
        const lookupIds = [customer.id];
        if (customer.ma_khach_hang) lookupIds.push(customer.ma_khach_hang);

        const { data: lastCard } = await supabase
          .from('the_ban_hang')
          .select('nhan_vien_id')
          .in('khach_hang_id', lookupIds)
          .order('ngay', { ascending: false })
          .order('gio', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('[DEBUG] Auto-open:', { customer: customer.ho_va_ten, lastCard });

        let targetNhanVien = '';
        if (lastCard?.nhan_vien_id) {
          targetNhanVien = lastCard.nhan_vien_id;
        } else {
          const matchedUser = personnel.find(
            p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase()
          );
          targetNhanVien = matchedUser ? matchedUser.ho_ten : '';
        }

        // 3. Set form data and open modal
        const nextCode = await getNextSalesCardCode();
        setEditingCard(null);
        setIsReadOnlyModal(false);
        setFormData({
          ngay: new Date().toISOString().split('T')[0],
          gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          id_bh: nextCode,
          khach_hang_id: customer.ma_khach_hang || customer.id,
          nhan_vien_id: targetNhanVien,
          dich_vu_id: '',
          dich_vu_ids: [],
          so_km: customer.so_km || 0,
          ngay_nhac_thay_dau: ''
        });
        // Delay modal open to ensure customers list state is flushed before dropdown renders
        setTimeout(() => setIsModalOpen(true), 50);
      } catch (err) {
        console.error('[CRITICAL] Error auto-opening form:', err);
      }
    };

    openFormForCustomer();
  }, [loading, customers.length]); // Runs when loading finishes and customers are ready

  const handleOpenModal = async (card?: SalesCard) => {
    if (card && !isAdmin) {
      showToast('Bạn không có quyền chỉnh sửa phiếu này.', 'error');
      return;
    }

    if (card && card.thu_chi) {
      showToast('Đơn hàng đã thu tiền, không thể chỉnh sửa.', 'warning');
      handleViewCard(card);
      return;
    }
    setIsReadOnlyModal(false);
    if (card) {
      setEditingCard(card);

      let mappedKhId = card.khach_hang_id;
      if (mappedKhId) {
        let c = customers.find(x => x.id === mappedKhId || x.ma_khach_hang === mappedKhId);
        if (!c && card.khach_hang) {
          c = {
            id: mappedKhId.length === 36 ? mappedKhId : '',
            ma_khach_hang: card.khach_hang.ma_khach_hang || (mappedKhId.length !== 36 ? mappedKhId : ''),
            ho_va_ten: card.khach_hang.ho_va_ten || 'Khách hàng',
            so_dien_thoai: card.khach_hang.so_dien_thoai || ''
          } as KhachHang;
          setCustomers(prev => [c!, ...prev]);
        }
        if (c) mappedKhId = c.ma_khach_hang || c.id;
      }

      const mappedServiceItems = ((card as any).the_ban_hang_ct || []).map((ct: any) => {
        // Try to find the master service by name to get a valid UUID if ct.dich_vu_id is missing or random
        const masterService = services.find(s =>
          (ct.dich_vu_id && s.id === ct.dich_vu_id) ||
          (s.ten_dich_vu && ct.san_pham && s.ten_dich_vu.toLowerCase() === ct.san_pham.toLowerCase())
        );

        return {
          id: masterService?.id || ct.dich_vu_id || ct.san_pham_vat_tu_id || Math.random().toString(),
          ten_dich_vu: ct.san_pham || 'Dịch vụ',
          gia_ban: ct.gia_ban || 0,
          so_luong: ct.so_luong || 1
        };
      });
      const mappedIds = mappedServiceItems.map((item: any) => item.id);

      setFormData({
        ...card,
        khach_hang_id: mappedKhId,
        dich_vu_ids: mappedIds,
        service_items: mappedServiceItems
      } as any);
    } else {
      setEditingCard(null);

      // Tự động gán người phụ trách là tên user đăng nhập hiện tại từ AuthContext, nếu không thấy thì bỏ trống
      const matchedUser = personnel.find(p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase());
      const nextCode = await getNextSalesCardCode();

      setFormData({
        ngay: new Date().toISOString().split('T')[0],
        gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        id_bh: nextCode,
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

    let mappedKhId = card.khach_hang_id;
    if (mappedKhId) {
      let c = customers.find(x => x.id === mappedKhId || x.ma_khach_hang === mappedKhId);
      if (!c && card.khach_hang) {
        c = {
          id: mappedKhId.length === 36 ? mappedKhId : '',
          ma_khach_hang: card.khach_hang.ma_khach_hang || (mappedKhId.length !== 36 ? mappedKhId : ''),
          ho_va_ten: card.khach_hang.ho_va_ten || 'Khách hàng',
          so_dien_thoai: card.khach_hang.so_dien_thoai || ''
        } as KhachHang;
        setCustomers(prev => [c!, ...prev]);
      }
      if (c) mappedKhId = c.ma_khach_hang || c.id;
    }

    const mappedServiceItems = ((card as any).the_ban_hang_ct || []).map((ct: any) => ({
      id: ct.dich_vu_id || ct.san_pham_vat_tu_id || Math.random().toString(),
      ten_dich_vu: ct.san_pham || 'Dịch vụ',
      gia_ban: ct.gia_ban || 0,
      so_luong: ct.so_luong || 1
    }));
    const mappedIds = mappedServiceItems.map((item: any) => item.id).filter((id: any) => !id.startsWith('0.'));

    setFormData({
      ...card,
      khach_hang_id: mappedKhId,
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
    setPendingNewCustomer(null);
  };

  const handleSubmit = async (formDataHeader: Partial<SalesCard & { dich_vu_ids?: string[], service_items?: { id: string, ten_dich_vu: string, gia_ban: number, so_luong?: number }[] }>) => {
    try {
      if (editingCard && !isAdmin) {
        showToast('Bạn không có quyền cập nhật dữ liệu.', 'error');
        return;
      }
      // Exclude all virtual/joined fields that don't exist in the database
      const {
        khach_hang,
        nhan_su,
        nhan_su_list,
        dich_vu,
        dich_vu_ids,
        service_items,
        the_ban_hang_ct,
        thu_chi,
        phuong_thuc_thanh_toan,
        ...cleanData
      } = formDataHeader as any;

      // Sanitize date fields to avoid "invalid input syntax for type date" error in Supabase
      if (cleanData.ngay_nhac_thay_dau === '') cleanData.ngay_nhac_thay_dau = null;

      // Deferred Save execution: if there is a pending new customer and it's the one selected
      if (pendingNewCustomer && (cleanData.khach_hang_id === pendingNewCustomer.ma_khach_hang || cleanData.khach_hang_id === pendingNewCustomer.id)) {
        const dataToSave: any = { ...pendingNewCustomer };
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!dataToSave.id || !uuidRegex.test(dataToSave.id)) {
          delete dataToSave.id;
        }
        const savedCustomer = await upsertCustomer(dataToSave);
        cleanData.khach_hang_id = savedCustomer.id;

        // Remove from pending so subsequent saves (if editing without closing) use the new real ID
        setPendingNewCustomer(null);
        // Also update local list to remove the "[MỚI]" prefix and update IDs
        setCustomers(prev => prev.map(c => c.ma_khach_hang === pendingNewCustomer.ma_khach_hang ? { ...savedCustomer } : c));
      }

      // Set the first service as the primary ID for the master record
      if (dich_vu_ids && dich_vu_ids.length > 0) {
        cleanData.dich_vu_id = dich_vu_ids[0];
      }

      // Cổ chai 4 & 5: Các bước lưu data độc lập có thể chạy song song (Promise.all)
      // Bước 1 & 2: Sinh/Cập nhật phiếu gốc và xóa chi tiết cũ phải chạy trước vì phần dưới phụ thuộc nó
      const savedCard = await upsertSalesCard(cleanData, !editingCard);

      // Ghi lịch sử chỉnh sửa khi cập nhật phiếu cũ
      if (editingCard) {
        // formDataHeader.service_items chứa form mảng mới, editingCard.the_ban_hang_ct chứa mảng cũ
        const changes = computeChanges(editingCard, cleanData, editingCard.the_ban_hang_ct || [], formDataHeader.service_items || []);
        if (changes.length > 0) {
          saveEditHistory(savedCard.id, currentUser?.ho_ten || 'Hệ thống', changes);
        }
      }

      // 'Deep Clean': Clear ALL old records (both by UUID and by Order Code) to prevent phantom duplicates
      await deleteSalesCardCTsByOrderId(savedCard.id, savedCard.id_bh || undefined);

      // Robust Service Mapping: Always use dich_vu_ids as the source of truth for ADD/DELETE,
      // and lookup in service_items ONLY for price overrides.
      const detailRecords = (dich_vu_ids || []).map((sId: string) => {
        const service = services.find(s => s.id === sId);
        // Look for a manual price override from the modal's state
        const override = (formDataHeader.service_items || []).find(it => it.id === sId);

        return {
          id_don_hang: savedCard.id,
          ten_don_hang: formDataHeader.id_bh || `Đơn hàng ${savedCard.id_bh || savedCard.id.slice(0, 8)}`,
          san_pham: service?.ten_dich_vu || override?.ten_dich_vu || 'Dịch vụ',
          co_so: service?.co_so || 'Cơ sở chính',
          gia_ban: override?.gia_ban ?? (service?.gia_ban || 0),
          gia_von: service?.gia_nhap || 0,
          so_luong: override?.so_luong ?? 1,
          chi_phi: 0,
          ngay: savedCard.ngay
        };
      });

      // AUTOMATION: Định hình dòng tài chính - Dựa trên detailRecords vừa tính ở trên cho chính xác
      const totalAmount = detailRecords.reduce((sum: number, item: any) => sum + (item.gia_ban * (item.so_luong || 1)), 0);

      // Bước 3: Đẩy đồng thời TẤT CẢ TÁC VỤ còn lại không phụ thuộc nhau
      await Promise.all([
        detailRecords.length > 0 ? bulkUpsertSalesCardCTs(detailRecords) : Promise.resolve(),
        (async () => {
          const existingTx = await getTransactionByOrderId(savedCard.id);

          if (!existingTx) return;

          const financialRecord: Partial<ThuChi> = {
            id: existingTx.id,
            loai_phieu: 'phiếu thu',
            phuong_thuc: existingTx.phuong_thuc || 'Tiền mặt',
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
            ghi_chu: existingTx.ghi_chu || `Hệ thống tự động: Cập nhật tiền đơn hàng ${savedCard.id.slice(0, 8)}`
          };
          await upsertTransaction(financialRecord);
        })(),
        savedCard.khach_hang_id ? (() => {
          const idCol = savedCard.khach_hang_id.length === 36 ? 'id' : 'ma_khach_hang';
          return supabase.from('khach_hang').update({ created_at: new Date().toISOString() }).eq(idCol, savedCard.khach_hang_id);
        })() : Promise.resolve()
      ]);

      await loadSalesCards();
      handleCloseModal();

      showToast('Lập phiếu bán hàng thành công!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Lỗi: Không thể lưu phiếu bán hàng.', 'error');
    }
  };

  const handleCollectPayment = async (data: any, method: string = 'Tiền mặt') => {
    if (!editingCard) return;

    try {
      const items = (data.service_items && data.service_items.length > 0) ? data.service_items : (data.the_ban_hang_ct || []);
      const totalAmount = items.reduce((sum: number, item: any) => sum + ((item.gia_ban || 0) * (item.so_luong || 1)), 0);

      if (totalAmount <= 0) {
        alert('Cảnh báo: Đơn hàng chưa có dịch vụ hoặc tổng tiền bằng 0.');
        return;
      }

      const existingTx = await getTransactionByOrderId(editingCard.id);

      const currentCustomer = customers.find(c => c.id === editingCard.khach_hang_id || c.ma_khach_hang === editingCard.khach_hang_id);

      const financialRecord: Partial<ThuChi> = {
        id: existingTx?.id,
        loai_phieu: 'phiếu thu',
        phuong_thuc: method,
        id_don: editingCard.id,
        so_tien: totalAmount,
        ngay: data.ngay || new Date().toISOString().split('T')[0],
        gio: data.gio || new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        co_so: (items.length > 0)
          ? (services.find(s => s.id === items[0].id)?.co_so || 'Cơ sở chính')
          : 'Cơ sở chính',
        id_khach_hang: editingCard.khach_hang_id,
        nguoi_chi: currentCustomer?.ho_va_ten || data.khach_hang?.ho_va_ten || editingCard.khach_hang?.ho_va_ten || editingCard.ten_khach_hang || 'Khách vãng lai',
        danh_muc: 'Doanh thu dịch vụ',
        trang_thai: 'Hoàn thành',
        ghi_chu: `Thu tiền đơn hàng ${editingCard.id.slice(0, 8)} (${method})`
      };

      await upsertTransaction(financialRecord);

      // AUTOMATION: Bump customer to top
      if (editingCard.khach_hang_id) {
        const idCol = editingCard.khach_hang_id.length === 36 ? 'id' : 'ma_khach_hang';
        // Note: we can omit await here to save time for user, but keeping it ensures consistency
        await supabase.from('khach_hang').update({ created_at: new Date().toISOString() }).eq(idCol, editingCard.khach_hang_id);
      }

      showToast(`Đã thu tiền thành công: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}`, 'success');
      await loadSalesCards();
      handleCloseModal();
    } catch (error) {
      console.error(error);
      showToast('Lỗi: Không thể thực hiện thu tiền.', 'error');
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

        setLoading(true);

        const toUpsertServicesLoc: Partial<DichVu>[] = [];
        const seenServiceKeys = new Set<string>();

        // Pre-fetch all customers to match SDT / Ten KH locally
        const { data: allCustomers } = await supabase.from('khach_hang').select('id, ma_khach_hang, ho_va_ten, so_dien_thoai');
        const dbCustomers = allCustomers || [];
        const custById = new Map();
        const custByPhone = new Map();
        const custByName = new Map();

        dbCustomers.forEach(c => {
          if (c.id) custById.set(c.id.toLowerCase(), c);
          if (c.ma_khach_hang) custById.set(c.ma_khach_hang.toLowerCase(), c);
          if (c.so_dien_thoai) custByPhone.set(c.so_dien_thoai.replace(/\D/g, ''), c);
          if (c.ho_va_ten) custByName.set(c.ho_va_ten.toLowerCase().trim(), c);
        });

        const resolvedCustomerIds = new Map<number, string>(); // row index -> db cust id

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
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

          // Customer Resolution
          const excelCustId = String(getValue(['id khách hàng', 'mã khách hàng', 'cust id', 'khách hàng id']) || '').trim();
          const tenKH = String(getValue(['tên kh', 'tên khách hàng', 'khách hàng', 'tên']) || '').trim();
          const sdtRaw = String(getValue(['sđt', 'số điện thoại', 'điện thoại']) || '');
          const sdt = sdtRaw.replace(/[^0-9+]/g, '').trim();

          let matched = null;

          if (sdt && custByPhone.has(sdt)) {
            matched = custByPhone.get(sdt);
          } else if (tenKH && custByName.has(tenKH.toLowerCase())) {
            matched = custByName.get(tenKH.toLowerCase());
          } else if (excelCustId && custById.has(excelCustId.toLowerCase())) {
            matched = custById.get(excelCustId.toLowerCase());
          } else if (excelCustId && custByPhone.has(excelCustId.replace(/[^0-9+]/g, ''))) {
            matched = custByPhone.get(excelCustId.replace(/[^0-9+]/g, ''));
          }

          if (matched) {
            resolvedCustomerIds.set(i, matched.ma_khach_hang || matched.id);
          } else if (excelCustId) {
            // Fallback lưu mã nếu không tìm thấy khách
            resolvedCustomerIds.set(i, excelCustId);
          }
        }

        await loadData(); // Ensure base data is current
        const { data: salesCards } = await supabase.from('the_ban_hang').select('id, id_bh');

        const formattedData = data.map((row, rowIndex) => {
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
          const rawNhanVien = String(getValue(['người phụ trách', 'ngươi phụ trách', 'nhân viên', 'tên nhân viên', 'phụ trách', 'kỹ thuật', 'thợ']) || '').trim();
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

          const tenKH = String(getValue(['tên kh', 'tên khách hàng', 'khách hàng', 'tên']) || '').trim();
          const sdtRaw = String(getValue(['sđt', 'số điện thoại', 'điện thoại']) || '').trim();

          const res: any = {
            ngay,
            gio,
            id_bh: rawSalesId || undefined,
            khach_hang_id: resolvedCustomerIds.get(rowIndex) || null,
            nhan_vien_id: tenNhanVien || null,
            dich_vu_id: tenDichVu || null,
            ten_khach_hang: tenKH || null,
            so_dien_thoai: sdtRaw || null,
            danh_gia: String(getValue(['đánh giá dịch vụ', 'đánh giá', 'nhận xét', 'danh gia']) || '').trim() || null,
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
          await loadSalesCards();
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
    if (!isAdmin) {
      showToast('Bạn không có quyền xóa dữ liệu.', 'error');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa phiếu này?')) {
      try {
        await deleteSalesCard(id);
        // Delete linked finance record automatically (no need to await if we want to release UI faster, but safe to do parallel)
        await Promise.all([
          deleteTransactionByOrderId(id)
        ]);
        await loadSalesCards();
      } catch (error) {
        alert('Lỗi: Không thể xóa phiếu.');
      }
    }
  };

  const handleQuickFilter = (type: typeof activeQuickFilter) => {
    setActiveQuickFilter(type);
    setSelectedMonth('');
    const today = new Date();

    // Set time to midnight for consistent calculations if needed, 
    // but here we just need YYYY-MM-DD

    let start = '';
    let end = '';

    switch (type) {
      case 'today':
        start = today.toISOString().split('T')[0];
        end = start;
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        start = yesterday.toISOString().split('T')[0];
        end = start;
        break;
      case 'this_week':
        const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        start = monday.toISOString().split('T')[0];
        end = sunday.toISOString().split('T')[0];
        break;
      case 'this_month':
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        start = firstDay.toISOString().split('T')[0];
        end = lastDay.toISOString().split('T')[0];
        break;
      case 'all':
        start = '';
        end = '';
        break;
      default:
        return;
    }

    setStartDate(start);
    setEndDate(end);
    setCurrentPage(1);
  };

  const handleMonthChange = (monthStr: string) => {
    if (!monthStr) {
      handleQuickFilter('all');
      return;
    }

    setSelectedMonth(monthStr);
    setActiveQuickFilter('custom');

    const [year, month] = monthStr.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setActiveQuickFilter('all');
    setSelectedMonth('');
    setSelectedStaff('');
    setSelectedBranch('');
    setCurrentPage(1);
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
      await loadSalesCards();
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
        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-1.5 sm:gap-4 font-sans">
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
                placeholder="Tìm mã phiếu, khách hàng..."
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {isAdmin && (
              <>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-2 py-1 sm:px-4 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground transition-all shrink-0"
                  title="Tải mẫu Excel"
                >
                  <Download className="size-4 sm:size-5" />
                  <span className="hidden lg:inline">Tải mẫu</span>
                </button>

                <div className="relative shrink-0">
                  <button
                    onClick={() => document.getElementById('excel-import-main')?.click()}
                    className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                    title="Nhập dữ liệu Excel"
                  >
                    <Upload className="size-4 sm:size-5" />
                    <span>Nhập Excel</span>
                  </button>
                  <input
                    id="excel-import-main"
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleImportExcel}
                  />
                </div>

                <button
                  onClick={handleDeleteAll}
                  className="px-2 py-1 sm:px-2.5 sm:py-2 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                  title="Xóa tất cả phiếu bán hàng"
                >
                  <Trash2 className="size-4 sm:size-5" />
                </button>
              </>
            )}

            <button
              onClick={() => handleOpenModal()}
              className="px-2.5 py-1 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
            >
              <Plus className="size-4 sm:size-5" />
              <span>Lập hóa đơn</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-card p-4 rounded-xl border border-border shadow-sm font-sans flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              <div className="flex bg-muted p-1 rounded-lg shrink-0">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'today', label: 'Hôm nay' },
                  { id: 'yesterday', label: 'Hôm qua' },
                  { id: 'this_week', label: 'Tuần này' },
                  { id: 'this_month', label: 'Tháng này' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleQuickFilter(f.id as any)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] sm:text-[13px] font-bold rounded-md transition-all whitespace-nowrap",
                      activeQuickFilter === f.id
                        ? "bg-background text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              {isAdmin && (
                <>
                  {/* Branch Filter */}
                  <div className="flex items-center gap-2 text-[11px] sm:text-[13px] font-bold text-muted-foreground">
                    <Building size={16} />
                    <div className="relative">
                      <select
                        value={selectedBranch}
                        onChange={(e) => {
                          setSelectedBranch(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="appearance-none pl-3 pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all min-w-[120px]"
                      >
                        <option value="">Tất cả cơ sở</option>
                        {[...new Set(personnel.map(p => p.co_so).filter(Boolean))].map(branch => (
                          <option key={branch} value={branch}>{branch}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 pointer-events-none text-muted-foreground" />
                    </div>
                  </div>

                  {/* Staff Filter */}
                  <div className="flex items-center gap-2 text-[11px] sm:text-[13px] font-bold text-muted-foreground">
                    <User size={16} />
                    <div className="relative">
                      <select
                        value={selectedStaff}
                        onChange={(e) => {
                          setSelectedStaff(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="appearance-none pl-3 pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all min-w-[120px]"
                      >
                        <option value="">Tất cả nhân viên</option>
                        {personnel.map((p) => (
                          <option key={p.id} value={p.ho_ten}>{p.ho_ten}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 pointer-events-none text-muted-foreground" />
                    </div>
                  </div>
                </>
              )}

              {/* Month Filter */}
              <div className="flex items-center gap-2 text-[11px] sm:text-[13px] font-bold text-muted-foreground">
                <span>Tháng:</span>
                <div className="relative">
                  <select
                    value={selectedMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all min-w-[120px]"
                  >
                    <option value="">Chọn tháng...</option>
                    {Array.from({ length: 12 }, (_, i) => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - i);
                      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
                      return <option key={val} value={val}>{label}</option>;
                    })}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 pointer-events-none text-muted-foreground" />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActiveQuickFilter('custom');
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-none text-[11px] sm:text-[13px] font-medium outline-none p-1 w-[120px] sm:w-[130px] cursor-pointer"
                />
                <span className="text-muted-foreground">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActiveQuickFilter('custom');
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-none text-[11px] sm:text-[13px] font-medium outline-none p-1 w-[120px] sm:w-[130px] cursor-pointer"
                />
              </div>

              {(startDate || endDate || searchQuery || selectedMonth || (isAdmin && (selectedStaff || selectedBranch))) && (
                <button
                  onClick={handleClearFilters}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100 shrink-0"
                  title="Xóa bộ lọc"
                >
                  <X size={20} />
                </button>
              )}
            </div>
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
          ) : groupedSales.length > 0 ? (
            groupedSales.map(group => (
              <div key={group.date} className="space-y-3 mb-8">
                {/* Group Header */}
                <div className="flex items-center gap-2 px-1">
                  <div className="h-px bg-border flex-1" />
                  <div className="flex flex-col items-center gap-1 bg-muted/60 px-4 py-2.5 rounded-2xl border border-border/80 shadow-sm backdrop-blur-sm">
                    <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                      📅 {new Date(group.date).toLocaleDateString('vi-VN')}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-primary">
                      <span className="flex items-center gap-1">🕒 {group.latestTime}</span>
                      <span className="opacity-20">|</span>
                      <span className="flex items-center gap-1">👥 {group.uniqueCustomers.size} khách</span>
                      <span className="opacity-20">|</span>
                      <span className="flex items-center gap-1">📄 {group.items.length} đơn</span>
                    </div>
                    <div className="text-[13px] font-black text-emerald-600 mt-0.5">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalAmount)}
                    </div>
                  </div>
                  <div className="h-px bg-border flex-1" />
                </div>

                <div className="space-y-4">
                  {group.items.map(card => {
                    const items = (card as any).the_ban_hang_ct || [];
                    const totalAmount = items.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
                    const branch = items.length > 0 ? items[0].co_so : (card.dich_vu?.co_so || 'Cơ sở chính');

                    return (
                      <div key={card.id} className="bg-card p-4 rounded-xl border border-border shadow-sm space-y-4 relative group hover:border-primary/30 transition-all">
                        {/* Row 1: Ngày / Giờ */}
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
                            <Calendar size={16} />
                            {card.gio}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase">#{card.id_bh || card.id.slice(0, 8)}</div>
                        </div>

                        {/* Row 2: Khách hàng / SĐT */}
                        <div className="space-y-1">
                          <div className="text-[16px] font-black text-foreground">
                            {card.khach_hang?.ho_va_ten || card.ten_khach_hang || 'N/A'}
                          </div>
                          <div className="text-[13px] text-muted-foreground flex items-center gap-1.5 font-medium">
                            📱 {card.khach_hang?.so_dien_thoai || card.so_dien_thoai || 'N/A'} {card.khach_hang?.dia_chi_hien_tai && <span className="opacity-60">• 🏢 {card.khach_hang.dia_chi_hien_tai}</span>}
                          </div>
                        </div>

                        {/* Row 3: Dịch vụ - Số tiền - Người phụ trách - Cơ sở */}
                        <div className="bg-muted/30 p-3 rounded-lg border border-border/40 space-y-3">
                          <div className="flex flex-wrap gap-1.5">
                            {items.length > 0 ? (
                              items.map((ct: any, idx: number) => (
                                <span key={idx} className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[11px]">
                                  {ct.san_pham}{(ct.so_luong || 1) > 1 && <span className="ml-1 opacity-70">×{ct.so_luong}</span>}
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
                              <div className="text-primary font-black text-[15px] mb-1">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                              </div>
                              {card.thu_chi ? (
                                <div className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px] whitespace-nowrap">
                                  🛡️ {card.thu_chi.phuong_thuc || 'Tiền mặt'}
                                </div>
                              ) : (
                                card.phuong_thuc_thanh_toan ? (
                                  <div className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px] whitespace-nowrap">
                                    ⚠️ {card.phuong_thuc_thanh_toan}
                                  </div>
                                ) : (
                                  <div className="inline-block px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold text-[10px] whitespace-nowrap">
                                    Chưa chọn TT
                                  </div>
                                )
                              )}
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

                        {card.ghi_chu && (
                          <div className="mt-2 flex items-start gap-1.5 p-2.5 bg-amber-50/50 rounded-xl border border-amber-100/50">
                            <FileText size={14} className="text-amber-600/70 mt-0.5 shrink-0" />
                            <p className="text-[12px] text-amber-900/70 italic leading-relaxed line-clamp-2">{card.ghi_chu}</p>
                          </div>
                        )}

                        {/* Actions Bar for Mobile Card */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                          <button onClick={() => handleViewCard(card)} className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-[12px] font-bold border border-blue-100 transition-colors">
                            <Eye size={14} /> Xem
                          </button>
                          {isAdmin && (
                            <>
                              {!card.thu_chi && (
                                <button onClick={() => handleOpenModal(card)} className="flex items-center gap-1 px-3 py-1.5 text-primary hover:bg-primary/10 rounded-lg text-[12px] font-bold border border-primary/20 transition-colors">
                                  <Edit2 size={14} /> Sửa
                                </button>
                              )}
                              <button onClick={() => handleDelete(card.id)} className="flex items-center gap-1 px-3 py-1.5 text-destructive hover:bg-destructive/10 rounded-lg text-[12px] font-bold border border-destructive/20 transition-colors">
                                <Trash2 size={14} /> Xóa
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
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
                  <th className="px-4 py-3 font-semibold text-center">Thời gian</th>
                  <th className="px-4 py-3 font-semibold">Tên khách hàng</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Địa chỉ lưu trú hiện tại</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold text-center">ĐÁNH GIÁ DỊCH VỤ</th>
                  <th className="px-4 py-3 font-semibold">Dịch vụ sử dụng</th>
                  <th className="px-4 py-3 font-semibold text-right">Tổng tiền</th>
                  <th className="px-4 py-3 font-semibold text-center">Thanh toán</th>
                  <th className="px-4 py-3 font-semibold text-right">Số Km</th>
                  <th className="px-4 py-3 font-semibold text-center">Ngày nhắc thay dầu</th>
                  <th className="px-4 py-3 font-semibold">Ghi chú</th>
                  <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {loading ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu phiếu bán hàng...
                    </td>
                  </tr>
                ) : groupedSales.length > 0 ? (
                  groupedSales.map(group => (
                    <React.Fragment key={group.date}>
                      {/* Group Header Row */}
                      <tr className="bg-muted/40 border-y border-border/60 backdrop-blur-sm">
                        <td colSpan={14} className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            <span className="text-[12px] font-black text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                              📅 {new Date(group.date).toLocaleDateString('vi-VN')}
                            </span>
                            <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground">
                              <span className="flex items-center gap-1.5 underline decoration-primary/30 decoration-2 underline-offset-4">🕒 Mới nhất: {group.latestTime}</span>
                              <span className="opacity-30">|</span>
                              <span className="flex items-center gap-1.5">👥 {group.uniqueCustomers.size} khách</span>
                              <span className="opacity-30">|</span>
                              <span className="flex items-center gap-1.5">📄 {group.items.length} đơn</span>
                              <span className="opacity-30">|</span>
                              <span className="text-emerald-600 font-extrabold text-[14px]">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalAmount)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.items.map(card => (
                  <tr key={card.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center font-mono text-[12px] font-bold text-muted-foreground">
                      {card.id_bh || card.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="font-bold text-foreground whitespace-nowrap">{new Date(card.ngay).toLocaleDateString('vi-VN')}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{card.gio}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-primary">{card.khach_hang?.ho_va_ten || card.ten_khach_hang || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{card.khach_hang?.so_dien_thoai || card.so_dien_thoai || 'N/A'}</td>
                    <td className="px-4 py-4 text-muted-foreground text-[13px]">{card.khach_hang?.dia_chi_hien_tai || '—'}</td>
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
                              {ct.san_pham}{(ct.so_luong || 1) > 1 && <span className="opacity-60 font-bold">×{ct.so_luong}</span>}
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
                    <td className="px-4 py-4 text-center">
                      {card.thu_chi ? (
                        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-bold text-[11px] whitespace-nowrap shadow-sm border border-emerald-200" title="Đã thu tiền">
                          {card.thu_chi.phuong_thuc || 'Tiền mặt'}
                        </span>
                      ) : (
                        card.phuong_thuc_thanh_toan ? (
                          <span className="px-2 py-1 rounded bg-amber-50 text-amber-600 font-bold text-[11px] whitespace-nowrap shadow-sm border border-amber-200" title="Chưa thu tiền (Dự kiến)">
                            {card.phuong_thuc_thanh_toan}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-bold text-[11px] whitespace-nowrap shadow-sm border border-border" title="Chưa có thông tin">
                            Chưa chọn
                          </span>
                        )
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
                    <td className="px-4 py-4 max-w-[200px]">
                      {card.ghi_chu ? (
                        <div className="flex items-start gap-1.5 text-amber-600/70 italic text-[12px] leading-relaxed line-clamp-2" title={card.ghi_chu}>
                          <FileText size={14} className="shrink-0 mt-0.5" />
                          <span>{card.ghi_chu}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleViewCard(card)} className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Xem chi tiết"><Eye size={18} /></button>
                        {isAdmin && (
                          <>
                            {!card.thu_chi && (
                              <button onClick={() => handleOpenModal(card)} className="p-2 text-primary hover:bg-primary/10 rounded transition-colors" title="Chỉnh sửa"><Edit2 size={18} /></button>
                            )}
                            <button onClick={() => handleDelete(card.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors" title="Xóa"><Trash2 size={18} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-muted-foreground italic border-b border-dashed border-border">
                      Chưa có phiếu bán hàng nào được lập.
                    </td>
                  </tr>
                )}
                {!loading && groupedSales.length > 0 && (
                  <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                    <td colSpan={11} className="px-4 py-5 text-right text-muted-foreground text-[11px] tracking-widest uppercase">Tổng trang này:</td>
                    <td colSpan={3} className="px-4 py-5 text-right text-primary text-xl">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        displayItems.reduce((grandSum, card) => {
                          const items = (card as any).the_ban_hang_ct || [];
                          return grandSum + items.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
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

      {/* Modals */}
      {isModalOpen && (
        <React.Suspense fallback={null}>
          <SalesCardFormModal
            isOpen={isModalOpen}
            editingCard={editingCard}
            initialData={formData}
            customerOptions={customerOptions}
            personnel={personnel}
            services={services}
            onClose={handleCloseModal}
            onSubmit={handleSubmit}
            isReadOnly={isReadOnlyModal}
            onCollectPayment={handleCollectPayment}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default SalesCardManagementPage;
