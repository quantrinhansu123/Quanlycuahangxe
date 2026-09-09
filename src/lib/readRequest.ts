/** Deadline/cancellation for reads only; writes must never be retried automatically. */
export async function readRequest<T>(name: string, run: (signal: AbortSignal) => PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const started = performance.now();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
  try {
    const result = await run(controller.signal);
    if (timedOut) throw new Error('Máy chủ phản hồi chậm. Vui lòng thử lại.');
    return result;
  } catch (error) {
    if (timedOut) throw new Error('Máy chủ phản hồi chậm. Vui lòng thử lại.');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    performance.measure(name, { start: started, end: performance.now() });
  }
}
