import type { ExtractedTopics } from './types';

const MIN_USEFUL_TEXT_LENGTH = 200;
const SCANNED_WARNING =
  'This document appears to be scanned or image-based. Lesson plan is generated using approximate structure.';

const HEADING_PATTERNS: RegExp[] = [
  /^\s*(?:chapter|unit|module|lesson|section|part)\s+[\divxlcm]+[:.\-\s]*(.+)$/i,
  /^\s*[\divxlcm]+\.\s+(.{3,})$/i,
  /^\s*\d+\.\d+\s+(.{3,})$/,
];

function deriveStemFromFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '');
  const cleaned = stem.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Syllabus';
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

/**
 * Extracts topics from a syllabus file.
 * Text files (.txt, .md) parse heading patterns. PDFs and other binaries
 * fall through to the deterministic simulator (no OCR, no image processing).
 */
export async function extractTopics(file: File): Promise<ExtractedTopics> {
  const lowerName = file.name.toLowerCase();
  const isLikelyText =
    file.type.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md');

  if (!isLikelyText) {
    return simulate(file, SCANNED_WARNING);
  }

  try {
    const text = await readAsText(file);
    if (!text || text.trim().length < MIN_USEFUL_TEXT_LENGTH) {
      return simulate(file, SCANNED_WARNING);
    }
    const topics = parseHeadings(text);
    if (topics.length < 3) {
      return simulate(file, SCANNED_WARNING);
    }
    return { topics, isSimulated: false };
  } catch {
    return simulate(file, SCANNED_WARNING);
  }
}
