/**
 * Pending lesson-plan generation tracking.
 *
 * Lesson Plan generation runs synchronously on the backend and can take a
 * couple of minutes — long enough to blow past proxy read timeouts. Rather
 * than make the teacher sit on a spinner (and risk a 504/524 on the
 * response), the form fires generation and navigates straight to the
 * calendar. The finished plan ALWAYS lands in S3 regardless of whether the
 * original request's response made it back, so the calendar just polls for
 * the output and renders it when ready.
 *
 * This module is the small bit of shared state that lets the form hand a
 * "generation in flight" marker to the calendar. It lives in localStorage
 * so it survives the client-side navigation between the two pages and even
 * a hard refresh.
 */
import type { ChapterIdentity } from './types';

const KEY = 'edu_lp_pending_generations';

// Stop waiting after this long. A generation that hasn't produced S3 output
// by now has almost certainly failed server-side (bad upload, AI error); we
// drop the marker so the calendar doesn't poll forever.
export const PENDING_MAX_AGE_MS = 6 * 60 * 1000; // 6 minutes

export interface PendingGeneration extends ChapterIdentity {
  chapter_name?: string;
  started_at: number; // epoch ms
}

/** Canonical scope key — the 5 IDs that uniquely identify a chapter. */
export const scopeKey = (idn: ChapterIdentity): string =>
  [idn.school_id, idn.teacher_id, idn.grade_id, idn.subject_id, idn.chapter_id].join('/');

/** True when `meta` (a chapter listing's metadata) refers to the same chapter. */
export const sameScope = (a: ChapterIdentity, b: ChapterIdentity): boolean =>
  scopeKey(a) === scopeKey(b);

function writeAll(list: PendingGeneration[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / private-mode — non-fatal, the await path still works */
  }
}

/** Current pending generations, with expired entries pruned. */
export function listPending(): PendingGeneration[] {
  let arr: PendingGeneration[];
  try {
    const raw = localStorage.getItem(KEY);
    arr = raw ? (JSON.parse(raw) as PendingGeneration[]) : [];
  } catch {
    return [];
  }
  const now = Date.now();
  const fresh = arr.filter(
    (p) => p && typeof p.started_at === 'number' && now - p.started_at < PENDING_MAX_AGE_MS,
  );
  if (fresh.length !== arr.length) writeAll(fresh);
  return fresh;
}

/** Mark a chapter as generating. Replaces any existing marker for it. */
export function addPending(idn: ChapterIdentity, chapterName?: string): void {
  const list = listPending().filter((p) => !sameScope(p, idn));
  list.push({
    school_id: idn.school_id,
    teacher_id: idn.teacher_id,
    grade_id: idn.grade_id,
    subject_id: idn.subject_id,
    chapter_id: idn.chapter_id,
    chapter_name: chapterName,
    started_at: Date.now(),
  });
  writeAll(list);
}

/** Clear a chapter's generating marker (output landed, or it failed fast). */
export function removePending(idn: ChapterIdentity): void {
  writeAll(listPending().filter((p) => !sameScope(p, idn)));
}
