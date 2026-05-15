import { questionBankApi } from '@/features/question-bank/api';
import type { ExtractedTopics } from '../types';

const MIN_USEFUL_TEXT_LENGTH = 200;
const SCANNED_WARNING =
  'This document appears to be scanned or image-based. Lesson plan is generated using approximate structure.';
const PARSE_FAILED_WARNING =
  'Could not extract structured headings from this file. Lesson plan is generated using approximate structure.';

const HEADING_PATTERNS: RegExp[] = [
  /^\s*(?:chapter|unit|module|lesson|section|part)\s+[\divxlcm]+[:.\-\s]*(.+)$/i,
  /^\s*[\divxlcm]+\.\s+(.{3,})$/i,
  /^\s*\d+\.\d+\s+(.{3,})$/,
];

function deriveStemFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '');
  const cleaned = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Syllabus';
}

function simulateFromName(name: string, warning?: string): ExtractedTopics {
  const stem = deriveStemFromFilename(name);
  const topics = [
    `${stem} — Foundations & Overview`,
    `${stem} — Core Concepts I`,
    `${stem} — Core Concepts II`,
    `${stem} — Applied Examples`,
    `${stem} — Problem Solving`,
    `${stem} — Advanced Topics`,
    `${stem} — Case Studies`,
    `${stem} — Review & Synthesis`,
    `${stem} — Practice Set`,
    `${stem} — Assessment Prep`,
  ];
  return { topics, isSimulated: true, warning };
}

function simulate(file: File, warning?: string): ExtractedTopics {
  const stem = deriveStemFromFilename(file.name);
  const topics = [
    `${stem} — Foundations & Overview`,
    `${stem} — Core Concepts I`,
    `${stem} — Core Concepts II`,
    `${stem} — Applied Examples`,
    `${stem} — Problem Solving`,
    `${stem} — Advanced Topics`,
    `${stem} — Case Studies`,
    `${stem} — Review & Synthesis`,
    `${stem} — Practice Set`,
    `${stem} — Assessment Prep`,
  ];
  return { topics, isSimulated: true, warning };
}

function parseHeadings(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const line of lines) {
    if (line.length > 160) continue;
    for (const re of HEADING_PATTERNS) {
      const m = line.match(re);
      if (m && m[1]) {
        const title = m[1].trim().replace(/[.\s]+$/, '');
        if (title.length >= 3) out.push(title);
        break;
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

function topicsFromText(text: string): string[] | null {
  if (!text || text.trim().length < MIN_USEFUL_TEXT_LENGTH) return null;
  const topics = parseHeadings(text);
  return topics.length >= 3 ? topics : null;
}

/**
 * Extracts topics from a syllabus file.
 * - Text files (.txt, .md) are read locally via FileReader.
 * - Binary files (.pdf, .docx) are sent to the backend parser
 *   (POST /api/question-bank/parse-file) which returns plain text.
 * - Either way, heading patterns are matched on the resulting text.
 * - Falls back to the deterministic simulator when extraction yields too
 *   few headings.
 */
export async function extractTopics(file: File): Promise<ExtractedTopics> {
  const lowerName = file.name.toLowerCase();
  const isLikelyText =
    file.type.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md');

  if (isLikelyText) {
    try {
      const text = await readAsText(file);
      const topics = topicsFromText(text);
      if (topics) return { topics, isSimulated: false };
      return simulate(file, SCANNED_WARNING);
    } catch {
      return simulate(file, SCANNED_WARNING);
    }
  }

  // Binary path: defer to the backend parser (pdf/docx).
  try {
    const { content } = await questionBankApi.parseFile(file);
    const topics = topicsFromText(content);
    if (topics) return { topics, isSimulated: false };
    return simulate(file, PARSE_FAILED_WARNING);
  } catch {
    return simulate(file, SCANNED_WARNING);
  }
}

/**
 * Extract topics from already-extracted plain text (e.g. text fetched from a
 * file in the teacher's reusable library). Bypasses the upload/parse step
 * entirely.
 */
export function extractTopicsFromText(
  text: string,
  displayFilename: string,
): ExtractedTopics {
  const topics = topicsFromText(text);
  if (topics) return { topics, isSimulated: false };
  return simulateFromName(displayFilename, PARSE_FAILED_WARNING);
}
