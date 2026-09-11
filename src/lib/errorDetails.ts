/** Supabase rejects with plain objects as well as Error instances. */
export function getErrorDetails(error: unknown): { message?: string; code?: string; details?: string; hint?: string } {
  if (!error || typeof error !== 'object') return {};
  const value = error as Record<string, unknown>;
  const text = (key: string) => typeof value[key] === 'string' ? value[key] : undefined;
  return { message: text('message'), code: text('code'), details: text('details'), hint: text('hint') };
}

export function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  const details = getErrorDetails(error);
  const name = error && typeof error === 'object' && typeof (error as Record<string, unknown>).name === 'string'
    ? (error as Record<string, unknown>).name as string
    : '';
  return name === 'AbortError' || details.code === '20' || /\babort(?:ed|error)?\b/i.test(details.message || '');
}

/** Preserve useful server/network errors without leaking a generic false "not found" state. */
export function getReadErrorMessage(error: unknown, fallback: string): string {
  const details = getErrorDetails(error);
  const message = error instanceof Error ? error.message : details.message;
  const rawCode = error && typeof error === 'object' ? (error as Record<string, unknown>).code : undefined;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : details.code || '';
  const errorText = [message, details.details, details.hint].filter(Boolean).join(' ');
  if (code === '57014' || /statement timeout|canceling statement/i.test(errorText)) {
    return 'Máy chủ phản hồi chậm. Vui lòng thử lại.';
  }
  if (/failed to fetch|fetch failed|network\s*error|network request failed|load failed/i.test(errorText)) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  return message?.trim() || fallback;
}
