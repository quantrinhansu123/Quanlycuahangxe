import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer } from 'lucide-react';
import type { BangLuong } from '../data/payrollData';
import ProfessionalPayslip from './ProfessionalPayslip';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: BangLuong | null;
}

const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, data }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 pt-20 sm:p-6 sm:pt-24 print:p-0 print:static print:overflow-visible">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-[101] w-full max-w-[210mm] print:static print:w-full"
          >
            {/* Control Bar */}
            <div className="sticky top-0 z-[102] flex items-center justify-between bg-white/80 backdrop-blur px-6 py-3 rounded-t-2xl border-b border-gray-200 print:hidden shadow-sm mb-2">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-gray-800">Xem trước Phiếu lương</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-6 py-2 bg-primary text-white hover:opacity-90 rounded-lg text-sm font-bold transition-colors shadow-sm active:scale-95"
                  >
                    <Printer size={18} /> In phiếu lương
                  </button>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Printable Content */}
            <div id="printable-payslip" className="bg-white shadow-2xl rounded-b-2xl print:shadow-none print:rounded-none">
              <ProfessionalPayslip data={data} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PayslipModal;
