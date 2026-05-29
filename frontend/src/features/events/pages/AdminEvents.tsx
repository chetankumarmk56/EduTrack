import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Plus, Clock, MapPin, Tag,
  Trash2, Bell, Check, Users as UsersIcon,
  Zap, CalendarDays, Star, Pencil, Loader2, AlertCircle,
} from 'lucide-react';
import { eventsApi } from '@/features/events/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import ModalShell, { ModalHeader, ModalBody, ModalFooter } from '@/shared/components/ui/ModalShell';
import { useToast } from '@/shared/components/ui/Toast';
import type { Event } from '@/shared/types';

// Admin-only fields that aren't on the shared Event type (visibility lives
// in the audience-targeting layer, category is admin-classification).
interface AdminEvent extends Event {
  category?: string;
  visibility?: { parents: boolean; teachers: boolean; students: boolean };
}

const EVENT_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'exam', label: 'Exam' },
  { value: 'sports', label: 'Sports' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'other', label: 'Other' },
];

export default function AdminEvents() {
  const { events, refreshDirectory } = useApp();
  const toast = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [filter, setFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<AdminEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', type: 'meeting',
    category: 'General', date: '', time: '',
    location: '', is_holiday: false,
    visibility: { parents: true, teachers: true, students: true }
  });

  useEffect(() => {
    refreshDirectory();
  }, []);

  const handleEdit = (event: AdminEvent) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description || '',
      type: event.type,
      category: event.category || 'General',
      date: event.date,
      time: event.time,
      location: event.location || '',
      is_holiday: !!event.is_holiday,
      visibility: event.visibility || { parents: true, teachers: true, students: true }
    });
    setIsAdding(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsAdding(false);
    setEditingEvent(null);
    setFormError(null);
    setForm({
      title: '', description: '', type: 'meeting',
      category: 'General', date: '', time: '',
      location: '', is_holiday: false,
      visibility: { parents: true, teachers: true, students: true }
    });
  };

  const visibilityCount = useMemo(
    () => Object.values(form.visibility).filter(Boolean).length,
    [form.visibility],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    // Cheap client-side checks so we don't fire a network request when
    // the obvious holes are right there in the form.
    if (!form.title.trim()) return setFormError('Event title is required.');
    if (!form.date) return setFormError('Pick an event date.');
    if (!form.time.trim()) return setFormError('Enter an event time.');
    if (visibilityCount === 0) {
      return setFormError('Make the event visible to at least one audience.');
    }

    setIsSubmitting(true);
    try {
      const payload = { ...form, title: form.title.trim() };
      const wasEditing = !!editingEvent;
      if (editingEvent) {
        await eventsApi.updateEvent(editingEvent.id, payload);
      } else {
        await eventsApi.createEvent(payload);
      }
      closeModal();
      await refreshDirectory(true);
      toast.success(
        wasEditing ? 'Event updated' : 'Event scheduled',
        payload.title,
      );
    } catch (err) {
      setFormError(getErrorMessage(err).message || 'Could not save the event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteEvent) return;
    const target = pendingDeleteEvent;
    setDeleting(true);
    try {
      await eventsApi.deleteEvent(target.id);
      setPendingDeleteEvent(null);
      await refreshDirectory(true);
      toast.success('Event removed', target.title);
    } catch (err) {
      toast.error('Could not remove event', getErrorMessage(err).message || 'Please try again.');
      setPendingDeleteEvent(null);
    } finally {
      setDeleting(false);
    }
  };

  const filteredEvents = filter === 'all'
    ? events
    : filter === 'holiday'
      ? events.filter((e) => e.is_holiday)
      : filter === 'working'
        ? events.filter((e) => !e.is_holiday)
        : events;

  const getEventIcon = (event: AdminEvent) => {
    if (event.is_holiday) return <Star className="w-5 h-5 text-amber-400" />;
    const type = (event.type || '').toLowerCase();
    if (type.includes('exam')) return <Zap className="w-5 h-5 text-indigo-400" />;
    if (type.includes('sport')) return <CalendarDays className="w-5 h-5 text-emerald-400" />;
    return <Bell className="w-5 h-5 text-blue-400" />;
  };

  return (
    <div className="w-full animate-fade-in flex flex-col gap-10">
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest">
            <Calendar className="w-3 h-3" /> Institutional Timeline
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gradient-indigo">Chronos Management</h1>
          <p className="text-text-secondary text-lg font-medium max-w-xl">
            Orchestrate school-wide events, non-teaching days, and academic milestones.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 border border-glass-border rounded-xl p-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'working', label: 'Working' },
              { key: 'holiday', label: 'Non-Teaching' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                  filter === f.key ? "bg-white/10 text-white shadow-lg" : "text-text-secondary hover:text-white"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="indigo-glow-button"
          >
            <Plus className="w-4 h-4" /> Schedule Event
          </button>
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((e) => (
            <motion.div
              layout
              key={e.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="obsidian-card group flex flex-col overflow-hidden hover:border-blue-500/30 transition-all"
            >
              <div className="p-8 flex flex-col gap-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-glass-border">
                      {getEventIcon(e)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">
                          {e.category || 'General'}
                        </span>
                        {e.is_holiday && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                            <Star className="w-2.5 h-2.5 fill-amber-400" /> Non-Teaching Day
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black tracking-tight leading-tight">{e.title}</h3>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEdit(e)}
                      className="p-3 rounded-xl bg-blue-500/5 text-blue-400 opacity-0 group-hover:opacity-100 transition-all border border-blue-500/10 hover:bg-blue-500/20"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setPendingDeleteEvent(e as AdminEvent)}
                      className="p-3 rounded-xl bg-rose-500/5 text-rose-500 opacity-0 group-hover:opacity-100 transition-all border border-rose-500/10 hover:bg-rose-500/20"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <p className="text-text-secondary text-sm font-medium line-clamp-2 leading-relaxed">
                  {e.description || 'No descriptive details provided for this event.'}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-white/50">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">{new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-3 text-white/50">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">{e.time}</span>
                  </div>
                </div>

                {e.location && (
                  <div className="flex items-center gap-3 text-white/50">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">{e.location}</span>
                  </div>
                )}
              </div>

              {/* Visibility Badges Footer */}
              <div className="mt-auto px-8 py-4 bg-white/[0.02] border-t border-glass-border flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['parents', 'teachers', 'students'].map(role => (
                    <div 
                      key={role}
                      title={role}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 border-obsidian flex items-center justify-center text-[8px] font-black uppercase",
                        e.visibility?.[role as 'parents' | 'teachers' | 'students'] ? "bg-emerald-500 text-white" : "bg-white/5 text-text-secondary"
                      )}
                    >
                      {role[0]}
                    </div>
                  ))}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Visibility Rights</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 && (
        <div className="py-40 obsidian-card border-dashed flex flex-col items-center justify-center gap-6 opacity-30">
          <CalendarDays className="w-20 h-20" />
          <h3 className="text-2xl font-black tracking-tight">Timeline is Vacant</h3>
        </div>
      )}

      {/* ── Add / Edit Event Modal ─────────────────────────────────── */}
      <ModalShell
        open={isAdding}
        onClose={closeModal}
        size="xl"
        locked={isSubmitting}
        labelledBy="event-modal-title"
      >
        <ModalHeader
          id="event-modal-title"
          icon={<Calendar className="w-4 h-4" />}
          title={editingEvent ? 'Edit event' : 'Schedule event'}
          subtitle={editingEvent
            ? 'Update the details of this event.'
            : 'Add a new milestone and choose who sees it.'}
          onClose={closeModal}
        />

        <ModalBody className="py-4">
          {formError && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="leading-snug">{formError}</span>
            </div>
          )}

          <form id="event-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3">
            {/* Title — full width */}
            <CompactField label="Title" required className="md:col-span-12">
              <input
                autoFocus
                placeholder="e.g. Annual sports day"
                className="input-modal"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
              />
            </CompactField>

            {/* Type, Category — same row on desktop */}
            <CompactField label="Type" className="md:col-span-4">
              <div className="relative">
                <select
                  className="input-modal capitalize"
                  value={EVENT_TYPES.some(t => t.value === form.type) ? form.type : 'other'}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                >
                  {EVENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <Tag className="w-3.5 h-3.5 text-text-secondary pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </CompactField>
            <CompactField label="Category" className="md:col-span-8">
              <input
                placeholder="e.g. General, Academics"
                className="input-modal"
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
              />
            </CompactField>

            {/* Description — full width, compact */}
            <CompactField label="Description" className="md:col-span-12">
              <textarea
                rows={2}
                placeholder="Optional — short note about what to expect."
                className="input-modal resize-none"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </CompactField>

            {/* Date, Time, Location — single row on desktop */}
            <CompactField label="Date" required className="md:col-span-4">
              <input
                type="date"
                className="input-modal"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
              />
            </CompactField>
            <CompactField label="Time" required className="md:col-span-3">
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                <input
                  type="text"
                  placeholder="02:45 PM"
                  className="input-modal pl-8"
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                  required
                />
              </div>
            </CompactField>
            <CompactField label="Location" className="md:col-span-5">
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                <input
                  placeholder="Auditorium / Zoom"
                  className="input-modal pl-8"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </CompactField>

            {/* Non-teaching toggle + audience pills share the same row */}
            <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-3 pt-1">
              <div className="md:col-span-5">
                <span className="block text-[11px] font-medium text-text-secondary mb-1">Schedule</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_holiday: !form.is_holiday })}
                  className={cn(
                    'w-full h-9 px-3 rounded-lg border transition-colors flex items-center justify-between gap-2 text-left',
                    form.is_holiday
                      ? 'bg-amber-500/10 border-amber-500/35 text-amber-600 dark:text-amber-400'
                      : 'border-glass-border text-text-secondary hover:bg-white/[0.03] dark:hover:bg-white/[0.03]',
                  )}
                  aria-pressed={form.is_holiday}
                >
                  <span className="inline-flex items-center gap-2 text-[12px] font-medium">
                    <Star className={cn('w-3.5 h-3.5', form.is_holiday && 'fill-current')} />
                    Non-teaching day
                  </span>
                  <span
                    role="switch"
                    aria-checked={form.is_holiday}
                    className={cn(
                      'relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors',
                      form.is_holiday ? 'bg-amber-500' : 'bg-text-secondary/30',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
                        form.is_holiday && 'translate-x-3',
                      )}
                    />
                  </span>
                </button>
              </div>

              <div className="md:col-span-7">
                <span className="block text-[11px] font-medium text-text-secondary mb-1 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon className="w-3 h-3" /> Visible to
                  </span>
                  <span className="text-text-secondary/70 normal-case tracking-normal">
                    {visibilityCount} of 3
                  </span>
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['parents', 'teachers', 'students'] as const).map(role => {
                    const active = form.visibility[role];
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            visibility: { ...form.visibility, [role]: !active },
                          })
                        }
                        className={cn(
                          'h-9 px-2.5 rounded-lg border text-[12px] font-medium capitalize transition-colors flex items-center justify-between gap-1.5',
                          active
                            ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                            : 'border-glass-border text-text-secondary hover:bg-white/[0.03] dark:hover:bg-white/[0.03]',
                        )}
                        aria-pressed={active}
                      >
                        <span>{role}</span>
                        {active ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded border border-current opacity-30" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </form>
        </ModalBody>

        <ModalFooter
          leading={
            <span className={cn(visibilityCount === 0 && 'text-rose-500 dark:text-rose-400')}>
              {visibilityCount === 0
                ? 'Pick at least one audience'
                : `Notifies ${visibilityCount} audience${visibilityCount > 1 ? 's' : ''}`}
            </span>
          }
        >
          <button
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            className="modal-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="event-form"
            disabled={isSubmitting}
            className={cn('modal-btn-primary', isSubmitting && 'opacity-60 cursor-wait')}
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {editingEvent ? 'Save changes' : 'Schedule event'}
          </button>
        </ModalFooter>
      </ModalShell>

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      <ConfirmModal
        open={!!pendingDeleteEvent}
        title="Remove this event?"
        confirmLabel="Remove event"
        tone="danger"
        isLoading={deleting}
        onConfirm={confirmDeleteEvent}
        onCancel={() => !deleting && setPendingDeleteEvent(null)}
        description="Parents, teachers, and students who could see this event will lose access to it. This cannot be undone."
      >
        {pendingDeleteEvent && (
          <div className="rounded-xl border border-glass-border bg-slate-900/[0.03] dark:bg-white/[0.02] p-3.5 text-xs space-y-1.5">
            <p className="font-black text-slate-900 dark:text-white text-sm">{pendingDeleteEvent.title}</p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-bold uppercase tracking-widest opacity-60">When</span> ·{' '}
              {new Date(pendingDeleteEvent.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{pendingDeleteEvent.time}
            </p>
            {pendingDeleteEvent.location && (
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-bold uppercase tracking-widest opacity-60">Where</span> · {pendingDeleteEvent.location}
              </p>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

/* ── Local form primitives ──────────────────────────────────────────── */

function CompactField({
  label, required, children, className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="block text-[11px] font-medium text-text-secondary">
        {label}
        {required && <span className="text-rose-500 dark:text-rose-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
