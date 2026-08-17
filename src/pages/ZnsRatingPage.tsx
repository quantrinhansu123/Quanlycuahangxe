import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquareText, RefreshCw, Star, Users } from 'lucide-react';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { useToast } from '../context/ToastContext';
import { listZnsTemplates, type ZnsTemplateSummary } from '../data/znsData';
import { listRatings, syncRatings, type ZnsRating } from '../data/znsRatingData';

const SOURCE_BADGE: Record<ZnsRating['nguon'], { label: string; className: string }> = {
  webhook: { label: 'Zalo gửi tự động', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  dong_bo: { label: 'Zalo API', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
};

function StarRow({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-0.5" title={`${rate}/5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          className={n <= rate ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}
        />
      ))}
    </div>
  );
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const AUTO_REFRESH_INTERVAL_MS = 30_000;
const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
const AUTO_SYNC_RANGE_MS = 30 * 24 * 60 * 60_000;

const ZnsRatingPage: React.FC = () => {
  const { showToast } = useToast();

  const [ratings, setRatings] = useState<ZnsRating[]>([]);
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState<ZnsTemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const approvedTemplatesRef = useRef<ZnsTemplateSummary[]>([]);
  const [templateFilter, setTemplateFilter] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));

  const [rateFilter, setRateFilter] = useState<'all' | number>('all');

  const loadRatings = useCallback(async (notifyError = false) => {
    try {
      setRatings(await listRatings());
    } catch (err) {
      if (notifyError) {
        showToast(err instanceof Error ? err.message : 'Không tải được danh sách đánh giá', 'error');
      }
    }
  }, [showToast]);

  const syncApprovedTemplates = useCallback(async (templateRows: ZnsTemplateSummary[], notifyError = false) => {
    if (templateRows.length === 0) return;

    const toMs = Date.now();
    const fromMs = toMs - AUTO_SYNC_RANGE_MS;
    try {
      await Promise.all(
        templateRows.map((template) => syncRatings({
          template_id: template.template_id,
          from_time: fromMs,
          to_time: toMs,
        }))
      );
      await loadRatings();
    } catch (err) {
      if (notifyError) {
        showToast(err instanceof Error ? err.message : 'Không tự động lấy được đánh giá từ Zalo', 'error');
      }
    }
  }, [loadRatings, showToast]);

  useEffect(() => {
    let cancelled = false;
    listRatings()
      .then((rows) => {
        if (!cancelled) setRatings(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Không tải được danh sách đánh giá', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    listZnsTemplates()
      .then((rows) => {
        if (cancelled) return;
        const approvedById = new Map(rows.map((template) => [template.template_id, template]));
        const approvedRows = [...approvedById.values()].sort((a, b) => a.template_name.localeCompare(b.template_name, 'vi'));
        approvedTemplatesRef.current = approvedRows;
        setTemplates(approvedRows);
        void syncApprovedTemplates(approvedRows);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Không tải được danh sách mẫu ZNS đã duyệt', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });

    const timer = window.setInterval(() => void loadRatings(), AUTO_REFRESH_INTERVAL_MS);
    const autoSyncTimer = window.setInterval(
      () => void syncApprovedTemplates(approvedTemplatesRef.current),
      AUTO_SYNC_INTERVAL_MS
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadRatings();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      approvedTemplatesRef.current = [];
      window.clearInterval(timer);
      window.clearInterval(autoSyncTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadRatings, showToast, syncApprovedTemplates]);

  const templateOptions = useMemo(
    () => templates.map((template) => ({
      value: template.template_id,
      label: `${template.template_name} (${template.template_id})`,
      searchKey: `${template.template_name} ${template.template_id}`,
    })),
    [templates]
  );

  const ratingsInScope = useMemo(() => {
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return ratings.filter((rating) => {
      if (templateFilter && rating.chien_dich?.template_id !== templateFilter) return false;

      const ratingMs = rating.thoi_diem_danh_gia ? new Date(rating.thoi_diem_danh_gia).getTime() : null;
      if (fromMs !== null && Number.isFinite(fromMs) && (ratingMs === null || ratingMs < fromMs)) return false;
      if (toMs !== null && Number.isFinite(toMs) && (ratingMs === null || ratingMs > toMs)) return false;
      return true;
    });
  }, [fromDate, ratings, templateFilter, toDate]);

  const filteredRatings = useMemo(() => {
    if (rateFilter === 'all') return ratingsInScope;
    return ratingsInScope.filter((r) => r.rate === rateFilter);
  }, [rateFilter, ratingsInScope]);

  const avgRate = useMemo(() => {
    const rated = ratingsInScope.filter((r) => r.rate !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, r) => sum + (r.rate ?? 0), 0) / rated.length;
  }, [ratingsInScope]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Đánh giá dịch vụ qua Zalo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Số sao và nhận xét khách hàng gửi khi phản hồi mẫu ZNS đánh giá dịch vụ.
        </p>
      </div>

      {/* Tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <Star size={18} className="text-amber-500 fill-amber-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Điểm trung bình</p>
            <p className="text-lg font-bold text-foreground">
              {avgRate !== null ? `${avgRate.toFixed(1)} / 5` : 'Chưa có dữ liệu'}
            </p>
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
      </div>

      {/* Bộ lọc */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <RefreshCw size={16} /> Lọc đánh giá Zalo
        </h2>
        <p className="text-xs text-muted-foreground">
          Danh sách tự động nhận đánh giá mới từ Webhook Zalo và cập nhật định kỳ. Chọn mẫu ZNS đã duyệt
          hoặc khoảng thời gian để lọc kết quả.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Chiến dịch / mẫu ZNS đã duyệt</label>
            <SearchableSelect
              options={templateOptions}
              value={templateFilter}
              onValueChange={setTemplateFilter}
              placeholder={loadingTemplates ? 'Đang tải mẫu đã duyệt...' : 'Tất cả mẫu ZNS đã duyệt'}
              searchPlaceholder="Tìm tên hoặc mã mẫu..."
              emptyMessage="Không có mẫu ZNS đã duyệt."
              disabled={loadingTemplates}
              className="py-2 font-normal"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
            />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Tự động cập nhật
          </div>
        </div>
      </div>

      {/* Danh sách đánh giá */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <MessageSquareText size={18} /> Danh sách đánh giá
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRateFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                rateFilter === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              Tất cả ({ratingsInScope.length})
            </button>
            {[5, 4, 3, 2, 1].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRateFilter(n)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${
                  rateFilter === n ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {n} <Star size={11} className="fill-current" />
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Đang tải...
          </div>
        ) : filteredRatings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có đánh giá nào.</p>
        ) : (
          <div className="divide-y divide-border">
            {filteredRatings.map((r) => {
              const source = SOURCE_BADGE[r.nguon];
              const phone = r.gui_log?.so_dien_thoai || r.khach_hang?.so_dien_thoai || '';
              const customerName = r.khach_hang?.ho_va_ten?.trim() || '';
              return (
                <div key={r.id} className="py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRow rate={r.rate} />
                    <span className="font-medium text-foreground">
                      {customerName || phone || 'Không có số điện thoại trong log gửi'}
                    </span>
                    {customerName && phone && (
                      <span className="text-xs font-mono text-muted-foreground">{phone}</span>
                    )}
                    {r.chien_dich?.ten_chien_dich && (
                      <span className="text-xs text-muted-foreground">· {r.chien_dich.ten_chien_dich}</span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${source.className}`}>
                      {source.label}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {r.thoi_diem_danh_gia ? new Date(r.thoi_diem_danh_gia).toLocaleString('vi-VN') : ''}
                    </span>
                  </div>

                  {r.ghi_chu && <p className="text-sm text-foreground">{r.ghi_chu}</p>}

                  {r.nhan_xet_nhanh.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.nhan_xet_nhanh.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground"
                        >
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
    </div>
  );
};

export default ZnsRatingPage;
