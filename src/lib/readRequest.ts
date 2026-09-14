/** Deadline/cancellation for reads only; writes must never be retried automatically. */
export async function readRequest<T>(name: string, run: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  let failed = false;
  const started = performance.now();
  // Mobile connections and Supabase cold starts can legitimately exceed 8s.
  // Keep a bounded deadline, but avoid converting normal cold starts into false
  // "not found" errors in the UI.
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
  try {
    const result = await run(controller.signal);
    failed = !!(result && typeof result === 'object' && 'error' in result && result.error);
    if (timedOut) throw new Error('Máy chủ phản hồi chậm. Vui lòng thử lại.');
    return result;
  } catch (error) {
    failed = true;
    if (timedOut) throw new Error('Máy chủ phản hồi chậm. Vui lòng thử lại.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    const elapsed = performance.now() - started;
    performance.measure(name, { start: started, end: started + elapsed });
    // Keep a lightweight client-side breadcrumb for correlating slow browser
    // requests with Supabase Postgres/API logs. Do not log payloads or PII.
    if (elapsed >= 1000 && (timedOut || !signal?.aborted)) {
      try {
        console.warn('[slow-request]', {
          operation: name, durationMs: Math.round(elapsed),
          outcome: timedOut ? 'timeout' : failed ? 'error' : 'ok',
          at: new Date().toISOString(), phase: 'complete',
        });
      } catch { /* Logging is best-effort. */ }
    }
  }
}
