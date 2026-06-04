import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errorHandler';

describe('getErrorMessage', () => {
  it('extracts a string detail and status from an axios error', () => {
    const err = { response: { status: 400, data: { detail: 'Bad thing happened' } } };
    const out = getErrorMessage(err);
    expect(out.message).toBe('Bad thing happened');
    expect(out.status).toBe(400);
  });

  it('humanises a FastAPI 422 validation array', () => {
    const err = {
      response: {
        status: 422,
        data: { detail: [{ loc: ['body', 'email'], msg: 'field required' }] },
      },
    };
    expect(getErrorMessage(err).message).toBe('email is required');
  });

  it('unwraps a nested { detail: { message } } object', () => {
    const err = { response: { status: 403, data: { detail: { message: 'Forbidden' } } } };
    expect(getErrorMessage(err).message).toBe('Forbidden');
  });

  it('falls back to the Error message for a plain Error', () => {
    expect(getErrorMessage(new Error('boom')).message).toBe('boom');
  });

  it('returns a generic message for an unknown value', () => {
    expect(getErrorMessage(null).message).toMatch(/unexpected error/i);
    expect(getErrorMessage(undefined).message).toMatch(/unexpected error/i);
  });
});
