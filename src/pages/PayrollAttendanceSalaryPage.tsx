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
import {
  DEFAULT_MEAL_UNIT_PRICE,
  getDefaultMealUnitPrice,
  saveDefaultMealUnitPrice,
} from '../data/payrollSettingsData';
import { useAuth } from '../context/AuthContext';

const LS_PREFIX = 'payrollChamCongLuongV2:';
const LS_PREFIX_LEGACY = 'payrollChamCongLuongV1:';
const DEFAULT_PCT_HH = 2;
const LOCKED_PAYROLL_STATUSES = new Set(['Đã duyệt', 'Đã chi trả']);

function normalizeCommissionPercent(value: unknown, fallback = DEFAULT_PCT_HH): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
}

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

function emptyRow(phanTramHoaHong = DEFAULT_PCT_HH): BangLuongChamCongInput {
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
    phuCapChuyenCan: null,
    phuCapXangDienThoai: null,
    phuCapThamNien: null,
    tienAn: null,
    tienAnTangCa: null,
    soBuaAnThuong: null,
    soBuaAnTangCa: null,
    soGioTangCa: 0,
    tongDoanhThu: 0,
    phanTramHoaHong: normalizeCommissionPercent(phanTramHoaHong),
    ngayBatDauLam: '',
    thuongKhac: 0,
    ghiChuThuongThang: '',
    khoanTru: 0,
  };
}

function payrollBatchToInputRows(items: BangLuong[]): BangLuongChamCongInput[] {
  return items.flatMap((item) => {
    if (!item.nhan_su?.ho_ten) return [];
    const detail = getPayrollBreakdown(item);
    const hasMealSnapshot =
      hasPayrollDetail(item, 'so_bua_an_thuong') &&
      hasPayrollDetail(item, 'so_bua_an_tang_ca') &&
      hasPayrollDetail(item, 'don_gia_tien_an');
    return [{
      ...emptyRow(),
      id: item.nhan_su_id,
      hoTen: item.nhan_su.ho_ten,
      loai: detail.loai_nhan_vien === 2 ? 'thoi_vu' : 'chinh_thuc',
      luongCoBan: Number(item.luong_co_ban) || 0,
      soNgayCong: Number(item.ngay_cong_thuc_te) || 0,
      soNgayCongThem: detail.ngay_cong_them,
      phuCapTroNgoai: detail.phu_cap_tro_ngoai,
      phuCapChuyenCan:
        detail.dieu_chinh_chuyen_can >= 0
          ? detail.dieu_chinh_chuyen_can
          : null,
      phuCapXangDienThoai:
        detail.dieu_chinh_xang_dien_thoai >= 0
          ? detail.dieu_chinh_xang_dien_thoai
          : null,
      phuCapThamNien:
        detail.dieu_chinh_tham_nien >= 0
          ? detail.dieu_chinh_tham_nien
          : null,
      tienAn:
        hasMealSnapshot
          ? detail.dieu_chinh_tien_an >= 0
            ? detail.dieu_chinh_tien_an
            : null
          : detail.tien_an,
      tienAnTangCa:
        hasMealSnapshot
          ? detail.dieu_chinh_tien_an_tang_ca >= 0
            ? detail.dieu_chinh_tien_an_tang_ca
            : null
          : detail.tien_an_tang_ca,
      soBuaAnThuong: hasMealSnapshot ? detail.so_bua_an_thuong : null,
      soBuaAnTangCa: hasMealSnapshot ? detail.so_bua_an_tang_ca : null,
      soGioTangCa: detail.so_gio_tang_ca,
      tongDoanhThu: Number(item.doanh_so) || 0,
      phanTramHoaHong: hasPayrollDetail(item, 'phan_tram_hoa_hong')
        ? normalizeCommissionPercent(detail.phan_tram_hoa_hong)
        : DEFAULT_PCT_HH,
      ngayBatDauLam: item.nhan_su.ngay_vao_lam?.slice(0, 10) ?? '',
      thuongKhac: detail.thuong_thang,
      ghiChuThuongThang: item.ghi_chu ?? '',
    }];
  });
}

type StoredSheet = {
  v: 1 | 2 | 3;
  phanTramHoaHongKy: number;
  donGiaTienAnKy?: number;
  rows: BangLuongChamCongInput[];
};

function normalizeStoredRows(
  rows: BangLuongChamCongInput[],
  defaultPercent: number,
  useDefaultForAll: boolean
): BangLuongChamCongInput[] {
  return rows.map((row) => ({
    ...row,
    phanTramHoaHong: useDefaultForAll
      ? defaultPercent
      : normalizeCommissionPercent(row.phanTramHoaHong, defaultPercent),
  }));
}

function loadSheet(
  y: number,
  m: number
): {
  phanTramHoaHongKy: number;
  donGiaTienAnKy: number;
  coDonGiaTienAnDaLuu: boolean;
  rows: BangLuongChamCongInput[];
} {
  try {
    let raw = localStorage.getItem(`${LS_PREFIX}${y}-${m}`);
    if (!raw) {
      raw = localStorage.getItem(`${LS_PREFIX_LEGACY}${y}-${m}`);
    }
    if (!raw) {
      return {
        phanTramHoaHongKy: DEFAULT_PCT_HH,
        donGiaTienAnKy: DEFAULT_MEAL_UNIT_PRICE,
        coDonGiaTienAnDaLuu: false,
        rows: [emptyRow()],
      };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        phanTramHoaHongKy: DEFAULT_PCT_HH,
        donGiaTienAnKy: DEFAULT_MEAL_UNIT_PRICE,
        coDonGiaTienAnDaLuu: false,
        rows: normalizeStoredRows(
          parsed as BangLuongChamCongInput[],
          DEFAULT_PCT_HH,
          true
        ),
      };
    }
    const sheet = parsed as Partial<StoredSheet>;
    if (
      sheet &&
      (sheet.v === 1 || sheet.v === 2 || sheet.v === 3) &&
      Array.isArray(sheet.rows) &&
      sheet.rows.length > 0
    ) {
      const defaultPercent = normalizeCommissionPercent(sheet.phanTramHoaHongKy);
      return {
        phanTramHoaHongKy: defaultPercent,
        donGiaTienAnKy:
          sheet.v === 3 && Number.isFinite(Number(sheet.donGiaTienAnKy))
            ? Math.max(0, Number(sheet.donGiaTienAnKy))
            : DEFAULT_MEAL_UNIT_PRICE,
        coDonGiaTienAnDaLuu: sheet.v === 3,
        // Bản v1 chỉ có một mức HH chung; chuyển mức đó vào từng dòng khi nâng cấp.
        rows: normalizeStoredRows(sheet.rows, defaultPercent, sheet.v === 1),
      };
    }
  } catch {
    // ignore
  }
  return {
    phanTramHoaHongKy: DEFAULT_PCT_HH,
    donGiaTienAnKy: DEFAULT_MEAL_UNIT_PRICE,
    coDonGiaTienAnDaLuu: false,
    rows: [emptyRow()],
  };
}

type NumKey = keyof Pick<
  BangLuongChamCongInput,
  'luongCoBan' | 'soGioTangCa' | 'tongDoanhThu' | 'soNgayCongThem'
>;

type OptionalMoneyKey = keyof Pick<
  BangLuongChamCongInput,
  'phuCapChuyenCan' | 'phuCapXangDienThoai' | 'phuCapThamNien' | 'tienAn' | 'tienAnTangCa'
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
  const { isAdmin } = useAuth();
  const now = new Date();
  const [nam, setNam] = useState(now.getFullYear());
  const [thang, setThang] = useState(now.getMonth() + 1);
  const y0 = now.getFullYear();
  const m0 = now.getMonth() + 1;
  const initial = loadSheet(y0, m0);
  const [phanTramHoaHongKy, setPhanTramHoaHongKy] = useState(initial.phanTramHoaHongKy);
  const [donGiaTienAnKy, setDonGiaTienAnKy] = useState(initial.donGiaTienAnKy);
  const [donGiaTienAnDaChot, setDonGiaTienAnDaChot] = useState(initial.donGiaTienAnKy);
  const [donGiaTienAnMacDinh, setDonGiaTienAnMacDinh] = useState(DEFAULT_MEAL_UNIT_PRICE);
  const [kyDaLuu, setKyDaLuu] = useState(false);
  const [kyCoDongBiKhoa, setKyCoDongBiKhoa] = useState(false);
  const [savingMealSetting, setSavingMealSetting] = useState(false);
  const [savingPeriodMealPrice, setSavingPeriodMealPrice] = useState(false);
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
    // The selected period is external input; replace the editable sheet atomically.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhanTramHoaHongKy(s.phanTramHoaHongKy);
    setDonGiaTienAnKy(s.donGiaTienAnKy);
    setDonGiaTienAnDaChot(s.donGiaTienAnKy);
    setKyDaLuu(false);
    setKyCoDongBiKhoa(false);
    setRows(s.rows);
    setRevenueCache(null);
    loadedKyRef.current = periodKey;

    let cancelled = false;
    (async () => {
      setRevenueLoading(true);
      const { start, end } = khoangNgayCuaThang(nam, thang);
      let sourceRows = s.rows;
      let defaultMealPrice = DEFAULT_MEAL_UNIT_PRICE;
      try {
        defaultMealPrice = await getDefaultMealUnitPrice();
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setDonGiaTienAnMacDinh(defaultMealPrice);
        if (!s.coDonGiaTienAnDaLuu) setDonGiaTienAnKy(defaultMealPrice);
      } catch (e) {
        console.error('Lấy đơn giá tiền ăn mặc định thất bại:', e);
      }
      try {
        const savedPayroll = await getPayrollBatch(thang, nam);
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setKyDaLuu(savedPayroll.length > 0);
        setKyCoDongBiKhoa(
          savedPayroll.some((item) => LOCKED_PAYROLL_STATUSES.has(item.trang_thai))
        );
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
          const savedMealPriceItem = savedPayroll.find((item) =>
            hasPayrollDetail(item, 'don_gia_tien_an')
          );
          if (savedMealPriceItem) {
            const savedMealPrice = Math.max(
              0,
              getPayrollBreakdown(savedMealPriceItem).don_gia_tien_an
            );
            setDonGiaTienAnKy(savedMealPrice);
            setDonGiaTienAnDaChot(savedMealPrice);
          } else if (!s.coDonGiaTienAnDaLuu) {
            // Dữ liệu cũ giữ nguyên số tiền ăn đã lưu trên từng dòng; mức này
            // chỉ dùng để hiển thị cho kỳ chưa có snapshot đơn giá.
            setDonGiaTienAnKy(defaultMealPrice);
            setDonGiaTienAnDaChot(defaultMealPrice);
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
      const data: StoredSheet = { v: 3, phanTramHoaHongKy, donGiaTienAnKy, rows };
      localStorage.setItem(`${LS_PREFIX}${nam}-${thang}`, JSON.stringify(data));
    } catch {
      // ignore quota
    }
  }, [rows, phanTramHoaHongKy, donGiaTienAnKy, nam, thang]);

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
    // Personnel arrives asynchronously and is the authoritative source for these fields.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            soBuaAnTheoChamCon: chamDong.length > 0 ? b.soBuaCoBan : undefined,
            soBuaAnTangCaTheoChamCon: chamDong.length > 0 ? b.soBuaTangCa : undefined,
            soNgayCongTheoChamCon: c,
            soGioTangCaTheoChamCon: gTcTuCham,
            donGiaTienAnTheoKy: donGiaTienAnKy,
          }),
        };
      }),
    [rows, nam, thang, chamDong, nhanTheoChuanTen, donGiaTienAnKy]
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<BangLuongChamCongInput>) => {
      if (!isAdmin) return;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [isAdmin]
  );

  const setNum = useCallback(
    (id: string, key: NumKey, raw: string) => {
      const n = parseFloat(raw.replace(/,/g, ''));
      updateRow(id, { [key]: Number.isFinite(n) ? n : 0 } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const setTien = useCallback(
    (
      id: string,
      key: 'luongCoBan' | 'tongDoanhThu' | 'phuCapTroNgoai' | 'thuongKhac',
      raw: string
    ) => {
      updateRow(id, { [key]: parseTienNhap(raw) } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const setMealCount = useCallback(
    (id: string, key: 'soBuaAnThuong' | 'soBuaAnTangCa', raw: string) => {
      const trimmed = raw.trim();
      const parsed = Number(trimmed.replace(/[^\d]/g, ''));
      updateRow(id, {
        [key]: trimmed === '' ? null : Math.max(0, Math.floor(Number.isFinite(parsed) ? parsed : 0)),
        ...(key === 'soBuaAnThuong' ? { tienAn: null } : { tienAnTangCa: null }),
      } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const setOptionalTien = useCallback(
    (id: string, key: OptionalMoneyKey, raw: string) => {
      const trimmed = raw.trim();
      updateRow(id, {
        [key]: trimmed === '' ? null : parseTienNhap(trimmed),
      } as Partial<BangLuongChamCongInput>);
    },
    [updateRow]
  );

  const setCommissionPercent = useCallback(
    (id: string, raw: string) => {
      const normalized = raw.replace(',', '.').trim();
      updateRow(id, {
        phanTramHoaHong: normalizeCommissionPercent(normalized === '' ? 0 : normalized, 0),
      });
    },
    [updateRow]
  );

  const applyDefaultCommissionToAll = useCallback(() => {
    if (!isAdmin) return;
    const percent = normalizeCommissionPercent(phanTramHoaHongKy);
    if (
      !window.confirm(
        `Áp dụng mức hoa hồng ${percent}% cho toàn bộ nhân viên trong bảng hiện tại?`
      )
    ) {
      return;
    }
    setRows((prev) => prev.map((row) => ({ ...row, phanTramHoaHong: percent })));
  }, [isAdmin, phanTramHoaHongKy]);

  const saveMealDefault = async () => {
    if (!isAdmin) return;
    const normalized = Math.max(0, Math.round(donGiaTienAnMacDinh));
    try {
      setSavingMealSetting(true);
      const saved = await saveDefaultMealUnitPrice(normalized);
      const savedValue = Math.max(0, Number(saved.gia_tri) || 0);
      setDonGiaTienAnMacDinh(savedValue);
      if (!kyDaLuu) {
        setDonGiaTienAnKy(savedValue);
        setDonGiaTienAnDaChot(savedValue);
      }
      window.alert(
        kyDaLuu
          ? `Đã lưu đơn giá mặc định ${formatVnd(savedValue)}/bữa. Kỳ ${thang}/${nam} đã có dữ liệu nên vẫn giữ đơn giá đã chốt.`
          : `Đã lưu đơn giá mặc định ${formatVnd(savedValue)}/bữa và áp dụng cho kỳ ${thang}/${nam}.`
      );
    } catch (e) {
      console.error('Lưu đơn giá tiền ăn mặc định:', e);
      window.alert('Không thể lưu đơn giá tiền ăn mặc định. Vui lòng kiểm tra kết nối.');
    } finally {
      setSavingMealSetting(false);
    }
  };

  const updateCurrentPeriodMealPrice = async () => {
    if (!isAdmin || !kyDaLuu) return;
    if (kyCoDongBiKhoa) {
      window.alert(
        `Kỳ ${thang}/${nam} có bảng lương đã duyệt hoặc đã chi trả nên không thể sửa đơn giá. Hãy chuyển kỳ về trạng thái chỉnh sửa trước.`
      );
      setDonGiaTienAnKy(donGiaTienAnDaChot);
      return;
    }
    const normalized = Math.max(0, Math.round(donGiaTienAnKy));
    if (normalized === donGiaTienAnDaChot) return;
    if (
      !window.confirm(
        `Đổi đơn giá tiền ăn riêng kỳ ${thang}/${nam} từ ${formatVnd(donGiaTienAnDaChot)} thành ${formatVnd(normalized)}/bữa? Các kỳ khác và đơn giá mặc định sẽ không thay đổi.`
      )
    ) {
      setDonGiaTienAnKy(donGiaTienAnDaChot);
      return;
    }

    const rowsRecalculatedByCount = rows.map((row) => ({
      ...row,
      // Khi chủ động đổi đơn giá kỳ, bỏ số tiền kiểu dữ liệu cũ để quay về
      // đúng công thức số bữa × đơn giá.
      tienAn: null,
      tienAnTangCa: null,
    }));
    try {
      setSavingPeriodMealPrice(true);
      const result = await syncPayrollFromAttendance(thang, nam, undefined, {
        rows: rowsRecalculatedByCount,
        donGiaTienAnTheoKy: normalized,
        ghiDeDonGiaTienAnDaChot: true,
      });
      if (result.skippedLockedCount > 0) {
        throw new Error('Kỳ lương vừa được khóa trong lúc cập nhật.');
      }
      setRows(rowsRecalculatedByCount);
      setDonGiaTienAnDaChot(normalized);
      window.alert(
        `Đã cập nhật riêng đơn giá kỳ ${thang}/${nam} thành ${formatVnd(normalized)}/bữa.`
      );
    } catch (e) {
      console.error('Cập nhật đơn giá tiền ăn của kỳ:', e);
      setDonGiaTienAnKy(donGiaTienAnDaChot);
      window.alert('Không thể cập nhật đơn giá kỳ này. Dữ liệu đã chốt trước đó được giữ nguyên.');
    } finally {
      setSavingPeriodMealPrice(false);
    }
  };

  const addRow = useCallback(() => {
    if (!isAdmin) return;
    setRows((prev) => [...prev, emptyRow(phanTramHoaHongKy)]);
  }, [isAdmin, phanTramHoaHongKy]);

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
    if (!isAdmin) return;
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
          ...emptyRow(phanTramHoaHongKy),
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
  }, [isAdmin, rows, nam, thang, phanTramHoaHongKy]);

  const removeRow = useCallback((id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('Xóa dòng này khỏi bảng lương tháng đang chọn?')) return;
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [emptyRow(phanTramHoaHongKy)];
    });
  }, [isAdmin, phanTramHoaHongKy]);

  const saveAndOpenPayroll = useCallback(async () => {
    if (!isAdmin) {
      window.alert('Chỉ tài khoản admin được lưu hoặc chỉnh sửa bảng lương.');
      return;
    }
    if (kyDaLuu && donGiaTienAnKy !== donGiaTienAnDaChot) {
      window.alert('Đơn giá kỳ này đang thay đổi. Hãy bấm “Cập nhật kỳ” trước khi lưu bảng lương.');
      return;
    }
    try {
      setSavingPayroll(true);
      await syncPayrollFromAttendance(thang, nam, undefined, {
        rows,
        donGiaTienAnTheoKy: donGiaTienAnKy,
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
  }, [donGiaTienAnDaChot, donGiaTienAnKy, isAdmin, kyDaLuu, nam, navigate, rows, thang]);

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
    [revenueCache, nam, thang, nhanTheoChuanTen, setOrdersModal]
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
        <div className="flex flex-col gap-1.5 shrink-0 w-full min-w-0 sm:w-auto sm:max-w-[min(100%,64rem)] sm:ml-auto sm:items-end">
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
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/70 px-2 py-1 dark:border-emerald-800 dark:bg-emerald-950/20"
              title={
                kyDaLuu
                  ? `Đơn giá mặc định cho kỳ mới. Kỳ ${thang}/${nam} đang giữ mức đã chốt ${formatVnd(donGiaTienAnKy)}/bữa.`
                  : `Lưu đơn giá này và áp dụng cho kỳ ${thang}/${nam}.`
              }
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap">Ăn mặc định</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-20 bg-background border border-border/60 rounded px-1.5 py-1 text-sm font-mono text-right"
                value={formatTienNhap(donGiaTienAnMacDinh)}
                disabled={!isAdmin || savingMealSetting}
                onChange={(e) => setDonGiaTienAnMacDinh(parseTienNhap(e.target.value))}
                aria-label="Đơn giá tiền ăn mặc định"
              />
              <span className="text-xs font-medium whitespace-nowrap">đ/bữa</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={saveMealDefault}
                  disabled={savingMealSetting}
                  className="rounded border border-emerald-300 bg-background px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-400"
                >
                  {savingMealSetting ? 'Đang lưu' : 'Lưu'}
                </button>
              )}
            </div>
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50/70 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/20"
              title={
                kyCoDongBiKhoa
                  ? 'Kỳ có bảng lương đã duyệt/đã chi trả nên không được sửa.'
                  : kyDaLuu
                    ? `Sửa riêng đơn giá kỳ ${thang}/${nam}; không ảnh hưởng mức mặc định và kỳ khác.`
                    : `Đơn giá sẽ được chốt khi lưu kỳ ${thang}/${nam}.`
              }
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Ăn kỳ {thang}/{nam}
              </span>
              <input
                type="text"
                inputMode="numeric"
                className="w-20 bg-background border border-border/60 rounded px-1.5 py-1 text-sm font-mono text-right"
                value={formatTienNhap(donGiaTienAnKy)}
                disabled={!isAdmin || savingPeriodMealPrice || kyCoDongBiKhoa}
                onChange={(e) => setDonGiaTienAnKy(parseTienNhap(e.target.value))}
                aria-label={`Đơn giá tiền ăn kỳ ${thang}/${nam}`}
              />
              <span className="text-xs font-medium whitespace-nowrap">đ/bữa</span>
              {isAdmin && kyDaLuu && (
                <button
                  type="button"
                  onClick={updateCurrentPeriodMealPrice}
                  disabled={
                    savingPeriodMealPrice ||
                    kyCoDongBiKhoa ||
                    donGiaTienAnKy === donGiaTienAnDaChot
                  }
                  className="rounded border border-amber-300 bg-background px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-400"
                >
                  {savingPeriodMealPrice ? 'Đang cập nhật' : kyCoDongBiKhoa ? 'Đã khóa' : 'Cập nhật kỳ'}
                </button>
              )}
            </div>
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-primary/5 border-primary/20 px-2 py-1"
              title="Mức hoa hồng mặc định cho dòng mới; bấm Áp dụng để gán cho toàn bộ nhân viên"
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap">HH mặc định</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-11 bg-background border border-border/60 rounded px-1 py-1 text-sm font-mono text-right"
                value={String(phanTramHoaHongKy)}
                disabled={!isAdmin}
                onChange={(e) => {
                  setPhanTramHoaHongKy(
                    normalizeCommissionPercent(e.target.value.replace(',', '.'), 0)
                  );
                }}
                title="Mức mặc định; không tự ghi đè tỷ lệ riêng cho đến khi bấm Áp dụng"
                aria-label="% hoa hồng mặc định"
              />
              <span className="text-sm font-medium">%</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={applyDefaultCommissionToAll}
                  className="rounded border border-primary/30 bg-background px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                  title="Gán mức mặc định này cho tất cả nhân viên trong bảng"
                >
                  Áp dụng
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-nowrap items-center gap-2 min-w-0 w-full sm:justify-end overflow-x-auto py-0.5 -mx-0.5 px-0.5">
            <button
              type="button"
              onClick={saveAndOpenPayroll}
              disabled={!isAdmin || savingPayroll || revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-2 hover:bg-emerald-100"
              title={isAdmin ? 'Lưu đầy đủ các khoản vào Supabase rồi mở bảng lương chính' : 'Chỉ admin được lưu bảng lương'}
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
            {isAdmin && (
              <>
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
              </>
            )}
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
                  'Doanh số đã chia đều theo số người cùng phụ trách đơn — dùng tính hoa hồng'
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
                {thCell(
                  'Tiền ăn',
                  `Nhập số bữa ăn thường; tiền ăn = số bữa × ${formatVnd(donGiaTienAnKy)}`
                )}
                {thCell(
                  'Tiền ăn tăng ca',
                  `Nhập số bữa ăn tăng ca; tiền ăn = số bữa × ${formatVnd(donGiaTienAnKy)}`
                )}
                {thCell('Thưởng tháng', 'Khoản thưởng tùy ý của từng nhân viên trong kỳ')}
                {thCell('Ghi chú thưởng', 'Nội dung ghi nhớ lý do hoặc chỉ tiêu thưởng')}
                {thCell('% HH', 'Tỷ lệ hoa hồng riêng của từng nhân viên; chỉ admin được sửa')}
                {thCell('Tiền hoa hồng', 'Doanh số đã phân bổ cho nhân viên × tỷ lệ hoa hồng riêng')}
                {thCell('Tổng lương', 'Tổng các khoản thu nhập')}
                {thCell('Ghi chú', 'Cảnh báo')}
                {isAdmin && (
                  <th className="sticky top-0 right-0 z-[2] bg-muted/80 backdrop-blur border-b border-l border-border px-2 py-3 text-center text-xs sm:text-sm font-semibold text-muted-foreground whitespace-nowrap w-14">
                    Xóa
                  </th>
                )}
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
                        readOnly={!isAdmin || !isEditingName}
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
                            if (isAdmin) setEditingNameId(input.id);
                            return;
                          }
                          void moChiTietDon(input.hoTen);
                        }}
                        onDoubleClick={() => {
                          if (isAdmin) setEditingNameId(input.id);
                        }}
                        onBlur={() => setEditingNameId(null)}
                      />
                    </td>
                    <td className="px-2 py-1.5 bg-primary/5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-32 min-w-0 min-h-10 text-sm bg-transparent border border-primary/30 rounded-md px-2 py-1.5 text-right font-mono"
                        title="Tổng tong_tien đơn trong kỳ (theo Họ tên). Bấm « Doanh số » để lấy từ hệ thống."
                        readOnly={!isAdmin}
                        value={formatTienNhap(input.tongDoanhThu)}
                        onChange={(e) => setTien(input.id, 'tongDoanhThu', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="w-[7.5rem] min-h-10 text-sm bg-background border border-border/60 rounded-md px-1.5 py-1.5"
                        value={input.loai}
                        disabled={!isAdmin}
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
                        readOnly={khopNhanSu || !isAdmin}
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
                          readOnly={!isAdmin}
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
                      {isAdmin ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-28 min-h-9 bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                          title="Admin có thể sửa; xóa hết giá trị để quay về mức tự động theo 28 công"
                          value={formatTienNhap(input.phuCapChuyenCan ?? kq.phuCapChuyenCan)}
                          onChange={(e) => setOptionalTien(input.id, 'phuCapChuyenCan', e.target.value)}
                        />
                      ) : (
                        formatVnd(kq.phuCapChuyenCan)
                      )}
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
                      {isAdmin ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-28 min-h-9 bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                          title="Admin có thể sửa; xóa hết giá trị để quay về 500.000đ mặc định"
                          value={formatTienNhap(input.phuCapXangDienThoai ?? kq.phuCapXangDienThoai)}
                          onChange={(e) => setOptionalTien(input.id, 'phuCapXangDienThoai', e.target.value)}
                        />
                      ) : (
                        formatVnd(kq.phuCapXangDienThoai)
                      )}
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title={
                        input.ngayBatDauLam
                          ? `${kq.thangLamViec} tháng làm việc đến hết ${String(thang).padStart(2, '0')}/${nam}`
                          : 'Chưa có ngày vào làm'
                      }
                    >
                      {isAdmin ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-28 min-h-9 bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                          title="Admin có thể sửa; xóa hết giá trị để tính lại theo ngày vào làm"
                          value={formatTienNhap(input.phuCapThamNien ?? kq.phuCapThamNien)}
                          onChange={(e) => setOptionalTien(input.id, 'phuCapThamNien', e.target.value)}
                        />
                      ) : (
                        formatVnd(kq.phuCapThamNien)
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-28 min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                        title="Phụ cấp trọ ngoài"
                        readOnly={!isAdmin}
                        value={formatTienNhap(input.phuCapTroNgoai ?? 0)}
                        onChange={(e) => setTien(input.id, 'phuCapTroNgoai', e.target.value)}
                      />
                    </td>
                    <td
                      className="px-2 py-1.5 text-right font-mono whitespace-nowrap text-sm"
                      title={`${kq.soBuaAnThuong} bữa × ${formatVnd(kq.donGiaTienAn)}`}
                    >
                      {isAdmin ? (
                        <div className="flex min-w-[9rem] flex-col items-end gap-1">
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="text"
                              inputMode="numeric"
                              className="w-14 min-h-8 bg-transparent border border-border/60 rounded-md px-1.5 py-1 text-right font-mono text-foreground"
                              title="Nhập số bữa; xóa giá trị để lấy lại số bữa từ chấm công"
                              value={String(input.soBuaAnThuong ?? kq.soBuaAnThuong)}
                              onChange={(e) => setMealCount(input.id, 'soBuaAnThuong', e.target.value)}
                            />
                            bữa
                          </label>
                          <span className="font-semibold">{formatVnd(kq.tienAn)}</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-muted-foreground">{kq.soBuaAnThuong} bữa</div>
                          {formatVnd(kq.tienAn)}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right font-mono whitespace-nowrap text-sm"
                      title={`${kq.soBuaAnTangCa} bữa tăng ca × ${formatVnd(kq.donGiaTienAn)}`}
                    >
                      {isAdmin ? (
                        <div className="flex min-w-[9rem] flex-col items-end gap-1">
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="text"
                              inputMode="numeric"
                              className="w-14 min-h-8 bg-transparent border border-border/60 rounded-md px-1.5 py-1 text-right font-mono text-foreground"
                              title="Nhập số bữa tăng ca; xóa giá trị để lấy lại từ chấm công"
                              value={String(input.soBuaAnTangCa ?? kq.soBuaAnTangCa)}
                              onChange={(e) => setMealCount(input.id, 'soBuaAnTangCa', e.target.value)}
                            />
                            bữa
                          </label>
                          <span className="font-semibold">{formatVnd(kq.tienAnTangCa)}</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-muted-foreground">{kq.soBuaAnTangCa} bữa</div>
                          {formatVnd(kq.tienAnTangCa)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-28 min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5 text-right font-mono"
                        title="Thưởng tháng của nhân viên"
                        readOnly={!isAdmin}
                        value={formatTienNhap(input.thuongKhac ?? 0)}
                        onChange={(e) => setTien(input.id, 'thuongKhac', e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        className="w-48 min-w-0 min-h-10 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1.5"
                        title="Ghi chú cho khoản thưởng tháng"
                        placeholder="Ví dụ: Đạt chỉ tiêu tháng"
                        readOnly={!isAdmin}
                        value={input.ghiChuThuongThang ?? ''}
                        onChange={(e) => updateRow(input.id, { ghiChuThuongThang: e.target.value })}
                      />
                    </td>
                    <td
                      className="px-2.5 py-2.5 text-right font-mono whitespace-nowrap text-sm"
                      title="Tỷ lệ hoa hồng riêng của nhân viên"
                    >
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-16 min-h-9 bg-transparent border border-primary/30 rounded-md px-2 py-1.5 text-right font-mono"
                            value={String(input.phanTramHoaHong)}
                            onChange={(e) => setCommissionPercent(input.id, e.target.value)}
                            aria-label={`% hoa hồng của ${input.hoTen || `dòng ${i + 1}`}`}
                          />
                          <span>%</span>
                        </div>
                      ) : (
                        `${kq.phanTramHoaHongApDung}%`
                      )}
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
                    {isAdmin && (
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
                    )}
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
