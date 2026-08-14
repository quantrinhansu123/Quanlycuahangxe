import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeDollarSign, Calendar, Loader2, Plus, Table2, Trash2, TrendingUp, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getChamCongTrongKhoang } from '../data/attendanceData';
import {
  loadPayrollRevenueData,
  type PayrollRevenueData,
  type PayrollRevenueOrderRow,
} from '../data/reportData';
import { removeVietnameseTones } from '../lib/utils';
import { GIO_RA_CHUAN_LABEL } from '../utils/timekeeping';
import {
  demGioTangCaTheoDongCham,
  demSoBuaAnTachTheoDongCham,
  demSoNgayCongTheoDongCham,
  type BangLuongChamCongInput,
  type LoaiNhanVien,
  type DongChamBuaNhap,
  formatTienNhap,
  formatVnd,
  parseTienNhap,
  tinhMotDong,
} from '../data/payrollAttendanceSalary';
import { getPersonnel, type NhanSu } from '../data/personnelData';
import PersonnelRevenueOrdersModal from '../components/PersonnelRevenueOrdersModal';
import { getPayrollBatch, getPayrollBreakdown, hasPayrollDetail, type BangLuong } from '../data/payrollData';
import { syncPayrollFromAttendance } from '../data/payrollAttendanceSyncData';

const LS_PREFIX = 'payrollChamCongLuongV2:';
const LS_PREFIX_LEGACY = 'payrollChamCongLuongV1:';
const DEFAULT_PCT_HH = 2.5;

function khoangNgayCuaThang(nam: number, thang: number): { start: string; end: string } {
  const sm = String(thang).padStart(2, '0');
  const last = new Date(nam, thang, 0).getDate();
  const se = String(last).padStart(2, '0');
  return { start: `${nam}-${sm}-01`, end: `${nam}-${sm}-${se}` };
}

/** So khớp tên bảng lương với tên NV trên đơn hàng / báo cáo (bỏ dấu, thường, gộp khoảng trắng). */
function chuanHoaTenSoSanh(s: string): string {
  return removeVietnameseTones(s.trim().toLowerCase()).replace(/\s+/g, ' ');
}

function ngayIsoTuNhanSu(p: NhanSu): string | null {
  const raw = p.ngay_vao_lam;
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Cập nhật cột doanh số tháng từ phiếu bán trong kỳ.
 * Khớp họ tên dòng bảng lương với nhân viên trên đơn (tên / UUID / mã NV).
 */
async function gopDoanhSoTheoBaoCao(
  rows: BangLuongChamCongInput[],
  nam: number,
  thang: number,
  payrollData?: PayrollRevenueData
): Promise<{ rows: BangLuongChamCongInput[]; payrollData: PayrollRevenueData }> {
  const data = payrollData ?? (await loadPayrollRevenueData(nam, thang));
  const map = data.totals;
  let nhanList: { id: string; ho_ten: string }[] = [];
  try {
    const list = await getPersonnel();
    nhanList = list
      .filter((n) => n.id)
      .map((n) => ({ id: n.id, ho_ten: n.ho_ten || '' }));
  } catch {
    // bỏ qua — vẫn map theo tên từ báo cáo
  }
  const mapped = rows.map((r) => {
    const ten = (r.hoTen || '').trim();
    if (!ten) return { ...r, tongDoanhThu: 0 };

    const kTen = chuanHoaTenSoSanh(ten);
    let rev = map.get(kTen) ?? 0;
    if (rev === 0 && nhanList.length > 0) {
      const ns = nhanList.find((x) => chuanHoaTenSoSanh(x.ho_ten) === kTen);
      if (ns) rev = map.get(chuanHoaTenSoSanh(ns.id)) ?? 0;
    }
    return { ...r, tongDoanhThu: rev };
  });
  return { rows: mapped, payrollData: data };
}

function layDonTheoHoTen(
  hoTen: string,
  data: PayrollRevenueData,
  nhanTheoChuanTen: Map<string, { id: string; idNhanSu: string | null }>
): PayrollRevenueOrderRow[] {
  const ten = (hoTen || '').trim();
  if (!ten) return [];

  const kTen = chuanHoaTenSoSanh(ten);
  let orders = data.ordersByStaff.get(kTen) || [];
  if (orders.length > 0) return orders;

  const meta = nhanTheoChuanTen.get(kTen);
  if (!meta) return [];

  orders = data.ordersByStaff.get(chuanHoaTenSoSanh(meta.id)) || [];
  if (orders.length > 0) return orders;

  if (meta.idNhanSu) {
    orders = data.ordersByStaff.get(chuanHoaTenSoSanh(meta.idNhanSu)) || [];
  }
  return orders;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRow(): BangLuongChamCongInput {
  return {
    id: newId(),
    hoTen: '',
    loai: 'chinh_thuc',
    luongCoBan: 0,
    soNgayCong: 0,
    soNgayCongThem: 0,
    soNgayLamTaiQuan: 0,
    soNgayKhongLamTaiQuan: 0,
    soNgayTangCaAn: 0,
    phuCapTroNgoai: 0,
    soGioTangCa: 0,
    tongDoanhThu: 0,
    phanTramHoaHong: 0,
    ngayBatDauLam: '',
    thuongKhac: 0,
    khoanTru: 0,
  };
}

function payrollBatchToInputRows(items: BangLuong[]): BangLuongChamCongInput[] {
  return items.flatMap((item) => {
    if (!item.nhan_su?.ho_ten) return [];
    const detail = getPayrollBreakdown(item);
    return [{
      ...emptyRow(),
      id: item.nhan_su_id,
      hoTen: item.nhan_su.ho_ten,
      loai: detail.loai_nhan_vien === 2 ? 'thoi_vu' : 'chinh_thuc',
      luongCoBan: Number(item.luong_co_ban) || 0,
      soNgayCong: Number(item.ngay_cong_thuc_te) || 0,
      soNgayCongThem: detail.ngay_cong_them,
      phuCapTroNgoai: detail.phu_cap_tro_ngoai,
      soGioTangCa: detail.so_gio_tang_ca,
      tongDoanhThu: Number(item.doanh_so) || 0,
      phanTramHoaHong: detail.phan_tram_hoa_hong,
      ngayBatDauLam: item.nhan_su.ngay_vao_lam?.slice(0, 10) ?? '',
    }];
  });
}

type StoredSheet = { v: 1; phanTramHoaHongKy: number; rows: BangLuongChamCongInput[] };

function loadSheet(
  y: number,
  m: number
): { phanTramHoaHongKy: number; rows: BangLuongChamCongInput[] } {
  try {
    let raw = localStorage.getItem(`${LS_PREFIX}${y}-${m}`);
    if (!raw) {
      raw = localStorage.getItem(`${LS_PREFIX_LEGACY}${y}-${m}`);
    }
    if (!raw) {
      return { phanTramHoaHongKy: DEFAULT_PCT_HH, rows: [emptyRow()] };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { phanTramHoaHongKy: DEFAULT_PCT_HH, rows: parsed as BangLuongChamCongInput[] };
    }
    const sheet = parsed as Partial<StoredSheet>;
    if (sheet && sheet.v === 1 && Array.isArray(sheet.rows) && sheet.rows.length > 0) {
      return {
        phanTramHoaHongKy: typeof sheet.phanTramHoaHongKy === 'number' ? sheet.phanTramHoaHongKy : DEFAULT_PCT_HH,
        rows: sheet.rows,
      };
    }
  } catch {
    // ignore
  }
  return { phanTramHoaHongKy: DEFAULT_PCT_HH, rows: [emptyRow()] };
}

type NumKey = keyof Pick<
  BangLuongChamCongInput,
  'luongCoBan' | 'soGioTangCa' | 'tongDoanhThu' | 'soNgayCongThem'
>;

/** Các năm trong Kỳ; luôn gộp `namDangChon` để select không bị trống khi nằm ngoài dải mặc định. */
function danhSachNamKy(referenceYear: number, namDangChon: number): number[] {
  const tu = referenceYear - 20;
  const den = referenceYear + 10;
  const set = new Set<number>();
  for (let y = tu; y <= den; y++) set.add(y);
  if (Number.isFinite(namDangChon)) set.add(Math.trunc(namDangChon));
  return Array.from(set).sort((a, b) => a - b);
}

const PayrollAttendanceSalaryPage: React.FC = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [nam, setNam] = useState(now.getFullYear());
  const [thang, setThang] = useState(now.getMonth() + 1);
  const y0 = now.getFullYear();
  const m0 = now.getMonth() + 1;
  const initial = loadSheet(y0, m0);
  const [phanTramHoaHongKy, setPhanTramHoaHongKy] = useState(initial.phanTramHoaHongKy);
  const [rows, setRows] = useState<BangLuongChamCongInput[]>(initial.rows);
  const [quickLoading, setQuickLoading] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [chamDong, setChamDong] = useState<DongChamBuaNhap[]>([]);
  const [nhanList, setNhanList] = useState<NhanSu[]>([]);
  const [revenueCache, setRevenueCache] = useState<PayrollRevenueData | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [ordersModal, setOrdersModal] = useState<{
    hoTen: string;
    orders: PayrollRevenueOrderRow[];
    loading: boolean;
  } | null>(null);
  /** Tránh ghi localStorage bằng dòng dữ liệu tháng cũ khi vừa đổi kỳ (chờ load xong). */
  const loadedKyRef = useRef(`${y0}-${m0}`);

  useEffect(() => {
    getPersonnel()
      .then(setNhanList)
      .catch((e) => console.error('Danh sách nhân sự (ăn từ chấm công):', e));
  }, []);

  useEffect(() => {
    const s = loadSheet(nam, thang);
    const periodKey = `${nam}-${thang}`;
    setPhanTramHoaHongKy(s.phanTramHoaHongKy);
    setRows(s.rows);
    setRevenueCache(null);
    loadedKyRef.current = periodKey;

    let cancelled = false;
    (async () => {
      setRevenueLoading(true);
      const { start, end } = khoangNgayCuaThang(nam, thang);
      let sourceRows = s.rows;
      try {
        const savedPayroll = await getPayrollBatch(thang, nam);
        if (cancelled || loadedKyRef.current !== periodKey) return;
        const savedRows = payrollBatchToInputRows(savedPayroll);
        if (savedRows.length > 0) {
          sourceRows = savedRows;
          const savedPercentItem = savedPayroll.find((item) =>
            hasPayrollDetail(item, 'phan_tram_hoa_hong')
          );
          if (savedPercentItem) {
            setPhanTramHoaHongKy(
              getPayrollBreakdown(savedPercentItem).phan_tram_hoa_hong
            );
          }
          setRows(savedRows);
        }
      } catch (e) {
        console.error('Lấy bảng lương đã lưu thất bại:', e);
      }
      try {
        const { rows: merged, payrollData } = await gopDoanhSoTheoBaoCao(sourceRows, nam, thang);
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setRows(merged);
        setRevenueCache(payrollData);
      } catch (e) {
        console.error('Lấy doanh số tháng tự động thất bại:', e);
      }
      try {
        const dongs = await getChamCongTrongKhoang(start, end);
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setChamDong(dongs as DongChamBuaNhap[]);
      } catch (e) {
        console.error('Tải chấm công tháng (ăn theo công):', e);
        if (!cancelled && loadedKyRef.current === periodKey) setChamDong([]);
      } finally {
        if (loadedKyRef.current === periodKey) {
          setRevenueLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nam, thang]);

  useEffect(() => {
    if (loadedKyRef.current !== `${nam}-${thang}`) return;
    try {
      const data: StoredSheet = { v: 1, phanTramHoaHongKy, rows };
      localStorage.setItem(`${LS_PREFIX}${nam}-${thang}`, JSON.stringify(data));
    } catch {
      // ignore quota
    }
  }, [rows, phanTramHoaHongKy, nam, thang]);

  const nhanTheoChuanTen = useMemo(() => {
    const m = new Map<
      string,
      { id: string; idNhanSu: string | null; luongCoBan: number; ngayVaoLam: string | null }
    >();
    for (const p of nhanList) {
      if (!p.ho_ten) continue;
      const raw = p.luong_co_ban;
      const luongCoBan =
        raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
      m.set(chuanHoaTenSoSanh(p.ho_ten), {
        id: p.id,
        idNhanSu: p.id_nhan_su ? String(p.id_nhan_su).trim() : null,
        luongCoBan,
        ngayVaoLam: ngayIsoTuNhanSu(p),
      });
    }
    return m;
  }, [nhanList]);

  /** LCB và ngày bắt đầu làm: khi khớp hồ sơ Nhân sự lấy từ đó (LCB + ngày vào làm). */
  useEffect(() => {
    if (nhanTheoChuanTen.size === 0) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        const meta = nhanTheoChuanTen.get(chuanHoaTenSoSanh(r.hoTen));
        if (!meta) return r;
        const patch: Partial<BangLuongChamCongInput> = {};
        const lcb = meta.luongCoBan;
        if (Math.abs((r.luongCoBan ?? 0) - lcb) >= 0.005) patch.luongCoBan = lcb;
        const ngayTuNs = meta.ngayVaoLam;
        if (ngayTuNs && r.ngayBatDauLam !== ngayTuNs) patch.ngayBatDauLam = ngayTuNs;
        if (Object.keys(patch).length === 0) return r;
        changed = true;
        return { ...r, ...patch };
      });
      return changed ? next : prev;
    });
  }, [nhanTheoChuanTen, rows]);

  const withKetQua = useMemo(
    () =>
      rows.map((r) => {
        const nhanMeta = nhanTheoChuanTen.get(chuanHoaTenSoSanh(r.hoTen));
        const nhanId = nhanMeta?.id;
        const idNhanSu = nhanMeta?.idNhanSu ?? undefined;
        const b = demSoBuaAnTachTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu);
        const c = demSoNgayCongTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu);
        const gTcTuCham =
          chamDong.length > 0
            ? demGioTangCaTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu)
            : undefined;
        return {
          input: r,
          gTcTuCham,
          kq: tinhMotDong(r, nam, thang, {
            phanTramHoaHongTheoKy: phanTramHoaHongKy,
            soBuaAnTheoChamCon: chamDong.length > 0 ? b.soBuaCoBan : undefined,
            soBuaAnTangCaTheoChamCon: chamDong.length > 0 ? b.soBuaTangCa : undefined,
            soNgayCongTheoChamCon: c,
            soGioTangCaTheoChamCon: gTcTuCham,
          }),
        };
      }),
    [rows, nam, thang, phanTramHoaHongKy, chamDong, nhanTheoChuanTen]
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<BangLuongChamCongInput>) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    []
  );

  const setNum = useCallback(
    (id: string, key: NumKey, raw: string) => {
      const n = parseFloat(raw.replace(/,/g, ''));
      updateRow(id, { [key]: Number.isFinite(n) ? n : 0 } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const setTien = useCallback(
    (id: string, key: 'luongCoBan' | 'tongDoanhThu' | 'phuCapTroNgoai', raw: string) => {
      updateRow(id, { [key]: parseTienNhap(raw) } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const capNhatDoanhSoTuPhieuBan = useCallback(async () => {
    setRevenueLoading(true);
    const { start, end } = khoangNgayCuaThang(nam, thang);
    try {
      const { rows: next, payrollData } = await gopDoanhSoTheoBaoCao(rows, nam, thang);
      setRows(next);
      setRevenueCache(payrollData);
    } catch (e) {
      console.error(e);
      window.alert('Không lấy được doanh số từ hệ thống. Kiểm tra mạng / đăng nhập / bán hàng.');
    }
    try {
      const dongs = await getChamCongTrongKhoang(start, end);
      setChamDong(dongs as DongChamBuaNhap[]);
    } catch (e) {
      console.error(e);
    } finally {
      setRevenueLoading(false);
    }
  }, [rows, nam, thang]);

  const taoNhanh = useCallback(async () => {
    const hasData = rows.some(
      (r) =>
        (r.hoTen || '').trim() !== '' ||
        r.luongCoBan > 0 ||
        r.tongDoanhThu > 0
    );
    if (hasData) {
      const ok = window.confirm(
        'Thay thế toàn bộ dòng hiện tại bằng tất cả nhân viên trong danh sách nhân sự?'
      );
      if (!ok) return;
    }
    setQuickLoading(true);
    try {
      const list = await getPersonnel();
      const newRows: BangLuongChamCongInput[] = list.map((p) => {
        const raw = p.luong_co_ban;
        const luongCoBan =
          raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
        return {
          ...emptyRow(),
          id: newId(),
          hoTen: p.ho_ten,
          luongCoBan,
          ngayBatDauLam:
            ngayIsoTuNhanSu(p) ?? (p.created_at ? p.created_at.slice(0, 10) : ''),
        };
      });
      const { rows: merged, payrollData } = await gopDoanhSoTheoBaoCao(newRows, nam, thang);
      setRows(merged);
      setRevenueCache(payrollData);
      const { start, end } = khoangNgayCuaThang(nam, thang);
      const d = await getChamCongTrongKhoang(start, end);
      setChamDong(d as DongChamBuaNhap[]);
    } catch (e) {
      console.error(e);
      window.alert('Không tải danh sách hoặc dữ liệu. Kiểm tra đăng nhập Supabase / mạng.');
    } finally {
      setQuickLoading(false);
    }
  }, [rows, nam, thang]);

  const removeRow = useCallback((id: string) => {
    if (!window.confirm('Xóa dòng này khỏi bảng lương tháng đang chọn?')) return;
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [emptyRow()];
    });
  }, []);

  const saveAndOpenPayroll = useCallback(async () => {
    try {
      setSavingPayroll(true);
      await syncPayrollFromAttendance(thang, nam, undefined, {
        rows,
        phanTramHoaHongTheoKy: phanTramHoaHongKy,
      });
      navigate('/tien-luong/bang-luong');
    } catch (e) {
      console.error('Lưu bảng lương chấm công:', e);
      const detail =
        typeof e === 'object' && e !== null && 'message' in e
          ? String(e.message)
          : 'Lỗi không xác định';
      window.alert(`Không thể lưu bảng lương.\nChi tiết: ${detail}`);
    } finally {
      setSavingPayroll(false);
    }
  }, [nam, navigate, phanTramHoaHongKy, rows, thang]);

  const moChiTietDon = useCallback(
    async (hoTen: string) => {
      const ten = hoTen.trim();
      if (!ten) return;
      setOrdersModal({ hoTen: ten, orders: [], loading: true });
      try {
        let data = revenueCache;
        if (!data) {
          data = await loadPayrollRevenueData(nam, thang);
          setRevenueCache(data);
        }
        const orders = layDonTheoHoTen(ten, data, nhanTheoChuanTen);
        setOrdersModal({ hoTen: ten, orders, loading: false });
      } catch (e) {
        console.error(e);
        setOrdersModal(null);
        window.alert('Không tải được danh sách đơn hàng.');
      }
    },
    [revenueCache, nam, thang, nhanTheoChuanTen]
  );

  const thCell = (short: string, full: string) => (
    <th
      className="sticky top-0 z-[1] bg-muted/80 backdrop-blur border-b border-border px-2.5 py-3 text-left text-xs sm:text-sm font-semibold text-muted-foreground whitespace-nowrap"
      title={full}
    >
      {short}
    </th>
  );

  return (
    <div className="flex flex-col h-full min-h-0 p-2 md:p-3 gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Table2 className="w-6 h-6 text-primary" />
            Bảng lương chấm công
          </h1>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 w-full min-w-0 sm:w-auto sm:max-w-[min(100%,42rem)] sm:ml-auto sm:items-end">
          <div className="flex flex-nowrap items-center gap-1.5 min-w-0 w-full sm:justify-end overflow-x-auto py-0.5">
            <div
              className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-2.5 py-1.5"
              title="Chọn tháng và năm kỳ lương (khớp tháng/năm cột ngay trên đơn khi lấy Doanh số)"
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Kỳ</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Tháng</span>
                <select
                  className="bg-background text-sm font-medium outline-none rounded border border-border/60 px-1.5 py-1 min-w-[3rem]"
                  value={thang}
                  onChange={(e) => setThang(Number(e.target.value))}
                  aria-label="Tháng kỳ"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Năm</span>
                <select
                  className="bg-background text-sm font-medium outline-none rounded border border-border/60 px-1.5 py-1 min-w-[4.5rem]"
                  value={nam}
                  onChange={(e) => setNam(Number(e.target.value))}
                  aria-label="Năm kỳ"
                >
                  {danhSachNamKy(now.getFullYear(), nam).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-primary/5 border-primary/20 px-2 py-1"
              title="% hoa hồng tháng (cùng kỳ), áp cả bảng"
            >
              <span className="text-xs text-muted-foreground">HH</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-11 bg-background border border-border/60 rounded px-1 py-1 text-sm font-mono text-right"
                value={String(phanTramHoaHongKy)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value.replace(/,/g, ''));
                  setPhanTramHoaHongKy(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                }}
                title="% hoa hồng tháng (cùng kỳ đang chọn)"
                aria-label="% hoa hồng tháng"
              />
              <span className="text-sm font-medium">%</span>
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-2 min-w-0 w-full sm:justify-end overflow-x-auto py-0.5 -mx-0.5 px-0.5">
            <button
              type="button"
              onClick={saveAndOpenPayroll}
              disabled={savingPayroll || revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-2 hover:bg-emerald-100"
              title="Lưu đầy đủ các khoản vào Supabase rồi mở bảng lương chính"
            >
              {savingPayroll ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeDollarSign className="w-4 h-4" />}
              {savingPayroll ? 'Đang lưu' : 'Lưu & mở bảng lương'}
            </button>
            <button
              type="button"
              onClick={capNhatDoanhSoTuPhieuBan}
              disabled={revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-primary/10 border-primary/30 text-primary text-sm font-medium px-3 py-2 hover:bg-primary/15 disabled:opacity-50"
              title="Đơn có ngày (cột ngay) thuộc đúng tháng/năm kỳ; cộng tong_tien theo Họ tên (nhan_vien_id, nhiều tên cách phẩy → chia đều). Dòng không Họ tên → doanh số 0."
            >
              {revenueLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Doanh số
            </button>
            <button
              type="button"
              onClick={taoNhanh}
              disabled={quickLoading || revenueLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background text-sm font-medium px-3 py-2 hover:bg-muted/50 disabled:opacity-50"
            >
              {quickLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Tạo nhanh
            </button>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Thêm dòng
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-card/30 overflow-hidden">
        <div className="flex-1 min-h-[min(75vh,56rem)] overflow-auto">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-[2] bg-muted/80 backdrop-blur border-b border-r border-border px-2.5 py-3 text-left text-xs sm:text-sm font-semibold w-10">
                  #
                </th>
                {thCell('Họ tên', 'Tên nhân viên')}
                {thCell(
                  'Doanh số tháng',
                  'Tổng thành tiền đơn trong tháng kỳ — dùng tính hoa hồng'
                )}
                {thCell('Loại', 'Chính thức / thời vụ')}
                {thCell('Lương', 'Lương cơ bản tháng lấy từ hồ sơ nhân sự')}
                {thCell(
                  'Ngày công',
                  '28 ngày = 1 tháng lương. Số công từ chấm công + ô « + » nhập thêm ngày làm thêm. Tiền = (LCB ÷ 28) × tổng ngày công.'
                )}
                {thCell('Chuyên cần', 'Đủ 28 công trong kỳ được hưởng 200.000đ')}
                {thCell(
                  'Tăng ca',
                  `Tiền tăng ca = giờ tăng ca × lương giờ × ${1.5} (tối đa 25h/tháng, chỉ nhân viên chính thức)`
                )}
                {thCell('Xăng xe điện thoại', 'Điện thoại 200.000đ + xăng xe/đi lại 300.000đ')}
                {thCell('Thâm niên', '50.000đ × số tháng làm việc, tối đa 600.000đ')}
                {thCell('Trọ ngoài', 'Phụ cấp trọ ngoài (nhập theo từng nhân viên)')}
                {thCell('Tiền ăn', 'Số bữa ăn thường × 30.000đ (từ chấm công)')}
                {thCell('Tiền ăn tăng ca', 'Bữa ăn bổ sung khi checkout sau 19:40 × 30.000đ')}
                {thCell('Tiền % hoa hồng', 'Doanh số tháng × % hoa hồng (ô HH ở trên)')}
                {thCell('Tổng lương', 'Tổng các khoản thu nhập')}
                {thCell('Ghi chú', 'Cảnh báo')}
                <th className="sticky top-0 right-0 z-[2] bg-muted/80 backdrop-blur border-b border-l border-border px-2 py-3 text-center text-xs sm:text-sm font-semibold text-muted-foreground whitespace-nowrap w-14">
                  Xóa
                </th>
              </tr>
            </thead>
            <tbody>
              {withKetQua.map((x, i) => {
                const { input, kq, gTcTuCham } = x;
                const khopNhanSu = Boolean(nhanTheoChuanTen.get(chuanHoaTenSoSanh(input.hoTen)));
                const isEditingName = editingNameId === input.id;
                return (
                  <tr
                    key={input.id}
                    className={clsx('border-b border-border/60 hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}
                  >
                    <td className="sticky left-0 z-[1] bg-card/90 border-r border-border px-2.5 py-2.5 text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1.5 min-w-[16rem]">
                      <input
                        className={clsx(
                          'w-full min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2.5 py-2',
                          !isEditingName &&
                            input.hoTen.trim() &&
                            'cursor-pointer text-primary font-medium hover:bg-primary/5 hover:border-primary/30'
                        )}
                        readOnly={!isEditingName}
                        title={
                          isEditingName
                            ? 'Nhập họ tên'
                            : input.hoTen.trim()
                              ? 'Click để xem đơn hàng tính doanh số. Double-click để sửa tên.'
                              : 'Double-click để nhập họ tên'
                        }
                        value={input.hoTen}
                        onChange={(e) => updateRow(input.id, { hoTen: e.target.value })}
                        onClick={() => {
                          if (isEditingName) return;
                          if (!input.hoTen.trim()) {
                            setEditingNameId(input.id);
                            return;
                          }
                          void moChiTietDon(input.hoTen);
                        }}
                        onDoubleClick={() => setEditingNameId(input.id)}
                        onBlur={() => setEditingNameId(null)}
                      />
                    </td>
                    <td className="px-2 py-1.5 bg-primary/5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-32 min-w-0 min-h-10 text-sm bg-transparent border border-primary/30 rounded-md px-2 py-1.5 text-right font-mono"
                        title="Tổng tong_tien đơn trong kỳ (theo Họ tên). Bấm « Doanh số » để lấy từ hệ thống."
                        value={formatTienNhap(input.tongDoanhThu)}
                        onChange={(e) => setTien(input.id, 'tongDoanhThu', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="w-[7.5rem] min-h-10 text-sm bg-background border border-border/60 rounded-md px-1.5 py-1.5"
                        value={input.loai}
                        onChange={(e) => updateRow(input.id, { loai: e.target.value as LoaiNhanVien })}
                      >
                        <option value="chinh_thuc">Chính thức</option>
                        <option value="thoi_vu">Thời vụ</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className={clsx(
                          'w-32 min-w-0 min-h-10 text-sm border border-border/60 rounded-md px-2 py-1.5 text-right font-mono',
                          khopNhanSu ? 'bg-muted/40 text-muted-foreground cursor-not-allowed' : 'bg-transparent'
                        )}
                        title={
                          khopNhanSu
                            ? 'Lương cơ bản lấy từ Nhân sự; sửa tại trang Nhân sự.'
                            : 'Nhập LCB thủ công khi chưa có hồ sơ nhân sự trùng tên'
                        }
                        readOnly={khopNhanSu}
                        value={formatTienNhap(input.luongCoBan)}
                        onChange={(e) => setTien(input.id, 'luongCoBan', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 min-w-[9rem]">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="tabular-nums font-medium text-sm"
                          title="Ngày công từ chấm công"
                        >
                          {kq.soNgayCongTuCham}
                        </span>
                        <span className="text-muted-foreground text-xs">+</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-10 min-h-8 text-sm bg-transparent border border-border/60 rounded-md px-1 py-1 text-center font-mono"
                          title="Thêm số ngày làm thêm (cộng vào ngày công)"
                          value={String(input.soNgayCongThem ?? 0)}
                          onChange={(e) => setNum(input.id, 'soNgayCongThem', e.target.value)}
                        />
                      </div>
                      <div
                        className="text-right font-mono text-sm mt-1 whitespace-nowrap"
                        title={`(${formatVnd(kq.lcbHieuLuc)} ÷ 28) × ${kq.soNgayCongDung} ngày`}
                      >
                        {formatVnd(kq.tienTheoCong)}
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">
                      {formatVnd(kq.phuCapChuyenCan)}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={
                        gTcTuCham !== undefined
                          ? `${kq.gioTangCaApDung}h tăng ca (từ chấm công, sau ${GIO_RA_CHUAN_LABEL})`
                          : `${input.soGioTangCa}h tăng ca (nhập tay)`
                      }
                    >
                      {formatVnd(kq.luongTangCa)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">
                      {formatVnd(kq.phuCapXangDienThoai)}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={
                        input.ngayBatDauLam
                          ? `${kq.thangLamViec} tháng làm việc đến hết ${String(thang).padStart(2, '0')}/${nam}`
                          : 'Chưa có ngày vào làm'
                      }
                    >
                      {formatVnd(kq.phuCapThamNien)}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-28 min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                        title="Phụ cấp trọ ngoài"
                        value={formatTienNhap(input.phuCapTroNgoai ?? 0)}
                        onChange={(e) => setTien(input.id, 'phuCapTroNgoai', e.target.value)}
                      />
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={`${kq.soBuaAn - kq.soBuaAnTangCa} bữa × 30.000đ`}
                    >
                      {formatVnd(kq.tienAn)}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={`${kq.soBuaAnTangCa} bữa tăng ca × 30.000đ`}
                    >
                      {formatVnd(kq.tienAnTangCa)}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={`${kq.phanTramHoaHongApDung}% × ${formatVnd(input.tongDoanhThu)}`}
                    >
                      {formatVnd(kq.hoaHong)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-bold text-primary whitespace-nowrap text-sm">
                      {formatVnd(kq.tongCong)}
                    </td>
                    <td className="px-2.5 py-2.5 text-xs sm:text-sm text-amber-600 dark:text-amber-500 max-w-[200px]">
                      {kq.ghiChu}
                    </td>
                    <td className="sticky right-0 z-[1] bg-card/95 border-l border-border px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(input.id)}
                        className="inline-flex items-center justify-center gap-1 p-2 rounded-md text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20"
                        title="Xóa dòng"
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold">Xóa</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PersonnelRevenueOrdersModal
        isOpen={ordersModal !== null}
        onClose={() => setOrdersModal(null)}
        hoTen={ordersModal?.hoTen ?? ''}
        thang={thang}
        nam={nam}
        orders={ordersModal?.orders ?? []}
        loading={ordersModal?.loading ?? false}
      />
    </div>
  );
};

export default PayrollAttendanceSalaryPage;
