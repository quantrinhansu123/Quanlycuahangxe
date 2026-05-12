import React from 'react';
import { formatNumberVietnamese } from '../lib/utils';
import { numberToVietnameseWords } from '../utils/numberToWords';
import type { BangLuong } from '../data/payrollData';

interface ProfessionalPayslipProps {
  data: BangLuong;
}

const ProfessionalPayslip: React.FC<ProfessionalPayslipProps> = ({ data }) => {
  if (!data) return null;

  return (
    <div className="bg-white p-[15mm] w-[210mm] min-h-[297mm] mx-auto text-black font-sans leading-normal print:p-0 print:shadow-none shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
        <div>
          <h1 className="font-bold text-lg uppercase tracking-wider">Cửa hàng xe máy</h1>
          <p className="text-sm font-medium">Bộ phận Nhân sự & Tiền lương</p>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase">PHIẾU LƯƠNG</h2>
          <p className="italic font-medium">Kỳ lương: Tháng {data.thang} Năm {data.nam}</p>
        </div>
      </div>

      {/* Thông tin nhân viên */}
      <div className="grid grid-cols-2 gap-y-3 mb-6 border border-black p-4">
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Mã nhân viên:</span>
          <span className="font-medium">{data.nhan_su?.id_nhan_su || 'NV-000'}</span>
        </div>
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Họ và tên:</span>
          <span className="font-bold uppercase text-base">{data.nhan_su?.ho_ten}</span>
        </div>
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Chức vụ:</span>
          <span className="font-medium">{data.nhan_su?.vi_tri}</span>
        </div>
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Bộ phận:</span>
          <span className="font-medium">Cửa hàng</span>
        </div>
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Ngày công:</span>
          <span className="font-medium">{data.ngay_cong_thuc_te} ngày</span>
        </div>
        <div className="flex items-baseline">
          <span className="w-32 font-bold italic text-sm">Giờ tăng ca:</span>
          <span className="font-medium">{data.so_gio_tang_ca || 0} giờ</span>
        </div>
        <div className="flex items-baseline col-span-2">
          <span className="w-32 font-bold italic text-sm">Ghi chú:</span>
          <span className="font-medium">{data.ghi_chu || ''}</span>
        </div>
      </div>

      {/* Main Table */}
      <table className="w-full border-collapse border border-black mb-6 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black px-2 py-2 text-center w-12 font-bold">STT</th>
            <th className="border border-black px-4 py-2 text-left font-bold">Nội dung chi tiết</th>
            <th className="border border-black px-4 py-2 text-right w-40 font-bold">Số tiền (VNĐ)</th>
            <th className="border border-black px-2 py-2 text-left w-32 font-bold">Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {/* PHẦN A */}
          <tr className="font-bold bg-gray-50">
            <td className="border border-black px-2 py-2 text-center font-bold">A</td>
            <td className="border border-black px-4 py-2 uppercase font-bold" colSpan={3}>Lương & Phụ cấp (Thu nhập)</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">1</td>
            <td className="border border-black px-4 py-1.5">Lương tính theo ngày công thực tế</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.luong_ngay_cong)}</td>
            <td className="border border-black px-2 py-1.5 text-xs italic">{data.ngay_cong_thuc_te} ngày</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">2</td>
            <td className="border border-black px-4 py-1.5">Lương tăng ca (OT)</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.luong_lam_them || 0)}</td>
            <td className="border border-black px-2 py-1.5 text-xs italic">{data.so_gio_tang_ca || 0} giờ</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">3</td>
            <td className="border border-black px-4 py-1.5">Tiền ăn ca</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.tien_an || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">4</td>
            <td className="border border-black px-4 py-1.5">Phụ cấp chuyên cần</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.phu_cap_chuyen_can || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">5</td>
            <td className="border border-black px-4 py-1.5">Phụ cấp xăng xe & điện thoại</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.phu_cap_xang_xe || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">6</td>
            <td className="border border-black px-4 py-1.5">Phụ cấp thâm niên</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.phu_cap_tham_nien || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">7</td>
            <td className="border border-black px-4 py-1.5">Lương doanh số / Hoa hồng</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.luong_doanh_so)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">8</td>
            <td className="border border-black px-4 py-1.5">Thưởng khác</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.thuong_khac || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>

          {/* PHẦN B */}
          <tr className="font-bold bg-gray-50">
            <td className="border border-black px-2 py-2 text-center font-bold">B</td>
            <td className="border border-black px-4 py-2 uppercase font-bold" colSpan={3}>Các khoản khấu trừ</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1.5 text-center">1</td>
            <td className="border border-black px-4 py-1.5">Khấu trừ khác / Tạm ứng</td>
            <td className="border border-black px-4 py-1.5 text-right">{formatNumberVietnamese(data.khoan_tru || 0)}</td>
            <td className="border border-black px-2 py-1.5"></td>
          </tr>

          {/* TỔNG CỘNG */}
          <tr className="bg-gray-100 font-bold border-t-2 border-black">
            <td className="border border-black px-4 py-3 text-center uppercase" colSpan={2}>THỰC LĨNH CUỐI KỲ</td>
            <td className="border border-black px-4 py-3 text-right text-xl">{formatNumberVietnamese(data.thuc_linh)}</td>
            <td className="border border-black px-2 py-3 text-center font-bold">VNĐ</td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div className="mb-12">
        <p className="font-bold italic text-base">
          Số tiền bằng chữ: <span className="underline">{numberToVietnameseWords(data.thuc_linh)}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 text-center font-bold mt-10">
        <div>
          <p className="uppercase mb-24 text-sm">Người lập phiếu</p>
          <p className="text-sm">(Ký và ghi rõ họ tên)</p>
        </div>
        <div>
          <p className="uppercase mb-24 text-sm">Người nhận tiền</p>
          <p className="text-sm">(Ký và ghi rõ họ tên)</p>
        </div>
      </div>

      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: portrait; margin: 15mm; }
          body { background: white; }
          #printable-payslip {
            padding: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }
      ` }} />
    </div>
  );
};

export default ProfessionalPayslip;
