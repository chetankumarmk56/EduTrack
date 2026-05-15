import { extractTopics, extractTopicsFromText } from './extractTopics';
import { calculateSchedule } from './calculateSchedule';
import { distributeTopics } from './distributeTopics';
import { buildLessonDays } from './buildLessonDays';
import type {
  ExtractedTopics,
  LessonPlanInput,
  LessonPlanResult,
} from '../types';

const DENSITY_THRESHOLD = 3;

export interface LessonPlanFromTextInput {
  text: string;
  filename: string;
  startDate: string;
  endDate: string;
  classesPerWeek: number;
  hoursPerClass: number;
}

function buildResult(
  extracted: ExtractedTopics,
  sourceName: string,
  schedule: ReturnType<typeof calculateSchedule>,
  hoursPerClass: number,
): LessonPlanResult {
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
    document_name: sourceName,
  };
}

function validateScheduleArgs(
  startDate: string,
  endDate: string,
  classesPerWeek: number,
  hoursPerClass: number,
) {
  if (!startDate || !endDate) throw new Error('Please provide both start and end dates.');
  if (!Number.isFinite(classesPerWeek) || classesPerWeek < 1 || classesPerWeek > 7) {
    throw new Error('Classes per week must be between 1 and 7.');
  }
  if (!Number.isFinite(hoursPerClass) || hoursPerClass <= 0) {
    throw new Error('Hours per class must be greater than 0.');
  }
}

export async function generatePlan(input: LessonPlanInput): Promise<LessonPlanResult> {
  const { file, startDate, endDate, classesPerWeek, hoursPerClass } = input;
  if (!file) throw new Error('Please upload a syllabus file.');
  validateScheduleArgs(startDate, endDate, classesPerWeek, hoursPerClass);

  const schedule = calculateSchedule(startDate, endDate, classesPerWeek, hoursPerClass);
  if (schedule.totalSessions === 0) {
    throw new Error('Selected timeframe is too short for the chosen cadence. Extend the date range or increase classes per week.');
  }

  const extracted = await extractTopics(file);
  return buildResult(extracted, file.name, schedule, hoursPerClass);
}

export async function generatePlanFromText(
  input: LessonPlanFromTextInput,
): Promise<LessonPlanResult> {
  const { text, filename, startDate, endDate, classesPerWeek, hoursPerClass } = input;
  if (!text || !text.trim()) {
    throw new Error('Selected file has no extractable text.');
  }
  validateScheduleArgs(startDate, endDate, classesPerWeek, hoursPerClass);

  const schedule = calculateSchedule(startDate, endDate, classesPerWeek, hoursPerClass);
  if (schedule.totalSessions === 0) {
    throw new Error('Selected timeframe is too short for the chosen cadence. Extend the date range or increase classes per week.');
  }

  const extracted = extractTopicsFromText(text, filename);
  return buildResult(extracted, filename, schedule, hoursPerClass);
}

export const lessonPlanService = { generatePlan, generatePlanFromText };
