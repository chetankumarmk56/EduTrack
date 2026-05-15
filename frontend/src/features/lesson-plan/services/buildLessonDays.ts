import type { LessonDay, SessionAssignment } from '../types';

function deriveSubtopics(topics: string[]): string[] {
  if (topics.length > 1) return topics;
  const head = topics[0];
  if (!head || head === 'Practice / Review') {
    return ['Recap of prior session', 'Guided practice problems', 'Doubt resolution'];
  }
  return [`${head} — introduction`, `${head} — worked examples`, `${head} — key takeaways`];
}

function deriveObjectives(topics: string[]): string[] {
  const primary = topics[0] ?? 'the session topic';
  return [
    `Understand ${primary}`,
    `Apply ${primary} to representative problems`,
    `Review and consolidate ${primary}`,
  ];
}

export function buildLessonDays(
  assignments: SessionAssignment[],
  hoursPerClass: number
): LessonDay[] {
  return assignments.map(({ date, topics }) => {
    const headline = topics.length > 1 ? topics[0] + ' & more' : topics[0];
    return {
      date,
      topic: headline,
      subtopics: deriveSubtopics(topics),
      objectives: deriveObjectives(topics),
      duration_hours: hoursPerClass,
    };
  });
}
