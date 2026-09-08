import { useEffect, useSyncExternalStore } from 'react';
import { getBranchOptions, subscribeBranches } from '../lib/branchCatalog';
import { loadBranches } from '../data/branchData';

export function useBranches(): string[] {
  const branches = useSyncExternalStore(subscribeBranches, getBranchOptions);
  useEffect(() => {
    const refresh = () => { void loadBranches().catch(() => { /* Existing options remain usable; manager page shows errors. */ }); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  return branches;
}
