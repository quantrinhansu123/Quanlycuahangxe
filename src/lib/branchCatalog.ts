export function branchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .trim().toLowerCase().replace(/\s+/g, ' ').replace(/^co so\s+/, '');
}

export function branchLabel(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ').replace(/^(cơ sở|co so)\s+/i, '');
  return name ? `Cơ sở ${name}` : '';
}

let branches: string[] = [];
const listeners = new Set<() => void>();
export const getBranchOptions = () => branches;
export const subscribeBranches = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setBranchOptions(values: string[]) {
  const unique = new Map<string, string>();
  for (const value of values) if (branchKey(value)) unique.set(branchKey(value), branchLabel(value));
  branches = [...unique.values()].sort((a, b) => a.localeCompare(b, 'vi'));
  listeners.forEach(listener => listener());
}
