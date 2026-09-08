/** Supabase rejects with plain objects as well as Error instances. */
export function getErrorDetails(error: unknown): { message?: string; code?: string; details?: string; hint?: string } {
  if (!error || typeof error !== 'object') return {};
  const value = error as Record<string, unknown>;
  const text = (key: string) => typeof value[key] === 'string' ? value[key] : undefined;
  return { message: text('message'), code: text('code'), details: text('details'), hint: text('hint') };
}
