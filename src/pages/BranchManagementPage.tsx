import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import BranchCreateButton from '../components/BranchCreateButton';
import { useBranches } from '../hooks/useBranches';
import { deleteBranch, loadBranches } from '../data/branchData';
import { useAuth } from '../context/AuthContext';
import { getErrorDetails } from '../lib/errorDetails';

export default function BranchManagementPage() {
  const branches = useBranches();
  const { isAdmin } = useAuth();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const handleDelete = async (branch: string) => {
    if (!isAdmin || deleting || !window.confirm(`Xóa “${branch}”? Chỉ có thể xóa cơ sở chưa được dữ liệu nào sử dụng.`)) return;
    setDeleting(branch);
    setError('');
    setNotice('');
    try {
      await deleteBranch(branch);
      setNotice(`Đã xóa ${branch}.`);
    } catch (cause) {
      setError(getErrorDetails(cause).message || 'Không xóa được cơ sở. Vui lòng thử lại.');
    } finally {
      setDeleting(null);
    }
  };
  useEffect(() => { void loadBranches(true).catch(() => setError('Không tải được danh mục cơ sở. Vui lòng thử lại.')); }, []);
  return <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
    <Link to="/" className="text-sm text-primary">← Trang chủ</Link>
    <div className="flex items-center justify-between"><h1 className="font-bold text-xl">Quản lý cơ sở</h1><BranchCreateButton onCreated={() => setError('')} /></div>
    <p className="text-sm text-muted-foreground">Cơ sở mới sẽ xuất hiện trong các biểu mẫu và bộ lọc.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <ul className="rounded-xl border border-border divide-y divide-border bg-card">{branches.map(branch => <li key={branch} className="p-4 font-medium flex items-center justify-between gap-3">
      <span>{branch}</span>
      {isAdmin && <button type="button" aria-label={`Xóa ${branch}`} disabled={deleting !== null} onClick={() => void handleDelete(branch)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 shrink-0">
        <Trash2 size={16} />{deleting === branch ? 'Đang xóa...' : 'Xóa'}
      </button>}
    </li>)}</ul>
    <p className="text-sm text-muted-foreground">Cơ sở đã được sử dụng trong dữ liệu sẽ được giữ lại để bảo toàn lịch sử.</p>
  </div>;
}
