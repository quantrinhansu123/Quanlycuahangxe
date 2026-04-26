import React, { useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import type { ThuChi } from '../data/financialData';
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  parse,
  differenceInCalendarDays,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { DollarSign, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { clsx } from 'clsx';

const dayKey = (t: ThuChi) => (t.ngay || '').slice(0, 10);
const isDone = (t: ThuChi) => t.trang_thai === 'Hoàn thành';

function parseLocalYmd(ymd: string): Date {
  return parse(ymd.slice(0, 10), 'yyyy-MM-dd', new Date());
}

export interface FinancialChartsDateRange {
  start: string;
  end: string;
}

interface FinancialChartsProps {
  transactions: ThuChi[];
  dateRange: FinancialChartsDateRange;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const FinancialCharts: React.FC<FinancialChartsProps> = ({ transactions, dateRange }) => {
  // 1. Stats Calculation
  const stats = useMemo(() => {
    const successTransactions = transactions.filter(t => t.trang_thai === 'Hoàn thành');
    const income = successTransactions.filter(t => t.loai_phieu === 'phiếu thu').reduce((sum, t) => sum + t.so_tien, 0);
    const expense = successTransactions.filter(t => t.loai_phieu === 'phiếu chi').reduce((sum, t) => sum + t.so_tien, 0);
    const balance = income - expense;
    const count = transactions.length;

    return { income, expense, balance, count };
  }, [transactions]);

  const rangeMeta = useMemo(() => {
    const start = parseLocalYmd(dateRange.start);
    const end = parseLocalYmd(dateRange.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return { valid: false as const, nDays: 0, start, end };
    }
    return {
      valid: true as const,
      nDays: differenceInCalendarDays(end, start) + 1,
      start,
      end,
    };
  }, [dateRange.start, dateRange.end]);

  // 2. Time series: theo khoảng ngày (≤90 ngày: theo từng ngày; dài hơn: theo tháng)
  const timeSeriesData = useMemo(() => {
    if (!rangeMeta.valid) return [];
    const { start, end, nDays } = rangeMeta;

    if (nDays <= 90) {
      return eachDayOfInterval({ start, end }).map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dtx = transactions.filter((t) => dayKey(t) === key && isDone(t));
        const income = dtx.filter((t) => t.loai_phieu === 'phiếu thu').reduce((s, t) => s + t.so_tien, 0);
        const expense = dtx.filter((t) => t.loai_phieu === 'phiếu chi').reduce((s, t) => s + t.so_tien, 0);
        return {
          name: format(day, 'dd/MM', { locale: vi }),
          income,
          expense,
        };
      });
    }

    return eachMonthOfInterval({ start, end: endOfMonth(end) }).map((monthDate) => {
      const m = format(monthDate, 'yyyy-MM');
      const dtx = transactions.filter((t) => isDone(t) && dayKey(t).slice(0, 7) === m);
      const income = dtx.filter((t) => t.loai_phieu === 'phiếu thu').reduce((s, t) => s + t.so_tien, 0);
      const expense = dtx.filter((t) => t.loai_phieu === 'phiếu chi').reduce((s, t) => s + t.so_tien, 0);
      return {
        name: format(monthDate, 'MM/yyyy', { locale: vi }),
        income,
        expense,
      };
    });
  }, [transactions, rangeMeta]);

  // 3. Category Data (Doughnut)
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions
      .filter(t => t.loai_phieu === 'phiếu chi' && t.trang_thai === 'Hoàn thành')
      .forEach(t => {
        const cat = t.danh_muc || 'Khác';
        categories[cat] = (categories[cat] || 0) + t.so_tien;
      });

    const data = Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    
    const total = data.reduce((sum, d) => sum + d.value, 0);
    return { data: data.slice(0, 5), total };
  }, [transactions]);

  // 4. Branch Distribution (Income vs Expense)
  const branchData = useMemo(() => {
    const branches: Record<string, { income: number; expense: number }> = {};
    transactions
      .filter(t => t.trang_thai === 'Hoàn thành')
      .forEach(t => {
        if (!branches[t.co_so]) {
          branches[t.co_so] = { income: 0, expense: 0 };
        }
        if (t.loai_phieu === 'phiếu thu') {
          branches[t.co_so].income += t.so_tien;
        } else {
          branches[t.co_so].expense += t.so_tien;
        }
      });

    return Object.entries(branches).map(([name, stats]) => ({
      name,
      ...stats
    }));
  }, [transactions]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-border rounded-lg shadow-xl text-[12px] animate-in zoom-in-95 duration-100">
          <p className="font-bold mb-2 text-black">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 py-1">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload.fill }}></div>
                <span className="text-black">{entry.name}:</span>
              </span>
              <span className="font-bold text-black font-mono">
                {new Intl.NumberFormat('vi-VN').format(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-700">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIItem title="Giao dịch" value={stats.count} icon={Activity} color="blue" subtitle="Theo bộ lọc" />
        <KPIItem title="Thu nhập" value={stats.income} icon={ArrowUpRight} color="emerald" unit="đ" />
        <KPIItem title="Chi phí" value={stats.expense} icon={ArrowDownRight} color="rose" unit="đ" />
        <KPIItem title="Số dư" value={stats.balance} icon={DollarSign} color="amber" unit="đ" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Spline Line Chart (Biến động tài chính) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="text-sm font-black text-black tracking-tight uppercase">Biến động tài chính</h3>
              <p className="text-[10px] text-black font-medium opacity-60">
                {rangeMeta.valid ? (
                  <>
                    {format(rangeMeta.start, 'dd/MM/yyyy', { locale: vi })} → {format(rangeMeta.end, 'dd/MM/yyyy', { locale: vi })}{' '}
                    · {rangeMeta.nDays > 90 ? 'trục: theo tháng' : 'trục: theo ngày'}
                  </>
                ) : (
                  <>Chọn từ ngày ≤ đến ngày</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[11px] font-bold text-black uppercase">Thu nhập</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <span className="text-[11px] font-bold text-black uppercase">Chi phí</span>
              </div>
            </div>
          </div>
          <div className="h-[220px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#000' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#000' }}
                  tickFormatter={formatCurrency}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  name="Thu nhập"
                  type="monotone" 
                  dataKey="income" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Line 
                  name="Chi phí"
                  type="monotone" 
                  dataKey="expense" 
                  stroke="#ef4444" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart (Cơ sở) */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="text-sm font-black text-black tracking-tight uppercase">Cơ cấu Thu - Chi</h3>
              <p className="text-[10px] text-black font-medium opacity-60">Theo cơ sở · cùng khoảng lọc</p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchData} margin={{ top: 0, right: 30, left: 0, bottom: 0 }} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#000' }}
                  dy={5}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#000' }}
                  tickFormatter={formatCurrency}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                <Bar name="Tổng Thu" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar name="Tổng Chi" dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Doughnut Chart (Cơ cấu chi phí) - Expanded to Full Width */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-black tracking-tight uppercase">Danh mục Chi phí</h3>
              <p className="text-[10px] text-black font-medium opacity-60">Phân bổ nguồn vốn đầu tư</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative w-[200px] h-[200px] md:w-[260px] md:h-[260px] flex items-center justify-center shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData.data}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={105}
                    paddingAngle={6}
                    dataKey="value"
                  >
                    {categoryData.data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center pointer-events-none">
                <span className="text-[10px] text-black uppercase tracking-widest font-bold opacity-40">Tổng chi</span>
                <span className="text-xl md:text-3xl font-black text-black">{formatCurrency(categoryData.total)}</span>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {categoryData.data.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50 group">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span className="text-[12px] font-bold text-black group-hover:text-primary transition-colors truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-black text-black">{formatCurrency(item.value)}</span>
                    <span className="text-[10px] font-bold text-black opacity-40">
                      {categoryData.total > 0 ? ((item.value / categoryData.total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Internal KPI Sub-component
const KPIItem: React.FC<{ 
  title: string, 
  value: number | string, 
  icon: React.ElementType, 
  color: 'blue' | 'emerald' | 'rose' | 'amber',
  unit?: string,
  subtitle?: string
}> = ({ title, value, icon: Icon, color, unit = '', subtitle }) => {
  const colorMap = {
    blue: 'text-blue-500 bg-blue-50/50 border-blue-100',
    emerald: 'text-emerald-500 bg-emerald-50/50 border-emerald-100',
    rose: 'text-rose-500 bg-rose-50/50 border-rose-100',
    amber: 'text-amber-500 bg-amber-50/50 border-amber-100'
  };

  return (
    <div className="bg-card p-3 rounded-xl border border-border shadow-sm flex flex-col gap-2 relative overflow-hidden group hover:border-primary/20 transition-all">
      <div className="flex items-center justify-between relative z-10">
        <h4 className="text-[9px] font-black text-black/40 uppercase tracking-tight truncate">{title}</h4>
      </div>
      
      <div className="flex items-center gap-2.5 relative z-10">
        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center border shrink-0", colorMap[color])}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-0.5 truncate">
            <span className="text-sm md:text-xl font-black text-black">
              {typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : value}
            </span>
            <span className="text-[9px] font-bold text-black">{unit}</span>
          </div>
          {subtitle && <p className="text-[9px] font-bold text-black/30 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

export default FinancialCharts;
