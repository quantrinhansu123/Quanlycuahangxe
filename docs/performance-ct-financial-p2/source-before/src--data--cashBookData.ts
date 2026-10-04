const STORAGE_KEY = 'so_quy_opening_balances_v1';

function buildScopeKey(branches: string[], dateFrom: string): string {
  const branchKey = branches.length > 0 ? [...branches].sort().join('|') : '*';
  return `${branchKey}::${dateFrom}`;
}

function readMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Tồn đầu kỳ theo cơ sở (lọc) + ngày bắt đầu kỳ. */
export function getOpeningBalance(branches: string[], dateFrom: string): number {
  if (!dateFrom) return 0;
  const map = readMap();
  const val = map[buildScopeKey(branches, dateFrom)];
  return Number.isFinite(val) ? val : 0;
}

export function setOpeningBalance(branches: string[], dateFrom: string, amount: number): void {
  if (!dateFrom) return;
  const map = readMap();
  const key = buildScopeKey(branches, dateFrom);
  const safe = Math.max(0, Math.round(Number(amount) || 0));
  map[key] = safe;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
