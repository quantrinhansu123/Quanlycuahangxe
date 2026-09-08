import { supabase } from '../lib/supabase';
import { branchLabel, getBranchOptions, setBranchOptions } from '../lib/branchCatalog';

let inFlight: Promise<void> | undefined;
let loadedAt = 0;
export async function loadBranches(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - loadedAt < 60_000) return;
  inFlight = (async () => {
    const names: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('co_so').select('ten_co_so').order('id').range(from, from + 999);
      if (error) throw error;
      names.push(...data.map(row => row.ten_co_so));
      if (data.length < 1000) break;
    }
    setBranchOptions(names);
    loadedAt = Date.now();
  })().finally(() => { inFlight = undefined; });
  return inFlight;
}

export async function createBranch(name: string): Promise<string> {
  const label = branchLabel(name);
  if (!label || label.length > 120) throw new Error('Nhập tên cơ sở từ 1 đến 114 ký tự.');
  const { data, error } = await supabase.from('co_so').insert({ ten_co_so: label }).select('ten_co_so').single();
  if (error?.code === '23505') throw new Error('Cơ sở này đã tồn tại.');
  if (error) throw error;
  // Finish an older read before publishing the newly persisted row.
  if (inFlight) await inFlight.catch(() => {});
  setBranchOptions([...getBranchOptions(), data.ten_co_so]);
  void loadBranches(true).catch(() => {});
  return data.ten_co_so;
}
