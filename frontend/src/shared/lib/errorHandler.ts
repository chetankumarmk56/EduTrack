/**
 * API Error Handler - Extracts meaningful error messages from API responses
 */

export interface APIError {
  message: string;
  details?: string[];
  status?: number;
}

export function getErrorMessage(error: any): APIError {
  // Handle axios error response
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    // Try to extract detail from various response formats
    let message = data?.detail || error.message || "Operation failed";

    // Handle validation errors (array format)
    if (Array.isArray(message)) {
      message = message.map((e: any) => {
        const fieldName = e.loc ? String(e.loc[e.loc.length - 1]) : 'Field';
        const msg = e.msg || JSON.stringify(e);
        // Clean up common FastAPI messages
        if (msg === "field required") return `${fieldName} is required`;
        if (msg.includes("value is not a valid")) return `Invalid ${fieldName}`;
        return `${fieldName}: ${msg}`;
      }).join(" • ");
    }

    // Handle nested detail object
    if (typeof message === "object" && message.message) {
      message = message.message;
    }

    return {
      message,
      details:
        data?.errors ||
        (Array.isArray(data?.detail)
          ? data.detail.map((e: any) => (typeof e === "string" ? e : e?.msg))
          : undefined),
      status,
    };
  }

  // Handle generic error
  if (error instanceof Error) {
    return {
      message: error.message || "An unexpected error occurred",
    };
  }

  return {
    message: "An unexpected error occurred. Please try again.",
  };
}

export function isNetworkError(error: any): boolean {
  return (
    error.code === "ERR_NETWORK" ||
    error.message === "Network Error" ||
    !error.response
  );
}

export function isAuthError(error: any): boolean {
  return error.response?.status === 401 || error.response?.status === 403;
}

export function isValidationError(error: any): boolean {
  return error.response?.status === 422 || error.response?.status === 400;
}
