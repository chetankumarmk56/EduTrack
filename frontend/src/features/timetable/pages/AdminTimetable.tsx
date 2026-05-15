import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, X, Pencil, Clock, CalendarRange, Users, MapPin, BookOpen,
} from 'lucide-react';
import { timetableApi } from '@/features/timetable/api';
import { academicApi } from '@/features/academics/api';
import type {
  SchedulePeriod, SchedulePeriodType, TimetableSlot, ClassTimetable,
} from '@/shared/types';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import {
  DAY_LABELS,
  formatTime,
  periodIconFor,
  sortPeriods,
  buildSlotMap,
} from '@/features/timetable/lib';

const PERIOD_TYPE_OPTIONS: { value: SchedulePeriodType; label: string }[] = [
  { value: 'class_period', label: 'Class Period' },
  { value: 'break', label: 'Break' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'assembly', label: 'Assembly' },
];

function PeriodIcon({ type }: { type: SchedulePeriodType }) {
  const Icon = periodIconFor(type);
  return <Icon className="w-3.5 h-3.5" />;
}

export default function AdminTimetable() {
  const { schoolClasses, subjects, teachers, refreshDirectory } = useApp();

  const [periods, setPeriods] = useState<SchedulePeriod[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [classTimetable, setClassTimetable] = useState<ClassTimetable | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- Period editor state
  const [isPeriodFormOpen, setIsPeriodFormOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchedulePeriod | null>(null);
  const [periodForm, setPeriodForm] = useState({
    name: '',
    period_type: 'class_period' as SchedulePeriodType,
    order: 0,
    start_time: '09:00',
    end_time: '09:45',
  });

  // ---- Slot editor modal state
  const [editingCell, setEditingCell] = useState<
    { period: SchedulePeriod; day: number; slot?: TimetableSlot } | null
  >(null);
  const [slotForm, setSlotForm] = useState<{
    subject_id: number | null;
    teacher_id: number | null;
  }>({ subject_id: null, teacher_id: null });

  // ---- Class-wide room state
  const [roomInput, setRoomInput] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

  useEffect(() => {
    refreshDirectory();
    loadPeriods();
  }, [refreshDirectory]);

  useEffect(() => {
    if (selectedClassId) {
      loadClassTimetable(selectedClassId);
    } else {
      setClassTimetable(null);
    }
  }, [selectedClassId]);

  const loadPeriods = async () => {
    try {
      const data = await timetableApi.getPeriods();
      setPeriods(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadClassTimetable = async (classId: number) => {
    setLoading(true);
    try {
      const data = await timetableApi.getClassTimetable(classId);
      setClassTimetable(data);
      setPeriods(data.periods); // keep in sync
      setRoomInput(data.school_class?.room_number || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRoom = async () => {
    if (!selectedClassId) return;
    setSavingRoom(true);
    try {
      await academicApi.updateSchoolClass(selectedClassId, {
        room_number: roomInput.trim() || undefined,
      });
      await refreshDirectory(true);
      await loadClassTimetable(selectedClassId);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRoom(false);
    }
  };

  // ---- Period handlers ----
  const openCreatePeriod = () => {
    setEditingPeriod(null);
    setPeriodForm({
      name: '',
      period_type: 'class_period',
      order: periods.length,
      start_time: '09:00',
      end_time: '09:45',
    });
    setIsPeriodFormOpen(true);
  };

  const openEditPeriod = (p: SchedulePeriod) => {
    setEditingPeriod(p);
    setPeriodForm({
      name: p.name,
      period_type: p.period_type,
      order: p.order,
      start_time: formatTime(p.start_time),
      end_time: formatTime(p.end_time),
    });
    setIsPeriodFormOpen(true);
  };

  const handlePeriodSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...periodForm,
        start_time: periodForm.start_time.length === 5
          ? `${periodForm.start_time}:00`
          : periodForm.start_time,
        end_time: periodForm.end_time.length === 5
          ? `${periodForm.end_time}:00`
          : periodForm.end_time,
      };
      if (editingPeriod) {
        await timetableApi.updatePeriod(editingPeriod.id, payload);
      } else {
        await timetableApi.createPeriod(payload);
      }
      setIsPeriodFormOpen(false);
      await loadPeriods();
      if (selectedClassId) await loadClassTimetable(selectedClassId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePeriod = async (id: number) => {
    if (!confirm('Delete this period? Any timetable slots using it will also be removed.')) return;
    try {
      await timetableApi.deletePeriod(id);
      await loadPeriods();
      if (selectedClassId) await loadClassTimetable(selectedClassId);
    } catch (err) {
      console.error(err);
    }
  };

  // ---- Slot handlers ----
  const openSlotEditor = (period: SchedulePeriod, day: number) => {
    if (period.period_type !== 'class_period') return;
    if (!selectedClassId) return;
    const existing = classTimetable?.slots.find(
      s => s.schedule_period_id === period.id && s.day_of_week === day
    );
    setEditingCell({ period, day, slot: existing });
    setSlotForm({
      subject_id: existing?.subject_id ?? null,
      teacher_id: existing?.teacher_id ?? null,
    });
  };

  const handleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell || !selectedClassId) return;
    try {
      await timetableApi.upsertSlot({
        school_class_id: selectedClassId,
        schedule_period_id: editingCell.period.id,
        day_of_week: editingCell.day,
        subject_id: slotForm.subject_id,
        teacher_id: slotForm.teacher_id,
      });
      setEditingCell(null);
      await loadClassTimetable(selectedClassId);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Could not save the slot.');
    }
  };

  const handleSlotClear = async () => {
    if (!editingCell?.slot) {
      setEditingCell(null);
      return;
    }
    try {
      await timetableApi.deleteSlot(editingCell.slot.id);
      setEditingCell(null);
      if (selectedClassId) await loadClassTimetable(selectedClassId);
    } catch (err) {
      console.error(err);
    }
  };

  // ---- Derived data ----
  const sortedPeriods = useMemo(() => sortPeriods(periods), [periods]);
  const slotByCoord = useMemo(
    () => buildSlotMap(classTimetable?.slots ?? []),
    [classTimetable],
  );

  // Filter teachers eligible for the (class, subject) selected in the slot modal.
  const eligibleTeachers = useMemo(() => {
    if (!selectedClassId || !slotForm.subject_id) {
      return teachers;
    }
    return teachers.filter(t =>
      t.assignments?.some(
        a =>
          (a.school_class_id ?? a.school_class?.id) === selectedClassId &&
          (a.subject_id ?? a.subject_ref?.id) === slotForm.subject_id
      )
    );
  }, [teachers, selectedClassId, slotForm.subject_id]);

  const activeClass = schoolClasses.find(c => c.id === selectedClassId);
  const sortedClasses = useMemo(
    () => [...schoolClasses].sort((a, b) =>
      (a.grade?.level || 0) - (b.grade?.level || 0) ||
      (a.section?.name || '').localeCompare(b.section?.name || '')
    ),
    [schoolClasses]
  );

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <CalendarRange className="w-3.5 h-3.5" /> Weekly Schedule
          </div>
          <h1 className="text-5xl font-black tracking-tight text-gradient-indigo">Timetable</h1>
          <p className="text-text-secondary text-lg font-medium max-w-2xl">
            Configure the institutional bell schedule once, then assemble each class's weekly timetable across all seven days.
          </p>
        </div>
      </div>

      {/* ---- Bell Schedule Section ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Bell Schedule (applies to every class)
          </h3>
          <button
            onClick={openCreatePeriod}
            className="p-2 rounded-xl bg-brand-indigo/10 text-brand-indigo hover:bg-brand-indigo/20 transition-all shadow-sm"
            title="Add period"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <AnimatePresence mode="popLayout">
            {sortedPeriods.map(p => (
              <motion.div
                layout
                key={p.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  'group obsidian-card px-4 py-3 flex items-center gap-3 border min-w-[180px]',
                  p.period_type === 'class_period'
                    ? 'border-glass-border'
                    : 'border-amber-500/20 bg-amber-500/[0.02]'
                )}
              >
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center',
                  p.period_type === 'class_period'
                    ? 'bg-brand-indigo/10 text-brand-indigo'
                    : 'bg-amber-500/10 text-amber-500'
                )}>
                  <PeriodIcon type={p.period_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-white truncate">{p.name}</p>
                  <p className="text-[10px] font-bold tabular-nums text-text-secondary">
                    {formatTime(p.start_time)} – {formatTime(p.end_time)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditPeriod(p)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-text-secondary hover:text-white"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePeriod(p.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-secondary hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {sortedPeriods.length === 0 && (
            <div className="w-full py-12 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-30">
              <Clock className="w-10 h-10" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No periods configured yet</p>
            </div>
          )}
        </div>

        {/* Period Form */}
        <AnimatePresence>
          {isPeriodFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setIsPeriodFormOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-xl"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-8 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
                    {editingPeriod ? 'Edit Period' : 'Add Period'}
                  </h2>
                  <button onClick={() => setIsPeriodFormOpen(false)}>
                    <X className="w-5 h-5 text-text-secondary" />
                  </button>
                </div>
                <form onSubmit={handlePeriodSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Name</label>
                    <input
                      autoFocus
                      placeholder="e.g. Period 1, Lunch"
                      className="input-obsidian text-sm"
                      value={periodForm.name}
                      onChange={e => setPeriodForm({ ...periodForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Type</label>
                    <select
                      className="input-obsidian text-sm"
                      value={periodForm.period_type}
                      onChange={e => setPeriodForm({ ...periodForm, period_type: e.target.value as SchedulePeriodType })}
                    >
                      {PERIOD_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Start</label>
                      <input
                        type="time"
                        className="input-obsidian text-sm"
                        value={periodForm.start_time}
                        onChange={e => setPeriodForm({ ...periodForm, start_time: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">End</label>
                      <input
                        type="time"
                        className="input-obsidian text-sm"
                        value={periodForm.end_time}
                        onChange={e => setPeriodForm({ ...periodForm, end_time: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Display Order</label>
                    <input
                      type="number"
                      className="input-obsidian text-sm"
                      value={periodForm.order}
                      onChange={e => setPeriodForm({ ...periodForm, order: Number(e.target.value) })}
                    />
                  </div>
                  <button type="submit" className="indigo-glow-button w-full py-3 text-[10px] font-black uppercase tracking-widest italic">
                    {editingPeriod ? 'Save Changes' : 'Create Period'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </section>

      {/* ---- Class Selector ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Select Class & Section
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {sortedClasses.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border',
                selectedClassId === c.id
                  ? 'bg-brand-indigo text-white border-brand-indigo shadow-lg'
                  : 'bg-white/[0.02] border-glass-border text-text-secondary hover:border-brand-indigo/30 hover:text-white'
              )}
            >
              {c.display_name || `${c.grade?.name || 'Class'} ${c.section?.name || ''}`}
            </button>
          ))}
          {sortedClasses.length === 0 && (
            <p className="text-text-secondary text-sm">No classes available — create classes & sections first in Academic Setup.</p>
          )}
        </div>
      </section>

      {/* ---- Timetable Grid ---- */}
      {selectedClassId && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between px-2 gap-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
              <CalendarRange className="w-3.5 h-3.5" /> Weekly Timetable —{' '}
              <span className="text-brand-indigo">
                {activeClass?.display_name || `${activeClass?.grade?.name || ''} ${activeClass?.section?.name || ''}`}
              </span>
            </h3>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-indigo" /> Room
              </label>
              <input
                placeholder="e.g. 203"
                className="input-obsidian text-sm py-2 w-32"
                value={roomInput}
                onChange={e => setRoomInput(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSaveRoom}
                disabled={savingRoom || roomInput === (activeClass?.room_number || '')}
                className={cn(
                  'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest italic transition-all',
                  savingRoom || roomInput === (activeClass?.room_number || '')
                    ? 'bg-white/5 text-text-secondary opacity-50 cursor-not-allowed'
                    : 'bg-brand-indigo/15 text-brand-indigo hover:bg-brand-indigo/25'
                )}
              >
                {savingRoom ? 'Saving…' : 'Save'}
              </button>
              {loading && <span className="text-[10px] text-text-secondary">Loading...</span>}
            </div>
          </div>

          {sortedPeriods.length === 0 ? (
            <div className="py-12 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 opacity-50">
              <Clock className="w-10 h-10" />
              <p className="text-xs font-black uppercase tracking-widest">Add at least one period to begin</p>
            </div>
          ) : (
            <div className="obsidian-card overflow-x-auto p-2">
              <table className="w-full border-collapse min-w-[900px]">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary w-[180px]">
                      Period
                    </th>
                    {DAY_LABELS.map((day, idx) => (
                      <th
                        key={day}
                        className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-text-secondary text-center"
                      >
                        {day}
                        <div className="text-[8px] opacity-50 font-bold">Day {idx + 1}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPeriods.map(period => {
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
                          return (
                            <td
                              key={day}
                              onClick={() => openSlotEditor(period, day)}
                              className={cn(
                                'px-2 py-2 border-t border-l border-glass-border align-top cursor-pointer transition-all min-w-[110px]',
                                slot?.subject
                                  ? 'bg-brand-indigo/[0.05] hover:bg-brand-indigo/[0.12]'
                                  : 'hover:bg-white/[0.04]'
                              )}
                            >
                              {slot?.subject ? (
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-black text-white truncate">{slot.subject.name}</p>
                                  <p className="text-[9px] text-text-secondary truncate">
                                    {slot.teacher?.name || 'No teacher'}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center text-text-secondary opacity-30 hover:opacity-100 py-3">
                                  <Plus className="w-4 h-4" />
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
          )}
        </section>
      )}

      {/* ---- Slot Editor Modal ---- */}
      <AnimatePresence>
        {editingCell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingCell(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-black italic uppercase tracking-tight text-white">
                    {editingCell.slot ? 'Edit Slot' : 'Assign Slot'}
                  </h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-indigo opacity-70">
                    {DAY_LABELS[editingCell.day]} · {editingCell.period.name} ({formatTime(editingCell.period.start_time)} – {formatTime(editingCell.period.end_time)})
                  </p>
                </div>
                <button onClick={() => setEditingCell(null)}>
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>
              <form onSubmit={handleSlotSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Subject</label>
                  <select
                    className="input-obsidian text-sm"
                    value={slotForm.subject_id ?? ''}
                    onChange={e => setSlotForm({
                      ...slotForm,
                      subject_id: e.target.value ? Number(e.target.value) : null,
                      teacher_id: null,
                    })}
                  >
                    <option value="">— Free period —</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Teacher</label>
                  <select
                    className="input-obsidian text-sm"
                    value={slotForm.teacher_id ?? ''}
                    onChange={e => setSlotForm({
                      ...slotForm,
                      teacher_id: e.target.value ? Number(e.target.value) : null,
                    })}
                    disabled={!slotForm.subject_id}
                  >
                    <option value="">— No teacher —</option>
                    {eligibleTeachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {slotForm.subject_id && eligibleTeachers.length === 0 && (
                    <p className="text-[10px] text-amber-500 mt-1">
                      No teacher is assigned to this subject for this class. Add an assignment in the Teacher Directory first.
                    </p>
                  )}
                </div>
                {activeClass?.room_number && (
                  <p className="text-[10px] text-text-secondary flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-brand-indigo" />
                    Room <span className="text-brand-indigo font-bold">{activeClass.room_number}</span> (set on the class)
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="indigo-glow-button flex-1 py-3 text-[10px] font-black uppercase tracking-widest italic">
                    Save Slot
                  </button>
                  {editingCell.slot && (
                    <button
                      type="button"
                      onClick={handleSlotClear}
                      className="px-4 py-3 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[10px] font-black uppercase tracking-widest italic"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
