/**
 * Password validation utility matching backend requirements
 * Requirements: Min 10 chars, uppercase, lowercase, digit, special char
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("At least 10 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("At least one uppercase letter (A-Z)");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("At least one lowercase letter (a-z)");
  }

  if (!/\d/.test(password)) {
    errors.push("At least one digit (0-9)");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};:'"",.<>?/]/.test(password)) {
    errors.push("At least one special character (!@#$%^&*)");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getPasswordStrength(password: string): {
  level: "weak" | "fair" | "good" | "strong";
  percentage: number;
} {
  let score = 0;

  // Length scoring
  if (password.length >= 10) score += 20;
  if (password.length >= 15) score += 10;
  if (password.length >= 20) score += 10;

  // Character variety
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/\d/.test(password)) score += 15;
  if (/[!@#$%^&*()_+\-=\[\]{};:'"",.<>?/]/.test(password)) score += 15;

  // Determine level
  let level: "weak" | "fair" | "good" | "strong";
  if (score < 40) level = "weak";
  else if (score < 60) level = "fair";
  else if (score < 80) level = "good";
  else level = "strong";

  return { level, percentage: Math.min(score, 100) };
}
