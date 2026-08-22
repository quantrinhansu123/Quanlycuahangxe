import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2,
  MessageSquareText,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SearchableSelect } from '../ui/SearchableSelect';
import DateInputVi from '../ui/DateInputVi';
import { useToast } from '../../context/ToastContext';
import { listAllGuiLogs, listCampaigns, type ZnsCampaign, type ZnsGuiLogWithCustomer } from '../../data/znsData';
import { listRatings, type ZnsRating } from '../../data/znsRatingData';
import { listOrderMessageQueue, type OrderMessageQueueItem, type OrderMessageStatus } from '../../data/znsOrderMessageData';
import { CUSTOMER_BRANCH_OPTIONS, resolveCustomerBranch } from '../../constants/customerBranches';
import { normalizeVnPhoneDigits } from '../../lib/phoneUtils';
import { removeVietnameseTones } from '../../lib/utils';

const CHART_COLOR = '#eab308';
const LOW_RATING_THRESHOLD = 2;

/** Mẫu "Xác nhận đơn hàng" gửi qua zns_order_message_queue, không qua zns_chien_dich/zns_gui_log/zns_danh_gia
 * như 2 mẫu kia — nên không có điểm đánh giá, chỉ có thống kê gửi riêng. */
const ORDER_CONFIRMATION_TEMPLATE_ID = '624663';

/** Mẫu "Thông báo nhắc đến lịch hẹn" chỉ là tin thông báo, Zalo không thu thập sao đánh giá cho mẫu này
 * (khác mẫu 623794 là mẫu ZBS đánh giá dịch vụ) — nên cũng chỉ hiện thống kê gửi, không có điểm/biểu đồ đánh giá. */
const APPOINTMENT_REMINDER_TEMPLATE_ID = '626812';

/** Luôn hiện các mẫu ZNS đã biết trong bộ lọc, kể cả khi chưa có chiến dịch nào gửi bằng mẫu đó. */
const KNOWN_TEMPLATES: Array<{ template_id: string; template_name: string }> = [
  { template_id: '623794', template_name: 'Chăm sóc, thu thập ý kiến của KH sau khi mua hàng' },
  { template_id: '626812', template_name: 'Thông báo nhắc đến lịch hẹn' },
  { template_id: ORDER_CONFIRMATION_TEMPLATE_ID, template_name: 'Xác nhận đơn hàng' },
];

const ORDER_MESSAGE_STATUS_BADGE: Record<OrderMessageStatus, { label: string; className: string }> = {
  da_gui: { label: 'Đã gửi', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  that_bai: { label: 'Thất bại', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  cho_duyet: { label: 'Chờ duyệt', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
};

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ratingDayKey(rating: ZnsRating): string | null {
  if (!rating.thoi_diem_danh_gia) return null;
  const d = new Date(rating.thoi_diem_danh_gia);
  if (Number.isNaN(d.getTime())) return null;
  return toDateInputValue(d);
}

function StarRow({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-0.5" title={`${rate}/5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rate ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}
        />
      ))}
    </div>
  );
}

export const ZnsRatingReportPanel: React.FC = () => {
  const { showToast } = useToast();

  const [ratings, setRatings] = useState<ZnsRating[]>([]);
  const [campaigns, setCampaigns] = useState<ZnsCampaign[]>([]);
  const [guiLogs, setGuiLogs] = useState<ZnsGuiLogWithCustomer[]>([]);
  const [orderMessages, setOrderMessages] = useState<OrderMessageQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Mặc định "tất cả thời gian" — trang hiện toàn bộ dữ liệu trước, người dùng lọc sau.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');

  // Chỉ dùng cho bảng "Danh sách khách hàng đã gửi xác nhận đơn hàng".
  const [orderMessageSearch, setOrderMessageSearch] = useState('');
  const [orderMessageStatusFilter, setOrderMessageStatusFilter] = useState<OrderMessageStatus | ''>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ratingRows, campaignRows, logRows, orderMessageRows] = await Promise.all([
          listRatings(),
          listCampaigns(),
          listAllGuiLogs(),
          listOrderMessageQueue(),
        ]);
        if (!cancelled) {
          setRatings(ratingRows);
          setCampaigns(campaignRows);
          setGuiLogs(logRows);
          setOrderMessages(orderMessageRows);
        }
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : 'Không tải được dữ liệu báo cáo đánh giá', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateOptions = useMemo(() => {
    const byId = new Map<string, string>();
    KNOWN_TEMPLATES.forEach((t) => byId.set(t.template_id, t.template_name));
    campaigns.forEach((c) => {
      if (!byId.has(c.template_id)) byId.set(c.template_id, c.template_ten || c.template_id);
    });
    return [...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
      .map(([templateId, name]) => ({
        value: templateId,
        label: `${name} (${templateId})`,
        searchKey: `${name} ${templateId}`,
      }));
  }, [campaigns]);

  const ratingsInScope = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return ratings.filter((r) => {
      if (templateFilter && r.chien_dich?.template_id !== templateFilter) return false;
      if (branchFilter && resolveCustomerBranch(r.khach_hang?.dia_chi_hien_tai) !== branchFilter) return false;

      const ratingMs = r.thoi_diem_danh_gia ? new Date(r.thoi_diem_danh_gia).getTime() : null;
      if (fromMs !== null && (ratingMs === null || ratingMs < fromMs)) return false;
      if (toMs !== null && (ratingMs === null || ratingMs > toMs)) return false;
      return true;
    });
  }, [ratings, fromDate, toDate, branchFilter, templateFilter]);

  const campaignsInScope = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return campaigns.filter((c) => {
      if (templateFilter && c.template_id !== templateFilter) return false;
      const createdMs = new Date(c.created_at).getTime();
      if (fromMs !== null && createdMs < fromMs) return false;
      if (toMs !== null && createdMs > toMs) return false;
      return true;
    });
  }, [campaigns, fromDate, toDate, templateFilter]);

  const ratedInScope = useMemo(() => ratingsInScope.filter((r) => r.rate !== null), [ratingsInScope]);

  const avgRate = useMemo(() => {
    if (ratedInScope.length === 0) return null;
    return ratedInScope.reduce((sum, r) => sum + (r.rate ?? 0), 0) / ratedInScope.length;
  }, [ratedInScope]);

  const prevPeriodAvgRate = useMemo(() => {
    if (!fromDate || !toDate) return null;
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59.999`);
    const spanMs = to.getTime() - from.getTime();
    if (spanMs <= 0) return null;
    const prevToMs = from.getTime() - 1;
    const prevFromMs = prevToMs - spanMs;

    const prevRated = ratings.filter((r) => {
      if (templateFilter && r.chien_dich?.template_id !== templateFilter) return false;
      if (branchFilter && resolveCustomerBranch(r.khach_hang?.dia_chi_hien_tai) !== branchFilter) return false;
      if (r.rate === null || !r.thoi_diem_danh_gia) return false;
      const ms = new Date(r.thoi_diem_danh_gia).getTime();
      return ms >= prevFromMs && ms <= prevToMs;
    });
    if (prevRated.length === 0) return null;
    return prevRated.reduce((sum, r) => sum + (r.rate ?? 0), 0) / prevRated.length;
  }, [ratings, fromDate, toDate, branchFilter, templateFilter]);

  const totalSentSuccess = useMemo(
    () => campaignsInScope.reduce((sum, c) => sum + c.so_luong_thanh_cong, 0),
    [campaignsInScope]
  );

  const responseRate = totalSentSuccess > 0 ? (ratingsInScope.length / totalSentSuccess) * 100 : null;

  const lowRatingRows = useMemo(
    () =>
      ratingsInScope
        .filter((r) => r.rate !== null && r.rate <= LOW_RATING_THRESHOLD)
        .sort((a, b) => (b.thoi_diem_danh_gia || '').localeCompare(a.thoi_diem_danh_gia || '')),
    [ratingsInScope]
  );

  const starDistribution = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map((n) => ({ star: `${n} sao`, soLuong: 0 }));
    ratedInScope.forEach((r) => {
      const idx = (r.rate ?? 0) - 1;
      if (idx >= 0 && idx < 5) counts[idx].soLuong += 1;
    });
    return counts;
  }, [ratedInScope]);

  const trendByDay = useMemo(() => {
    const byDay = new Map<string, { sum: number; count: number }>();
    ratedInScope.forEach((r) => {
      const key = ratingDayKey(r);
      if (!key) return;
      const entry = byDay.get(key) || { sum: 0, count: 0 };
      entry.sum += r.rate ?? 0;
      entry.count += 1;
      byDay.set(key, entry);
    });
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { sum, count }]) => ({
        date: date.slice(5).split('-').reverse().join('/'),
        diemTrungBinh: Number((sum / count).toFixed(2)),
      }));
  }, [ratedInScope]);

  const branchRows = useMemo(
    () =>
      CUSTOMER_BRANCH_OPTIONS.map((branch) => {
        const rows = ratingsInScope.filter((r) => resolveCustomerBranch(r.khach_hang?.dia_chi_hien_tai) === branch);
        const rated = rows.filter((r) => r.rate !== null);
        const avg = rated.length > 0 ? rated.reduce((s, r) => s + (r.rate ?? 0), 0) / rated.length : null;
        return { branch, count: rows.length, avg };
      }).filter((row) => row.count > 0),
    [ratingsInScope]
  );

  const campaignRows = useMemo(() => {
    const byCampaignId = new Map<string, ZnsRating[]>();
    ratingsInScope.forEach((r) => {
      if (!r.chien_dich_id) return;
      const list = byCampaignId.get(r.chien_dich_id) || [];
      list.push(r);
      byCampaignId.set(r.chien_dich_id, list);
    });
    return campaignsInScope
      .map((c) => {
        const rows = byCampaignId.get(c.id) || [];
        const rated = rows.filter((r) => r.rate !== null);
        const avg = rated.length > 0 ? rated.reduce((s, r) => s + (r.rate ?? 0), 0) / rated.length : null;
        const rate = c.so_luong_thanh_cong > 0 ? (rows.length / c.so_luong_thanh_cong) * 100 : null;
        return { campaign: c, count: rows.length, avg, rate };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [campaignsInScope, ratingsInScope]);

  const quickTags = useMemo(() => {
    const counts = new Map<string, number>();
    ratingsInScope.forEach((r) => {
      r.nhan_xet_nhanh.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [ratingsInScope]);

  const customerRows = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    const grouped = new Map<string, { name: string; phone: string; count: number }>();
    guiLogs.forEach((log) => {
      const campaign = campaignById.get(log.chien_dich_id);
      if (templateFilter && campaign?.template_id !== templateFilter) return;
      if (branchFilter && resolveCustomerBranch(log.khach_hang?.dia_chi_hien_tai) !== branchFilter) return;

      const timeStr = log.gui_luc || log.created_at;
      const ms = timeStr ? new Date(timeStr).getTime() : null;
      if (fromMs !== null && (ms === null || ms < fromMs)) return;
      if (toMs !== null && (ms === null || ms > toMs)) return;

      const key = log.khach_hang_id || `phone:${normalizeVnPhoneDigits(log.so_dien_thoai)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, {
          name: log.khach_hang?.ho_va_ten?.trim() || '',
          phone: log.so_dien_thoai,
          count: 1,
        });
      }
    });

    return [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [guiLogs, campaigns, fromDate, toDate, branchFilter, templateFilter]);

  const trendDelta = avgRate !== null && prevPeriodAvgRate !== null ? avgRate - prevPeriodAvgRate : null;

  const isOrderConfirmation = templateFilter === ORDER_CONFIRMATION_TEMPLATE_ID;

  const orderMessagesInScope = useMemo(() => {
    if (!isOrderConfirmation) return [];
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return orderMessages.filter((m) => {
      const timeStr = m.last_sent_at || m.created_at;
      const ms = timeStr ? new Date(timeStr).getTime() : null;
      if (fromMs !== null && (ms === null || ms < fromMs)) return false;
      if (toMs !== null && (ms === null || ms > toMs)) return false;
      return true;
    });
  }, [orderMessages, fromDate, toDate, isOrderConfirmation]);

  const orderConfirmationStats = useMemo(() => {
    const sent = orderMessagesInScope.filter((m) => m.status === 'da_gui').length;
    const failed = orderMessagesInScope.filter((m) => m.status === 'that_bai').length;
    const pending = orderMessagesInScope.filter((m) => m.status === 'cho_duyet').length;
    return { total: orderMessagesInScope.length, sent, failed, pending };
  }, [orderMessagesInScope]);

  const orderConfirmationCustomerRows = useMemo(() => {
    type Row = {
      name: string;
      phone: string;
      count: number;
      latestStatus: OrderMessageStatus;
      latestTimeKey: string;
    };
    const grouped = new Map<string, Row>();
    orderMessagesInScope.forEach((m) => {
      const phone = m.phone?.trim() || '';
      const key = phone ? normalizeVnPhoneDigits(phone) : `order:${m.order_id}`;
      // Trạng thái hiện tại của khách = trạng thái của bản ghi mới nhất (theo lúc gửi, hoặc lúc tạo nếu chưa gửi).
      const timeKey = m.last_sent_at || m.created_at || '';
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (timeKey >= existing.latestTimeKey) {
          existing.latestStatus = m.status;
          existing.latestTimeKey = timeKey;
        }
      } else {
        grouped.set(key, {
          name: m.customer_name?.trim() || '',
          phone,
          count: 1,
          latestStatus: m.status,
          latestTimeKey: timeKey,
        });
      }
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [orderMessagesInScope]);

  const orderMessageStatusOptions = useMemo(
    () => [
      { value: '', label: 'Tất cả trạng thái' },
      ...(Object.keys(ORDER_MESSAGE_STATUS_BADGE) as OrderMessageStatus[]).map((status) => ({
        value: status,
        label: ORDER_MESSAGE_STATUS_BADGE[status].label,
      })),
    ],
    []
  );

  const filteredOrderConfirmationCustomerRows = useMemo(() => {
    const keyword = removeVietnameseTones(orderMessageSearch.trim());
    return orderConfirmationCustomerRows.filter((row) => {
      if (orderMessageStatusFilter && row.latestStatus !== orderMessageStatusFilter) return false;
      if (!keyword) return true;
      const haystack = removeVietnameseTones(`${row.name} ${row.phone}`);
      return haystack.includes(keyword);
    });
  }, [orderConfirmationCustomerRows, orderMessageSearch, orderMessageStatusFilter]);

  const isAppointmentReminder = templateFilter === APPOINTMENT_REMINDER_TEMPLATE_ID;

  const guiLogsInScope = useMemo(() => {
    if (!isAppointmentReminder) return [];
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));
    return guiLogs.filter((log) => {
      const campaign = campaignById.get(log.chien_dich_id);
      if (campaign?.template_id !== APPOINTMENT_REMINDER_TEMPLATE_ID) return false;
      if (branchFilter && resolveCustomerBranch(log.khach_hang?.dia_chi_hien_tai) !== branchFilter) return false;

      const timeStr = log.gui_luc || log.created_at;
      const ms = timeStr ? new Date(timeStr).getTime() : null;
      if (fromMs !== null && (ms === null || ms < fromMs)) return false;
      if (toMs !== null && (ms === null || ms > toMs)) return false;
      return true;
    });
  }, [guiLogs, campaigns, fromDate, toDate, branchFilter, isAppointmentReminder]);

  const reminderStats = useMemo(() => {
    const sent = guiLogsInScope.filter((l) => l.trang_thai === 'thanh_cong').length;
    const failed = guiLogsInScope.filter((l) => l.trang_thai === 'that_bai').length;
    const skipped = guiLogsInScope.filter((l) => l.trang_thai === 'bo_qua').length;
    const pending = guiLogsInScope.filter((l) => l.trang_thai === 'cho_gui').length;
    return { total: guiLogsInScope.length, sent, failed, skipped, pending };
  }, [guiLogsInScope]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Báo cáo đánh giá</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tổng hợp điểm đánh giá, xu hướng và mức độ hài lòng của khách hàng theo mẫu ZNS đã gửi.
        </p>
      </div>

      {/* Bộ lọc */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Chiến dịch / mẫu ZNS</label>
            <SearchableSelect
              options={templateOptions}
              value={templateFilter}
              onValueChange={setTemplateFilter}
              placeholder="Tất cả chiến dịch"
              searchPlaceholder="Tìm tên hoặc mã mẫu..."
              className="font-normal"
              optionClassName="font-normal"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Cơ sở</label>
            <SearchableSelect
              options={[{ value: '', label: 'Tất cả cơ sở' }, ...CUSTOMER_BRANCH_OPTIONS.map((b) => ({ value: b, label: b }))]}
              value={branchFilter}
              onValueChange={setBranchFilter}
              placeholder="Tất cả cơ sở"
              searchPlaceholder="Tìm cơ sở..."
              className="font-normal"
              optionClassName="font-normal"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Từ ngày</label>
            <DateInputVi value={fromDate} onChange={setFromDate} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Đến ngày</label>
            <DateInputVi value={toDate} onChange={setToDate} className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Đang tải báo cáo...
        </div>
      ) : !templateFilter ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Chọn một chiến dịch / mẫu ZNS ở trên để xem báo cáo.
        </div>
      ) : isOrderConfirmation ? (
        <>
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            Mẫu "Xác nhận đơn hàng" gửi qua luồng Duyệt tin nhắn, không thu thập điểm đánh giá từ khách —
            bên dưới là thống kê gửi (không có điểm sao/xu hướng đánh giá).
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Users size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng số trong hàng đợi</p>
                <p className="text-lg font-bold text-foreground">{orderConfirmationStats.total}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đã gửi thành công</p>
                <p className="text-lg font-bold text-foreground">{orderConfirmationStats.sent}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <XCircle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gửi lỗi</p>
                <p className="text-lg font-bold text-foreground">{orderConfirmationStats.failed}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chờ duyệt</p>
                <p className="text-lg font-bold text-foreground">{orderConfirmationStats.pending}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <ListChecks size={16} />
              Danh sách khách hàng đã gửi xác nhận đơn hàng
              <span className="text-xs font-normal text-muted-foreground">({filteredOrderConfirmationCustomerRows.length}/{orderConfirmationCustomerRows.length})</span>
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={orderMessageSearch}
                onChange={(e) => setOrderMessageSearch(e.target.value)}
                placeholder="Tìm tên, SĐT..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
              <SearchableSelect
                options={orderMessageStatusOptions}
                value={orderMessageStatusFilter}
                onValueChange={(v) => setOrderMessageStatusFilter(v as OrderMessageStatus | '')}
                placeholder="Tất cả trạng thái"
                className="w-48 font-normal"
                optionClassName="font-normal"
              />
            </div>

            {orderConfirmationCustomerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : filteredOrderConfirmationCustomerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có khách hàng phù hợp.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="py-1.5 pr-3 font-normal w-12">STT</th>
                      <th className="py-1.5 pr-3 font-normal">Tên khách hàng</th>
                      <th className="py-1.5 pr-3 font-normal">Số điện thoại</th>
                      <th className="py-1.5 pr-3 font-normal">Số lần gửi</th>
                      <th className="py-1.5 pr-3 font-normal">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrderConfirmationCustomerRows.map((row, idx) => {
                      const badge = ORDER_MESSAGE_STATUS_BADGE[row.latestStatus];
                      return (
                        <tr key={`${row.phone || 'no-phone'}-${idx}`}>
                          <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 pr-3 text-foreground">{row.name || 'Không rõ tên'}</td>
                          <td className="py-2 pr-3 font-mono text-foreground">{row.phone || '—'}</td>
                          <td className="py-2 pr-3 text-foreground">{row.count}</td>
                          <td className="py-2 pr-3">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : isAppointmentReminder ? (
        <>
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            Mẫu "Thông báo nhắc đến lịch hẹn" chỉ là tin thông báo, Zalo không thu thập điểm đánh giá từ khách —
            bên dưới là thống kê gửi (không có điểm sao/xu hướng đánh giá).
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Users size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng số đã gửi</p>
                <p className="text-lg font-bold text-foreground">{reminderStats.total}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Thành công</p>
                <p className="text-lg font-bold text-foreground">{reminderStats.sent}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <XCircle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Thất bại</p>
                <p className="text-lg font-bold text-foreground">{reminderStats.failed}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bỏ qua / Chờ gửi</p>
                <p className="text-lg font-bold text-foreground">{reminderStats.skipped + reminderStats.pending}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <ListChecks size={16} />
              Danh sách khách hàng đã gửi ZNS
              <span className="text-xs font-normal text-muted-foreground">({customerRows.length})</span>
            </h3>
            {customerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="py-1.5 pr-3 font-normal w-12">STT</th>
                      <th className="py-1.5 pr-3 font-normal">Tên khách hàng</th>
                      <th className="py-1.5 pr-3 font-normal">Số điện thoại</th>
                      <th className="py-1.5 pr-3 font-normal">Số lần gửi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customerRows.map((row, idx) => (
                      <tr key={`${row.phone}-${idx}`}>
                        <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 pr-3 text-foreground">{row.name || 'Không rõ tên'}</td>
                        <td className="py-2 pr-3 font-mono text-foreground">{row.phone}</td>
                        <td className="py-2 pr-3 text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <Star size={18} className="text-amber-500 fill-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Điểm trung bình</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-bold text-foreground">{avgRate !== null ? `${avgRate.toFixed(1)} / 5` : '—'}</p>
                  {trendDelta !== null && Math.abs(trendDelta) >= 0.05 && (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trendDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {trendDelta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(trendDelta).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Users size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng số đánh giá</p>
                <p className="text-lg font-bold text-foreground">{ratingsInScope.length}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <MessageSquareText size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tỷ lệ phản hồi</p>
                <p className="text-lg font-bold text-foreground">{responseRate !== null ? `${responseRate.toFixed(0)}%` : '—'}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đánh giá thấp (≤{LOW_RATING_THRESHOLD} sao)</p>
                <p className="text-lg font-bold text-foreground">{lowRatingRows.length}</p>
              </div>
            </div>
          </div>

          {/* Danh sách khách hàng đã gửi ZNS */}
          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <ListChecks size={16} />
              Danh sách khách hàng đã gửi ZNS
              <span className="text-xs font-normal text-muted-foreground">({customerRows.length})</span>
            </h3>
            {customerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="py-1.5 pr-3 font-normal w-12">STT</th>
                      <th className="py-1.5 pr-3 font-normal">Tên khách hàng</th>
                      <th className="py-1.5 pr-3 font-normal">Số điện thoại</th>
                      <th className="py-1.5 pr-3 font-normal">Số lần gửi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customerRows.map((row, idx) => (
                      <tr key={`${row.phone}-${idx}`}>
                        <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 pr-3 text-foreground">{row.name || 'Không rõ tên'}</td>
                        <td className="py-2 pr-3 font-mono text-foreground">{row.phone}</td>
                        <td className="py-2 pr-3 text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Biểu đồ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-2">
              <h3 className="font-bold text-foreground text-sm">Phân bố số sao</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={starDistribution} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="star" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Bar dataKey="soLuong" name="Số lượng" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-2">
              <h3 className="font-bold text-foreground text-sm">Xu hướng điểm trung bình theo ngày</h3>
              <div className="h-56">
                {trendByDay.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chưa có dữ liệu</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendByDay} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Line type="monotone" dataKey="diemTrungBinh" name="Điểm TB" stroke={CHART_COLOR} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Bảng theo cơ sở */}
          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm">So sánh theo cơ sở</h3>
            {branchRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="py-1.5 pr-3 font-normal">Cơ sở</th>
                      <th className="py-1.5 pr-3 font-normal">Số đánh giá</th>
                      <th className="py-1.5 pr-3 font-normal">Điểm TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {branchRows.map((row) => (
                      <tr key={row.branch}>
                        <td className="py-2 pr-3 text-foreground">{row.branch}</td>
                        <td className="py-2 pr-3 text-foreground">{row.count}</td>
                        <td className="py-2 pr-3"><StarRow rate={row.avg !== null ? Math.round(row.avg) : null} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bảng theo chiến dịch */}
          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm">So sánh theo chiến dịch</h3>
            {campaignRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="py-1.5 pr-3 font-normal">Chiến dịch</th>
                      <th className="py-1.5 pr-3 font-normal">Đã gửi thành công</th>
                      <th className="py-1.5 pr-3 font-normal">Số đánh giá</th>
                      <th className="py-1.5 pr-3 font-normal">Tỷ lệ phản hồi</th>
                      <th className="py-1.5 pr-3 font-normal">Điểm TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaignRows.map(({ campaign, count, avg, rate }) => (
                      <tr key={campaign.id}>
                        <td className="py-2 pr-3 text-foreground">
                          {campaign.ten_chien_dich}
                          <span className="block text-xs font-mono text-muted-foreground">{campaign.template_id}</span>
                        </td>
                        <td className="py-2 pr-3 text-foreground">{campaign.so_luong_thanh_cong}</td>
                        <td className="py-2 pr-3 text-foreground">{count}</td>
                        <td className="py-2 pr-3 text-foreground">{rate !== null ? `${rate.toFixed(0)}%` : '—'}</td>
                        <td className="py-2 pr-3"><StarRow rate={avg !== null ? Math.round(avg) : null} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Nhận xét nhanh phổ biến */}
          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm">Nhận xét nhanh phổ biến</h3>
            {quickTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có nhận xét nhanh nào.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickTags.map(([tag, count]) => (
                  <span key={tag} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border text-foreground">
                    {tag}
                    <span className="text-muted-foreground font-mono">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Cảnh báo đánh giá thấp */}
          <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              Đánh giá thấp cần theo dõi (≤{LOW_RATING_THRESHOLD} sao)
            </h3>
            {lowRatingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có đánh giá thấp trong khoảng thời gian đã chọn.</p>
            ) : (
              <div className="divide-y divide-border">
                {lowRatingRows.map((r) => {
                  const phone = r.gui_log?.so_dien_thoai || r.khach_hang?.so_dien_thoai || '';
                  const customerName = r.khach_hang?.ho_va_ten?.trim() || '';
                  return (
                    <div key={r.id} className="py-3 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StarRow rate={r.rate} />
                        <span className="font-medium text-foreground">{customerName || phone || 'Không rõ khách hàng'}</span>
                        {customerName && phone && <span className="text-xs font-mono text-muted-foreground">{phone}</span>}
                        {r.chien_dich?.ten_chien_dich && (
                          <span className="text-xs text-muted-foreground">· {r.chien_dich.ten_chien_dich}</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {r.thoi_diem_danh_gia ? new Date(r.thoi_diem_danh_gia).toLocaleString('vi-VN') : ''}
                        </span>
                      </div>
                      {r.ghi_chu && <p className="text-sm text-foreground">{r.ghi_chu}</p>}
                      {r.nhan_xet_nhanh.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.nhan_xet_nhanh.map((tag, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
