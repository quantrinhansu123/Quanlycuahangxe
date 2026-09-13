import { useBranches } from '../hooks/useBranches';
import { branchLabel } from '../lib/branchCatalog';
import { getErrorDetails } from '../lib/errorDetails';
import { needsCustomerIdentityCheck, normalizePlate } from '../lib/customerIdentity';
import {
  AlertCircle,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Edit2,
  History,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Save,
  ShoppingCart,
  Tag,
  User,
  X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { KhachHang } from '../data/customerData';
import { getCustomersByPhone, getCustomersByPlate, uploadCustomerImage, upsertCustomer } from '../data/customerData';
import { computeCustomerChanges, getCustomerEditHistory, saveCustomerEditHistory, type CustomerEditHistory } from '../data/customerHistoryData';
import { formatDateTime24h } from '../utils/datetimeFormat';
import { useToast } from '../context/toast';
import { normalizeBranchLabel } from '../constants/customerBranches';
import BranchCreateButton from './BranchCreateButton';

function resolveStaffBranch(coSo?: string | null): string {
  const v = (coSo || '').trim();
  if (!v) return '';
  return branchLabel(v);
}

type DuplicateWarningState = {
  matches: KhachHang[];
};

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: KhachHang, shouldCreateOrder?: boolean, isTemp?: boolean) => void;
  customer: KhachHang | null;
  currentStaffId?: string;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = React.memo(({ isOpen, onClose, onSuccess, customer, currentStaffId }) => {
  const CUSTOMER_BRANCH_OPTIONS = useBranches();
  const [formData, setFormData] = useState<Partial<KhachHang>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { nhanVien } = useAuth();

  const [historyRecords, setHistoryRecords] = useState<CustomerEditHistory[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarningState | null>(null);
  const needsIdentityCheck = needsCustomerIdentityCheck(customer, formData);
  const staffBranch = resolveStaffBranch(nhanVien?.co_so);

  const formatDateForInput = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({
          ...customer,
          ngay_dang_ky: formatDateForInput(customer.ngay_dang_ky),
        });
      } else {
        setFormData({
          ho_va_ten: '',
          so_dien_thoai: '',
          dia_chi_hien_tai: staffBranch,
          anh: '',
          ngay_dang_ky: new Date().toISOString().split('T')[0],
          bien_so_xe: '',
          ma_khach_hang: 'KH-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        });
      }
    }
  }, [isOpen, customer, staffBranch]);

  // Clear a previous warning whenever the user changes the identity fields.
  useEffect(() => {
    setDuplicateWarning(null);
  }, [formData.bien_so_xe, formData.so_dien_thoai, isOpen, customer]);

  // Duplication Plate Check logic
  useEffect(() => {
    if (!needsIdentityCheck || !isOpen || !formData.bien_so_xe || formData.bien_so_xe.trim() === '') return;

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const plate = formData.bien_so_xe!.trim();
        if (plate.length < 4) return;

        const matches = (await getCustomersByPlate(plate)).filter(existing =>
          existing.id !== (customer ? customer.id : '')
          && normalizePlate(existing.bien_so_xe) === normalizePlate(plate)
        );
        if (!active || matches.length === 0) return;

        if (!customer) {
          setDuplicateWarning(prev => {
            const merged = new Map([...(prev?.matches || []), ...matches].map(existing => [existing.id, existing]));
            return { matches: [...merged.values()] };
          });
        } else {
          // If editing, just warn or log
          console.warn(`Biển số [${plate}] trùng với ${matches.length} hồ sơ khách hàng.`);
        }
      } catch (err) {
        console.error('Lỗi kiểm tra biển số:', err);
      }
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.bien_so_xe, isOpen, customer, navigate, onClose, needsIdentityCheck]);

  // Duplication Phone Check logic
  useEffect(() => {
    if (!needsIdentityCheck || !isOpen || !formData.so_dien_thoai || formData.so_dien_thoai.trim() === '') return;

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const phone = formData.so_dien_thoai!.trim();
        if (phone.length < 4) return;

        const matches = (await getCustomersByPhone(phone)).filter(existing =>
          existing.id !== (customer ? customer.id : '')
          && normalizePlate(existing.bien_so_xe) === normalizePlate(formData.bien_so_xe)
        );
        if (!active || matches.length === 0 || customer) return;

        setDuplicateWarning(prev => {
          const merged = new Map([...(prev?.matches || []), ...matches].map(existing => [existing.id, existing]));
          return { matches: [...merged.values()] };
        });
      } catch (err) {
        console.error('Lỗi kiểm tra SĐT:', err);
      }
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.so_dien_thoai, formData.bien_so_xe, isOpen, customer, navigate, onClose, needsIdentityCheck]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: Partial<KhachHang>) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploadingImage(true);
        const url = await uploadCustomerImage(file);
        setFormData((prev: Partial<KhachHang>) => ({
          ...prev,
          anh: url
        }));
      } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi tải ảnh. Dùng fallback Base64.');
        const reader = new FileReader();
        reader.onloadend = () => setFormData((prev: Partial<KhachHang>) => ({ ...prev, anh: reader.result as string }));
        reader.readAsDataURL(file);
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const goToExistingCustomer = (existing: KhachHang) => {
    navigate('/ban-hang/phieu-ban-hang', {
      state: { pendingCustomerData: existing },
    });
    setDuplicateWarning(null);
    onClose();
  };

  const handleSubmit = async (e: React.SyntheticEvent, shouldOrder: boolean = false) => {
    e.preventDefault();
    if (uploadingImage || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const duplicateMatches: KhachHang[] = [];

      // 1. Kiểm tra trùng SĐT trước khi lưu. Một SĐT có thể có nhiều xe,
      // nên chỉ giữ các hồ sơ có cùng biển số với dữ liệu đang nhập.
      const phone = formData.so_dien_thoai?.trim();
      if (needsIdentityCheck && phone && phone.length >= 4) {
        const existingByPhone = await getCustomersByPhone(phone);
        duplicateMatches.push(...existingByPhone.filter(existing =>
          existing.id !== (customer ? customer.id : '')
          && normalizePlate(existing.bien_so_xe) === normalizePlate(formData.bien_so_xe)
        ));
      }

      // 2. Kiểm tra trùng Biển số trước khi lưu
      const plate = formData.bien_so_xe?.trim();
      if (needsIdentityCheck && plate && plate.length >= 4 && plate !== 'Xe Chưa Biển') {
        const existingByPlate = await getCustomersByPlate(plate);
        duplicateMatches.push(...existingByPlate.filter(existing =>
          existing.id !== (customer ? customer.id : '')
          && normalizePlate(existing.bien_so_xe) === normalizePlate(plate)
        ));
      }

      const uniqueDuplicateMatches = [...new Map(duplicateMatches.map(existing => [existing.id, existing])).values()];
      if (uniqueDuplicateMatches.length > 0) {
        const first = uniqueDuplicateMatches[0];
        const duplicateDescription = uniqueDuplicateMatches.length === 1
          ? `Thông tin này đã thuộc về khách hàng "${first.ho_va_ten}".`
          : `Thông tin này đang có ${uniqueDuplicateMatches.length} hồ sơ khách hàng trùng nhau.`;
        const ok = window.confirm(`⚠️ CẢNH BÁO TRÙNG KHÁCH HÀNG\n\n${duplicateDescription}\n\nBạn có chắc chắn muốn tiếp tục lưu bản ghi mới không?`);
        if (!ok) {
          setIsSubmitting(false);
          return;
        }
      }

      const dataToSave = { ...formData };
      if (!customer && !dataToSave.dia_chi_hien_tai && staffBranch) {
        // Bảo đảm thêm mới luôn có "cơ sở" theo nhân sự đang đăng nhập.
        dataToSave.dia_chi_hien_tai = staffBranch;
      }
      if (!dataToSave.ma_khach_hang) delete dataToSave.ma_khach_hang;
      if (!dataToSave.anh) delete dataToSave.anh;
      if (!dataToSave.id) delete dataToSave.id;

      if (shouldOrder && !customer) {
        // Deferred Save: Đẩy data tạm sang bên kia để chờ xử lý cùng với hoá đơn
        dataToSave.id = 'PENDING-' + (dataToSave.ma_khach_hang || Math.random().toString(36).substring(2, 8).toUpperCase());
        if (currentStaffId) {
          dataToSave.nhan_vien_id = currentStaffId;
        }
        onSuccess(dataToSave as KhachHang, true, true);
        onClose();
      } else {
        if (!customer && currentStaffId) {
          dataToSave.nhan_vien_id = currentStaffId;
        }

        // LƯU LỊCH SỬ CHỈNH SỬA
        if (customer) {
          const changes = computeCustomerChanges(customer, dataToSave);
          if (changes.length > 0) {
            void saveCustomerEditHistory(customer.id, nhanVien?.ho_ten || 'Hệ thống', changes);
          }
        }

        const savedCustomer = await upsertCustomer(dataToSave);
        showToast('Đã lưu thông tin khách hàng thành công!', 'success');
        onSuccess(savedCustomer, shouldOrder, false);
        onClose();
      }
    } catch (error) {
      alert(`Lỗi: ${getErrorDetails(error).message || 'Không thể lưu.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 9999999 }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden" style={{ zIndex: 10000000 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {customer ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
            {customer ? 'Chỉnh sửa Khách hàng' : 'Thêm Khách hàng Mới'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="md:col-span-2 flex flex-col items-center mb-4">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-inner">
                  {uploadingImage ? <Loader2 className="animate-spin" size={30} /> : formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <User size={40} />}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                >
                  <Camera size={16} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <InputField label="Họ và tên" name="ho_va_ten" value={formData.ho_va_ten} onChange={handleInputChange} icon={User} placeholder="Nhập họ tên đầy đủ..." required />
            <InputField label="Số điện thoại" name="so_dien_thoai" value={formData.so_dien_thoai} onChange={handleInputChange} icon={Phone} placeholder="09xx..." required />
            <InputField label="Mã khách hàng" name="ma_khach_hang" value={formData.ma_khach_hang} onChange={handleInputChange} icon={Tag} placeholder="KH-XXXXXX" />
            <div><InputField label="Địa chỉ lưu trú hiện tại" name="dia_chi_hien_tai" value={formData.dia_chi_hien_tai} onChange={handleInputChange} icon={MapPin} type="select" options={[...CUSTOMER_BRANCH_OPTIONS]} placeholder="Chọn cơ sở..." /><BranchCreateButton onCreated={name => setFormData(prev => ({ ...prev, dia_chi_hien_tai: name }))} /></div>
            <InputField label="Biển số xe" name="bien_so_xe" value={formData.bien_so_xe} onChange={handleInputChange} icon={CreditCard} placeholder="98A-xxx.xx" />
            <InputField label="Ngày đăng ký" name="ngay_dang_ky" type="date" value={formData.ngay_dang_ky} onChange={handleInputChange} icon={Calendar} />
          </div>

          {/* Lịch sử chỉnh sửa */}
          {customer && (
            <div className="mt-8 pt-6 border-t border-border">
              <button
                type="button"
                onClick={async () => {
                  if (!isHistoryOpen && historyRecords.length === 0) {
                    setIsLoadingHistory(true);
                    const records = await getCustomerEditHistory(customer.id);
                    setHistoryRecords(records);
                    setIsLoadingHistory(false);
                  }
                  setIsHistoryOpen(prev => !prev);
                }}
                className="flex items-center gap-2 text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <History size={14} />
                <span>Lịch sử chỉnh sửa thông tin</span>
                {isHistoryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isHistoryOpen && (
                <div className="mt-3 space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="animate-spin mr-2" size={16} />
                      <span className="text-[12px]">Đang tải...</span>
                    </div>
                  ) : historyRecords.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-[12px]">
                      Chưa có lịch sử chỉnh sửa nào.
                    </div>
                  ) : (
                    historyRecords.map((record) => (
                      <div key={record.id} className="bg-muted/30 p-3 rounded-xl border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                              {(record.nguoi_sua || '?')[0]}
                            </div>
                            <span className="text-[12px] font-bold text-foreground">{record.nguoi_sua}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatDateTime24h(new Date(record.thoi_gian || record.created_at))}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {(record.thay_doi || []).map((change, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px] pl-8">
                              <span className="font-bold text-muted-foreground shrink-0 min-w-[100px]">{change.label}:</span>
                              <span className="text-red-500 line-through truncate max-w-[150px]" title={String(change.old_value ?? 'Trống')}>
                                {change.old_value || 'Trống'}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-emerald-600 font-bold truncate max-w-[150px]" title={String(change.new_value ?? 'Trống')}>
                                {change.new_value || 'Trống'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border flex-wrap sm:flex-nowrap">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Nút Lên đơn (Chỉ hiện khi thêm mới hoặc nếu cần thiết khi sửa) */}
              <button
                type="button"
                disabled={uploadingImage}
                onClick={(e) => handleSubmit(e, true)}
                className={clsx(
                  "flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
                  uploadingImage ? "bg-emerald-500/50 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                )}
              >
                {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}
                <span>Lên đơn</span>
              </button>

              <button
                type="submit"
                disabled={uploadingImage}
                className={clsx(
                  "flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
                  uploadingImage ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 shadow-primary/25"
                )}
              >
                {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span>{customer ? 'Lưu thay đổi' : 'Lưu'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/40" style={{ zIndex: 10000001 }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-2xl max-w-xl w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-foreground">Khách hàng trùng</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Đã tìm thấy <span className="font-semibold text-foreground">{duplicateWarning.matches.length} hồ sơ</span> có cùng thông tin biển số/SĐT:
                </p>
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {duplicateWarning.matches.map(existing => (
                    <div key={existing.id} className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm">
                          <p className="font-semibold text-foreground truncate">{existing.ho_va_ten || 'Chưa có tên'}</p>
                          <p className="text-muted-foreground">
                            📞 <span className="font-mono">{existing.so_dien_thoai || '—'}</span>
                            {' · '}🚗 <span className="font-mono">{existing.bien_so_xe || '—'}</span>
                          </p>
                          {existing.ma_khach_hang && (
                            <p className="text-xs text-muted-foreground">Mã KH: <span className="font-mono">{existing.ma_khach_hang}</span></p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => goToExistingCustomer(existing)}
                          className="shrink-0 px-3 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-all flex items-center gap-1.5"
                        >
                          <ShoppingCart size={14} />
                          <span>Sang bán hàng</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="w-full px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg transition-all"
              >
                <span>Đóng cảnh báo</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
});

const InputField: React.FC<{
  label: string,
  name: string,
  value?: string | number,
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void,
  icon: React.ElementType,
  type?: string,
  options?: string[],
  placeholder?: string,
  disabled?: boolean,
  required?: boolean,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, placeholder, disabled, required, className }) => {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon size={14} className="text-primary/70" />
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'select' ? (
        <select
          name={name}
          value={type === 'select' && name === 'dia_chi_hien_tai' ? normalizeBranchLabel(String(value ?? '')) : value ?? ''}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
        >
          <option value="" disabled hidden>{placeholder || '-- Chọn --'}</option>
          {name === 'dia_chi_hien_tai' && value && !options?.includes(normalizeBranchLabel(String(value))) && (
            <option value={normalizeBranchLabel(String(value))}>{String(value)}</option>
          )}
          {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          type={type} name={name} value={value ?? ''} onChange={onChange}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder} disabled={disabled} required={required}
          className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
        />
      )}
    </div>
  );
};

const clsx = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

export default CustomerFormModal;
