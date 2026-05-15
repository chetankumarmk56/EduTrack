/**
 * Pulls a user-presentable message out of an axios/fetch error.
 * Handles FastAPI's three common detail shapes:
 *  - string ("Current password is incorrect.")
 *  - validation array ([{ msg: "Value error, ..." }])
 *  - missing → falls back to .message or a generic string
 */
export function extractApiError(err: unknown, fallback = 'Something went wrong.'): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg.replace(/^Value error,\s*/, '');
  }
  return e?.message || fallback;
}
