import { clsx } from 'clsx';
import { Calendar, Check, Clock, Gauge, History, Info, Loader2, MapPin, MessageSquare, Phone, ShoppingCart, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getCustomerServiceHistory, type KhachHang } from '../data/customerData';

interface CustomerDetailsModalProps {
   isOpen: boolean;
   onClose: () => void;
   customer: KhachHang | null;
}

const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({
   isOpen,
   onClose,
   customer
}) => {
   const todayDate = new Date();
   const firstDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
   const [startDateStr, setStartDateStr] = useState<string>(firstDay.toISOString().split('T')[0]);
   const endDateStr = todayDate.toISOString().split('T')[0];
   const [loading, setLoading] = useState(true);
   const [history, setHistory] = useState<any[]>([]);
   const [activeTab, setActiveTab] = useState<'history' | 'info'>('history');
   const navigate = useNavigate();
   const [copySuccess, setCopySuccess] = useState(false);

   useEffect(() => {
      if (!isOpen || !customer) return;

      let isMounted = true;
      const loadHistory = async () => {
         try {
            setLoading(true);
            const data = await getCustomerServiceHistory(customer.id, startDateStr, endDateStr);
            if (isMounted) setHistory(data);
         } catch (error) {
            console.error('Lỗi khi tải lịch sử:', error);
         } finally {
            if (isMounted) setLoading(false);
         }
      };

      loadHistory();
      return () => { isMounted = false; };
   }, [isOpen, customer, startDateStr, endDateStr]);

   if (!isOpen || !customer) return null;

   const formatCurrency = (amt: number) => {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
   };

   const totalSpent = history.reduce((sum, card) => {
      const cardTotal = (card.the_ban_hang_ct || []).reduce((s: number, ct: any) => s + (ct.gia_ban * (ct.so_luong || 1)), 0)
         || (card.dich_vu?.gia_ban || 0);
      return sum + cardTotal;
   }, 0);

   const handleShareZalo = () => {
      const formatDate = (date: string) => new Date(date).toLocaleDateString('vi-VN');
      const start = formatDate(startDateStr);
      const end = formatDate(endDateStr);

      let msg = `Chào ${customer.ho_va_ten}, Gara gửi tóm tắt dịch vụ của bạn:\n`;
      msg += `-------------------------\n`;
      msg += `🚗 Xe: ${customer.bien_so_xe} — KM: ${customer.so_km?.toLocaleString() || '0'} Km\n`;
      msg += `📅 Chu kỳ thay dầu: ${customer.so_ngay_thay_dau || '—'} ngày\n`;
      msg += `-------------------------\n`;
      msg += `📊 Thống kê (${start} - ${end}):\n`;
      msg += `- Tổng chi tiêu: ${formatCurrency(totalSpent)}\n`;
      msg += `- Số lần ghé: ${history.length} lần\n`;
      msg += `-------------------------\n`;
      msg += `🛠️ Lịch sử dịch vụ:\n`;

      if (history.length === 0) {
         msg += `Chưa có dữ liệu trong khoảng thời gian này.\n`;
      } else {
         history.slice(0, 5).forEach((record) => {
            const date = formatDate(record.ngay);
            const items = record.the_ban_hang_ct?.map((ct: any) => ct.san_pham).join(', ') || record.dich_vu?.ten_dich_vu || 'Dịch vụ';
            const price = (record.the_ban_hang_ct || []).reduce((s: number, ct: any) => s + (ct.gia_ban * (ct.so_luong || 1)), 0) || (record.dich_vu?.gia_ban || 0);
            msg += `• ${date}: ${items} — ${formatCurrency(price)}\n`;
         });
         if (history.length > 5) msg += `... và ${history.length - 5} đơn khác.\n`;
      }

      msg += `-------------------------\n`;
      msg += `Trân trọng cảm ơn quý khách!`;

      navigator.clipboard.writeText(msg).then(() => {
         setCopySuccess(true);
         setTimeout(() => setCopySuccess(false), 3000);
         window.open(`https://zalo.me/${customer.so_dien_thoai}`, '_blank');
      });
   };

   return createPortal(
      <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
         <div className="bg-card w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-border animate-in zoom-in-95 duration-300">

            {/* Header */}
            <div className="px-4 py-3 sm:px-8 sm:py-5 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
               <div className="flex items-center gap-2.5 sm:gap-4">
                  <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                     <User size={18} className="sm:hidden" /><User size={24} className="hidden sm:block" />
                  </div>
                  <div>
                     <h2 className="text-base sm:text-xl font-black text-foreground">{customer.ho_va_ten}</h2>
                     <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
                        <span className="flex items-center gap-1"><Phone size={11} /> {customer.so_dien_thoai}</span>
                        <span className="flex items-center gap-1"><MapPin size={11} /> {customer.dia_chi_hien_tai || 'N/A'}</span>
                     </div>
                  </div>
               </div>
               <button
                  onClick={onClose}
                  className="p-1.5 sm:p-2.5 text-muted-foreground hover:bg-muted rounded-full transition-all active:scale-90"
               >
                  <X size={20} className="sm:hidden" /><X size={24} className="hidden sm:block" />
               </button>
            </div>

            {/* Date Selector */}
            <div className="px-4 py-2.5 sm:px-8 sm:py-4 border-b border-border bg-card flex flex-wrap items-center gap-2 sm:gap-8 w-full shadow-sm">
               <div className="flex items-center gap-2 sm:gap-4">
                  <div className="flex flex-col gap-0.5">
                     <span className="text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Từ ngày</span>
                     <input
                        type="date"
                        value={startDateStr}
                        onChange={(e) => setStartDateStr(e.target.value)}
                        className="font-bold text-foreground text-[12px] sm:text-[14px] bg-muted/40 hover:bg-muted/60 border border-border/50 rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                     />
                  </div>
               </div>

               <div className="flex-1 flex justify-end gap-2 sm:gap-3 min-w-[150px] sm:min-w-[200px]">
                  <div className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl bg-primary/5 border border-primary/20 flex flex-col items-end">
                     <span className="text-[8px] sm:text-[9px] font-black text-primary uppercase">Tổng chi tiêu</span>
                     <span className="text-[11px] sm:text-sm font-black text-primary">{formatCurrency(totalSpent)}</span>
                  </div>
                  <div className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col items-end">
                     <span className="text-[8px] sm:text-[9px] font-black text-amber-600 uppercase">Số lần ghé</span>
                     <span className="text-[11px] sm:text-sm font-black text-amber-600">{history.length}</span>
                  </div>
               </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border bg-muted/10 shrink-0">
               <button
                  onClick={() => setActiveTab('history')}
                  className={clsx(
                     "px-4 py-2.5 sm:px-8 sm:py-4 font-black text-[11px] sm:text-[13px] transition-all flex items-center gap-1.5 sm:gap-2 uppercase tracking-wider relative",
                     activeTab === 'history' ? "text-primary bg-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
               >
                  <History size={14} className="sm:hidden" /><History size={18} className="hidden sm:block" /> Lịch sử dịch vụ
                  {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-primary rounded-t-full" />}
               </button>
               <button
                  onClick={() => setActiveTab('info')}
                  className={clsx(
                     "px-4 py-2.5 sm:px-8 sm:py-4 font-black text-[11px] sm:text-[13px] transition-all flex items-center gap-1.5 sm:gap-2 uppercase tracking-wider relative",
                     activeTab === 'info' ? "text-primary bg-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
               >
                  <Info size={14} className="sm:hidden" /><Info size={18} className="hidden sm:block" /> Thông tin chi tiết
                  {activeTab === 'info' && <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-primary rounded-t-full" />}
               </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-background custom-scrollbar">
               {loading ? (
                  <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                     <Loader2 className="animate-spin mb-4 text-primary" size={40} />
                     <p className="text-sm font-bold uppercase tracking-widest text-primary/60">Đang truy xuất dữ liệu...</p>
                  </div>
               ) : activeTab === 'history' ? (
                  <div className="animate-in fade-in zoom-in-95 duration-300">
                     {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-10 text-center border-2 border-dashed border-border rounded-3xl bg-muted/10">
                           <ShoppingCart size={48} className="text-muted-foreground/30 mb-4" />
                           <p className="text-muted-foreground font-bold italic">Khách hàng chưa có lịch sử mua hàng trong khoảng thời gian này.</p>
                        </div>
                     ) : (
                        <div className="grid gap-4">
                           {history.map((card, idx) => {
                              const cardTotal = (card.the_ban_hang_ct || []).reduce((s: number, ct: any) => s + (ct.gia_ban * (ct.so_luong || 1)), 0)
                                 || (card.dich_vu?.gia_ban || 0);
                              return (
                                 <div key={card.id || idx} className="bg-card rounded-xl sm:rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow group">
                                    <div className="p-3 sm:p-5 flex flex-col sm:flex-row gap-3 sm:gap-5 justify-between">
                                       <div className="space-y-2 sm:space-y-4 flex-1">
                                          <div className="flex items-center gap-2 sm:gap-3">
                                             <div className="px-2 py-0.5 sm:px-3 sm:py-1 bg-muted rounded-full text-[11px] sm:text-[12px] font-black text-foreground flex items-center gap-1.5">
                                                <Calendar size={12} className="text-primary" /> {new Date(card.ngay).toLocaleDateString('vi-VN')}
                                             </div>
                                             <div className="px-2 py-0.5 sm:px-3 sm:py-1 bg-muted rounded-full text-[11px] sm:text-[12px] font-black text-foreground flex items-center gap-1.5">
                                                <Clock size={12} className="text-primary" /> {card.gio?.substring(0, 5) || '--:--'}
                                             </div>
                                          </div>

                                          <div className="grid gap-1.5 sm:gap-2">
                                             {card.the_ban_hang_ct && card.the_ban_hang_ct.length > 0 ? (
                                                card.the_ban_hang_ct.map((ct: any, i: number) => (
                                                   <div key={i} className="flex items-center justify-between text-[11px] sm:text-[13px]">
                                                      <span className="font-bold text-foreground">📦 {ct.san_pham}</span>
                                                      <span className="text-muted-foreground font-medium">SL: {ct.so_luong || 1} — {formatCurrency(ct.gia_ban)}</span>
                                                   </div>
                                                ))
                                             ) : (
                                                <div className="flex items-center justify-between text-[11px] sm:text-[13px]">
                                                   <span className="font-bold text-foreground">🛠️ {card.dich_vu?.ten_dich_vu || 'Dịch vụ lẻ'}</span>
                                                   <span className="text-muted-foreground font-medium">{formatCurrency(card.dich_vu?.gia_ban || 0)}</span>
                                                </div>
                                             )}
                                          </div>
                                       </div>

                                       <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-between border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0 sm:pl-5 gap-2 sm:gap-3">
                                          <div className="sm:text-right">
                                             <p className="text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Thanh toán</p>
                                             <p className="text-sm sm:text-lg font-black text-primary leading-none">{formatCurrency(cardTotal)}</p>
                                          </div>
                                          <div className="sm:text-right">
                                             <p className="text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase mb-0.5">Phụ trách</p>
                                             <div className="px-1.5 py-0.5 bg-accent rounded text-[10px] sm:text-[11px] font-bold text-accent-foreground border border-border inline-block">
                                                {card.nhan_su?.ho_ten || '—'}
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
               ) : (
                  <div className="animate-in fade-in zoom-in-95 duration-300 space-y-8">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-4">
                           <h4 className="flex items-center gap-2 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
                              <Info size={14} className="text-primary" /> Thông tin xe
                           </h4>
                           <div className="grid grid-cols-1 gap-4">
                              <InfoRow
                                 icon={ShoppingCart}
                                 label="Biển số"
                                 value={customer.bien_so_xe}
                                 valueClass={customer.bien_so_xe === 'Xe Chưa Biển' ? 'text-amber-600' : 'text-blue-600 uppercase'}
                              />
                              <InfoRow
                                 icon={Gauge}
                                 label="Số KM Hiện tại"
                                 value={`${customer.so_km?.toLocaleString() || '0'} Km`}
                              />
                              <InfoRow
                                 icon={Clock}
                                 label="Chu kỳ thay dầu"
                                 value={`${customer.so_ngay_thay_dau || '—'} ngày`}
                              />
                              <InfoRow
                                 icon={Calendar}
                                 label="Lần thay dầu cuối"
                                 value={customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau).toLocaleDateString('vi-VN') : '—'}
                              />
                           </div>
                        </div>

                        <div className="space-y-4">
                           <h4 className="flex items-center gap-2 text-xs font-black text-muted-foreground uppercase tracking-widest border-b border-border pb-2">
                              <User size={14} className="text-primary" /> Hồ sơ gốc
                           </h4>
                           <div className="grid grid-cols-1 gap-4">
                              <InfoRow icon={Info} label="Mã Khách hàng" value={customer.ma_khach_hang || customer.id.slice(0, 8)} valueClass="font-mono" />
                              <InfoRow icon={Calendar} label="Ngày đăng ký" value={customer.ngay_dang_ky ? new Date(customer.ngay_dang_ky).toLocaleDateString('vi-VN') : '—'} />
                              <InfoRow icon={MapPin} label="Địa chỉ ghi nhận" value={customer.dia_chi_hien_tai || 'Chưa rõ'} />
                           </div>
                        </div>
                     </div>
                  </div>
               )}
            </div>

            <div className="px-4 py-3 sm:px-8 sm:py-5 border-t border-border bg-muted/10 flex items-center justify-between shrink-0 flex-wrap gap-2 sm:gap-4">
               <div className="flex items-center gap-1.5 sm:gap-3">
                  <a 
                     href={`tel:${customer.so_dien_thoai}`}
                     className="px-3 py-2 sm:px-6 sm:py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] sm:text-sm font-black rounded-xl sm:rounded-2xl flex items-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                  >
                     <Phone size={14} className="sm:hidden" /><Phone size={18} className="hidden sm:block" /> GỌI ĐIỆN
                  </a>
                  <div className="relative">
                     <button 
                        onClick={handleShareZalo}
                        className="px-3 py-2 sm:px-6 sm:py-3 bg-blue-500 hover:bg-blue-600 text-white text-[11px] sm:text-sm font-black rounded-xl sm:rounded-2xl flex items-center gap-1.5 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                     >
                        <MessageSquare size={14} className="sm:hidden" /><MessageSquare size={18} className="hidden sm:block" /> GỬI ZALO
                     </button>
                     {copySuccess && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-800 text-white text-[10px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <Check size={12} className="text-emerald-400" /> ĐÃ COPY!
                        </div>
                     )}
                  </div>
               </div>
               
               <button 
                  onClick={() => {
                     onClose();
                     navigate('/ban-hang/phieu-ban-hang', { state: { customerId: customer.id } });
                  }} 
                  className="px-5 py-2 sm:px-10 sm:py-3 bg-primary hover:bg-primary/90 text-white text-[11px] sm:text-sm font-black rounded-xl sm:rounded-2xl border border-primary/20 transition-all active:scale-95 shadow-lg shadow-primary/20 uppercase tracking-widest"
               >
                  LÊN ĐƠN HÀNG
               </button>
            </div>
         </div>
      </div>,
      document.body
   );
};

interface InfoRowProps {
   icon: any;
   label: string;
   value: string | number;
   valueClass?: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon: Icon, label, value, valueClass }) => (
   <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-3">
         <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Icon size={16} />
         </div>
         <span className="text-[13px] font-bold text-muted-foreground">{label}</span>
      </div>
      <span className={clsx("text-[13px] font-black text-foreground", valueClass)}>{value}</span>
   </div>
);

export default CustomerDetailsModal;
