import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarRange, Clock, BookOpen, Sparkles, MapPin,
  User, LayoutGrid, UserCheck,
} from 'lucide-react';
import { timetableApi } from '@/features/timetable/api';
import type {
  TeacherTimetable as TeacherTimetableType,
  ClassTimetable as ClassTimetableType,
  SchedulePeriod,
  SchedulePeriodType,
} from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { SkeletonStatGrid, SkeletonTable } from '@/shared/components/ui/Skeleton';
import {
  DAY_LABELS,
  DAY_FULL,
  todayIndex,
  formatTime,
  periodIconFor,
  sortPeriods,
  buildSlotMap,
} from '@/features/timetable/lib';

function PeriodIcon({ type }: { type: SchedulePeriodType }) {
  // returns one of 4 stable lucide icon refs; aliasing isn't dynamic.
  const Icon = periodIconFor(type);
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className="w-3.5 h-3.5" />;
}

type View = 'mine' | 'class';

export default function TeacherTimetable() {
  const [data, setData] = useState<TeacherTimetableType | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('mine');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [classData, setClassData] = useState<ClassTimetableType | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const today = todayIndex();

  useEffect(() => {
    (async () => {
      try {
        const tt = await timetableApi.getMyTimetable();
        setData(tt);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Unique classes the teacher is assigned to (derived from their own slots).
  const assignedClasses = useMemo(() => {
    const map = new Map<number, { id: number; display_name: string; room_number?: string }>();
    (data?.slots ?? []).forEach((s) => {
      if (!s.school_class_id || map.has(s.school_class_id)) return;
      map.set(s.school_class_id, {
        id: s.school_class_id,
        display_name: s.school_class?.display_name || `Class ${s.school_class_id}`,
        room_number: s.school_class?.room_number,
      });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  }, [data]);

  // When switching to class view, auto-select the first assigned class.
  useEffect(() => {
    if (view === 'class' && selectedClassId == null && assignedClasses.length > 0) {
      setSelectedClassId(assignedClasses[0].id);
    }
  }, [view, selectedClassId, assignedClasses]);

  // Fetch the full class timetable when the selection changes.
  useEffect(() => {
    if (view !== 'class' || selectedClassId == null) return;
    setClassLoading(true);
    setClassData(null);
    (async () => {
      try {
        const ct = await timetableApi.getClassTimetable(selectedClassId);
        setClassData(ct);
      } catch (err) {
        console.error(err);
      } finally {
        setClassLoading(false);
      }
    })();
  }, [view, selectedClassId]);

  const sortedPeriods = useMemo(() => sortPeriods(data?.periods ?? []), [data]);
  const slotByCoord = useMemo(() => buildSlotMap(data?.slots ?? []), [data]);

  const classSortedPeriods = useMemo(
    () => sortPeriods(classData?.periods ?? []),
    [classData],
  );
  const classSlotByCoord = useMemo(
    () => buildSlotMap(classData?.slots ?? []),
    [classData],
  );

  const todaysSlots = useMemo(() => {
    if (!data) return [];
    return sortedPeriods
      .filter(p => p.period_type === 'class_period')
      .map(p => ({ period: p, slot: slotByCoord.get(`${p.id}:${today}`) }))
      .filter(x => x.slot);
  }, [sortedPeriods, slotByCoord, today, data]);

  return (
    <div className="w-full animate-fade-in flex flex-col gap-8 pb-20">
      {/* Header */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
          <CalendarRange className="w-3.5 h-3.5" /> My Timetable
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gradient-indigo">Schedule</h1>
        <p className="text-text-secondary text-base sm:text-lg font-medium max-w-2xl">
          {view === 'mine'
            ? 'Your complete weekly teaching schedule — today is highlighted.'
            : 'Full weekly timetable for one of your assigned classes.'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonStatGrid count={3} />
          <SkeletonTable rows={7} cols={8} />
        </div>
      ) : !data || data.periods.length === 0 ? (
        <div className="py-20 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-50">
          <Clock className="w-10 h-10" />
          <p className="text-xs font-black uppercase tracking-widest">No timetable available yet</p>
          <p className="text-[10px] text-text-secondary">Your administrator hasn't published the schedule.</p>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="inline-flex p-1 rounded-2xl bg-white/[0.03] border border-white/10 self-start">
              <ToggleBtn
                active={view === 'mine'}
                onClick={() => setView('mine')}
                icon={<UserCheck className="w-3.5 h-3.5" />}
                label="My Schedule"
              />
              <ToggleBtn
                active={view === 'class'}
                onClick={() => setView('class')}
                icon={<LayoutGrid className="w-3.5 h-3.5" />}
                label="Class Timetable"
              />
            </div>

            {/* Class picker (only in class view) */}
            {view === 'class' && assignedClasses.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                {assignedClasses.map((c) => {
                  const active = c.id === selectedClassId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClassId(c.id)}
                      className={cn(
                        'shrink-0 px-4 py-2 rounded-xl border transition-all duration-300 text-[11px] font-black uppercase tracking-widest',
                        active
                          ? 'bg-brand-indigo border-brand-indigo text-white shadow-[0_10px_25px_-8px_rgba(99,102,241,0.55)]'
                          : 'bg-foreground/[0.03] border-foreground/10 text-text-secondary hover:border-foreground/20 hover:text-foreground',
                      )}
                    >
                      {c.display_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {view === 'mine' ? (
              <motion.div
                key="mine"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-8"
              >
                {/* Today's quick view */}
                <section className="obsidian-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-brand-indigo" /> Today · {DAY_FULL[today]}
                    </h3>
                  </div>
                  {todaysSlots.length === 0 ? (
                    <p className="text-text-secondary text-sm py-6 text-center opacity-50">No classes scheduled today.</p>
                  ) : (
                    <div className="grid gap-3">
                      {todaysSlots.map(({ period, slot }) => (
                        <motion.div
                          key={period.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-4 p-4 rounded-xl bg-brand-indigo/[0.05] border border-brand-indigo/20"
                        >
                          <div className="w-12 text-center shrink-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-brand-indigo">
                              {formatTime(period.start_time)}
                            </p>
                            <p className="text-[8px] tabular-nums text-text-secondary">
                              {formatTime(period.end_time)}
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white text-sm uppercase">{slot!.subject?.name || 'Free'}</p>
                            <p className="text-[10px] font-bold text-text-secondary">
                              {slot!.school_class?.display_name || `Class ${slot!.school_class_id}`}
                            </p>
                          </div>
                          {(slot!.school_class?.room_number || slot!.room) && (
                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-indigo">
                              <MapPin className="w-3 h-3" /> {slot!.school_class?.room_number || slot!.room}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Full week grid — teacher's own subjects only */}
                <section className="obsidian-card overflow-x-auto p-2">
                  <table className="w-full border-collapse min-w-[900px]">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary w-[180px]">
                          Period
                        </th>
                        {DAY_LABELS.map((day, idx) => (
                          <th
                            key={day}
                            className={cn(
                              'px-3 py-3 text-[10px] font-black uppercase tracking-widest text-center transition-colors',
                              idx === today
                                ? 'text-amber-400 bg-amber-400/20 border-b-2 border-amber-400'
                                : 'text-text-secondary'
                            )}
                          >
                            {day}
                            {idx === today && (
                              <div className="text-[8px] text-amber-400 font-black">Today</div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPeriods.map((period: SchedulePeriod) => {
                        if (period.period_type !== 'class_period') {
                          return (
                            <tr key={period.id} className="bg-amber-500/[0.03]">
                              <td className="px-3 py-2 border-t border-glass-border">
                                <div className="flex items-center gap-2 text-amber-400/80">
                                  <PeriodIcon type={period.period_type} />
                                  <div>
                                    <p className="text-xs font-black uppercase tracking-wider">{period.name}</p>
                                    <p className="text-[9px] tabular-nums text-text-secondary">
                                      {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              {DAY_LABELS.map((_, day) => (
                                <td
                                  key={day}
                                  className={cn(
                                    'px-3 py-2 border-t border-l border-glass-border',
                                    day === today && 'bg-amber-400/10'
                                  )}
                                />
                              ))}
                            </tr>
                          );
                        }

                        return (
                          <tr key={period.id}>
                            <td className="px-3 py-3 border-t border-glass-border align-top">
                              <div className="flex items-center gap-2">
                                <BookOpen className="w-3.5 h-3.5 text-brand-indigo" />
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wider text-white">{period.name}</p>
                                  <p className="text-[9px] tabular-nums text-text-secondary">
                                    {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {DAY_LABELS.map((_, day) => {
                              const slot = slotByCoord.get(`${period.id}:${day}`);
                              const isToday = day === today;
                              return (
                                <td
                                  key={day}
                                  className={cn(
                                    'px-2 py-2 border-t border-l border-glass-border align-top min-w-[110px]',
                                    isToday ? 'bg-amber-400/10' : slot?.subject && 'bg-white/[0.02]'
                                  )}
                                >
                                  {slot?.subject ? (
                                    <div className="space-y-0.5">
                                      <p className="text-[11px] font-black text-white truncate">{slot.subject.name}</p>
                                      <p className="text-[9px] text-text-secondary truncate">
                                        {slot.school_class?.display_name || `Class ${slot.school_class_id}`}
                                      </p>
                                      {(slot.school_class?.room_number || slot.room) && (
                                        <p className="text-[8px] uppercase tracking-widest text-brand-indigo opacity-70">
                                          Rm {slot.school_class?.room_number || slot.room}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-text-secondary opacity-20 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="class"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col gap-6"
              >
                {assignedClasses.length === 0 ? (
                  <div className="py-20 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-60">
                    <User className="w-10 h-10" />
                    <p className="text-xs font-black uppercase tracking-widest">You are not assigned to any class</p>
                    <p className="text-[10px] text-text-secondary">Ask your administrator to assign you to a class.</p>
                  </div>
                ) : classLoading || !classData ? (
                  <div className="py-20 text-center text-text-secondary">Loading class timetable...</div>
                ) : classData.periods.length === 0 ? (
                  <div className="py-20 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-50">
                    <Clock className="w-10 h-10" />
                    <p className="text-xs font-black uppercase tracking-widest">No timetable published for this class</p>
                  </div>
                ) : (
                  <>
                    {/* Class header */}
                    <div className="obsidian-card p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center text-brand-indigo shrink-0">
                        <LayoutGrid className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Viewing class</p>
                        <h3 className="text-xl font-black text-white truncate">
                          {classData.school_class?.display_name || `Class ${classData.school_class_id}`}
                        </h3>
                      </div>
                      {classData.school_class?.room_number && (
                        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-text-secondary text-[10px] font-black uppercase tracking-widest">
                          <MapPin className="w-3.5 h-3.5" /> Room {classData.school_class.room_number}
                        </div>
                      )}
                    </div>

                    {/* Full class week grid — all subjects, with current teacher's cells highlighted */}
                    <section className="obsidian-card overflow-x-auto p-2">
                      <table className="w-full border-collapse min-w-[900px]">
                        <thead>
                          <tr>
                            <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary w-[180px]">
                              Period
                            </th>
                            {DAY_LABELS.map((day, idx) => (
                              <th
                                key={day}
                                className={cn(
                                  'px-3 py-3 text-[10px] font-black uppercase tracking-widest text-center transition-colors',
                                  idx === today
                                    ? 'text-amber-400 bg-amber-400/20 border-b-2 border-amber-400'
                                    : 'text-text-secondary'
                                )}
                              >
                                {day}
                                {idx === today && (
                                  <div className="text-[8px] text-amber-400 font-black">Today</div>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {classSortedPeriods.map((period: SchedulePeriod) => {
                            if (period.period_type !== 'class_period') {
                              return (
                                <tr key={period.id} className="bg-amber-500/[0.03]">
                                  <td className="px-3 py-2 border-t border-glass-border">
                                    <div className="flex items-center gap-2 text-amber-400/80">
                                      <PeriodIcon type={period.period_type} />
                                      <div>
                                        <p className="text-xs font-black uppercase tracking-wider">{period.name}</p>
                                        <p className="text-[9px] tabular-nums text-text-secondary">
                                          {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  {DAY_LABELS.map((_, day) => (
                                    <td
                                      key={day}
                                      className={cn(
                                        'px-3 py-2 border-t border-l border-glass-border',
                                        day === today && 'bg-amber-400/10'
                                      )}
                                    />
                                  ))}
                                </tr>
                              );
                            }

                            return (
                              <tr key={period.id}>
                                <td className="px-3 py-3 border-t border-glass-border align-top">
                                  <div className="flex items-center gap-2">
                                    <BookOpen className="w-3.5 h-3.5 text-brand-indigo" />
                                    <div>
                                      <p className="text-xs font-black uppercase tracking-wider text-white">{period.name}</p>
                                      <p className="text-[9px] tabular-nums text-text-secondary">
                                        {formatTime(period.start_time)} – {formatTime(period.end_time)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                {DAY_LABELS.map((_, day) => {
                                  const slot = classSlotByCoord.get(`${period.id}:${day}`);
                                  const isToday = day === today;
                                  // Highlight cells taught by the current teacher.
                                  const isMine = !!(slot && data && slot.teacher_id === data.teacher_id);
                                  return (
                                    <td
                                      key={day}
                                      className={cn(
                                        'px-2 py-2 border-t border-l border-glass-border align-top min-w-[110px]',
                                        isMine
                                          ? 'bg-brand-indigo/[0.18] ring-1 ring-inset ring-brand-indigo/40'
                                          : isToday
                                            ? 'bg-amber-400/10'
                                            : slot?.subject && 'bg-white/[0.02]',
                                      )}
                                    >
                                      {slot?.subject ? (
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-1">
                                            <p
                                              className={cn(
                                                'text-[11px] font-black truncate',
                                                isMine ? 'text-brand-indigo' : 'text-white',
                                              )}
                                            >
                                              {slot.subject.name}
                                            </p>
                                            {isMine && (
                                              <span className="text-[8px] font-black uppercase tracking-widest px-1 py-px rounded bg-brand-indigo/20 text-brand-indigo border border-brand-indigo/40 shrink-0">
                                                You
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[9px] text-text-secondary truncate">
                                            {slot.teacher?.name || 'TBA'}
                                          </p>
                                          {(slot.school_class?.room_number || slot.room) && (
                                            <p className="text-[8px] uppercase tracking-widest text-brand-indigo opacity-70">
                                              Rm {slot.school_class?.room_number || slot.room}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-text-secondary opacity-20 text-[10px]">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </section>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
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
          ? 'bg-brand-indigo text-white shadow-[0_10px_25px_-8px_rgba(99,102,241,0.55)]'
          : 'text-text-secondary hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
