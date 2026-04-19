/**
 * Utility for standardized date transformations between UI (DD/MM/YYYY) 
 * and Backend/Database (YYYY-MM-DD).
 */

export const dateUtils = {
  /**
   * Converts DD/MM/YYYY string to YYYY-MM-DD for backend compatibility.
   * Handles both text input and potential slash variants.
   */
  toBackendDate: (ddMMyyyy: string): string => {
    if (!ddMMyyyy) return '';
    
    // Normalize delimiters if needed (e.g., allow spaces or dashes if user types them)
    const normalized = ddMMyyyy.replace(/[\s-]/g, '/');
    const parts = normalized.split('/');
    
    if (parts.length === 3) {
      const [d, m, y] = parts;
      // Ensure zero-padding for single digits
      const day = d.padStart(2, '0');
      const month = m.padStart(2, '0');
      const year = y.length === 2 ? `20${y}` : y; // basic 2-digit year support if needed
      
      return `${year}-${month}-${day}`;
    }
    
    // Fallback if format is invalid (though UI should validate)
    return ddMMyyyy;
  },

  /**
   * Converts YYYY-MM-DD (or any ISO string) to DD/MM/YYYY for UI display.
   */
  toUIDate: (isoString: string): string => {
    if (!isoString) return '';
    
    // Handle full ISO strings (2024-01-01T00:00:00Z) or just date (2024-01-01)
    const datePart = isoString.split('T')[0];
    const parts = datePart.split('-');
    
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    
    return isoString;
  },

  /**
   * Validates if matching DD/MM/YYYY pattern
   */
  isValidUIDate: (dateStr: string): boolean => {
    const regex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (!regex.test(dateStr)) return false;
    
    const [d, m, y] = dateStr.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }
};
