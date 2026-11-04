import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BadgeDollarSign, Building2, Calculator, Calendar, CheckCircle2, Clock3, GitCompareArrows, Loader2, Pencil, Plus, Save, Table2, Trash2, TrendingUp, UserPlus, Utensils, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getChamCongTrongKhoang } from '../data/attendanceData';
import {
  loadPayrollRevenueData,
  type PayrollRevenueData,
  type PayrollRevenueOrderRow,
} from '../data/reportData';
import { removeVietnameseTones } from '../lib/utils';
import {
  demGioTangCaTheoDongCham,
  demSoBuaAnTachTheoDongCham,
  demSoNgayCongTheoDongCham,
  ATTENDANCE_SALARY,
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
  DEFAULT_OVERTIME_MEAL_UNIT_PRICE,
  getDefaultMealUnitPrice,
  getDefaultOvertimeMealUnitPrice,
  saveDefaultMealUnitPrice,
  saveDefaultOvertimeMealUnitPrice,
} from '../data/payrollSettingsData';
import { useAuth } from '../context/AuthContext';
import { useAttendanceSettings } from '../hooks/useAttendanceSettings';
import { allocatePayrollRevenueByName } from '../lib/payrollRevenueAllocation';
import { branchKey } from '../lib/branchCatalog';

const LS_PREFIX = 'payrollChamCongLuongV2:';
const LS_PREFIX_LEGACY = 'payrollChamCongLuongV1:';
const DEFAULT_PCT_HH = 2;

function normalizeCommissionPercent(value: unknown, fallback = DEFAULT_PCT_HH): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
}

/**
 * Cho phép nhập nhanh tiền ngay trong ghi chú thưởng:
 * - "500000" / "500.000đ" -> 500.000
 * - "Đạt chỉ tiêu 500.000" -> 500.000
 * Các số nhỏ trong nội dung như "tháng 8" không bị hiểu nhầm là tiền thưởng.
 */
function bonusAmountFromNote(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^[\d\s.,]+(?:đ|₫|vnd)?$/i.test(value)) {
    return parseTienNhap(value);
  }

  const candidates = value.match(/\d[\d\s.,]*/g) ?? [];
  const amounts = candidates
    .filter((candidate) => {
      const digits = candidate.replace(/\D/g, '');
      return digits.length >= 5 || /[.,]\d{3}\b/.test(candidate.trim());
    })
    .map((candidate) => parseTienNhap(candidate))
    .filter((amount) => amount > 0);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function MoneyValue({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <span className={clsx('tabular-nums', strong && 'font-semibold text-foreground')}>
      {formatTienNhap(value)}
      <span className="ml-1 text-xs font-medium text-muted-foreground">đ</span>
    </span>
  );
}

function EditableTableValue({
  value,
  display,
  onChange,
  ariaLabel,
  title,
  disabled = false,
  inputMode = 'numeric',
  placeholder,
  align = 'right',
  className,
}: {
  value: string;
  display: ReactNode;
  onChange: (value: string) => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  inputMode?: 'numeric' | 'decimal' | 'text';
  placeholder?: string;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const alignment = align === 'right' ? 'justify-end text-right' : 'justify-start text-left';

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        className={clsx(
          'min-h-10 w-full rounded-md border border-primary/40 bg-background px-2.5 py-2 text-sm text-foreground shadow-sm outline-none ring-2 ring-primary/15 focus:border-primary focus:ring-primary/25',
          alignment,
          className,
        )}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  }

  if (disabled) {
    return (
      <div className={clsx('flex min-h-10 w-full items-center px-2.5 py-2', alignment, className)} title={title}>
        {display}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={clsx(
        'group/edit inline-flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        alignment,
        className,
      )}
      title={title || `Bấm để sửa: ${ariaLabel}`}
      aria-label={`Sửa ${ariaLabel}`}
      onClick={() => setEditing(true)}
    >
      <span className={clsx('min-w-0', align === 'right' && 'text-right')}>{display}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" aria-hidden="true" />
    </button>
  );
}

function EditableTypeValue({
  value,
  onChange,
  disabled,
  name,
}: {
  value: LoaiNhanVien;
  onChange: (value: LoaiNhanVien) => void;
  disabled: boolean;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled) {
    return (
      <select
        autoFocus
        className="min-h-10 w-full rounded-md border border-primary/40 bg-background px-2.5 py-2 text-sm text-foreground outline-none ring-2 ring-primary/15 focus:border-primary"
        value={value}
        aria-label={`Loại nhân viên của ${name}`}
        onChange={(event) => onChange(event.target.value as LoaiNhanVien)}
        onBlur={() => setEditing(false)}
      >
        <option value="chinh_thuc">Chính thức</option>
        <option value="thoi_vu">Thời vụ</option>
      </select>
    );
  }
  const label = value === 'thoi_vu' ? 'Thời vụ' : 'Chính thức';
  const badge = <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{label}</span>;
  if (disabled) return <div className="flex min-h-10 items-center px-2.5 py-2">{badge}</div>;
  return (
    <button
      type="button"
      className="group/type inline-flex min-h-10 w-full items-center justify-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      title="Bấm để sửa loại nhân viên"
      aria-label={`Sửa loại nhân viên của ${name}`}
      onClick={() => setEditing(true)}
    >
      {badge}
      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/type:opacity-100 group-focus-visible/type:opacity-100" aria-hidden="true" />
    </button>
  );
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
  if (!data.personnel.length) {
    const shares = allocatePayrollRevenueByName(rows, row => row.hoTen, data.totals, chuanHoaTenSoSanh);
    return { rows: rows.map((row, index) => ({ ...row, tongDoanhThu: shares[index] })), payrollData: data };
  }
  const mapped: BangLuongChamCongInput[] = rows.map(row => {
    const matches = data.personnel.filter(person => chuanHoaTenSoSanh(person.ho_ten) === chuanHoaTenSoSanh(row.hoTen)
      && (!row.coSo || branchKey(person.co_so || '') === branchKey(row.coSo)));
    const person = data.personnel.find(person => person.id === row.nhanSuId || person.id === row.id)
      ?? (matches.length === 1 ? matches[0] : undefined);
    return { ...row, nhanSuId: person?.id, coSo: person?.co_so || row.coSo,
      tongDoanhThu: person ? data.personnelTotals.get(person.id) ?? 0 : 0 };
  });
  const represented = new Set(mapped.map(row => row.nhanSuId).filter(Boolean));
  for (const person of data.personnel) {
    if (represented.has(person.id) || !data.personnelTotals.get(person.id)) continue;
    mapped.push({ ...emptyRow(), id: person.id, nhanSuId: person.id, hoTen: person.ho_ten,
      coSo: person.co_so || undefined, luongCoBan: Number(person.luong_co_ban) || 0,
      ngayBatDauLam: ngayIsoTuNhanSu(person) || '', tongDoanhThu: data.personnelTotals.get(person.id)! });
  }
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
      nhanSuId: item.nhan_su_id,
      coSo: item.co_so,
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
          ? null
          : detail.tien_an,
      tienAnTangCa:
        hasMealSnapshot
          ? null
          : detail.tien_an_tang_ca,
      soBuaAnThuong: hasMealSnapshot ? detail.so_bua_an_thuong : null,
      soBuaAnTangCa: hasMealSnapshot ? detail.so_bua_an_tang_ca : null,
      soGioTangCa: detail.so_gio_tang_ca,
      tongDoanhThu: Number(item.doanh_so) || 0,
      phanTramHoaHong: hasPayrollDetail(item, 'phan_tram_hoa_hong')
        ? normalizeCommissionPercent(detail.phan_tram_hoa_hong)
        : DEFAULT_PCT_HH,
      ngayBatDauLam: item.nhan_su.ngay_vao_lam?.slice(0, 10) ?? '',
      thuongKhac:
        detail.thuong_thang > 0
          ? detail.thuong_thang
          : bonusAmountFromNote(item.ghi_chu ?? '') ?? 0,
      ghiChuThuongThang: item.ghi_chu ?? '',
    }];
  });
}

type StoredSheet = {
  v: 1 | 2 | 3 | 4;
  phanTramHoaHongKy: number;
  donGiaTienAnKy?: number;
  donGiaTienAnTangCaKy?: number;
  rows: BangLuongChamCongInput[];
};

function normalizeStoredRows(
  rows: BangLuongChamCongInput[],
  defaultPercent: number,
  useDefaultForAll: boolean
): BangLuongChamCongInput[] {
  return rows.map((row) => {
    const bonusFromNote = bonusAmountFromNote(row.ghiChuThuongThang ?? '');
    return {
      ...row,
      thuongKhac:
        Number(row.thuongKhac) > 0
          ? Number(row.thuongKhac)
          : bonusFromNote ?? 0,
      phanTramHoaHong: useDefaultForAll
        ? defaultPercent
        : normalizeCommissionPercent(row.phanTramHoaHong, defaultPercent),
    };
  });
}

function loadSheet(
  y: number,
  m: number
): {
  phanTramHoaHongKy: number;
  donGiaTienAnKy: number;
  donGiaTienAnTangCaKy: number;
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
        donGiaTienAnTangCaKy: DEFAULT_OVERTIME_MEAL_UNIT_PRICE,
        coDonGiaTienAnDaLuu: false,
        rows: [emptyRow()],
      };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return {
        phanTramHoaHongKy: DEFAULT_PCT_HH,
        donGiaTienAnKy: DEFAULT_MEAL_UNIT_PRICE,
        donGiaTienAnTangCaKy: DEFAULT_OVERTIME_MEAL_UNIT_PRICE,
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
      (sheet.v === 1 || sheet.v === 2 || sheet.v === 3 || sheet.v === 4) &&
      Array.isArray(sheet.rows) &&
      sheet.rows.length > 0
    ) {
      const defaultPercent = normalizeCommissionPercent(sheet.phanTramHoaHongKy);
      return {
        phanTramHoaHongKy: defaultPercent,
        donGiaTienAnKy:
          (sheet.v === 3 || sheet.v === 4) && Number.isFinite(Number(sheet.donGiaTienAnKy))
            ? Math.max(0, Number(sheet.donGiaTienAnKy))
            : DEFAULT_MEAL_UNIT_PRICE,
        donGiaTienAnTangCaKy:
          sheet.v === 4 && Number.isFinite(Number(sheet.donGiaTienAnTangCaKy))
            ? Math.max(0, Number(sheet.donGiaTienAnTangCaKy))
            : (sheet.v === 3 && Number.isFinite(Number(sheet.donGiaTienAnKy))
                ? Math.max(0, Number(sheet.donGiaTienAnKy))
                : DEFAULT_OVERTIME_MEAL_UNIT_PRICE),
        coDonGiaTienAnDaLuu: sheet.v === 3 || sheet.v === 4,
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
    donGiaTienAnTangCaKy: DEFAULT_OVERTIME_MEAL_UNIT_PRICE,
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

function formatDonGiaGon(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value / 1000)}k`;
  }
  return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
}

// Start independent reads together; consume each failure in its existing catch.
// A rejected background read must not become an unhandled rejection on navigation.
function startRead<T>(request: Promise<T>): Promise<() => T> {
  return request.then(value => () => value, error => () => { throw error; });
}

const PayrollAttendanceSalaryPage: React.FC = () => {
  const { settings: attendanceSettings } = useAttendanceSettings();
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
  const [donGiaTienAnTangCaKy, setDonGiaTienAnTangCaKy] = useState(
    initial.donGiaTienAnTangCaKy
  );
  const [donGiaTienAnTangCaDaChot, setDonGiaTienAnTangCaDaChot] = useState(
    initial.donGiaTienAnTangCaKy
  );
  const [donGiaTienAnMacDinh, setDonGiaTienAnMacDinh] = useState(DEFAULT_MEAL_UNIT_PRICE);
  const [donGiaTienAnTangCaMacDinh, setDonGiaTienAnTangCaMacDinh] = useState(
    DEFAULT_OVERTIME_MEAL_UNIT_PRICE
  );
  const [kyDaLuu, setKyDaLuu] = useState(false);
  const [savingMealSetting, setSavingMealSetting] = useState(false);
  const [savingPeriodMealPrice, setSavingPeriodMealPrice] = useState(false);
  const [showMealPriceEditor, setShowMealPriceEditor] = useState(false);
  const [rows, setRows] = useState<BangLuongChamCongInput[]>(initial.rows);
  const [quickLoading, setQuickLoading] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{
    kind: 'success' | 'warning';
    text: string;
  } | null>(null);
  const [chamDong, setChamDong] = useState<DongChamBuaNhap[]>([]);
  const [nhanList, setNhanList] = useState<NhanSu[]>([]);
  const [revenueCache, setRevenueCache] = useState<PayrollRevenueData | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [ordersModal, setOrdersModal] = useState<{
    issueMode?: boolean;
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

    setPhanTramHoaHongKy(s.phanTramHoaHongKy);
    setDonGiaTienAnKy(s.donGiaTienAnKy);
    setDonGiaTienAnDaChot(s.donGiaTienAnKy);
    setDonGiaTienAnTangCaKy(s.donGiaTienAnTangCaKy);
    setDonGiaTienAnTangCaDaChot(s.donGiaTienAnTangCaKy);
    setKyDaLuu(false);
    setRows(s.rows);
    setRevenueCache(null);
    loadedKyRef.current = periodKey;

    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setRevenueLoading(true);
      const { start, end } = khoangNgayCuaThang(nam, thang);
      let sourceRows = s.rows;
      let defaultMealPrice = DEFAULT_MEAL_UNIT_PRICE;
      let defaultOvertimeMealPrice = DEFAULT_OVERTIME_MEAL_UNIT_PRICE;
      const defaultsRead = startRead(Promise.all([getDefaultMealUnitPrice(), getDefaultOvertimeMealUnitPrice()]));
      const savedPayrollRead = startRead(getPayrollBatch(thang, nam));
      const revenueRead = startRead(loadPayrollRevenueData(nam, thang, controller.signal));
      const attendanceRead = startRead(getChamCongTrongKhoang(start, end, controller.signal));
      try {
        [defaultMealPrice, defaultOvertimeMealPrice] = (await defaultsRead)();
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setDonGiaTienAnMacDinh(defaultMealPrice);
        setDonGiaTienAnTangCaMacDinh(defaultOvertimeMealPrice);
        if (!s.coDonGiaTienAnDaLuu) {
          setDonGiaTienAnKy(defaultMealPrice);
          setDonGiaTienAnTangCaKy(defaultOvertimeMealPrice);
        }
      } catch (e) {
        console.error('Lấy đơn giá tiền ăn mặc định thất bại:', e);
      }
      try {
        const savedPayroll = (await savedPayrollRead)();
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setKyDaLuu(savedPayroll.length > 0);
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
            const savedOvertimeMealPriceItem = savedPayroll.find((item) =>
              hasPayrollDetail(item, 'don_gia_tien_an_tang_ca')
            );
            const savedOvertimeMealPrice = savedOvertimeMealPriceItem
              ? Math.max(
                  0,
                  getPayrollBreakdown(savedOvertimeMealPriceItem)
                    .don_gia_tien_an_tang_ca
                )
              : savedMealPrice;
            setDonGiaTienAnTangCaKy(savedOvertimeMealPrice);
            setDonGiaTienAnTangCaDaChot(savedOvertimeMealPrice);
          } else if (!s.coDonGiaTienAnDaLuu) {
            // Dữ liệu cũ giữ nguyên số tiền ăn đã lưu trên từng dòng; mức này
            // chỉ dùng để hiển thị cho kỳ chưa có snapshot đơn giá.
            setDonGiaTienAnKy(defaultMealPrice);
            setDonGiaTienAnDaChot(defaultMealPrice);
            setDonGiaTienAnTangCaKy(defaultOvertimeMealPrice);
            setDonGiaTienAnTangCaDaChot(defaultOvertimeMealPrice);
          }
          setRows(savedRows);
        }
      } catch (e) {
        console.error('Lấy bảng lương đã lưu thất bại:', e);
      }
      try {
        const payrollData = (await revenueRead)();
        // Luôn đồng bộ doanh số nhân viên theo phiếu bán mới nhất của kỳ,
        // kể cả khi đã có bảng lương lưu từ trước.
        const merged = (await gopDoanhSoTheoBaoCao(sourceRows, nam, thang, payrollData)).rows;
        if (cancelled || loadedKyRef.current !== periodKey) return;
        setRows(merged);
        setRevenueCache(payrollData);
      } catch (e) {
        console.error('Lấy doanh số tháng tự động thất bại:', e);
      }
      try {
        const dongs = (await attendanceRead)();
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
      controller.abort();
    };
  }, [nam, thang]);

  useEffect(() => {
    if (loadedKyRef.current !== `${nam}-${thang}`) return;
    try {
      const data: StoredSheet = {
        v: 4,
        phanTramHoaHongKy,
        donGiaTienAnKy,
        donGiaTienAnTangCaKy,
        rows,
      };
      localStorage.setItem(`${LS_PREFIX}${nam}-${thang}`, JSON.stringify(data));
    } catch {
      // ignore quota
    }
  }, [
    rows,
    phanTramHoaHongKy,
    donGiaTienAnKy,
    donGiaTienAnTangCaKy,
    nam,
    thang,
  ]);

  const nhanTheoChuanTen = useMemo(() => {
    const m = new Map<
      string,
      {
        id: string;
        idNhanSu: string | null;
        luongCoBan: number;
        ngayVaoLam: string | null;
        coSo: string;
      }
    >();
    for (const p of nhanList) {
      if (!p.ho_ten) continue;
      if (nhanList.filter(person => chuanHoaTenSoSanh(person.ho_ten || '') === chuanHoaTenSoSanh(p.ho_ten)).length !== 1) continue;
      const raw = p.luong_co_ban;
      const luongCoBan =
        raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
      m.set(chuanHoaTenSoSanh(p.ho_ten), {
        id: p.id,
        idNhanSu: p.id_nhan_su ? String(p.id_nhan_su).trim() : null,
        luongCoBan,
        ngayVaoLam: ngayIsoTuNhanSu(p),
        coSo: p.co_so?.trim() || 'Chưa xác định',
      });
    }
    return m;
  }, [nhanList]);

  const nhanTheoId = useMemo(
    () => new Map(nhanList.map((p) => [p.id, p])),
    [nhanList]
  );

  /** Điền dữ liệu gốc còn thiếu từ Nhân sự; các chỉnh sửa theo kỳ sau đó được giữ nguyên. */
  useEffect(() => {
    if (nhanTheoChuanTen.size === 0) return;
    // Personnel arrives asynchronously, so only hydrate blank fields once it is available.

    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        const personById = r.nhanSuId ? nhanTheoId.get(r.nhanSuId) : undefined;
        const meta = personById
          ? {
              id: personById.id,
              idNhanSu: personById.id_nhan_su ? String(personById.id_nhan_su).trim() : null,
              luongCoBan: Number(personById.luong_co_ban) || 0,
              ngayVaoLam: ngayIsoTuNhanSu(personById),
              coSo: personById.co_so?.trim() || 'Chưa xác định',
            }
          : nhanTheoChuanTen.get(chuanHoaTenSoSanh(r.hoTen));
        if (!meta) return r;
        const patch: Partial<BangLuongChamCongInput> = {};
        const lcb = meta.luongCoBan;
        if ((r.luongCoBan ?? 0) <= 0 && lcb > 0) patch.luongCoBan = lcb;
        const ngayTuNs = meta.ngayVaoLam;
        if (ngayTuNs && r.ngayBatDauLam !== ngayTuNs) patch.ngayBatDauLam = ngayTuNs;
        if (r.nhanSuId !== meta.id) patch.nhanSuId = meta.id;
        if (r.coSo !== meta.coSo) patch.coSo = meta.coSo;
        if (Object.keys(patch).length === 0) return r;
        changed = true;
        return { ...r, ...patch };
      });
      return changed ? next : prev;
    });
  }, [nhanTheoChuanTen, nhanTheoId, nam, thang]);

  const withKetQua = useMemo(
    () =>
      rows.map((r) => {
        const personById = r.nhanSuId ? nhanTheoId.get(r.nhanSuId) : undefined;
        const nhanMeta = nhanTheoChuanTen.get(chuanHoaTenSoSanh(r.hoTen));
        const nhanId = personById?.id ?? nhanMeta?.id;
        const idNhanSu = personById?.id_nhan_su ?? nhanMeta?.idNhanSu ?? undefined;
        const coSo = personById?.co_so?.trim() || nhanMeta?.coSo || r.coSo?.trim() || 'Chưa xác định';
        const b = demSoBuaAnTachTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu, attendanceSettings);
        const c = demSoNgayCongTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu, attendanceSettings);
        const gTcTuCham =
          chamDong.length > 0
            ? demGioTangCaTheoDongCham(chamDong, r.hoTen, nhanId, idNhanSu, attendanceSettings)
            : undefined;
        return {
          input: r,
          coSo,
          gTcTuCham,
          kq: tinhMotDong(r, nam, thang, {
            soBuaAnTheoChamCon: chamDong.length > 0 ? b.soBuaCoBan : undefined,
            soBuaAnTangCaTheoChamCon: chamDong.length > 0 ? b.soBuaTangCa : undefined,
            soNgayCongTheoChamCon: c,
            soGioTangCaTheoChamCon: gTcTuCham,
            donGiaTienAnTheoKy: donGiaTienAnKy,
            donGiaTienAnTangCaTheoKy: donGiaTienAnTangCaKy,
            attendanceSettings,
          }),
        };
      }),
    [
      rows,
      nam,
      thang,
      chamDong,
      nhanTheoChuanTen,
      nhanTheoId,
      donGiaTienAnKy,
      donGiaTienAnTangCaKy,
      attendanceSettings,
    ]
  );

  const groupedWithKetQua = useMemo(() => {
    const groups = new Map<string, typeof withKetQua>();
    for (const item of withKetQua) {
      const group = groups.get(item.coSo) ?? [];
      group.push(item);
      groups.set(item.coSo, group);
    }
    return Array.from(groups, ([coSo, items]) => {
      const tongDoanhSoNhanSu = items.reduce(
        (total, item) => total + (Number(item.input.tongDoanhThu) || 0),
        0
      );
        const tongDoanhSoCoSo = revenueCache
          ? revenueCache.branchTotals.get(branchKey(coSo)) ?? 0
          : null;
      return {
        coSo,
        items,
        tongDoanhSoNhanSu,
        tongDoanhSoCoSo,
        chenhLechDoanhSo: tongDoanhSoCoSo == null ? null : tongDoanhSoCoSo - tongDoanhSoNhanSu,
      };
    }).sort((a, b) => a.coSo.localeCompare(b.coSo, 'vi'));
  }, [withKetQua, revenueCache]);

  const updateRow = useCallback(
    (id: string, patch: Partial<BangLuongChamCongInput>) => {
      if (!isAdmin) return;
      setSaveNotice(null);
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

  const setBonusNote = useCallback(
    (id: string, raw: string) => {
      const bonus = bonusAmountFromNote(raw);
      updateRow(id, {
        ghiChuThuongThang: raw,
        ...(bonus != null ? { thuongKhac: bonus } : {}),
      });
    },
    [updateRow]
  );

  const setEmployeeName = useCallback(
    (id: string, hoTen: string) => {
      const meta = nhanTheoChuanTen.get(chuanHoaTenSoSanh(hoTen));
      updateRow(id, {
        hoTen,
        ...(meta
          ? {
              nhanSuId: meta.id,
              coSo: meta.coSo,
              luongCoBan: meta.luongCoBan,
              ngayBatDauLam: meta.ngayVaoLam ?? '',
            }
          : {}),
      });
    },
    [nhanTheoChuanTen, updateRow]
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

  const persistPeriodMealPrices = async (
    normalPrice: number,
    overtimePrice: number,
    askForConfirmation: boolean
  ): Promise<boolean> => {
    if (!isAdmin) return false;
    const normalizedNormal = Math.max(0, Math.round(normalPrice));
    const normalizedOvertime = Math.max(0, Math.round(overtimePrice));

    if (!kyDaLuu) {
      setDonGiaTienAnKy(normalizedNormal);
      setDonGiaTienAnDaChot(normalizedNormal);
      setDonGiaTienAnTangCaKy(normalizedOvertime);
      setDonGiaTienAnTangCaDaChot(normalizedOvertime);
      return true;
    }

    if (askForConfirmation) {
      const accepted = window.confirm(
        `Cập nhật riêng kỳ ${thang}/${nam}: ăn thường ${formatVnd(normalizedNormal)}/bữa, ăn tăng ca ${formatVnd(normalizedOvertime)}/bữa? Các kỳ khác không thay đổi.`
      );
      if (!accepted) {
        setDonGiaTienAnKy(donGiaTienAnDaChot);
        setDonGiaTienAnTangCaKy(donGiaTienAnTangCaDaChot);
        return false;
      }
    }

    const rowsRecalculatedByCount = rows.map((row) => ({
      ...row,
      // Đơn giá kỳ luôn tính lại đúng theo số bữa, không giữ số tiền ghi đè cũ.
      tienAn: null,
      tienAnTangCa: null,
    }));
    try {
      setSavingPeriodMealPrice(true);
      await syncPayrollFromAttendance(thang, nam, undefined, {
        rows: rowsRecalculatedByCount,
        donGiaTienAnTheoKy: normalizedNormal,
        donGiaTienAnTangCaTheoKy: normalizedOvertime,
        ghiDeDonGiaTienAnDaChot: true,
        chiCapNhatTienAn: true,
      });
      setRows(rowsRecalculatedByCount);
      setDonGiaTienAnKy(normalizedNormal);
      setDonGiaTienAnDaChot(normalizedNormal);
      setDonGiaTienAnTangCaKy(normalizedOvertime);
      setDonGiaTienAnTangCaDaChot(normalizedOvertime);
      return true;
    } catch (e) {
      console.error('Cập nhật đơn giá tiền ăn của kỳ:', e);
      setDonGiaTienAnKy(donGiaTienAnDaChot);
      setDonGiaTienAnTangCaKy(donGiaTienAnTangCaDaChot);
      window.alert('Không thể cập nhật đơn giá kỳ này. Dữ liệu trước đó được giữ nguyên.');
      return false;
    } finally {
      setSavingPeriodMealPrice(false);
    }
  };

  const saveMealDefault = async () => {
    if (!isAdmin) return;
    const normalPrice = Math.max(0, Math.round(donGiaTienAnMacDinh));
    const overtimePrice = Math.max(0, Math.round(donGiaTienAnTangCaMacDinh));
    try {
      setSavingMealSetting(true);
      const [savedNormal, savedOvertime] = await Promise.all([
        saveDefaultMealUnitPrice(normalPrice),
        saveDefaultOvertimeMealUnitPrice(overtimePrice),
      ]);
      const savedNormalValue = Math.max(0, Number(savedNormal.gia_tri) || 0);
      const savedOvertimeValue = Math.max(0, Number(savedOvertime.gia_tri) || 0);
      setDonGiaTienAnMacDinh(savedNormalValue);
      setDonGiaTienAnTangCaMacDinh(savedOvertimeValue);

      const isCurrentCalendarPeriod = nam === y0 && thang === m0;
      let appliedToCurrentPeriod = false;
      if (isCurrentCalendarPeriod) {
        appliedToCurrentPeriod = await persistPeriodMealPrices(
          savedNormalValue,
          savedOvertimeValue,
          false
        );
      } else {
        const currentPayroll = await getPayrollBatch(m0, y0);
        if (currentPayroll.length > 0) {
          await syncPayrollFromAttendance(m0, y0, undefined, {
            donGiaTienAnTheoKy: savedNormalValue,
            donGiaTienAnTangCaTheoKy: savedOvertimeValue,
            ghiDeDonGiaTienAnDaChot: true,
            chiCapNhatTienAn: true,
          });
        }
        appliedToCurrentPeriod = true;
      }

      if (appliedToCurrentPeriod) {
        window.alert(
          `Đã lưu mức mặc định và cập nhật kỳ hiện tại ${m0}/${y0}. Các kỳ trước giữ nguyên.`
        );
      }
    } catch (e) {
      console.error('Lưu đơn giá tiền ăn mặc định:', e);
      window.alert('Không thể lưu đơn giá tiền ăn mặc định. Vui lòng kiểm tra kết nối.');
    } finally {
      setSavingMealSetting(false);
    }
  };

  const updateCurrentPeriodMealPrice = async () => {
    if (!isAdmin || !kyDaLuu) return;
    const normalPrice = Math.max(0, Math.round(donGiaTienAnKy));
    const overtimePrice = Math.max(0, Math.round(donGiaTienAnTangCaKy));
    if (
      normalPrice === donGiaTienAnDaChot &&
      overtimePrice === donGiaTienAnTangCaDaChot
    ) {
      return;
    }
    const updated = await persistPeriodMealPrices(normalPrice, overtimePrice, true);
    if (updated) {
      window.alert(`Đã cập nhật riêng đơn giá tiền ăn kỳ ${thang}/${nam}.`);
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
          nhanSuId: p.id,
          coSo: p.co_so?.trim() || 'Chưa xác định',
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

  const persistPayroll = useCallback(async (openAfterSave: boolean) => {
    if (!isAdmin) {
      window.alert('Chỉ tài khoản admin được lưu hoặc chỉnh sửa bảng lương.');
      return;
    }
    if (
      kyDaLuu &&
      (donGiaTienAnKy !== donGiaTienAnDaChot ||
        donGiaTienAnTangCaKy !== donGiaTienAnTangCaDaChot)
    ) {
      window.alert('Đơn giá kỳ này đang thay đổi. Hãy bấm “Cập nhật kỳ” trước khi lưu bảng lương.');
      return;
    }
    try {
      setSavingPayroll(true);
      setSaveNotice(null);
      const result = await syncPayrollFromAttendance(thang, nam, undefined, {
        rows,
        donGiaTienAnTheoKy: donGiaTienAnKy,
        donGiaTienAnTangCaTheoKy: donGiaTienAnTangCaKy,
      });
      setKyDaLuu(true);
      setSaveNotice(
        result.skippedLockedCount > 0
          ? {
              kind: 'warning',
              text: `Đã lưu ${result.syncedCount} nhân sự; bỏ qua ${result.skippedLockedCount} dòng đã khóa/đã chi trả. Hãy mở khóa có lý do trước khi sửa.`,
            }
          : {
              kind: 'success',
              text: `Đã lưu thay đổi kỳ ${thang}/${nam}.`,
            }
      );
      if (openAfterSave && result.skippedLockedCount === 0) {
        navigate('/tien-luong/bang-luong');
      }
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
  }, [
    donGiaTienAnDaChot,
    donGiaTienAnKy,
    donGiaTienAnTangCaDaChot,
    donGiaTienAnTangCaKy,
    isAdmin,
    kyDaLuu,
    nam,
    navigate,
    rows,
    thang,
  ]);

  const savePayrollOnly = useCallback(() => {
    void persistPayroll(false);
  }, [persistPayroll]);

  const saveAndOpenPayroll = useCallback(() => {
    void persistPayroll(true);
  }, [persistPayroll]);

  const moChiTietDon = useCallback(
    async (input: BangLuongChamCongInput) => {
      const ten = input.hoTen.trim();
      if (!ten) return;
      setOrdersModal({ hoTen: ten, orders: [], loading: true });
      try {
        let data = revenueCache;
        if (!data) {
          data = await loadPayrollRevenueData(nam, thang);
          setRevenueCache(data);
        }
        const orders = input.nhanSuId
          ? data.personnelOrdersById.get(input.nhanSuId) || []
          : layDonTheoHoTen(ten, data, nhanTheoChuanTen);
        setOrdersModal({ hoTen: ten, orders, loading: false });
      } catch (e) {
        console.error(e);
        setOrdersModal(null);
        window.alert('Không tải được danh sách đơn hàng.');
      }
    },
    [revenueCache, nam, thang, nhanTheoChuanTen, setOrdersModal]
  );

  const thCell = (short: string, full: string, onClick?: () => void, align: 'left' | 'right' = 'left') => (
    <th
      className={clsx(
        'sticky top-0 z-[1] min-w-24 bg-muted/95 backdrop-blur border-b border-border px-3 py-3.5 text-xs sm:text-sm font-semibold text-muted-foreground whitespace-normal',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      title={full}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className={clsx('font-semibold text-primary underline-offset-4 hover:underline', align === 'right' && 'text-right')}>
          {short}
        </button>
      ) : short}
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
            <button
              type="button"
              onClick={() => setShowMealPriceEditor(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
              title={`Thiết lập đơn giá tiền ăn mặc định và riêng kỳ ${thang}/${nam}`}
              aria-label={`Thiết lập tiền ăn kỳ ${thang}/${nam}: thường ${formatTienNhap(donGiaTienAnKy)} đồng, tăng ca ${formatTienNhap(donGiaTienAnTangCaKy)} đồng`}
            >
              <Utensils className="h-4 w-4 shrink-0" />
              <span>Tiền ăn</span>
              <span className="rounded bg-background/90 px-1.5 py-0.5 font-mono text-foreground">
                {formatDonGiaGon(donGiaTienAnKy)}
              </span>
              <span className="text-emerald-700/70 dark:text-emerald-300/70">· TC</span>
              <span className="rounded bg-background/90 px-1.5 py-0.5 font-mono text-foreground">
                {formatDonGiaGon(donGiaTienAnTangCaKy)}
              </span>
            </button>
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
              onClick={savePayrollOnly}
              disabled={!isAdmin || savingPayroll || revenueLoading || quickLoading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-600 text-white text-sm font-semibold px-3 py-2 hover:bg-emerald-700 disabled:opacity-50"
              title={isAdmin ? 'Lưu thay đổi và tiếp tục ở trang hiện tại' : 'Chỉ admin được lưu bảng lương'}
            >
              {savingPayroll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingPayroll ? 'Đang lưu' : 'Lưu thay đổi'}
            </button>
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
              title="Đơn thuộc đúng tháng/năm kỳ; giá trị được chia đều giữa nhân sự phụ trách duy nhất. Nhân sự trùng tên sẽ chia chung một tổng để không nhân đôi doanh số."
            >
              {revenueLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Doanh số
            </button>
            <button
              type="button"
              onClick={() => navigate(`/tien-luong/doi-soat-doanh-so?thang=${thang}&nam=${nam}`)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
              title="Mở trang so sánh doanh số bảng lương với phiếu bán hàng"
            >
              <GitCompareArrows className="h-4 w-4" />
              Rà soát DS
            </button>
            <button
              type="button"
              onClick={() => navigate(`/tien-luong/doi-soat-cham-cong?thang=${thang}&nam=${nam}`)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              title="Mở trang so sánh ngày công bảng lương với dữ liệu chấm công gốc"
            >
              <Clock3 className="h-4 w-4" />
              Rà soát công
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

      {saveNotice && (
        <div
          className={clsx(
            'flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
            saveNotice.kind === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-amber-300 bg-amber-50 text-amber-700'
          )}
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {saveNotice.text}
        </div>
      )}

      <details className="group shrink-0 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-950">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold">
          <Calculator className="h-4 w-4 text-blue-600" />
          Công thức tính lương
          <span className="ml-auto text-xs font-medium text-blue-700 group-open:hidden">Bấm để xem</span>
        </summary>
        <div className="grid gap-2 border-t border-blue-200 px-3 py-3 text-xs sm:grid-cols-2 sm:text-sm">
          <div><strong>Lương ngày:</strong> Lương cơ bản ÷ {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG}.</div>
          <div><strong>Lương theo công:</strong> Lương ngày × tổng ngày công.</div>
          <div>
            <strong>Lương giờ:</strong> Lương cơ bản ÷ {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG} ÷ {attendanceSettings.standardWorkMinutes / 60} giờ.
          </div>
          <div>
            <strong>Tiền tăng ca:</strong> Số giờ tăng ca × lương giờ × {ATTENDANCE_SALARY.HE_SO_TANG_CA}.
          </div>
          <div>
            <strong>Giờ tăng ca:</strong> mỗi ngày lấy giờ ra muộn nhất, chỉ tính phần sau {attendanceSettings.overtimeStart}; tối đa {attendanceSettings.maxOvertimeHoursMonth} giờ/tháng.
          </div>
          <div>
            <strong>Chuyên cần:</strong> đủ {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG} công được {formatVnd(ATTENDANCE_SALARY.PHU_CAP_CHUYEN_CAN)}; số sửa tay được dùng ngay.
          </div>
          <p className="sm:col-span-2 text-blue-800">
            Khi sửa Lương, Chuyên cần hoặc các phụ cấp, Tổng lương đổi ngay trên dòng. Bấm “Lưu thay đổi” để ghi dữ liệu mà vẫn ở nguyên trang.
          </p>
        </div>
      </details>

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
                  'Doanh số phiếu được phân bổ cho nhân viên. Bấm tiêu đề để rà soát.',
                  () => navigate(`/tien-luong/doi-soat-doanh-so?thang=${thang}&nam=${nam}`),
                  'right'
                )}
                {thCell('Loại', 'Chính thức / thời vụ')}
                {thCell('Lương cơ bản', 'Lương cơ bản riêng của kỳ; bấm số tiền để sửa.', undefined, 'right')}
                {thCell(
                  'Ngày công',
                  'Ngày công từ chấm công và số ngày điều chỉnh thêm. Bấm tiêu đề để rà soát.',
                  () => navigate(`/tien-luong/doi-soat-cham-cong?thang=${thang}&nam=${nam}`),
                  'right'
                )}
                {thCell('Chuyên cần', 'Đủ 28 công trong kỳ được hưởng 200.000đ; bấm số tiền để điều chỉnh.', undefined, 'right')}
                {thCell(
                  'Tiền tăng ca',
                  `Giờ tăng ca × lương giờ × ${1.5}; tối đa 25 giờ/tháng. Chi tiết nằm trong gợi ý của ô.`,
                  undefined,
                  'right'
                )}
                {thCell('Xăng xe & điện thoại', 'Điện thoại 200.000đ + xăng xe/đi lại 300.000đ; bấm để điều chỉnh.', undefined, 'right')}
                {thCell('Thâm niên', '50.000đ × số tháng làm việc, tối đa 600.000đ; bấm để điều chỉnh.', undefined, 'right')}
                {thCell('Trọ ngoài', 'Phụ cấp trọ ngoài; bấm số tiền để nhập.', undefined, 'right')}
                {thCell(
                  'Tiền ăn',
                  `Tiền ăn thường theo số bữa và đơn giá ${formatVnd(donGiaTienAnKy)}; bấm để sửa số bữa.`,
                  undefined,
                  'right'
                )}
                {thCell(
                  'Tiền ăn tăng ca',
                  `Tiền ăn tăng ca theo số bữa và đơn giá ${formatVnd(donGiaTienAnTangCaKy)}; bấm để sửa số bữa.`,
                  undefined,
                  'right'
                )}
                {thCell('Thưởng tháng', 'Khoản thưởng tùy ý; bấm số tiền để nhập.', undefined, 'right')}
                {thCell('Ghi chú thưởng', 'Nhập nội dung; nếu có số tiền, số đó được cộng ngay vào Thưởng tháng')}
                {thCell('Tỷ lệ HH', 'Tỷ lệ hoa hồng riêng; bấm để sửa.', undefined, 'right')}
                {thCell('Tiền hoa hồng', 'Doanh số đã phân bổ nhân viên × tỷ lệ hoa hồng; chi tiết trong gợi ý.', undefined, 'right')}
                {thCell('Tổng thu nhập', 'Tổng các khoản thu nhập trong kỳ.', undefined, 'right')}
                {thCell('Ghi chú', 'Cảnh báo')}
                {isAdmin && (
                  <th className="sticky top-0 right-0 z-[2] bg-muted/80 backdrop-blur border-b border-l border-border px-2 py-3 text-center text-xs sm:text-sm font-semibold text-muted-foreground whitespace-nowrap w-14">
                    Xóa
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {groupedWithKetQua.map(({ coSo, items, tongDoanhSoNhanSu, tongDoanhSoCoSo, chenhLechDoanhSo }) => (
                <Fragment key={coSo}>
                  <tr className="border-y border-primary/20 bg-primary/8">
                    <td colSpan={isAdmin ? 20 : 19} className="px-3 py-3">
                      <div className="sticky left-3 flex w-fit items-center gap-2 font-bold text-primary">
                        <Building2 className="h-4 w-4" />
                        <span>{coSo}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                          {items.length} nhân sự
                        </span>
                        <span
                          className="inline-flex items-baseline gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          title="Tổng doanh số cơ sở theo cùng dữ liệu phiếu bán và bộ lọc cơ sở của trang Phiếu bán hàng."
                        >
                          Doanh số cơ sở
                          {tongDoanhSoCoSo == null ? (
                            <strong>{revenueLoading ? 'Đang đồng bộ…' : 'Chưa tải được'}</strong>
                          ) : (
                            <MoneyValue value={tongDoanhSoCoSo} strong />
                          )}
                        </span>
                        {chenhLechDoanhSo != null && chenhLechDoanhSo !== 0 && (
                          <button
                            type="button"
                            onClick={() => setOrdersModal({ hoTen: coSo, loading: false, issueMode: true,
                              orders: revenueCache?.allocationIssues.filter(order => order.branches?.includes(branchKey(coSo))) || [] })}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            title={`Tổng nhân viên: ${formatVnd(tongDoanhSoNhanSu)}. Bấm xem mã phiếu và lý do chưa khớp.`}
                          >
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            Kiểm tra phân công phiếu
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {items.map((x, i) => {
                    const { input, kq, gTcTuCham } = x;
                    const isEditingName = editingNameId === input.id;
                    return (
                      <tr
                        key={input.id}
                        className={clsx('group border-b border-border/60 transition-colors hover:bg-muted/40', i % 2 === 0 && 'bg-muted/5')}
                      >
                    <td className="sticky left-0 z-[1] bg-card/90 border-r border-border px-2.5 py-2.5 text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="min-w-[16rem] px-3 py-3">
                      {isEditingName ? (
                        <input
                          autoFocus
                          className="min-h-10 w-full rounded-md border border-primary/40 bg-background px-2.5 py-2 text-sm outline-none ring-2 ring-primary/15 focus:border-primary"
                          aria-label={`Tên nhân viên dòng ${i + 1}`}
                          value={input.hoTen}
                          onChange={(event) => setEmployeeName(input.id, event.target.value)}
                          onBlur={() => setEditingNameId(null)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === 'Escape') setEditingNameId(null);
                          }}
                        />
                      ) : (
                        <div className="group/name flex min-h-10 items-center gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            title={input.hoTen.trim() ? 'Bấm tên để xem các phiếu đã tính doanh số.' : 'Chưa nhập tên nhân viên.'}
                            onClick={() => {
                              if (!input.hoTen.trim()) {
                                if (isAdmin) setEditingNameId(input.id);
                                return;
                              }
                              void moChiTietDon(input);
                            }}
                          >
                            <span className="block truncate">{input.hoTen || 'Chưa có tên'}</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group-hover/name:opacity-100 [@media(hover:none)]:opacity-100"
                              aria-label={`Sửa tên ${input.hoTen || `nhân viên dòng ${i + 1}`}`}
                              title="Sửa tên nhân viên"
                              onClick={() => setEditingNameId(input.id)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="bg-primary/[0.03] px-2 py-2 text-right">
                      <EditableTableValue
                        value={formatTienNhap(input.tongDoanhThu)}
                        display={<MoneyValue value={input.tongDoanhThu} strong />}
                        onChange={(value) => setTien(input.id, 'tongDoanhThu', value)}
                        disabled={!isAdmin}
                        ariaLabel={`doanh số tháng của ${input.hoTen}`}
                        title="Doanh số phiếu đã phân bổ. Nhân sự trùng tên chia chung một tổng; bấm để điều chỉnh."
                      />
                    </td>
                    <td className="px-2 py-2">
                      <EditableTypeValue
                        value={input.loai}
                        disabled={!isAdmin}
                        name={input.hoTen || `dòng ${i + 1}`}
                        onChange={(value) => updateRow(input.id, { loai: value })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <EditableTableValue
                        value={formatTienNhap(input.luongCoBan)}
                        display={<MoneyValue value={input.luongCoBan} />}
                        onChange={(value) => setTien(input.id, 'luongCoBan', value)}
                        disabled={!isAdmin}
                        ariaLabel={`lương cơ bản của ${input.hoTen}`}
                        title="Lương cơ bản riêng của kỳ đang chọn; bấm để sửa."
                      />
                    </td>
                    <td className="min-w-[9rem] px-2 py-2 text-right">
                      <EditableTableValue
                        value={String(input.soNgayCongThem ?? 0)}
                        display={<span className="font-semibold">{kq.soNgayCongDung} công</span>}
                        onChange={(value) => setNum(input.id, 'soNgayCongThem', value)}
                        disabled={!isAdmin}
                        ariaLabel={`ngày công điều chỉnh thêm của ${input.hoTen}`}
                        title={`Chấm công ${kq.soNgayCongTuCham} ngày; điều chỉnh thêm ${input.soNgayCongThem ?? 0} ngày. Tiền theo công: (${formatVnd(kq.lcbHieuLuc)} ÷ 28) × ${kq.soNgayCongDung}.`}
                      />
                      <div className="pr-2.5 pt-0.5 text-right text-xs text-muted-foreground">Từ chấm công {kq.soNgayCongTuCham} · thêm {input.soNgayCongThem ?? 0}</div>
                      <div className="px-2.5 pt-1 text-right"><MoneyValue value={kq.tienTheoCong} /></div>
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
                    <td className="px-2 py-2 text-right" title={`${gTcTuCham !== undefined ? 'Theo chấm công' : 'Nhập tay'}: ${kq.gioTangCaApDung} giờ × ${formatVnd(kq.luongGio)} × ${ATTENDANCE_SALARY.HE_SO_TANG_CA}`}>
                      <div className="px-2.5"><MoneyValue value={kq.luongTangCa} strong /></div>
                      <div className="px-2.5 pt-0.5 text-xs text-muted-foreground">{kq.gioTangCaApDung} giờ tăng ca</div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <EditableTableValue
                        value={formatTienNhap(input.phuCapXangDienThoai ?? kq.phuCapXangDienThoai)}
                        display={<MoneyValue value={kq.phuCapXangDienThoai} />}
                        onChange={(value) => setOptionalTien(input.id, 'phuCapXangDienThoai', value)}
                        disabled={!isAdmin}
                        ariaLabel={`phụ cấp xăng xe và điện thoại của ${input.hoTen}`}
                        title="Bấm để sửa phụ cấp. Xóa giá trị trong ô sửa để trở về mức mặc định."
                      />
                    </td>
                    <td className="px-2 py-2 text-right" title={input.ngayBatDauLam ? `${kq.thangLamViec} tháng làm việc đến hết ${String(thang).padStart(2, '0')}/${nam}` : 'Chưa có ngày vào làm'}>
                      <EditableTableValue
                        value={formatTienNhap(input.phuCapThamNien ?? kq.phuCapThamNien)}
                        display={<MoneyValue value={kq.phuCapThamNien} />}
                        onChange={(value) => setOptionalTien(input.id, 'phuCapThamNien', value)}
                        disabled={!isAdmin}
                        ariaLabel={`phụ cấp thâm niên của ${input.hoTen}`}
                        title="Bấm để sửa; xóa giá trị trong ô sửa để tính lại theo ngày vào làm."
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <EditableTableValue
                        value={formatTienNhap(input.phuCapTroNgoai ?? 0)}
                        display={<MoneyValue value={input.phuCapTroNgoai ?? 0} />}
                        onChange={(value) => setTien(input.id, 'phuCapTroNgoai', value)}
                        disabled={!isAdmin}
                        ariaLabel={`phụ cấp trọ ngoài của ${input.hoTen}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right" title={`${kq.soBuaAnThuong} bữa × ${formatVnd(kq.donGiaTienAn)}`}>
                      <EditableTableValue
                        value={String(input.soBuaAnThuong ?? kq.soBuaAnThuong)}
                        display={<span className="flex flex-col items-end"><MoneyValue value={kq.tienAn} strong /><span className="pt-0.5 text-xs text-muted-foreground">{kq.soBuaAnThuong} bữa</span></span>}
                        onChange={(value) => setMealCount(input.id, 'soBuaAnThuong', value)}
                        disabled={!isAdmin}
                        ariaLabel={`số bữa ăn thường của ${input.hoTen}`}
                        title="Bấm để sửa số bữa; xóa giá trị để lấy lại từ chấm công. Đơn giá trong gợi ý."
                      />
                    </td>
                    <td className="px-2 py-2 text-right" title={`${kq.soBuaAnTangCa} bữa tăng ca × ${formatVnd(kq.donGiaTienAnTangCa)}`}>
                      <EditableTableValue
                        value={String(input.soBuaAnTangCa ?? kq.soBuaAnTangCa)}
                        display={<span className="flex flex-col items-end"><MoneyValue value={kq.tienAnTangCa} strong /><span className="pt-0.5 text-xs text-muted-foreground">{kq.soBuaAnTangCa} bữa</span></span>}
                        onChange={(value) => setMealCount(input.id, 'soBuaAnTangCa', value)}
                        disabled={!isAdmin}
                        ariaLabel={`số bữa ăn tăng ca của ${input.hoTen}`}
                        title="Bấm để sửa số bữa; xóa giá trị để lấy lại từ chấm công. Đơn giá trong gợi ý."
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <EditableTableValue
                        value={formatTienNhap(input.thuongKhac ?? 0)}
                        display={<MoneyValue value={input.thuongKhac ?? 0} />}
                        onChange={(value) => setTien(input.id, 'thuongKhac', value)}
                        disabled={!isAdmin}
                        ariaLabel={`thưởng tháng của ${input.hoTen}`}
                      />
                    </td>
                    <td className="min-w-[12rem] px-2 py-2">
                      <EditableTableValue
                        value={input.ghiChuThuongThang ?? ''}
                        display={input.ghiChuThuongThang?.trim() || <span className="text-muted-foreground">Thêm ghi chú</span>}
                        onChange={(value) => setBonusNote(input.id, value)}
                        disabled={!isAdmin}
                        inputMode="text"
                        align="left"
                        className="text-left"
                        ariaLabel={`ghi chú thưởng của ${input.hoTen}`}
                        placeholder="VD: Đạt chỉ tiêu 500.000"
                        title="Bấm để thêm ghi chú; số tiền trong ghi chú sẽ được cộng vào thưởng tháng."
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <EditableTableValue
                        value={String(input.phanTramHoaHong)}
                        display={<span>{kq.phanTramHoaHongApDung}<span className="ml-1 text-xs text-muted-foreground">%</span></span>}
                        onChange={(value) => setCommissionPercent(input.id, value)}
                        disabled={!isAdmin}
                        inputMode="decimal"
                        ariaLabel={`tỷ lệ hoa hồng của ${input.hoTen || `dòng ${i + 1}`}`}
                        title="Bấm để sửa tỷ lệ hoa hồng riêng."
                      />
                    </td>
                    <td
                      className="px-2 py-2 text-right"
                      title={`${kq.phanTramHoaHongApDung}% × ${formatVnd(input.tongDoanhThu)}`}
                    >
                      <div className="px-2.5"><MoneyValue value={kq.hoaHong} /></div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="px-2.5 text-base font-bold text-primary"><MoneyValue value={kq.tongCong} strong /></div>
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-left text-xs leading-5 text-amber-700 dark:text-amber-400">
                      {kq.ghiChu}
                    </td>
                    {isAdmin && (
                      <td className="sticky right-0 z-[1] border-l border-border bg-card/95 px-1.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(input.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                          title="Xóa dòng"
                          aria-label={`Xóa dòng của ${input.hoTen || `nhân viên dòng ${i + 1}`}`}
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showMealPriceEditor && (
        <div
          className="fixed inset-0 z-[100001] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowMealPriceEditor(false);
          }}
        >
          <div
            className="w-full max-w-xl rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-price-editor-title"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Utensils className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="meal-price-editor-title" className="font-bold text-foreground">Thiết lập tiền ăn</h2>
                  <p className="text-xs text-muted-foreground">Đơn vị: đồng/bữa</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMealPriceEditor(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                aria-label="Đóng thiết lập tiền ăn"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Đơn giá mặc định</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Áp dụng cho kỳ mới; kỳ cũ được giữ nguyên.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Thường
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right font-mono text-sm text-foreground"
                      value={formatTienNhap(donGiaTienAnMacDinh)}
                      disabled={!isAdmin || savingMealSetting}
                      onChange={(event) => setDonGiaTienAnMacDinh(parseTienNhap(event.target.value))}
                      aria-label="Đơn giá tiền ăn thường mặc định"
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Tăng ca
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right font-mono text-sm text-foreground"
                      value={formatTienNhap(donGiaTienAnTangCaMacDinh)}
                      disabled={!isAdmin || savingMealSetting}
                      onChange={(event) => setDonGiaTienAnTangCaMacDinh(parseTienNhap(event.target.value))}
                      aria-label="Đơn giá tiền ăn tăng ca mặc định"
                    />
                  </label>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={saveMealDefault}
                    disabled={savingMealSetting}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingMealSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingMealSetting ? 'Đang lưu...' : 'Lưu mặc định'}
                  </button>
                )}
              </section>

              <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Riêng kỳ {thang}/{nam}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">Chỉ thay đổi đơn giá của kỳ đang chọn.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Thường
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right font-mono text-sm text-foreground"
                      value={formatTienNhap(donGiaTienAnKy)}
                      disabled={!isAdmin || savingPeriodMealPrice}
                      onChange={(event) => setDonGiaTienAnKy(parseTienNhap(event.target.value))}
                      aria-label={`Đơn giá tiền ăn kỳ ${thang}/${nam}`}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Tăng ca
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right font-mono text-sm text-foreground"
                      value={formatTienNhap(donGiaTienAnTangCaKy)}
                      disabled={!isAdmin || savingPeriodMealPrice}
                      onChange={(event) => setDonGiaTienAnTangCaKy(parseTienNhap(event.target.value))}
                      aria-label={`Đơn giá tiền ăn tăng ca kỳ ${thang}/${nam}`}
                    />
                  </label>
                </div>
                {isAdmin && kyDaLuu ? (
                  <button
                    type="button"
                    onClick={updateCurrentPeriodMealPrice}
                    disabled={
                      savingPeriodMealPrice ||
                      (donGiaTienAnKy === donGiaTienAnDaChot &&
                        donGiaTienAnTangCaKy === donGiaTienAnTangCaDaChot)
                    }
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingPeriodMealPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingPeriodMealPrice ? 'Đang cập nhật...' : 'Cập nhật kỳ'}
                  </button>
                ) : (
                  <p className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-center text-[11px] text-muted-foreground">
                    Giá sẽ được chốt khi lưu bảng lương kỳ này.
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      <PersonnelRevenueOrdersModal
        isOpen={ordersModal !== null}
        onClose={() => setOrdersModal(null)}
        hoTen={ordersModal?.hoTen ?? ''}
        thang={thang}
        nam={nam}
        orders={ordersModal?.orders ?? []}
        issueMode={ordersModal?.issueMode}
        loading={ordersModal?.loading ?? false}
      />
    </div>
  );
};

export default PayrollAttendanceSalaryPage;
