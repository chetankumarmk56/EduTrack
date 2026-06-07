/**
 * Lesson Plan — Dashboard / Calendar landing page.
 *
 * Shows every chapter the current teacher has saved on a single calendar,
 * one color per chapter. Teachers click a date to inspect the day's classes
 * in the side panel, or switch to Single Day mode for an immersive class
 * detail view. The "Add Lesson" CTA in the top-right opens the chapter
 * generator form, where previously-saved chapters stay loaded so users can
 * add more chapters to the same plan.
 *
 * Data flow: GET /api/lesson-plan/chapters → { chapters: [...] }
 * Each chapter carries its own metadata (incl. start/end dates, pre-computed
 * session_dates from the timetable) and, when generation has happened, the
 * generated GeneratedLessonPlan payload.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Info,
  Lightbulb,
  Loader2,
  MapPin,
  MoreVertical,
  Palmtree,
  Plus,
  RefreshCw,
  ScrollText,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  Wand2,
  X,
} from 'lucide-react';

import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { lessonPlanAIApi } from '@/features/lesson-plan/ai/api';
import {
  listPending,
  removePending,
  sameScope,
  type PendingGeneration,
} from '@/features/lesson-plan/ai/pendingGenerations';
import type {
  ChapterIdentity,
  ChapterListItem,
  LessonPlanScheduleItem,
} from '@/features/lesson-plan/ai/types';
import type { Event as SchoolEvent } from '@/shared/types';

// ─── Helpers ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;
const SOFT_SPRING = { type: 'spring', stiffness: 220, damping: 28 } as const;

interface ChapterColor {
  /** Tailwind gradient for chips and headers (eg "from-indigo-600 to-blue-600"). */
  gradient: string;
  /** Solid bg for compact chips (eg "bg-indigo-600"). */
  solid: string;
  /** Text color matching the palette (eg "text-indigo-600"). */
  text: string;
  /** Light tinted bg for soft surfaces (eg "bg-indigo-50"). */
  tint: string;
  /** Soft border in the same family (eg "border-indigo-200"). */
  border: string;
  /** Small dot indicator (eg "bg-indigo-500"). */
  dot: string;
  /** Hex value for shadows / svg fills. */
  hex: string;
  label: string;
}

const CHAPTER_PALETTE: ChapterColor[] = [
  { gradient: 'from-indigo-600 to-blue-600', solid: 'bg-indigo-600', text: 'text-indigo-600', tint: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500', hex: '#4f46e5', label: 'Indigo' },
  { gradient: 'from-emerald-600 to-teal-600', solid: 'bg-emerald-600', text: 'text-emerald-700', tint: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', hex: '#059669', label: 'Emerald' },
  { gradient: 'from-rose-600 to-pink-600', solid: 'bg-rose-600', text: 'text-rose-600', tint: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500', hex: '#e11d48', label: 'Rose' },
  { gradient: 'from-amber-600 to-orange-600', solid: 'bg-amber-600', text: 'text-amber-700', tint: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', hex: '#d97706', label: 'Amber' },
  { gradient: 'from-sky-600 to-cyan-600', solid: 'bg-sky-600', text: 'text-sky-600', tint: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500', hex: '#0284c7', label: 'Sky' },
  { gradient: 'from-fuchsia-600 to-purple-600', solid: 'bg-fuchsia-600', text: 'text-fuchsia-600', tint: 'bg-fuchsia-50', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500', hex: '#c026d3', label: 'Fuchsia' },
  { gradient: 'from-lime-600 to-green-600', solid: 'bg-lime-600', text: 'text-lime-700', tint: 'bg-lime-50', border: 'border-lime-200', dot: 'bg-lime-500', hex: '#65a30d', label: 'Lime' },
  { gradient: 'from-slate-700 to-zinc-700', solid: 'bg-slate-700', text: 'text-slate-700', tint: 'bg-slate-100', border: 'border-slate-200', dot: 'bg-slate-600', hex: '#334155', label: 'Slate' },
];

function pickColor(idx: number): ChapterColor {
  return CHAPTER_PALETTE[((idx % CHAPTER_PALETTE.length) + CHAPTER_PALETTE.length) % CHAPTER_PALETTE.length];
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function nextWeekday(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

function calendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let dow = first.getDay();
  if (dow === 0) dow = 7;
  const cells: (Date | null)[] = Array(dow - 1).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Event helpers ──────────────────────────────────────────────────────────

interface EventStyle {
  /** Tailwind solid background eg "bg-emerald-500". */
  solid: string;
  /** Soft tint background eg "bg-emerald-50". */
  tint: string;
  /** Border color eg "border-emerald-200". */
  border: string;
  /** Text color eg "text-emerald-700". */
  text: string;
  /** Icon to render with the chip. */
  icon: React.ReactNode;
  /** Short label for badge eg "Holiday". */
  label: string;
}

function styleForEvent(event: SchoolEvent): EventStyle {
  if (event.is_holiday) {
    return {
      solid: 'bg-emerald-500',
      tint: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: <Palmtree className="w-3.5 h-3.5" />,
      label: 'Non-teaching',
    };
  }
  const type = (event.type || '').toLowerCase();
  if (type.includes('meeting')) {
    return {
      solid: 'bg-blue-500',
      tint: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: <UserCheck className="w-3.5 h-3.5" />,
      label: event.type,
    };
  }
  if (type.includes('exam')) {
    return {
      solid: 'bg-rose-500',
      tint: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-700',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      label: event.type,
    };
  }
  if (type.includes('sport')) {
    return {
      solid: 'bg-amber-500',
      tint: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: <Trophy className="w-3.5 h-3.5" />,
      label: event.type,
    };
  }
  return {
    solid: 'bg-slate-500',
    tint: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    icon: <CalendarDays className="w-3.5 h-3.5" />,
    label: event.type || 'Event',
  };
}

/**
 * Build a map from day-key (YYYY-MM-DD) to the events that fall on that date.
 * Multi-day events (with end_date) are expanded into one entry per day in the
 * inclusive range, so the calendar can mark every covered cell.
 */
function buildEventDateMap(events: SchoolEvent[]): Map<string, SchoolEvent[]> {
  const map = new Map<string, SchoolEvent[]>();
  for (const ev of events) {
    if (!ev.date) continue;
    const start = parseISO(ev.date);
    if (isNaN(start.getTime())) continue;
    const end = ev.end_date ? parseISO(ev.end_date) : start;
    const last = isNaN(end.getTime()) || end < start ? start : end;
    const cursor = new Date(start);
    while (cursor <= last) {
      const k = toKey(cursor);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

interface CalendarSession {
  chapter: ChapterListItem;
  chapterIdx: number;
  color: ChapterColor;
  classItem: LessonPlanScheduleItem;
  date: Date;
  /** Cross-chapter chronological index, useful for prev/next in Single Day. */
  globalIdx: number;
}

/**
 * Build the flat list of (chapter × class × date) tuples across every
 * chapter, sorted by date. We prefer the metadata's persisted session_dates
 * when present; older chapters fall back to a weekday walk from start_date.
 */
function flattenSessions(chapters: ChapterListItem[]): CalendarSession[] {
  const sessions: Omit<CalendarSession, 'globalIdx'>[] = [];
  chapters.forEach((chapter, chapterIdx) => {
    if (!chapter.lesson_plan) return;
    const meta = chapter.metadata;
    const color = pickColor(chapterIdx);
    const schedule = chapter.lesson_plan.schedule ?? [];

    const sessionDates: Date[] = [];
    if (meta.session_dates && meta.session_dates.length > 0) {
      for (const iso of meta.session_dates) {
        const d = parseISO(iso);
        if (!isNaN(d.getTime())) sessionDates.push(d);
      }
    }
    const fallbackStart = meta.start_date ? parseISO(meta.start_date) : new Date();
    let fallback: Date = isNaN(fallbackStart.getTime()) ? new Date() : new Date(fallbackStart);
    while (fallback.getDay() === 0 || fallback.getDay() === 6) {
      fallback.setDate(fallback.getDate() + 1);
    }

    schedule.forEach((classItem, i) => {
      let date: Date;
      if (i < sessionDates.length) {
        date = sessionDates[i];
      } else {
        if (i > 0) fallback = nextWeekday(fallback);
        date = new Date(fallback);
      }
      sessions.push({ chapter, chapterIdx, color, classItem, date });
    });
  });

  sessions.sort((a, b) => a.date.getTime() - b.date.getTime() || a.chapterIdx - b.chapterIdx);
  return sessions.map((s, globalIdx) => ({ ...s, globalIdx }));
}

// ─── Component ──────────────────────────────────────────────────────────────

type PlanMode = 'full' | 'single';

export default function LessonPlanDashboard() {
  const navigate = useNavigate();
  const { teachers, events } = useApp();
  const { user } = useAuth();

  // Use raw database IDs as path segments — matches what the form sends
  // at save time, so the listing scope lines up.
  const me = useMemo(
    () => teachers.find((t) => t.user_id === user?.id) ?? null,
    [teachers, user],
  );
  const schoolIdSegment = user?.institution_id ? String(user.institution_id) : '';
  const teacherIdSegment = me?.id ? String(me.id) : '';

  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null); // key: `${chapterId}-${classNumber}`
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<'regenerate' | 'delete' | null>(null);

  const fetchChapters = useCallback(async () => {
    if (!schoolIdSegment || !teacherIdSegment) return;
    setError(null);
    try {
      const res = await lessonPlanAIApi.listChapters({
        school_id: schoolIdSegment,
        teacher_id: teacherIdSegment,
      });
      setChapters(res.chapters ?? []);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to load chapters.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [schoolIdSegment, teacherIdSegment]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // ── Pending generations (async, non-blocking) ──
  // The form fires generation and navigates here without waiting. Each
  // in-flight chapter is recorded in localStorage; we poll the chapter
  // listing until its output lands in S3, then drop the marker and let the
  // plan render on the calendar. A localStorage ceiling expires markers for
  // generations that never produced output (see pendingGenerations).
  const [pending, setPending] = useState<PendingGeneration[]>(() => listPending());

  // Reconcile: once a pending chapter shows up in the listing WITH output,
  // its plan is ready — clear the marker so polling can wind down.
  useEffect(() => {
    const current = listPending();
    let changed = false;
    for (const p of current) {
      const done = chapters.some((c) => sameScope(c.metadata, p) && c.has_output);
      if (done) {
        removePending(p);
        changed = true;
      }
    }
    const next = changed ? listPending() : current;
    // Only update state when the set actually changed, to avoid re-render loops.
    setPending((prev) =>
      prev.length === next.length && prev.every((p, i) => p === next[i] || sameScope(p, next[i]))
        ? prev
        : next,
    );
  }, [chapters]);

  // Poll the listing while any generation is in flight. Stops automatically
  // once `pending` empties (output landed or markers expired).
  useEffect(() => {
    if (pending.length === 0) return;
    const interval = setInterval(() => {
      fetchChapters();
      setPending(listPending()); // prune expired markers each tick
    }, 8000);
    return () => clearInterval(interval);
  }, [pending.length, fetchChapters]);

  const sessions = useMemo(() => flattenSessions(chapters), [chapters]);

  const dateMap = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const k = toKey(s.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [sessions]);

  const eventDateMap = useMemo(() => buildEventDateMap(events ?? []), [events]);

  // ── State for navigation/view ──
  const [mode, setMode] = useState<PlanMode>('full');
  const initialDate = sessions[0]?.date ?? new Date();
  const [selDate, setSelDate] = useState<Date>(initialDate);
  const [selGlobalIdx, setSelGlobalIdx] = useState<number>(0);
  const [calPos, setCalPos] = useState<{ year: number; month: number }>(() => ({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth(),
  }));

  // When the data loads, jump to first available chapter session if state is stale.
  useEffect(() => {
    if (sessions.length === 0) return;
    if (selGlobalIdx >= sessions.length) {
      const first = sessions[0];
      setSelGlobalIdx(0);
      setSelDate(first.date);
      setCalPos({ year: first.date.getFullYear(), month: first.date.getMonth() });
    }
  }, [sessions, selGlobalIdx]);

  const dayClasses = useMemo(() => dateMap.get(toKey(selDate)) ?? [], [dateMap, selDate]);
  const dayEvents = useMemo(() => eventDateMap.get(toKey(selDate)) ?? [], [eventDateMap, selDate]);

  const selSession = sessions[selGlobalIdx] ?? sessions[0] ?? null;

  function openDetail(s: CalendarSession) {
    setSelGlobalIdx(s.globalIdx);
    setSelDate(s.date);
    setMode('single');
  }

  function prevClass() {
    if (selGlobalIdx > 0) {
      const next = sessions[selGlobalIdx - 1];
      setSelGlobalIdx(next.globalIdx);
      setSelDate(next.date);
    }
  }
  function nextClass() {
    if (selGlobalIdx < sessions.length - 1) {
      const next = sessions[selGlobalIdx + 1];
      setSelGlobalIdx(next.globalIdx);
      setSelDate(next.date);
    }
  }

  function prevMonth() {
    setCalPos((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 }));
  }
  function nextMonth() {
    setCalPos((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 }));
  }

  // ── Actions ──
  const handleRegenerate = async (idx: number) => {
    const chapter = chapters[idx];
    if (!chapter) return;
    setBusyIdx(idx);
    setBusyAction('regenerate');
    setActionMenuFor(null);
    try {
      const identity: ChapterIdentity = {
        school_id: chapter.metadata.school_id,
        teacher_id: chapter.metadata.teacher_id,
        grade_id: chapter.metadata.grade_id,
        subject_id: chapter.metadata.subject_id,
        chapter_id: chapter.metadata.chapter_id,
      };
      const result = await lessonPlanAIApi.generate(identity);
      setChapters((prev) =>
        prev.map((c, i) =>
          i === idx
            ? { ...c, lesson_plan: result.lesson_plan, has_output: true }
            : c,
        ),
      );
      toast.success(`Regenerated "${chapter.metadata.chapter_name || chapter.metadata.chapter_id}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Regeneration failed.';
      toast.error(msg);
    } finally {
      setBusyIdx(null);
      setBusyAction(null);
    }
  };

  const handleDelete = async (idx: number) => {
    const chapter = chapters[idx];
    if (!chapter) return;
    setBusyIdx(idx);
    setBusyAction('delete');
    try {
      const identity: ChapterIdentity = {
        school_id: chapter.metadata.school_id,
        teacher_id: chapter.metadata.teacher_id,
        grade_id: chapter.metadata.grade_id,
        subject_id: chapter.metadata.subject_id,
        chapter_id: chapter.metadata.chapter_id,
      };
      await lessonPlanAIApi.deleteChapter(identity);
      setChapters((prev) => prev.filter((_, i) => i !== idx));
      toast.success(`Deleted "${chapter.metadata.chapter_name || chapter.metadata.chapter_id}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed.';
      toast.error(msg);
    } finally {
      setBusyIdx(null);
      setBusyAction(null);
      setConfirmDeleteIdx(null);
      setActionMenuFor(null);
    }
  };

  // ── Render branches ──
  if (loading) {
    return <DashboardShell><LoadingState /></DashboardShell>;
  }
  if (error) {
    return (
      <DashboardShell>
        <ErrorState message={error} onRetry={() => { setLoading(true); fetchChapters(); }} />
      </DashboardShell>
    );
  }
  if (chapters.length === 0) {
    return (
      <DashboardShell>
        <EmptyState onAdd={() => navigate('/teacher/lesson-plan/new')} />
      </DashboardShell>
    );
  }

  return (
    <div className="lp-canvas relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-violet-50/30" />
        <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-violet-300/30 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[36rem] w-[36rem] rounded-full bg-indigo-300/30 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-200/30 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/60 shadow-[0_1px_0_0_rgba(15,23,42,0.04)]">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-5 h-16 flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 mr-1 sm:mr-2 shrink-0">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-4 h-4 text-white" />
              <div className="absolute inset-0 rounded-xl bg-white/20 mix-blend-overlay" />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-black text-slate-900 text-sm tracking-tight">
                Lesson Plans
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500 mt-0.5">
                {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex-1" />

          <LayoutGroup id="dashboard-mode-toggle">
            <div className="relative flex items-center bg-slate-100/80 backdrop-blur-sm rounded-xl p-1 gap-0.5">
              {(['single', 'full'] as PlanMode[]).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="relative z-10 px-3 sm:px-4 py-1.5 rounded-lg text-[13px] sm:text-sm font-semibold transition-colors"
                  >
                    {active && (
                      <motion.div
                        layoutId="dash-mode-pill"
                        className="absolute inset-0 bg-white rounded-lg shadow-sm shadow-slate-900/5"
                        transition={SPRING}
                      />
                    )}
                    <span className={`relative ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                      {m === 'single'
                        ? (<><span className="sm:hidden">Single</span><span className="hidden sm:inline">Single Class</span></>)
                        : (<><span className="sm:hidden">Full</span><span className="hidden sm:inline">Full Plan</span></>)}
                    </span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <button
            onClick={() => navigate('/teacher/lesson-plan/new')}
            className="ml-2 h-10 px-4 sm:px-5 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Lesson</span>
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* In-flight generations — these fire from the form and complete in
            the background; the plan drops onto the calendar automatically
            once it's ready. */}
        <AnimatePresence>
          {pending.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-indigo-700"
            >
              <Loader2 className="w-5 h-5 mt-0.5 shrink-0 animate-spin" />
              <div className="min-w-0 text-sm font-bold">
                Generating{' '}
                {pending
                  .map((p) => p.chapter_name?.trim())
                  .filter(Boolean)
                  .join(', ') || `${pending.length} lesson plan${pending.length === 1 ? '' : 's'}`}
                …
                <span className="block text-xs font-semibold text-indigo-500/80">
                  This runs in the background — the plan appears on the calendar automatically when it's ready.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chapter legend */}
        <ChapterLegend chapters={chapters} />

        <AnimatePresence mode="wait">
          {mode === 'full' ? (
            <FullPlanView
              key="full"
              calPos={calPos}
              cells={calendarDays(calPos.year, calPos.month)}
              dateMap={dateMap}
              eventDateMap={eventDateMap}
              selDate={selDate}
              onSelectDate={setSelDate}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
              dayClasses={dayClasses}
              dayEvents={dayEvents}
              onOpenClass={openDetail}
              actionMenuFor={actionMenuFor}
              onToggleActionMenu={(k) => setActionMenuFor((prev) => (prev === k ? null : k))}
              busyIdx={busyIdx}
              busyAction={busyAction}
              onRegenerate={handleRegenerate}
              onConfirmDelete={(idx) => setConfirmDeleteIdx(idx)}
            />
          ) : (
            <SingleClassView
              key="single"
              s={selSession}
              total={sessions.length}
              onPrev={prevClass}
              onNext={nextClass}
              onBack={() => setMode('full')}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Confirm delete modal */}
      <AnimatePresence>
        {confirmDeleteIdx !== null && (
          <ConfirmDeleteModal
            chapter={chapters[confirmDeleteIdx]}
            color={pickColor(confirmDeleteIdx)}
            onCancel={() => setConfirmDeleteIdx(null)}
            onConfirm={() => handleDelete(confirmDeleteIdx)}
            busy={busyIdx === confirmDeleteIdx && busyAction === 'delete'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Shell components ──────────────────────────────────────────────────────

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp-canvas relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-violet-50/30" />
        <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-violet-300/30 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[36rem] w-[36rem] rounded-full bg-indigo-300/30 blur-[120px]" />
      </div>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-12">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-slate-500">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      </div>
      <p className="text-sm font-black uppercase tracking-[0.2em]">Loading your lesson plans…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="max-w-md mx-auto bg-white/80 backdrop-blur-xl border border-rose-100 rounded-2xl p-7 shadow-xl shadow-rose-500/10 text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-rose-500" />
      </div>
      <h2 className="text-lg font-black text-slate-900">Couldn't load lesson plans</h2>
      <p className="text-sm text-slate-500 font-medium">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 hover:shadow-xl active:scale-95 transition-all"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-6 sm:p-12 text-center space-y-6 shadow-[0_24px_60px_-24px_rgba(79,70,229,0.22)]"
    >
      <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
        <CalendarDays className="w-10 h-10 text-white" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">No lesson plans yet</h2>
        <p className="text-sm text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
          Generate your first lesson plan to see it laid out on the calendar.
          Each chapter you save will stay here permanently — pick up where you
          left off any time.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-2 h-12 px-5 sm:px-6 max-w-full rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white font-black text-xs sm:text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 active:scale-95 transition-all"
      >
        <Wand2 className="w-4 h-4 shrink-0" />
        <span className="sm:hidden">Generate first plan</span>
        <span className="hidden sm:inline">Generate your first lesson plan</span>
      </button>
    </motion.div>
  );
}

function ChapterLegend({ chapters }: { chapters: ChapterListItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {chapters.map((c, idx) => {
        const color = pickColor(idx);
        const label = c.metadata.chapter_name || c.metadata.chapter_id;
        const subject = c.metadata.subject_label || c.metadata.subject_id;
        const pending = !c.has_output;
        return (
          <div
            key={`${c.metadata.school_id}-${c.metadata.chapter_id}`}
            className={`inline-flex items-center gap-2.5 pl-3 pr-3.5 py-1.5 rounded-full ${color.tint} border ${color.border}`}
          >
            <span className={`relative flex h-2.5 w-2.5`}>
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-70 ${color.dot}`} />
              {pending && (
                <span className={`absolute inline-flex h-full w-full rounded-full ${color.dot} animate-ping`} />
              )}
            </span>
            <span className={`text-xs font-bold ${color.text} truncate max-w-[16rem]`}>
              {label}
              <span className="opacity-60 font-medium">  ·  {subject}</span>
              {pending && <span className="ml-1 opacity-70">(pending)</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Full Plan View ────────────────────────────────────────────────────────

function FullPlanView({
  calPos,
  cells,
  dateMap,
  eventDateMap,
  selDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  dayClasses,
  dayEvents,
  onOpenClass,
  actionMenuFor,
  onToggleActionMenu,
  busyIdx,
  busyAction,
  onRegenerate,
  onConfirmDelete,
}: {
  calPos: { year: number; month: number };
  cells: (Date | null)[];
  dateMap: Map<string, CalendarSession[]>;
  eventDateMap: Map<string, SchoolEvent[]>;
  selDate: Date;
  onSelectDate: (d: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dayClasses: CalendarSession[];
  dayEvents: SchoolEvent[];
  onOpenClass: (s: CalendarSession) => void;
  actionMenuFor: string | null;
  onToggleActionMenu: (k: string) => void;
  busyIdx: number | null;
  busyAction: 'regenerate' | 'delete' | null;
  onRegenerate: (idx: number) => void;
  onConfirmDelete: (idx: number) => void;
}) {
  const todayDate = useMemo(() => new Date(), []);
  const selKey = toKey(selDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: [0.2, 0.65, 0.3, 0.95] }}
      className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px] gap-6"
    >
      <div className="relative rounded-3xl overflow-hidden bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_24px_60px_-24px_rgba(79,70,229,0.22)]">
        <div className="relative px-4 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-slate-100/80">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200/60 to-transparent" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-2">
                Curriculum calendar
              </div>
              <div className="relative h-10 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.h2
                    key={`${calPos.year}-${calPos.month}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.65, 0.3, 0.95] }}
                    className="absolute inset-0 text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-br from-slate-900 to-indigo-700 bg-clip-text text-transparent"
                  >
                    {MONTH_NAMES[calPos.month]} {calPos.year}
                  </motion.h2>
                </AnimatePresence>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onPrevMonth}
                className="group w-9 h-9 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              </button>
              <button
                onClick={onNextMonth}
                className="group w-9 h-9 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
              >
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-4">
          <div className="grid grid-cols-7 mb-1.5">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 py-2">
                {d}
              </div>
            ))}
          </div>

          <LayoutGroup id="dashboard-calendar-selection">
            <motion.div
              key={`${calPos.year}-${calPos.month}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { staggerChildren: 0.012, delayChildren: 0.04 } }}
              className="grid grid-cols-7 gap-1 sm:gap-1.5"
            >
              {cells.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} className="h-[78px] sm:h-[96px] rounded-2xl" />;
                const key = toKey(date);
                const classes = dateMap.get(key) ?? [];
                const dayEventList = eventDateMap.get(key) ?? [];
                const hasHoliday = dayEventList.some((e) => e.is_holiday);
                const isToday = sameDay(date, todayDate);
                const isSel = key === selKey;
                const hasContent = classes.length > 0 || dayEventList.length > 0;

                // Reserve up to 2 chips: classes first, then events (holidays prioritized).
                const sortedEvents = [...dayEventList].sort(
                  (a, b) => Number(!!b.is_holiday) - Number(!!a.is_holiday),
                );
                const classChips = classes.slice(0, 2);
                const eventChipBudget = Math.max(0, 2 - classChips.length);
                const eventChips = sortedEvents.slice(0, eventChipBudget);
                const overflow =
                  classes.length + dayEventList.length - classChips.length - eventChips.length;

                return (
                  <motion.button
                    key={key}
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: SOFT_SPRING }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={SOFT_SPRING}
                    onClick={() => onSelectDate(date)}
                    className="relative h-[78px] sm:h-[96px] rounded-2xl p-1.5 sm:p-2 text-left flex flex-col group focus:outline-none"
                  >
                    {isSel ? (
                      <motion.div
                        layoutId="dash-selected-day-bg"
                        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30"
                        transition={SPRING}
                      />
                    ) : hasHoliday ? (
                      <div className="absolute inset-0 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 transition-colors group-hover:bg-emerald-100/70 group-hover:border-emerald-300" />
                    ) : (
                      <div className={`absolute inset-0 rounded-2xl transition-colors ${
                        hasContent
                          ? 'bg-white border border-slate-200/80 group-hover:border-indigo-200 group-hover:bg-indigo-50/40'
                          : 'bg-transparent group-hover:bg-slate-100/60'
                      }`} />
                    )}
                    {isToday && !isSel && (
                      <div className="absolute inset-0 rounded-2xl ring-1 ring-indigo-300/60 ring-offset-1 ring-offset-white pointer-events-none" />
                    )}

                    <div className="relative flex items-center justify-between mb-1">
                      <span className={`text-xs font-black leading-none px-1.5 py-1 rounded-md ${
                        isSel
                          ? 'text-white'
                          : isToday
                            ? 'text-indigo-600'
                            : hasHoliday
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                      }`}>
                        {date.getDate()}
                      </span>
                      <div className="flex items-center gap-1">
                        {!isSel && hasHoliday && (
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600"
                            title="Non-teaching day"
                          >
                            <Palmtree className="w-2.5 h-2.5" />
                          </span>
                        )}
                        {isToday && (
                          <span className="relative flex h-2 w-2">
                            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isSel ? 'bg-white' : 'bg-indigo-400'}`} />
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${isSel ? 'bg-white' : 'bg-indigo-500'}`} />
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="relative flex flex-col gap-0.5 overflow-hidden w-full">
                      {classChips.map((s) => (
                        <div
                          key={`${s.chapter.metadata.chapter_id}-${s.classItem.class_number}`}
                          className={`rounded-md px-1.5 py-1 w-full transition-colors ${
                            isSel ? 'bg-white/25 backdrop-blur-sm' : `bg-gradient-to-br ${s.color.gradient}`
                          }`}
                        >
                          <div className="text-white text-[9px] font-black uppercase tracking-wider truncate leading-none">
                            C{s.classItem.class_number.toString().padStart(2, '0')}
                          </div>
                          <div className="text-white/85 text-[9px] truncate leading-tight mt-0.5 font-medium">
                            {s.classItem.topics[0]?.topic_name ?? 'Session'}
                          </div>
                        </div>
                      ))}
                      {eventChips.map((ev) => {
                        const style = styleForEvent(ev);
                        return (
                          <div
                            key={`event-${ev.id}`}
                            className={`rounded-md px-1.5 py-1 w-full transition-colors ${
                              isSel ? 'bg-white/25 backdrop-blur-sm' : `${style.tint} border ${style.border}`
                            }`}
                          >
                            <div className={`text-[9px] font-black uppercase tracking-wider truncate leading-none ${
                              isSel ? 'text-white' : style.text
                            }`}>
                              {ev.is_holiday ? 'Holiday' : (ev.type || 'Event')}
                            </div>
                            <div className={`text-[9px] truncate leading-tight mt-0.5 font-medium ${
                              isSel ? 'text-white/85' : 'text-slate-700'
                            }`}>
                              {ev.title}
                            </div>
                          </div>
                        );
                      })}
                      {overflow > 0 && (
                        <div className={`text-[9px] font-bold pl-1 ${isSel ? 'text-white/80' : 'text-slate-400'}`}>
                          +{overflow} more
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </LayoutGroup>
        </div>
      </div>

      {/* Day detail panel */}
      <div className="flex flex-col gap-4">
        <DayHeader
          selDate={selDate}
          classCount={dayClasses.length}
          eventCount={dayEvents.length}
          isHoliday={dayEvents.some((e) => e.is_holiday)}
        />
        <AnimatePresence mode="popLayout">
          {dayEvents.length === 0 && dayClasses.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl bg-white/70 backdrop-blur-xl border border-dashed border-slate-200 px-6 py-10 flex flex-col items-center justify-center text-center gap-3"
            >
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <CalendarDays className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">Nothing scheduled</p>
              <p className="text-xs text-slate-400 max-w-[18rem] leading-relaxed">
                Pick a date with a class or event to see its details.
              </p>
            </motion.div>
          ) : (
            <>
              {dayEvents.map((ev) => (
                <DayEventCard key={`event-${ev.id}`} event={ev} />
              ))}
              {dayClasses.map((s) => {
                const k = `${s.chapter.metadata.chapter_id}-${s.classItem.class_number}`;
                const isBusy = busyIdx === s.chapterIdx;
                return (
                  <DayClassCard
                    key={k}
                    s={s}
                    isMenuOpen={actionMenuFor === k}
                    busy={isBusy ? busyAction : null}
                    onOpen={() => onOpenClass(s)}
                    onToggleMenu={() => onToggleActionMenu(k)}
                    onCloseMenu={() => onToggleActionMenu('')}
                    onRegenerate={() => onRegenerate(s.chapterIdx)}
                    onDelete={() => onConfirmDelete(s.chapterIdx)}
                  />
                );
              })}
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DayHeader({
  selDate,
  classCount,
  eventCount,
  isHoliday,
}: {
  selDate: Date;
  classCount: number;
  eventCount: number;
  isHoliday: boolean;
}) {
  const summaryParts: string[] = [];
  if (classCount > 0) summaryParts.push(`${classCount} class${classCount > 1 ? 'es' : ''}`);
  if (eventCount > 0) summaryParts.push(`${eventCount} event${eventCount > 1 ? 's' : ''}`);
  const summary = summaryParts.length === 0 ? 'Nothing scheduled' : summaryParts.join(' · ');

  const tile = isHoliday
    ? 'from-emerald-500 to-teal-600 shadow-emerald-500/30'
    : 'from-indigo-500 to-blue-600 shadow-indigo-500/30';

  return (
    <motion.div
      layout
      transition={SPRING}
      className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] px-5 py-4 flex items-center gap-3.5"
    >
      <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${tile} flex flex-col items-center justify-center shadow-lg shrink-0`}>
        <span className="text-[9px] font-black text-white/80 uppercase leading-none">
          {selDate.toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-lg font-black text-white leading-none mt-0.5 tabular-nums">
          {selDate.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {selDate.toLocaleDateString('en-US', { weekday: 'long' })}
          {isHoliday && (
            <span className="ml-2 text-emerald-600">· Non-teaching day</span>
          )}
        </div>
        <div className="text-sm font-bold text-slate-800 truncate">
          {summary}
        </div>
      </div>
      {isHoliday ? (
        <Palmtree className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : (
        <CalendarDays className="w-5 h-5 text-indigo-400 shrink-0" />
      )}
    </motion.div>
  );
}

function DayEventCard({ event }: { event: SchoolEvent }) {
  const style = styleForEvent(event);
  const startISO = event.date;
  const endISO = event.end_date;
  const start = parseISO(startISO);
  const isMultiDay = !!endISO && endISO !== startISO;
  const end = endISO ? parseISO(endISO) : null;
  const startLabel = fmtDate(start);
  const endLabel = end ? fmtDate(end) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={SOFT_SPRING}
      className="relative rounded-2xl overflow-hidden bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(15,23,42,0.16)]"
    >
      <div className={`relative px-5 py-3.5 ${style.solid} overflow-hidden`}>
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 text-white">
              {style.icon}
            </div>
            <div className="min-w-0">
              <div className="text-white text-xs font-black uppercase tracking-[0.18em] truncate">
                {event.is_holiday ? 'Non-teaching day' : (event.type || 'Event')}
              </div>
              <div className="text-white/85 text-[10px] font-bold uppercase tracking-wider truncate">
                {event.title}
              </div>
            </div>
          </div>
          {event.is_holiday && (
            <span className="text-white/90 text-[10px] font-black uppercase tracking-widest shrink-0 inline-flex items-center gap-1">
              <Palmtree className="w-3 h-3" />
              Holiday
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3.5">
        <h4 className="text-base font-black text-slate-900 leading-snug tracking-tight">
          {event.title}
        </h4>

        {event.description && (
          <div className="flex items-start gap-2.5 text-sm text-slate-600 font-medium leading-relaxed">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
            <span>{event.description}</span>
          </div>
        )}

        <div className="grid gap-2 pt-1">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 font-bold">
            <CalendarDays className={`w-3.5 h-3.5 ${style.text}`} />
            <span className="truncate">
              {startLabel}
              {isMultiDay && endLabel && (
                <span className="text-slate-400 font-medium"> → {endLabel}</span>
              )}
            </span>
          </div>
          {event.time && (
            <div className="flex items-center gap-2.5 text-xs text-slate-600 font-bold">
              <Clock className={`w-3.5 h-3.5 ${style.text}`} />
              <span className="truncate">{event.time}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2.5 text-xs text-slate-600 font-bold">
              <MapPin className={`w-3.5 h-3.5 ${style.text}`} />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${style.tint} ${style.text} border ${style.border}`}>
            {style.icon}
            {event.type || 'Event'}
          </span>
          {event.is_holiday && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Palmtree className="w-3 h-3" />
              Non-teaching
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function DayClassCard({
  s,
  isMenuOpen,
  busy,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onRegenerate,
  onDelete,
}: {
  s: CalendarSession;
  isMenuOpen: boolean;
  busy: 'regenerate' | 'delete' | null;
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const chapterName = s.chapter.metadata.chapter_name || s.chapter.metadata.chapter_id;
  const color = s.color;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={SOFT_SPRING}
      className="relative rounded-2xl overflow-hidden bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] hover:shadow-[0_20px_50px_-20px_rgba(79,70,229,0.32)] transition-shadow"
    >
      <button
        type="button"
        onClick={onOpen}
        className={`block w-full text-left relative px-5 py-3.5 bg-gradient-to-br ${color.gradient} overflow-hidden`}
      >
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-white text-xs font-black uppercase tracking-[0.18em]">
                Class {String(s.classItem.class_number).padStart(2, '0')}
              </div>
              <div className="text-white/80 text-[10px] font-bold uppercase tracking-wider truncate">
                {chapterName}
              </div>
            </div>
          </div>
          <span className="text-white/85 text-[10px] font-black uppercase tracking-widest shrink-0">
            {fmtShortDate(s.date)}
          </span>
        </div>
      </button>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <h4 className="text-base font-black text-slate-900 leading-snug tracking-tight">
          {s.classItem.topics[0]?.topic_name ?? 'Class Session'}
        </h4>
        <div>
          <h5 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2.5">
            <span className={`w-1 h-3 rounded-full ${color.solid}`} />
            Topic Overview
          </h5>
          <div className="space-y-2.5">
            {s.classItem.topics.map((topic, ti) => (
              <div key={ti} className="space-y-1.5">
                <p className="text-sm font-bold text-slate-800 leading-relaxed">
                  {topic.topic_name}
                </p>
                {topic.subtopics.length > 0 && (
                  <ul className="space-y-1 pl-0.5">
                    {topic.subtopics.slice(0, 4).map((st, si) => (
                      <li
                        key={si}
                        className="flex items-start gap-2 text-xs text-slate-600 font-medium leading-relaxed"
                      >
                        <span className={`mt-[7px] w-1 h-1 rounded-full ${color.dot} shrink-0`} />
                        <span>{st}</span>
                      </li>
                    ))}
                    {topic.subtopics.length > 4 && (
                      <li className="text-[10px] text-slate-400 font-bold pl-3 italic">
                        +{topic.subtopics.length - 4} more — open the class for full detail
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overflow menu */}
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          aria-label="Chapter actions"
          className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white flex items-center justify-center transition-colors active:scale-95"
        >
          {busy === 'regenerate' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MoreVertical className="w-4 h-4" />
          )}
        </button>

        <AnimatePresence>
          {isMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-20 cursor-default"
                onClick={onCloseMenu}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-10 z-30 min-w-[200px] rounded-xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={busy === 'regenerate'}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-indigo-50 transition-colors text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4 text-indigo-500" />
                  Regenerate
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy !== null}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-rose-50 transition-colors text-sm font-semibold text-rose-600 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete chapter…
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Single Class View ─────────────────────────────────────────────────────

function SingleClassView({
  s,
  total,
  onPrev,
  onNext,
  onBack,
}: {
  s: CalendarSession | null;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  if (!s) return null;
  const color = s.color;
  const classItem = s.classItem;
  const chapterName = s.chapter.metadata.chapter_name || s.chapter.metadata.chapter_id;
  const subject = s.chapter.metadata.subject_label || s.chapter.metadata.subject_id;
  const idx = s.globalIdx;
  const progress = total > 0 ? Math.min(100, ((idx + 1) / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: [0.2, 0.65, 0.3, 0.95] }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200 hover:border-indigo-300 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Calendar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={idx <= 0}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="px-3.5 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 min-w-[100px] flex flex-col items-center leading-none">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Class</span>
            <span className="text-sm font-black text-slate-800 mt-0.5 tabular-nums">
              {idx + 1} <span className="text-slate-300 font-bold">/</span> {total}
            </span>
          </div>
          <button
            onClick={onNext}
            disabled={idx >= total - 1}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <motion.div
        layout
        transition={SPRING}
        className={`lp-hero relative rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br ${color.gradient}`}
        style={{ boxShadow: `0 24px 60px -24px ${color.hex}66` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(255,255,255,0.08),transparent_55%)]" />
        <motion.div
          aria-hidden
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl"
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 px-8 sm:px-10 py-9 sm:py-11">
          <div className="flex items-center gap-1.5 text-white/60 text-xs font-semibold mb-4">
            <span>{subject}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="truncate max-w-md">{chapterName}</span>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <span className="inline-flex items-center gap-1.5 text-white text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
              <CalendarDays className="w-3 h-3" />
              {fmtDate(s.date)}
            </span>
            <span className="inline-flex items-center text-white/80 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15">
              Class {String(classItem.class_number).padStart(2, '0')}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight max-w-3xl">
            {classItem.topics[0]?.topic_name ?? 'Class Session'}
          </h1>

          <div className="mt-7 max-w-md">
            <div className="flex items-center justify-between mb-2 text-[10px] font-black uppercase tracking-widest text-white/60">
              <span>Curriculum Progress</span>
              <span className="tabular-nums text-white/90">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.6)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.7, ease: [0.2, 0.65, 0.3, 0.95] }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-5">
          <div className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 tracking-tight mb-5">
              <span className={`w-1 h-5 rounded-full ${color.solid}`} />
              Topic Overview
            </h2>
            <div className="space-y-5">
              {classItem.topics.map((topic, ti) => (
                <div key={ti} className="space-y-2.5">
                  <p className="text-[15px] font-black text-slate-800 leading-snug">
                    {topic.topic_name}
                  </p>
                  {topic.subtopics.length > 0 && (
                    <ul className={`space-y-2 pl-3 border-l-2 ${color.border}`}>
                      {topic.subtopics.map((st, si) => (
                        <li
                          key={si}
                          className="flex items-start gap-2.5 text-sm text-slate-600 font-medium leading-relaxed"
                        >
                          <span className={`mt-[9px] w-1.5 h-1.5 rounded-full ${color.dot} shrink-0 shadow-sm`} />
                          <span>{st}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {classItem.learning_objectives.length > 0 && (
            <div className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(16,185,129,0.16)] p-6 sm:p-7">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 tracking-tight mb-5">
                <span className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                Learning Objectives
              </h2>
              <ul className="space-y-2.5">
                {classItem.learning_objectives.map((obj, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 bg-gradient-to-br from-emerald-50 to-teal-50/40 border border-emerald-100/80 rounded-xl px-4 py-3.5"
                  >
                    <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm text-slate-700 font-medium leading-relaxed">{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {classItem.homework && classItem.homework.questions.length > 0 && (
            <div className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(124,58,237,0.16)] p-6 sm:p-7">
              <h2 className="flex items-center justify-between text-lg font-black text-slate-900 tracking-tight mb-5">
                <span className="flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />
                  Homework
                </span>
                {classItem.homework.estimated_time_minutes && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-500 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                    ~{classItem.homework.estimated_time_minutes} min
                  </span>
                )}
              </h2>
              <ol className="space-y-2.5">
                {classItem.homework.questions.map((q, qi) => (
                  <li
                    key={qi}
                    className="flex items-start gap-3 text-sm text-slate-700 font-medium leading-relaxed bg-slate-50/60 border border-slate-100 rounded-xl px-4 py-3"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[11px] font-black flex items-center justify-center tabular-nums shadow-sm">
                      {qi + 1}
                    </span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {classItem.teacher_tip ? (
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 border border-amber-100 shadow-[0_12px_30px_-15px_rgba(245,158,11,0.25)]">
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-200/40 blur-2xl pointer-events-none" />
              <div className="relative px-5 py-3.5 border-b border-amber-100/80 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-xs font-black text-amber-700 uppercase tracking-[0.18em]">
                  Teacher's Tip
                </span>
              </div>
              <div className="relative px-5 py-4">
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                  {classItem.teacher_tip}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(15,23,42,0.10)] p-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-slate-500 mb-4">
              <ScrollText className="w-3.5 h-3.5 text-slate-400" />
              Class Details
            </h3>
            <div className="space-y-3.5">
              <InfoRow
                icon={<BookOpen className={`w-3.5 h-3.5 ${color.text}`} />}
                label="Subject"
                value={subject}
              />
              <InfoRow
                icon={<GraduationCap className={`w-3.5 h-3.5 ${color.text}`} />}
                label="Chapter"
                value={chapterName}
              />
              <InfoRow
                icon={<CalendarDays className="w-3.5 h-3.5 text-emerald-500" />}
                label="Scheduled"
                value={fmtDate(s.date)}
              />
              {s.chapter.metadata.grade_label && (
                <InfoRow
                  icon={<Sparkles className="w-3.5 h-3.5 text-violet-500" />}
                  label="Grade"
                  value={`${s.chapter.metadata.grade_label}${s.chapter.metadata.section_label ? ` · ${s.chapter.metadata.section_label}` : ''}`}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 font-bold leading-snug mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Confirm delete modal ──────────────────────────────────────────────────

function ConfirmDeleteModal({
  chapter,
  color,
  busy,
  onCancel,
  onConfirm,
}: {
  chapter: ChapterListItem;
  color: ChapterColor;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = chapter.metadata.chapter_name || chapter.metadata.chapter_id;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={SPRING}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
      >
        <div className={`relative px-6 py-5 bg-gradient-to-br ${color.gradient} text-white overflow-hidden`}>
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black leading-tight">Delete chapter?</h3>
                <p className="text-white/75 text-xs font-bold uppercase tracking-[0.18em] mt-0.5">
                  This cannot be undone
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            Removing <span className="font-black text-slate-900">{name}</span> will
            permanently delete its uploaded files, metadata, and generated lesson
            plan from storage. Other chapters are unaffected.
          </p>
        </div>

        <div className="px-6 pb-6 pt-1 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-bold text-slate-700 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-10 px-5 rounded-xl bg-gradient-to-br from-rose-600 to-pink-600 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-rose-500/30 hover:shadow-xl active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete chapter
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
