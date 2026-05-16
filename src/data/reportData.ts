import { getStoredDemoRole } from '../lib/authStorage';
import { supabase } from '../lib/supabase';
import { removeVietnameseTones } from '../lib/utils';

/** Chuẩn hóa tên để khớp bảng lương / nhan_vien_id trên đơn (bỏ dấu, thường, gộp khoảng trắng). */
function chuanHoaTenTheoDon(s: string): string {
  return removeVietnameseTones(s.trim().toLowerCase()).replace(/\s+/g, ' ');
}

function khoangNgayCuaThangReport(nam: number, thang: number): { start: string; end: string } {
  const sm = String(thang).padStart(2, '0');
  const last = new Date(nam, thang, 0).getDate();
  const se = String(last).padStart(2, '0');
  return { start: `${nam}-${sm}-01`, end: `${nam}-${sm}-${se}` };
}

/**
 * Lấy (năm, tháng) lịch từ cột `the_ban_hang.ngay` (và tương tự).
 *
 * **Supabase / Postgres `date`:** API trả chuỗi dạng `YYYY-MM-DD`, ví dụ `2026-05-07` — đây là dạng chuẩn.
 * **`timestamptz`:** lấy phần ngày trước `T` (ví dụ `2026-05-07T00:00:00+00` → tháng 5 năm 2026).
 * Cũng chấp nhận tháng/ngày một chữ số (`2026-5-7`) và dự phòng `DD/MM/YYYY`.
 */
export function extractNamThangTuNgayCot(ngayRaw: unknown): { nam: number; thang: number } | null {
  if (ngayRaw == null) return null;
  const s = String(ngayRaw).trim();
  const head = s.split(/[T\s]/)[0] ?? s;

  const iso = head.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const nam = Number(iso[1]);
    const thang = Number(iso[2]);
    if (!Number.isFinite(nam) || !Number.isFinite(thang) || thang < 1 || thang > 12) return null;
    return { nam, thang };
  }

  const dmy = head.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const thang = Number(dmy[2]);
    const nam = Number(dmy[3]);
    if (!Number.isFinite(nam) || !Number.isFinite(thang) || thang < 1 || thang > 12) return null;
    return { nam, thang };
  }

  return null;
}

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
const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();

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

  /** Gộp thành tiền theo mã đơn (id_don_hang ↔ id_bh / id trên bảng the_ban_hang). Khóa chữ thường để khớp ổn định. */
  const orderRevenueMap = new Map<string, { revenue: number; profit: number; date: string }>();
  ctRecords.forEach((r) => {
    const raw = (r.id_don_hang || '').trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    const existing = orderRevenueMap.get(key) || { revenue: 0, profit: 0, date: r.ngay || '' };
    const rev = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    const pro = rev - (r.gia_von || 0) * (r.so_luong || 1);
    existing.revenue += rev;
    existing.profit += pro;
    if (r.ngay && !existing.date) existing.date = r.ngay;
    orderRevenueMap.set(key, existing);
  });

  const revenueChoDonHang = (h: { id: string; id_bh?: string | null; ngay: string }) => {
    const candidates = [h.id_bh, h.id]
      .filter(Boolean)
      .map((x) => String(x).trim().toLowerCase());
    for (const k of candidates) {
      const v = orderRevenueMap.get(k);
      if (v) return v;
    }
    return null;
  };

  const personnelMap = new Map<string, {
    revenue: number;
    profit: number;
    orders: Set<string>;
    daily: Map<string, { revenue: number; profit: number }>;
  }>();

  /** Mỗi bản ghi Đơn hàng (the_ban_hang) trong kỳ: gán doanh thu (từ chi tiết đơn) cho NV trên đơn. */
  for (const h of headers as Array<{ id: string; id_bh?: string | null; ngay: string; nhan_vien_id?: string | null }>) {
    const staffRaw = (h.nhan_vien_id || '').trim();
    if (!staffRaw) continue;
    const value = revenueChoDonHang(h);
    if (!value) continue;
    const orderKey = String(h.id_bh || h.id);
    const staffNames = staffRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const date = value.date || h.ngay;
    staffNames.forEach((name) => {
      const existing = personnelMap.get(name) || {
        revenue: 0, profit: 0, orders: new Set<string>(), daily: new Map<string, { revenue: number; profit: number }>(),
      };
      existing.revenue += value.revenue;
      existing.profit += value.profit;
      existing.orders.add(orderKey);
      const dayData = existing.daily.get(date) || { revenue: 0, profit: 0 };
      dayData.revenue += value.revenue;
      dayData.profit += value.profit;
      existing.daily.set(date, dayData);
      personnelMap.set(name, existing);
    });
  }

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

/**
 * Gom doanh số theo nhân viên từ `the_ban_hang.tong_tien`.
 * Chỉ tính đơn có **tháng/năm lịch của cột `ngay`** trùng `thang`/`nam` (kỳ bảng lương).
 * `nhan_vien_id` khớp theo tên (đã chuẩn hóa); nhiều tên cách phẩy → chia đều `tong_tien`.
 */
export async function getRevenueByPersonnelFromTongTien(
  nam: number,
  thang: number
): Promise<Map<string, number>> {
  const { start: startDate, end: endDate } = khoangNgayCuaThangReport(nam, thang);

  if (isDemo()) {
    const map = new Map<string, number>();
    const staff = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Văn D'];
    for (let i = 0; i < 20; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (i % 14));
      if (d.getFullYear() !== nam || d.getMonth() + 1 !== thang) continue;
      let staffList = staff[i % staff.length];
      if (i % 5 === 0) staffList += `, ${staff[(i + 1) % staff.length]}`;
      const amount = 500_000 + i * 10_000;
      const parts = staffList.split(',').map((s) => s.trim()).filter(Boolean);
      const share = amount / parts.length;
      for (const n of parts) {
        const k = chuanHoaTenTheoDon(n);
        map.set(k, (map.get(k) || 0) + share);
      }
    }
    return map;
  }

  const map = new Map<string, number>();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('the_ban_hang')
      .select('nhan_vien_id, tong_tien, ngay')
      .gte('ngay', startDate)
      .lte('ngay', endDate)
      .order('ngay', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const chunk = data ?? [];
    for (const h of chunk) {
      const ky = extractNamThangTuNgayCot(h.ngay);
      if (ky !== null && (ky.nam !== nam || ky.thang !== thang)) continue;

      const staffRaw = String(h.nhan_vien_id ?? '').trim();
      if (!staffRaw) continue;
      const amount = Number(h.tong_tien ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const names = staffRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) continue;
      const share = amount / names.length;
      for (const name of names) {
        const k = chuanHoaTenTheoDon(name);
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + share);
      }
    }

    if (chunk.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}
