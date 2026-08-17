import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Link2,
  Loader2,
  Moon,
  Send,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getCustomersForSelect } from '../data/customerData';
import { getServiceUsageDatesMap, getServices, type DichVu } from '../data/serviceData';
import { normalizeVnPhoneDigits } from '../lib/phoneUtils';
import { getCustomerLinkKeys } from '../lib/customerOrderLink';
import { CUSTOMER_BRANCH_OPTIONS, matchesServiceBranch, resolveCustomerBranch } from '../constants/customerBranches';
import { removeVietnameseTones } from '../lib/utils';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import DateInputVi from '../components/ui/DateInputVi';
import {
  chunkArray,
  createCampaign,
  getCampaignLogs,
  getOaStatus,
  getZnsTemplateDetail,
  listCampaigns,
  listZnsTemplates,
  renderTemplateDataForCustomer,
  renderTemplateDataForCustomers,
  sendZnsBatch,
  setCampaignTotals,
  updateCampaignStatus,
  type OaStatus,
  type ZnsCampaign,
  type ZnsFieldMappingEntry,
  type ZnsFieldSource,
  type ZnsLogEntry,
  type ZnsTemplateDetail,
  type ZnsTemplateSummary,
} from '../data/znsData';

type CustomerOption = {
  id: string;
  ma_khach_hang?: string;
  ho_va_ten: string;
  so_dien_thoai: string;
  bien_so_xe?: string;
  dia_chi_hien_tai?: string;
};

interface MappingRow {
  key: string;
  source: ZnsFieldSource;
  value: string;
}

const DEFAULT_MAPPING_ROWS: MappingRow[] = [
  { key: 'customer_name', source: 'ho_va_ten', value: '' },
  { key: 'order_date', source: 'last_order.ngay', value: '' },
];

const ORDER_REVIEW_TEMPLATE = {
  template_id: '623794',
  template_name: 'Chăm sóc, thu thập ý kiến của KH sau khi mua hàng',
  status: 1,
} as const;

const ORDER_REVIEW_LOGO_URL = 'https://stc-oa.zdn.vn/uploads/2026/08/17/77fdca07b05bea9143f72299b465976c.png';

function mappingRowsForTemplate(detail: ZnsTemplateDetail | null): MappingRow[] {
  if (!detail?.parameters?.length) return DEFAULT_MAPPING_ROWS;
  return detail.parameters.map((parameter) => {
    const key = parameter.name.replace(/[<>]/g, '').trim();
    if (key === 'customer_name') return { key, source: 'ho_va_ten', value: '' };
    if (key === 'order_date') return { key, source: 'last_order.ngay', value: '' };
    if (key === 'order_code') return { key, source: 'last_order.id_bh', value: '' };
    return { key, source: 'static', value: '' };
  });
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  nhap: { label: 'Nháp', className: 'bg-muted text-muted-foreground' },
  dang_gui: { label: 'Đang gửi', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  hoan_thanh: { label: 'Hoàn thành', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  hoan_thanh_co_loi: { label: 'Hoàn thành (có lỗi)', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
  huy: { label: 'Đã hủy', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
};

const LOG_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  cho_gui: { label: 'Chờ gửi', className: 'bg-muted text-muted-foreground' },
  thanh_cong: { label: 'Thành công', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  that_bai: { label: 'Thất bại', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  bo_qua: { label: 'Bỏ qua', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' },
};

const ZALO_APP_ID = import.meta.env.VITE_ZALO_APP_ID as string | undefined;
const ZALO_OAUTH_REDIRECT_URI = import.meta.env.VITE_ZALO_OAUTH_REDIRECT_URI as string | undefined;

function isValidVnMobile(phone: string): boolean {
  return /^0\d{9}$/.test(normalizeVnPhoneDigits(phone));
}

function dedupeCustomersByPhone(rows: CustomerOption[]): CustomerOption[] {
  const seenPhones = new Set<string>();
  return rows.filter((customer) => {
    const phone = normalizeVnPhoneDigits(customer.so_dien_thoai);
    if (!phone) return true;
    if (seenPhones.has(phone)) return false;
    seenPhones.add(phone);
    return true;
  });
}

const ZnsBulkSendPage: React.FC = () => {
  const { nhanVien } = useAuth();
  const { showToast } = useToast();

  // OA connection
  const [oaStatus, setOaStatus] = useState<OaStatus | null>(null);
  const [loadingOaStatus, setLoadingOaStatus] = useState(true);

  // Customers
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Service + "months since last service" filter
  const [services, setServices] = useState<DichVu[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceFilters, setServiceFilters] = useState<string[]>([]); // mỗi phần tử có thể chứa nhiều ID cùng tên dịch vụ
  const [serviceFromDate, setServiceFromDate] = useState('');
  const [serviceToDate, setServiceToDate] = useState('');
  const [serviceUsageDatesMap, setServiceUsageDatesMap] = useState<Map<string, string[]>>(new Map());
  const [serviceUsageDatesMapFor, setServiceUsageDatesMapFor] = useState('');
  const [loadingServiceDates, setLoadingServiceDates] = useState(false);

  // Mẫu Zalo đã duyệt
  const [templates, setTemplates] = useState<ZnsTemplateSummary[]>([ORDER_REVIEW_TEMPLATE]);
  const [templateId, setTemplateId] = useState('');
  const [templateTen, setTemplateTen] = useState('');
  const [templateDetail, setTemplateDetail] = useState<ZnsTemplateDetail | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatePermissionError, setTemplatePermissionError] = useState('');
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [darkTemplatePreview, setDarkTemplatePreview] = useState(false);

  // Preview
  const [previewData, setPreviewData] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Sending
  const [isSending, setIsSending] = useState(false);
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, sent: 0, failed: 0, skipped: 0 });

  // History
  const [campaigns, setCampaigns] = useState<ZnsCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<ZnsLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'that_bai'>('all');
  const znsPermissionDenied = /(?:-120|does not have permission|quyền gửi ZBS\/ZNS)/i.test(templatePermissionError);

  const refreshOaStatus = async () => {
    setLoadingOaStatus(true);
    try {
      const status = await getOaStatus();
      setOaStatus(status);
    } catch (err) {
      setOaStatus({ connected: false, error: err instanceof Error ? err.message : 'Không lấy được trạng thái kết nối' });
    } finally {
      setLoadingOaStatus(false);
    }
  };

  const refreshCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const rows = await listCampaigns();
      setCampaigns(rows);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tải được lịch sử gửi đánh giá', 'error');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void refreshOaStatus();
    void refreshCampaigns();
    (async () => {
      setLoadingCustomers(true);
      try {
        const rows = await getCustomersForSelect();
        // Giữ đủ bản ghi ở bước tải để bộ lọc cơ sở không làm mất khách hàng
        // khi cùng một SĐT từng tồn tại ở nhiều cơ sở. Việc loại trùng được làm
        // sau khi áp dụng toàn bộ điều kiện lọc bên dưới.
        setCustomers(rows);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Không tải được danh sách khách hàng', 'error');
      } finally {
        setLoadingCustomers(false);
      }
    })();
    (async () => {
      setLoadingServices(true);
      try {
        const rows = await getServices();
        setServices(rows);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Không tải được danh sách dịch vụ', 'error');
      } finally {
        setLoadingServices(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!oaStatus?.connected) return;
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      setTemplatePermissionError('');
      try {
        const rows = await listZnsTemplates();
        const byId = new Map<string, ZnsTemplateSummary>([[ORDER_REVIEW_TEMPLATE.template_id, ORDER_REVIEW_TEMPLATE]]);
        rows.forEach((row) => byId.set(row.template_id, row));
        if (!cancelled) setTemplates([...byId.values()]);
      } catch (err) {
        if (!cancelled) {
          setTemplatePermissionError(err instanceof Error ? err.message : 'Zalo không cho phép tải danh sách mẫu');
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oaStatus?.connected]);

  const handleTemplateChange = async (value: string) => {
    if (!value) {
      setTemplateId('');
      setTemplateTen('');
      setTemplateDetail(null);
      setPreviewData(null);
      setShowTemplatePreview(false);
      return;
    }

    const selected = templates.find((template) => template.template_id === value);
    if (!selected) return;
    setTemplateId(selected.template_id);
    setTemplateTen(selected.template_name);
    setTemplateDetail(null);
    setPreviewData(null);
    setShowTemplatePreview(false);
    setLoadingTemplates(true);
    try {
      const detail = await getZnsTemplateDetail(selected.template_id);
      setTemplateDetail(detail);
      setTemplateTen(detail.template_name || selected.template_name);
    } catch {
      // Tên và ID từ danh sách vẫn đủ để gửi nếu API chi tiết tạm lỗi.
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleBranchFilterChange = (value: string) => {
    setBranchFilter(value);
  };

  const handleServiceFiltersChange = (values: string[]) => {
    setServiceFilters(values);
    setLoadingServiceDates(values.length > 0);
    if (values.length === 0) {
      setServiceFromDate('');
      setServiceToDate('');
      setServiceUsageDatesMap(new Map());
      setServiceUsageDatesMapFor('');
    }
  };

  const serviceOptions = useMemo(() => {
    const scoped = branchFilter ? services.filter((s) => matchesServiceBranch(s.co_so, branchFilter)) : services;
    const scopedNames = new Set(scoped.map((s) => s.ten_dich_vu?.trim()).filter(Boolean));
    const idsByName = new Map<string, string[]>();
    // Luôn gom ID theo tên trên toàn bộ cơ sở để value của một dịch vụ không
    // thay đổi khi chọn/bỏ chọn cơ sở. Cơ sở chỉ quyết định tên nào được hiện.
    for (const s of services) {
      const name = s.ten_dich_vu?.trim();
      if (!name) continue;
      const ids = idsByName.get(name) || [];
      ids.push(s.id);
      idsByName.set(name, ids);
    }
    return Array.from(idsByName.entries())
      .filter(([name]) => scopedNames.has(name))
      .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
      .map(([name, ids]) => ({ value: ids.join(','), label: name, searchKey: name }));
  }, [services, branchFilter]);

  const serviceFilterKey = useMemo(
    () => [...serviceFilters].sort().join('|'),
    [serviceFilters]
  );

  // Chọn dịch vụ -> tải toàn bộ ngày sử dụng. Khi chưa chọn ngày, chỉ cần khách
  // từng dùng dịch vụ; khi có ngày, ngày sử dụng phải nằm trong khoảng đã chọn.
  useEffect(() => {
    if (!serviceFilterKey) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = serviceFilters.flatMap((value) => value.split(','));
        const selectedServices = services.filter((service) => ids.includes(service.id));
        const serviceValues = selectedServices.flatMap((service) => [
          service.id,
          service.id_dich_vu || '',
          service.ten_dich_vu,
        ]);
        const map = await getServiceUsageDatesMap(serviceValues);
        if (!cancelled) {
          setServiceUsageDatesMap(map);
          setServiceUsageDatesMapFor(serviceFilterKey);
        }
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : 'Không tải được lịch sử dịch vụ', 'error');
      } finally {
        if (!cancelled) setLoadingServiceDates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceFilterKey]);

  const filteredCustomers = useMemo(() => {
    const rawQuery = searchQuery.trim();
    const q = removeVietnameseTones(rawQuery);
    const isPhoneQuery = /^[\d\s()+.-]+$/.test(rawQuery) && /\d{3}/.test(rawQuery);
    const normalizedPhoneQuery = isPhoneQuery ? normalizeVnPhoneDigits(rawQuery) : '';
    const applyServiceFilter =
      serviceFilters.length > 0 &&
      serviceUsageDatesMapFor === serviceFilterKey;
    const matches = customers.filter((c) => {
      if (branchFilter && resolveCustomerBranch(c.dia_chi_hien_tai) !== branchFilter) return false;
      if (applyServiceFilter) {
        const usedSelectedServiceInRange = getCustomerLinkKeys(c).some((key) =>
          (serviceUsageDatesMap.get(key.trim().toLowerCase()) || []).some(
            (date) =>
              (!serviceFromDate || date >= serviceFromDate) &&
              (!serviceToDate || date <= serviceToDate)
          )
        );
        if (!usedSelectedServiceInRange) return false;
      }
      if (!q) return true;
      const haystack = removeVietnameseTones(`${c.ho_va_ten} ${c.so_dien_thoai} ${c.bien_so_xe || ''}`);
      return (
        haystack.includes(q) ||
        (normalizedPhoneQuery !== '' && normalizeVnPhoneDigits(c.so_dien_thoai).includes(normalizedPhoneQuery))
      );
    });
    return dedupeCustomersByPhone(matches);
  }, [
    customers,
    searchQuery,
    branchFilter,
    serviceFilters,
    serviceFilterKey,
    serviceFromDate,
    serviceToDate,
    serviceUsageDatesMap,
    serviceUsageDatesMapFor,
  ]);

  const selectableFilteredIds = useMemo(
    () => filteredCustomers.filter((c) => isValidVnMobile(c.so_dien_thoai)).map((c) => c.id),
    [filteredCustomers]
  );

  const allFilteredSelected =
    selectableFilteredIds.length > 0 && selectableFilteredIds.every((id) => selectedIds.has(id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        selectableFilteredIds.forEach((id) => next.delete(id));
      } else {
        selectableFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleCustomer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCustomers = useMemo(
    () => customers.filter((c) => selectedIds.has(c.id)),
    [customers, selectedIds]
  );

  const buildFieldMapping = (): Record<string, ZnsFieldMappingEntry> => {
    const out: Record<string, ZnsFieldMappingEntry> = {};
    for (const row of mappingRowsForTemplate(templateDetail)) {
      const key = row.key.trim();
      if (!key) continue;
      out[key] = row.source === 'static' ? { source: 'static', value: row.value } : { source: row.source };
    }
    return out;
  };

  const handleTemplatePreview = async () => {
    if (showTemplatePreview) {
      setShowTemplatePreview(false);
      return;
    }
    const sample = selectedCustomers[0];
    setShowTemplatePreview(true);
    if (!sample) {
      setPreviewData({ customer_name: '<customer_name>', order_date: '<order_date>' });
      return;
    }
    setLoadingPreview(true);
    try {
      const data = await renderTemplateDataForCustomer(sample, buildFieldMapping());
      setPreviewData(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tạo được bản xem trước', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const connectOa = () => {
    if (!ZALO_APP_ID || !ZALO_OAUTH_REDIRECT_URI) {
      showToast('Thiếu VITE_ZALO_APP_ID hoặc VITE_ZALO_OAUTH_REDIRECT_URI trong .env', 'error');
      return;
    }
    const redirectUri = encodeURIComponent(ZALO_OAUTH_REDIRECT_URI);
    window.location.href = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${ZALO_APP_ID}&redirect_uri=${redirectUri}`;
  };

  const handleSend = async () => {
    if (!templateId.trim()) {
      showToast('Nhập Template ID (lấy từ ZNS Template Library)', 'error');
      return;
    }
    if (selectedCustomers.length === 0) {
      showToast('Chọn ít nhất 1 khách hàng', 'error');
      return;
    }
    if (!oaStatus?.connected) {
      showToast('Chưa kết nối Zalo OA — bấm "Kết nối Zalo OA" trước khi gửi', 'error');
      return;
    }

    const fieldMapping = buildFieldMapping();
    setIsSending(true);
    setProgress({ done: 0, total: selectedCustomers.length, sent: 0, failed: 0, skipped: 0 });

    try {
      const tenChienDichTuDong = `${templateTen.trim() || `ZNS ${templateId.trim()}`} - ${new Date().toLocaleString('vi-VN')}`;
      const campaign = await createCampaign({
        ten_chien_dich: tenChienDichTuDong,
        template_id: templateId.trim(),
        template_ten: templateTen.trim() || undefined,
        field_mapping: fieldMapping,
        nguoi_tao: nhanVien?.id ?? null,
      });
      await setCampaignTotals(campaign.id, selectedCustomers.length);

      const rendered = await renderTemplateDataForCustomers(selectedCustomers, fieldMapping);
      const chunks = chunkArray(rendered, 25);

      let totalSent = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      let firstSendError = '';

      for (const chunk of chunks) {
        try {
          const result = await sendZnsBatch(campaign.id, chunk);
          totalSent += result.summary.sent;
          totalFailed += result.summary.failed;
          totalSkipped += result.summary.skipped;
          firstSendError ||= result.results.find((item) => item.error)?.error || '';
        } catch (err) {
          // Lỗi cả lô (vd mất mạng) — tính là thất bại toàn bộ lô, không chặn các lô sau.
          totalFailed += chunk.length;
          firstSendError ||= err instanceof Error ? err.message : 'Không gọi được dịch vụ gửi ZNS';
          console.error('Gửi lô ZNS thất bại:', err);
        }
        setProgress((p) => ({
          ...p,
          done: Math.min(p.done + chunk.length, p.total),
          sent: totalSent,
          failed: totalFailed,
          skipped: totalSkipped,
        }));
      }

      await updateCampaignStatus(campaign.id, totalFailed > 0 || totalSkipped > 0 ? 'hoan_thanh_co_loi' : 'hoan_thanh');
      showToast(
        totalFailed > 0
          ? `Gửi thất bại: ${firstSendError || `${totalFailed} tin không gửi được`}`
          : `Đã gửi xong: ${totalSent} thành công, ${totalSkipped} bỏ qua`,
        totalFailed > 0 ? 'error' : 'success'
      );

      setSelectedIds(new Set());
      setPreviewData(null);
      await refreshCampaigns();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gửi đánh giá đơn hàng thất bại', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const requestSendConfirmation = () => {
    if (!templateId.trim()) {
      showToast('Vui lòng chọn mẫu Zalo trước khi gửi', 'error');
      return;
    }
    if (selectedCustomers.length === 0) {
      showToast('Chọn ít nhất 1 khách hàng', 'error');
      return;
    }
    if (!oaStatus?.connected) {
      showToast('Chưa kết nối Zalo OA — bấm "Kết nối Zalo OA" trước khi gửi', 'error');
      return;
    }
    if (znsPermissionDenied) {
      showToast('Zalo chưa cấp quyền ZBS Template Message cho ứng dụng/OA. Hãy cấu hình quyền rồi bấm “Kết nối lại”.', 'error');
      return;
    }
    setShowSendConfirmation(true);
  };

  const confirmSend = () => {
    setShowSendConfirmation(false);
    void handleSend();
  };

  const toggleCampaignExpand = async (campaignId: string) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null);
      return;
    }
    setExpandedCampaignId(campaignId);
    setLoadingLogs(true);
    setLogFilter('all');
    try {
      const logs = await getCampaignLogs(campaignId);
      setCampaignLogs(logs);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tải được chi tiết lần gửi', 'error');
    } finally {
      setLoadingLogs(false);
    }
  };

  const visibleLogs = useMemo(
    () => (logFilter === 'that_bai' ? campaignLogs.filter((l) => l.trang_thai === 'that_bai') : campaignLogs),
    [campaignLogs, logFilter]
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Gửi đánh giá đơn hàng</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gửi mẫu đánh giá tới các khách hàng đã sử dụng dịch vụ qua Zalo Official Account.
        </p>
      </div>

      {/* OA connection banner */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        {loadingOaStatus ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Đang kiểm tra kết nối Zalo OA...
          </div>
        ) : oaStatus?.connected ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <span className="text-foreground font-medium">
              Đã kết nối OA <span className="font-mono">{oaStatus.oa_id}</span>
            </span>
            {oaStatus.access_token_expires_at && (
              <span className="text-muted-foreground">
                — token còn hạn tới {new Date(oaStatus.access_token_expires_at).toLocaleString('vi-VN')}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span className="text-foreground font-medium">Chưa kết nối Zalo OA</span>
            {oaStatus?.error && <span className="text-muted-foreground">({oaStatus.error})</span>}
          </div>
        )}
        <button
          type="button"
          onClick={connectOa}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted"
        >
          <Link2 size={14} />
          {oaStatus?.connected ? 'Kết nối lại' : 'Kết nối Zalo OA'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Campaign form */}
        <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-4">
          <h2 className="font-bold text-foreground">Mẫu gửi ZNS</h2>

          <div className="space-y-1.5">
            <label className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              Mẫu Zalo đã duyệt
              {loadingTemplates && <Loader2 size={12} className="animate-spin" />}
            </label>
            <SearchableSelect
              options={templates.map((template) => ({
                value: template.template_id,
                label: `${template.template_name} — ID ${template.template_id}`,
                searchKey: `${template.template_name} ${template.template_id}`,
              }))}
              value={templateId}
              onValueChange={(value) => void handleTemplateChange(value)}
              placeholder="Chọn mẫu Zalo"
              searchPlaceholder="Tìm tên hoặc Template ID..."
              disabled={loadingTemplates}
              className="font-normal"
              optionClassName="font-normal"
            />
            {templatePermissionError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{templatePermissionError}. Cần cấp quyền ZBS Template Message cho ứng dụng/OA rồi bấm “Kết nối lại”.</span>
              </div>
            )}
            {templateId && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 size={14} className="text-green-600" />
                <span>Template ID: <strong className="font-mono text-foreground">{templateId}</strong></span>
                <span className="text-green-600 dark:text-green-400">Đã duyệt</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTemplatePreview}
              disabled={loadingPreview || !templateId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : null}
              {showTemplatePreview ? 'Ẩn Template' : 'Xem trước Template'}
            </button>
            <button
              type="button"
              onClick={requestSendConfirmation}
              disabled={isSending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {isSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {isSending ? 'Đang gửi...' : `Gửi đánh giá (${selectedIds.size})`}
            </button>
          </div>

          {showTemplatePreview && previewData && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-foreground">Xem trước Template</h3>
                <button
                  type="button"
                  onClick={() => setDarkTemplatePreview((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  aria-label="Đổi giao diện xem trước Template"
                >
                  {darkTemplatePreview ? <Moon size={13} /> : <Sun size={13} />}
                  Giao diện {darkTemplatePreview ? 'tối' : 'sáng'}
                </button>
              </div>

              {templateDetail?.preview_url && templateId !== ORDER_REVIEW_TEMPLATE.template_id ? (
                <iframe
                  src={templateDetail.preview_url}
                  title={`Xem trước ${templateTen}`}
                  className="h-[520px] w-full rounded-xl border border-border bg-white"
                />
              ) : (
                <div className={`rounded-xl p-4 transition-colors ${darkTemplatePreview ? 'bg-slate-900 text-slate-100' : 'bg-[#f1f3ff] text-slate-900'}`}>
                  <div className={`mx-auto max-w-md rounded-xl p-5 shadow-sm ${darkTemplatePreview ? 'bg-slate-800' : 'bg-white'}`}>
                    <img src={ORDER_REVIEW_LOGO_URL} alt="Anh Công Nhân" className="mb-4 h-auto max-h-16 max-w-full object-contain" />
                    <h4 className="text-lg font-bold">Đánh giá đơn hàng</h4>
                    <p className={`mt-3 leading-7 ${darkTemplatePreview ? 'text-slate-200' : 'text-slate-600'}`}>
                      Trung tâm sửa chữa xe Anh Công Nhân cảm ơn Quý khách hàng{' '}
                      <strong className={darkTemplatePreview ? 'text-white' : 'text-slate-900'}>
                        {previewData.customer_name || '<customer_name>'}
                      </strong>{' '}
                      đã tin tưởng sử dụng dịch vụ tại trung tâm vào ngày{' '}
                      <strong className={darkTemplatePreview ? 'text-white' : 'text-slate-900'}>
                        {previewData.order_date || '<order_date>'}
                      </strong>. Nhằm nâng cao chất lượng dịch vụ, chúng tôi rất mong nhận được đánh giá phản hồi của Quý khách.
                    </p>
                    <div className="mt-4 flex items-center justify-around rounded-xl border border-orange-200 px-3 py-4 text-4xl leading-none text-orange-400">
                      {[1, 2, 3, 4, 5].map((star) => <span key={star}>☆</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Customer picker */}
        <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Users size={18} /> Chọn khách hàng
            </h2>
            <span className="text-sm text-muted-foreground">
              Đã chọn {selectedIds.size} / {filteredCustomers.length}
            </span>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên, SĐT, biển số..."
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider">Cơ sở</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'Tất cả cơ sở' },
                  ...CUSTOMER_BRANCH_OPTIONS.map((b) => ({ value: b, label: b })),
                ]}
                value={branchFilter}
                onValueChange={handleBranchFilterChange}
                placeholder="Tất cả cơ sở"
                searchPlaceholder="Tìm cơ sở..."
                className="font-normal"
                optionClassName="font-normal"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider">Dịch vụ</label>
              <SearchableSelect
                options={serviceOptions}
                multiple
                values={serviceFilters}
                onValuesChange={handleServiceFiltersChange}
                placeholder={loadingServices ? 'Đang tải dịch vụ...' : 'Tất cả dịch vụ'}
                searchPlaceholder="Tìm dịch vụ..."
                disabled={loadingServices}
                className="font-normal"
                optionClassName="font-normal"
              />
            </div>
          </div>

          {serviceFilters.length > 0 && (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-2.5">
              <label className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                Đã dùng dịch vụ đã chọn trong khoảng
                {loadingServiceDates && <Loader2 size={12} className="animate-spin" />}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-normal text-muted-foreground">Từ ngày</label>
                  <DateInputVi
                    value={serviceFromDate}
                    onChange={setServiceFromDate}
                    aria-label="Từ ngày sử dụng dịch vụ"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-normal"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-normal text-muted-foreground">Đến ngày</label>
                  <DateInputVi
                    value={serviceToDate}
                    onChange={setServiceToDate}
                    aria-label="Đến ngày sử dụng dịch vụ"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-normal"
                  />
                </div>
              </div>
              {serviceFromDate && serviceToDate && serviceFromDate > serviceToDate && (
                <p className="text-xs text-red-500">Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.</p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-normal text-foreground cursor-pointer">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} className="rounded" />
            Chọn tất cả (đã lọc, {selectableFilteredIds.length} SĐT hợp lệ)
          </label>

          <div className="border border-border rounded-xl max-h-80 overflow-y-auto divide-y divide-border">
            {loadingCustomers ? (
              <div className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Đang tải khách hàng...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Không có khách hàng phù hợp</div>
            ) : (
              filteredCustomers.map((c) => {
                const valid = isValidVnMobile(c.so_dien_thoai);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleCustomer(c.id)}
                      className="rounded"
                    />
                    <span className="flex-1 truncate text-foreground">{c.ho_va_ten}</span>
                    <span className="font-mono text-muted-foreground">{c.so_dien_thoai}</span>
                    {!valid && (
                      <span title="Số điện thoại không hợp lệ">
                        <AlertTriangle size={14} className="text-amber-500" />
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Send progress */}
      {progress.total > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Đã xử lý {progress.done}/{progress.total} — {progress.sent} thành công, {progress.failed} thất bại,{' '}
              {progress.skipped} bỏ qua
            </p>
          </div>
        </div>
      )}

      {showSendConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zns-send-confirmation-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowSendConfirmation(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h2 id="zns-send-confirmation-title" className="text-lg font-bold text-foreground">
              Xác nhận gửi đánh giá
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Bạn có chắc muốn gửi mẫu <strong className="text-foreground">{templateTen}</strong> tới{' '}
              <strong className="text-foreground">{selectedCustomers.length} khách hàng</strong> đã chọn không?
            </p>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Sau khi xác nhận, hệ thống sẽ bắt đầu gửi ZNS và không thể thu hồi tin đã gửi.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSendConfirmation(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmSend}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                <Send size={15} /> Xác nhận gửi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign history */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <History size={18} /> Lịch sử gửi đánh giá
        </h2>

        {loadingCampaigns ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Đang tải...
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lần gửi đánh giá nào.</p>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map((c) => {
              const badge = STATUS_BADGE[c.trang_thai] || STATUS_BADGE.nhap;
              const expanded = expandedCampaignId === c.id;
              return (
                <div key={c.id}>
                  <button
                    type="button"
                    onClick={() => void toggleCampaignExpand(c.id)}
                    className="w-full flex flex-wrap items-center gap-3 py-3 text-left"
                  >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span className="font-medium text-foreground flex-1 min-w-[160px]">{c.ten_chien_dich}</span>
                    <span className="text-xs font-mono text-muted-foreground">{c.template_id}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {c.so_luong_thanh_cong}/{c.tong_so_nguoi_nhan} thành công
                      {c.so_luong_that_bai > 0 ? `, ${c.so_luong_that_bai} thất bại` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString('vi-VN')}
                    </span>
                  </button>

                  {expanded && (
                    <div className="pb-3 pl-6 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLogFilter('all')}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            logFilter === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          Tất cả ({campaignLogs.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogFilter('that_bai')}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            logFilter === 'that_bai' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          Chỉ thất bại ({campaignLogs.filter((l) => l.trang_thai === 'that_bai').length})
                        </button>
                      </div>

                      {loadingLogs ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 size={14} className="animate-spin" /> Đang tải chi tiết...
                        </div>
                      ) : (
                        <div className="border border-border rounded-xl max-h-64 overflow-y-auto divide-y divide-border">
                          {visibleLogs.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">Không có dữ liệu</div>
                          ) : (
                            visibleLogs.map((l) => {
                              const lb = LOG_STATUS_BADGE[l.trang_thai] || LOG_STATUS_BADGE.cho_gui;
                              return (
                                <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                                  <span className="font-mono text-muted-foreground w-32 shrink-0">{l.so_dien_thoai}</span>
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${lb.className}`}>{lb.label}</span>
                                  {l.loi && <span className="text-xs text-red-500 flex-1">{l.loi}</span>}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ZnsBulkSendPage;
