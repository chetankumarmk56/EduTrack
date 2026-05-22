/**
 * Curriculum Planner — GeneratedLessonPlanView
 *
 * Renders the AI lesson plan output as a calendar pegged to the teacher's
 * real timetable. Two modes:
 *   • Full Plan  → monthly grid + day topic-overview panel
 *   • Single Day → expanded class card with topics, objectives, tip, homework
 *
 * All content shown comes directly from the generated lesson plan JSON or
 * the teacher's timetable — no invented categories, locations, or CTAs.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup, type Variants } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  ScrollText,
  Sparkles,
} from 'lucide-react';

import type {
  GeneratedLessonPlan,
  LessonPlanMetadata,
  LessonPlanScheduleItem,
} from '@/features/lesson-plan/ai/types';

// ─── Types ─────────────────────────────────────────────────────────────────

type PlanMode = 'full' | 'single';

interface ScheduledClass extends LessonPlanScheduleItem {
  date: Date;
}

interface Props {
  plan: GeneratedLessonPlan;
  metadata: LessonPlanMetadata;
  outputPath?: string;
  providerMeta?: Record<string, unknown>;
  /**
   * One ISO date per class, in class_number order, sourced from the teacher's
   * timetable. When present these drive the calendar placement; when absent
   * we fall back to back-to-back weekdays so the result is still viewable.
   */
  sessionDates?: string[];
  onReset?: () => void;
  onOpenStandalone?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Motion presets ────────────────────────────────────────────────────────

const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;
const SOFT_SPRING = { type: 'spring', stiffness: 220, damping: 28 } as const;

const cellContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.012, delayChildren: 0.05 } },
};
const cellItem = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: SOFT_SPRING },
};

const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};
const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.2, 0.65, 0.3, 0.95] as [number, number, number, number] } },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextWeekday(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

function buildSchedule(
  items: LessonPlanScheduleItem[],
  sessionDates: string[] | undefined,
): ScheduledClass[] {
  const dates: Date[] = [];
  if (sessionDates && sessionDates.length > 0) {
    for (const iso of sessionDates) {
      const d = parseISO(iso);
      if (!isNaN(d.getTime())) dates.push(d);
    }
  }

  let fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  while (fallback.getDay() === 0 || fallback.getDay() === 6) {
    fallback.setDate(fallback.getDate() + 1);
  }
  if (dates.length > 0) {
    fallback = new Date(dates[dates.length - 1]);
  }

  const result: ScheduledClass[] = [];
  items.forEach((item, i) => {
    let d: Date;
    if (i < dates.length) {
      d = dates[i];
    } else {
      if (i > 0) fallback = nextWeekday(fallback);
      d = new Date(fallback);
    }
    result.push({ ...item, date: d });
  });
  return result;
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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function GeneratedLessonPlanView({ plan, sessionDates, onReset }: Props) {
  const scheduled = useMemo(
    () => buildSchedule(plan.schedule, sessionDates),
    [plan.schedule, sessionDates],
  );

  const dateMap = useMemo(() => {
    const m = new Map<string, ScheduledClass[]>();
    for (const sc of scheduled) {
      const k = toKey(sc.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(sc);
    }
    return m;
  }, [scheduled]);

  const [mode, setMode] = useState<PlanMode>('full');
  const [selDate, setSelDate] = useState<Date>(() => scheduled[0]?.date ?? new Date());
  const [selClass, setSelClass] = useState<ScheduledClass | null>(scheduled[0] ?? null);
  const [calPos, setCalPos] = useState(() => {
    const anchor = scheduled[0]?.date ?? new Date();
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  });

  const dayClasses = useMemo(() => dateMap.get(toKey(selDate)) ?? [], [selDate, dateMap]);

  const classIdx = useMemo(
    () => scheduled.findIndex((sc) => sc.class_number === selClass?.class_number),
    [scheduled, selClass],
  );

  function openDetail(sc: ScheduledClass) {
    setSelClass(sc);
    setMode('single');
  }

  function prevClass() {
    if (classIdx > 0) setSelClass(scheduled[classIdx - 1]);
  }
  function nextClass() {
    if (classIdx < scheduled.length - 1) setSelClass(scheduled[classIdx + 1]);
  }

  function prevMonth() {
    setCalPos((p) => (p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 }));
  }
  function nextMonth() {
    setCalPos((p) => (p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 }));
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ── Ambient background ─────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-indigo-50/40 to-violet-50/30" />
        <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-violet-300/30 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[36rem] w-[36rem] rounded-full bg-indigo-300/30 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-200/30 blur-[100px]" />
      </div>

      {/* ── Top Nav ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/60 shadow-[0_1px_0_0_rgba(15,23,42,0.04)]">
        <div className="max-w-screen-xl mx-auto px-5 h-16 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mr-2 shrink-0">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-4 h-4 text-white" />
              <div className="absolute inset-0 rounded-xl bg-white/20 mix-blend-overlay" />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-black text-slate-900 text-sm tracking-tight">
                Curriculum Planner
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500 mt-0.5">
                Lesson plan
              </span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Subject · Chapter context chip */}
          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200/80 bg-white/60 backdrop-blur-sm">
            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-600 truncate max-w-[6rem]">{plan.subject}</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[14rem]">{plan.chapter_title}</span>
          </div>

          {/* View toggle */}
          <LayoutGroup id="planner-mode-toggle">
            <div className="relative flex items-center bg-slate-100/80 backdrop-blur-sm rounded-xl p-1 gap-0.5">
              {(['single', 'full'] as PlanMode[]).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="relative z-10 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {active && (
                      <motion.div
                        layoutId="mode-pill"
                        className="absolute inset-0 bg-white rounded-lg shadow-sm shadow-slate-900/5"
                        transition={SPRING}
                      />
                    )}
                    <span className={`relative ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                      {m === 'single' ? 'Single Day' : 'Full Plan'}
                    </span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          {mode === 'full' ? (
            <FullPlanView
              key="full"
              plan={plan}
              scheduled={scheduled}
              dateMap={dateMap}
              calPos={calPos}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
              selDate={selDate}
              onSelectDate={(d) => setSelDate(d)}
              dayClasses={dayClasses}
              onOpenClass={openDetail}
              onReset={onReset}
            />
          ) : (
            <SingleDayView
              key="single"
              sc={selClass ?? scheduled[0]}
              plan={plan}
              classIdx={classIdx >= 0 ? classIdx : 0}
              total={scheduled.length}
              onPrev={prevClass}
              onNext={nextClass}
              onBack={() => setMode('full')}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Full Plan View ────────────────────────────────────────────────────────

function FullPlanView({
  plan,
  scheduled,
  dateMap,
  calPos,
  onPrevMonth,
  onNextMonth,
  selDate,
  onSelectDate,
  dayClasses,
  onOpenClass,
  onReset,
}: {
  plan: GeneratedLessonPlan;
  scheduled: ScheduledClass[];
  dateMap: Map<string, ScheduledClass[]>;
  calPos: { year: number; month: number };
  onPrevMonth: () => void;
  onNextMonth: () => void;
  selDate: Date;
  onSelectDate: (d: Date) => void;
  dayClasses: ScheduledClass[];
  onOpenClass: (sc: ScheduledClass) => void;
  onReset?: () => void;
}) {
  const cells = useMemo(() => calendarDays(calPos.year, calPos.month), [calPos]);
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
      {/* ── Calendar panel ─────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_24px_60px_-24px_rgba(79,70,229,0.22),0_2px_6px_-2px_rgba(15,23,42,0.06)]">
        {/* Header */}
        <div className="relative px-7 pt-6 pb-4 border-b border-slate-100/80">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200/60 to-transparent" />

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mb-2.5">
                <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-indigo-600">{plan.subject}</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-700 truncate max-w-xs">{plan.chapter_title}</span>
              </div>

              <div className="relative h-9 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.h2
                    key={`${calPos.year}-${calPos.month}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.65, 0.3, 0.95] }}
                    className="absolute inset-0 text-3xl font-black text-slate-900 tracking-tight bg-gradient-to-br from-slate-900 to-indigo-700 bg-clip-text text-transparent"
                  >
                    {MONTH_NAMES[calPos.month]} {calPos.year}
                  </motion.h2>
                </AnimatePresence>
              </div>
              {plan.academic_year && (
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Academic Year {plan.academic_year}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onPrevMonth}
                className="group w-9 h-9 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all active:scale-95 shadow-sm hover:shadow-md hover:shadow-indigo-500/10"
              >
                <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              </button>
              <button
                onClick={onNextMonth}
                className="group w-9 h-9 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all active:scale-95 shadow-sm hover:shadow-md hover:shadow-indigo-500/10"
              >
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="p-4">
          <div className="grid grid-cols-7 mb-1.5">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 py-2">
                {d}
              </div>
            ))}
          </div>

          <LayoutGroup id="calendar-selection">
            <motion.div
              key={`${calPos.year}-${calPos.month}`}
              variants={cellContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-7 gap-1.5"
            >
              {cells.map((date, i) => {
                if (!date) {
                  return (
                    <motion.div
                      key={`blank-${i}`}
                      variants={cellItem}
                      className="h-[92px] rounded-2xl"
                    />
                  );
                }
                const key = toKey(date);
                const classes = dateMap.get(key) ?? [];
                const isToday = sameDay(date, todayDate);
                const isSel = key === selKey;
                const hasClasses = classes.length > 0;

                return (
                  <motion.button
                    key={key}
                    variants={cellItem}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={SOFT_SPRING}
                    onClick={() => onSelectDate(date)}
                    className="relative h-[92px] rounded-2xl p-2 text-left flex flex-col group focus:outline-none"
                  >
                    {/* Selection / hover background */}
                    {isSel ? (
                      <motion.div
                        layoutId="selected-day-bg"
                        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30"
                        transition={SPRING}
                      />
                    ) : (
                      <div className={`absolute inset-0 rounded-2xl transition-colors ${
                        hasClasses
                          ? 'bg-white border border-slate-200/80 group-hover:border-indigo-200 group-hover:bg-indigo-50/40'
                          : 'bg-transparent group-hover:bg-slate-100/60'
                      }`} />
                    )}
                    {/* Today ring */}
                    {isToday && !isSel && (
                      <div className="absolute inset-0 rounded-2xl ring-1 ring-indigo-300/60 ring-offset-1 ring-offset-white pointer-events-none" />
                    )}

                    <div className="relative flex items-center justify-between mb-1">
                      <span className={`text-xs font-black leading-none px-1.5 py-1 rounded-md ${
                        isSel
                          ? 'text-white'
                          : isToday
                            ? 'text-indigo-600'
                            : 'text-slate-600'
                      }`}>
                        {date.getDate()}
                      </span>
                      {isToday && (
                        <span className="relative flex h-2 w-2">
                          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isSel ? 'bg-white' : 'bg-indigo-400'}`} />
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${isSel ? 'bg-white' : 'bg-indigo-500'}`} />
                        </span>
                      )}
                    </div>

                    <div className="relative flex flex-col gap-0.5 overflow-hidden w-full">
                      {classes.slice(0, 2).map((sc) => (
                        <div
                          key={sc.class_number}
                          className={`rounded-md px-1.5 py-1 w-full transition-colors ${
                            isSel
                              ? 'bg-white/25 backdrop-blur-sm'
                              : 'bg-gradient-to-br from-indigo-600 to-violet-600'
                          }`}
                        >
                          <div className="text-white text-[9px] font-black uppercase tracking-wider truncate leading-none">
                            C{sc.class_number.toString().padStart(2, '0')}
                          </div>
                          <div className="text-white/85 text-[9px] truncate leading-tight mt-0.5 font-medium">
                            {sc.topics[0]?.topic_name ?? 'Session'}
                          </div>
                        </div>
                      ))}
                      {classes.length > 2 && (
                        <div className={`text-[9px] font-bold pl-1 ${isSel ? 'text-white/80' : 'text-slate-400'}`}>
                          +{classes.length - 2} more
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </LayoutGroup>
        </div>

        {/* Stats footer */}
        <div className="px-7 py-4 border-t border-slate-100/80 bg-gradient-to-br from-slate-50/80 to-indigo-50/40 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Classes</span>
              <span className="text-base font-black text-slate-900 mt-0.5 tabular-nums">{scheduled.length}</span>
            </div>
          </div>
          {onReset && (
            <button
              onClick={onReset}
              className="ml-auto group flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 text-xs text-slate-500 hover:text-indigo-600 font-bold uppercase tracking-widest transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180 duration-500" /> New Plan
            </button>
          )}
        </div>
      </div>

      {/* ── Day detail panel ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {/* Date header */}
        <motion.div
          layout
          transition={SPRING}
          className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] px-5 py-4 flex items-center gap-3.5"
        >
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex flex-col items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
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
            </div>
            <div className="text-sm font-bold text-slate-800 truncate">
              {dayClasses.length === 0
                ? 'No class scheduled'
                : `${dayClasses.length} class${dayClasses.length > 1 ? 'es' : ''} scheduled`}
            </div>
          </div>
          <CalendarDays className="w-5 h-5 text-indigo-400 shrink-0" />
        </motion.div>

        {/* Class cards */}
        <AnimatePresence mode="popLayout">
          {dayClasses.length > 0 ? (
            dayClasses.map((sc) => (
              <DayClassPanel
                key={`${selKey}-${sc.class_number}`}
                sc={sc}
                onOpen={() => onOpenClass(sc)}
              />
            ))
          ) : (
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
              <p className="text-sm font-bold text-slate-600">No class on this day</p>
              <p className="text-xs text-slate-400 max-w-[18rem] leading-relaxed">
                Pick a date with a class card to see the topic overview.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Day Detail Panel ──────────────────────────────────────────────────────

function DayClassPanel({ sc, onOpen }: { sc: ScheduledClass; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={SOFT_SPRING}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className="text-left relative rounded-2xl overflow-hidden bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] hover:shadow-[0_20px_50px_-20px_rgba(79,70,229,0.32)] transition-shadow group"
    >
      {/* Gradient header */}
      <div className="relative px-5 py-3.5 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-violet-300/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white text-xs font-black uppercase tracking-[0.18em]">
              Class {String(sc.class_number).padStart(2, '0')}
            </span>
          </div>
          <span className="text-white/85 text-[10px] font-black uppercase tracking-widest">
            {fmtShortDate(sc.date)}
          </span>
        </div>
      </div>

      {/* Body */}
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="px-5 py-4 space-y-4"
      >
        <motion.h4 variants={listItem} className="text-base font-black text-slate-900 leading-snug tracking-tight">
          {sc.topics[0]?.topic_name ?? 'Class Session'}
        </motion.h4>
        <motion.div variants={listItem}>
          <h5 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3">
            <span className="w-1 h-3 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
            Topic Overview
          </h5>
          <div className="space-y-3">
            {sc.topics.map((topic, ti) => (
              <motion.div key={ti} variants={listItem} className="space-y-1.5">
                <p className="text-sm font-bold text-slate-800 leading-relaxed">
                  {topic.topic_name}
                </p>
                {topic.subtopics.length > 0 && (
                  <ul className="space-y-1 pl-0.5">
                    {topic.subtopics.map((st, si) => (
                      <li
                        key={si}
                        className="flex items-start gap-2 text-xs text-slate-600 font-medium leading-relaxed"
                      >
                        <span className="mt-[7px] w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </motion.button>
  );
}

// ─── Single Day View ───────────────────────────────────────────────────────

function SingleDayView({
  sc,
  plan,
  classIdx,
  total,
  onPrev,
  onNext,
  onBack,
}: {
  sc: ScheduledClass;
  plan: GeneratedLessonPlan;
  classIdx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const topicName = sc.topics[0]?.topic_name ?? 'Class Session';
  const allTopics = sc.topics;
  const progress = total > 0 ? Math.min(100, ((classIdx + 1) / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: [0.2, 0.65, 0.3, 0.95] }}
      className="space-y-6"
    >
      {/* Nav row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200 hover:border-indigo-300 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Planner
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={classIdx <= 0}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="px-3.5 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 min-w-[100px] flex flex-col items-center leading-none">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Class</span>
            <span className="text-sm font-black text-slate-800 mt-0.5 tabular-nums">
              {classIdx + 1} <span className="text-slate-300 font-bold">/</span> {total}
            </span>
          </div>
          <button
            onClick={onNext}
            disabled={classIdx >= total - 1}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center text-slate-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hero banner */}
      <motion.div
        layout
        transition={SPRING}
        className="relative rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/20"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(139,92,246,0.45),transparent_55%)]" />
        <motion.div
          aria-hidden
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl"
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-violet-400/30 blur-3xl"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        {/* Decorative grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" viewBox="0 0 800 320" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>

        <div className="relative z-10 px-8 sm:px-10 py-9 sm:py-11">
          <div className="flex items-center gap-1.5 text-white/60 text-xs font-semibold mb-4">
            <span>{plan.subject}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="truncate max-w-md">{plan.chapter_title}</span>
          </div>

          <div className="flex items-center gap-2.5 mb-4">
            <span className="inline-flex items-center gap-1.5 text-white text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
              <CalendarDays className="w-3 h-3" />
              {fmtDate(sc.date)}
            </span>
            <span className="inline-flex items-center text-white/80 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15">
              Class {String(sc.class_number).padStart(2, '0')}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight max-w-3xl">
            {topicName}
          </h1>

          {/* Progress */}
          <div className="mt-7 max-w-md">
            <div className="flex items-center justify-between mb-2 text-[10px] font-black uppercase tracking-widest text-white/60">
              <span>Curriculum Progress</span>
              <span className="tabular-nums text-white/90">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-white via-white to-violet-200 shadow-[0_0_18px_rgba(255,255,255,0.6)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.7, ease: [0.2, 0.65, 0.3, 0.95] }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main content + sidebar */}
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] gap-6"
      >
        <div className="space-y-5">
          {/* Topic Overview */}
          <motion.div variants={listItem} className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(79,70,229,0.18)] p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 tracking-tight mb-5">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
              Topic Overview
            </h2>
            <motion.div variants={listContainer} className="space-y-5">
              {allTopics.map((topic, ti) => (
                <motion.div key={ti} variants={listItem} className="space-y-2.5">
                  <p className="text-[15px] font-black text-slate-800 leading-snug">
                    {topic.topic_name}
                  </p>
                  {topic.subtopics.length > 0 && (
                    <ul className="space-y-2 pl-3 border-l-2 border-indigo-100">
                      {topic.subtopics.map((st, si) => (
                        <li
                          key={si}
                          className="flex items-start gap-2.5 text-sm text-slate-600 font-medium leading-relaxed"
                        >
                          <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 shrink-0 shadow-sm" />
                          <span>{st}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Learning Objectives */}
          {sc.learning_objectives.length > 0 && (
            <motion.div variants={listItem} className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(16,185,129,0.16)] p-6 sm:p-7">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900 tracking-tight mb-5">
                <span className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                Learning Objectives
              </h2>
              <ul className="space-y-2.5">
                {sc.learning_objectives.map((obj, i) => (
                  <motion.li
                    key={i}
                    variants={listItem}
                    className="flex items-start gap-3 bg-gradient-to-br from-emerald-50 to-teal-50/40 border border-emerald-100/80 rounded-xl px-4 py-3.5 hover:border-emerald-200 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm text-slate-700 font-medium leading-relaxed">{obj}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}

          {/* Homework */}
          {sc.homework && sc.homework.questions.length > 0 && (
            <motion.div variants={listItem} className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_12px_30px_-15px_rgba(124,58,237,0.16)] p-6 sm:p-7">
              <h2 className="flex items-center justify-between text-lg font-black text-slate-900 tracking-tight mb-5">
                <span className="flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500" />
                  Homework
                </span>
                {sc.homework.estimated_time_minutes && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-500 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                    ~{sc.homework.estimated_time_minutes} min
                  </span>
                )}
              </h2>
              <ol className="space-y-2.5">
                {sc.homework.questions.map((q, qi) => (
                  <motion.li
                    key={qi}
                    variants={listItem}
                    className="flex items-start gap-3 text-sm text-slate-700 font-medium leading-relaxed bg-slate-50/60 hover:bg-violet-50/40 border border-slate-100 hover:border-violet-100 rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[11px] font-black flex items-center justify-center tabular-nums shadow-sm">
                      {qi + 1}
                    </span>
                    <span>{q}</span>
                  </motion.li>
                ))}
              </ol>
            </motion.div>
          )}
        </div>

        <motion.div variants={listItem} className="space-y-4">
          {sc.teacher_tip ? (
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
                  {sc.teacher_tip}
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
                icon={<BookOpen className="w-3.5 h-3.5 text-indigo-500" />}
                label="Subject"
                value={plan.subject}
              />
              <InfoRow
                icon={<GraduationCap className="w-3.5 h-3.5 text-violet-500" />}
                label="Chapter"
                value={plan.chapter_title}
              />
              <InfoRow
                icon={<CalendarDays className="w-3.5 h-3.5 text-emerald-500" />}
                label="Scheduled"
                value={fmtDate(sc.date)}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
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
