import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarRange, Clock, BookOpen,
  MapPin, User, ChevronRight, Hourglass, GraduationCap,
  CalendarDays, LayoutGrid, ListOrdered,
} from 'lucide-react';
import { timetableApi } from '@/features/timetable/api';
import type {
  ClassTimetable, SchedulePeriod, TimetableSlot, SchedulePeriodType,
} from '@/shared/types';
import { useApp } from '@/shared/contexts/AppContext';
import { SkeletonList } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/utils';
import {
  DAY_LABELS,
  DAY_FULL,
  todayIndex,
  formatTime,
  nowMinutes,
  timeToMinutes,
  periodIconFor,
  sortPeriods,
  buildSlotMap,
} from '@/features/timetable/lib';

function PeriodIcon({ type }: { type: SchedulePeriodType }) {
  const Icon = periodIconFor(type);
  return <Icon className="w-3.5 h-3.5" />;
}

/** Deterministic hue per subject so each subject gets its own color across the grid. */
function subjectHue(name?: string) {
  if (!name) return 230;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function ParentTimetable() {
  const { studentProfile } = useApp();
  const [data, setData] = useState<ClassTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week'>('day');
  const today = todayIndex();
  const [selectedDay, setSelectedDay] = useState(today);

  const classId =
    studentProfile?.school_class_id ??
    studentProfile?.school_class?.id ??
    studentProfile?.classroom?.id ??
    null;

  useEffect(() => {
    if (!classId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const tt = await timetableApi.getClassTimetable(classId);
        setData(tt);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

  const sortedPeriods = useMemo(() => sortPeriods(data?.periods ?? []), [data]);
  const slotByCoord = useMemo(() => buildSlotMap(data?.slots ?? []), [data]);

  const dayItems = useMemo(
    () =>
      sortedPeriods.map((p) => ({
        period: p,
        slot: slotByCoord.get(`${p.id}:${selectedDay}`),
      })),
    [sortedPeriods, slotByCoord, selectedDay],
  );

  const classesForSelectedDay = useMemo(
    () =>
      dayItems.filter(
        (x) => x.period.period_type === 'class_period' && x.slot?.subject,
      ).length,
    [dayItems],
  );

  const totalWeekClasses = useMemo(() => {
    let n = 0;
    sortedPeriods.forEach((p) => {
      if (p.period_type !== 'class_period') return;
      for (let d = 0; d < 7; d++) {
        if (slotByCoord.get(`${p.id}:${d}`)?.subject) n++;
      }
    });
    return n;
  }, [sortedPeriods, slotByCoord]);

  const uniqueSubjectsCount = useMemo(() => {
    const set = new Set<string>();
    data?.slots.forEach((s) => {
      if (s.subject?.name) set.add(s.subject.name);
    });
    return set.size;
  }, [data]);

  // Live "now" position for today
  const isViewingToday = selectedDay === today;
  const minsNow = nowMinutes();
  const currentPeriodId = useMemo(() => {
    if (!isViewingToday) return null;
    for (const { period } of dayItems) {
      const s = timeToMinutes(period.start_time);
      const e = timeToMinutes(period.end_time);
      if (minsNow >= s && minsNow < e) return period.id;
    }
    return null;
  }, [dayItems, isViewingToday, minsNow]);

  const className =
    data?.school_class?.display_name ||
    studentProfile?.school_class?.display_name ||
    '';
  const room = data?.school_class?.room_number;

  return (
    <div className="w-full animate-fade-in flex flex-col gap-8 pb-20">
      {/* Hero */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute -top-24 -left-12 w-[420px] h-[420px] rounded-full blur-3xl opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(99,102,241,0.4) 0%, transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-12 right-0 w-[340px] h-[340px] rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(59,130,246,0.4) 0%, transparent 60%)',
          }}
        />

        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <CalendarRange className="w-3.5 h-3.5" /> Class Timetable
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-gradient-indigo leading-[1.05]">
            Weekly Schedule
          </h1>
          {studentProfile && (
            <p className="text-text-secondary text-lg font-medium max-w-2xl">
              Schedule for{' '}
              <span className="text-foreground font-bold">{studentProfile.name}</span>
              {className && (
                <> · <span className="text-brand-indigo">{className}</span></>
              )}
              {room && (
                <>
                  {' · '}
                  <span className="text-brand-indigo inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Room {room}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {!loading && data && data.periods.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-3 gap-3 md:gap-4"
        >
          <StatTile
            icon={<CalendarDays className="w-4 h-4" />}
            label={isViewingToday ? 'Today' : DAY_FULL[selectedDay]}
            value={`${classesForSelectedDay} ${classesForSelectedDay === 1 ? 'class' : 'classes'}`}
            active={view === 'day'}
            onClick={() => {
              setView('day');
              setSelectedDay(today);
            }}
          />
          <StatTile
            icon={<Hourglass className="w-4 h-4" />}
            label="This week"
            value={`${totalWeekClasses}`}
            active={view === 'week'}
            onClick={() => setView('week')}
          />
          <StatTile
            icon={<GraduationCap className="w-4 h-4" />}
            label="Subjects"
            value={`${uniqueSubjectsCount}`}
          />
        </motion.div>
      )}

      {/* Body */}
      {loading ? (
        <SkeletonList rows={6} />
      ) : !classId ? (
        <div className="obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 py-20 text-center">
          <User className="w-10 h-10 text-text-secondary/60" />
          <p className="text-xs font-black uppercase tracking-widest text-text-secondary">
            Student profile not loaded
          </p>
        </div>
      ) : !data || data.periods.length === 0 ? (
        <div className="obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center">
            <Clock className="w-7 h-7 text-brand-indigo" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-lg font-black text-foreground">No timetable published yet</h3>
            <p className="text-sm text-text-secondary">
              Check back once your school sets up the schedule.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar: View toggle + Day pills */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between"
          >
            {/* Day pills (only relevant for day view) */}
            <div
              className={cn(
                'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none transition-opacity',
                view === 'week' && 'opacity-40 pointer-events-none',
              )}
            >
              {DAY_LABELS.map((label, idx) => {
                const active = idx === selectedDay;
                const isToday = idx === today;
                return (
                  <button
                    key={label}
                    onClick={() => setSelectedDay(idx)}
                    className={cn(
                      'shrink-0 relative w-[72px] py-3 rounded-2xl border transition-all duration-300 text-center',
                      active
                        ? 'bg-[var(--brand-indigo)] border-[var(--brand-indigo)] text-white shadow-[0_15px_30px_-10px_rgba(99,102,241,0.6)]'
                        : 'bg-foreground/[0.03] border-foreground/10 text-text-secondary hover:border-foreground/20 hover:text-foreground',
                    )}
                  >
                    <span className="block text-[11px] font-black uppercase tracking-widest">
                      {label}
                    </span>
                    {isToday && (
                      <span
                        className={cn(
                          'mx-auto mt-1.5 block w-1.5 h-1.5 rounded-full',
                          active ? 'bg-white' : 'bg-[var(--brand-indigo)]',
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* View toggle */}
            <div className="inline-flex p-1 rounded-2xl bg-foreground/[0.05] border border-foreground/10 self-start lg:self-auto">
              <ToggleBtn
                active={view === 'day'}
                onClick={() => setView('day')}
                icon={<ListOrdered className="w-3.5 h-3.5" />}
                label="Day"
              />
              <ToggleBtn
                active={view === 'week'}
                onClick={() => setView('week')}
                icon={<LayoutGrid className="w-3.5 h-3.5" />}
                label="Week"
              />
            </div>
          </motion.div>

          {/* DAY VIEW */}
          <AnimatePresence mode="wait">
            {view === 'day' && (
              <motion.div
                key="day"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="grid gap-3"
              >
                {dayItems.length === 0 ? (
                  <div className="obsidian-card py-16 text-center text-text-secondary text-sm">
                    No periods scheduled.
                  </div>
                ) : (
                  dayItems.map(({ period, slot }, idx) => {
                    const isCurrent = period.id === currentPeriodId;
                    if (period.period_type !== 'class_period') {
                      return (
                        <BreakRow
                          key={period.id}
                          period={period}
                          isCurrent={isCurrent}
                          delay={idx * 0.03}
                        />
                      );
                    }
                    return (
                      <PeriodRow
                        key={period.id}
                        period={period}
                        slot={slot}
                        room={room}
                        isCurrent={isCurrent}
                        delay={idx * 0.03}
                      />
                    );
                  })
                )}
              </motion.div>
            )}

            {/* WEEK VIEW */}
            {view === 'week' && (
              <motion.section
                key="week"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="obsidian-card overflow-hidden"
              >
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full border-collapse min-w-[920px]">
                    <thead>
                      <tr>
                        <th className="text-left px-4 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary w-[200px] sticky left-0 bg-white/95 z-10">
                          Period
                        </th>
                        {DAY_LABELS.map((day, idx) => {
                          const isToday = idx === today;
                          return (
                            <th
                              key={day}
                              className={cn(
                                'px-3 py-4 text-center transition-colors',
                                isToday && 'bg-brand-indigo/[0.08]',
                              )}
                            >
                              <div
                                className={cn(
                                  'inline-flex flex-col items-center gap-0.5',
                                  isToday ? 'text-brand-indigo' : 'text-text-secondary',
                                )}
                              >
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                  {day}
                                </span>
                                {isToday && (
                                  <span className="text-[8px] font-black tracking-widest uppercase opacity-80">
                                    Today
                                  </span>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPeriods.map((period) => {
                        if (period.period_type !== 'class_period') {
                          return (
                            <tr key={period.id} className="bg-amber-500/[0.04]">
                              <td className="px-4 py-3 border-t border-glass-border sticky left-0 bg-white/95 z-10">
                                <div className="flex items-center gap-2.5 text-amber-400">
                                  <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <PeriodIcon type={period.period_type} />
                                  </span>
                                  <div>
                                    <p className="text-[11px] font-black uppercase tracking-wider text-foreground">
                                      {period.name}
                                    </p>
                                    <p className="text-[9px] tabular-nums text-text-secondary">
                                      {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td
                                colSpan={7}
                                className="px-3 py-3 border-t border-glass-border text-center text-[10px] font-black uppercase tracking-[0.25em] text-amber-400/70 italic"
                              >
                                · · · {period.name} · · ·
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={period.id} className="group">
                            <td className="px-4 py-3 border-t border-glass-border align-top sticky left-0 bg-white/95 z-10">
                              <div className="flex items-center gap-2.5">
                                <span className="w-7 h-7 rounded-lg bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center text-brand-indigo">
                                  <BookOpen className="w-3.5 h-3.5" />
                                </span>
                                <div>
                                  <p className="text-[11px] font-black uppercase tracking-wider text-foreground">
                                    {period.name}
                                  </p>
                                  <p className="text-[9px] tabular-nums text-text-secondary">
                                    {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {DAY_LABELS.map((_, day) => {
                              const slot = slotByCoord.get(`${period.id}:${day}`);
                              const isToday = day === today;
                              const subj = slot?.subject?.name;
                              const hue = subj ? subjectHue(subj) : 0;

                              return (
                                <td
                                  key={day}
                                  className={cn(
                                    'border-t border-l border-glass-border p-2 align-top min-w-[120px] transition-colors',
                                    isToday && 'bg-brand-indigo/[0.05]',
                                  )}
                                >
                                  {subj ? (
                                    <div
                                      className="group/cell relative rounded-xl border h-full flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 cursor-default"
                                      style={{
                                        background: `linear-gradient(135deg, hsla(${hue}, 85%, 96%, 1) 0%, hsla(${hue}, 75%, 92%, 1) 100%)`,
                                        borderColor: `hsla(${hue}, 70%, 55%, 0.35)`,
                                        boxShadow: `0 1px 0 hsla(${hue}, 70%, 50%, 0.04), 0 6px 14px -8px hsla(${hue}, 70%, 50%, 0.25)`,
                                      }}
                                    >
                                      {/* Top accent bar */}
                                      <div
                                        aria-hidden
                                        className="h-1 w-full"
                                        style={{
                                          background: `linear-gradient(90deg, hsl(${hue}, 75%, 55%), hsl(${(hue + 30) % 360}, 75%, 60%))`,
                                        }}
                                      />
                                      <div className="px-2.5 py-2 flex flex-col gap-1.5 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-sm"
                                            style={{
                                              background: `linear-gradient(135deg, hsl(${hue}, 75%, 50%), hsl(${(hue + 30) % 360}, 75%, 55%))`,
                                            }}
                                          >
                                            {subj.charAt(0).toUpperCase()}
                                          </span>
                                          <p
                                            className="text-[11px] font-black truncate leading-tight"
                                            style={{ color: `hsl(${hue}, 75%, 32%)` }}
                                          >
                                            {subj}
                                          </p>
                                        </div>
                                        <p className="text-[9px] font-bold text-text-secondary truncate pl-0.5">
                                          {slot.teacher?.name || 'TBA'}
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="h-full min-h-[44px] flex items-center justify-center">
                                      <span className="text-text-secondary opacity-15 text-[11px]">—</span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function StatTile({
  icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Wrapper: any = interactive ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      type={interactive ? 'button' : undefined}
      className={cn(
        'obsidian-card px-4 py-4 md:px-5 md:py-5 flex items-center gap-3 text-left transition-all duration-300',
        interactive && 'cursor-pointer hover:border-brand-indigo/40 hover:-translate-y-0.5',
        active &&
          'border-brand-indigo/60 ring-2 ring-brand-indigo/30 shadow-[0_15px_30px_-15px_rgba(99,102,241,0.5)]',
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors',
          active
            ? 'bg-[var(--brand-indigo)] text-white border-[var(--brand-indigo)]'
            : 'bg-brand-indigo/10 border-brand-indigo/20 text-brand-indigo',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg md:text-xl font-black text-foreground leading-none truncate">
          {value}
        </p>
        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mt-1.5 truncate">
          {label}
        </p>
      </div>
    </Wrapper>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300',
        active
          ? 'bg-[var(--brand-indigo)] text-white shadow-[0_10px_25px_-8px_rgba(99,102,241,0.55)]'
          : 'text-text-secondary hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function BreakRow({
  period,
  isCurrent,
  delay,
}: {
  period: SchedulePeriod;
  isCurrent: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'relative flex items-center gap-4 px-4 py-3 rounded-2xl border transition-all duration-300',
        isCurrent
          ? 'bg-amber-500/[0.12] border-amber-400/40 shadow-[0_15px_30px_-15px_rgba(245,158,11,0.5)]'
          : 'bg-amber-500/[0.05] border-amber-500/20',
      )}
    >
      {isCurrent && <NowDot tone="amber" />}
      <div className="w-12 text-center shrink-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
          {formatTime(period.start_time)}
        </p>
        <p className="text-[9px] tabular-nums text-text-secondary mt-0.5">
          {formatTime(period.end_time)}
        </p>
      </div>
      <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
        <PeriodIcon type={period.period_type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-black uppercase tracking-widest text-foreground truncate">
          {period.name}
        </p>
        <p className="text-[10px] font-bold text-text-secondary mt-0.5">
          {period.period_type === 'lunch'
            ? 'Lunch break'
            : period.period_type === 'break'
            ? 'Short break'
            : period.period_type === 'assembly'
            ? 'Assembly'
            : 'Break period'}
        </p>
      </div>
    </motion.div>
  );
}

function PeriodRow({
  period,
  slot,
  room,
  isCurrent,
  delay,
}: {
  period: SchedulePeriod;
  slot?: TimetableSlot;
  room?: string | null;
  isCurrent: boolean;
  delay: number;
}) {
  const hasClass = !!slot?.subject;
  const hue = hasClass ? subjectHue(slot!.subject!.name) : 0;
  const accent = hasClass ? `hsl(${hue}, 70%, 42%)` : '';
  const accentSoft = hasClass ? `hsla(${hue}, 80%, 60%, 0.12)` : '';
  const accentBorder = hasClass ? `hsla(${hue}, 80%, 60%, 0.3)` : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'group relative obsidian-card flex items-stretch gap-0 overflow-hidden transition-all duration-300',
        isCurrent && 'ring-1 ring-brand-indigo/40 shadow-[0_25px_50px_-20px_rgba(99,102,241,0.5)]',
      )}
      style={{
        borderColor: hasClass && !isCurrent ? accentBorder : undefined,
      }}
    >
      {isCurrent && <NowDot tone="indigo" />}

      {/* Color accent rail */}
      {hasClass && (
        <div
          aria-hidden
          className="w-1.5 shrink-0"
          style={{
            background: `linear-gradient(180deg, ${accent}, hsl(${(hue + 40) % 360}, 80%, 60%))`,
          }}
        />
      )}

      {/* Time column */}
      <div className="flex flex-col items-center justify-center w-20 shrink-0 py-4 border-r border-glass-border">
        <p className="text-[12px] font-black text-foreground tabular-nums">
          {formatTime(period.start_time)}
        </p>
        <div className="my-1.5 w-px h-3 bg-white/15" />
        <p className="text-[10px] font-bold text-text-secondary tabular-nums">
          {formatTime(period.end_time)}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 flex items-center gap-4 min-w-0">
        {hasClass ? (
          <>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                background: accentSoft,
                borderColor: accentBorder,
                color: accent,
              }}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className="text-[15px] font-black truncate leading-tight"
                  style={{ color: accent }}
                >
                  {slot!.subject!.name}
                </h4>
                {isCurrent && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-brand-indigo/15 border border-brand-indigo/30 text-brand-indigo">
                    Now
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap mt-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-text-secondary">
                  <User className="w-3 h-3" />
                  {slot!.teacher?.name || 'Teacher TBA'}
                </span>
                <span className="text-text-secondary/40">·</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                  {period.name}
                </span>
              </div>
            </div>
            {(slot!.room || room) && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-text-secondary text-[10px] font-black uppercase tracking-widest">
                <MapPin className="w-3 h-3" />
                {slot!.room || room}
              </div>
            )}
            <ChevronRight className="w-4 h-4 text-text-secondary/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </>
        ) : (
          <>
            <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-text-secondary/60">
              <Hourglass className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-text-secondary italic leading-tight">
                Free Period
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary/60 mt-1">
                {period.name}
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function NowDot({ tone }: { tone: 'indigo' | 'amber' }) {
  const color = tone === 'indigo' ? '#6366f1' : '#f59e0b';
  return (
    <span
      aria-hidden
      className="absolute top-3 right-3 inline-flex h-2.5 w-2.5"
    >
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ background: color }}
      />
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ background: color }}
      />
    </span>
  );
}
