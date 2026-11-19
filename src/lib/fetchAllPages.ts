const PAGE_SIZE = 1000; // trần mặc định của PostgREST/Supabase

/** Lấy hết dòng bằng cách phân trang .range(); query phải có order ổn định (thêm id làm khóa phụ). */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) return out;
  }
}
