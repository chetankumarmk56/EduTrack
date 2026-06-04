// Vitest global setup. Adds jest-dom matchers (toBeInTheDocument, etc.) and
// stubs browser APIs that jsdom doesn't implement but our components touch.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so DOM/state never leaks across cases.
afterEach(() => {
  cleanup();
});

// matchMedia is used by some UI libs / theme code; jsdom omits it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
