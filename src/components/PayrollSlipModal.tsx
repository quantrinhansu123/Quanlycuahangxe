import { useEffect } from 'react';
import { BadgeDollarSign, Building2, CalendarDays, Printer, UserRound, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { BangLuong } from '../data/payrollData';

interface PayrollSlipModalProps {
  item: BangLuong;
  month: number;
  year: number;
  onClose: () => void;
}

const money = (value: unknown): string =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))} đ`;

const amount = (value: unknown): number => Number(value) || 0;

const statusClass = (status: string): string => {
  if (status === 'Đã chi trả') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Đã duyệt') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const PayrollSlipModal: React.FC<PayrollSlipModalProps> = ({ item, month, year, onClose }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const employeeName = item.nhan_su?.ho_ten || 'Nhân viên';
  const attendanceDays = amount(item.ngay_cong_thuc_te);
  const extraDays = amount(item.ngay_cong_them);
  const standardDays = amount(item.ngay_cong_chuan) || 28;
  const overtimeHours = amount(item.so_gio_tang_ca);
  const commission = amount(item.hoa_hong ?? item.luong_doanh_so);
  const totalDeduction =
    amount(item.tong_khau_tru) ||
    amount(item.bhxh) +
      amount(item.bhyt) +
      amount(item.bhtn) +
      amount(item.thue_tncn) +
      amount(item.khau_tru_khac);
  const slipCode = `PL-${year}${String(month).padStart(2, '0')}-${item.id.slice(0, 8).toUpperCase()}`;
  const printedDate = new Intl.DateTimeFormat('vi-VN').format(new Date());

  const incomeRows = [
    ['Lương theo ngày công', amount(item.luong_ngay_cong)],
    ['Lương tăng ca', amount(item.luong_lam_them)],
    ['Chuyên cần', amount(item.phu_cap_chuyen_can)],
    ['Xăng xe, điện thoại', amount(item.phu_cap_xang_dien_thoai)],
    ['Thâm niên', amount(item.phu_cap_tham_nien)],
    ['Trọ ngoài', amount(item.phu_cap_tro_ngoai)],
    ['Tiền ăn', amount(item.tien_an)],
    ['Tiền ăn tăng ca', amount(item.tien_an_tang_ca)],
    ['Hoa hồng / doanh số', commission],
    ['Thưởng tháng', amount(item.thuong_thang)],
  ] as const;

  const deductionRows = [
    ['Bảo hiểm xã hội (BHXH)', amount(item.bhxh)],
    ['Bảo hiểm y tế (BHYT)', amount(item.bhyt)],
    ['Bảo hiểm thất nghiệp (BHTN)', amount(item.bhtn)],
    ['Thuế thu nhập cá nhân', amount(item.thue_tncn)],
    ['Khấu trừ khác', amount(item.khau_tru_khac)],
  ] as const;

  return createPortal(
    <div className="payroll-slip-portal fixed inset-0 z-[100000]">
      <style>{`
        .payroll-slip-paper { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media screen and (max-width: 900px) {
          .payroll-slip-details { grid-template-columns: 1fr !important; }
        }
        @media print {
          @page { size: A4 portrait; margin: 9mm; }
          html, body { background: #fff !important; }
          body > * { display: none !important; }
          body > .payroll-slip-portal { display: block !important; }
          .payroll-slip-portal, .payroll-slip-overlay, .payroll-slip-dialog, .payroll-slip-scroll {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #fff !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .payroll-slip-toolbar { display: none !important; }
          .payroll-slip-paper {
            max-width: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .payroll-slip-details { grid-template-columns: 1.35fr 1fr !important; }
          .payroll-slip-no-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="payroll-slip-overlay flex h-full items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
        <div className="payroll-slip-dialog flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="payroll-slip-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div>
              <p className="font-bold text-slate-900">Xem trước phiếu lương</p>
              <p className="text-xs text-slate-500">{employeeName} · Tháng {month}/{year}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Printer size={17} /> In phiếu
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng phiếu lương"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={19} />
              </button>
            </div>
          </div>

          <div className="payroll-slip-scroll overflow-auto bg-slate-100 p-3 sm:p-6">
            <article className="payroll-slip-paper mx-auto max-w-[210mm] overflow-hidden rounded-xl bg-white p-5 text-slate-900 shadow-sm sm:p-8">
              <header className="payroll-slip-no-break border-b-2 border-emerald-600 pb-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                      <BadgeDollarSign size={27} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                        Quản lý chuỗi cửa hàng sửa xe
                      </p>
                      <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-950">PHIẾU LƯƠNG</h1>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Kỳ lương tháng {month}/{year}</p>
                    <p className="mt-1">Mã phiếu: {slipCode}</p>
                    <p>Ngày in: {printedDate}</p>
                  </div>
                </div>
              </header>

              <section className="payroll-slip-no-break mt-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div className="flex items-start gap-2.5">
                  <UserRound className="mt-0.5 text-emerald-600" size={18} />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nhân viên</p>
                    <p className="font-black text-slate-950">{employeeName}</p>
                    <p className="text-xs text-slate-500">{item.nhan_su?.vi_tri || 'Chưa cập nhật vị trí'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 sm:justify-end sm:text-right">
                  <Building2 className="mt-0.5 text-emerald-600" size={18} />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Đơn vị công tác</p>
                    <p className="font-bold text-slate-900">{item.co_so || 'Chưa xác định'}</p>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass(item.trang_thai)}`}>
                      {item.trang_thai}
                    </span>
                  </div>
                </div>
              </section>

              <section className="payroll-slip-no-break mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Tổng ngày công', `${attendanceDays + extraDays}/${standardDays}`],
                  ['Giờ tăng ca', `${overtimeHours} giờ`],
                  ['Doanh số ghi nhận', money(item.doanh_so)],
                  ['Mức lương cơ bản', money(item.luong_co_ban)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </section>

              <section className="payroll-slip-no-break mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 bg-slate-900 px-4 py-2.5 text-white">
                  <CalendarDays size={16} />
                  <h2 className="text-xs font-black uppercase tracking-[0.12em]">Thông tin chấm công</h2>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3">
                  {[
                    ['Ngày công từ chấm công', attendanceDays],
                    ['Ngày công bổ sung', extraDays],
                    ['Tổng ngày công', `${attendanceDays + extraDays}/${standardDays}`],
                    ['Số giờ tăng ca', overtimeHours],
                    ['Số bữa ăn thường', amount(item.so_bua_an_thuong)],
                    ['Số bữa ăn tăng ca', amount(item.so_bua_an_tang_ca)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                      <span className="text-slate-500">{label}</span>
                      <strong className="text-slate-900">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <div className="payroll-slip-details mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
                <section className="payroll-slip-no-break overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between bg-emerald-700 px-4 py-2.5 text-white">
                    <h2 className="text-xs font-black uppercase tracking-[0.12em]">Chi tiết thu nhập</h2>
                    <span className="text-[10px] font-bold uppercase">Số tiền (VND)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {incomeRows.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 px-4 py-1.5 text-xs">
                        <span className="text-slate-600">{label}</span>
                        <strong className="font-mono text-slate-900">{money(value)}</strong>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 bg-emerald-50 px-4 py-2.5 text-sm">
                      <strong className="uppercase text-emerald-800">Tổng thu nhập</strong>
                      <strong className="font-mono text-emerald-800">{money(item.tong_thu_nhap)}</strong>
                    </div>
                  </div>
                </section>

                <div className="space-y-4">
                  <section className="payroll-slip-no-break overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between bg-rose-700 px-4 py-2.5 text-white">
                      <h2 className="text-xs font-black uppercase tracking-[0.12em]">Chi tiết khấu trừ</h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {deductionRows.map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-3 px-4 py-1.5 text-xs">
                          <span className="text-slate-600">{label}</span>
                          <strong className="font-mono text-slate-900">{money(value)}</strong>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-3 bg-rose-50 px-4 py-2.5 text-sm">
                        <strong className="uppercase text-rose-800">Tổng khấu trừ</strong>
                        <strong className="font-mono text-rose-800">{money(totalDeduction)}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="payroll-slip-no-break rounded-xl bg-slate-950 p-4 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Thực lĩnh</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-white">{money(item.thuc_linh)}</p>
                    <p className="mt-1 text-[10px] text-slate-400">Tổng thu nhập sau các khoản khấu trừ</p>
                  </section>
                </div>
              </div>

              {item.ghi_chu && (
                <section className="payroll-slip-no-break mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <strong>Ghi chú: </strong>{item.ghi_chu}
                </section>
              )}

              <section className="payroll-slip-no-break mt-7 grid grid-cols-2 gap-10 text-center text-xs">
                <div>
                  <p className="font-black uppercase text-slate-800">Người lập phiếu</p>
                  <p className="mt-1 italic text-slate-400">Ký và ghi rõ họ tên</p>
                  <div className="h-14" />
                </div>
                <div>
                  <p className="font-black uppercase text-slate-800">Người nhận</p>
                  <p className="mt-1 italic text-slate-400">Ký và ghi rõ họ tên</p>
                  <div className="h-14" />
                </div>
              </section>

              <footer className="payroll-slip-no-break border-t border-slate-200 pt-3 text-center text-[9px] text-slate-400">
                Phiếu được lập từ hệ thống quản lý cửa hàng · Vui lòng kiểm tra thông tin trước khi ký nhận
              </footer>
            </article>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PayrollSlipModal;
