import { ArrowRight, CheckCircle2, Clock, DollarSign, Loader2, ShoppingCart, X, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPersonnelDailyStats } from '../data/personnelStatsData';
import { formatDateVi } from '../utils/datetimeFormat';
import DateInputVi from './ui/DateInputVi';

interface PersonnelDailyStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  personnelId: string;
  personnelName: string;
}

const PersonnelDailyStatsModal: React.FC<PersonnelDailyStatsModalProps> = ({
  isOpen,
  onClose,
  personnelId,
  personnelName
}) => {
  const todayDate = new Date();
  const firstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const [startDateStr, setStartDateStr] = useState<string>(firstDay.toISOString().split('T')[0]);
  const [endDateStr, setEndDateStr] = useState<string>(todayDate.toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'attendance'>('orders');

  useEffect(() => {
    if (!isOpen || !personnelId) return;

    let isMounted = true;
    const loadStats = async () => {
      try {
        setLoading(true);
        // Corrected: passing personnelName as the second argument
        const data = await getPersonnelDailyStats(personnelId, personnelName, startDateStr, endDateStr);
        if (isMounted) setStats(data);
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [isOpen, personnelId, personnelName, startDateStr, endDateStr]);

  if (!isOpen) return null;

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  const renderAttendanceStatus = () => {
    if (!stats?.attendance || stats.attendance.length === 0) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 px-3 py-1 rounded-full text-xs font-bold border border-border italic">
          Chưa có dữ liệu
        </div>
      );
    }

    const latest = stats.attendance[0];
    const isToday = new Date(latest.ngay).toDateString() === new Date().toDateString();

    if (latest.checkout) {
      return (
        <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-xs font-black border border-emerald-200">
          <CheckCircle2 size={14} /> {isToday ? 'ĐÃ TAN LÀM' : 'ĐÃ HOÀN THÀNH'}
        </div>
      );
    } else if (latest.checkin) {
      return (
        <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs font-black border border-blue-200 animate-pulse">
          <Clock size={16} /> {isToday ? 'ĐANG LÀM VIỆC' : 'CHƯA CHECKOUT'}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-xs font-black border border-red-200">
        <XCircle size={14} /> NGHỈ LÀM
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-lg font-black text-foreground">Thống kê Nhân sự</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{personnelName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Date Selector */}
        <div className="p-4 border-b border-border bg-card flex flex-wrap items-center justify-center gap-4 sm:gap-6 w-full">
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg border border-border">
            <span className="text-[12px] font-bold text-muted-foreground tracking-wide uppercase">Từ ngày</span>
            <DateInputVi
              value={startDateStr}
              onChange={setStartDateStr}
              className="font-bold text-foreground text-[13px] bg-transparent border-none outline-none p-0 w-[92px]"
            />
          </div>
          <div className="flex items-center justify-center text-muted-foreground"><ArrowRight size={14} /></div>
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-lg border border-border">
            <span className="text-[12px] font-bold text-muted-foreground tracking-wide uppercase">Đến ngày</span>
            <DateInputVi
              value={endDateStr}
              onChange={setEndDateStr}
              className="font-bold text-foreground text-[13px] bg-transparent border-none outline-none p-0 w-[92px]"
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-background space-y-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p className="text-sm font-medium">Đang tải dữ liệu...</p>
            </div>
          ) : stats ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    <ShoppingCart size={16} />
                    Đơn hàng hoàn thành
                  </div>
                  <div className="text-2xl font-black text-foreground mt-2">
                    {stats.totalOrders}
                  </div>
                </div>

                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <DollarSign size={16} />
                    Doanh số hệ thống ghi nhận
                  </div>
                  <div className="text-xl font-black text-foreground mt-2 truncate">
                    {formatCurrency(stats.totalSales)}
                  </div>
                </div>

                <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                    <Clock size={16} />
                    Trạng thái chấm công
                  </div>
                  <div className="mt-2">
                    {renderAttendanceStatus()}
                  </div>
                </div>
              </div>

              {/* Tabs Menu */}
              <div className="flex border-b border-border mt-4">
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`px-4 py-3 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'orders'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                >
                  <ShoppingCart size={16} /> Chi tiết đơn hàng ({stats.salesCards.length})
                </button>
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`px-4 py-3 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'attendance'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                >
                  <Clock size={16} /> Chi tiết chấm công
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'orders' ? (
                <div className="space-y-4 pt-2 animate-in fade-in zoom-in-95 duration-200">
                  {stats.salesCards.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground italic text-sm bg-card rounded-xl border border-border border-dashed">
                      Không có đơn hàng nào trong ngày này.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {stats.salesCards.map((card: any, idx: number) => (
                        <div key={card.id || idx} className="bg-card rounded-lg p-3 border border-border flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                          <div>
                            <p className="font-bold text-sm text-foreground">
                              Khách: <span className="text-primary">{card.khach_hang?.ho_va_ten || 'Không rõ'}</span>
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {card.the_ban_hang_ct && card.the_ban_hang_ct.length > 0 ? (
                                card.the_ban_hang_ct.map((ct: any, i: number) => (
                                  <span key={i} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-medium border border-border/50">
                                    {ct.san_pham} (SL: {ct.so_luong || 1})
                                  </span>
                                ))
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-medium border border-border/50">
                                  {card.dich_vu?.ten_dich_vu || 'Dịch vụ'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground mb-1">Doanh số</p>
                            <p className="font-black text-sm text-foreground">
                              {formatCurrency(
                                (card.the_ban_hang_ct || []).reduce((sum: number, c: any) => sum + (c.gia_ban * (c.so_luong || 1)), 0) || (card.dich_vu?.gia_ban || 0)
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2 animate-in fade-in zoom-in-95 duration-200">
                  {!stats.attendance || stats.attendance.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground italic text-sm bg-card rounded-xl border border-border border-dashed">
                      Nhân sự chưa có dữ liệu chấm công trong khoảng thời gian này.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {stats.attendance.map((att: any, idx: number) => (
                        <div key={att.id || idx} className="bg-card rounded-lg p-3 border border-border flex flex-col sm:flex-row gap-4 sm:items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded bg-muted overflow-hidden shrink-0 border border-border">
                              {att.anh ? (
                                <img src={att.anh} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">No Pic</div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-foreground mb-1">{formatDateVi(att.ngay)}</p>
                              <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  IN: {att.checkin || '—'}
                                </span>
                                <span className="text-orange-700 font-bold bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                                  OUT: {att.checkout || '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                          {att.vi_tri && (
                            <div className="text-right shrink-0 mt-2 sm:mt-0">
                              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Tọa độ GPS</p>
                              <p className="text-xs font-medium text-foreground bg-muted/50 px-2 py-1 rounded inline-block border border-border">{att.vi_tri}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-destructive text-sm font-medium">
              Không thể tải dữ liệu thống kê. Vui lòng thử lại.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PersonnelDailyStatsModal;
