import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Megaphone, User, Users, Clock,
  ChevronRight, Sparkles, ShieldAlert,
  Bookmark, CheckCircle2, Paperclip,
  RefreshCw, AlertCircle, FileText,
  Film, File, X, Download, Eye
} from 'lucide-react';


import { announcementApi, type Announcement } from '../api/announcementApi';
import client from '../api/client';
import { cn } from '../lib/utils';

const PRIORITY_STYLES: Record<string, any> = {
  HIGH: { border: 'border-rose-500/40', bar: 'bg-rose-500', icon: 'text-rose-500', badge: 'bg-rose-500/10 text-rose-500' },
  MEDIUM: { border: 'border-amber-500/40', bar: 'bg-amber-500', icon: 'text-amber-500', badge: 'bg-amber-500/10 text-amber-500' },
  LOW: { border: 'border-primary/20', bar: 'bg-primary', icon: 'text-primary', badge: 'bg-primary/10 text-primary' },
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
    const downloadUrl = announcementApi.getDownloadUrl(url);
    window.location.href = downloadUrl; // Trigger force-download endpoint
  };


  if (type === 'image') {
    return (
      <div className="space-y-3">
        <div
          onClick={() => onPreview(fullUrl, 'image')}
          className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm group relative cursor-pointer"
        >
          <img src={fullUrl} alt="Attachment" className="w-full max-h-[300px] object-contain transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <div className="p-3 rounded-xl bg-white text-slate-900 flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
              <Eye className="w-4 h-4" /> View Full Screen
            </div>
          </div>
        </div>
        <button onClick={handleDownload} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all">
          <Download className="w-4 h-4" /> Save to Device
        </button>
      </div>
    );
  }

  if (type === 'pdf') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PDF Document</p>
              <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{url.split('/').pop()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPreview(fullUrl, 'pdf')}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 transition-all flex items-center gap-2 text-xs font-bold"
            >
              <Eye className="w-4 h-4" /> View
            </button>
            <button
              onClick={handleDownload}
              className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const icons = { doc: File, video: Film, other: Paperclip };
  const labels = { doc: 'Document', video: 'Video', other: 'File' };
  const Icon = icons[type as keyof typeof icons] || Paperclip;

  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{labels[type as keyof typeof labels] || 'Resource'}</p>
          <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]">{url.split('/').pop()}</p>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all text-xs font-bold"
      >
        <Download className="w-4 h-4" /> Download
      </button>
    </div>
  );
}

function FilePreviewModal({ url, type, onClose }: { url: string, type: string, onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let currentUrl: string | null = null;
    const loadFile = async () => {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        currentUrl = window.URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
      } catch (err) {
        console.error("Preview load failed:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    return () => {
      if (currentUrl) window.URL.revokeObjectURL(currentUrl);
    };
  }, [url]);

  const handleDownload = () => {
    const downloadUrl = announcementApi.getDownloadUrl(url);
    window.location.href = downloadUrl; // Trigger force-download endpoint
  };


  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-2xl flex flex-col"
    >
      {/* Navbar */}
      <div className="h-20 px-8 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 text-white">
          <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <X className="w-6 h-6" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Viewing Attachment</p>
            <p className="text-sm font-bold truncate max-w-[300px]">{url.split('/').pop()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={!blobUrl}
            onClick={handleDownload}
            className="px-6 py-3 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg shadow-primary/20"
          >
            <Download className="w-4 h-4" /> Download
          </button>
          <button onClick={onClose} className="px-6 py-3 rounded-2xl bg-white/10 text-white font-black uppercase tracking-widest text-xs hover:bg-white/20 transition-all">
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-8 flex items-center justify-center relative">
        {loading && (
          <div className="flex flex-col items-center gap-4 text-white/40">
            <RefreshCw className="w-10 h-10 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">Retrieving Secure Content...</p>
          </div>
        )}

        {error && type !== 'image' && (
          <div className="flex flex-col items-center gap-4 text-rose-500">
            <AlertCircle className="w-12 h-12" />
            <p className="text-sm font-bold uppercase tracking-widest">Unable to fetch content securely</p>
            <div className="flex flex-col gap-2 items-center">
              <button onClick={() => window.open(url, '_blank')} className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-all">
                Open in new tab
              </button>
              <p className="text-[10px] text-white/40">Browser security might be blocking the in-app preview</p>
            </div>
          </div>
        )}

        {/* Display Image directly if it's an image, even without blobUrl (Fallback) */}
        {!loading && type === 'image' && (
          <div className="w-full h-full flex items-center justify-center">
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={blobUrl || url}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl bg-white/5"
              onError={(e) => {
                if (blobUrl) (e.target as HTMLImageElement).src = url;
              }}
            />
          </div>
        )}


        {blobUrl && !loading && type !== 'image' && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-5xl h-full bg-white rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <iframe src={`${blobUrl}#toolbar=0`} className="w-full h-full border-none" />
          </motion.div>
        )}

      </div>
    </motion.div>
  );
}




export default function ParentAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);

  // Profile resolution is handled on-the-fly by the backend announcements endpoint
  useEffect(() => {
    fetchAnnouncements();
  }, []);


  const [selected, setSelected] = useState<Announcement | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string, type: string } | null>(null);


  const fetchAnnouncements = async () => {
    setIsLoading(true); setError(null);
    try {
      const data = await announcementApi.getMyAnnouncements();
      setAnnouncements(data);
    } catch {
      setError('Could not load announcements. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleOpen = (a: Announcement) => {
    setSelected(a);
    if (!a.is_read) handleMarkAsRead(a);
  };

  const handleMarkAsRead = async (a: Announcement) => {
    if (a.is_read) return;

    // 1. Optimistic UI update
    setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, is_read: true } : x));

    // 2. Persist to backend
    if (parentId) {
      try {
        await announcementApi.markAsRead(a.id, parentId);
      } catch (err) {
        console.warn("Failed to persist mark-as-read:", err);
      }
    }
  };


  const sections = useMemo(() => ({
    urgent: announcements.filter(a => a.priority === 'HIGH'),
    classUpdates: announcements.filter(a => a.type === 'CLASS' && a.priority !== 'HIGH'),
    personal: announcements.filter(a => a.type === 'STUDENT' && a.priority !== 'HIGH'),
  }), [announcements]);


  const unreadCount = announcements.filter(a => !a.is_read).length;

  return (
    <div className="min-h-screen pb-32">
      <div className="max-w-5xl mx-auto space-y-12 py-10 px-4 sm:px-6">

        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.3em] bg-primary/10 px-5 py-2.5 rounded-full border border-primary/20 w-fit aurora-glow">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 ? `${unreadCount} New` : 'All Read'} — Announcements
          </div>
          <h1 className="text-6xl font-black tracking-tighter text-foreground">
            School <span className="text-primary italic">Updates</span>
          </h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Messages from your child's teachers and school administration.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-12 rounded-[2.5rem] bg-rose-500/5 border border-rose-500/20 flex flex-col items-center text-center gap-6">
            <AlertCircle className="w-12 h-12 text-rose-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={fetchAnnouncements} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-500 text-white font-black text-xs uppercase tracking-widest hover:scale-105 transition-all">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && !error && (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="premium-glass rounded-[2rem] p-6 animate-pulse flex gap-5 border-glass-border">
                <div className="h-14 w-14 rounded-2xl bg-primary/5 shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-1/2 bg-primary/5 rounded-lg" />
                  <div className="h-4 w-3/4 bg-primary/5 rounded-lg" />
                  <div className="h-3 w-1/4 bg-primary/5 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && announcements.length === 0 && (
          <div className="py-32 flex flex-col items-center premium-glass rounded-[3rem] border-dashed border-primary/20 opacity-50">
            <Megaphone className="w-16 h-16 mb-4 text-primary/30" />
            <p className="text-sm font-black uppercase tracking-widest">No announcements yet</p>
            <p className="text-xs text-muted-foreground mt-2">Your child's teachers haven't posted any updates.</p>
          </div>
        )}

        {/* Urgent Section */}
        {!isLoading && !error && sections.urgent.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground">Urgent</h2>
              <div className="h-px flex-1 bg-rose-500/20" />
            </div>
            <div className="flex flex-col gap-4">
              {sections.urgent.map((a, i) => (
                <AnnouncementRow key={a.id} a={a} onClick={() => handleOpen(a)} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Class Updates */}
        {!isLoading && !error && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground">Class Updates</h2>
              <div className="h-px flex-1 bg-primary/20" />
            </div>
            {sections.classUpdates.length === 0 ? (
              <EmptySection icon={<Megaphone className="w-8 h-8" />} message="No class updates" />
            ) : (
              <div className="flex flex-col gap-4">
                {sections.classUpdates.map((a, i) => (
                  <AnnouncementRow key={a.id} a={a} onClick={() => handleOpen(a)} index={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Personal Notes */}
        {!isLoading && !error && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground">Personal Messages</h2>
              <div className="h-px flex-1 bg-amber-500/20" />
            </div>
            {sections.personal.length === 0 ? (
              <EmptySection icon={<Bookmark className="w-8 h-8" />} message="No personal messages" />
            ) : (
              <div className="flex flex-col gap-4">
                {sections.personal.map((a, i) => (
                  <AnnouncementRow key={a.id} a={a} onClick={() => handleOpen(a)} index={i} />
                ))}
              </div>
            )}
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
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl border border-white/50 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Priority bar */}
              <div className={cn('h-2 w-full shrink-0',
                selected.priority === 'HIGH' ? 'bg-rose-500' :
                  selected.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-primary'
              )} />


              {/* Modal Header */}
              <div className="px-8 py-6 flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0',
                    selected.priority === 'HIGH' ? 'bg-rose-500' : 'bg-primary'
                  )}>
                    {selected.type === 'CLASS' ? <Users className="w-7 h-7" /> : <User className="w-7 h-7" />}
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-slate-900 leading-tight">{selected.title}</h2>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 font-medium flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        {selected.teacher_name || 'Faculty'}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(selected.created_at)}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase', PRIORITY_STYLES[selected.priority as keyof typeof PRIORITY_STYLES]?.badge || PRIORITY_STYLES.LOW.badge)}>
                        {selected.priority}
                      </span>

                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="h-10 w-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-all shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
                <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                  {selected.message}
                </p>

                {selected.attachment_url && (
                  <AttachmentPreview
                    url={selected.attachment_url}
                    onPreview={(url, type) => setPreviewFile({ url, type })}
                  />
                )}


                {/* Read indicator */}
                {selected.is_read && (
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Read
                  </div>
                )}
              </div>

              <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center shrink-0">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">EduTrack — School Communication System</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen File Preview */}
      <AnimatePresence>
        {previewFile && (
          <FilePreviewModal
            url={previewFile.url}
            type={previewFile.type}
            onClose={() => setPreviewFile(null)}
          />
        )}
      </AnimatePresence>
    </div>

  );
}

function AnnouncementRow({ a, onClick, index }: { a: Announcement; onClick: () => void; index: number }) {
  const style = PRIORITY_STYLES[a.priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES.LOW;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className={cn(
        'premium-glass group relative overflow-hidden transition-all duration-300 cursor-pointer',
        'p-5 rounded-[1.75rem] flex items-center gap-5 border hover:shadow-lg hover:shadow-primary/5',
        style.border,
        !a.is_read && 'ring-1 ring-primary/20 bg-primary/[0.02]'
      )}
    >
      {/* Left accent */}
      <div className={cn('absolute left-0 top-0 h-full w-1 opacity-50 group-hover:opacity-100', style.bar)} />

      {/* Icon */}
      <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', `${style.icon} bg-current/10`)}>
        {a.type === 'CLASS' ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
      </div>


      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className={cn('font-black text-lg truncate group-hover:text-primary transition-colors', !a.is_read ? 'text-foreground' : 'text-foreground/80')}>
            {a.title}
          </h3>
          {!a.is_read && <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1 font-medium">{a.message}</p>
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
          <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary/50" /> {a.teacher_name || 'Faculty'}</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(a.created_at)}</span>
          {a.attachment_url && <span className="flex items-center gap-1 text-primary"><Paperclip className="w-3 h-3" /> Attachment</span>}
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
    </motion.div>
  );
}

function EmptySection({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="py-12 flex flex-col items-center premium-glass rounded-[2rem] border-dashed border-primary/10 opacity-40">
      <div className="text-primary/30 mb-3">{icon}</div>
      <p className="text-xs font-black uppercase tracking-widest">{message}</p>
    </div>
  );
}
