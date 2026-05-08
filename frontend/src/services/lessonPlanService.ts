import { extractTopics } from './lessonPlan/extractTopics';
import { calculateSchedule } from './lessonPlan/calculateSchedule';
import { distributeTopics } from './lessonPlan/distributeTopics';
import { buildLessonDays } from './lessonPlan/buildLessonDays';
import type { LessonPlanInput, LessonPlanResult } from './lessonPlan/types';

const DENSITY_THRESHOLD = 3;

export async function generatePlan(input: LessonPlanInput): Promise<LessonPlanResult> {
  const { file, startDate, endDate, classesPerWeek, hoursPerClass } = input;

  if (!file) throw new Error('Please upload a syllabus file.');
  if (!startDate || !endDate) throw new Error('Please provide both start and end dates.');
  if (!Number.isFinite(classesPerWeek) || classesPerWeek < 1 || classesPerWeek > 7) {
    throw new Error('Classes per week must be between 1 and 7.');
  }
  if (!Number.isFinite(hoursPerClass) || hoursPerClass <= 0) {
    throw new Error('Hours per class must be greater than 0.');
  }

  const schedule = calculateSchedule(startDate, endDate, classesPerWeek, hoursPerClass);
  if (schedule.totalSessions === 0) {
    throw new Error('Selected timeframe is too short for the chosen cadence. Extend the date range or increase classes per week.');
  }

  const extracted = await extractTopics(file);
  const assignments = distributeTopics(extracted.topics, schedule.sessionDates);
  const lessonPlan = buildLessonDays(assignments, hoursPerClass);

  const ratio = extracted.topics.length / schedule.totalSessions;
  const overloaded = ratio > DENSITY_THRESHOLD;

  let warning = '';
  if (extracted.warning) warning = extracted.warning;
  if (overloaded) {
    const overloadMsg = `Syllabus contains ${extracted.topics.length} topics across only ${schedule.totalSessions} sessions. Consider extending the timeframe or increasing classes per week.`;
    warning = warning ? `${warning} ${overloadMsg}` : overloadMsg;
  }

  return {
    lesson_plan: lessonPlan,
    reconsideration_required: overloaded,
    warning_message: warning,
    suggested_ppt_slides: [],
    document_name: file.name,
  };
}

export const lessonPlanService = { generatePlan };
