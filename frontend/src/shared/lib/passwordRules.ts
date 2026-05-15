export const PASSWORD_MIN_LENGTH = 8;

/**
 * Mirrors the backend rules in app/schemas/auth.py::ChangePasswordRequest.
 * Keep the two in sync — the backend remains authoritative.
 */
export function validateNewPassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(pw)) return 'New password must include at least one letter.';
  if (!/[0-9]/.test(pw)) return 'New password must include at least one number.';
  return null;
}
