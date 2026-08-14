import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Link2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getCustomersForSelect } from '../data/customerData';
import { normalizeVnPhoneDigits } from '../lib/phoneUtils';
import { CUSTOMER_BRANCH_OPTIONS } from '../constants/customerBranches';
import { removeVietnameseTones } from '../lib/utils';
import {
  chunkArray,
  createCampaign,
  getCampaignLogs,
  getOaStatus,
  listCampaigns,
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
} from '../data/znsData';

type CustomerOption = { id: string; ho_va_ten: string; so_dien_thoai: string; bien_so_xe?: string; dia_chi_hien_tai?: string };

interface MappingRow {
  key: string;
  source: ZnsFieldSource;
  value: string;
}

const DEFAULT_MAPPING_ROWS: MappingRow[] = [
  { key: 'customer_name', source: 'ho_va_ten', value: '' },
  { key: 'order_code', source: 'last_order.id_bh', value: '' },
  { key: 'order_date', source: 'last_order.ngay', value: '' },
];

const SOURCE_LABELS: Record<ZnsFieldSource, string> = {
  ho_va_ten: 'Tên khách hàng',
  'last_order.id_bh': 'Mã đơn hàng gần nhất',
  'last_order.ngay': 'Ngày đơn hàng gần nhất',
  static: 'Giá trị cố định',
};

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

  // Campaign form
  const [tenChienDich, setTenChienDich] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateTen, setTemplateTen] = useState('');
  const [mappingRows, setMappingRows] = useState<MappingRow[]>(DEFAULT_MAPPING_ROWS);

  // Preview
  const [previewData, setPreviewData] = useState<Record<string, string> | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Sending
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, sent: 0, failed: 0, skipped: 0 });

  // History
  const [campaigns, setCampaigns] = useState<ZnsCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<ZnsLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'that_bai'>('all');

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
      showToast(err instanceof Error ? err.message : 'Không tải được lịch sử chiến dịch', 'error');
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
        setCustomers(rows);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Không tải được danh sách khách hàng', 'error');
      } finally {
        setLoadingCustomers(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = removeVietnameseTones(searchQuery.trim());
    return customers.filter((c) => {
      if (branchFilter && (c.dia_chi_hien_tai || '') !== branchFilter) return false;
      if (!q) return true;
      const haystack = removeVietnameseTones(`${c.ho_va_ten} ${c.so_dien_thoai} ${c.bien_so_xe || ''}`);
      return haystack.includes(q);
    });
  }, [customers, searchQuery, branchFilter]);

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
    for (const row of mappingRows) {
      const key = row.key.trim();
      if (!key) continue;
      out[key] = row.source === 'static' ? { source: 'static', value: row.value } : { source: row.source };
    }
    return out;
  };

  const addMappingRow = () => setMappingRows((prev) => [...prev, { key: '', source: 'ho_va_ten', value: '' }]);
  const removeMappingRow = (idx: number) => setMappingRows((prev) => prev.filter((_, i) => i !== idx));
  const updateMappingRow = (idx: number, patch: Partial<MappingRow>) =>
    setMappingRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handlePreview = async () => {
    const sample = selectedCustomers[0];
    if (!sample) {
      showToast('Chọn ít nhất 1 khách hàng để xem trước', 'error');
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
    if (!tenChienDich.trim()) {
      showToast('Nhập tên chiến dịch', 'error');
      return;
    }
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
      const campaign = await createCampaign({
        ten_chien_dich: tenChienDich.trim(),
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

      for (const chunk of chunks) {
        try {
          const result = await sendZnsBatch(campaign.id, chunk);
          totalSent += result.summary.sent;
          totalFailed += result.summary.failed;
          totalSkipped += result.summary.skipped;
        } catch (err) {
          // Lỗi cả lô (vd mất mạng) — tính là thất bại toàn bộ lô, không chặn các lô sau.
          totalFailed += chunk.length;
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
      showToast(`Đã gửi xong: ${totalSent} thành công, ${totalFailed} thất bại, ${totalSkipped} bỏ qua`, totalFailed > 0 ? 'error' : 'success');

      setSelectedIds(new Set());
      setTenChienDich('');
      setPreviewData(null);
      await refreshCampaigns();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gửi ZNS hàng loạt thất bại', 'error');
    } finally {
      setIsSending(false);
    }
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
      showToast(err instanceof Error ? err.message : 'Không tải được chi tiết chiến dịch', 'error');
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
        <h1 className="text-xl font-bold text-foreground">Gửi ZNS hàng loạt</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gửi tin nhắn ZNS (Zalo Notification Service) tới nhiều khách hàng cùng lúc qua Zalo Official Account.
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
          <h2 className="font-bold text-foreground">Thông tin chiến dịch</h2>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên chiến dịch</label>
            <input
              type="text"
              value={tenChienDich}
              onChange={(e) => setTenChienDich(e.target.value)}
              placeholder="Khảo sát sau mua hàng - T8/2026"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Template ID (ZNS)</label>
              <input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                placeholder="Lấy từ ZNS Template Library"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên mẫu (ghi chú)</label>
              <input
                type="text"
                value={templateTen}
                onChange={(e) => setTemplateTen(e.target.value)}
                placeholder="Chăm sóc, thu thập ý kiến của KH sau khi mua hàng"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Ánh xạ dữ liệu (biến trong mẫu → nguồn dữ liệu)
              </label>
              <button
                type="button"
                onClick={addMappingRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Plus size={14} /> Thêm biến
              </button>
            </div>
            <div className="space-y-2">
              {mappingRows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateMappingRow(idx, { key: e.target.value })}
                    placeholder="customer_name"
                    className="flex-1 min-w-[120px] px-2.5 py-2 rounded-lg border border-border bg-background text-sm font-mono"
                  />
                  <select
                    value={row.source}
                    onChange={(e) => updateMappingRow(idx, { source: e.target.value as ZnsFieldSource })}
                    className="px-2.5 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    {(Object.keys(SOURCE_LABELS) as ZnsFieldSource[]).map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {row.source === 'static' && (
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateMappingRow(idx, { value: e.target.value })}
                      placeholder="Giá trị..."
                      className="flex-1 min-w-[100px] px-2.5 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMappingRow(idx)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Ngôi sao đánh giá trong mẫu do Zalo tự hiển thị — không phải dữ liệu cần gửi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={loadingPreview}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : null}
              Xem trước
            </button>
          </div>

          {previewData && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Dữ liệu gửi mẫu (khách: {selectedCustomers[0]?.ho_va_ten})
              </p>
              {Object.entries(previewData).map(([k, v]) => (
                <div key={k} className="text-sm flex gap-2">
                  <span className="font-mono text-muted-foreground">{k}:</span>
                  <span className="text-foreground">{v || '(trống)'}</span>
                </div>
              ))}
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

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, SĐT, biển số..."
              className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-border bg-background text-sm"
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
            >
              <option value="">Tất cả cơ sở</option>
              {CUSTOMER_BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
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

      {/* Send action */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isSending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {isSending ? 'Đang gửi...' : `Gửi cho ${selectedIds.size} khách hàng`}
        </button>

        {progress.total > 0 && (
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
        )}
      </div>

      {/* Campaign history */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <History size={18} /> Lịch sử chiến dịch
        </h2>

        {loadingCampaigns ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Đang tải...
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có chiến dịch nào.</p>
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
