import {
  Users, Search, Plus, Filter,
  Mail, Phone, Calendar, MapPin,
  ChevronRight, ChevronLeft, Download, Edit2, Eye, Trash2,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { statusConfig, positionOptions, mockInterviewSessions } from './candidates/data';
import AddEditCandidateDialog from './candidates/dialogs/AddEditCandidateDialog';
import CandidateDetailDialog from './candidates/dialogs/CandidateDetailDialog';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { getCandidatesPaginated, getNextCandidateCode, upsertCandidate, deleteCandidate } from '../data/candidateData';
import type { Candidate, CandidateFormState } from './candidates/types';

const CandidatesPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [candidateDetailOpen, setCandidateDetailOpen] = useState(false);

  const [formState, setFormState] = useState<CandidateFormState>({
    formName: '',
    formEmail: '',
    formPhone: '',
    formAddress: '',
    formBirthYear: '',
    formBirthDate: '',
    formSource: '',
    formPosition: '',
    formCandidateCode: '',
    formStatus: 'new',
    formLatestInterview: '',
    formLatestResult: '',
    formInternalNotes: '',
    formDocuments: []
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const result = await getCandidatesPaginated(1, 100, debouncedSearch);
      setCandidates(result.data);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error(error);
      setCandidates([]);
      setTotalCount(0);
      setFetchError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCandidates = candidates;

  const candidatesByBranch = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of filteredCandidates) {
      const key = (c.co_so ?? '').trim() || 'Chưa xác định';
      const list = m.get(key);
      if (list) list.push(c);
      else m.set(key, [c]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [filteredCandidates]);

  const navigate = useNavigate();

  const renderCandidateRows = (branchRows: Candidate[]) =>
    branchRows.map((candidate) => (
      <tr
        key={candidate.id}
        className="hover:bg-muted/20 transition-colors group cursor-pointer"
        onClick={() => {
          setSelectedCandidate(candidate);
          setCandidateDetailOpen(true);
        }}
      >
        <td className="px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">
              {candidate.name}
            </span>
            <div className="flex flex-col gap-0.5 mt-1">
              <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 leading-none">
                <Mail size={12} className="opacity-50 shrink-0" /> {candidate.email || '—'}
              </span>
              <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 mt-0.5 leading-none">
                <Phone size={12} className="opacity-50 shrink-0" /> {candidate.phone || '—'}
              </span>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-foreground">{candidate.position}</span>
            <span className="text-[11px] font-mono text-primary mt-0.5 font-bold uppercase">
              {candidate.id_ung_vien || '—'}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 sm:px-6 sm:py-4">
          <span
            className={clsx(
              'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border',
              statusConfig[candidate.status as keyof typeof statusConfig]?.classes ||
                'bg-slate-100 text-slate-600 border-slate-200',
            )}
          >
            {statusConfig[candidate.status as keyof typeof statusConfig]?.label || 'Không xác định'}
          </span>
        </td>
        <td className="px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col">
            <span className="text-[13px] text-foreground">{candidate.latestInterview || '—'}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[150px] italic">
              {candidate.latestResult}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
          <div className="flex items-center justify-end gap-0.5 sm:gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCandidate(candidate);
                setCandidateDetailOpen(true);
              }}
              className="p-2 hover:bg-muted text-foreground rounded-lg transition-colors border border-transparent hover:border-border"
              title="Xem chi tiết"
            >
              <Eye size={16} />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFormState({
                    formName: candidate.name,
                    formEmail: candidate.email,
                    formPhone: candidate.phone,
                    formAddress: candidate.co_so ?? '',
                    formBirthYear: candidate.birthYear,
                    formBirthDate: '',
                    formSource: candidate.source,
                    formPosition: candidate.positionId,
                    formCandidateCode: candidate.id_ung_vien || '',
                    formStatus: candidate.status,
                    formLatestInterview: candidate.latestInterview,
                    formLatestResult: candidate.latestResult,
                    formInternalNotes: '',
                    formDocuments: candidate.documents || [],
                  });
                  setSelectedCandidate(candidate);
                  setIsAddDialogOpen(true);
                }}
                className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors border border-transparent hover:border-primary/20"
                title="Sửa"
              >
                <Edit2 size={16} />
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm('Bạn có chắc muốn xóa ứng viên này?')) {
                    try {
                      await deleteCandidate(candidate.id);
                      loadData();
                    } catch (err) {
                      window.alert('Không xóa được: ' + (err instanceof Error ? err.message : String(err)));
                    }
                  }
                }}
                className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-200"
                title="Xóa"
              >
                <Trash2 size={16} />
              </button>
            )}
            {!isAdmin && (
              <span className="text-[11px] italic text-muted-foreground px-1">Chỉ xem</span>
            )}
          </div>
        </td>
      </tr>
    ));

  return (
    <motion.div 
      layoutId="func-Ứng viên"
      className="flex flex-col h-full animate-in fade-in duration-500 p-4 lg:p-6"
    >
      {/* Back Button for Full Screen Mode */}
      <div className="mb-6 flex">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground text-[13px] font-medium transition-colors bg-card shadow-sm"
        >
          <ChevronLeft size={16} />
          Quay lại
        </button>
      </div>

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Users size={24} />
            </div>
            Quản lý ứng viên
          </h1>
          <p className="text-muted-foreground text-[13px] mt-1 italic ml-13">
            Hồ sơ nhân sự nhóm theo cơ sở — trên màn hình lớn hiển thị hai bảng cạnh nhau
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-all shadow-sm">
              <Download size={16} />
              Xuất file
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={async () => {
                const nextCode = await getNextCandidateCode();
                setFormState({
                  formName: '',
                  formEmail: '',
                  formPhone: '',
                  formAddress: '',
                  formBirthYear: '',
                  formBirthDate: '',
                  formSource: '',
                  formPosition: '',
                  formCandidateCode: nextCode,
                  formStatus: 'new',
                  formLatestInterview: '',
                  formLatestResult: '',
                  formInternalNotes: '',
                  formDocuments: []
                });
                setSelectedCandidate(null);
                setIsAddDialogOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <Plus size={18} />
              Thêm ứng viên
            </button>
          )}
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground/50">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm theo tên, email, vị trí..."
              className="w-full pl-10 pr-4 py-2.5 bg-muted/20 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
             <div className="h-10 w-px bg-border hidden md:block mx-1"></div>
             <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-all bg-muted/10">
               <Filter size={16} />
               Bộ lọc
             </button>
             <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-all bg-muted/10">
               <Calendar size={16} />
               Tất cả thời gian
             </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="mb-6 rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
          <strong>Không tải được dữ liệu.</strong> {fetchError} — kiểm tra bảng <code className="text-xs">nhan_su</code>,
          RLS (quyền đọc), hoặc cột <code className="text-xs">created_at</code> trên Supabase.
        </div>
      )}

      {/* Hai cột: mỗi cơ sở một bảng (xl+); mobile xếp dọc */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[200px]">
        {loading && (
          <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm flex items-center justify-center py-20">
            <div className="text-muted-foreground text-[13px] flex items-center gap-2">
              <Loader2 className="animate-spin" size={24} />
              Đang tải dữ liệu...
            </div>
          </div>
        )}

        {!loading &&
          candidatesByBranch.map(([branchLabel, branchRows]) => (
            <div
              key={branchLabel}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[280px]"
            >
              <div className="px-4 py-3 sm:px-5 border-b border-border bg-muted/25 flex items-center gap-2 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-700">
                  <MapPin size={18} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-foreground leading-tight">{branchLabel}</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {branchRows.length} nhân sự
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] sm:text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
                        Họ tên & Thông tin
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] sm:text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
                        Vị trí
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] sm:text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
                        Trạng thái
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] sm:text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
                        Ngày vào làm
                      </th>
                      <th className="px-4 py-3 sm:px-6 sm:py-3.5 text-[11px] sm:text-[12px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">{renderCandidateRows(branchRows)}</tbody>
                </table>
              </div>
            </div>
          ))}

        {!loading && !fetchError && filteredCandidates.length === 0 && (
          <div className="xl:col-span-2 bg-card rounded-2xl border border-border shadow-sm">
            <div className="px-6 py-20 text-center">
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                  <Users size={32} className="opacity-20" />
                </div>
                <p className="text-[14px] font-medium italic">Chưa có ứng viên hoặc không khớp tìm kiếm</p>
                <p className="text-[12px] mt-2 max-w-md">
                  Nếu đã có dữ liệu trên Supabase mà vẫn trống, kiểm tra chính sách RLS cho bảng{' '}
                  <code className="text-xs">nhan_su</code> (role <code className="text-xs">authenticated</code> cần SELECT).
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 text-primary font-bold text-[13px] hover:underline"
                >
                  Xóa ô tìm kiếm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Pagination */}
      <div className="flex items-center justify-between mt-6 px-2">
        <p className="text-[13px] text-muted-foreground">
          Hiển thị <span className="font-bold text-foreground">{filteredCandidates.length}</span> trên <span className="font-bold text-foreground">{totalCount}</span> ứng viên
        </p>
        <div className="flex items-center gap-2">
          <button disabled className="p-2 rounded-lg border border-border bg-card text-muted-foreground opacity-50 cursor-not-allowed">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div className="flex items-center">
             <span className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-[13px] font-bold shadow-sm ring-1 ring-primary/20">1</span>
          </div>
          <button disabled className="p-2 rounded-lg border border-border bg-card text-muted-foreground opacity-50 cursor-not-allowed">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Dialogs */}
      {isAddDialogOpen && (
        <AddEditCandidateDialog 
          isOpen={isAddDialogOpen}
          isClosing={false}
          isEditMode={!!selectedCandidate}
          onClose={() => {
            setIsAddDialogOpen(false);
            setSelectedCandidate(null);
          }}
          formState={formState}
          setFormField={(k, v) => setFormState(prev => ({ ...prev, [k]: v }))}
          positionOptions={positionOptions}
          isSaving={saving}
          onSave={async () => {
            if (!formState.formName.trim()) {
              window.alert('Vui lòng nhập họ tên.');
              return;
            }
            if (!formState.formPosition.trim()) {
              window.alert('Vui lòng chọn vị trí ứng tuyển (Quản lý hoặc Kỹ thuật viên).');
              return;
            }
            try {
              setSaving(true);
              const viTri = formState.formPosition.trim();
              const payload: Partial<Candidate> = {
                id: selectedCandidate?.id,
                name: formState.formName,
                email: formState.formEmail,
                phone: formState.formPhone,
                birthYear: formState.formBirthYear,
                position: viTri,
                positionId: viTri,
                id_ung_vien: formState.formCandidateCode.trim() || undefined,
                status: formState.formStatus as any,
                source: formState.formSource,
                latestInterview: formState.formLatestInterview,
                latestResult: formState.formLatestResult,
                documents: formState.formDocuments,
                co_so: formState.formAddress.trim() || selectedCandidate?.co_so || undefined,
              };
              await upsertCandidate(payload);
              setIsAddDialogOpen(false);
              setSelectedCandidate(null);
              await loadData();
            } catch (err) {
              window.alert('Lỗi khi lưu: ' + (err instanceof Error ? err.message : String(err)));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {candidateDetailOpen && (
        <CandidateDetailDialog 
          candidateId={selectedCandidate?.id || null}
          isClosing={false}
          isAdmin={isAdmin}
          onClose={() => {
            setCandidateDetailOpen(false);
            setSelectedCandidate(null);
          }}
          onEdit={() => {
            if (selectedCandidate) {
              setFormState({
                formName: selectedCandidate.name,
                formEmail: selectedCandidate.email,
                formPhone: selectedCandidate.phone,
                formAddress: selectedCandidate.co_so ?? '',
                formBirthYear: selectedCandidate.birthYear,
                formBirthDate: '',
                formSource: selectedCandidate.source,
                formPosition: selectedCandidate.positionId,
                formCandidateCode: selectedCandidate.id_ung_vien || '',
                formStatus: selectedCandidate.status,
                formLatestInterview: selectedCandidate.latestInterview,
                formLatestResult: selectedCandidate.latestResult,
                formInternalNotes: '',
                formDocuments: selectedCandidate.documents || []
              });
              setCandidateDetailOpen(false);
              setIsAddDialogOpen(true);
            }
          }}
          onDelete={async () => {
            if (!selectedCandidate) return;
            if (!window.confirm('Bạn có chắc muốn xóa hồ sơ này khỏi danh sách nhân sự?')) return;
            try {
              await deleteCandidate(selectedCandidate.id);
              setCandidateDetailOpen(false);
              setSelectedCandidate(null);
              await loadData();
            } catch (err) {
              window.alert('Không xóa được: ' + (err instanceof Error ? err.message : String(err)));
            }
          }}
          onAddDocument={() => {}}
          onOpenInterviewModal={() => {}}
          onOpenInterviewDetail={() => {}}
          onOpenInterviewEdit={() => {}}
          candidatesData={candidates}
          sessions={mockInterviewSessions}
        />
      )}

    </motion.div>
  );
};

export default CandidatesPage;
