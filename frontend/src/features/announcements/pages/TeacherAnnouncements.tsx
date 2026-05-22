import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Plus, Send, Trash2, X,
  Users, User, Info, Sparkles,
  FileText, ImageIcon, Film, File,
  Loader2, AlertCircle, RefreshCw,
  Paperclip, CheckCircle2, Clock,
  Search, CalendarDays, Filter, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { announcementApi, type AnnouncementCreate, type Announcement } from '@/features/announcements/api';
import { cn } from '@/shared/lib/utils';
import { SkeletonList } from '@/shared/components/ui/Skeleton';

const PRIORITY_STYLES: Record<string, { bar: string; badge: string }> = {
  IMPORTANT: { bar: 'bg-rose-500', badge: 'bg-rose-500/10 border-rose-500/30 text-rose-400' },
  NORMAL:    { bar: 'bg-brand-indigo/40', badge: 'bg-white/5 border-white/10 text-text-secondary' },
};


function AttachmentIcon({ url }: { url: string }) {
  const type = announcementApi.getAttachmentType(url);
  const icons = { image: ImageIcon, pdf: FileText, doc: File, video: Film, other: Paperclip };
  const Icon = icons[type];
  return <Icon className="w-4 h-4" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TeacherAnnouncements() {
  const { user } = useAuth();
  const { teacherDirectory, students } = useApp() as any;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [isAdding, setIsAdding]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading]   = useState(false);

  const [form, setForm] = useState<AnnouncementCreate>({
    title: '', message: '', type: 'CLASS', priority: 'NORMAL',
    class_id: undefined, student_id: undefined, attachment_url: undefined,
  });


  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & filter state
  const [search, setSearch]               = useState('');
  const [filterDate, setFilterDate]       = useState('');
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'NORMAL' | 'IMPORTANT'>('ALL');
  const [filterType, setFilterType]       = useState<'ALL' | 'CLASS' | 'STUDENT'>('ALL');

  const isFiltering = search || filterDate || filterPriority !== 'ALL' || filterType !== 'ALL';

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return announcements.filter(a => {
      if (q && !a.title.toLowerCase().includes(q) && !a.message.toLowerCase().includes(q)) return false;
      if (filterDate && !a.created_at.startsWith(filterDate)) return false;
      if (filterPriority !== 'ALL' && a.priority !== filterPriority) return false;
      if (filterType !== 'ALL' && a.type !== filterType) return false;
      return true;
    });
  }, [announcements, search, filterDate, filterPriority, filterType]);

  const clearFilters = () => { setSearch(''); setFilterDate(''); setFilterPriority('ALL'); setFilterType('ALL'); };

  // Resolve teacher from directory
  const currentTeacher = teacherDirectory?.find((t: any) => t.user_id === user?.id);
  const teacherId       = currentTeacher?.id;
  const assignments     = currentTeacher?.assignments || [];

  // API serialises the class under `school_class` (TeacherAssignmentResponse).
  // The frontend type calls it `classroom`, so support both + the bare `school_class_id` fallback.
  const getClassId = (a: any): number | undefined =>
    a.school_class?.id ?? a.classroom?.id ?? a.school_class_id;
  const getClassName = (a: any): string =>
    a.school_class?.display_name ?? a.classroom?.display_name ?? `Class #${getClassId(a)}`;

  // Unique classes this teacher is assigned to
  const assignedClasses = assignments.reduce((acc: any[], a: any) => {
    const id = getClassId(a);
    if (id && !acc.find((x: any) => getClassId(x) === id)) acc.push(a);
    return acc;
  }, []);

  // Students in assigned classes
  const assignedClassIds = assignedClasses.map((a: any) => getClassId(a)).filter(Boolean);
  const availableStudents = (students || []).filter((s: any) =>
    assignedClassIds.includes(s.school_class_id)
  );

  const fetchAnnouncements = async () => {
    if (!teacherId) { setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const data = await announcementApi.getTeacherAnnouncements(teacherId);
      setAnnouncements(data);
    } catch {
      setError('Could not load announcements. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, [teacherId]);

  const resetForm = () => {
    setForm({ title: '', message: '', type: 'CLASS', priority: 'NORMAL',
      class_id: undefined, student_id: undefined, attachment_url: undefined });


    setUploadedFileName(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (form.type === 'CLASS' && !form.class_id) {
      setFormError('Please select a target class.'); return;
    }
    if (form.type === 'STUDENT' && !form.student_id) {
      setFormError('Please select a target student.'); return;
    }


    setIsSubmitting(true);
    try {
      await announcementApi.createAnnouncement(form);
      setIsAdding(false);
      resetForm();
      fetchAnnouncements();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'Failed to send announcement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (file.size > 25 * 1024 * 1024) {
      setFormError('File too large. Maximum size is 25 MB.'); return;
    }

    setIsUploading(true);
    setFormError(null);
    try {
      const { url } = await announcementApi.uploadAttachment(file);
      setForm(prev => ({ ...prev, attachment_url: url }));
      setUploadedFileName(file.name);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement? This cannot be undone.')) return;
    try {
      await announcementApi.deleteAnnouncement(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch {
      alert('Failed to delete. Please try again.');
    }
  };

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-6 sm:gap-12 pb-24">

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 sm:gap-10">
        <div className="space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Megaphone className="w-3.5 h-3.5" /> Faculty Announcements
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white -ml-0.5">
            Announcements
          </h1>
          <p className="text-text-secondary text-base font-medium max-w-xl leading-relaxed">
            Send updates to your classes or individual students. They appear instantly in the parent portal.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setIsAdding(true); }}
          className="indigo-glow-button h-[56px] px-8 text-sm font-black uppercase tracking-widest flex items-center gap-3 group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          New Announcement
        </button>
      </div>

      {/* Stats Bar */}
      {!isLoading && announcements.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: 'Total Sent', value: announcements.length, color: 'text-brand-indigo' },
            { label: 'Class-Wide', value: announcements.filter(a => a.type === 'CLASS').length, color: 'text-emerald-400' },
            { label: 'Individual', value: announcements.filter(a => a.type === 'STUDENT').length, color: 'text-amber-400' },

          ].map(({ label, value, color }) => (
            <div key={label} className="obsidian-card p-6 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">{label}</p>
              <p className={cn('text-4xl font-black', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter Bar */}
      {!isLoading && !error && announcements.length > 0 && (
        <div className="obsidian-card p-5 flex flex-col gap-4">
          {/* Top row: text search + date + clear */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary opacity-50 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by title or message..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-obsidian h-12 pl-11 w-full"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary opacity-50 hover:opacity-100 transition-opacity">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary opacity-50 pointer-events-none" />
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="input-obsidian h-12 pl-11 w-full sm:w-48 [color-scheme:dark]"
              />
            </div>

            {isFiltering && (
              <button
                onClick={clearFilters}
                className="h-12 px-5 rounded-2xl bg-white/5 border border-white/10 text-text-secondary text-xs font-black uppercase tracking-widest hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 transition-all flex items-center gap-2 shrink-0"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Bottom row: pill filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-text-secondary opacity-40" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-40">Priority</span>
            </div>
            {(['ALL', 'NORMAL', 'IMPORTANT'] as const).map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={cn(
                  'px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
                  filterPriority === p
                    ? p === 'IMPORTANT' ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                      : p === 'NORMAL'  ? 'bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo'
                      : 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/5 border-white/5 text-text-secondary hover:bg-white/10'
                )}
              >{p === 'ALL' ? 'All' : p === 'NORMAL' ? 'Normal' : 'Important'}</button>
            ))}

            <div className="w-px bg-white/10 mx-1" />

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-40">Type</span>
            </div>
            {(['ALL', 'CLASS', 'STUDENT'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  'px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5',
                  filterType === t
                    ? 'bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo'
                    : 'bg-white/5 border-white/5 text-text-secondary hover:bg-white/10'
                )}
              >
                {t === 'CLASS' && <Users className="w-3 h-3" />}
                {t === 'STUDENT' && <User className="w-3 h-3" />}
                {t === 'ALL' ? 'All' : t === 'CLASS' ? 'Class-Wide' : 'Individual'}
              </button>
            ))}

            {isFiltering && (
              <span className="ml-auto text-[10px] font-black text-text-secondary opacity-50 self-center">
                {filtered.length} of {announcements.length} shown
              </span>
            )}
          </div>
        </div>
      )}

      {/* Announcement List */}
      <div className="flex flex-col gap-6">
        {error ? (
          <div className="p-10 sm:p-20 rounded-2xl sm:rounded-[3rem] bg-rose-500/5 border border-rose-500/20 flex flex-col items-center justify-center text-center gap-6">
            <AlertCircle className="w-12 h-12 text-rose-500" />
            <p className="text-white font-bold">{error}</p>
            <button onClick={fetchAnnouncements} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-brand-indigo text-white font-black text-xs uppercase tracking-widest">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : isLoading ? (
          <SkeletonList rows={5} />
        ) : announcements.length === 0 ? (
          <div className="py-16 sm:py-32 flex flex-col items-center justify-center obsidian-card border-dashed border-white/10 opacity-50">
            <Megaphone className="w-16 h-16 mb-6 text-brand-indigo/40" />
            <p className="text-lg font-black uppercase tracking-widest">No Announcements Yet</p>
            <p className="text-sm text-text-secondary mt-2">Create your first announcement to reach parents instantly.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center obsidian-card border-dashed border-white/10 opacity-60 gap-4">
            <Search className="w-12 h-12 text-text-secondary opacity-30" />
            <p className="text-base font-black uppercase tracking-widest">No Matches Found</p>
            <p className="text-sm text-text-secondary">Try adjusting your search or filters.</p>
            <button onClick={clearFilters} className="mt-2 px-5 py-2 rounded-xl bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-xs font-black uppercase tracking-widest hover:bg-brand-indigo/20 transition-all">
              Clear Filters
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((a) => {
              const style = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.NORMAL;
              const isImportant = a.priority === 'IMPORTANT';
              return (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    'obsidian-card group relative p-8 flex gap-6 items-start border transition-all duration-300 overflow-hidden',
                    isImportant
                      ? 'border-rose-500/30 hover:border-rose-500/50'
                      : 'border-white/5 hover:border-brand-indigo/30',
                  )}
                >
                  <div className={cn('absolute top-0 left-0 w-full h-1 transition-opacity opacity-50 group-hover:opacity-100', style.bar)} />

                  {/* Type icon */}
                  <div className={cn(
                    'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                    isImportant ? 'bg-rose-500/10 text-rose-400' : 'bg-white/5 text-brand-indigo',
                  )}>
                    {a.type === 'CLASS' ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                  </div>


                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      {isImportant && (
                        <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border', style.badge)}>
                          <AlertTriangle className="w-3 h-3" /> Important
                        </span>
                      )}
                      <span className="text-[9px] font-bold uppercase tracking-widest text-text-secondary opacity-50">
                        {a.type === 'CLASS' ? 'Class-Wide' : 'Individual'}
                      </span>

                      <span className="text-[9px] text-text-secondary opacity-40 flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" /> {formatDate(a.created_at)}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-white group-hover:text-brand-indigo transition-colors truncate">{a.title}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{a.message}</p>

                    {a.attachment_url && (
                      <a
                        href={announcementApi.getAttachmentUrl(a.attachment_url)}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest hover:bg-brand-indigo/20 transition-all"
                      >
                        <AttachmentIcon url={a.attachment_url} /> View Attachment
                      </a>
                    )}

                    <div className="flex items-center gap-4 pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {a.read_count ?? 0} / {a.target_count ?? 0} parents read
                      </div>
                      {(a.target_count ?? 0) > 0 && (
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, ((a.read_count ?? 0) / (a.target_count ?? 1)) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 opacity-40 hover:opacity-100 transition-all shrink-0"
                    title="Delete announcement"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Creation Modal — portalled to document.body so it escapes any
          ancestor `transform` (PageWrapper's framer-motion animation creates
          a containing block that breaks position:fixed otherwise). */}
      {createPortal(
        <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl obsidian-card border border-brand-indigo/30 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="absolute top-0 left-0 w-full h-1 aurora-gradient" />

              <div className="p-8 space-y-8">
                {/* Modal Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-brand-indigo text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" /> New Announcement
                    </div>
                    <h2 className="text-3xl font-black tracking-tight mt-1">Send to Parents</h2>
                  </div>
                  <button onClick={() => setIsAdding(false)} className="p-3 hover:bg-white/5 rounded-2xl border border-white/10 transition-colors">
                    <X className="w-6 h-6 opacity-50 hover:opacity-100" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Title */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
                      <Info className="w-3.5 h-3.5" /> Title
                    </label>
                    <input
                      autoFocus
                      placeholder="e.g. Parent-Teacher Meeting on Friday"
                      className="input-obsidian h-14"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      required
                    />
                  </div>

                  {/* Scope */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Scope</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['class', 'student'] as const).map(t => (
                        <button
                          key={t} type="button"
                          onClick={() => setForm({ ...form, type: t.toUpperCase() as AnnouncementCreate['type'], class_id: undefined, student_id: undefined })}

                          className={cn(
                            'h-14 rounded-2xl border flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all',
                            form.type === t.toUpperCase()
                              ? 'bg-brand-indigo/10 border-brand-indigo text-brand-indigo shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                              : 'bg-white/5 border-white/10 text-text-secondary hover:bg-white/10'
                          )}
                        >
                          {t === 'class' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                          {t === 'class' ? 'Whole Class' : 'Individual Student'}
                        </button>

                      ))}
                    </div>
                  </div>

                  {/* Target Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                      {form.type === 'CLASS' ? 'Target Class' : 'Target Student'}
                    </label>
                    {form.type === 'CLASS' ? (

                      <select
                        className="input-obsidian h-14"
                        value={form.class_id || ''}
                        onChange={e => setForm({ ...form, class_id: Number(e.target.value) })}
                        required
                      >
                        <option value="">Select a class...</option>
                        {assignedClasses.map((a: any) => (
                          <option key={getClassId(a)} value={getClassId(a)}>
                            {getClassName(a)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="input-obsidian h-14"
                        value={form.student_id || ''}
                        onChange={e => setForm({ ...form, student_id: Number(e.target.value) })}
                        required
                      >
                        <option value="">Select a student...</option>
                        {availableStudents.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.school_class?.display_name ? ` (${s.school_class.display_name})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Importance — defaults to Normal; teacher opts in to Important */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Importance</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.priority === 'IMPORTANT'}
                      onClick={() => setForm({
                        ...form,
                        priority: form.priority === 'IMPORTANT' ? 'NORMAL' : 'IMPORTANT',
                      })}
                      className={cn(
                        'w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all',
                        form.priority === 'IMPORTANT'
                          ? 'bg-rose-500/10 border-rose-500/40'
                          : 'bg-white/5 border-white/10 hover:border-white/20',
                      )}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                          form.priority === 'IMPORTANT'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-white/5 text-text-secondary',
                        )}>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={cn(
                            'text-sm font-black',
                            form.priority === 'IMPORTANT' ? 'text-rose-400' : 'text-white',
                          )}>
                            Mark as Important
                          </p>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            Highlighted in red for parents. Use sparingly.
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        'relative w-11 h-6 rounded-full transition-colors shrink-0',
                        form.priority === 'IMPORTANT' ? 'bg-rose-500' : 'bg-white/15',
                      )}>
                        <div className={cn(
                          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                          form.priority === 'IMPORTANT' ? 'translate-x-5' : 'translate-x-0.5',
                        )} />
                      </div>
                    </button>
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Message</label>
                    <textarea
                      placeholder="Type your announcement here..."
                      className="input-obsidian min-h-[130px] py-4 leading-relaxed resize-none"
                      value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })}
                      required
                    />
                    <p className="text-right text-[10px] text-text-secondary opacity-40">{form.message.length} chars</p>
                  </div>

                  {/* Attachment */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5" /> Attachment (optional)
                    </label>
                    {uploadedFileName ? (
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-3 text-emerald-400">
                          <FileText className="w-5 h-5" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Attached</p>
                            <p className="text-sm font-bold truncate max-w-[250px]">{uploadedFileName}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setForm(p => ({ ...p, attachment_url: undefined })); setUploadedFileName(null); }}
                          className="p-2 hover:bg-rose-500/20 rounded-lg transition-colors text-rose-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-3 h-16 rounded-2xl border-2 border-dashed border-white/10 hover:border-brand-indigo/40 hover:bg-brand-indigo/5 transition-all cursor-pointer text-text-secondary hover:text-brand-indigo">
                        {isUploading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm font-bold">Uploading...</span></>
                          : <><Paperclip className="w-5 h-5" /><span className="text-sm font-bold">Click to attach file</span><span className="text-xs opacity-50">(PDF, image, doc, video — max 25MB)</span></>
                        }
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleFileUpload}
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp4,.mov,.avi,.mp3"
                          disabled={isUploading}
                        />
                      </label>
                    )}
                  </div>

                  {/* Error */}
                  {formError && (
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      {formError}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploading}
                    className="indigo-glow-button w-full h-16 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</>
                      : <><Send className="w-5 h-5" /> Send Announcement</>
                    }
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
