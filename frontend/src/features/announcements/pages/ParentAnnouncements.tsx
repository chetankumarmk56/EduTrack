import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, User, Users,
  Sparkles, Inbox,
  Bookmark, CheckCircle2, Paperclip,
  RefreshCw, AlertCircle, FileText,
  File, X, Download, Eye, Search,
  Filter, AlertTriangle, MailOpen, Bell,
} from 'lucide-react';

import { announcementApi, type Announcement, type HomeworkChildStatus } from '@/features/announcements/api';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';
import { SkeletonHeader, SkeletonList } from '@/shared/components/ui/Skeleton';
import { CategoryBadge } from '@/features/announcements/components/CategoryBadge';
import { HomeworkConfirmPanel } from '@/features/announcements/components/HomeworkConfirmPanel';
import { BookOpenCheck } from 'lucide-react';

type Priority = 'IMPORTANT' | 'NORMAL';
type Scope = 'CLASS' | 'STUDENT';
type FilterKey = 'all' | 'unread' | 'important' | 'personal' | 'class' | 'homework';

const PRIORITY_THEMES: Record<Priority, {
  border: string; bg: string; text: string; solid: string; rail: string; chip: string;
}> = {
  IMPORTANT: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/8',
    text: 'text-rose-500',
    solid: 'bg-rose-500',
    rail: 'from-rose-500 to-rose-400',
    chip: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  },
  NORMAL: {
    border: 'border-primary/20',
    bg: 'bg-primary/8',
    text: 'text-primary',
    solid: 'bg-[hsl(var(--primary))]',
    rail: 'from-primary to-indigo-400',
    chip: 'bg-primary/10 text-primary border-primary/20',
  },
};

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Human-friendly relative time: "2m ago", "3h ago", "Yesterday", "5d ago", or absolute date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Bucket announcements into Today / Yesterday / This week / Earlier. */
function dateBucket(iso: string): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ms = d.getTime();
  if (ms >= startOfToday) return 'Today';
  if (ms >= startOfToday - 86_400_000) return 'Yesterday';
  if (ms >= startOfToday - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

const BUCKET_ORDER: Array<'Today' | 'Yesterday' | 'This week' | 'Earlier'> = [
  'Today', 'Yesterday', 'This week', 'Earlier',
];

function AttachmentPreview({ url, onPreview }: { url: string, onPreview: (url: string, type: string) => void }) {
  const type = announcementApi.getAttachmentType(url);
  const fullUrl = announcementApi.getAttachmentUrl(url);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = announcementApi.getDownloadUrl(url);
  };

  const isImage = type === 'image';
  const isPdf = type === 'pdf';

  return (
    <div className="mt-4 group/attachment relative">
      <div className={cn(
        "rounded-2xl border bg-white/50 backdrop-blur-sm overflow-hidden transition-all duration-500",
        "group-hover/attachment:shadow-xl group-hover/attachment:border-primary/30"
      )}>
        {isImage ? (
          <div onClick={() => onPreview(fullUrl, 'image')} className="cursor-pointer overflow-hidden max-h-[250px] relative">
            <img src={fullUrl} alt="Attachment" className="w-full object-cover transition-transform duration-700 group-hover/attachment:scale-110" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/attachment:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <div className="px-5 py-2 rounded-full bg-white text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Eye className="w-4 h-4" /> Preview
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                isPdf ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
              )}>
                {isPdf ? <FileText className="w-6 h-6" /> : <File className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isPdf ? 'PDF Document' : 'Attachment'}</p>
                <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{url.split('/').pop()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onPreview(fullUrl, type)} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-all">
                <Eye className="w-4 h-4" />
              </button>
              <button onClick={handleDownload} className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-dark transition-all">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilePreviewModal({ url, type, onClose }: { url: string, type: string, onClose: () => void }) {
  // Try to fetch into a same-origin blob URL so the viewer keeps working
  // even if the source serves headers that block embedding. We always
  // fall back to the direct URL if the fetch fails (presigned S3 URLs
  // are typically blocked by CORS for fetch() but render fine in an
  // iframe/img), so the preview never shows a broken state.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let currentUrl: string | null = null;
    let cancelled = false;
    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      })
      .catch(() => { /* fall through to direct URL */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [url]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const src = blobUrl || url;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 text-white">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all shrink-0"><X className="w-6 h-6" /></button>
          <p className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{url.split('/').pop()}</p>
        </div>
        <button onClick={() => window.location.href = announcementApi.getDownloadUrl(url)} className="px-6 py-3 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest flex items-center gap-2 shrink-0">
          <Download className="w-4 h-4" /> Save
        </button>
      </div>
      <div className="flex-1 rounded-[2rem] overflow-hidden bg-white relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center z-10"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}
        {!loading && (
          type === 'image'
            ? <img src={src} className="w-full h-full object-contain" />
            : <iframe src={`${src}#toolbar=0`} className="w-full h-full border-none" />
        )}
      </div>
    </motion.div>
  );
}

export default function ParentAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const data = await announcementApi.getMyAnnouncements();
      setAnnouncements(data);
    } catch {
      setError("Couldn't load announcements. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleOpen = (a: Announcement) => {
    setSelected(a);
    if (!a.is_read) {
      setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, is_read: true } : x));
      announcementApi.markAsRead(a.id).catch((err) => console.error('Failed to mark announcement as read:', err));
    }
  };

  /**
   * Local-state patch after a child's homework is confirmed inside the
   * detail modal. We update both the modal's `selected` copy and the list
   * row so the badge counts in the feed reflect the new state without a
   * full refetch.
   */
  const handleHomeworkConfirmed = (announcementId: string, updated: HomeworkChildStatus) => {
    const patch = (a: Announcement): Announcement => {
      if (a.id !== announcementId) return a;
      const children = (a.homework_my_children ?? []).map(c =>
        c.student_id === updated.student_id ? { ...c, ...updated } : c,
      );
      const confirmedDelta = updated.confirmed ? 1 : 0;
      return {
        ...a,
        homework_my_children: children,
        homework_confirmed_count: (a.homework_confirmed_count ?? 0) + confirmedDelta,
      };
    };
    setAnnouncements(prev => prev.map(patch));
    setSelected(prev => (prev ? patch(prev) : prev));
  };

  const handleMarkAllRead = async () => {
    const unread = announcements.filter(a => !a.is_read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    setAnnouncements(prev => prev.map(x => ({ ...x, is_read: true })));
    try {
      await Promise.allSettled(unread.map(a => announcementApi.markAsRead(a.id)));
    } finally {
      setMarkingAll(false);
    }
  };

  // Close detail modal on Escape.
  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  const sorted = useMemo(() =>
    [...announcements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [announcements]
  );

  const counts = useMemo(() => ({
    total: announcements.length,
    unread: announcements.filter(a => !a.is_read).length,
    important: announcements.filter(a => a.priority === 'IMPORTANT').length,
    personal: announcements.filter(a => a.type === 'STUDENT').length,
    class: announcements.filter(a => a.type === 'CLASS').length,
    homework: announcements.filter(a => a.category === 'HOMEWORK').length,
    pendingHomework: announcements.filter(a =>
      a.category === 'HOMEWORK'
      && (a.homework_my_children ?? []).some(c => !c.confirmed)
    ).length,
  }), [announcements]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((a) => {
      if (filter === 'unread' && a.is_read) return false;
      if (filter === 'important' && a.priority !== 'IMPORTANT') return false;
      if (filter === 'personal' && a.type !== 'STUDENT') return false;
      if (filter === 'class' && a.type !== 'CLASS') return false;
      if (filter === 'homework' && a.category !== 'HOMEWORK') return false;
      if (q) {
        const hay = `${a.title} ${a.message} ${a.teacher_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, filter, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, Announcement[]>();
    for (const a of filtered) {
      const key = dateBucket(a.created_at);
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    return BUCKET_ORDER
      .filter((k) => m.has(k))
      .map((k) => ({ bucket: k, items: m.get(k)! }));
  }, [filtered]);

  if (isLoading && !announcements.length) {
    return (
      <div className="w-full px-6 py-8 space-y-8">
        <SkeletonHeader />
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <div className="w-full space-y-8 py-10 px-4 sm:px-6">

        {/* Hero */}
        <div className="relative overflow-hidden p-8 sm:p-10 rounded-[3rem] premium-glass border-white shadow-xl">
          <div aria-hidden className="absolute -inset-24 bg-gradient-to-r from-primary/10 via-indigo-500/5 to-violet-500/10 blur-[100px] pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-[0.3em] bg-white/60 px-4 py-2 rounded-full border border-white/80 w-fit">
                  <Bell className="w-4 h-4" /> Announcements
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-slate-900 leading-[0.95]">
                  School <span className="text-primary italic">Updates</span>
                </h1>
                <p className="text-slate-500 font-medium text-base sm:text-lg">
                  Messages from teachers and the school — newest first.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleMarkAllRead}
                  disabled={counts.unread === 0 || markingAll}
                  className={cn(
                    'inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all',
                    counts.unread === 0
                      ? 'bg-white/50 border-white/60 text-slate-300 cursor-not-allowed'
                      : 'bg-white/70 border-white text-slate-700 hover:bg-white hover:border-primary/40 hover:text-primary shadow-sm',
                  )}
                >
                  <MailOpen className="w-4 h-4" />
                  Mark all read
                </button>
                <button
                  onClick={fetchAnnouncements}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                  aria-label="Refresh announcements"
                >
                  <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <StatTile
                label="Total"
                value={counts.total}
                icon={<Inbox className="w-5 h-5" />}
                tone="slate"
              />
              <StatTile
                label="Unread"
                value={counts.unread}
                icon={<Bell className="w-5 h-5" />}
                tone="indigo"
                pulse={counts.unread > 0}
              />
              <StatTile
                label="Important"
                value={counts.important}
                icon={<AlertTriangle className="w-5 h-5" />}
                tone="rose"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <button onClick={fetchAnnouncements} className="px-5 py-2.5 rounded-xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 transition-all self-start sm:self-auto">
              Retry
            </button>
          </div>
        )}

        {/* Toolbar: search + filters */}
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full pl-14 pr-4 py-4 rounded-2xl premium-glass border-white shadow-sm text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Filter
            </span>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.total} />
            <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')} label="Unread" count={counts.unread} tone="primary" />
            <FilterChip active={filter === 'homework'} onClick={() => setFilter('homework')} label="Homework" count={counts.homework} tone="amber" />
            <FilterChip active={filter === 'important'} onClick={() => setFilter('important')} label="Important" count={counts.important} tone="rose" />
            <FilterChip active={filter === 'personal'} onClick={() => setFilter('personal')} label="Personal" count={counts.personal} />
            <FilterChip active={filter === 'class'} onClick={() => setFilter('class')} label="Class" count={counts.class} />
          </div>
        </div>

        {/* Feed */}
        {filtered.length === 0 ? (
          <EmptyState
            hasAny={announcements.length > 0}
            filter={filter}
            query={query}
            onClearFilters={() => { setFilter('all'); setQuery(''); }}
          />
        ) : (
          <div className="space-y-10">
            {grouped.map(({ bucket, items }) => (
              <section key={bucket} className="space-y-4">
                <div className="flex items-center gap-3">
                  <Megaphone className="w-5 h-5 text-primary" />
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-slate-500">{bucket}</h2>
                  <span className="text-xs font-black uppercase tracking-widest text-slate-300">
                    {items.length} {items.length === 1 ? 'update' : 'updates'}
                  </span>
                  <div className="ml-2 flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                </div>

                <StaggerContainer className="flex flex-col gap-3">
                  {items.map((a) => (
                    <StaggerItem key={a.id}>
                      <AnnouncementCard a={a} onClick={() => handleOpen(a)} />
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-3xl bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] mx-2 sm:mx-0"
            >
              {/* Priority accent bar — only colored when important */}
              <div className={cn(
                'h-1.5 w-full shrink-0 bg-gradient-to-r',
                selected.priority === 'IMPORTANT'
                  ? PRIORITY_THEMES.IMPORTANT.rail
                  : PRIORITY_THEMES.NORMAL.rail,
              )} />

              <div className="px-5 sm:px-8 py-5 sm:py-7 flex items-start justify-between gap-4 border-b border-slate-100 shrink-0">
                <div className="flex items-start gap-4 min-w-0">
                  <div className={cn(
                    'h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0',
                    selected.priority === 'IMPORTANT' ? PRIORITY_THEMES.IMPORTANT.solid : PRIORITY_THEMES.NORMAL.solid,
                  )}>
                    {selected.type === 'CLASS' ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {selected.priority === 'IMPORTANT' && <PriorityBadge />}
                      {selected.category === 'HOMEWORK' && <CategoryBadge category="HOMEWORK" />}
                      <ScopeBadge type={selected.type as Scope} />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">{selected.title}</h2>
                    <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-500 font-bold uppercase tracking-widest flex-wrap">
                      <span className="text-primary">{selected.teacher_name || 'Faculty'}</span>
                      <span className="text-slate-300">•</span>
                      <span>{formatFullDate(selected.created_at)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
                <p className="text-base sm:text-lg text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                {selected.attachment_url && (
                  <AttachmentPreview url={selected.attachment_url} onPreview={(url, type) => setPreviewFile({ url, type })} />
                )}
                {selected.category === 'HOMEWORK' && (
                  <HomeworkConfirmPanel
                    announcement={selected}
                    onConfirmed={(updated) => handleHomeworkConfirmed(selected.id, updated)}
                  />
                )}
              </div>

              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">Esc</kbd> to close
                </p>
                {selected.is_read && (
                  <div className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4" /> Read
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewFile && <FilePreviewModal url={previewFile.url} type={previewFile.type} onClose={() => setPreviewFile(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function StatTile({
  label, value, icon, tone, pulse,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'slate' | 'indigo' | 'rose';
  pulse?: boolean;
}) {
  const toneClasses = {
    slate: 'text-slate-700 bg-slate-100 border-slate-200/80',
    indigo: 'text-primary bg-primary/10 border-primary/20',
    rose: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  }[tone];

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-sm flex items-center gap-4">
      <div className={cn('h-12 w-12 rounded-xl border flex items-center justify-center shrink-0', toneClasses)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-3xl sm:text-4xl font-black text-slate-900 tabular-nums leading-none">{value}</p>
          {pulse && <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />}
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-2 truncate">{label}</p>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, tone = 'default',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: 'default' | 'primary' | 'rose' | 'amber';
}) {
  const activeClasses = {
    default: 'bg-slate-900 text-white border-slate-900 shadow-sm',
    primary: 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-md',
    rose: 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20',
    amber: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20',
  }[tone];

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-black uppercase tracking-widest transition-all',
        active
          ? activeClasses
          : 'bg-white/70 border-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
      )}
    >
      {label}
      <span className={cn(
        'inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] tabular-nums',
        active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500',
      )}>
        {count}
      </span>
    </button>
  );
}

function PriorityBadge() {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest',
      PRIORITY_THEMES.IMPORTANT.chip,
    )}>
      <AlertTriangle className="w-3.5 h-3.5" />
      Important
    </span>
  );
}

function ScopeBadge({ type }: { type: Scope }) {
  const isClass = type === 'CLASS';
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest',
      isClass ? 'bg-violet-500/10 text-violet-600 border-violet-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    )}>
      {isClass ? <Users className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      {isClass ? 'Class' : 'Personal'}
    </span>
  );
}

function EmptyState({
  hasAny, filter, query, onClearFilters,
}: {
  hasAny: boolean;
  filter: FilterKey;
  query: string;
  onClearFilters: () => void;
}) {
  const filtered = hasAny && (filter !== 'all' || query.length > 0);
  return (
    <div className="py-20 flex flex-col items-center justify-center premium-glass rounded-[2.5rem] border-dashed border-slate-200 text-center px-6">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
        {filtered ? <Search className="w-7 h-7" /> : <Bookmark className="w-7 h-7" />}
      </div>
      <p className="text-sm font-black uppercase tracking-widest text-slate-700">
        {filtered ? 'No matches' : 'No announcements yet'}
      </p>
      <p className="text-xs text-slate-400 font-bold mt-2 max-w-sm">
        {filtered
          ? 'Try a different search or clear your filters.'
          : 'When your school or teachers post updates, you’ll see them here.'}
      </p>
      {filtered && (
        <button
          onClick={onClearFilters}
          className="mt-5 px-5 py-2.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark transition-all"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function AnnouncementCard({ a, onClick }: { a: Announcement; onClick: () => void }) {
  const isImportant = a.priority === 'IMPORTANT';
  const theme = isImportant ? PRIORITY_THEMES.IMPORTANT : PRIORITY_THEMES.NORMAL;
  const isUnread = !a.is_read;

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'group relative cursor-pointer overflow-hidden transition-all duration-300',
        'rounded-2xl border shadow-sm hover:shadow-xl',
        // Light red wash for important items; clean white otherwise.
        isImportant
          ? 'bg-rose-50/60 border-rose-300/60 hover:border-rose-400/70'
          : isUnread
            ? 'bg-white border-primary/25'
            : 'bg-white border-slate-100',
      )}
    >
      {/* Priority rail — colored only when important */}
      {isImportant && (
        <div className={cn('absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b', theme.rail)} />
      )}

      <div className="pl-6 pr-6 py-6 flex items-start gap-5">
        {/* Type icon */}
        <div className={cn(
          'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
          theme.bg, theme.text,
        )}>
          {a.type === 'CLASS' ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className={cn(
              'text-lg sm:text-xl font-black tracking-tight leading-snug line-clamp-2 transition-colors',
              isImportant
                ? 'text-slate-900 group-hover:text-rose-600'
                : isUnread
                  ? 'text-slate-900 group-hover:text-primary'
                  : 'text-slate-600 group-hover:text-primary',
            )}>
              {a.title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {isUnread && (
                <span className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-[10px] font-black uppercase tracking-widest',
                  isImportant ? 'bg-rose-500' : 'bg-[hsl(var(--primary))]',
                )}>
                  <Sparkles className="w-3.5 h-3.5" /> New
                </span>
              )}
              <span className="text-xs font-black uppercase tracking-widest text-slate-400 tabular-nums">
                {relativeTime(a.created_at)}
              </span>
            </div>
          </div>

          <p className="text-base text-slate-500 line-clamp-2 leading-relaxed">{a.message}</p>

          <div className="flex items-center gap-3 pt-1.5 flex-wrap">
            {isImportant && <PriorityBadge />}
            {a.category === 'HOMEWORK' && <CategoryBadge category="HOMEWORK" />}
            {a.category === 'HOMEWORK' && (a.homework_my_children ?? []).length > 0 && (
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest',
                (a.homework_my_children ?? []).every(c => c.confirmed)
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 border-slate-200',
              )}>
                <BookOpenCheck className="w-3.5 h-3.5" />
                {(a.homework_my_children ?? []).filter(c => c.confirmed).length}/{(a.homework_my_children ?? []).length} done
              </span>
            )}
            <ScopeBadge type={a.type as Scope} />

            <div className="flex items-center gap-2 ml-auto">
              {a.attachment_url && (
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest',
                  isImportant ? 'text-rose-500' : 'text-primary',
                )}>
                  <Paperclip className="w-3 h-3" /> Attachment
                </span>
              )}
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <span className={cn(
                  'h-6 w-6 rounded-md flex items-center justify-center text-[11px] font-black',
                  isImportant ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-primary',
                )}>
                  {a.teacher_name?.charAt(0).toUpperCase() || 'F'}
                </span>
                {a.teacher_name || 'Faculty'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
