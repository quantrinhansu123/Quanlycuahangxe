import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Printer, Wallet, Calendar, Clock, TrendingUp, ShieldCheck, CheckCircle2, Plus } from 'lucide-react';
import type { BangLuong } from '../data/payrollData';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: BangLuong | null;
}

const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, data }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  if (!data) return null;

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN').format(val);

  const handleDownloadPDF = async () => {
    if (!modalRef.current) return;
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(modalRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        // Manual override for oklab/oklch colors if needed, but we'll use inline styles to be safe
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;
      
      pdf.addImage(imgData, 'PNG', (pdfWidth - finalWidth) / 2, 0, finalWidth, finalHeight);
      pdf.save(`Phieu_Luong_${data.nhan_su?.ho_ten}_T${data.thang}_${data.nam}.pdf`);
    } catch (error) {
      console.error('PDF Error:', error);
      alert('Vui lòng sử dụng nút "In phiếu" > "Lưu thành PDF" để có chất lượng tốt nhất.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // We use inline styles with HEX colors to bypass html2canvas oklab issues
  const colors = {
    primary: '#14532D',
    bgLight: '#F8FAFC',
    border: '#E2E8F0',
    textMuted: '#64748B',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 print:p-0 print:static">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
          />

          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{ backgroundColor: '#ffffff' }}
            className="relative w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:w-full print:static"
          >
            {/* Header */}
            <div style={{ backgroundColor: colors.primary }} className="p-6 text-white shrink-0 print:bg-white print:text-black print:border-b-2 print:border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} className="w-10 h-10 rounded-full flex items-center justify-center print:bg-slate-100">
                    <Wallet size={20} className="print:text-slate-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-tight">Phiếu lương Chi tiết</h2>
                    <p className="text-white/60 text-xs font-bold print:text-slate-400">Tháng {data.thang}/{data.nam} • {data.co_so}</p>
                  </div>
                </div>
                <button onClick={onClose} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors print:hidden">
                  <X size={20} />
                </button>
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.1)' }} className="rounded-2xl p-4 backdrop-blur-md border flex items-center justify-between print:bg-slate-50 print:border-slate-200">
                <div>
                  <p className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1 print:text-slate-400">Thực lĩnh cuối kỳ</p>
                  <h3 className="text-3xl font-black print:text-[#14532D]">{formatCurrency(data.thuc_linh)} <span className="text-sm font-bold opacity-60">VNĐ</span></h3>
                </div>
                <div className="text-right">
                  <div style={{ 
                    backgroundColor: data.trang_thai === 'Đã chi trả' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: data.trang_thai === 'Đã chi trả' ? '#A7F3D0' : '#FDE68A'
                  }} className="px-3 py-1 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1.5 print:bg-emerald-100 print:text-emerald-700">
                    <CheckCircle2 size={10} /> {data.trang_thai}
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 print:overflow-visible custom-scrollbar">
              <div style={{ backgroundColor: colors.bgLight, borderColor: colors.border }} className="flex items-center gap-4 p-4 rounded-2xl border">
                <div style={{ backgroundColor: '#ffffff', borderColor: colors.border }} className="w-14 h-14 rounded-full border-2 overflow-hidden shadow-sm">
                  {data.nhan_su?.hinh_anh ? (
                    <img src={data.nhan_su.hinh_anh} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div style={{ color: '#CBD5E1', backgroundColor: '#F8FAFC' }} className="w-full h-full flex items-center justify-center font-black text-xl">
                       {data.nhan_su?.ho_ten.split(' ').pop()?.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg">{data.nhan_su?.ho_ten}</h4>
                  <p style={{ color: colors.textMuted }} className="text-xs font-bold uppercase tracking-widest">{data.nhan_su?.vi_tri} • {data.nhan_su?.id_nhan_su || 'NV-000'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h5 style={{ color: colors.textMuted }} className="text-[11px] font-black uppercase tracking-[0.2em] px-1">Khoản thu nhập (+)</h5>
                <div style={{ borderColor: colors.border }} className="bg-white rounded-2xl border overflow-hidden">
                  <DetailItem label="Lương ngày công" value={data.luong_ngay_cong} color="#3B82F6" icon={<Calendar size={16} />} />
                  <DetailItem label="Lương doanh số" value={data.luong_doanh_so} color="#10B981" icon={<TrendingUp size={16} />} />
                  <DetailItem label="Tổng phụ cấp" value={data.tong_phu_cap} color="#F59E0B" icon={<ShieldCheck size={16} />} highlight />
                  <DetailItem label="Thưởng khác" value={data.thuong_khac || 0} color="#8B5CF6" icon={<Plus size={16} />} />
                </div>
              </div>

              <div className="space-y-3">
                <h5 style={{ color: colors.danger }} className="text-[11px] font-black uppercase tracking-[0.2em] px-1">Khoản khấu trừ (-)</h5>
                <div style={{ borderColor: colors.border }} className="bg-white rounded-2xl border overflow-hidden">
                  <DetailItem label="BHXH / BHYT" value={data.bhxh || 0} color={colors.danger} isMinus />
                  <DetailItem label="Thuế TNCN" value={data.thue_tncn || 0} color={colors.danger} isMinus />
                  <DetailItem label="Khấu trừ khác" value={data.khoan_tru || 0} color={colors.danger} isMinus />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div style={{ backgroundColor: colors.bgLight, borderColor: colors.border }} className="p-4 rounded-2xl border">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={16} style={{ color: colors.primary }} />
                    <span style={{ color: colors.textMuted }} className="text-[11px] font-black uppercase tracking-widest">Ngày công</span>
                  </div>
                  <p className="text-xl font-black text-slate-900">26 <span className="text-xs text-slate-400">Ngày</span></p>
                </div>
                <div style={{ backgroundColor: colors.bgLight, borderColor: colors.border }} className="p-4 rounded-2xl border">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} style={{ color: colors.primary }} />
                    <span style={{ color: colors.textMuted }} className="text-[11px] font-black uppercase tracking-widest">Tăng ca</span>
                  </div>
                  <p className="text-xl font-black text-slate-900">12.5 <span className="text-xs text-slate-400">Giờ</span></p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ backgroundColor: colors.bgLight, borderColor: colors.border }} className="p-6 border-t flex gap-3 shrink-0 print:hidden">
              <button 
                onClick={handleDownloadPDF}
                style={{ backgroundColor: '#ffffff', borderColor: colors.border, color: colors.textMuted }}
                className="flex-1 h-12 border rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
              >
                <Download size={18} /> Tải PDF
              </button>
              <button 
                onClick={handlePrint}
                style={{ backgroundColor: colors.primary }}
                className="flex-1 h-12 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-[#0f4022] transition-all shadow-lg active:scale-95"
              >
                <Printer size={18} /> In phiếu
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const DetailItem = ({ label, value, color, icon, isMinus, highlight }: any) => (
  <div 
    style={{ 
      borderColor: '#F1F5F9',
      backgroundColor: highlight ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
    }} 
    className="flex items-center justify-between p-4 border-b last:border-0"
  >
    <div className="flex items-center gap-3">
      {icon && <div style={{ backgroundColor: '#F8FAFC', color: color }} className="w-8 h-8 rounded-lg flex items-center justify-center">{icon}</div>}
      <span style={{ color: '#475569' }} className="text-sm font-bold">{label}</span>
    </div>
    <span style={{ color: isMinus ? '#EF4444' : (highlight ? '#047857' : '#0F172A') }} className="font-mono font-black">
      {isMinus ? '-' : ''}{new Intl.NumberFormat('vi-VN').format(value)}
    </span>
  </div>
);

export default PayslipModal;
