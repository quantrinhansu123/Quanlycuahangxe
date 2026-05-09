import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Loader2, Plus, Table2, Trash2, TrendingUp, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import { getChamCongTrongKhoang } from '../data/attendanceData';
import { getRevenueByPersonnel } from '../data/reportData';
import { removeVietnameseTones } from '../lib/utils';
import {
  demGioTangCaTheoDongCham,
  demSoBuaAnTheoDongCham,
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
 * Cập nhật cột doanh số từ Đơn hàng (`the_ban_hang`) trong tháng: tổng tiền theo chi tiết đơn (`the_ban_hang_ct`),
 * gán cho nhân viên trên đơn (cùng logic báo cáo doanh thu theo nhân sự).
 * Khớp theo tên; nếu trên đơn lưu UUID thì tra thêm theo `nhan_su` (mã = id chuỗi).
 */
async function gopDoanhSoTheoBaoCao(
  rows: BangLuongChamCongInput[],
  nam: number,
  thang: number
): Promise<BangLuongChamCongInput[]> {
  const { start, end } = khoangNgayCuaThang(nam, thang);
  const { personnel } = await getRevenueByPersonnel(start, end);
  const map = new Map<string, number>();
  for (const p of personnel) {
    const k = chuanHoaTenSoSanh(p.nhan_vien_name);
    map.set(k, (map.get(k) || 0) + p.total_revenue);
  }
  let nhanList: { id: string; ho_ten: string }[] = [];
  try {
    const list = await getPersonnel();
    nhanList = list
      .filter((n) => n.id)
      .map((n) => ({ id: n.id, ho_ten: n.ho_ten || '' }));
  } catch {
    // bỏ qua — vẫn map theo tên từ báo cáo
  }
  return rows.map((r) => {
    const kTen = chuanHoaTenSoSanh(r.hoTen);
    let rev = map.get(kTen) ?? 0;
    if (rev === 0 && nhanList.length > 0) {
      const ns = nhanList.find((x) => chuanHoaTenSoSanh(x.ho_ten) === kTen);
      if (ns) rev = map.get(chuanHoaTenSoSanh(ns.id)) ?? 0;
    }
    return { ...r, tongDoanhThu: rev };
  });
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
    soNgayLamTaiQuan: 0,
    soNgayKhongLamTaiQuan: 0,
    soNgayTangCaAn: 0,
    soGioTangCa: 0,
    tongDoanhThu: 0,
    phanTramHoaHong: 0,
    ngayBatDauLam: '',
    thuongKhac: 0,
    khoanTru: 0,
  };
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
  'luongCoBan' | 'soGioTangCa' | 'tongDoanhThu'
>;

const PayrollAttendanceSalaryPage: React.FC = () => {
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
  const [chamDong, setChamDong] = useState<DongChamBuaNhap[]>([]);
  const [nhanList, setNhanList] = useState<NhanSu[]>([]);
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
    loadedKyRef.current = periodKey;

    let cancelled = false;
    (async () => {
      setRevenueLoading(true);
      const { start, end } = khoangNgayCuaThang(nam, thang);
      try {
        const merged = await gopDoanhSoTheoBaoCao(s.rows, nam, thang);
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setRows(merged);
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
        const b = demSoBuaAnTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu);
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
            soBuaAnTheoChamCon: b,
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
    (id: string, key: 'luongCoBan' | 'tongDoanhThu', raw: string) => {
      updateRow(id, { [key]: parseTienNhap(raw) } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, [nam, thang]);

  const capNhatDoanhSoTuPhieuBan = useCallback(async () => {
    setRevenueLoading(true);
    const { start, end } = khoangNgayCuaThang(nam, thang);
    try {
      const next = await gopDoanhSoTheoBaoCao(rows, nam, thang);
      setRows(next);
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
      let newRows: BangLuongChamCongInput[] = list.map((p) => {
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
      newRows = await gopDoanhSoTheoBaoCao(newRows, nam, thang);
      setRows(newRows);
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
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

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
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">Kỳ</span>
              <select
                className="bg-transparent text-sm font-medium outline-none min-w-0"
                value={thang}
                onChange={(e) => setThang(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground/50 text-xs">/</span>
              <select
                className="bg-transparent text-sm font-medium outline-none w-[4rem] min-w-0"
                value={nam}
                onChange={(e) => setNam(Number(e.target.value))}
              >
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
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
              onClick={capNhatDoanhSoTuPhieuBan}
              disabled={revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-primary/10 border-primary/30 text-primary text-sm font-medium px-3 py-2 hover:bg-primary/15 disabled:opacity-50"
              title="Lấy tổng doanh thu từ Đơn hàng trong tháng (the_ban_hang + chi tiết), ghép theo tên NV trên đơn"
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium px-3 py-2 hover:opacity-90"
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
                {thCell('Loại', 'Chính thức / thời vụ')}
                {thCell('LCB', 'Lương cơ bản (tháng)')}
                {thCell(
                  'Thâm niên',
                  'Số tháng làm việc đến hết tháng kỳ đang chọn, từ ngày bắt đầu làm trên dòng (ưu tiên Ngày vào làm trong Nhân sự khi khớp tên). Dùng để cộng vào LCB và phụ cấp thâm niên.'
                )}
                {thCell('Công', 'Số ngày có bản ghi chấm công (có check-in) trong tháng đang chọn')}
                {thCell(
                  'Lương theo công',
                  'Lương theo công = lương ngày × số công. Lương ngày = (LCB + cộng thâm niên vào LCB) ÷ 28 (bảng 28/8), không phải LCB tháng × công thô'
                )}
                {thCell('Tăng ca', 'Số giờ tăng ca')}
                {thCell(
                  'Doanh số tháng',
                  'Tổng thành tiền đơn hàng trong kỳ (bảng Đơn hàng + chi tiết); hoa hồng = × % ở trên'
                )}
                {thCell('Bữa', 'Số bữa ăn theo bảng chấm công tháng')}
                {thCell('Ăn', 'Tiền ăn = số bữa × giá 1 bữa (từ chấm công)')}
                {thCell('Phụ cấp chuyên cần', 'Mức phụ cấp chuyên cần trong bảng lương')}
                {thCell('Phụ cấp xăng và điện thoại', 'Phụ cấp xăng xe và điện thoại')}
                {thCell('Phụ cấp thâm niên tháng', 'Phụ cấp thâm niên theo số tháng làm việc')}
                {thCell('Tiền hoa hồng tháng', 'Doanh số tháng × phần trăm hoa hồng tháng (ô % HH ở trên)')}
                {thCell('Tổng', 'Tổng cộng')}
                {thCell('Ghi chú', 'Cảnh báo')}
                <th className="sticky top-0 z-[1] bg-muted/80 w-11 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {withKetQua.map((x, i) => {
                const { input, kq, gTcTuCham } = x;
                const khopNhanSu = Boolean(nhanTheoChuanTen.get(chuanHoaTenSoSanh(input.hoTen)));
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
                        className="w-full min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2.5 py-2"
                        value={input.hoTen}
                        onChange={(e) => updateRow(input.id, { hoTen: e.target.value })}
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
                            ? 'Lương cơ bản lấy từ Nhân sự (cột Lương cơ bản); sửa tại trang Nhân sự.'
                            : 'Nhập LCB thủ công khi chưa có hồ sơ nhân sự trùng tên'
                        }
                        readOnly={khopNhanSu}
                        value={formatTienNhap(input.luongCoBan)}
                        onChange={(e) => setTien(input.id, 'luongCoBan', e.target.value)}
                      />
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-center tabular-nums text-muted-foreground whitespace-nowrap w-12 text-sm"
                      title={
                        input.ngayBatDauLam
                          ? `Số tháng làm việc đến hết ${String(thang).padStart(2, '0')}/${nam}. Mốc: ${input.ngayBatDauLam}`
                          : 'Chưa có ngày bắt đầu làm — khớp Nhân sự (Ngày vào làm) hoặc bổ sung trong dữ liệu'
                      }
                    >
                      {(input.ngayBatDauLam || '').trim() ? kq.thangLamViec : '—'}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-center tabular-nums font-medium text-foreground text-sm"
                      title="Số ngày có chấm công (cùng tháng/kỳ)"
                    >
                      {kq.soNgayCongDung}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm" title="(LCB hiệu lực ÷ 28) × công">
                      {formatVnd(kq.tienTheoCong)}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-[4.5rem] min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                        title={
                          gTcTuCham !== undefined
                            ? 'Giờ tăng ca từ chấm công (sau 19:00; mỗi ngày giờ ra muộn nhất; khớp tên / mã NV)'
                            : 'Nhập giờ tăng ca thủ công khi chưa có dữ liệu chấm công tháng'
                        }
                        readOnly={gTcTuCham !== undefined}
                        value={String(gTcTuCham !== undefined ? gTcTuCham : input.soGioTangCa)}
                        onChange={(e) => setNum(input.id, 'soGioTangCa', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-32 min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                        value={formatTienNhap(input.tongDoanhThu)}
                        onChange={(e) => setTien(input.id, 'tongDoanhThu', e.target.value)}
                      />
                    </td>
                    <td className="px-2.5 py-2.5 text-center tabular-nums text-muted-foreground text-sm">
                      {kq.soBuaAn}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">{formatVnd(kq.tienAn)}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">
                      {formatVnd(kq.phuCapChuyenCan)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">
                      {formatVnd(kq.phuCapXangDienThoai)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">
                      {formatVnd(kq.phuCapThamNien)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm">{formatVnd(kq.hoaHong)}</td>
                    <td className="px-2.5 py-2.5 text-right font-bold text-primary whitespace-nowrap text-sm">
                      {formatVnd(kq.tongCong)}
                    </td>
                    <td className="px-2.5 py-2.5 text-xs sm:text-sm text-amber-600 dark:text-amber-500 max-w-[200px]">
                      {kq.ghiChu}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(input.id)}
                        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollAttendanceSalaryPage;
