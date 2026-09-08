import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BranchCreateButton from '../components/BranchCreateButton';
import { useBranches } from '../hooks/useBranches';
import { loadBranches } from '../data/branchData';

export default function BranchManagementPage() {
  const branches = useBranches();
  const [error, setError] = useState('');
  useEffect(() => { void loadBranches(true).catch(() => setError('Không tải được danh mục cơ sở. Vui lòng thử lại.')); }, []);
  return <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
    <Link to="/" className="text-sm text-primary">← Trang chủ</Link>
    <div className="flex items-center justify-between"><h1 className="font-bold text-xl">Quản lý cơ sở</h1><BranchCreateButton onCreated={() => setError('')} /></div>
    <p className="text-sm text-muted-foreground">Cơ sở mới sẽ xuất hiện trong các biểu mẫu và bộ lọc.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <ul className="rounded-xl border border-border divide-y divide-border bg-card">{branches.map(branch => <li key={branch} className="p-4 font-medium">{branch}</li>)}</ul>
  </div>;
}
