import { supabase } from '../lib/supabase';

export interface DailyItem {
  date: string;
  revenue: number;
  profit: number;
  order_count: number;
}

export interface ServiceDailyItem extends DailyItem {
  quantity: number;
}

export interface RevenueByService {
  san_pham: string;
  total_revenue: number;
  total_profit: number;
  total_quantity: number;
  order_count: number;
  percentage: number;
  daily_breakdown: ServiceDailyItem[];
}

export interface RevenueByDay {
  date: string;
  total_revenue: number;
  total_profit: number;
  order_count: number;
  avg_per_order: number;
  service_breakdown: Array<{ san_pham: string; revenue: number; profit: number; quantity: number }>;
}

export interface RevenueByBranch {
  co_so: string;
  total_revenue: number;
  total_profit: number;
  order_count: number;
  percentage: number;
  daily_breakdown: DailyItem[];
}

export interface PersonnelDailyRevenue {
  date: string;
  revenue: number;
  profit: number;
  order_count: number;
}

export interface RevenueByPersonnel {
  nhan_vien_name: string;
  total_revenue: number;
  total_profit: number;
  order_count: number;
  avg_per_order: number;
  avg_per_day: number;
  daily_breakdown: PersonnelDailyRevenue[];
}

export interface ReportSummary {
  total_revenue: number;
  total_profit: number;
  total_orders: number;
  avg_per_day: number;
  avg_per_order: number;
  date_range_days: number;
}

// Helper to detect demo mode
const isDemo = () => typeof window !== 'undefined' && !!window.sessionStorage.getItem('demo_role');

// Fetch all CT records within a date range
async function fetchAllCTRecords(startDate?: string, endDate?: string) {
  if (isDemo()) {
    const data = [];
    const products = [
      { name: 'Thay dầu Castrol', price: 150000, cost: 80000 },
      { name: 'Bảo dưỡng xe ga', price: 500000, cost: 200000 },
      { name: 'Thay lốp Michelin', price: 1200000, cost: 950000 },
      { name: 'Rửa xe bọt tuyết', price: 50000, cost: 10000 },
      { name: 'Thay má phanh', price: 250000, cost: 120000 },
    ];
    const branches = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh', 'Cơ sở Hải Dương'];

    for (let i = 0; i < 40; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (i % 14));
      const date = d.toISOString().split('T')[0];
      const p = products[i % products.length];
      const branch = branches[i % branches.length];
      data.push({
        id: `ct-${i}`,
        id_don_hang: `BH-${100 + Math.floor(i / 2)}`,
        san_pham: p.name,
        co_so: branch,
        gia_ban: p.price,
        gia_von: p.cost,
        so_luong: 1 + (i % 2),
        thanh_tien: p.price * (1 + (i % 2)),
        ngay: date
      });
    }
    return data;
  }
  let query = supabase
    .from('the_ban_hang_ct')
    .select('id, id_don_hang, san_pham, co_so, gia_ban, gia_von, so_luong, thanh_tien, ngay');

  if (startDate) query = query.gte('ngay', startDate);
  if (endDate) query = query.lte('ngay', endDate);

  const { data, error } = await query.order('ngay', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Fetch all header records within a date range (for personnel N-N mapping)
async function fetchAllHeaderRecords(startDate?: string, endDate?: string) {
  if (isDemo()) {
    const data = [];
    const staff = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Văn D'];
    for (let i = 0; i < 20; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (i % 14));
      const date = d.toISOString().split('T')[0];
      let staffList = staff[i % staff.length];
      if (i % 5 === 0) staffList += `, ${staff[(i + 1) % staff.length]}`;
      data.push({
        id: `h-${i}`,
        id_bh: `BH-${100 + i}`,
        ngay: date,
        nhan_vien_id: staffList
      });
    }
    return data;
  }
  let query = supabase
    .from('the_ban_hang')
    .select('id, id_bh, ngay, nhan_vien_id');

  if (startDate) query = query.gte('ngay', startDate);
  if (endDate) query = query.lte('ngay', endDate);

  const { data, error } = await query.order('ngay', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getReportSummary(startDate?: string, endDate?: string): Promise<ReportSummary> {
  const ctRecords = await fetchAllCTRecords(startDate, endDate);
  const total_revenue = ctRecords.reduce((s, r) => s + (r.thanh_tien || r.gia_ban * r.so_luong || 0), 0);
  const total_profit = ctRecords.reduce((s, r) => s + ((r.thanh_tien || 0) - (r.gia_von || 0) * (r.so_luong || 1)), 0);

  const uniqueOrders = new Set(ctRecords.map(r => r.id_don_hang).filter(Boolean));
  const uniqueDates = new Set(ctRecords.map(r => r.ngay).filter(Boolean));

  const date_range_days = uniqueDates.size || 1;
  const total_orders = uniqueOrders.size;

  return {
    total_revenue,
    total_profit,
    total_orders,
    avg_per_day: total_revenue / date_range_days,
    avg_per_order: total_orders > 0 ? total_revenue / total_orders : 0,
    date_range_days,
  };
}

export async function getRevenueByService(startDate?: string, endDate?: string): Promise<RevenueByService[]> {
  const records = await fetchAllCTRecords(startDate, endDate);

  const map = new Map<string, {
    revenue: number;
    profit: number;
    quantity: number;
    orders: Set<string>;
    daily: Map<string, { revenue: number; profit: number; quantity: number; orders: Set<string> }>;
  }>();

  records.forEach(r => {
    const key = r.san_pham || 'Không rõ';
    const existing = map.get(key) || { revenue: 0, profit: 0, quantity: 0, orders: new Set<string>(), daily: new Map() };
    const rev = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    const pro = rev - (r.gia_von || 0) * (r.so_luong || 1);
    const qty = r.so_luong || 1;
    existing.revenue += rev;
    existing.profit += pro;
    existing.quantity += qty;
    if (r.id_don_hang) existing.orders.add(r.id_don_hang);

    // Daily breakdown
    const dateKey = r.ngay || '';
    if (dateKey) {
      const day = existing.daily.get(dateKey) || { revenue: 0, profit: 0, quantity: 0, orders: new Set<string>() };
      day.revenue += rev;
      day.profit += pro;
      day.quantity += qty;
      if (r.id_don_hang) day.orders.add(r.id_don_hang);
      existing.daily.set(dateKey, day);
    }

    map.set(key, existing);
  });

  const total = Array.from(map.values()).reduce((s, v) => s + v.revenue, 0) || 1;

  return Array.from(map.entries())
    .map(([san_pham, v]) => ({
      san_pham,
      total_revenue: v.revenue,
      total_profit: v.profit,
      total_quantity: v.quantity,
      order_count: v.orders.size,
      percentage: (v.revenue / total) * 100,
      daily_breakdown: Array.from(v.daily.entries())
        .map(([date, d]) => ({ date, revenue: d.revenue, profit: d.profit, quantity: d.quantity, order_count: d.orders.size }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

export async function getRevenueByDay(startDate?: string, endDate?: string): Promise<RevenueByDay[]> {
  const records = await fetchAllCTRecords(startDate, endDate);

  const map = new Map<string, {
    revenue: number;
    profit: number;
    orders: Set<string>;
    services: Map<string, { revenue: number; profit: number; quantity: number }>;
  }>();

  records.forEach(r => {
    const key = r.ngay || '';
    if (!key) return;
    const existing = map.get(key) || { revenue: 0, profit: 0, orders: new Set<string>(), services: new Map() };
    const rev = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    const pro = rev - (r.gia_von || 0) * (r.so_luong || 1);
    const qty = r.so_luong || 1;
    existing.revenue += rev;
    existing.profit += pro;
    if (r.id_don_hang) existing.orders.add(r.id_don_hang);

    // Service breakdown per day
    const svcKey = r.san_pham || 'Không rõ';
    const svc = existing.services.get(svcKey) || { revenue: 0, profit: 0, quantity: 0 };
    svc.revenue += rev;
    svc.profit += pro;
    svc.quantity += qty;
    existing.services.set(svcKey, svc);

    map.set(key, existing);
  });

  return Array.from(map.entries())
    .map(([date, v]) => ({
      date,
      total_revenue: v.revenue,
      total_profit: v.profit,
      order_count: v.orders.size,
      avg_per_order: v.orders.size > 0 ? v.revenue / v.orders.size : 0,
      service_breakdown: Array.from(v.services.entries())
        .map(([san_pham, s]) => ({ san_pham, ...s }))
        .sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRevenueByBranch(startDate?: string, endDate?: string): Promise<RevenueByBranch[]> {
  const records = await fetchAllCTRecords(startDate, endDate);

  const map = new Map<string, {
    revenue: number;
    profit: number;
    orders: Set<string>;
    daily: Map<string, { revenue: number; profit: number; orders: Set<string> }>;
  }>();

  records.forEach(r => {
    const key = r.co_so || 'Chưa phân loại';
    const existing = map.get(key) || { revenue: 0, profit: 0, orders: new Set<string>(), daily: new Map() };
    const rev = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    const pro = rev - (r.gia_von || 0) * (r.so_luong || 1);
    existing.revenue += rev;
    existing.profit += pro;
    if (r.id_don_hang) existing.orders.add(r.id_don_hang);

    const dateKey = r.ngay || '';
    if (dateKey) {
      const day = existing.daily.get(dateKey) || { revenue: 0, profit: 0, orders: new Set<string>() };
      day.revenue += rev;
      day.profit += pro;
      if (r.id_don_hang) day.orders.add(r.id_don_hang);
      existing.daily.set(dateKey, day);
    }

    map.set(key, existing);
  });

  const total = Array.from(map.values()).reduce((s, v) => s + v.revenue, 0) || 1;

  return Array.from(map.entries())
    .map(([co_so, v]) => ({
      co_so,
      total_revenue: v.revenue,
      total_profit: v.profit,
      order_count: v.orders.size,
      percentage: (v.revenue / total) * 100,
      daily_breakdown: Array.from(v.daily.entries())
        .map(([date, d]) => ({ date, revenue: d.revenue, profit: d.profit, order_count: d.orders.size }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

export async function getRevenueByPersonnel(
  startDate?: string,
  endDate?: string
): Promise<{ personnel: RevenueByPersonnel[]; avg_revenue_per_person: number; date_list: string[] }> {
  const [headers, ctRecords] = await Promise.all([
    fetchAllHeaderRecords(startDate, endDate),
    fetchAllCTRecords(startDate, endDate),
  ]);

  const orderRevenueMap = new Map<string, { revenue: number; profit: number; date: string }>();
  ctRecords.forEach(r => {
    const key = r.id_don_hang || '';
    if (!key) return;
    const existing = orderRevenueMap.get(key) || { revenue: 0, profit: 0, date: r.ngay };
    const rev = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    const pro = rev - (r.gia_von || 0) * (r.so_luong || 1);
    existing.revenue += rev;
    existing.profit += pro;
    if (r.ngay && !existing.date) existing.date = r.ngay;
    orderRevenueMap.set(key, existing);
  });

  const headerLookup = new Map<string, { nhan_vien_id: string; ngay: string }>();
  headers.forEach(h => {
    if (h.id) headerLookup.set(h.id, { nhan_vien_id: h.nhan_vien_id || '', ngay: h.ngay });
    if (h.id_bh) headerLookup.set(h.id_bh, { nhan_vien_id: h.nhan_vien_id || '', ngay: h.ngay });
  });

  const personnelMap = new Map<string, {
    revenue: number;
    profit: number;
    orders: Set<string>;
    daily: Map<string, { revenue: number; profit: number }>;
  }>();

  orderRevenueMap.forEach((value, orderId) => {
    const header = headerLookup.get(orderId);
    if (!header || !header.nhan_vien_id) return;
    const staffNames = header.nhan_vien_id.split(',').map(s => s.trim()).filter(Boolean);
    const date = value.date || header.ngay;
    staffNames.forEach(name => {
      const existing = personnelMap.get(name) || {
        revenue: 0, profit: 0, orders: new Set<string>(), daily: new Map<string, { revenue: number; profit: number }>()
      };
      existing.revenue += value.revenue;
      existing.profit += value.profit;
      existing.orders.add(orderId);
      const dayData = existing.daily.get(date) || { revenue: 0, profit: 0 };
      dayData.revenue += value.revenue;
      dayData.profit += value.profit;
      existing.daily.set(date, dayData);
      personnelMap.set(name, existing);
    });
  });

  const allDates = new Set<string>();
  personnelMap.forEach(v => v.daily.forEach((_, date) => allDates.add(date)));
  const date_list = Array.from(allDates).sort();
  const totalDays = date_list.length || 1;

  const personnel: RevenueByPersonnel[] = Array.from(personnelMap.entries())
    .map(([name, v]) => ({
      nhan_vien_name: name,
      total_revenue: v.revenue,
      total_profit: v.profit,
      order_count: v.orders.size,
      avg_per_order: v.orders.size > 0 ? v.revenue / v.orders.size : 0,
      avg_per_day: v.revenue / totalDays,
      daily_breakdown: Array.from(v.daily.entries())
        .map(([date, d]) => ({ date, revenue: d.revenue, profit: d.profit, order_count: 0 }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);

  const avg_revenue_per_person =
    personnel.length > 0
      ? personnel.reduce((s, p) => s + p.total_revenue, 0) / personnel.length
      : 0;

  return { personnel, avg_revenue_per_person, date_list };
}
