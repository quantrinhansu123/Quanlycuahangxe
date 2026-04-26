import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Download, Plus, Table2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import {
  ATTENDANCE_SALARY,
  type BangLuongChamCongInput,
  type LoaiNhanVien,
  formatVnd,
  tinhMotDong,
} from '../data/payrollAttendanceSalary';

const LS_PREFIX = 'payrollChamCongLuongV1:';

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

function loadRows(y: number, m: number): BangLuongChamCongInput[] {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${y}-${m}`);
    if (raw) {
      const parsed = JSON.parse(raw) as BangLuongChamCongInput[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [emptyRow()];
}

type NumKey = keyof Pick<
  BangLuongChamCongInput,
  | 'luongCoBan'
  | 'soNgayCong'
  | 'soNgayLamTaiQuan'
  | 'soNgayKhongLamTaiQuan'
  | 'soNgayTangCaAn'
  | 'soGioTangCa'
  | 'tongDoanhThu'
  | 'phanTramHoaHong'
  | 'thuongKhac'
  | 'khoanTru'
>;

const PayrollAttendanceSalaryPage: React.FC = () => {
  const now = new Date();
  const [nam, setNam] = useState(now.getFullYear());
  const [thang, setThang] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<BangLuongChamCongInput[]>(() => loadRows(now.getFullYear(), now.getMonth() + 1));

  useEffect(() => {
    setRows(loadRows(nam, thang));
  }, [nam, thang]);

  useEffect(() => {
    try {
      localStorage.setItem(`${LS_PREFIX}${nam}-${thang}`, JSON.stringify(rows));
    } catch {
      // ignore quota
    }
  }, [rows, nam, thang]);

  const withKetQua = useMemo(
    () => rows.map((r) => ({ input: r, kq: tinhMotDong(r, nam, thang) })),
    [rows, nam, thang]
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

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const exportExcel = useCallback(() => {
    const flat = withKetQua.map((x, i) => ({
      STT: i + 1,
      'Họ tên': x.input.hoTen,
      'Loại': x.input.loai === 'chinh_thuc' ? 'Chính thức' : 'Thời vụ',
      'Lương cơ bản (nhập)': x.input.luongCoBan,
      'Ngày công': x.input.soNgayCong,
      'Ngày tại quán': x.input.soNgayLamTaiQuan,
      'Ngày không tại quán': x.input.soNgayKhongLamTaiQuan,
      'Ngày TC (bữa ăn)': x.input.soNgayTangCaAn,
      'Giờ tăng ca': x.input.soGioTangCa,
      'Doanh thu': x.input.tongDoanhThu,
      '% hoa hồng': x.input.phanTramHoaHong,
      'Bắt đầu làm': x.input.ngayBatDauLam,
      'Thưởng khác': x.input.thuongKhac,
      'Khoản trừ': x.input.khoanTru,
      'LCB hiệu lực (có thâm niên năm)': x.kq.lcbHieuLuc,
      'Lương theo công (ngày)': x.kq.luongNgay * x.input.soNgayCong,
      'Tiền ăn': x.kq.tienAn,
      'PC chuyên cần': x.kq.phuCapChuyenCan,
      'PC xăng/ĐT': x.kq.phuCapXangDienThoai,
      'PC thâm niên (50k/600k)': x.kq.phuCapThamNien,
      'Cộng vào LCB theo năm': x.kq.tangThemVaoLcbTheoNam,
      'Lương tăng ca': x.kq.luongTangCa,
      'Hoa hồng': x.kq.hoaHong,
      'Tổng cộng': x.kq.tongCong,
      'Ghi chú': x.kq.ghiChu,
    }));
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BangLuongChamCong');
    XLSX.writeFile(wb, `bang_luong_cham_cong_${thang}_${nam}.xlsx`);
  }, [withKetQua, thang, nam]);

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
            Quy ước: ngày lương = LCB ÷ {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG}, giờ = LCB ÷{' '}
            {ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG} ÷ {ATTENDANCE_SALARY.GIO_MOT_NGAY}. Tiền ăn{' '}
            {formatVnd(ATTENDANCE_SALARY.GIA_MOT_BUA_AN)}/bữa. Tăng ca: hệ số {ATTENDANCE_SALARY.HE_SO_TANG_CA * 100}
            %, tối đa {ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG}h, chỉ thợ chính thức.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Kỳ</span>
            <select
              className="bg-transparent text-[12px] font-medium outline-none"
              value={thang}
              onChange={(e) => setThang(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
            <select
              className="bg-transparent text-[12px] font-medium outline-none"
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
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium px-3 py-1.5 hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm dòng
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background text-[12px] font-medium px-3 py-1.5 hover:bg-muted/50"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel
          </button>
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
                {thCell('Công', 'Số ngày công')}
                {thCell('Tại quán', 'Số ngày làm tại quán (2 bữa/ngày)')}
                {thCell('Không tại', 'Số ngày không tại quán (1 bữa/ngày)')}
                {thCell('TC ăn', 'Số ngày tăng ca sau giờ ăn (+1 bữa/ngày)')}
                {thCell('H TC', 'Số giờ tăng ca')}
                {thCell('Doanh thu', 'Tổng doanh thu (hoa hồng)')}
                {thCell('%HH', 'Phần trăm hoa hồng')}
                {thCell('Bắt đầu', 'Ngày bắt đầu làm (YYYY-MM-DD)')}
                {thCell('Thưởng', 'Thưởng & phúc lợi khác (nhập tay)')}
                {thCell('Trừ', 'Khoản trừ')}
                {thCell('LCB*', 'LCB hiệu lực (cộng thâm niên theo năm vào LCB)')}
                {thCell('L công', 'Lương theo công = lương ngày × ngày công')}
                {thCell('Ăn', 'Tiền ăn')}
                {thCell('PCcc', 'Phụ cấp chuyên cần')}
                {thCell('PCxăng', 'Phụ cấp xăng/ĐT')}
                {thCell('PCtn', 'Phụ cấp thâm niên tháng')}
                {thCell('+LCB/năm', 'Cộng dồn vào LCB từ thâm niên năm')}
                {thCell('Th LV', 'Số tháng làm việc tới hết kỳ')}
                {thCell('H tính', 'Giờ tăng ca dùng để tính')}
                {thCell('L TC', 'Lương tăng ca')}
                {thCell('Hoa hồng', 'Hoa hồng doanh số')}
                {thCell('Tổng', 'Tổng cộng')}
                {thCell('Ghi chú', 'Cảnh báo')}
                <th className="sticky top-0 z-[1] bg-muted/80 w-8 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {withKetQua.map((x, i) => {
                const { input, kq } = x;
                const luongTheoCong = kq.luongNgay * Math.max(0, input.soNgayCong);
                return (
                  <tr
                    key={input.id}
                    className={clsx('border-b border-border/60 hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}
                  >
                    <td className="sticky left-0 z-[1] bg-card/90 border-r border-border px-1.5 py-1 text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className="w-28 min-w-0 bg-transparent border border-border/60 rounded px-1 py-0.5"
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
                        className="w-20 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                        value={String(input.luongCoBan)}
                        onChange={(e) => setNum(input.id, 'luongCoBan', e.target.value)}
                      />
                    </td>
                    {(
                  [
                    'soNgayCong',
                    'soNgayLamTaiQuan',
                    'soNgayKhongLamTaiQuan',
                    'soNgayTangCaAn',
                    'soGioTangCa',
                    'tongDoanhThu',
                    'phanTramHoaHong',
                  ] as const satisfies readonly NumKey[]
                ).map((k) => (
                  <td key={k} className="px-1 py-0.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-16 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                      value={String(input[k])}
                      onChange={(e) => setNum(input.id, k, e.target.value)}
                    />
                  </td>
                ))}
                    <td className="px-1 py-0.5">
                      <input
                        type="date"
                        className="w-32 bg-background border border-border/60 rounded px-1 py-0.5 text-[10px]"
                        value={input.ngayBatDauLam}
                        onChange={(e) => updateRow(input.id, { ngayBatDauLam: e.target.value })}
                      />
                    </td>
                    {(['thuongKhac', 'khoanTru'] as const).map((k) => (
                      <td key={k} className="px-1 py-0.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-16 bg-transparent border border-border/60 rounded px-1 py-0.5 text-right font-mono"
                          value={String(input[k])}
                          onChange={(e) => setNum(input.id, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {formatVnd(kq.lcbHieuLuc)}
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">{formatVnd(luongTheoCong)}</td>
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
                    <td className="px-1.5 py-1 text-right font-mono text-amber-700/90 dark:text-amber-400 whitespace-nowrap">
                      {formatVnd(kq.tangThemVaoLcbTheoNam)}
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">{kq.thangLamViec}</td>
                    <td className="px-1.5 py-1 text-center tabular-nums">{kq.gioTangCaApDung}</td>
                    <td className="px-1.5 py-1 text-right font-mono whitespace-nowrap">{formatVnd(kq.luongTangCa)}</td>
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
