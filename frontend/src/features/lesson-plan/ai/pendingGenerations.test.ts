import { describe, it, expect, beforeEach } from 'vitest';
import {
  addPending,
  removePending,
  listPending,
  scopeKey,
  sameScope,
  PENDING_MAX_AGE_MS,
} from './pendingGenerations';
import type { ChapterIdentity } from './types';

const ident = (chapter_id: string): ChapterIdentity => ({
  school_id: '1',
  teacher_id: '5',
  grade_id: '3',
  subject_id: '7',
  chapter_id,
});

const KEY = 'edu_lp_pending_generations';

describe('pendingGenerations', () => {
  beforeEach(() => localStorage.clear());

  it('scopeKey/sameScope compare the 5 identity ids', () => {
    expect(scopeKey(ident('c1'))).toBe('1/5/3/7/c1');
    expect(sameScope(ident('c1'), ident('c1'))).toBe(true);
    expect(sameScope(ident('c1'), ident('c2'))).toBe(false);
  });

  it('addPending makes a chapter appear in listPending; removePending clears it', () => {
    addPending(ident('c1'), 'Photosynthesis');
    const list = listPending();
    expect(list).toHaveLength(1);
    expect(list[0].chapter_name).toBe('Photosynthesis');
    expect(sameScope(list[0], ident('c1'))).toBe(true);

    removePending(ident('c1'));
    expect(listPending()).toHaveLength(0);
  });

  it('addPending dedupes by scope (re-adding the same chapter replaces it)', () => {
    addPending(ident('c1'), 'First');
    addPending(ident('c1'), 'Second');
    const list = listPending();
    expect(list).toHaveLength(1);
    expect(list[0].chapter_name).toBe('Second');
  });

  it('tracks multiple distinct chapters independently', () => {
    addPending(ident('c1'));
    addPending(ident('c2'));
    expect(listPending()).toHaveLength(2);
    removePending(ident('c1'));
    const left = listPending();
    expect(left).toHaveLength(1);
    expect(left[0].chapter_id).toBe('c2');
  });

  it('prunes markers older than the max-age ceiling', () => {
    // Seed a marker with a stale started_at directly in storage.
    const stale = {
      ...ident('old'),
      chapter_name: 'Old',
      started_at: Date.now() - (PENDING_MAX_AGE_MS + 1000),
    };
    localStorage.setItem(KEY, JSON.stringify([stale]));
    expect(listPending()).toHaveLength(0);
  });

  it('survives a corrupt localStorage value without throwing', () => {
    localStorage.setItem(KEY, '{not valid json');
    expect(() => listPending()).not.toThrow();
    expect(listPending()).toEqual([]);
  });
});
