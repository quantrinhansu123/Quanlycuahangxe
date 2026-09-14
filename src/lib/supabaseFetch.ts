/** Observe network time through response headers; readRequest measures the full read.
 * No request bodies, query strings, credentials, customer IDs or error messages.
 */
export async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const started = performance.now();
  let response: Response | undefined;
  let aborted = false;
  try {
    response = await fetch(input, init);
    return response;
  } catch (error) {
    aborted = error instanceof Error && error.name === 'AbortError';
    throw error;
  } finally {
    const durationMs = Math.round(performance.now() - started);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (durationMs >= 1000 && !aborted && !signal?.aborted) {
      // Diagnostics must not turn a successful request into an application error.
      try {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const endpoint = url.pathname.match(/^\/(?:rest\/v1\/(?:rpc\/)?|functions\/v1\/)[a-zA-Z0-9_-]+(?=\/|$)/)?.[0] ?? 'supabase_other';
        console.warn('[supabase-slow-request]', {
          endpoint, durationMs, status: response?.status ?? null,
          requestId: response?.headers.get('sb-request-id') ?? null,
          at: new Date().toISOString(), phase: 'headers',
        });
      } catch { /* Logging is best-effort. */ }
    }
  }
}
