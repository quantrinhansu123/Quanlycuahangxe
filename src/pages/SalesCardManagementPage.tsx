import {
  ArrowLeft,
  Building,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  User,
  Users,
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
import { deleteTransactionByOrderId, getTransactionByOrderId, upsertTransaction } from '../data/financialData';
import type { NhanSu } from '../data/personnelData';
import { getPersonnel } from '../data/personnelData';
import { isQuanLyViTri } from '../data/viewPermissions';
import { bulkUpsertSalesCardCTs, deleteSalesCardCTsByOrderId, type SalesCardCT } from '../data/salesCardCTData';
import { deleteInventoryExportsByOrderId, syncInventoryExportFromSalesOrder } from '../data/inventoryData';
import type { SalesCard, SalesCardFormData } from '../data/salesCardData';
import { 
  bulkUpsertSalesCards,
  buildServiceNameLookup,
  deleteSalesCard, 
  findServiceForOrderDetailLine,
  getNextSalesCardCode, 
  getSalesCardsForExport,
  getSalesCardsPaginated, 
  looksLikeOpaqueServiceCode,
  normalizeSalesCards,
  resolveServiceDisplayName,
  resolveServiceNameForDetail,
  upsertSalesCard,
  getCustomerFirstSaleDates 
} from '../data/salesCardData';
import { computeChanges, saveEditHistory } from '../data/salesCardHistoryData';
import type { DichVu } from '../data/serviceData';
import { getServices } from '../data/serviceData';
import { supabase } from '../lib/supabase';
import { preferCustomerLinkKey } from '../lib/customerOrderLink';
import { resolveCustomerBranch, resolveOrderBranchFromCard } from '../constants/customerBranches';
import { formatTime24h } from '../utils/datetimeFormat';

const SalesCardFormModal = React.lazy(() => import('../components/SalesCardFormModal'));

type ServiceLineItem = { id: string; ten_dich_vu: string; gia_ban: number; so_luong: number };

function mergeServiceLineItems(
  ctRows: Array<{
    id?: string;
    dich_vu_id?: string | null;
    san_pham_vat_tu_id?: string | null;
    ten_dich_vu?: string | null;
    san_pham?: string | null;
    gia_ban?: number | null;
    so_luong?: number | null;
    co_so?: string | null;
  }>,
  services: DichVu[],
  serviceLookup: ReturnType<typeof buildServiceNameLookup>
): ServiceLineItem[] {
  const merged = new Map<string, ServiceLineItem>();

  for (const ct of ctRows) {
    const raw = (ct.ten_dich_vu || ct.san_pham || '').trim();
    const masterService = findServiceForOrderDetailLine(ct, services, serviceLookup);
    const displayName =
      masterService?.ten_dich_vu ||
      (raw && !looksLikeOpaqueServiceCode(raw)
        ? raw
        : resolveServiceNameForDetail(raw, ct.gia_ban, ct.co_so, serviceLookup, services));
    const serviceId = masterService?.id || ct.dich_vu_id || ct.san_pham_vat_tu_id || raw || displayName;
    if (!serviceId) continue;

    const qty = ct.so_luong || 1;
    const price = ct.gia_ban || 0;
    const existing = merged.get(serviceId);
    if (existing) {
      existing.so_luong += qty;
    } else {
      merged.set(serviceId, {
        id: serviceId,
        ten_dich_vu: displayName,
        gia_ban: price,
        so_luong: qty,
      });
    }
  }

  return Array.from(merged.values());
}

function upsertCustomerInList(prev: KhachHang[], customer: KhachHang): KhachHang[] {
  const exists = prev.some(
    (c) =>
      (customer.id && c.id === customer.id) ||
      (customer.ma_khach_hang && c.ma_khach_hang === customer.ma_khach_hang)
  );
  return exists ? prev : [customer, ...prev];
}

const SalesCardManagementPage: React.FC = () => {
  const { nhanVien, isAdmin, canManageOrders } = useAuth();
  const isQuanLy = isQuanLyViTri(nhanVien?.vi_tri);
  const canEditSalesCard = useCallback(
    (card: SalesCard) => (isAdmin || isQuanLy) || (canManageOrders && !card.thu_chi),
    [isAdmin, isQuanLy, canManageOrders]
  );
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
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [newCustomersCount, setNewCustomersCount] = useState(0);
  const [returningCustomersCount, setReturningCustomersCount] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
  const [editingCard, setEditingCard] = useState<SalesCard | null>(null);
  const [formData, setFormData] = useState<SalesCardFormData>({});

  // Date filtering states — mặc định không lọc ngày (hiển thị tất cả)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [customerFirstSaleDateMap, setCustomerFirstSaleDateMap] = useState<Record<string, string>>({});
  const [exportingExcel, setExportingExcel] = useState(false);

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
    hasLoadedRefData.current = true;
    try {
      const [persData, servData] = await Promise.all([
        getPersonnel(),
        getServices(),
      ]);
      setPersonnel(persData);
      setServices(servData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
    void getCustomersForSelect()
      .then((custData) => setCustomers(custData as KhachHang[]))
      .catch((error) => console.error('Error loading customers for select:', error));
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
        isAdmin && selectedStaff ? selectedStaff : undefined,
        isAdmin && selectedBranch ? selectedBranch : undefined
      );

      setSalesCards(cardsResult.data);
      setTotalCount(cardsResult.totalCount);
      setTotalAmount(cardsResult.totalAmount);
      setTotalCustomers(cardsResult.totalCustomers || 0);
      setNewCustomersCount(cardsResult.newCustomersCount || 0);
      setReturningCustomersCount(cardsResult.returningCustomersCount || 0);

      // Fetch first sale dates in background to avoid blocking main list rendering
      const uniqueNames = [...new Set(
        cardsResult.data
          .map(c => c.khach_hang?.ho_va_ten || c.ten_khach_hang || '')
          .filter(n => n.trim())
      )] as string[];
      if (uniqueNames.length > 0) {
        void getCustomerFirstSaleDates(uniqueNames)
          .then((firstDates) => setCustomerFirstSaleDateMap(firstDates))
          .catch((err) => console.error('Error loading first sale dates:', err));
      } else {
        setCustomerFirstSaleDateMap({});
      }
    } catch (error) {
      console.error('Error loading sales cards:', error);
      showToast('Không tải được danh sách phiếu bán hàng. Kiểm tra kết nối hoặc thử xóa bộ lọc.', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, startDate, endDate, selectedStaff, selectedBranch, isAdmin, showToast]);

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

  // Loại bỏ phiếu trùng id (tránh cảnh báo React key trùng).
  const displayItems = useMemo(() => {
    const seen = new Set<string>();
    return salesCards.filter((card) => {
      if (!card.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  }, [salesCards]);
  const serviceLookup = useMemo(() => buildServiceNameLookup(services), [services]);

  const groupedSales = useMemo(() => {
    const getSortTime = (card: SalesCard) => {
      const createdAt = card.created_at ? Date.parse(card.created_at) : NaN;
      if (Number.isFinite(createdAt)) return createdAt;

      const enteredAt = Date.parse(`${card.ngay || ''}T${card.gio || '00:00:00'}`);
      return Number.isFinite(enteredAt) ? enteredAt : 0;
    };

    const groups: Record<string, {
      date: string;
      items: SalesCard[];
      totalAmount: number;
      uniqueCustomers: Set<string>;
      newCustomers: Set<string>;
      returningCustomers: Set<string>;
      latestTime: string;
      latestSortTime: number;
    }> = {};

    displayItems.forEach(card => {
      const date = card.ngay;
      const sortTime = getSortTime(card);
      if (!groups[date]) {
        groups[date] = {
          date,
          items: [],
          totalAmount: 0,
          uniqueCustomers: new Set(),
          newCustomers: new Set(),
          returningCustomers: new Set(),
          latestTime: card.gio || '00:00',
          latestSortTime: sortTime
        };
      }
      
      const itemsDetail = (card as any).the_ban_hang_ct || [];
      const cardTotal = itemsDetail.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
      
      groups[date].items.push(card);
      groups[date].totalAmount += cardTotal;
      
      // Use customer name as the unique identifier (normalized)
      const customerName = (card.khach_hang?.ho_va_ten || card.ten_khach_hang || 'unknown').trim().toLowerCase();
      groups[date].uniqueCustomers.add(customerName);
      
      // Categorize New vs Returning by checking name history
      const firstDate = customerFirstSaleDateMap[customerName];

      if (firstDate) {
        if (firstDate >= date) {
          groups[date].newCustomers.add(customerName);
        } else {
          groups[date].returningCustomers.add(customerName);
        }
      } else {
        groups[date].newCustomers.add(customerName);
      }
      
      // Keep track of the latest activity time in this group
      if (card.gio && card.gio > groups[date].latestTime) {
        groups[date].latestTime = card.gio;
      }
      if (sortTime > groups[date].latestSortTime) {
        groups[date].latestSortTime = sortTime;
      }
    });

    return Object.values(groups).sort((a, b) => {
      const byNewestInput = b.latestSortTime - a.latestSortTime;
      if (byNewestInput !== 0) return byNewestInput;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [displayItems]);

  const [isSyncingServiceNames, setIsSyncingServiceNames] = useState(false);

  const fetchAllRows = async <T extends Record<string, unknown>>(
    table: 'the_ban_hang_ct' | 'the_ban_hang',
    select: string,
    pageSize = 1000
  ): Promise<T[]> => {
    const out: T[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = ((data || []) as unknown) as T[];
      out.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return out;
  };

  // Đồng bộ toàn DB: san_pham / dich_vu_id khớp dich_vu.id_dich_vu -> ten_dich_vu (query trực tiếp DB)
  const handleSyncServiceNames = async () => {
    if (!isAdmin) {
      showToast('Bạn không có quyền thực hiện thao tác này.', 'error');
      return;
    }

    const ok = window.confirm(
      'Đồng bộ TOÀN BỘ dữ liệu dịch vụ trong database (đối chiếu theo cột dich_vu.id_dich_vu):\n\n' +
        '• the_ban_hang_ct.san_pham: nếu khớp dich_vu.id_dich_vu → ghi thành ten_dich_vu.\n' +
        '• the_ban_hang.dich_vu_id: tương tự (phiếu không có chi tiết).\n\n' +
        'Tiếp tục?'
    );
    if (!ok) return;

    try {
      setIsSyncingServiceNames(true);

      const ctRows = await fetchAllRows<{
        id: string;
        san_pham: string | null;
        gia_ban: number | null;
        co_so: string | null;
      }>('the_ban_hang_ct', 'id, san_pham, gia_ban, co_so');
      const headerRows = await fetchAllRows<{ id: string; dich_vu_id: string | null }>('the_ban_hang', 'id, dich_vu_id');

      const allServices = await getServices();
      const codeToName = buildServiceNameLookup(allServices);

      const rowsToUpdateCt: { id: string; san_pham: string }[] = [];
      for (const row of ctRows) {
        const sp = row.san_pham;
        if (!sp) continue;
        const newName = resolveServiceNameForDetail(sp, row.gia_ban, row.co_so, codeToName, allServices);
        if (newName && newName !== sp) rowsToUpdateCt.push({ id: row.id, san_pham: newName });
      }

      const rowsToUpdateHeader: { id: string; dich_vu_id: string }[] = [];
      for (const row of headerRows) {
        const dv = row.dich_vu_id;
        if (!dv) continue;
        const newName = resolveServiceDisplayName(dv, codeToName);
        if (newName && newName !== dv) rowsToUpdateHeader.push({ id: row.id, dich_vu_id: newName });
      }

      if (rowsToUpdateCt.length === 0 && rowsToUpdateHeader.length === 0) {
        showToast('Không có bản ghi nào cần đồng bộ tên dịch vụ.', 'info');
        return;
      }

      const runBatchedUpdates = async (
        table: 'the_ban_hang_ct' | 'the_ban_hang',
        rows: { id: string; patch: Record<string, string> }[],
        concurrency = 25
      ) => {
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < rows.length; i += concurrency) {
          const chunk = rows.slice(i, i + concurrency);
          const results = await Promise.allSettled(
            chunk.map(r => supabase.from(table).update(r.patch).eq('id', r.id))
          );
          for (const res of results) {
            if (res.status === 'fulfilled' && !(res.value as { error?: unknown }).error) ok++;
            else fail++;
          }
        }
        return { ok, fail };
      };

      const ctRes = await runBatchedUpdates(
        'the_ban_hang_ct',
        rowsToUpdateCt.map(r => ({ id: r.id, patch: { san_pham: r.san_pham } }))
      );
      const hdrRes = await runBatchedUpdates(
        'the_ban_hang',
        rowsToUpdateHeader.map(r => ({ id: r.id, patch: { dich_vu_id: r.dich_vu_id } }))
      );

      const failedCount = ctRes.fail + hdrRes.fail;

      if (failedCount > 0) {
        showToast(
          `Đồng bộ: ${ctRes.ok}/${rowsToUpdateCt.length} chi tiết, ${hdrRes.ok}/${rowsToUpdateHeader.length} phiếu. Lỗi: ${failedCount}.`,
          'warning'
        );
      } else {
        showToast(
          `Đã đồng bộ xong: ${ctRes.ok} chi tiết (the_ban_hang_ct), ${hdrRes.ok} phiếu (the_ban_hang.dich_vu_id).`,
          'success'
        );
      }
      await loadSalesCards();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không xác định';
      console.error('[SyncServiceNames] Lỗi:', err);
      showToast(`Lỗi đồng bộ tên dịch vụ: ${message}`, 'error');
    } finally {
      setIsSyncingServiceNames(false);
    }
  };

  // ---- AUTO-OPEN MODAL WHEN REDIRECTED FROM CUSTOMER PAGE ----
  // Use a ref to store the pending customer ID so it survives re-renders
  const pendingCustomerRef = React.useRef<string | null>(null);
  const pendingMaRef = React.useRef<string | null>(null);
  const pendingCustomerDataRef = React.useRef<KhachHang | null>(null);
  const pendingAutoOpenHandledRef = React.useRef(false);
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
        searchKey: searchParts.join(' '),
        bien_so_xe: c.bien_so_xe || '',
        dia_chi_hien_tai: c.dia_chi_hien_tai || '',
      };
    });

    // Remove duplicates based on value (key) and customer id
    const uniqueOptions = [];
    const seenValues = new Set<string>();
    const seenIds = new Set<string>();
    for (const opt of rawOptions) {
      const customer = list.find((c) => (c.ma_khach_hang || c.id) === opt.value);
      const customerId = customer?.id || '';
      if (!opt.value || seenValues.has(opt.value) || (customerId && seenIds.has(customerId))) continue;
      seenValues.add(opt.value);
      if (customerId) seenIds.add(customerId);
      uniqueOptions.push(opt);
    }
    return uniqueOptions;
  }, [customers, pendingNewCustomer]);

  // Capture pending ID immediately on first render (before any async work)
  if (pendingCustomerRef.current === null) {
    const state = location.state as any;
    const pendingData = state?.pendingCustomerData;
    const id = pendingData
      ? (pendingData.ma_khach_hang || pendingData.id)
      : (state?.pendingMaKhachHang || state?.pendingCustomerId || sessionStorage.getItem('pendingCustomerId'));
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

  // Mở form lập đơn ngay khi chuyển từ modal km — không chờ tải danh sách phiếu/khách hàng
  useEffect(() => {
    if (pendingAutoOpenHandledRef.current) return;

    const pendingId = pendingCustomerRef.current;
    const pendingMa = pendingMaRef.current;
    const pendingData = pendingCustomerDataRef.current;
    if (!pendingId && !pendingData) return;

    pendingAutoOpenHandledRef.current = true;
    pendingCustomerRef.current = '';
    pendingMaRef.current = '';
    pendingCustomerDataRef.current = null;

    void loadReferenceData();

    const injectCustomer = (customer: KhachHang) => {
      setPendingNewCustomer(customer);
      setCustomers((prev) => upsertCustomerInList(prev, customer));
    };

    const openFormForCustomer = async () => {
      try {
        const modalChunk = import('../components/SalesCardFormModal');

        let customer: KhachHang | null = pendingData ? (pendingData as KhachHang) : null;

        if (!customer && pendingId) {
          customer = customers.find((c) => {
            const optionValue = c.ma_khach_hang || c.id;
            return c.id === pendingId || c.ma_khach_hang === pendingId || optionValue === pendingId
              || (pendingMa && (c.ma_khach_hang === pendingMa || optionValue === pendingMa));
          }) || null;

          if (!customer) {
            const { data: fetchedCustomer } = await supabase
              .from('khach_hang')
              .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, so_km, bien_so_xe, dia_chi_hien_tai')
              .or(`id.eq.${pendingId}${pendingMa ? `,ma_khach_hang.eq.${pendingMa}` : ''}`)
              .limit(1)
              .maybeSingle();

            if (!fetchedCustomer) {
              console.warn('[Auto-open] Customer not found for id:', pendingId);
              return;
            }
            customer = fetchedCustomer as KhachHang;
          }
        }

        if (!customer) return;

        injectCustomer(customer);
        await modalChunk;

        setEditingCard(null);
        setIsReadOnlyModal(false);
        setFormData({
          ngay: new Date().toISOString().split('T')[0],
          gio: formatTime24h(new Date(), false),
          id_bh: '',
          khach_hang_id: preferCustomerLinkKey(customer),
          nhan_vien_id: nhanVien?.ho_ten || '',
          dich_vu_id: '',
          dich_vu_ids: [],
          ngay_nhac_thay_dau: '',
          co_so_khach: customer.dia_chi_hien_tai?.trim() || '',
        });
        setIsModalOpen(true);

        void getNextSalesCardCode().then((code) => {
          setFormData((prev) => ({ ...prev, id_bh: code }));
        });
      } catch (err) {
        console.error('[CRITICAL] Error auto-opening form:', err);
      }
    };

    void openFormForCustomer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenModal = async (card?: SalesCard) => {
    if (!canManageOrders) {
      if (card) {
        handleViewCard(card);
      } else {
        showToast('Bạn không có quyền lập đơn hàng.', 'error');
      }
      return;
    }

    if (card && card.thu_chi && !isAdmin && !isQuanLy) {
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
            so_dien_thoai: card.khach_hang.so_dien_thoai || '',
            bien_so_xe: card.khach_hang.bien_so_xe || '',
          } as KhachHang;
          setCustomers((prev) => upsertCustomerInList(prev, c!));
        }
        if (c) mappedKhId = c.ma_khach_hang || c.id;
      }

      const mappedServiceItems = mergeServiceLineItems(
        (card as any).the_ban_hang_ct || [],
        services,
        serviceLookup
      );
      const mappedIds = mappedServiceItems.map((item) => item.id);

      setFormData({
        ...card,
        khach_hang_id: mappedKhId,
        dich_vu_ids: mappedIds,
        service_items: mappedServiceItems,
        co_so_khach: resolveOrderBranchFromCard(card),
      } as any);
    } else {
      setEditingCard(null);

      const nextCode = await getNextSalesCardCode();

      setFormData({
        ngay: new Date().toISOString().split('T')[0],
        gio: formatTime24h(new Date(), false),
        id_bh: nextCode,
        khach_hang_id: '',
        nhan_vien_id: nhanVien?.ho_ten || '',
        dich_vu_id: '',
        dich_vu_ids: [],
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
          so_dien_thoai: card.khach_hang.so_dien_thoai || '',
          bien_so_xe: card.khach_hang.bien_so_xe || '',
        } as KhachHang;
        setCustomers((prev) => upsertCustomerInList(prev, c!));
      }
      if (c) mappedKhId = c.ma_khach_hang || c.id;
    }

    const mappedServiceItems = mergeServiceLineItems(
      (card as any).the_ban_hang_ct || [],
      services,
      serviceLookup
    );
    const mappedIds = mappedServiceItems.map((item) => item.id);

    setFormData({
      ...card,
      khach_hang_id: mappedKhId,
      dich_vu_ids: mappedIds,
      service_items: mappedServiceItems,
      co_so_khach: resolveOrderBranchFromCard(card),
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

  const handleSubmit = async (formDataHeader: SalesCardFormData) => {
    try {
      if (!canManageOrders) {
        showToast('Bạn không có quyền lập hoặc sửa đơn hàng.', 'error');
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
        co_so_khach,
        ...cleanData
      } = formDataHeader as any;

      const foundForBranch = cleanData.khach_hang_id
        ? customers.find(
            (c) => c.id === cleanData.khach_hang_id || c.ma_khach_hang === cleanData.khach_hang_id
          )
        : undefined;
      const orderBranch =
        resolveCustomerBranch(co_so_khach) ||
        resolveCustomerBranch(foundForBranch?.dia_chi_hien_tai);
      if (!orderBranch) {
        showToast('Vui lòng chọn cơ sở trước khi lập phiếu.', 'error');
        return;
      }

      // Extract the name from the existing customers if ten_khach_hang is implicitly null
      if (!cleanData.ten_khach_hang && cleanData.khach_hang_id) {
        const foundCustomer = customers.find(c => c.id === cleanData.khach_hang_id || c.ma_khach_hang === cleanData.khach_hang_id);
        if (foundCustomer && foundCustomer.ho_va_ten) {
          cleanData.ten_khach_hang = foundCustomer.ho_va_ten;
        }
      }

      // Luôn lưu mã KH (legacy) thay vì UUID để khớp phiếu cũ + trang Khách hàng
      if (cleanData.khach_hang_id) {
        const found = customers.find(
          (c) => c.id === cleanData.khach_hang_id || c.ma_khach_hang === cleanData.khach_hang_id
        );
        if (found) {
          cleanData.khach_hang_id = preferCustomerLinkKey(found);
          if (!cleanData.ten_khach_hang) cleanData.ten_khach_hang = found.ho_va_ten;
          if (!cleanData.so_dien_thoai) cleanData.so_dien_thoai = found.so_dien_thoai;
          if (!(found.dia_chi_hien_tai || '').trim() && found.id) {
            void upsertCustomer({ id: found.id, dia_chi_hien_tai: orderBranch }).catch((err) => {
              console.error('Lỗi khi lưu cơ sở khách hàng:', err);
            });
            setCustomers((prev) =>
              prev.map((c) =>
                c.id === found.id || c.ma_khach_hang === found.ma_khach_hang
                  ? { ...c, dia_chi_hien_tai: orderBranch }
                  : c
              )
            );
          }
        }
      }

      // Sanitize date fields to avoid "invalid input syntax for type date" error in Supabase
      if (cleanData.ngay_nhac_thay_dau === '') cleanData.ngay_nhac_thay_dau = null;

      // Deferred Save execution: if there is a pending new customer and it's the one selected
      if (pendingNewCustomer && (cleanData.khach_hang_id === pendingNewCustomer.ma_khach_hang || cleanData.khach_hang_id === pendingNewCustomer.id)) {
        const dataToSave: any = {
          ...pendingNewCustomer,
          ...(orderBranch ? { dia_chi_hien_tai: orderBranch } : {}),
        };
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!dataToSave.id || !uuidRegex.test(dataToSave.id)) {
          delete dataToSave.id;
        }
        if (!dataToSave.nhan_vien_id) {
          dataToSave.nhan_vien_id = cleanData.nhan_vien_id || nhanVien?.ho_ten || '';
        }
        try {
          const savedCustomer = await upsertCustomer(dataToSave);
          cleanData.khach_hang_id = preferCustomerLinkKey(savedCustomer);

          // Remove from pending so subsequent saves (if editing without closing) use the new real ID
          setPendingNewCustomer(null);
          // Also update local list to remove the "[MỚI]" prefix and update IDs
          setCustomers(prev => prev.map(c => c.ma_khach_hang === pendingNewCustomer.ma_khach_hang ? { ...savedCustomer } : c));
        } catch (err: any) {
          if (err?.code === '42501') {
            // RLS không cho ghi bảng khách hàng: vẫn cho phép lưu phiếu bán hàng để không chặn thao tác.
            cleanData.khach_hang_id = pendingNewCustomer.ma_khach_hang || pendingNewCustomer.id || '';
            cleanData.ten_khach_hang = pendingNewCustomer.ho_va_ten || cleanData.ten_khach_hang;
          } else {
            throw err;
          }
        }
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
          saveEditHistory(savedCard.id, nhanVien?.ho_ten || 'Hệ thống', changes);
        }
      }

      // 'Deep Clean': Clear ALL old records (both by UUID and by Order Code) to prevent phantom duplicates
      await deleteSalesCardCTsByOrderId(savedCard.id, savedCard.id_bh || undefined);

      // Robust Service Mapping: Always use dich_vu_ids as the source of truth for ADD/DELETE,
      // and lookup in service_items ONLY for price overrides.
      const detailRecords: Partial<SalesCardCT>[] = (dich_vu_ids || []).map((sId: string) => {
        const service = services.find(s => s.id === sId);
        // Look for a manual price override from the modal's state
        const override = (formDataHeader.service_items || []).find(it => it.id === sId);
        const orderRef = savedCard.id_bh || savedCard.id;

        return {
          id_don_hang: orderRef,
          ten_don_hang: formDataHeader.id_bh || `Đơn hàng ${savedCard.id_bh || savedCard.id.slice(0, 8)}`,
          san_pham: service?.ten_dich_vu || override?.ten_dich_vu || 'Dịch vụ',
          co_so: service?.co_so || orderBranch,
          gia_ban: override?.gia_ban ?? (service?.gia_ban || 0),
          gia_von: service?.gia_nhap || 0,
          so_luong: override?.so_luong ?? 1,
          chi_phi: 0,
          ngay: savedCard.ngay
        };
      });

      // AUTOMATION: Định hình dòng tài chính - Dựa trên detailRecords vừa tính ở trên cho chính xác
      const totalAmount = detailRecords.reduce(
        (sum, item) => sum + ((item.gia_ban || 0) * (item.so_luong || 1)),
        0
      );
      const khachHangId = savedCard.khach_hang_id;

      const exportCoSo = orderBranch;

      // Bước 3: Đẩy đồng thời TẤT CẢ TÁC VỤ còn lại không phụ thuộc nhau
      await Promise.all([
        detailRecords.length > 0 ? bulkUpsertSalesCardCTs(detailRecords) : Promise.resolve(),
        syncInventoryExportFromSalesOrder({
          orderId: savedCard.id,
          orderCode: savedCard.id_bh,
          ngay: savedCard.ngay,
          gio: savedCard.gio || '00:00',
          coSo: exportCoSo,
          nguoiThucHien: nhanVien?.ho_ten || savedCard.nhan_su?.ho_ten || 'Hệ thống',
          lines: detailRecords.map((item) => ({
            ten_mat_hang: item.san_pham || 'Dịch vụ',
            so_luong: item.so_luong ?? 1,
            gia: item.gia_von ?? 0,
          })),
        }),
        (async () => {
          const existingTx = await getTransactionByOrderId(savedCard.id);
          const paymentMethod =
            existingTx?.phuong_thuc ||
            savedCard.phuong_thuc_thanh_toan ||
            cleanData.phuong_thuc_thanh_toan ||
            'Tiền mặt';
          const financialRecord: Partial<ThuChi> = {
            id: existingTx?.id,
            loai_phieu: 'phiếu thu',
            phuong_thuc: paymentMethod,
            id_don: savedCard.id,
            so_tien: totalAmount,
            ngay: savedCard.ngay,
            gio: savedCard.gio,
            co_so: orderBranch,
            id_khach_hang: savedCard.khach_hang_id,
            danh_muc: 'Doanh thu dịch vụ',
            trang_thai: 'Hoàn thành',
            ghi_chu: existingTx?.ghi_chu || `Hệ thống tự động: Đồng bộ tiền đơn hàng ${savedCard.id.slice(0, 8)}`
          };
          await upsertTransaction(financialRecord);
        })(),
        khachHangId
          ? (async () => {
              const idCol = khachHangId.length === 36 ? 'id' : 'ma_khach_hang';
              const { error } = await supabase
                .from('khach_hang')
                .update({ created_at: new Date().toISOString() })
                .eq(idCol, khachHangId);
              if (error && error.code !== '42501') {
                throw error;
              }
            })()
          : Promise.resolve()
      ]);

      handleCloseModal();
      showToast('Lập phiếu bán hàng thành công!', 'success');
      if (!editingCard && currentPage !== 1) {
        setCurrentPage(1);
      } else {
        void loadSalesCards();
      }
    } catch (error: any) {
      console.error('Save sales card failed:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        raw: error,
      });
      showToast(`Lỗi lưu phiếu: ${error?.message || 'Không thể lưu phiếu bán hàng.'}`, 'error');
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
        gio: data.gio || formatTime24h(new Date(), false),
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
      handleCloseModal();
      void loadSalesCards();
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

  const handleDelete = async (id: string, orderCode?: string | null) => {
    if (!isAdmin) {
      showToast('Chỉ quản trị viên được xóa phiếu bán hàng.', 'error');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa phiếu này?')) {
      try {
        await deleteSalesCard(id);
        await Promise.all([
          deleteTransactionByOrderId(id),
          deleteInventoryExportsByOrderId(id, orderCode),
        ]);
        await loadSalesCards();
      } catch (error) {
        alert('Lỗi: Không thể xóa phiếu.');
      }
    }
  };

  const toLocalIsoDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleMonthChange = (monthStr: string) => {
    setSelectedMonth(monthStr);
    if (!monthStr) {
      setStartDate('');
      setEndDate('');
      setCurrentPage(1);
      return;
    }

    setSelectedMonth(monthStr);

    const [year, month] = monthStr.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    setStartDate(toLocalIsoDate(firstDay));
    setEndDate(toLocalIsoDate(lastDay));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSelectedMonth('');
    setSelectedStaff('');
    setSelectedBranch('');
    setCurrentPage(1);
  };

  const handleExportFilteredExcel = async () => {
    try {
      setExportingExcel(true);
      const cards = await getSalesCardsForExport(
        debouncedSearch,
        startDate || undefined,
        endDate || undefined,
        isAdmin && selectedStaff ? selectedStaff : undefined,
        isAdmin && selectedBranch ? selectedBranch : undefined
      );

      if (cards.length === 0) {
        showToast('Không có phiếu nào khớp bộ lọc để xuất.', 'error');
        return;
      }

      const rows = cards.map((card) => {
        const items = card.the_ban_hang_ct || [];
        const dichVu = items.length > 0
          ? items.map((ct) => `${ct.san_pham || (ct as { ten_dich_vu?: string }).ten_dich_vu || ''} x${ct.so_luong || 1}`).join('; ')
          : card.dich_vu?.ten_dich_vu || '';
        const total = items.reduce(
          (s, ct) => s + (Number(ct.thanh_tien) || Number(ct.gia_ban || 0) * Number(ct.so_luong || 1)),
          0
        ) || Number(card.tong_tien || 0) || Number(card.dich_vu?.gia_ban || 0);
        const coSo = items[0]?.co_so || card.dich_vu?.co_so || '';
        const staff = card.nhan_su_list?.length
          ? card.nhan_su_list.map((p) => p.ho_ten).filter(Boolean).join(', ')
          : card.nhan_su?.ho_ten || card.nhan_vien_id || '';

        return {
          'Mã phiếu': card.id_bh || card.id,
          'Ngày': card.ngay,
          'Giờ': card.gio,
          'Mã khách hàng': card.khach_hang_id || '',
          'Tên khách hàng': card.khach_hang?.ho_va_ten || card.ten_khach_hang || '',
          'SĐT': card.khach_hang?.so_dien_thoai || card.so_dien_thoai || '',
          'Biển số xe': card.khach_hang?.bien_so_xe || '',
          'Địa chỉ': card.khach_hang?.dia_chi_hien_tai || '',
          'Phụ trách': staff,
          'Dịch vụ': dichVu,
          'Tổng tiền': total,
          'Thanh toán': card.thu_chi?.phuong_thuc || card.phuong_thuc_thanh_toan || '',
          'Số km': card.so_km ?? '',
          'Nhắc thay dầu': card.ngay_nhac_thay_dau || '',
          'Ghi chú': card.ghi_chu || '',
          'Cơ sở': coSo,
          'Đánh giá': card.danh_gia || '',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'PhieuBanHang');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `phieu_ban_hang_${stamp}.xlsx`);
      showToast(`Đã xuất ${rows.length} phiếu bán hàng.`, 'success');
    } catch (error) {
      console.error(error);
      showToast('Không thể xuất Excel. Vui lòng thử lại.', 'error');
    } finally {
      setExportingExcel(false);
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
        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex items-center justify-between gap-2 sm:gap-4 font-sans overflow-x-auto">
          <div className="flex items-center gap-1.5 sm:gap-3 flex-nowrap shrink-0">
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
                placeholder="Tìm mã phiếu, tên KH, BSX, SĐT..."
                type="text"
              />
            </div>
          </div>

          <div className="w-auto shrink-0">
            <div className="flex items-center gap-1.5 flex-nowrap sm:flex-wrap justify-start sm:justify-end overflow-x-auto">
            {isAdmin && (
              <div className="hidden sm:flex items-center gap-1.5">
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
                  onClick={handleSyncServiceNames}
                  disabled={isSyncingServiceNames}
                  className="px-2 py-1 sm:px-4 sm:py-2 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Đồng bộ toàn DB: the_ban_hang_ct.san_pham và the_ban_hang.dich_vu_id (id / mã dịch vụ → tên dịch vụ)"
                >
                  {isSyncingServiceNames ? (
                    <Loader2 className="size-4 sm:size-5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4 sm:size-5" />
                  )}
                  <span>{isSyncingServiceNames ? 'Đang đồng bộ...' : 'Đồng bộ tên DV (toàn DB)'}</span>
                </button>

              </div>
            )}

            {canManageOrders && (
            <button
              onClick={() => handleOpenModal()}
              className="px-2.5 py-1 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
            >
              <Plus className="size-4 sm:size-5" />
              <span>Lập hóa đơn</span>
            </button>
            )}
            </div>
          </div>
        </div>

        {/* Filter Bar — một dòng, cuộn ngang trên mobile */}
        <div className="bg-card p-2 sm:p-3 rounded-xl border border-border shadow-sm font-sans overflow-x-auto">
          <div className="flex flex-nowrap items-center justify-end gap-2 sm:gap-3 min-w-max">
            {isAdmin && (
              <>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground shrink-0">
                  <Building size={14} className="shrink-0" />
                  <div className="relative">
                    <select
                      value={selectedBranch}
                      onChange={(e) => {
                        setSelectedBranch(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="appearance-none min-w-[7.5rem] sm:min-w-[9rem] pl-2 pr-7 sm:pl-3 sm:pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all text-[11px] sm:text-[13px]"
                    >
                      <option value="">Cơ sở...</option>
                      {['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'].map((branch) => (
                        <option key={branch} value={branch}>{branch}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none text-muted-foreground" />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground shrink-0">
                  <User size={14} className="shrink-0" />
                  <div className="relative">
                    <select
                      value={selectedStaff}
                      onChange={(e) => {
                        setSelectedStaff(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="appearance-none min-w-[7.5rem] sm:min-w-[9rem] pl-2 pr-7 sm:pl-3 sm:pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all text-[11px] sm:text-[13px]"
                    >
                      <option value="">Nhân sự...</option>
                      {personnel.map((p) => (
                        <option key={p.id} value={p.ho_ten}>{p.ho_ten}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none text-muted-foreground" />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground shrink-0">
              <Calendar size={14} className="shrink-0" />
              <span className="hidden sm:inline">Tháng:</span>
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="appearance-none min-w-[6.5rem] sm:min-w-[7.5rem] pl-2 pr-7 sm:pl-3 sm:pr-8 py-1.5 bg-muted/50 border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-all text-[11px] sm:text-[13px]"
                >
                  <option value="">Tháng...</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
                    return <option key={val} value={val}>{label}</option>;
                  })}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none text-muted-foreground" />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border shrink-0">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-[11px] sm:text-[13px] font-medium outline-none p-1 w-[7.25rem] sm:w-[8.5rem] cursor-pointer"
              />
              <span className="text-muted-foreground opacity-50 px-0.5">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-[11px] sm:text-[13px] font-medium outline-none p-1 w-[7.25rem] sm:w-[8.5rem] cursor-pointer"
              />
            </div>

            {(startDate || endDate || searchQuery || selectedMonth || (isAdmin && (selectedStaff || selectedBranch))) && (
              <button
                onClick={handleClearFilters}
                className="p-1.5 sm:p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100 shrink-0"
                title="Xóa bộ lọc"
              >
                <X size={18} className="sm:hidden" />
                <X size={20} className="hidden sm:block" />
              </button>
            )}

            <button
              type="button"
              onClick={handleExportFilteredExcel}
              disabled={exportingExcel || loading}
              className="shrink-0 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-500/10 hover:bg-blue-500/15 text-blue-700 border border-blue-500/25 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all disabled:opacity-60 whitespace-nowrap"
            >
              {exportingExcel ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              <span className="hidden sm:inline">{exportingExcel ? 'Đang xuất Excel...' : 'Xuất Excel (bộ lọc)'}</span>
              <span className="sm:hidden">{exportingExcel ? '...' : 'Excel'}</span>
            </button>
          </div>
        </div>

        {/* Summary Bar - Tổng đơn & Tổng tiền */}
        {!loading && displayItems.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3 flex-nowrap overflow-x-auto pb-1">
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tổng đơn:</span>
              <span className="text-sm sm:text-base font-black text-primary">{totalCount}</span>
            </div>
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tổng khách:</span>
              <span className="text-sm sm:text-base font-black text-blue-600">{totalCustomers}</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground opacity-80">
                (🆕{newCustomersCount} mới | 🔄{returningCustomersCount} cũ)
              </span>
            </div>
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Tổng tiền:</span>
              <span className="text-sm sm:text-base font-black text-emerald-600">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
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
                {/* Group Header (Mobile) - báo cáo theo ngày */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-1.5 text-primary font-bold text-[12px] whitespace-nowrap shrink-0">
                    <Calendar size={14} />
                    {new Date(group.date).toLocaleDateString('vi-VN')}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground flex-wrap justify-end">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      👥 {group.uniqueCustomers.size} khách
                    </span>
                    <span className="opacity-30">|</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      📄 {group.items.length} đơn
                    </span>
                    <span className="opacity-30">|</span>
                    <span className="text-emerald-600 font-black text-[13px] whitespace-nowrap">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {group.items.map(card => {
                    const items = (card as any).the_ban_hang_ct || [];
                    const totalAmount = items.reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0);
                    const branch = items.length > 0 ? items[0].co_so : (card.dich_vu?.co_so || 'Cơ sở chính');

                    return (
                      <div key={card.id} className="bg-card p-3 rounded-xl border border-border shadow-sm space-y-2.5 relative group hover:border-primary/30 transition-all active:scale-[0.99]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-[16px] font-black text-foreground leading-tight truncate">
                              {card.khach_hang?.ho_va_ten || card.ten_khach_hang || 'N/A'}
                            </div>
                            <div className="text-[12px] text-muted-foreground font-medium truncate">
                              {card.khach_hang?.so_dien_thoai || card.so_dien_thoai || 'N/A'}
                            </div>
                            {card.khach_hang?.bien_so_xe && (
                              <div className="text-[11px] font-black text-blue-600 uppercase tracking-wide truncate">
                                {card.khach_hang.bien_so_xe}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-primary font-black text-[16px] leading-none whitespace-nowrap">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                            </div>
                            {Number(card.so_km) > 0 && (
                              <div className="text-[10px] font-bold text-muted-foreground mt-1 tabular-nums">
                                {Number(card.so_km).toLocaleString('vi-VN')} km
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground font-bold pt-1 border-t border-border/30">
                          <span className="flex items-center gap-1 text-primary shrink-0">
                            <Calendar size={12} />
                            {card.gio}
                          </span>
                          <span className="opacity-30">·</span>
                          <span className="truncate min-w-0">
                            {card.nhan_su_list && card.nhan_su_list.length > 0
                              ? card.nhan_su_list.map((p) => p.ho_ten).filter(Boolean).join(', ')
                              : (card.nhan_vien_id || 'N/A')}
                          </span>
                          <span className="opacity-30">·</span>
                          <span className="truncate">{branch}</span>
                        </div>

                        <div className="flex items-center justify-end gap-1.5 pt-0.5">
                          <button onClick={() => handleViewCard(card)} className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-[12px] font-bold border border-blue-100 transition-colors">
                            <Eye size={14} /> Xem
                          </button>
                          {canEditSalesCard(card) && (
                            <button onClick={() => handleOpenModal(card)} className="flex items-center gap-1 px-3 py-1.5 text-primary hover:bg-primary/10 rounded-lg text-[12px] font-bold border border-primary/20 transition-colors">
                              <Edit2 size={14} /> Sửa
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => handleDelete(card.id, card.id_bh)} className="flex items-center gap-1 px-3 py-1.5 text-destructive hover:bg-destructive/10 rounded-lg text-[12px] font-bold border border-destructive/20 transition-colors">
                              <Trash2 size={14} /> Xóa
                            </button>
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
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-widest font-sans">Tổng khách lọc:</span>
                <div className="flex flex-col items-end">
                  <span className="text-blue-600 font-black text-lg">{totalCustomers} khách</span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    (🆕{newCustomersCount} mới | 🔄{returningCustomersCount} cũ)
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-widest font-sans">Tổng doanh số lọc:</span>
                <span className="text-primary font-black text-lg">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Data Table (Desktop View) */}
        <div className="hidden md:block bg-card rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[1410px] text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-slate-600 text-[12px] font-bold uppercase tracking-wide shadow-[inset_0_-1px_0_#cbd5e1]">
                  <th className="px-4 py-4 font-bold text-center w-[112px]">Thời gian</th>
                  <th className="px-4 py-4 font-bold w-[150px]">Khách hàng</th>
                  <th className="px-4 py-4 font-bold w-[130px]">SĐT</th>
                  <th className="px-4 py-4 font-bold w-[120px]">BSX</th>
                  <th className="px-4 py-4 font-bold w-[190px]">Địa chỉ</th>
                  <th className="px-4 py-4 font-bold w-[180px]">Phụ trách</th>
                  <th className="px-4 py-4 font-bold w-[300px]">Dịch vụ sử dụng</th>
                  <th className="px-4 py-4 font-bold text-right w-[130px]">Tổng tiền</th>
                  <th className="px-4 py-4 font-bold text-center w-[130px]">Thanh toán</th>
                  <th className="px-4 py-4 font-bold text-right w-[110px]">Số Km</th>
                  <th className="px-4 py-4 font-bold w-[180px]">Ghi chú</th>
                  <th className="px-4 py-4 text-center font-bold w-[120px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="text-[14px]">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu phiếu bán hàng...
                    </td>
                  </tr>
                ) : groupedSales.length > 0 ? (
                  groupedSales.map(group => (
                    <React.Fragment key={group.date}>
                      {/* Group Header Row */}
                      <tr className="bg-slate-50">
                        <td colSpan={12} className="px-4 py-3 border-y border-slate-200">
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                            <span className="inline-flex items-center gap-2 text-[13px] font-black text-primary bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                              <Calendar size={14} />
                              {new Date(group.date).toLocaleDateString('vi-VN')}
                            </span>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-bold text-slate-600">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock size={14} className="text-slate-400" />
                                Mới nhất: <strong className="text-slate-800">{group.latestTime}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Users size={14} className="text-slate-400" />
                                <strong className="text-slate-800">{group.uniqueCustomers.size}</strong> khách
                                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                                  ({group.newCustomers.size} mới | {group.returningCustomers.size} cũ)
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <ReceiptText size={14} className="text-slate-400" />
                                <strong className="text-slate-800">{group.items.length}</strong> đơn
                              </span>
                              <span className="text-emerald-600 font-black text-[14px]">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalAmount)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.items.map(card => (
                  <tr key={card.id} className="bg-white hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-4 text-center border-b border-slate-100 align-top">
                      <div className="font-black text-slate-900 whitespace-nowrap">{new Date(card.ngay).toLocaleDateString('vi-VN')}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">{card.gio}</div>
                    </td>
                    <td className="px-4 py-4 border-b border-slate-100 align-top">
                      <div className="font-black text-primary leading-snug">{card.khach_hang?.ho_va_ten || card.ten_khach_hang || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-600 font-medium border-b border-slate-100 align-top">{card.khach_hang?.so_dien_thoai || card.so_dien_thoai || 'N/A'}</td>
                    <td className="px-4 py-4 border-b border-slate-100 align-top">
                      {card.khach_hang?.bien_so_xe ? (
                        <span className="inline-flex max-w-[110px] px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-black text-[12px] uppercase border border-blue-100 truncate" title={card.khach_hang.bien_so_xe}>
                          {card.khach_hang.bien_so_xe}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-500 text-[13px] leading-relaxed border-b border-slate-100 align-top">{card.khach_hang?.dia_chi_hien_tai || '—'}</td>
                    <td className="px-4 py-4 border-b border-slate-100 align-top">
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
                          <span className="text-slate-500 italic font-medium">{card.nhan_vien_id || 'N/A'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 border-b border-slate-100 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {(card as any).the_ban_hang_ct && (card as any).the_ban_hang_ct.length > 0 ? (
                          (card as any).the_ban_hang_ct.map((ct: any, idx: number) => (
                            <span key={idx} className="px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 font-bold text-[11px] flex items-center gap-1.5 w-fit border border-violet-100">
                              {ct.ten_dich_vu || ct.san_pham}{(ct.so_luong || 1) > 1 && <span className="opacity-60 font-bold">×{ct.so_luong}</span>}
                            </span>
                          ))
                        ) : (
                          <span className="px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 font-bold text-[11px] flex items-center gap-1.5 w-fit border border-violet-100">
                            {card.dich_vu?.ten_dich_vu || card.dich_vu_id || 'N/A'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-black text-primary border-b border-slate-100 align-top whitespace-nowrap">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                        ((card as any).the_ban_hang_ct || []).reduce((sum: number, ct: any) => sum + (ct.thanh_tien || (ct.gia_ban * (ct.so_luong || 1))), 0)
                      )}
                    </td>
                    <td className="px-4 py-4 text-center border-b border-slate-100 align-top">
                      {card.thu_chi ? (
                        <span className="inline-flex min-w-[86px] justify-center px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 font-black text-[11px] whitespace-nowrap border border-emerald-200" title="Đã thu tiền">
                          {card.thu_chi.phuong_thuc || 'Tiền mặt'}
                        </span>
                      ) : (
                        card.phuong_thuc_thanh_toan ? (
                          <span className="inline-flex min-w-[86px] justify-center px-2.5 py-1.5 rounded-md bg-amber-50 text-amber-700 font-black text-[11px] whitespace-nowrap border border-amber-200" title="Chưa thu tiền (Dự kiến)">
                            {card.phuong_thuc_thanh_toan}
                          </span>
                        ) : (
                          <span className="inline-flex min-w-[86px] justify-center px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-600 font-black text-[11px] whitespace-nowrap border border-slate-200" title="Chưa có thông tin">
                            Chưa chọn
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-slate-900 border-b border-slate-100 align-top whitespace-nowrap">{card.so_km?.toLocaleString()} km</td>
                    <td className="px-4 py-4 max-w-[200px] border-b border-slate-100 align-top">
                      {card.ghi_chu ? (
                        <div className="flex items-start gap-1.5 text-amber-600/70 italic text-[12px] leading-relaxed line-clamp-2" title={card.ghi_chu}>
                          <FileText size={14} className="shrink-0 mt-0.5" />
                          <span>{card.ghi_chu}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center border-b border-slate-100 align-top">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => handleViewCard(card)} className="h-9 w-9 inline-flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-md transition-colors border border-transparent hover:border-blue-100" title="Xem chi tiết"><Eye size={18} /></button>
                        {canEditSalesCard(card) && (
                          <button onClick={() => handleOpenModal(card)} className="h-9 w-9 inline-flex items-center justify-center text-primary hover:bg-primary/10 rounded-md transition-colors border border-transparent hover:border-blue-100" title="Chỉnh sửa"><Edit2 size={18} /></button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(card.id, card.id_bh)} className="h-9 w-9 inline-flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-md transition-colors border border-transparent hover:border-red-100" title="Xóa"><Trash2 size={18} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground italic border-b border-dashed border-border">
                      Chưa có phiếu bán hàng nào được lập.
                    </td>
                  </tr>
                )}
                {!loading && groupedSales.length > 0 && (
                  <tr className="bg-primary/5 font-black border-t-2 border-primary/20">
                    <td colSpan={6} className="px-4 py-5 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground text-[11px] tracking-widest uppercase mb-1">Tổng khách (toàn bộ):</span>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600 text-base">{totalCustomers} khách</span>
                          <span className="text-muted-foreground text-[11px] opacity-70">
                            (🆕{newCustomersCount} mới | 🔄{returningCustomersCount} cũ)
                          </span>
                        </div>
                      </div>
                    </td>
                    <td colSpan={3} className="px-4 py-5 text-right text-muted-foreground text-[11px] tracking-widest uppercase border-l border-primary/10">
                      Tổng doanh số toàn bộ (kết quả lọc):
                    </td>
                    <td colSpan={3} className="px-4 py-5 text-right text-primary text-xl">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
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
        <React.Suspense fallback={
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        }>
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
