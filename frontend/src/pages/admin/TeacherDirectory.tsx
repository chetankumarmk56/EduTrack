import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, Pencil, Trash2, 
  Key, Shield, Mail, Phone, Library, X, Sparkles, School
} from 'lucide-react';
import { directoryApi } from '../../api/directoryApi';
import { useApp } from '../../lib/AppContext';
import { cn } from '../../lib/utils';

export default function TeacherDirectory() {
  const { 
    schoolClasses, 
    subjects, 
    teachers, 
    isDirectoryLoading, 
    refreshDirectory,
    refreshTeachers
  } = useApp();

  useEffect(() => {
    refreshTeachers();
  }, []);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [isAssigningId, setIsAssigningId] = useState<number | null>(null);
  const isAssigning = useMemo(() => 
    teachers.find(t => t.id === isAssigningId), 
    [teachers, isAssigningId]
  );
  
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [assignmentForm, setAssignmentForm] = useState({ school_class_id: 0, subject_id: 0 });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await directoryApi.createTeacher(form);
      setIsAdding(false);
      setForm({ name: '', email: '', phone: '', password: '' });
      refreshTeachers();
    } catch (err) { console.error(err); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    try {
      await directoryApi.updateTeacher(editingTeacher.id, {
        name: editingTeacher.name,
        email: editingTeacher.email,
        phone: editingTeacher.phone
      });
      setEditingTeacher(null);
      refreshTeachers();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Permanent removal of faculty member? This action is irreversible.')) return;
    try {
      await directoryApi.deleteTeacher(id);
      refreshTeachers();
    } catch (err) { console.error(err); }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAssigning || !assignmentForm.school_class_id || !assignmentForm.subject_id) return;
    try {
      await directoryApi.createAssignment({
        teacher_id: isAssigning.id,
        ...assignmentForm
      });
      setAssignmentForm({ school_class_id: 0, subject_id: 0 });
      // Keep modal open but refresh data
      await refreshTeachers(); 
    } catch (err) { console.error(err); }
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await directoryApi.deleteAssignment(id);
      refreshTeachers();
    } catch (err) { console.error(err); }
  };

  const filteredTeachers = teachers;

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-10 pb-20">
      
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <Shield className="w-3 h-3" /> Faculty Governance
          </div>
          <h1 className="text-5xl font-black tracking-tight text-gradient-indigo">Teacher Directory</h1>
          <p className="text-text-secondary text-base font-medium max-w-xl">
            Authorize faculty credentials and manage disciplinary assignments across the institutional matrix.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => setIsAdding(true)}
            className="indigo-glow-button h-[54px] px-8"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Register Faculty
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8">
        {isDirectoryLoading && teachers.length === 0 ? (
          // Skeleton Loader
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="obsidian-card p-8 space-y-8 animate-pulse border-glass-border">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white/5" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-3/4 bg-white/5 rounded-lg" />
                  <div className="h-3 w-1/3 bg-white/5 rounded-lg" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="h-10 w-full bg-white/5 rounded-xl" />
                <div className="h-10 w-full bg-white/5 rounded-xl" />
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-white/5 rounded-lg" />
                <div className="h-6 w-24 bg-white/5 rounded-lg" />
              </div>
            </div>
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTeachers.map((t: any) => (
            <motion.div
              layout
              key={t.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="obsidian-card group relative p-0 overflow-hidden transition-all border border-glass-border hover:border-brand-indigo/40 hover:shadow-2xl hover:shadow-brand-indigo/5 bg-white/[0.01]"
            >
              <div className="absolute top-0 left-0 w-full h-1 aurora-gradient opacity-10 group-hover:opacity-100 transition-opacity" />
              
              <div className="p-8 space-y-8">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-2xl text-brand-indigo relative shadow-inner group-hover:scale-105 transition-all duration-500">
                      {t.name.charAt(0)}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg bg-emerald-500 border-[3px] border-obsidian" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="font-black text-xl tracking-tight uppercase italic text-white group-hover:text-brand-indigo transition-colors">{t.name}</h4>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black tracking-widest uppercase bg-brand-indigo/10 text-brand-indigo px-2 py-0.5 rounded-lg border border-brand-indigo/20">Executive Faculty</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                    <button onClick={() => setEditingTeacher(t)} className="p-2.5 rounded-xl bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary transition-all"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-glass-border">
                    <Mail className="w-4 h-4 text-brand-indigo/60" />
                    <span className="text-xs font-bold text-text-secondary">{t.email}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-glass-border">
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-brand-indigo/60" />
                      <span className="text-xs font-bold text-text-secondary">{t.phone || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg group/key">
                      <Key className="w-3 h-3 text-amber-500" />
                      <span className="text-[10px] font-black text-amber-500 tabular-nums">{t.plain_password || '********'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
                      <Library className="w-3.5 h-3.5" /> Disciplinary Assets
                    </h5>
                    <button 
                      onClick={() => setIsAssigningId(t.id)}
                      className="text-[9px] font-black uppercase tracking-widest text-brand-indigo hover:text-white transition-colors underline underline-offset-4"
                    >
                      Configure Assignments
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {t.assignments?.map((a: any) => (
                      <div key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-glass-border group/tag hover:border-brand-indigo/40 transition-all">
                        <span className="text-[10px] font-black uppercase italic tracking-tighter">
                          {a.school_class.display_name} <span className="mx-1 opacity-20">•</span> {a.subject_ref.name}
                        </span>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover/tag:opacity-100 p-0.5 hover:text-rose-500 transition-all"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    {(!t.assignments || t.assignments.length === 0) && (
                      <div className="text-[10px] font-bold text-text-secondary opacity-40 italic px-2">Zero Active Assignments</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>

      {/* Register Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-10 shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-3xl font-black tracking-tight uppercase italic">Register Faculty</h2>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border"><X className="w-6 h-6 opacity-40" /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4">Full Identity</label>
                  <input autoFocus placeholder="e.g. Dr. Julian Vane" className="input-obsidian" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4">Official Email</label>
                  <input type="email" placeholder="julian@nexus.edu" className="input-obsidian" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4">Contact Protocol</label>
                  <input placeholder="+91..." className="input-obsidian" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-4">Key Logic (Password)</label>
                  <input placeholder="Enter secret key..." className="input-obsidian" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
                </div>
                <button type="submit" className="indigo-glow-button w-full h-16 text-sm font-black uppercase tracking-widest italic group">
                   Authorize Registration <Sparkles className="w-5 h-5 ml-3 group-hover:rotate-12 transition-transform" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAssigningId && isAssigning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAssigningId(null)} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-3xl obsidian-card border-brand-indigo/30 p-10 shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tight uppercase italic">{isAssigning.name}</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-indigo opacity-80">Matrix Alignment Configuration</p>
                </div>
                <button onClick={() => setIsAssigningId(null)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border"><X className="w-6 h-6 opacity-40" /></button>
              </div>
              
              <div className="space-y-10">
                <form onSubmit={handleAddAssignment} className="space-y-6 p-6 rounded-2xl bg-brand-indigo/[0.02] border border-brand-indigo/20">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2 flex items-center gap-2"><School className="w-3 h-3" /> Target Segment</label>
                      <select 
                        className="input-obsidian text-xs font-bold"
                        value={assignmentForm.school_class_id || ''}
                        onChange={e => setAssignmentForm({...assignmentForm, school_class_id: Number(e.target.value)})}
                        required
                      >
                        <option value="">Operational Unit...</option>
                        {schoolClasses.map(sc => (
                          <option key={sc.id} value={sc.id}>{sc.display_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2 flex items-center gap-2"><Library className="w-3 h-3" /> Discipline Mapping</label>
                      <select 
                        className="input-obsidian text-xs font-bold"
                        value={assignmentForm.subject_id || ''}
                        onChange={e => setAssignmentForm({...assignmentForm, subject_id: Number(e.target.value)})}
                        required
                      >
                        <option value="">Discipline...</option>
                        {subjects.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="indigo-glow-button w-full h-12 text-[10px] font-black uppercase tracking-[0.2em] italic">Deploy Mapping</button>
                </form>

                <div className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-text-secondary ml-2">Active Protocol Assignments</h4>
                   <div className="grid gap-3">
                    {isAssigning.assignments?.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-glass-border">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-brand-indigo/5 border border-brand-indigo/10 flex items-center justify-center font-black text-brand-indigo text-xs italic shadow-inner">
                            {a.school_class.display_name.split('-').pop()}
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase italic tracking-tight">{a.subject_ref.name}</p>
                            <p className="text-[8px] font-bold text-text-secondary opacity-40 tracking-widest">{a.school_class.display_name}</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="p-2 text-rose-500/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {(!isAssigning.assignments || isAssigning.assignments.length === 0) && (
                      <div className="py-10 text-center obsidian-card border-dashed border-glass-border opacity-20">
                         <p className="text-[10px] font-black uppercase tracking-widest italic">Zero Mappings Configured</p>
                      </div>
                    )}
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Teacher Modal */}
      <AnimatePresence>
        {editingTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingTeacher(null)} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-10 shadow-2xl">
              <div className="flex items-center justify-between mb-10">
                <hgroup>
                  <h2 className="text-3xl font-black tracking-tight uppercase italic">Configure Bio</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-indigo opacity-70">Identity Core Refinement</p>
                </hgroup>
                <button onClick={() => setEditingTeacher(null)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border"><X className="w-6 h-6 opacity-40" /></button>
              </div>
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="space-y-2">
                  <input autoFocus className="input-obsidian" value={editingTeacher.name} onChange={e => setEditingTeacher({...editingTeacher, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <input className="input-obsidian" value={editingTeacher.email} onChange={e => setEditingTeacher({...editingTeacher, email: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <input className="input-obsidian" value={editingTeacher.phone || ''} onChange={e => setEditingTeacher({...editingTeacher, phone: e.target.value})} />
                </div>
                <button type="submit" className="indigo-glow-button w-full h-16 text-sm font-black uppercase tracking-widest italic">Commit Core Sync</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
