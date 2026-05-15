import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Plus, Clock, MapPin, 
  Trash2, Bell, Check, X, ArrowRight,
  Zap, CalendarDays, Star, Pencil
} from 'lucide-react';
import { eventsApi } from '@/features/events/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';

export default function AdminEvents() {
  const { events, refreshDirectory } = useApp();
  const [isAdding, setIsAdding] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [filter, setFilter] = useState('all');
  
  const [form, setForm] = useState({
    title: '', description: '', type: 'meeting', 
    category: 'General', date: '', time: '', 
    location: '', 
    visibility: { parents: true, teachers: true, students: true }
  });

  useEffect(() => {
    refreshDirectory();
  }, []);

  const handleEdit = (event: any) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description || '',
      type: event.type,
      category: event.category || 'General',
      date: event.date,
      time: event.time,
      location: event.location || '',
      visibility: event.visibility || { parents: true, teachers: true, students: true }
    });
    setIsAdding(true);
  };

  const closeModal = () => {
    setIsAdding(false);
    setEditingEvent(null);
    setForm({
      title: '', description: '', type: 'meeting', 
      category: 'General', date: '', time: '', 
      location: '', 
      visibility: { parents: true, teachers: true, students: true }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEvent) {
        await eventsApi.updateEvent(editingEvent.id, form);
      } else {
        await eventsApi.createEvent(form);
      }
      closeModal();
      await refreshDirectory(true);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Erase this event from the timeline?')) return;
    try {
      await eventsApi.deleteEvent(id);
      await refreshDirectory(true);
    } catch (err) { console.error(err); }
  };

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.type === filter);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'holiday': return <Star className="w-5 h-5 text-amber-400" />;
      case 'exam': return <Zap className="w-5 h-5 text-indigo-400" />;
      case 'sports': return <CalendarDays className="w-5 h-5 text-emerald-400" />;
      default: return <Bell className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-10">
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest">
            <Calendar className="w-3 h-3" /> Institutional Timeline
          </div>
          <h1 className="text-5xl font-black tracking-tight text-gradient-indigo">Chronos Management</h1>
          <p className="text-text-secondary text-lg font-medium max-w-xl">
            Orchestrate school-wide events, holidays, and academic milestones.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 border border-glass-border rounded-xl p-1">
            {['all', 'meeting', 'holiday', 'exam'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                  filter === f ? "bg-white/10 text-white shadow-lg" : "text-text-secondary hover:text-white"
                )}
              >
                {f}
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
          {filteredEvents.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((e: any) => (
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
                      {getEventIcon(e.type)}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 block mb-1">
                        {e.category || 'General'}
                      </span>
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
                      onClick={() => handleDelete(e.id)}
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
                        e.visibility?.[role] ? "bg-emerald-500 text-white" : "bg-white/5 text-text-secondary"
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

      {/* Scheduler Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/95 backdrop-blur-3xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }} className="relative w-full max-w-2xl obsidian-card border-blue-500/30 p-10 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                  <h2 className="text-4xl font-black tracking-tight italic">{editingEvent ? 'Edit Milestone' : 'Institutional Scheduler'}</h2>
                  <p className="text-text-secondary font-medium">{editingEvent ? 'Refine institutional event specifications.' : 'Calibrate institutional milestones and role-based visibility.'}</p>
                </div>
                <button onClick={closeModal} className="p-3 rounded-xl hover:bg-white/5 transition-all"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-4">Event Headline</label>
                    <input autoFocus placeholder="e.g. Annual Scholastic Symposium" className="input-obsidian" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-4">Primary Type</label>
                    <select className="input-obsidian" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                      <option value="meeting">Institutional Meeting</option>
                      <option value="holiday">Academic Holiday</option>
                      <option value="exam">Examination Phase</option>
                      <option value="sports">Athletic Event</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-4">Start Sequence (Date)</label>
                    <input type="date" className="input-obsidian" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-4">Temporal Alignment (Time)</label>
                    <input type="text" placeholder="e.g. 02:45 PM" className="input-obsidian" value={form.time} onChange={e => setForm({...form, time: e.target.value})} required />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-4">Spatial Coordinate (Location)</label>
                    <input placeholder="Auditorium / Zoom / etc." className="input-obsidian" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                  </div>

                  <div className="md:col-span-2 space-y-4 pt-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-text-secondary ml-2">Channel Visibility</h4>
                    <div className="flex gap-4">
                      {['parents', 'teachers', 'students'].map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setForm({...form, visibility: {...form.visibility, [role]: !form.visibility[role as keyof typeof form.visibility]}})}
                          className={cn(
                            "flex-1 p-4 rounded-2xl border transition-all flex items-center justify-between group/v",
                            form.visibility[role as keyof typeof form.visibility] 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                              : "bg-white/5 border-glass-border text-text-secondary"
                          )}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">{role}</span>
                          {form.visibility[role as keyof typeof form.visibility] ? <Check className="w-4 h-4" /> : <X className="w-4 h-4 opacity-30 group-hover/v:opacity-100" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button type="submit" className="indigo-glow-button w-full py-5 text-sm tracking-widest uppercase mt-4">
                  {editingEvent ? 'Synchronize Updates' : 'Commence Synchronization'} <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
