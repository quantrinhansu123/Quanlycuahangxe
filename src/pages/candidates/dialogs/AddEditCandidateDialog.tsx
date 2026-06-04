import { clsx } from 'clsx';
import {
  Briefcase,
  Calendar,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
  UserPlus, X,
  Loader2,
} from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';

import type { CandidateDocument, CandidateFormState, FilterOption } from '../types';
import DatePickerVi from '../../../components/ui/DatePickerVi';

interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  onClose: () => void;
  formState: CandidateFormState;
  setFormField: <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => void;
  positionOptions: FilterOption[];
  onSave: () => void;
  isSaving: boolean;
}

const AddEditCandidateDialog: React.FC<Props> = ({
  isOpen,
  isClosing,
  isEditMode,
  onClose,
  formState,
  setFormField,
  positionOptions,
  onSave,
  isSaving,
}) => {
  if (!isOpen && !isClosing) return null;

  const {
    formName, formEmail, formPhone, formPassword, formAddress, formBirthDate,
    formPosition, formCandidateCode, formLatestInterview,
    formInternalNotes, formDocuments,
  } = formState;

  const setFormDocuments = (updater: (prev: CandidateDocument[]) => CandidateDocument[]) => {
    setFormField('formDocuments', updater(formDocuments));
  };

  return createPortal(
    <div className="fixed inset-0 z-9999 flex justify-end">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
          isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full max-w-[750px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border',
          isClosing
            ? 'dialog-slide-out'
            : 'dialog-slide-in',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <UserPlus size={20} />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {isEditMode ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
            title="Đóng (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* THÔNG TIN CÁ NHÂN */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <User size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin cá nhân</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground lowercase">Mã nhân sự</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    placeholder="UV-XXXX"
                    value={formCandidateCode}
                    onChange={e => setFormField('formCandidateCode', e.target.value)}
                    className={clsx(
                      "w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all",
                      isEditMode && "opacity-70 bg-muted cursor-not-allowed"
                    )}
                    disabled={isEditMode}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Họ tên <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    placeholder="Nhập họ tên"
                    value={formName}
                    onChange={e => setFormField('formName', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Email <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={formEmail}
                    onChange={e => setFormField('formEmail', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Số điện thoại</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <input
                    type="text"
                    placeholder="0901234567"
                    value={formPhone}
                    onChange={e => setFormField('formPhone', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
              </div>
              {isEditMode && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-foreground">{'M\u1eadt kh\u1ea9u'}</label>
                  <input
                    type="password"
                    placeholder={'Nh\u1eadp m\u1eadt kh\u1ea9u m\u1edbi'}
                    value={formPassword}
                    onChange={e => setFormField('formPassword', e.target.value)}
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">{'C\u01a1 s\u1edf / chi nh\u00e1nh'}</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <select
                    value={formAddress}
                    onChange={e => setFormField('formAddress', e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    <option value="">{'Ch\u1ecdn c\u01a1 s\u1edf'}</option>
                    <option value={'C\u01a1 s\u1edf B\u1eafc Giang'}>{'C\u01a1 s\u1edf B\u1eafc Giang'}</option>
                    <option value={'C\u01a1 s\u1edf B\u1eafc Ninh'}>{'C\u01a1 s\u1edf B\u1eafc Ninh'}</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[13px] font-bold text-foreground">Ngày sinh</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                  <DatePickerVi
                    value={formBirthDate}
                    onChange={(iso) => setFormField('formBirthDate', iso)}
                    className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all scheme-light dark:scheme-dark cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Vị trí, ngày vào làm, ghi chú — chung một khung */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">
                Vị trí &amp; ghi chú
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-foreground">Vị trí</label>
                  <select
                    value={formPosition}
                    onChange={e => setFormField('formPosition', e.target.value)}
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    <option value="">Chọn Quản lý hoặc Kỹ thuật viên</option>
                    {positionOptions.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    {formPosition && !positionOptions.some(p => p.id === formPosition) ? (
                      <option value={formPosition}>{formPosition}</option>
                    ) : null}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-foreground">Ngày vào làm</label>
                  <DatePickerVi
                    value={formLatestInterview.length >= 10 ? formLatestInterview.slice(0, 10) : formLatestInterview}
                    onChange={(iso) => setFormField('formLatestInterview', iso)}
                    className="w-full px-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all scheme-light dark:scheme-dark cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-foreground">Ghi chú nội bộ</label>
                <textarea
                  placeholder="Ghi chú cho HR (tùy chọn)"
                  rows={3}
                  value={formInternalNotes}
                  onChange={e => setFormField('formInternalNotes', e.target.value)}
                  className="w-full px-4 py-3 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                />
              </div>
            </div>
          </div>

          {/* TÀI LIỆU ĐÍNH KÈM */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between bg-muted/5">
              <div className="flex items-center gap-3">
                <FileText size={16} className="text-primary" />
                <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Tài liệu đính kèm</span>
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                  {formDocuments.length}
                </span>
              </div>
              <div className="flex-1 mx-4 border-t border-dashed border-border/60" />
              <button
                onClick={() =>
                  setFormDocuments(prev => [
                    ...prev,
                    { id: `new-${Date.now()}`, name: '', type: '', link: '' },
                  ])
                }
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
              >
                <Plus size={16} />
                Thêm tài liệu
              </button>
            </div>
            <div className="p-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-left w-10 rounded-l-lg">#</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-left">Tên file</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-left w-28">Loại</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-left w-28">Link</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-center w-20 rounded-r-lg">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {formDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[13px] text-muted-foreground italic">
                        Chưa có tài liệu
                      </td>
                    </tr>
                  ) : (
                    formDocuments.map((doc, idx) => (
                      <tr key={doc.id}>
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={doc.name}
                            onChange={e =>
                              setFormDocuments(prev =>
                                prev.map(d => (d.id === doc.id ? { ...d, name: e.target.value } : d)),
                              )
                            }
                            placeholder="Tên file"
                            className="w-full px-3 py-1.5 bg-muted/10 border border-border rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={doc.type}
                            onChange={e =>
                              setFormDocuments(prev =>
                                prev.map(d => (d.id === doc.id ? { ...d, type: e.target.value } : d)),
                              )
                            }
                            placeholder="Loại"
                            className="w-full px-3 py-1.5 bg-muted/10 border border-border rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={doc.link}
                            onChange={e =>
                              setFormDocuments(prev =>
                                prev.map(d => (d.id === doc.id ? { ...d, link: e.target.value } : d)),
                              )
                            }
                            placeholder="#"
                            className="w-full px-3 py-1.5 bg-muted/10 border border-border rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() =>
                              setFormDocuments(prev => prev.filter(d => d.id !== doc.id))
                            }
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
          >
            Hủy
          </button>
          <button 
            onClick={onSave}
            disabled={isSaving}
            className={clsx(
              "flex items-center gap-2 px-8 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all group",
              isSaving && "opacity-70 cursor-not-allowed"
            )}
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Plus size={18} />
            )}
            {isEditMode ? 'Lưu thay đổi' : 'Thêm mới'}
            {!isSaving && <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AddEditCandidateDialog;




