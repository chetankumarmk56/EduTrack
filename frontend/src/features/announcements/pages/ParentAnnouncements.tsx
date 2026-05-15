import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, User, Users,
  ChevronRight, Sparkles,
  Bookmark, CheckCircle2, Paperclip,
  RefreshCw, AlertCircle, FileText,
  File, X, Download, Eye, Zap
} from 'lucide-react';

import { announcementApi, type Announcement } from '@/features/announcements/api';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';

const PRIORITY_THEMES: Record<string, any> = {
  HIGH: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
    icon: 'text-rose-500',
    glow: 'shadow-[0_0_20px_rgba(244,63,94,0.1)]',
    badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  },
  MEDIUM: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    icon: 'text-amber-500',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.1)]',
    badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
  },
  LOW: {
    border: 'border-primary/20',
    bg: 'bg-primary/5',
    icon: 'text-primary',
    glow: 'shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)]',
    badge: 'bg-primary/10 text-primary border-primary/20'
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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
          <div onClick={() => onPreview(fullUrl, 'image')} className="cursor-pointer overflow-hidden max-h-[250px]">
            <img src={fullUrl} alt="Attachment" className="w-full object-cover transition-transform duration-700 group-hover/attachment:scale-110" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/attachment:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <div className="px-5 py-2 rounded-full bg-white text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Eye className="w-4 h-4" /> Preview
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center",
                isPdf ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
              )}>
                {isPdf ? <FileText className="w-6 h-6" /> : <File className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isPdf ? 'PDF Document' : 'Resource File'}</p>
                <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{url.split('/').pop()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isImage && (
                <button onClick={() => onPreview(fullUrl, type)} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-all">
                  <Eye className="w-4 h-4" />
                </button>
              )}
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let currentUrl: string | null = null;
    fetch(url).then(res => res.blob()).then(blob => {
      currentUrl = URL.createObjectURL(blob);
      setBlobUrl(currentUrl);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [url]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex flex-col p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 text-white">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all"><X className="w-6 h-6" /></button>
          <p className="text-sm font-bold truncate max-w-[200px]">{url.split('/').pop()}</p>
        </div>
        <button onClick={() => window.location.href = announcementApi.getDownloadUrl(url)} className="px-6 py-3 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
          <Download className="w-4 h-4" /> Save
        </button>
      </div>
      <div className="flex-1 rounded-[2rem] overflow-hidden bg-white relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>}
        {type === 'image' ? <img src={blobUrl || url} className="w-full h-full object-contain" /> : <iframe src={`${blobUrl}#toolbar=0`} className="w-full h-full border-none" />}
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

  const fetchAnnouncements = async () => {
    setIsLoading(true); setError(null);
    try {
      const data = await announcementApi.getMyAnnouncements();
      setAnnouncements(data);
    } catch {
      setError('System Link Interrupted. Check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleOpen = (a: Announcement) => {
    setSelected(a);
    if (!a.is_read) {
      setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, is_read: true } : x));
      announcementApi.markAsRead(a.id).catch((err) => console.error("Failed to mark announcement as read:", err));
    }
  };

  const sorted = useMemo(() =>
    [...announcements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [announcements]
  );

  const unreadCount = announcements.filter(a => !a.is_read).length;

  if (isLoading && !announcements.length) {
    return (
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="h-40 w-full rounded-[3rem] bg-slate-200/50 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 rounded-[3rem] bg-slate-200/50 animate-pulse" />
          <div className="h-64 rounded-[3rem] bg-slate-200/50 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <div className="max-w-6xl mx-auto space-y-12 py-10 px-4 sm:px-6">
        
        {/* Modern Hero Header */}
        <div className="relative group overflow-hidden p-12 rounded-[4rem] premium-glass border-white shadow-2xl">
           <div className="absolute -inset-24 bg-gradient-to-r from-primary/10 via-indigo-500/5 to-violet-500/10 blur-[100px] group-hover:scale-110 transition-transform duration-1000" />
           <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-white/50 px-5 py-2 rounded-full border border-white/80 w-fit crystal-glow">
                  <Zap className="w-4 h-4 fill-primary/20" /> Institutional Signals
                </div>
                <h1 className="text-7xl font-black tracking-tighter text-slate-900 leading-[0.9]">
                  School <span className="text-primary italic opacity-90">Stream</span>
                </h1>
                <p className="text-slate-500 font-bold max-w-md text-sm">Synchronized updates from the academic core and faculty leadership.</p>
              </div>

              <div className="flex gap-4">
                <div className="p-8 rounded-[3rem] bg-white/60 backdrop-blur-xl border border-white/80 shadow-xl text-center min-w-[140px]">
                  <p className="text-5xl font-black text-primary tracking-tighter">{unreadCount}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Unread Alerts</p>
                </div>
                <button onClick={fetchAnnouncements} className="p-8 rounded-[3rem] bg-slate-900 text-white shadow-2xl hover:scale-105 transition-all group/btn">
                  <RefreshCw className={cn("w-8 h-8 group-hover/btn:rotate-180 transition-transform duration-700", isLoading && "animate-spin")} />
                </button>
              </div>
           </div>
        </div>

        {error && (
          <div className="p-8 rounded-[2.5rem] bg-rose-500/5 border border-rose-500/20 flex items-center justify-between">
            <div className="flex items-center gap-4 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <p className="text-sm font-black uppercase tracking-widest">{error}</p>
            </div>
            <button onClick={fetchAnnouncements} className="px-6 py-3 rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest">Retry Connection</button>
          </div>
        )}

        {/* Strategic Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Chronological Feed */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center gap-3">
              <Megaphone className="w-5 h-5 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">All Announcements</h2>
              <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400">Newest First</span>
            </div>

            <StaggerContainer className="flex flex-col gap-4">
              {sorted.length === 0 ? (
                <div className="py-24 flex flex-col items-center justify-center premium-glass rounded-[3rem] border-dashed border-primary/20 opacity-40">
                  <Bookmark className="w-12 h-12 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No Announcements Yet</p>
                </div>
              ) : (
                sorted.map((a) => (
                  <StaggerItem key={a.id}>
                    <AnnouncementCard a={a} onClick={() => handleOpen(a)} isUrgent={a.priority === 'HIGH'} />
                  </StaggerItem>
                ))
              )}
            </StaggerContainer>
          </div>

          {/* Right Column: Statistics & Highlights */}
          <div className="lg:col-span-4 space-y-8">
             <div className="p-10 rounded-[3.5rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                <h3 className="text-xl font-black tracking-tight mb-6">Discovery Nexus</h3>
                <div className="space-y-5">
                   <div className="flex items-center justify-between p-4 rounded-2xl bg-white/10 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Signal Volume</span>
                      <span className="text-xl font-black">{announcements.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-4 rounded-2xl bg-white/10 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Class Domain</span>
                      <span className="text-xl font-black">{announcements.filter(a => a.type === 'CLASS').length}</span>
                   </div>
                   <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/20 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Sync Status</span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                   </div>
                </div>
             </div>

             <div className="p-10 rounded-[3.5rem] premium-glass border-white shadow-xl space-y-6">
                <div className="flex items-center gap-3">
                   <Sparkles className="w-5 h-5 text-amber-500" />
                   <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Contributor Pulse</h3>
                </div>
                <div className="space-y-4">
                   {Array.from(new Set(announcements.map(a => a.teacher_name))).slice(0, 3).map((name, i) => (
                      <div key={i} className="flex items-center gap-3">
                         <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary font-black text-xs">
                            {name?.charAt(0) || 'F'}
                         </div>
                         <p className="text-sm font-bold text-slate-700">{name || 'Faculty Member'}</p>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Detail Modal Overlay */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className="relative w-full max-w-3xl bg-white rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className={cn('h-3 w-full shrink-0', PRIORITY_THEMES[selected.priority]?.bg || 'bg-primary')} />
              <div className="px-10 py-10 flex items-start justify-between gap-6 border-b border-slate-50 shrink-0">
                <div className="flex items-start gap-5">
                   <div className={cn('h-16 w-16 rounded-[1.8rem] flex items-center justify-center text-white shadow-xl shrink-0', PRIORITY_THEMES[selected.priority]?.icon.replace('text', 'bg') || 'bg-primary')}>
                      {selected.type === 'CLASS' ? <Users className="w-8 h-8" /> : <User className="w-8 h-8" />}
                   </div>
                   <div>
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">{selected.title}</h2>
                      <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 font-bold uppercase tracking-widest">
                         <span className="text-primary">{selected.teacher_name || 'Faculty'}</span>
                         <span>•</span>
                         <span>{formatDate(selected.created_at)}</span>
                      </div>
                   </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-10 py-10 space-y-8">
                 <p className="text-lg text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{selected.message}</p>
                 {selected.attachment_url && <AttachmentPreview url={selected.attachment_url} onPreview={(url, type) => setPreviewFile({ url, type })} />}
              </div>
              <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                 <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">EduTrack Communication Protocol</p>
                 {selected.is_read && <div className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase tracking-widest"><CheckCircle2 className="w-4 h-4" /> Delivered \u0026 Read</div>}
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

function AnnouncementCard({ a, onClick, isUrgent = false }: { a: Announcement; onClick: () => void; isUrgent?: boolean }) {
  const theme = PRIORITY_THEMES[a.priority] || PRIORITY_THEMES.LOW;
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -5, scale: 1.01 }}
      className={cn(
        'relative overflow-hidden cursor-pointer group transition-all duration-500',
        'p-7 rounded-[2.5rem] premium-glass border-white shadow-xl flex items-center gap-6',
        !a.is_read && 'ring-2 ring-primary/20 bg-white shadow-2xl shadow-primary/5',
        isUrgent && 'border-rose-500/20'
      )}
    >
      <div className={cn("h-16 w-16 rounded-[1.6rem] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", theme.bg, theme.icon)}>
         {a.type === 'CLASS' ? <Users className="w-7 h-7" /> : <User className="w-7 h-7" />}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
         <div className="flex items-center justify-between">
            <h3 className={cn("text-xl font-black tracking-tight truncate group-hover:text-primary transition-colors", !a.is_read ? 'text-slate-900' : 'text-slate-600')}>{a.title}</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{new Date(a.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
         </div>
         <p className="text-sm text-slate-500 line-clamp-1 font-bold italic opacity-80">{a.message}</p>
         <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
               <div className="h-5 w-5 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-primary">{a.teacher_name?.charAt(0) || 'F'}</div>
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{a.teacher_name || 'Faculty'}</span>
            </div>
            {a.attachment_url && (
              <div className="flex items-center gap-1.5 text-primary">
                 <Paperclip className="w-3.5 h-3.5" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Asset Attached</span>
              </div>
            )}
            {!a.is_read && <div className="ml-auto px-3 py-1 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest animate-pulse">New Arrival</div>}
         </div>
      </div>
      <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
    </motion.div>
  );
}
