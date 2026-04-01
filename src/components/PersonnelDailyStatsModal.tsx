import React, { useEffect, useState } from 'react';
import { X, Calendar, ShoppingCart, DollarSign, Clock, Loader2, ArrowLeft, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { getPersonnelDailyStats } from '../data/personnelStatsData';
import type { PersonnelDailyStats } from '../data/personnelStatsData';

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
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PersonnelDailyStats | null>(null);

  useEffect(() => {
    if (!isOpen || !personnelId) return;

    let isMounted = true;
    const loadStats = async () => {
      try {
        setLoading(true);
        const data = await getPersonnelDailyStats(personnelId, personnelName, dateStr);
        if (isMounted) setStats(data);
      } catch (error) {
        console.error('Lỗi khi tải thống kê:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [isOpen, personnelId, personnelName, dateStr]);

  if (!isOpen) return null;

  const handlePrevDay = () => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    setDateStr(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    setDateStr(d.toISOString().split('T')[0]);
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  const renderAttendanceStatus = () => {
    if (!stats || !stats.attendance) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground p-3 bg-muted/30 rounded-lg">
          <XCircle size={18} />
          <span className="text-sm font-medium">Chưa có dữ liệu chấm công</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
        <div className="flex items-center gap-2 font-bold text-sm">
          <CheckCircle2 size={18} />
          Đã chấm công
        </div>
        <div className="text-xs space-y-1">
          <p><strong>Check-in:</strong> {stats.attendance.checkin || '—'}</p>
          <p><strong>Check-out:</strong> {stats.attendance.checkout || '—'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden border border-border animate-in zoom-in-95 duration-200">
        
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
        <div className="p-4 border-b border-border bg-card flex items-center justify-between">
          <button 
            onClick={handlePrevDay}
            className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Calendar size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Ngày chọn xem</span>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="font-black text-foreground text-sm bg-transparent border-none outline-none focus:ring-0 p-0 cursor-pointer scheme-light dark:scheme-dark"
              />
            </div>
          </div>

          <button 
            onClick={handleNextDay}
            className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-background space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p className="text-sm font-medium">Đang tải dữ liệu ngày {new Date(dateStr).toLocaleDateString('vi-VN')}...</p>
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

              {/* Sales Cards List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShoppingCart size={14} /> Chi tiết đơn hàng ({stats.salesCards.length})
                </h3>
                {stats.salesCards.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground italic text-sm bg-card rounded-xl border border-border border-dashed">
                    Không có đơn hàng nào trong ngày này.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {stats.salesCards.map((card, idx) => (
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
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-destructive text-sm font-medium">
              Không thể tải dữ liệu thống kê. Vui lòng thử lại.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonnelDailyStatsModal;
