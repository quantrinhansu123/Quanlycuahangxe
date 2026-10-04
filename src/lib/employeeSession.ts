export interface SessionEmployee {
  id: string;
  id_nhan_su: string | null;
  ho_ten: string;
  vi_tri: string;
  co_so: string;
  email: string | null;
  sdt: string | null;
  auth_user_id: string | null;
}

export type EmployeeSessionResult =
  | { status: 'found'; employee: SessionEmployee }
  | { status: 'missing' }
  | { status: 'invalid_session' }
  | { status: 'error'; code?: string; httpStatus?: number };

interface ReadResult<T> {
  data: T | null;
  error: unknown;
  status?: number;
}

function readFailure(error: unknown, httpStatus?: number): EmployeeSessionResult {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined;
  // A table permission error (403/42501) does not establish that the token expired.
  if (httpStatus === 401 || (httpStatus !== undefined && httpStatus < 500 &&
    ['PGRST301', 'PGRST302', 'PGRST303'].includes(code ?? ''))) {
    return { status: 'invalid_session' };
  }
  return { status: 'error', code, httpStatus };
}

/** One validation attempt. Focus/the existing interval can retry a transient read.
 * No tokens, employee payloads or raw server messages are logged here.
 */
export async function readEmployeeSession(
  id: string,
  hasSessionToken: boolean,
  probeSession: () => PromiseLike<ReadResult<unknown>>,
  lookupEmployee: () => PromiseLike<ReadResult<SessionEmployee>>,
): Promise<EmployeeSessionResult> {
  try {
    const probe = await probeSession();
    if (probe.error) {
      const code = typeof probe.error === 'object' && 'code' in probe.error
        ? probe.error.code : undefined;
      // Preserve the pre-session-migration compatibility path only when this
      // particular RPC is confirmed absent, not when its read fails temporarily.
      if (code !== 'PGRST202' || probe.status !== 404) return readFailure(probe.error, probe.status);
    } else if (!hasSessionToken || probe.data !== id) {
      // The RPC checks expiry/revocation on the server, even if nhan_su is readable.
      return { status: 'invalid_session' };
    }

    const lookup = await lookupEmployee();
    if (lookup.error) return readFailure(lookup.error, lookup.status);
    if (!lookup.data) return { status: 'missing' };
    return { status: 'found', employee: lookup.data };
  } catch {
    // Network failures/aborts/timeouts are not successful "missing" lookups.
    return { status: 'error' };
  }
}
