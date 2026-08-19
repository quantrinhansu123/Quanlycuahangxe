import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, Send, Users, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  approveOrderMessages,
  listOrderMessageQueue,
  type OrderMessageQueueItem,
} from '../../data/znsOrderMessageData';

const STATUS: Record<OrderMessageQueueItem['status'], { label: string; className: string }> = {
  cho_duyet: { label: 'Chờ duyệt', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  da_gui: { label: 'Đã gửi', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  that_bai: { label: 'Gửi lỗi', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);

const toLocalDateInput = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const todayInput = () => toLocalDateInput(new Date().toISOString());

export const OrderMessageApprovalPanel: React.FC = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OrderMessageQueueItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState(todayInput());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listOrderMessageQueue());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không tải được hàng đợi duyệt tin nhắn', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const displayedRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (dateFilter && toLocalDateInput(row.created_at) !== dateFilter) return false;
      if (!keyword) return true;
      const haystack = `${row.order_code} ${row.customer_name} ${row.phone || ''} ${row.service_name || ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, searchTerm, dateFilter]);

  const pendingRows = displayedRows.filter((row) => row.status !== 'da_gui');

  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(displayedRows.map((row) => row.id));
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [displayedRows]);

  const toggleAll = () => {
    if (selectedIds.size === pendingRows.length && pendingRows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRows.map((row) => row.id)));
    }
  };

  const send = async (ids: string[]) => {
    if (!ids.length) return;
    setSending(true);
    try {
      const result = await approveOrderMessages(ids);
      showToast(
        result.failed ? `Đã gửi ${result.sent} tin, ${result.failed} tin lỗi` : `Đã gửi thành công ${result.sent} tin nhắn`,
        result.failed ? 'error' : 'success',
      );
      setSelectedIds(new Set());
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể gửi tin nhắn xác nhận', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Duyệt tin nhắn xác nhận đơn hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Đơn nhân viên vừa tạo sẽ nằm trong hàng đợi. Chỉ khi quản trị viên duyệt, mẫu Zalo xác nhận đơn hàng mới được gửi.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <label className="block flex-1 text-sm font-medium text-foreground">
              Tìm kiếm
              <div className="relative mt-1.5">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Mã đơn, tên khách, số điện thoại, dịch vụ..."
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-primary"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            </label>
            <label className="block text-sm font-medium text-foreground sm:w-48">
              Ngày tạo
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                {dateFilter ? (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    title="Xem tất cả ngày"
                    className="shrink-0 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            </label>
          </div>
          <button
            type="button"
            disabled={sending || selectedIds.size === 0}
            onClick={() => void send([...selectedIds])}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Duyệt & gửi đã chọn ({selectedIds.size})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Đang tải hàng đợi...</div>
        ) : displayedRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'Chưa có khách hàng nào chờ duyệt.' : 'Không có khách hàng nào khớp bộ lọc hiện tại.'}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={pendingRows.length > 0 && selectedIds.size === pendingRows.length} onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3">Mã đơn hàng</th>
                  <th className="px-3 py-3">Sản phẩm / Dịch vụ</th>
                  <th className="px-3 py-3">Họ tên</th>
                  <th className="px-3 py-3">Số điện thoại</th>
                  <th className="px-3 py-3 text-right">Tổng tiền</th>
                  <th className="px-3 py-3 text-center">Số lần gửi</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3">Duyệt gửi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedRows.map((row) => {
                  const badge = STATUS[row.status];
                  const canSend = row.status !== 'da_gui';
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          disabled={!canSend || sending}
                          checked={selectedIds.has(row.id)}
                          onChange={() => setSelectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                            return next;
                          })}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">{row.order_code}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.service_name || 'Chưa có dịch vụ'}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{row.customer_name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.phone || 'Chưa có số điện thoại'}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">{money(row.total_amount)}</td>
                      <td className="px-3 py-3 text-center text-foreground">{row.send_count}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                        {row.last_error ? <p className="mt-1 max-w-[200px] text-xs text-red-500">{row.last_error}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={!canSend || sending}
                          onClick={() => void send([row.id])}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {row.status === 'that_bai' ? <Send size={14} /> : <CheckCircle2 size={14} />}
                          {row.status === 'that_bai' ? 'Gửi lại' : 'Duyệt gửi'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users size={14} /> Mỗi lần duyệt đều được ghi nhận để quản trị viên kiểm soát số lần gửi.</div>
    </div>
  );
};
