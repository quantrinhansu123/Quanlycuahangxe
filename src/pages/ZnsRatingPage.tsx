import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquareText, RefreshCw, Star, Users } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { listCampaigns, type ZnsCampaign } from '../data/znsData';
import { listRatings, syncRatings, type ZnsRating } from '../data/znsRatingData';

const SOURCE_BADGE: Record<ZnsRating['nguon'], { label: string; className: string }> = {
  webhook: { label: 'Zalo gửi tự động', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' },
  dong_bo: { label: 'Đồng bộ thủ công', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
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
  return d.toISOString().slice(0, 10);
}

const ZnsRatingPage: React.FC = () => {
  const { showToast } = useToast();

  const [ratings, setRatings] = useState<ZnsRating[]>([]);
  const [loading, setLoading] = useState(true);

  const [campaigns, setCampaigns] = useState<ZnsCampaign[]>([]);
  const [syncCampaignId, setSyncCampaignId] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [syncing, setSyncing] = useState(false);

  const [rateFilter, setRateFilter] = useState<'all' | number>('all');

  const loadRatings = async () => {
    setLoading(true);
    try {
      setRatings(await listRatings());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tải được danh sách đánh giá', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRatings();
    listCampaigns()
      .then(setCampaigns)
      .catch(() => {});
  }, []);

  const filteredRatings = useMemo(() => {
    if (rateFilter === 'all') return ratings;
    return ratings.filter((r) => r.rate === rateFilter);
  }, [ratings, rateFilter]);

  const avgRate = useMemo(() => {
    const rated = ratings.filter((r) => r.rate !== null);
    if (rated.length === 0) return null;
    return rated.reduce((sum, r) => sum + (r.rate ?? 0), 0) / rated.length;
  }, [ratings]);

  const handleSync = async () => {
    const campaign = campaigns.find((c) => c.id === syncCampaignId);
    if (!campaign) {
      showToast('Chọn chiến dịch (mẫu) cần đồng bộ đánh giá', 'error');
      return;
    }
    const fromMs = new Date(`${fromDate}T00:00:00`).getTime();
    const toMs = new Date(`${toDate}T23:59:59`).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      showToast('Khoảng thời gian không hợp lệ', 'error');
      return;
    }

    setSyncing(true);
    try {
      const result = await syncRatings({ template_id: campaign.template_id, from_time: fromMs, to_time: toMs });
      showToast(`Đã đồng bộ ${result.synced}/${result.total} đánh giá`, 'success');
      await loadRatings();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Đồng bộ đánh giá thất bại', 'error');
    } finally {
      setSyncing(false);
    }
  };

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
            <p className="text-lg font-bold text-foreground">{ratings.length}</p>
          </div>
        </div>
      </div>

      {/* Đồng bộ thủ công */}
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6 space-y-3">
        <h2 className="font-bold text-foreground flex items-center gap-2">
          <RefreshCw size={16} /> Đồng bộ đánh giá từ Zalo
        </h2>
        <p className="text-xs text-muted-foreground">
          Đánh giá mới sẽ tự động nhận qua Webhook khi khách hàng phản hồi. Dùng đồng bộ thủ công để lấy
          lại dữ liệu cũ hoặc đối soát cho 1 mẫu (template) trong khoảng thời gian cụ thể.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Chiến dịch / mẫu ZNS</label>
            <select
              value={syncCampaignId}
              onChange={(e) => setSyncCampaignId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
            >
              <option value="">-- Chọn chiến dịch --</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ten_chien_dich} ({c.template_id})
                </option>
              ))}
            </select>
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
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Đồng bộ
          </button>
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
              Tất cả ({ratings.length})
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
              return (
                <div key={r.id} className="py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRow rate={r.rate} />
                    <span className="font-medium text-foreground">
                      {r.khach_hang?.ho_va_ten || 'Khách hàng chưa xác định'}
                    </span>
                    {r.khach_hang?.so_dien_thoai && (
                      <span className="text-xs font-mono text-muted-foreground">{r.khach_hang.so_dien_thoai}</span>
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
