import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Loader2, Plus, Table2, Trash2, TrendingUp, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import { getChamCongTrongKhoang } from '../data/attendanceData';
import { getRevenueByPersonnel } from '../data/reportData';
import { removeVietnameseTones } from '../lib/utils';
import {
  ATTENDANCE_SALARY,
  demSoBuaAnTheoDongCham,
  demSoNgayCongTheoDongCham,
  soNgayTrongThangDuongLich,
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

/** So khớp tên bảng lương với tên ghi trên phiếu bán (bỏ dấu, thường, gộp khoảng trắng). */
function chuanHoaTenSoSanh(s: string): string {
  return removeVietnameseTones(s.trim().toLowerCase()).replace(/\s+/g, ' ');
}

/**
 * Cập nhật cột doanh số từ tổng doanh thu theo NV trong báo cáo (phiếu bán tháng đó,
 * cùng nguồn với Báo cáo doanh thu / theo nhân sự).
 * Khớp theo tên; nếu trên phiếu lưu UUID thì tra thêm theo `nhan_su` (mã = id chuỗi).
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

  const nhanIdTheoChuanTen = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of nhanList) {
      if (p.ho_ten) m.set(chuanHoaTenSoSanh(p.ho_ten), p.id);
    }
    return m;
  }, [nhanList]);

  const withKetQua = useMemo(
    () =>
      rows.map((r) => {
        const nhanId = nhanIdTheoChuanTen.get(chuanHoaTenSoSanh(r.hoTen));
        const b = demSoBuaAnTheoDongCham(chamDong, r.hoTen, nhanId);
        const c = demSoNgayCongTheoDongCham(chamDong, r.hoTen, nhanId);
        return {
          input: r,
          kq: tinhMotDong(r, nam, thang, {
            phanTramHoaHongTheoKy: phanTramHoaHongKy,
            soBuaAnTheoChamCon: b,
            soNgayCongTheoChamCon: c,
          }),
        };
      }),
    [rows, nam, thang, phanTramHoaHongKy, chamDong, nhanIdTheoChuanTen]
  );

  const soNgayThang = soNgayTrongThangDuongLich(nam, thang);

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
      let newRows: BangLuongChamCongInput[] = list.map((p) => ({
        ...emptyRow(),
        id: newId(),
        hoTen: p.ho_ten,
        ngayBatDauLam: p.created_at ? p.created_at.slice(0, 10) : '',
      }));
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
      className="sticky top-0 z-[1] bg-muted/80 backdrop-blur border-b border-border px-1.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground whitespace-nowrap"
      title={full}
    >
      {short}
    </th>
  );

  return (
    <div className="flex flex-col h-full min-h-0 p-3 md:p-4 gap-3">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Table2 className="w-5 h-5 text-primary" />
            Bảng lương chấm công
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 max-w-2xl">
            <strong>Số ngày công</strong> và <strong>doanh số tháng</strong> theo kỳ; cột Công = số ngày (không
            trùng) có check-in trên bảng chấm công. Bấm <strong>Doanh số</strong> để lấy doanh thu từ phiếu bán. Hoa
            hồng = doanh số × % tháng. Quy ước: ngày lương = LCB ÷ {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG}. Tháng có{' '}
            <strong>{soNgayThang} ngày dương lịch</strong> (bảng lương 28/8). <strong>Tiền ăn</strong> từ chấm công: mỗi
            ngày có
            check-in — 2 bữa tại cơ sở hoặc 1 bữa nếu vị trí gợi ý “từ xa/ở nhà”; thêm 1 bữa khi
            checkout ≥ 19:00. Giá {formatVnd(ATTENDANCE_SALARY.GIA_MOT_BUA_AN)}/bữa. Tăng ca lương: hệ
            số{' '}
            {ATTENDANCE_SALARY.HE_SO_TANG_CA * 100}%, tối đa {ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG}h, chỉ thợ
            chính thức; <strong>tiền tăng ca</strong> (theo cột H TC) cộng vào <strong>Tổng</strong>. Cột <strong>PC
            thâm niên</strong> dựa trên thời gian làm: khi <strong>Tạo nhanh</strong> hệ thống lấy ngày tạo hồ sơ nhân
            sự làm mốc.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0 w-full min-w-0 sm:w-auto sm:max-w-[min(100%,42rem)] sm:ml-auto sm:items-end">
          <div className="flex flex-nowrap items-center gap-1.5 min-w-0 w-full sm:justify-end overflow-x-auto py-0.5">
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground shrink-0">Kỳ</span>
              <select
                className="bg-transparent text-[11px] font-medium outline-none min-w-0"
                value={thang}
                onChange={(e) => setThang(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground/50 text-[10px]">/</span>
              <select
                className="bg-transparent text-[11px] font-medium outline-none w-[3.2rem] min-w-0"
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
              className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-primary/5 border-primary/20 px-1.5 py-0.5"
              title="% hoa hồng tháng (cùng kỳ), áp cả bảng"
            >
              <span className="text-[10px] text-muted-foreground">HH</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-9 bg-background border border-border/60 rounded px-0.5 py-0.5 text-[11px] font-mono text-right"
                value={String(phanTramHoaHongKy)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value.replace(/,/g, ''));
                  setPhanTramHoaHongKy(Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                }}
                title="% hoa hồng tháng (cùng kỳ đang chọn)"
                aria-label="% hoa hồng tháng"
              />
              <span className="text-[11px] font-medium">%</span>
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 min-w-0 w-full sm:justify-end overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
            <button
              type="button"
              onClick={capNhatDoanhSoTuPhieuBan}
              disabled={revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-primary/10 border-primary/30 text-primary text-[11px] font-medium px-2 py-1 hover:bg-primary/15 disabled:opacity-50"
              title="Lấy tổng doanh thu từ phiếu bán trong tháng, ghép theo tên (khớp tên trên bảng với tên ghi ở phiếu)"
            >
              {revenueLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
              Doanh số
            </button>
            <button
              type="button"
              onClick={taoNhanh}
              disabled={quickLoading || revenueLoading}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background text-[11px] font-medium px-2 py-1 hover:bg-muted/50 disabled:opacity-50"
            >
              {quickLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Tạo nhanh
            </button>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium px-2 py-1 hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm dòng
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card/30 overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="w-max min-w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-[2] bg-muted/80 backdrop-blur border-b border-r border-border px-1.5 py-1.5 text-left text-[10px] font-semibold w-8">
                  #
                </th>
                {thCell('Họ tên', 'Tên nhân viên')}
                {thCell('Loại', 'Chính thức / thời vụ')}
                {thCell('LCB', 'Lương cơ bản (tháng)')}
                {thCell('Công', 'Số ngày có bản ghi chấm công (có check-in) trong tháng đang chọn')}
                {thCell(
                  'Lương theo công',
                  'Lương theo công = lương ngày × số công. Lương ngày = (LCB + cộng thâm niên vào LCB) ÷ 28 (bảng 28/8), không phải LCB tháng × công thô'
                )}
                {thCell('H TC', 'Số giờ tăng ca')}
                {thCell('Doanh số tháng', 'Doanh số / doanh thu tháng (cùng kỳ) — hoa hồng = × % ở trên')}
                {thCell('Bữa', 'Số bữa ăn theo bảng chấm công tháng')}
                {thCell('Ăn', 'Tiền ăn = số bữa × giá 1 bữa (từ chấm công)')}
                {thCell('PCcc', 'Phụ cấp chuyên cần')}
                {thCell('PCxăng', 'Phụ cấp xăng/ĐT')}
                {thCell('PCtn', 'Phụ cấp thâm niên tháng')}
                {thCell('Hoa hồng', 'Doanh số tháng × % hoa hồng tháng')}
                {thCell('Tổng', 'Tổng cộng')}
                {thCell('Ghi chú', 'Cảnh báo')}
                <th className="sticky top-0 z-[1] bg-muted/80 w-8 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {withKetQua.map((x, i) => {
                const { input, kq } = x;
                return (
                  <tr
                    key={input.id}
                    className={clsx('border-b border-border/60 hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}
                  >
                    <td className="sticky left-0 z-[1] bg-card/90 border-r border-border px-1.5 py-1 text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-1 py-0.5 min-w-[14rem]">
                      <input
                        className="w-full min-w-0 min-h-[1.75rem] bg-transparent border border-border/60 rounded px-1.5 py-0.5"
                        value={input.hoTen}
                        onChange={(e) => updateRow(input.id, { hoTen: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        className="w-[84px] bg-background border border-border/60 rounded px-0.5 py-0.5"
                        value={input.loai}
                        onChange={(e) => updateRow(input.id, { loai: e.target.value as LoaiNhanVien })}
                      >
                        <option value="chinh_thuc">Chính thức</option>
                        <option value="thoi_vu">Thời vụ</option>
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-28 min-w-0 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                        value={formatTienNhap(input.luongCoBan)}
                        onChange={(e) => setTien(input.id, 'luongCoBan', e.target.value)}
                      />
                    </td>
                    <td
                      className="px-1.5 py-1 text-center tabular-nums font-medium text-foreground"
                      title="Số ngày có chấm công (cùng tháng/kỳ)"
                    >
                      {kq.soNgayCongDung}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap" title="(LCB hiệu lực ÷ 28) × công">
                      {formatVnd(kq.tienTheoCong)}
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-16 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                        value={String(input.soGioTangCa)}
                        onChange={(e) => setNum(input.id, 'soGioTangCa', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-28 min-w-0 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                        value={formatTienNhap(input.tongDoanhThu)}
                        onChange={(e) => setTien(input.id, 'tongDoanhThu', e.target.value)}
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums text-muted-foreground">
                      {kq.soBuaAn}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">{formatVnd(kq.tienAn)}</td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">
                      {formatVnd(kq.phuCapChuyenCan)}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">
                      {formatVnd(kq.phuCapXangDienThoai)}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">
                      {formatVnd(kq.phuCapThamNien)}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">{formatVnd(kq.hoaHong)}</td>
                    <td className="px-1.5 py-1 text-right font-bold text-primary whitespace-nowrap">
                      {formatVnd(kq.tongCong)}
                    </td>
                    <td className="px-1.5 py-1 text-[10px] text-amber-600 dark:text-amber-500 max-w-[140px]">
                      {kq.ghiChu}
                    </td>
                    <td className="px-0.5 py-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(input.id)}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
