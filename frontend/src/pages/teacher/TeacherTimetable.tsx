import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Clock, BookOpen, Sparkles, MapPin } from 'lucide-react';
import { timetableApi } from '../../api/timetableApi';
import type { TeacherTimetable as TeacherTimetableType, SchedulePeriod, SchedulePeriodType } from '../../types';
import { cn } from '../../lib/utils';
import {
  DAY_LABELS,
  DAY_FULL,
  todayIndex,
  formatTime,
  periodIconFor,
  sortPeriods,
  buildSlotMap,
} from '../../lib/timetable';

function PeriodIcon({ type }: { type: SchedulePeriodType }) {
  const Icon = periodIconFor(type);
  return <Icon className="w-3.5 h-3.5" />;
}

export default function TeacherTimetable() {
  const [data, setData] = useState<TeacherTimetableType | null>(null);
  const [loading, setLoading] = useState(true);
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

  const sortedPeriods = useMemo(() => sortPeriods(data?.periods ?? []), [data]);
  const slotByCoord = useMemo(() => buildSlotMap(data?.slots ?? []), [data]);

  const todaysSlots = useMemo(() => {
    if (!data) return [];
    return sortedPeriods
      .filter(p => p.period_type === 'class_period')
      .map(p => ({ period: p, slot: slotByCoord.get(`${p.id}:${today}`) }))
      .filter(x => x.slot);
  }, [sortedPeriods, slotByCoord, today, data]);

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-8 pb-20">
      {/* Header */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
          <CalendarRange className="w-3.5 h-3.5" /> My Timetable
        </div>
        <h1 className="text-5xl font-black tracking-tight text-gradient-indigo">Schedule</h1>
        <p className="text-text-secondary text-lg font-medium max-w-2xl">
          Your complete weekly teaching schedule — today is highlighted.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-text-secondary">Loading...</div>
      ) : !data || data.periods.length === 0 ? (
        <div className="py-20 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-50">
          <Clock className="w-10 h-10" />
          <p className="text-xs font-black uppercase tracking-widest">No timetable available yet</p>
          <p className="text-[10px] text-text-secondary">Your administrator hasn't published the schedule.</p>
        </div>
      ) : (
        <>
          {/* Today's quick view */}
          <section className="obsidian-card p-6">
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

          {/* Full week grid */}
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
                          ? 'text-brand-indigo bg-brand-indigo/[0.08]'
                          : 'text-text-secondary'
                      )}
                    >
                      {day}
                      {idx === today && (
                        <div className="text-[8px] text-brand-indigo">Today</div>
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
                        <td colSpan={7} className="px-3 py-2 border-t border-glass-border text-center text-[10px] font-bold uppercase tracking-widest text-amber-500/60 italic">
                          — {period.name} —
                        </td>
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
                              isToday && 'bg-brand-indigo/[0.05]',
                              slot?.subject && !isToday && 'bg-white/[0.02]'
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
        </>
      )}
    </div>
  );
}
