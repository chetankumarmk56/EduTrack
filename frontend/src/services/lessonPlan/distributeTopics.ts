import type { SessionAssignment } from './types';

/**
 * Assigns topics to session dates while preserving topic order.
 *
 * - topics.length === sessions: 1 topic per session
 * - topics.length  <  sessions: spread; gaps become "Practice / Review"
 *   sessions placed at evenly-spaced positions
 * - topics.length  >  sessions: group consecutive topics per session
 *   using ceil(topics / sessions); the final session absorbs the remainder
 */
export function distributeTopics(
  topics: string[],
  sessionDates: string[]
): SessionAssignment[] {
  const sessions = sessionDates.length;
  if (sessions === 0) return [];

  if (topics.length === 0) {
    return sessionDates.map((date) => ({ date, topics: ['Practice / Review'] }));
  }

  if (topics.length === sessions) {
    return sessionDates.map((date, i) => ({ date, topics: [topics[i]] }));
  }

  if (topics.length < sessions) {
    const slotsForTopics = new Set<number>();
    for (let i = 0; i < topics.length; i++) {
      const pos = Math.round((i * (sessions - 1)) / Math.max(1, topics.length - 1));
      let target = pos;
      while (slotsForTopics.has(target) && target < sessions - 1) target++;
      slotsForTopics.add(target);
    }
    const ordered = Array.from(slotsForTopics).sort((a, b) => a - b);
    const slotToTopic = new Map<number, string>();
    ordered.forEach((slot, idx) => slotToTopic.set(slot, topics[idx]));

    return sessionDates.map((date, i) => ({
      date,
      topics: [slotToTopic.get(i) ?? 'Practice / Review'],
    }));
  }

  const chunkSize = Math.ceil(topics.length / sessions);
  const out: SessionAssignment[] = [];
  let cursor = 0;
  for (let i = 0; i < sessions; i++) {
    const remainingSessions = sessions - i;
    const remainingTopics = topics.length - cursor;
    const isLast = i === sessions - 1;
    const take = isLast
      ? remainingTopics
      : Math.min(chunkSize, remainingTopics - (remainingSessions - 1));
    const slice = topics.slice(cursor, cursor + Math.max(1, take));
    cursor += slice.length;
    out.push({ date: sessionDates[i], topics: slice });
  }
  return out;
}
