/**
 * API Error Handler — extracts a user-presentable message out of any
 * axios / fetch / runtime error. Accepts `unknown` so callers can pass
 * a freshly-caught error without first asserting its shape.
 */

// Not imported outside this file — kept unexported for internal use as return type.
interface APIError {
  message: string;
  details?: string[];
  status?: number;
}

// FastAPI's validation-error item shape (the entries in error.response.data.detail
// when the response is a 422 with a list of field errors).
interface ValidationErrorItem {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

interface AxiosLikeErrorShape {
  response?: {
    status?: number;
    data?: {
      detail?: string | ValidationErrorItem[] | { message?: string };
      errors?: string[];
    };
  };
  message?: string;
}

export function getErrorMessage(error: unknown): APIError {
  const e = error as AxiosLikeErrorShape;

  // Handle axios error response
  if (e?.response) {
    const status = e.response.status;
    const data = e.response.data;

    // Try to extract detail from various response formats
    let message: string | ValidationErrorItem[] | { message?: string } =
      data?.detail ?? e.message ?? 'Operation failed';

    // Handle validation errors (array format)
    if (Array.isArray(message)) {
      message = message
        .map((item: ValidationErrorItem) => {
          const fieldName = item.loc
            ? String(item.loc[item.loc.length - 1])
            : 'Field';
          const msg = item.msg || JSON.stringify(item);
          // Clean up common FastAPI messages
          if (msg === 'field required') return `${fieldName} is required`;
          if (msg.includes('value is not a valid')) return `Invalid ${fieldName}`;
          return `${fieldName}: ${msg}`;
        })
        .join(' • ');
    }

    // Handle nested detail object
    if (typeof message === 'object' && message !== null && 'message' in message) {
      message = (message as { message?: string }).message || 'Operation failed';
    }

    return {
      message: typeof message === 'string' ? message : 'Operation failed',
      details:
        data?.errors ||
        (Array.isArray(data?.detail)
          ? (data.detail as ValidationErrorItem[]).map((item) =>
              typeof item === 'string' ? item : item?.msg ?? ''
            )
          : undefined),
      status,
    };
  }

  // Handle generic Error instance
  if (error instanceof Error) {
    return {
      message: error.message || 'An unexpected error occurred',
    };
  }

  return {
    message: 'An unexpected error occurred. Please try again.',
  };
}
