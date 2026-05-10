export interface CandidateDocument {
  id: string;
  name: string;
  type: string;
  link: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthYear: string;
  position: string;
  positionId: string;
  id_ung_vien?: string | null;
  /** Cơ sở (bảng nhan_su.co_so), map qua form địa chỉ/chi nhánh khi sửa. */
  co_so?: string | null;
  status: 'new' | 'reviewing' | 'interviewing' | 'interviewed' | 'hired' | 'rejected';
  source: string;
  latestInterview: string;
  latestResult: string;
  createdAt: string;
  documents: CandidateDocument[];
}

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export interface InterviewSession {
  round: number;
  date: string;
  time: string;
  format: string;
  location: string;
  status: string;
  statusColor: 'emerald' | 'orange' | 'default';
  evalStatus: string;
  score: string;
  comment: string;
  result: string;
}

export interface CandidateFormState {
  formName: string;
  formEmail: string;
  formPhone: string;
  formAddress: string;
  formBirthYear: string;
  formBirthDate: string;
  formSource: string;
  formPosition: string;
  formCandidateCode: string;
  formStatus: string;
  formLatestInterview: string;
  formLatestResult: string;
  formInternalNotes: string;
  formDocuments: CandidateDocument[];
}

export interface InterviewFormState {
  ivRound: string;
  ivStatus: string;
  ivDate: string;
  ivTime: string;
  ivFormat: string;
  ivLocation: string;
  ivEvalStatus: string;
  ivEvalScore: string;
  ivEvalComment: string;
  ivResult: string;
  ivNote: string;
}
