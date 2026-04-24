import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Megaphone, Plus, Filter, 
  Paperclip, Send, Trash2, X,
  Users, User, Target, Info, Sparkles,
  FileText, Loader2, AlertCircle, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useApp } from '../../lib/AppContext';
import { announcementApi, type AnnouncementCreate } from '../../api/announcementApi';
import { cn } from '../../lib/utils';

export default function TeacherAnnouncements() {
  const { user } = useAuth();
  const { teacherDirectory, classDirectory } = useApp();
  
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  
  // Form State
  const [form, setForm] = useState<AnnouncementCreate>({
    title: '',
    message: '',
    type: 'class',
    priority: 'low',
    class_id: undefined,
    student_id: undefined
  });

  // Derive Teacher Context
  const currentTeacher = useMemo(() => 
    teacherDirectory.find((t: any) => t.user_id === user?.id), 
    [teacherDirectory, user]
  );
  
  const teacherId = currentTeacher?.id;
  const assignments = currentTeacher?.assignments || [];

  // Filter students based on assigned classes
  const assignedClassIds = assignments.map((a: any) => a.school_class_id);
  const availableStudents = classDirectory.filter((s: any) => 
    assignedClassIds.includes(s.school_class_id)
  );

  const fetchAnnouncements = async () => {
    if (!teacherId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await announcementApi.getTeacherAnnouncements(teacherId);
      setAnnouncements(data);
    } catch (err) {
      console.error(err);
      setError("Synchronous link to broadcast history interrupted.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [teacherId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await announcementApi.createAnnouncement(form);
      setIsAdding(false);
      setForm({
        title: '',
        message: '',
        type: 'class',
        priority: 'low',
        class_id: undefined,
        student_id: undefined
      });
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic size validation
    if (file.size > 5 * 1024 * 1024) {
      alert("Scholastic archives capped at 5MB per directive.");
      return;
    }

    setIsUploading(true);
    try {
      const { url } = await announcementApi.uploadAttachment(file);
      setForm(prev => ({ ...prev, attachment_url: url }));
      setUploadProgress(file.name);
    } catch (err) {
      console.error("Transmission Error:", err);
      alert("Failed to synchronize attachment to storage.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently redact this announcement? This will also remove notification records for all recipients.')) return;
    try {
      await announcementApi.deleteAnnouncement(id);
      fetchAnnouncements();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-12 pb-24">
      
      {/* Header HUD */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Megaphone className="w-3.5 h-3.5" /> Institutional Broadcast
          </div>
          <h1 className="text-7xl font-black tracking-tighter text-white -ml-1">
            Faculty <span className="text-brand-indigo italic">Bulletins</span>
          </h1>
          <p className="text-text-secondary text-lg font-medium max-w-2xl leading-relaxed">
            Broadcast scholastic updates and individual directives across your assigned disciplinary matrix.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <button 
            onClick={() => setIsAdding(true)}
            className="indigo-glow-button h-[64px] px-10 text-sm font-black uppercase tracking-widest italic flex items-center gap-4 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" /> 
            Issue New Decree
          </button>
        </div>
      </div>

      {/* Announcements List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
        {error ? (
          <div className="col-span-full p-20 rounded-[3rem] bg-rose-500/5 border border-rose-500/20 flex flex-col items-center justify-center text-center gap-6">
             <div className="h-16 w-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
             </div>
             <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-widest text-white">Fetch Interrupted</h3>
                <p className="text-sm text-text-secondary font-medium max-w-md">{error}</p>
             </div>
             <button 
               onClick={fetchAnnouncements}
               className="flex items-center gap-3 px-8 py-3 rounded-2xl bg-brand-indigo text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-brand-indigo/20 hover:scale-105 transition-all"
             >
                <RefreshCw className="w-4 h-4" /> Retry Connection
             </button>
          </div>
        ) : isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="obsidian-card p-10 space-y-8 animate-pulse border-glass-border">
              <div className="flex justify-between items-start">
                 <div className="space-y-3 flex-1">
                    <div className="h-4 w-1/4 bg-white/5 rounded-lg" />
                    <div className="h-8 w-3/4 bg-white/5 rounded-xl" />
                 </div>
                 <div className="h-10 w-10 bg-white/5 rounded-xl" />
              </div>
              <div className="space-y-4">
                <div className="h-20 w-full bg-white/5 rounded-2xl" />
              </div>
              <div className="space-y-4 pt-6 border-t border-white/5">
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                       <div className="h-10 w-10 bg-white/5 rounded-xl" />
                       <div className="space-y-2">
                          <div className="h-2 w-16 bg-white/5 rounded" />
                          <div className="h-3 w-24 bg-white/5 rounded" />
                       </div>
                    </div>
                    <div className="space-y-2 text-right">
                       <div className="h-2 w-16 bg-white/5 rounded ml-auto" />
                       <div className="h-4 w-12 bg-white/5 rounded ml-auto" />
                    </div>
                 </div>
                 <div className="h-1.5 w-full bg-white/5 rounded-full" />
              </div>
            </div>
          ))
        ) : announcements.length === 0 ? (
          <div className="col-span-full py-32 flex flex-col items-center justify-center obsidian-card border-dashed border-white/10 opacity-40">
             <Megaphone className="w-20 h-20 mb-8 text-brand-indigo/40" />
             <p className="text-xl font-black uppercase tracking-[0.2em] italic">Zero Active Broadcasts</p>
             <p className="text-sm font-medium mt-2">Begin your faculty outreach by creating a new announcement.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {announcements.map((a: any) => (
              <motion.div
                layout
                key={a.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="obsidian-card group relative p-0 overflow-hidden border border-white/5 hover:border-brand-indigo/30 transition-all duration-500 bg-white/[0.01] hover:bg-white/[0.02]"
              >
                <div className={cn(
                   "absolute top-0 left-0 w-full h-1.5 transition-opacity opacity-20 group-hover:opacity-100",
                   a.priority === 'high' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' :
                   a.priority === 'medium' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
                   'bg-brand-indigo shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                )} />

                <div className="p-10 space-y-8">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "px-3 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                          a.priority === 'high' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                          a.priority === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                          'bg-brand-indigo/10 border-brand-indigo/20 text-brand-indigo'
                        )}>
                          {a.priority} Priority
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary opacity-40 italic">
                          {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black tracking-tight text-white group-hover:text-brand-indigo transition-colors">{a.title}</h3>
                    </div>
                    <button 
                      onClick={() => handleDelete(a.id)}
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  <p className="text-text-secondary text-sm font-medium leading-relaxed line-clamp-3">
                    {a.message}
                  </p>
                  
                  {a.attachment_url && (
                    <a 
                      href={announcementApi.getAttachmentUrl(a.attachment_url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-brand-indigo text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      <Paperclip className="w-3 h-3" /> View Attachment
                    </a>
                  )}

                  <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-brand-indigo">
                          {a.type === 'class' ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-40">Targeting</p>
                          <p className="text-xs font-bold text-white tracking-tight italic">
                            {a.type === 'class' ? 'Operational Segment' : 'Individual Directive'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 aurora-pulse">Engagement Status</p>
                        <p className="text-lg font-black text-white tabular-nums tracking-tighter">
                          {a.read_count} <span className="text-muted-foreground opacity-20 text-sm mx-1">/</span> {a.target_count}
                          <span className="ml-2 text-[10px] text-emerald-400 italic">Parents Seen</span>
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${(a.read_count / a.target_count) * 100}%` }}
                         className="h-full bg-emerald-500 aurora-glow shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                       />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)} 
              className="absolute inset-0 bg-black/95 backdrop-blur-3xl" 
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl obsidian-card border-brand-indigo/30 p-0 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 aurora-gradient" />
              
              <div className="p-12 space-y-12">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
                       <Sparkles className="w-4 h-4" /> Drafting Institutional Directive
                    </div>
                    <h2 className="text-4xl font-black tracking-tight italic uppercase">New Broadcast</h2>
                  </div>
                  <button onClick={() => setIsAdding(false)} className="p-4 hover:bg-white/5 rounded-2xl border border-glass-border transition-colors"><X className="w-8 h-8 opacity-40 hover:opacity-100" /></button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4 flex items-center gap-2">
                        <Info className="w-3.5 h-3.5" /> Directive Title
                      </label>
                      <input 
                        autoFocus 
                        placeholder="e.g. Disciplinary Matrix Update" 
                        className="input-obsidian h-16 text-lg font-bold"
                        value={form.title}
                        onChange={e => setForm({...form, title: e.target.value})}
                        required 
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4 flex items-center gap-2">
                         <Target className="w-3.5 h-3.5" /> Disciplinary Scope
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setForm({...form, type: 'class', student_id: undefined})}
                          className={cn(
                            "h-16 rounded-2xl border flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all",
                            form.type === 'class' ? 'bg-brand-indigo/10 border-brand-indigo shadow-[0_0_20px_rgba(99,102,241,0.2)] text-brand-indigo' : 'bg-white/5 border-white/5 text-text-secondary hover:bg-white/10'
                          )}
                        >
                          <Users className="w-4.5 h-4.5" /> Class-Wide
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm({...form, type: 'student', class_id: undefined})}
                          className={cn(
                            "h-16 rounded-2xl border flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all",
                            form.type === 'student' ? 'bg-brand-indigo/10 border-brand-indigo shadow-[0_0_20px_rgba(99,102,241,0.2)] text-brand-indigo' : 'bg-white/5 border-white/5 text-text-secondary hover:bg-white/10'
                          )}
                        >
                          <User className="w-4.5 h-4.5" /> Individual
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4 flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5" /> Priority Level
                      </label>
                      <div className="flex gap-4">
                        {['low', 'medium', 'high'].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setForm({...form, priority: p as any})}
                            className={cn(
                              "flex-1 h-12 rounded-xl border font-black text-[9px] uppercase tracking-widest transition-all",
                              form.priority === p 
                                ? p === 'high' ? 'bg-rose-500/10 border-rose-500 text-rose-500' :
                                  p === 'medium' ? 'bg-amber-500/10 border-amber-500 text-amber-500' :
                                  'bg-brand-indigo/10 border-brand-indigo text-brand-indigo'
                                : 'bg-white/5 border-white/5 text-text-secondary opacity-40 hover:opacity-100'
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4">Detailed Message</label>
                      <textarea 
                        placeholder="Detail the institutional directive..." 
                        className="input-obsidian min-h-[160px] py-6 leading-relaxed font-medium"
                        value={form.message}
                        onChange={e => setForm({...form, message: e.target.value})}
                        required 
                      />
                    </div>

                    {/* Attachment Feedback */}
                    <AnimatePresence>
                      {uploadProgress && (
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                          className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4 text-emerald-400">
                             <FileText className="w-5 h-5" />
                             <div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Attached Asset</p>
                                <p className="text-xs font-bold truncate max-w-[200px] italic">{uploadProgress}</p>
                             </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => { setForm(prev => ({...prev, attachment_url: undefined})); setUploadProgress(null); }}
                            className="p-2 hover:bg-emerald-500/20 rounded-lg transition-colors"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" /> Target Recipients
                      </label>
                      {form.type === 'class' ? (
                        <select 
                          className="input-obsidian h-16 font-bold"
                          value={form.class_id || ''}
                          onChange={e => setForm({...form, class_id: Number(e.target.value)})}
                          required
                        >
                          <option value="">Select Target Class...</option>
                          {assignments.map((a: any) => (
                            <option key={a.id} value={a.school_class_id}>
                              {a.school_class.display_name} ({a.subject_ref.name})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select 
                          className="input-obsidian h-16 font-bold"
                          value={form.student_id || ''}
                          onChange={e => setForm({...form, student_id: Number(e.target.value)})}
                          required
                        >
                          <option value="">Select Target Student...</option>
                          {availableStudents.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.school_class.display_name})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="col-span-full pt-6 flex items-center gap-8">
                    <button type="submit" className="indigo-glow-button flex-1 h-20 text-sm font-black uppercase tracking-[0.3em] italic flex items-center justify-center gap-4 group">
                      Initialize Broadcast <Send className="w-6 h-6 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform" />
                    </button>
                    <label className="w-20 h-20 flex items-center justify-center rounded-3xl bg-white/5 border border-white/5 hover:border-white/20 transition-all text-text-secondary hover:text-white cursor-pointer relative overflow-hidden group">
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                      {isUploading ? <Loader2 className="w-7 h-7 animate-spin text-brand-indigo" /> : <Paperclip className="w-7 h-7" />}
                      <div className="absolute inset-0 bg-brand-indigo/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
