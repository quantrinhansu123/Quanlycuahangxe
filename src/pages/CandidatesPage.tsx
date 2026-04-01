import {
  Users, Search, Plus, Filter,
  Mail, Phone, Calendar,
  ChevronRight, ChevronLeft, Download, Edit2, Eye, Trash2
} from 'lucide-react';
import { clsx } from 'clsx';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidatesData, statusConfig, positionOptions, mockInterviewSessions } from './candidates/data';
import AddEditCandidateDialog from './candidates/dialogs/AddEditCandidateDialog';
import CandidateDetailDialog from './candidates/dialogs/CandidateDetailDialog';
import PersonnelDailyStatsModal from '../components/PersonnelDailyStatsModal';
import { motion } from 'framer-motion';

const CandidatesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [candidateDetailOpen, setCandidateDetailOpen] = useState(false);

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedStatsPerson, setSelectedStatsPerson] = useState<{ id: string, ho_ten: string } | null>(null);

  const filteredCandidates = candidatesData.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navigate = useNavigate();

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
            Hệ thống quản lý và theo dõi hồ sơ ứng tuyển
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-all shadow-sm">
            <Download size={16} />
            Xuất file
          </button>
          <button 
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            Thêm ứng viên
          </button>
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

      {/* Table Section */}
      <div className="flex-1 bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-6 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Họ tên & Thông tin</th>
                <th className="px-6 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Vị trí ứng tuyển</th>
                <th className="px-6 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Phỏng vấn gần nhất</th>
                <th className="px-6 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCandidates.map((candidate) => (
                <tr 
                  key={candidate.id} 
                  className="hover:bg-muted/20 transition-colors group cursor-pointer"
                  onClick={() => {
                    setSelectedCandidate(candidate);
                    setCandidateDetailOpen(true);
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-foreground group-hover:text-primary transition-colors">
                        {candidate.name}
                      </span>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 leading-none">
                          <Mail size={12} className="opacity-50" /> {candidate.email}
                        </span>
                        <span className="text-[12px] text-muted-foreground flex items-center gap-1.5 mt-0.5 leading-none">
                          <Phone size={12} className="opacity-50" /> {candidate.phone}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium text-foreground">{candidate.position}</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">{candidate.positionId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border",
                      statusConfig[candidate.status as keyof typeof statusConfig]?.classes || 'bg-slate-100 text-slate-600 border-slate-200'
                    )}>
                      {statusConfig[candidate.status as keyof typeof statusConfig]?.label || 'Không xác định'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[13px] text-foreground">{candidate.latestInterview}</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[150px] italic">
                        {candidate.latestResult}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedStatsPerson({ id: candidate.id, ho_ten: candidate.name }); setIsStatsModalOpen(true); }} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors" title="Xem KPI trong ngày">
                        <Eye size={16} />
                      </button>
                      <button className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors" title="Sửa">
                        <Edit2 size={16} />
                      </button>
                      <button className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors" title="Xóa">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCandidates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                        <Users size={32} className="opacity-20" />
                      </div>
                      <p className="text-[14px] font-medium italic">Không tìm thấy ứng viên nào phù hợp</p>
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="mt-4 text-primary font-bold text-[13px] hover:underline"
                      >
                        Xóa tất cả bộ lọc
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simplified Pagination */}
      <div className="flex items-center justify-between mt-6 px-2">
        <p className="text-[13px] text-muted-foreground">
          Hiển thị <span className="font-bold text-foreground">{filteredCandidates.length}</span> trên <span className="font-bold text-foreground">{candidatesData.length}</span> ứng viên
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
          isEditMode={false}
          onClose={() => setIsAddDialogOpen(false)}
          formState={{
            formName: '',
            formEmail: '',
            formPhone: '',
            formAddress: '',
            formBirthYear: '',
            formBirthDate: '',
            formSource: '',
            formPosition: '',
            formStatus: 'new',
            formLatestInterview: '',
            formLatestResult: '',
            formInternalNotes: '',
            formDocuments: []
          }}
          setFormField={() => {}}
          positionOptions={positionOptions}
        />
      )}

      {candidateDetailOpen && (
        <CandidateDetailDialog 
          candidateId={selectedCandidate?.id || null}
          isClosing={false}
          onClose={() => setCandidateDetailOpen(false)}
          onEdit={() => {}}
          onAddDocument={() => {}}
          onOpenInterviewModal={() => {}}
          onOpenInterviewDetail={() => {}}
          onOpenInterviewEdit={() => {}}
          candidatesData={candidatesData}
          sessions={mockInterviewSessions}
        />
      )}

      <PersonnelDailyStatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        personnelId={selectedStatsPerson?.id || ''}
        personnelName={selectedStatsPerson?.ho_ten || ''}
      />
    </motion.div>
  );
};

export default CandidatesPage;
