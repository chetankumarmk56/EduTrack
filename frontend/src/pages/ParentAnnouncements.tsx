import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, Megaphone, User, Users, Clock, 
  ChevronRight, Sparkles, ShieldAlert,
  Bookmark, CheckCircle2, Layout, Paperclip,
  RefreshCw, AlertCircle
} from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { announcementApi } from '../api/announcementApi';
import { cn } from '../lib/utils';

export default function ParentAnnouncements() {
  const { studentProfile } = useApp();
  
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);

  const parentId = studentProfile?.parent?.id || studentProfile?.id; // Resolve Parent ID from profile

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await announcementApi.getMyAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
      setError("We encountered a synchronization error while retrieving your institutional feed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleMarkAsRead = async (announcementId: string) => {
    if (!parentId) return;
    try {
      await announcementApi.markAsRead(announcementId, parentId);
      // Optimistic update
      setAnnouncements(prev => prev.map(a => 
        a.id === announcementId ? { ...a, is_read: true } : a
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAnnouncement = (announcement: any) => {
    setSelectedAnnouncement(announcement);
    if (!announcement.is_read) {
      handleMarkAsRead(announcement.id);
    }
  };

  // Grouping Logic
  const sections = useMemo(() => {
    return {
      important: announcements.filter(a => a.priority === 'high'),
      classUpdates: announcements.filter(a => a.type === 'class' && a.priority !== 'high'),
      personalNotes: announcements.filter(a => a.type === 'student' && a.priority !== 'high')
    };
  }, [announcements]);

  const unreadCount = announcements.filter(a => !a.is_read).length;

  return (
    <div className="min-h-screen pb-32">
      <div className="max-w-7xl mx-auto space-y-12 py-10 px-4 sm:px-6 lg:px-8">
        
        {/* Cinematic Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-primary text-xs font-black uppercase tracking-[0.3em] bg-primary/10 px-5 py-2.5 rounded-full border border-primary/20 w-fit aurora-glow">
              <Bell className="w-4 h-4 shadow-primary/50" /> 
              Broadcast Feed — {unreadCount} New Bulletins
            </div>
            <h1 className="text-7xl font-black tracking-tighter text-foreground leading-[0.9]">
              Institutional <span className="text-primary italic">Intelligence</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-xl leading-relaxed">
              Synthesized updates and disciplinary directives regarding your family's academic trajectory.
            </p>
          </div>

          <div className="premium-glass px-8 py-6 rounded-[2.5rem] border-2 border-primary/20 shadow-2xl flex items-center gap-6 group hover:scale-105 transition-all duration-500">
             <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 group-hover:rotate-12 transition-transform">
                <Layout className="w-7 h-7" />
             </div>
             <div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">System Context</p>
                <p className="text-xl font-black text-foreground italic">Unified Feed</p>
             </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="p-12 rounded-[3rem] bg-rose-500/5 border border-rose-500/20 flex flex-col items-center justify-center text-center gap-6"
          >
             <div className="h-16 w-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
             </div>
             <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-widest text-foreground">Sync Interruption</h3>
                <p className="text-sm text-muted-foreground font-medium max-w-md">{error}</p>
             </div>
             <button 
               onClick={fetchAnnouncements}
               className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-500/20 hover:scale-105 transition-all"
             >
                <RefreshCw className="w-4 h-4" /> Retry Connection
             </button>
          </motion.div>
        )}

        {/* Section: IMPORTANT (High Priority) */}
        {!error && (isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <AnnouncementSkeleton key={i} />)}
          </div>
        ) : sections.important.length > 0 && (
          <div className="space-y-8">
            <div className="flex items-center gap-4 px-2">
               <ShieldAlert className="w-6 h-6 text-rose-500 animate-pulse" />
               <h2 className="text-2xl font-black tracking-tight text-foreground uppercase italic">Critical Directives</h2>
               <div className="h-px flex-1 bg-gradient-to-r from-rose-500/20 to-transparent" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {sections.important.map((a, i) => (
                <AnnouncementCard key={a.id} announcement={a} onClick={() => handleOpenAnnouncement(a)} index={i} />
              ))}
            </div>
          </div>
        ))}

        {/* Grid Sections */}
        {!error && !isLoading && (
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Class Updates */}
            <div className="space-y-10">
              <div className="flex items-center gap-4 px-2">
                 <Users className="w-6 h-6 text-primary" />
                 <h2 className="text-2xl font-black tracking-tight text-foreground uppercase italic">Operational Updates</h2>
                 <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
              </div>
              <div className="flex flex-col gap-6">
                {sections.classUpdates.length === 0 ? (
                  <EmptyState icon={<Megaphone className="w-10 h-10" />} message="No class updates on record." />
                ) : (
                  sections.classUpdates.map((a, i) => (
                    <AnnouncementCard key={a.id} announcement={a} onClick={() => handleOpenAnnouncement(a)} index={i} compact />
                  ))
                )}
              </div>
            </div>

            {/* Personal Notes */}
            <div className="space-y-10">
               <div className="flex items-center gap-4 px-2">
                 <User className="w-6 h-6 text-amber-500" />
                 <h2 className="text-2xl font-black tracking-tight text-foreground uppercase italic">Individual Directives</h2>
                 <div className="h-px flex-1 bg-gradient-to-r from-amber-500/20 to-transparent" />
              </div>
              <div className="flex flex-col gap-6">
                {sections.personalNotes.length === 0 ? (
                  <EmptyState icon={<Bookmark className="w-10 h-10" />} message="No personal notes assigned." />
                ) : (
                  sections.personalNotes.map((a, i) => (
                    <AnnouncementCard key={a.id} announcement={a} onClick={() => handleOpenAnnouncement(a)} index={i} compact />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Catch-all Loading for non-important sections */}
        {isLoading && !error && sections.important.length === 0 && (
          <div className="grid lg:grid-cols-2 gap-16 pt-12">
             <div className="space-y-6">
                {[1, 2].map(i => <AnnouncementSkeleton key={i} compact />)}
             </div>
             <div className="space-y-6">
                {[1, 2].map(i => <AnnouncementSkeleton key={i} compact />)}
             </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedAnnouncement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setSelectedAnnouncement(null)}
               className="absolute inset-0 bg-white/40 backdrop-blur-3xl"
             />
             
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-3xl bg-white rounded-[4rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] border border-white/50 overflow-hidden flex flex-col max-h-[85vh]"
             >
                <div className={cn(
                   "h-3 w-full",
                   selectedAnnouncement.priority === 'high' ? 'bg-rose-500 aurora-glow' : 
                   selectedAnnouncement.priority === 'medium' ? 'bg-amber-500 aurora-glow' : 
                   'bg-primary aurora-glow'
                )} />

                <div className="px-12 py-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                   <div className="flex items-center gap-6">
                      <div className={cn(
                        "h-16 w-16 rounded-[2rem] flex items-center justify-center text-white shadow-xl",
                        selectedAnnouncement.priority === 'high' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-primary shadow-primary/20'
                      )}>
                         <Megaphone className="w-8 h-8" />
                      </div>
                      <div>
                         <h2 className="text-4xl font-black text-foreground tracking-tighter leading-tight">{selectedAnnouncement.title}</h2>
                         <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mt-1 flex items-center gap-2">
                           <Clock className="w-3.5 h-3.5" /> Published {new Date(selectedAnnouncement.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                         </p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setSelectedAnnouncement(null)}
                     className="h-14 w-14 rounded-3xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all shadow-sm"
                   >
                      <X className="w-6 h-6" />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto px-12 py-10">
                   <div className="prose prose-slate max-w-none">
                      <p className="text-xl font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
                        {selectedAnnouncement.message}
                      </p>
                   </div>

                    {/* Attachment Download */}
                    {selectedAnnouncement.attachment_url && (
                      <div className="mt-8">
                         <a 
                           href={announcementApi.getAttachmentUrl(selectedAnnouncement.attachment_url)} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="flex items-center gap-4 p-8 rounded-[3rem] bg-primary text-white hover:bg-primary/90 transition-all group shadow-2xl shadow-primary/20"
                         >
                            <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform">
                               <Paperclip className="w-7 h-7" />
                            </div>
                            <div>
                               <p className="text-[10px] font-black uppercase text-white/60 tracking-widest">Institutional Asset</p>
                               <p className="text-xl font-black italic">View Attached Document</p>
                            </div>
                            <ChevronRight className="w-6 h-6 ml-auto text-white group-hover:translate-x-2 transition-all" />
                         </a>
                      </div>
                    )}

                   <div className="mt-16 flex items-center gap-6 p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100">
                      <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-primary shadow-sm">
                         <Sparkles className="w-7 h-7" />
                      </div>
                      <div className="flex-1">
                         <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Faculty Signature</p>
                         <p className="text-lg font-black text-foreground italic">{selectedAnnouncement.teacher_name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
                         <CheckCircle2 className="w-3.5 h-3.5" /> Secure Delivery
                      </div>
                   </div>
                </div>

                <div className="px-12 py-8 bg-slate-50/50 border-t border-slate-100 text-center">
                   <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em]">Nexus Communication Matrix · Version 4.0</p>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnnouncementCard({ announcement, onClick, index, compact = false }: any) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={cn(
        "premium-glass group relative overflow-hidden transition-all duration-500 cursor-pointer border-glass-border hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10",
        compact ? "p-6 rounded-[2rem] flex items-center gap-6" : "p-10 rounded-[3rem] flex flex-col gap-6",
        !announcement.is_read && "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/30"
      )}
    >
      {/* Unread Glow */}
      {!announcement.is_read && (
        <div className="absolute top-0 left-0 w-full h-full bg-primary/[0.02] pointer-events-none" />
      )}

      {/* Priority Indicator */}
      <div className={cn(
        "absolute top-0 left-0 h-full w-1.5 transition-all opacity-40 group-hover:opacity-100",
        announcement.priority === 'high' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' :
        announcement.priority === 'medium' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
        'bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]'
      )} />

      <div className={cn(
        "rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 shadow-lg",
        compact ? "h-14 w-14 text-sm" : "h-16 w-16 text-lg",
        announcement.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'
      )}>
        {announcement.type === 'class' ? <Users className={compact ? "w-6 h-6" : "w-8 h-8"} /> : <User className={compact ? "w-6 h-6" : "w-8 h-8"} />}
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
             <h3 className={cn("font-black tracking-tight group-hover:text-primary transition-colors", compact ? "text-lg" : "text-2xl")}>
               {announcement.title}
             </h3>
             {!announcement.is_read && (
               <span className="w-2 h-2 rounded-full bg-primary aurora-glow shadow-[0_0_10px_rgba(var(--primary),0.8)] animate-pulse" />
             )}
          </div>
          <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-40 italic shrink-0">
             {new Date(announcement.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        {!compact && (
          <p className="text-sm text-muted-foreground font-medium line-clamp-2 leading-relaxed">
            {announcement.message}
          </p>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
             <Sparkles className="w-3 h-3 text-primary/50" /> {announcement.teacher_name}
             {announcement.attachment_url && (
               <span className="flex items-center gap-1 text-primary">
                 <Paperclip className="w-3 h-3" /> Asset Attached
               </span>
             )}
          </p>
          <ChevronRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="py-20 flex flex-col items-center justify-center premium-glass rounded-[2.5rem] border-dashed border-primary/20 opacity-40">
       <div className="text-primary/40 mb-6">
          {icon}
       </div>
       <p className="text-xs font-black uppercase tracking-[0.2em] italic text-center">{message}</p>
    </div>
  );
}

function AnnouncementSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(
      "premium-glass p-10 rounded-[3rem] border-glass-border animate-pulse",
      compact ? "flex items-center gap-6 p-6 rounded-[2rem]" : "flex flex-col gap-6"
    )}>
       <div className={cn(
         "rounded-2xl bg-primary/5",
         compact ? "h-14 w-14" : "h-16 w-16"
       )} />
       <div className="flex-1 space-y-4">
          <div className="flex justify-between">
             <div className="h-6 w-1/2 bg-primary/5 rounded-lg" />
             <div className="h-4 w-12 bg-primary/5 rounded-lg" />
          </div>
          {!compact && <div className="h-12 w-full bg-primary/5 rounded-xl" />}
          <div className="h-3 w-24 bg-primary/5 rounded-lg" />
       </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
