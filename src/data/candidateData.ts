import { supabase } from '../lib/supabase';
import type { Candidate } from '../pages/candidates/types';
import { deletePersonnel, getNextPersonnelCode, upsertPersonnel, type NhanSu } from './personnelData';

import { getStoredDemoRole } from '../lib/authStorage';

const isDemo = () => typeof window !== 'undefined' && !!getStoredDemoRole();

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

const MOCK_CANDIDATES: Candidate[] = [
  {
    id: 'demo-ns-1',
    id_ung_vien: 'NV-0001',
    name: 'Nguyễn Văn A',
    email: 'a@example.com',
    phone: '0901000001',
    birthYear: '',
    position: 'Kỹ thuật viên',
    positionId: 'Kỹ thuật viên',
    status: 'hired',
    source: '',
    latestInterview: '2024-01-15',
    latestResult: '',
    createdAt: new Date().toISOString(),
    documents: [],
    co_so: 'Cơ sở Bắc Giang',
  },
  {
    id: 'demo-ns-2',
    id_ung_vien: 'NV-0002',
    name: 'Trần Thị B',
    email: 'b@example.com',
    phone: '0901000002',
    birthYear: '',
    position: 'Quản lý',
    positionId: 'Quản lý',
    status: 'hired',
    source: '',
    latestInterview: '2023-06-01',
    latestResult: '',
    createdAt: new Date().toISOString(),
    documents: [],
    co_so: 'Cơ sở Bắc Ninh',
  },
];

let demoCandidates: Candidate[] | null = null;

function getDemoList(): Candidate[] {
  if (!demoCandidates) {
    demoCandidates = MOCK_CANDIDATES.map((c) => ({
      ...c,
      documents: [...(c.documents || [])],
    }));
  }
  return demoCandidates;
}

function applySearchLocal(list: Candidate[], q: string): Candidate[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.id_ung_vien || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s)
  );
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Truy vấn nhan_su: ưu tiên created_at; nếu DB không có cột thì fallback order theo id. */
async function queryNhanSuRange(
  from: number,
  to: number,
  searchQuery?: string
): Promise<{ data: unknown[] | null; count: number | null; error: { message: string; code?: string } | null }> {
  const buildBase = () => {
    let q = supabase.from('nhan_su').select('*', { count: 'exact' });
    const raw = searchQuery?.trim();
    if (raw) {
      const esc = escapeIlike(raw);
      q = q.or(`ho_ten.ilike.%${esc}%,email.ilike.%${esc}%,sdt.ilike.%${esc}%,id_nhan_su.ilike.%${esc}%`);
    }
    return q;
  };

  let res = await buildBase().order('created_at', { ascending: false }).range(from, to);
  if (
    res.error &&
    (/created_at|column.*does not exist|schema cache/i.test(res.error.message) ||
      res.error.code === '42703')
  ) {
    res = await buildBase().order('id', { ascending: false }).range(from, to);
  }
  return { data: res.data, count: res.count ?? null, error: res.error };
}

const mapDbToCandidate = (db: Record<string, unknown>): Candidate => {
  const idRaw = db?.id;
  const id =
    idRaw != null && String(idRaw).trim() !== ''
      ? String(idRaw)
      : db?.id_nhan_su != null
        ? `code:${String(db.id_nhan_su)}`
        : `row:${Math.random().toString(36).slice(2)}`;
  const ngayVaoLam = db.ngay_vao_lam != null ? String(db.ngay_vao_lam).slice(0, 10) : '';
  return {
    id,
    id_ung_vien: (db.id_nhan_su as string | null | undefined) ?? null,
    name: (db.ho_ten as string) ?? '',
    email: (db.email as string) ?? '',
    phone: (db.sdt as string) ?? '',
    birthYear: '',
    position: (db.vi_tri as string) ?? '',
    positionId: (db.vi_tri as string) ?? '',
    status: 'hired',
    source: '',
    latestInterview: ngayVaoLam,
    latestResult: '',
    createdAt: db.created_at != null ? String(db.created_at) : '',
    documents: [],
    co_so: (db.co_so as string) ?? null,
  };
};

function candidateToNhanSuPayload(candidate: Partial<Candidate>): Partial<NhanSu> {
  const hoTen = candidate.name?.trim() || 'Chưa có tên';
  const viTri =
    (candidate.position != null && String(candidate.position).trim() !== '' && candidate.position.trim()) ||
    (candidate.positionId != null && String(candidate.positionId).trim() !== '' && candidate.positionId.trim()) ||
    'Chưa xác định';
  const coSo =
    candidate.co_so != null && String(candidate.co_so).trim() !== ''
      ? String(candidate.co_so).trim()
      : 'Chưa xác định';

  const payload: Partial<NhanSu> = {
    ...(candidate.id != null && isUuid(String(candidate.id)) ? { id: String(candidate.id) } : {}),
    id_nhan_su: candidate.id_ung_vien?.trim() ? candidate.id_ung_vien.trim() : null,
    ho_ten: hoTen,
    email: candidate.email?.trim() || null,
    sdt: candidate.phone?.trim() || null,
    password:
      candidate.password !== undefined
        ? (String(candidate.password).trim() || null)
        : undefined,
    vi_tri: viTri,
    co_so: coSo,
  };

  if (candidate.latestInterview !== undefined) {
    const t = String(candidate.latestInterview).trim();
    payload.ngay_vao_lam = t === '' ? null : t;
  }

  return payload;
}

export const getCandidates = async (): Promise<Candidate[]> => {
  if (isDemo()) return getDemoList();

  const { data, error } = await supabase.from('nhan_su').select('*').order('created_at', { ascending: false });

  if (error) {
    if (/created_at|42703/i.test(error.message) || error.code === '42703') {
      const r2 = await supabase.from('nhan_su').select('*').order('id', { ascending: false });
      if (r2.error) {
        console.error('Error fetching candidates:', r2.error);
        throw r2.error;
      }
      return (r2.data || []).map((row) => mapDbToCandidate(row as Record<string, unknown>));
    }
    console.error('Error fetching candidates:', error);
    throw error;
  }
  return (data || []).map((row) => mapDbToCandidate(row as Record<string, unknown>));
};

export const upsertCandidate = async (candidate: Partial<Candidate>): Promise<Candidate> => {
  if (isDemo()) {
    const list = getDemoList();
    const codeRaw = candidate.id_ung_vien?.trim() ?? '';
    const idx = list.findIndex(
      (c) =>
        (candidate.id != null && c.id === candidate.id) ||
        (codeRaw !== '' && c.id_ung_vien === codeRaw)
    );
    const hoTen = candidate.name?.trim() || 'Chưa có tên';
    const viTri =
      (candidate.position != null && String(candidate.position).trim() !== '' && candidate.position.trim()) ||
      (candidate.positionId != null && String(candidate.positionId).trim() !== '' && candidate.positionId.trim()) ||
      'Chưa xác định';
    const coSo =
      candidate.co_so != null && String(candidate.co_so).trim() !== ''
        ? String(candidate.co_so).trim()
        : 'Chưa xác định';
    const row: Candidate = {
      id: idx >= 0 ? list[idx].id : `demo-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      id_ung_vien: codeRaw === '' ? null : codeRaw,
      name: hoTen,
      email: candidate.email ?? '',
      phone: candidate.phone ?? '',
      birthYear: candidate.birthYear ?? '',
      position: viTri,
      positionId: candidate.positionId || viTri,
      status: (candidate.status as Candidate['status']) || 'hired',
      source: candidate.source ?? '',
      latestInterview: candidate.latestInterview ?? '',
      latestResult: candidate.latestResult ?? '',
      createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
      documents: candidate.documents ?? [],
      co_so: coSo,
    };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    return row;
  }

  const saved = await upsertPersonnel(candidateToNhanSuPayload(candidate));
  return mapDbToCandidate(saved as unknown as Record<string, unknown>);
};

export const deleteCandidate = async (id: string, candidateCode?: string | null): Promise<void> => {
  if (isDemo()) {
    const list = getDemoList();
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) list.splice(i, 1);
    return;
  }

  const tryDeleteBy = async (column: 'id' | 'id_nhan_su', value: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('nhan_su')
      .delete()
      .eq(column, value)
      .select('id')
      .limit(1);
    if (error) throw new Error(error.message || 'Khong xoa duoc theo khoa xoa.');
    return !!(data && data.length > 0);
  };

  const codeCandidates = [
    candidateCode?.trim() || '',
    id.startsWith('code:') ? id.slice(5).trim() : '',
    !isUuid(id) && !id.startsWith('row:') ? id.trim() : '',
  ].filter(Boolean);

  if (isUuid(id)) {
    try {
      await deletePersonnel(id);
      return;
    } catch {
      // fallback below
    }
  } else if (!id.startsWith('row:') && id.trim()) {
    if (await tryDeleteBy('id', id.trim())) return;
  }

  for (const code of codeCandidates) {
    if (await tryDeleteBy('id_nhan_su', code)) return;
  }

  throw new Error('Khong xoa duoc: khong tim thay ban ghi phu hop de xoa.');
};

export const getCandidatesPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string
): Promise<{ data: Candidate[]; totalCount: number }> => {
  if (isDemo()) {
    const filtered = applySearchLocal(getDemoList(), searchQuery || '');
    const from = (page - 1) * pageSize;
    const slice = filtered.slice(from, from + pageSize);
    return { data: slice, totalCount: filtered.length };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await queryNhanSuRange(from, to, searchQuery);

  if (error) {
    console.error('Error fetching paginated candidates:', error);
    throw new Error(error.message || 'Không tải được danh sách (nhan_su)');
  }

  return {
    data: (data || []).map((row) => mapDbToCandidate(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  };
};

export const getNextCandidateCode = async (): Promise<string> => {
  if (isDemo()) {
    let max = 0;
    for (const c of getDemoList()) {
      const m = String(c.id_ung_vien || '').match(/^NV-(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `NV-${String((max || 0) + 1).padStart(4, '0')}`;
  }
  return getNextPersonnelCode();
};
