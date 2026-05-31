import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, User, Briefcase, Calendar, FileText,
  Plus, Edit, Trash, Trash2, ExternalLink, Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { Candidate, InterviewSession } from '../types';
import { formatDateVi } from '../../../utils/datetimeFormat';
import { statusConfig } from '../data';

interface Props {
  candidateId: string | null;
  isClosing: boolean;
  /** Nếu false, ẩn nút Sửa / Xóa (khớp bảng nhan_su, chỉ admin thao tác ghi). */
  isAdmin?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void | Promise<void>;
  onAddDocument: () => void;
  onOpenInterviewModal: () => void;
  onOpenInterviewDetail: (idx: number) => void;
  onOpenInterviewEdit: (idx: number) => void;
  candidatesData: Candidate[];
  sessions: InterviewSession[];
}

const CandidateDetailDialog: React.FC<Props> = ({
  candidateId,
  isClosing,
  isAdmin = true,
  onClose,
  onEdit,
  onDelete,
  onAddDocument,
  onOpenInterviewModal,
  onOpenInterviewDetail,
  onOpenInterviewEdit,
  candidatesData,
  sessions,
}) => {
  if (!candidateId && !isClosing) return null;

  const candidate = candidatesData.find(c => c.id === candidateId);
  const docs = candidate?.documents ?? [];

  return createPortal(
    <div className="fixed inset-0 z-9999 flex justify-end">
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
          isClosing && 'opacity-0',
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
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">{candidate?.name}</h2>
              <p className="text-[13px] text-muted-foreground">{candidate?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* Profile Overview Card */}
          <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary/20">
                {candidate?.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{candidate?.name}</h3>
                    <p className="text-[14px] text-muted-foreground font-medium mt-0.5">{candidate?.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className={clsx(
                        'px-3 py-1 rounded-full text-[11px] font-bold border flex items-center justify-center',
                        statusConfig[candidate?.status || 'new'].classes,
                      )}
                    >
                      {statusConfig[candidate?.status || 'new'].label}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold border bg-sky-500/10 text-sky-500 border-sky-100 flex items-center justify-center">
                      {candidate?.source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Thông tin cá nhân */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden text-[13px]">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <User size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin cá nhân</span>
            </div>
            <div className="p-5 grid grid-cols-2 gap-y-6 gap-x-12">
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Họ tên</p>
                <p className="font-bold text-foreground">{candidate?.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Email</p>
                <p className="font-bold text-foreground">{candidate?.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Số điện thoại</p>
                <p className="font-bold text-foreground">{candidate?.phone}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Địa chỉ</p>
                <p className="font-bold text-foreground">Q.1, TP.HCM</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Ngày sinh</p>
                <p className="font-bold text-foreground">1995-05-15</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Năm sinh</p>
                <p className="font-bold text-foreground">{formatDateVi(candidate?.birthYear)}</p>
              </div>
            </div>
          </div>

          {/* Vị trí ứng tuyển */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden text-[13px]">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Vị trí ứng tuyển</span>
            </div>
            <div className="p-5 grid grid-cols-2 gap-y-6 gap-x-12">
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Vị trí ứng tuyển</p>
                <p className="font-bold text-foreground">{candidate?.positionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Chức vụ</p>
                <p className="font-bold text-foreground">{candidate?.position}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Trạng thái</p>
                <div className="flex">
                  <span
                    className={clsx(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold border',
                      statusConfig[candidate?.status || 'new'].classes,
                    )}
                  >
                    {statusConfig[candidate?.status || 'new'].label}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">Nguồn ứng tuyển</p>
                <div className="flex">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-sky-500/10 text-sky-500 border-sky-100">
                    {candidate?.source}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Phỏng vấn gần nhất */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden text-[13px]">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <Calendar size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Phỏng vấn gần nhất</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium text-[12px]">Ngày PV</p>
                <p className="font-medium text-foreground">{formatDateVi(candidate?.latestInterview)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium text-[12px]">Kết quả</p>
                <p className="font-medium text-foreground">{candidate?.latestResult || '—'}</p>
              </div>
            </div>
          </div>

          {/* Tài liệu */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Tài liệu</span>
                <span className="ml-1 w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                  {docs.length}
                </span>
              </div>
              <div className="flex-1 mx-4 border-t border-dashed border-border/60" />
              <button
                onClick={onAddDocument}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
              >
                <Plus size={16} />
                Thêm tài liệu
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left w-12 rounded-l-lg">#</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Tên file</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Loại</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Link</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-center w-24 rounded-r-lg">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[13px] text-muted-foreground italic">
                        Chưa có tài liệu
                      </td>
                    </tr>
                  ) : (
                    docs.map((doc, idx) => (
                      <tr key={doc.id}>
                        <td className="px-4 py-3 border-r border-border/40 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-3 border-r border-border/40 text-foreground">{doc.name}</td>
                        <td className="px-4 py-3 border-r border-border/40 text-muted-foreground">{doc.type}</td>
                        <td className="px-4 py-3 border-r border-border/40">
                          <a href={doc.link} className="flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink size={14} /> Xem
                          </a>
                        </td>
                        <td className="px-4 py-3 flex items-center justify-center gap-2">
                          <button className="p-1.5 rounded text-blue-500 hover:bg-blue-50"><Edit size={14} /></button>
                          <button className="p-1.5 rounded text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lịch phỏng vấn */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2 bg-muted/5">
              <Calendar size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Lịch phỏng vấn</span>
              <span className="ml-1 w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                {sessions.length}
              </span>
              <div className="flex-1 mx-4 border-t border-dashed border-border/60" />
              <button
                onClick={onOpenInterviewModal}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary text-white text-[12px] font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
              >
                <Plus size={16} />
                Thêm lịch PV
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left w-10">#</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left w-16">Vòng</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Ngày – Giờ</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Hình thức</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Địa điểm</th>
                    <th className="px-4 py-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground uppercase text-left">Trạng thái</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-muted-foreground uppercase text-center w-24">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {sessions.map((session, idx) => (
                    <tr key={session.round}>
                      <td className="px-4 py-3 border-r border-border/40 text-muted-foreground text-center">{idx + 1}</td>
                      <td className="px-4 py-3 border-r border-border/40 text-foreground font-bold text-center">{session.round}</td>
                      <td className="px-4 py-3 border-r border-border/40 text-foreground whitespace-pre-line">
                        {formatDateVi(session.date)}{'\n'}– {session.time}
                      </td>
                      <td className="px-4 py-3 border-r border-border/40">
                        <span
                          className={clsx(
                            'px-2 py-1 rounded-full text-[11px] border',
                            session.statusColor === 'emerald'
                              ? 'bg-muted/30 border-border'
                              : 'bg-sky-500/10 text-sky-600 border-sky-100',
                          )}
                        >
                          {session.format}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-border/40 text-muted-foreground leading-tight">
                        {session.location.length > 12 ? session.location.slice(0, 12) + '...' : session.location}
                      </td>
                      <td className="px-4 py-3 border-r border-border/40">
                        {session.statusColor === 'emerald' ? (
                          <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-100 text-[10px] whitespace-nowrap">
                            {session.status}
                          </span>
                        ) : session.statusColor === 'orange' ? (
                          <span className="px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-100 text-[10px]">
                            {session.status}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border text-[10px]">
                            {session.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 flex items-center justify-center gap-1">
                        <button
                          onClick={() => onOpenInterviewDetail(idx)}
                          className="p-1 rounded text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                        <button onClick={() => onOpenInterviewEdit(idx)} className="p-1 rounded text-blue-500 hover:bg-blue-50"><Edit size={14} /></button>
                        <button className="p-1 rounded text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ghi chú nội bộ */}
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Ghi chú nội bộ</span>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-foreground font-medium italic">Ưu tiên gọi lại sau Tết.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-[13px] font-bold transition-all"
          >
            Đóng
          </button>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                >
                  <Edit size={16} />
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete?.()}
                  disabled={!onDelete}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-bold hover:bg-red-50 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Trash size={16} />
                  Xóa
                </button>
              </>
            )}
            {!isAdmin && (
              <span className="text-[12px] text-muted-foreground italic">Chỉ xem — cần quyền quản trị để sửa/xóa.</span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CandidateDetailDialog;
