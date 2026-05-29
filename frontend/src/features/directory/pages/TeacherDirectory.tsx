import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Pencil, Trash2,
  Key, Shield, Mail, Phone, BookOpen, X, Search,
  School, CheckCircle, AlertCircle, Users, ChevronDown, Loader
} from 'lucide-react';
import { directoryApi, type TeacherWithPassword } from '@/features/directory/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';

/** Password policy mirrors `validate_password_strength` in the backend. */
const PASSWORD_RULES: Array<{ label: string; test: (v: string) => boolean }> = [
  { label: 'At least 10 characters', test: v => v.length >= 10 },
  { label: 'One uppercase letter', test: v => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: v => /[a-z]/.test(v) },
  { label: 'One digit (0-9)', test: v => /\d/.test(v) },
  { label: 'One special character (!@#$…)', test: v => /[!@#$%^&*()_+\-=[\]{};:'",.<>?/]/.test(v) },
];

function validatePassword(v: string): { ok: boolean; failing: string[] } {
  const failing = PASSWORD_RULES.filter(r => !r.test(v)).map(r => r.label);
  return { ok: failing.length === 0, failing };
}

export default function TeacherDirectory() {
  const {
    schoolClasses,
    subjects,
    teachers,
    isDirectoryLoading,
    refreshTeachers
  } = useApp();

  useEffect(() => {
    refreshTeachers();
  }, []);

  const [isAdding, setIsAdding] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherWithPassword | null>(null);
  const [isAssigningId, setIsAssigningId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [assignmentForm, setAssignmentForm] = useState({ school_class_id: 0, subject_id: 0 });
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // Delete confirmation
  const [pendingDeleteTeacher, setPendingDeleteTeacher] = useState<TeacherWithPassword | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  // Lock body scroll while any of our larger modals are open so the
  // page underneath can't be scrolled into blank space.
  useEffect(() => {
    const anyOpen = isAdding || !!editingTeacher || isAssigningId != null;
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isAdding, editingTeacher, isAssigningId]);

  // Auto-dismiss feedback banners
  useEffect(() => {
    if (!pageSuccess) return;
    const t = setTimeout(() => setPageSuccess(null), 3500);
    return () => clearTimeout(t);
  }, [pageSuccess]);

  const isAssigning = useMemo(() =>
    teachers.find(t => t.id === isAssigningId),
    [teachers, isAssigningId]
  );

  const filteredTeachers = useMemo(() => {
    if (!searchTerm.trim()) return teachers;
    const low = searchTerm.toLowerCase();
    return teachers.filter((t) =>
      t.name.toLowerCase().includes(low) ||
      t.email?.toLowerCase().includes(low) ||
      t.phone?.includes(low)
    );
  }, [teachers, searchTerm]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    // Client-side password policy mirrors the backend so admins see
    // failures immediately instead of being told "Failed to add teacher"
    // by a 422 with a generic reason.
    const pw = validatePassword(form.password);
    if (!pw.ok) {
      setFormError(
        'Password is too weak. Missing: ' + pw.failing.join(', ') + '.',
      );
      return;
    }
    setIsSubmittingForm(true);
    try {
      await directoryApi.createTeacher(form);
      setFormSuccess(true);
      setForm({ name: '', email: '', phone: '', password: '' });
      refreshTeachers();
      setTimeout(() => { setFormSuccess(false); setIsAdding(false); }, 1200);
    } catch (err) {
      setFormError(getErrorMessage(err).message || 'Failed to add teacher.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setEditError(null);
    setIsSubmittingEdit(true);
    try {
      await directoryApi.updateTeacher(editingTeacher.id, {
        name: editingTeacher.name,
        email: editingTeacher.email,
        phone: editingTeacher.phone
      });
      setEditingTeacher(null);
      refreshTeachers();
    } catch (err) {
      setEditError(getErrorMessage(err).message || 'Failed to update teacher.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDelete = (teacher: TeacherWithPassword) => {
    setPageError(null);
    setPendingDeleteTeacher(teacher);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteTeacher) return;
    setDeleting(true);
    try {
      await directoryApi.deleteTeacher(pendingDeleteTeacher.id);
      setPageSuccess(`Removed ${pendingDeleteTeacher.name}.`);
      setPendingDeleteTeacher(null);
      refreshTeachers();
    } catch (err) {
      setPageError(getErrorMessage(err).message || 'Unable to delete this teacher.');
      setPendingDeleteTeacher(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAssigning || !assignmentForm.school_class_id || !assignmentForm.subject_id) return;
    setAssignError(null);
    setIsSubmittingAssign(true);
    try {
      await directoryApi.createAssignment({
        teacher_id: isAssigning.id,
        ...assignmentForm
      });
      setAssignmentForm({ school_class_id: 0, subject_id: 0 });
      await refreshTeachers();
    } catch (err) {
      setAssignError(getErrorMessage(err).message || 'Failed to add assignment.');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await directoryApi.deleteAssignment(id);
      refreshTeachers();
    } catch (err) { console.error(err); }
  };

  const totalAssignments = useMemo(() =>
    teachers.reduce((sum, t) => sum + (t.assignments?.length ?? 0), 0),
    [teachers]
  );

  const pwCheck = validatePassword(form.password);

  return (
    <div className="w-full animate-fade-in flex flex-col gap-8 pb-20">

      {pageError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{pageError}</span>
          <button onClick={() => setPageError(null)} className="opacity-50 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {pageSuccess && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{pageSuccess}</span>
          <button onClick={() => setPageSuccess(null)} className="opacity-50 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <Shield className="w-3 h-3" /> Staff Management
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gradient-indigo">Teacher Directory</h1>
          <p className="text-text-secondary text-sm font-medium max-w-xl">
            Manage teacher profiles, credentials, and class assignments.
          </p>
        </div>

        <button
          onClick={() => { setIsAdding(true); setFormError(null); setFormSuccess(false); }}
          className="indigo-glow-button h-[50px] px-7 self-start xl:self-auto"
        >
          <UserPlus className="w-4 h-4 mr-2" /> Add Teacher
        </button>
      </div>

      {/* Stats + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-brand-indigo" />
            </div>
            <div>
              <p className="text-lg font-black text-white leading-none">{teachers.length}</p>
              <p className="text-[10px] text-text-secondary font-medium">Teachers</p>
            </div>
          </div>
          <div className="w-px h-8 bg-glass-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-black text-white leading-none">{totalAssignments}</p>
              <p className="text-[10px] text-text-secondary font-medium">Assignments</p>
            </div>
          </div>
        </div>

        <div className="relative group w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-brand-indigo transition-colors" />
          <input
            placeholder="Search by name or email..."
            className="input-obsidian pl-10 text-sm w-full"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Teacher Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
        {isDirectoryLoading && teachers.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="obsidian-card p-7 space-y-6 animate-pulse border-glass-border">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-3/4 bg-white/5 rounded-lg" />
                  <div className="h-3 w-1/3 bg-white/5 rounded-lg" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-10 w-full bg-white/5 rounded-xl" />
                <div className="h-10 w-full bg-white/5 rounded-xl" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-white/5 rounded-lg" />
                <div className="h-5 w-20 bg-white/5 rounded-lg" />
              </div>
            </div>
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTeachers.map((t) => (
              <motion.div
                layout
                key={t.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="obsidian-card group relative p-0 overflow-hidden transition-all border border-glass-border hover:border-brand-indigo/40 hover:shadow-xl hover:shadow-brand-indigo/5 bg-white/[0.01]"
              >
                <div className="absolute top-0 left-0 w-full h-0.5 aurora-gradient opacity-10 group-hover:opacity-100 transition-opacity" />

                <div className="p-6 space-y-5">
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-2xl text-brand-indigo relative group-hover:scale-105 transition-transform duration-300">
                        {t.name.charAt(0)}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-emerald-500 border-[3px] border-obsidian" />
                      </div>
                      <div>
                        <h4 className="font-black text-lg tracking-tight uppercase group-hover:text-brand-indigo transition-colors leading-tight">{t.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] font-black tracking-widest uppercase bg-brand-indigo/10 text-brand-indigo px-2 py-0.5 rounded-md border border-brand-indigo/20">Teacher</span>
                          {t.assignments?.length > 0 && (
                            <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20">
                              {t.assignments.length} class{t.assignments.length !== 1 ? 'es' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions — visible on hover */}
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all shrink-0">
                      <button onClick={() => { setEditingTeacher(t); setEditError(null); }} className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary hover:text-white transition-all">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(t)} className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                      <Mail className="w-3.5 h-3.5 text-brand-indigo/60 shrink-0" />
                      <span className="text-xs text-text-secondary truncate">{t.email}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-glass-border">
                      <div className="flex items-center gap-3">
                        <Phone className="w-3.5 h-3.5 text-brand-indigo/60 shrink-0" />
                        <span className="text-xs text-text-secondary">{t.phone || 'No phone'}</span>
                      </div>
                      {t.plain_password && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <Key className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] font-black text-amber-500 tabular-nums">{t.plain_password}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assignments */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.15em] text-text-secondary flex items-center gap-1.5">
                        <BookOpen className="w-3 h-3" /> Classes Assigned
                      </h5>
                      <button
                        onClick={() => { setIsAssigningId(t.id); setAssignError(null); setAssignmentForm({ school_class_id: 0, subject_id: 0 }); }}
                        className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-brand-indigo/10 border border-brand-indigo/30 text-brand-indigo hover:bg-brand-indigo hover:text-white hover:border-brand-indigo transition-all cursor-pointer"
                      >
                        Manage →
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                      {t.assignments?.map((a) => (
                        <div key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-glass-border group/tag hover:border-brand-indigo/30 transition-all text-[10px] font-bold">
                          <span className="uppercase tracking-tight">
                            {a.school_class.display_name} · {a.subject_ref.name}
                          </span>
                          <button onClick={() => handleDeleteAssignment(a.id)} className="opacity-0 group-hover/tag:opacity-100 hover:text-rose-400 transition-all ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      {(!t.assignments || t.assignments.length === 0) && (
                        <span className="text-[10px] text-text-secondary opacity-40 italic py-1">No classes assigned yet</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {!isDirectoryLoading && filteredTeachers.length === 0 && teachers.length > 0 && (
        <div className="py-24 obsidian-card border-dashed flex flex-col items-center justify-center gap-4 text-center">
          <Search className="w-8 h-8 text-text-secondary opacity-30" />
          <div className="opacity-50">
            <p className="text-sm font-black uppercase tracking-widest">No teachers found</p>
            <p className="text-xs text-text-secondary mt-1">Try a different search term</p>
          </div>
          <button onClick={() => setSearchTerm('')} className="text-xs text-brand-indigo font-bold hover:underline">Clear search</button>
        </div>
      )}

      {!isDirectoryLoading && teachers.length === 0 && (
        <div className="py-24 obsidian-card border-dashed flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-glass-border flex items-center justify-center">
            <Users className="w-7 h-7 text-text-secondary opacity-40" />
          </div>
          <div className="opacity-50">
            <p className="text-sm font-black uppercase tracking-widest">No teachers yet</p>
            <p className="text-xs text-text-secondary mt-1">Add your first teacher to get started</p>
          </div>
        </div>
      )}

      {/* ── Add Teacher Modal ── */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-md cursor-default"
            />
            <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-6 sm:p-8 shadow-2xl my-4 sm:my-6 pointer-events-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Add Teacher</h2>
                    <p className="text-text-secondary text-xs mt-0.5">Create a new teacher account</p>
                  </div>
                  <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border transition-all">
                    <X className="w-5 h-5 opacity-50" />
                  </button>
                </div>

                {formError && (
                  <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" /> Teacher added successfully!
                  </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Full Name</label>
                    <input autoFocus placeholder="e.g. Anita Sharma" className="input-obsidian" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Email Address</label>
                    <input type="email" placeholder="anita@school.edu" className="input-obsidian" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Phone Number</label>
                    <input placeholder="+91 98765 43210" className="input-obsidian" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Password</label>
                    <input type="password" placeholder="Set login password" className="input-obsidian" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                    <ul className="mt-2 grid grid-cols-1 gap-1">
                      {PASSWORD_RULES.map(r => {
                        const ok = form.password ? r.test(form.password) : false;
                        return (
                          <li key={r.label} className={cn(
                            'flex items-center gap-1.5 text-[10px] font-bold transition-colors',
                            ok ? 'text-emerald-400' : 'text-text-secondary opacity-60',
                          )}>
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              ok ? 'bg-emerald-400' : 'bg-text-secondary/30',
                            )} />
                            {r.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmittingForm || !pwCheck.ok}
                    className={cn(
                      "indigo-glow-button w-full h-12 text-sm font-black uppercase tracking-wider mt-2",
                      (isSubmittingForm || !pwCheck.ok) && "opacity-50 cursor-not-allowed",
                    )}
                    title={!pwCheck.ok ? 'Password does not meet the policy yet' : undefined}
                  >
                    {isSubmittingForm ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Add Teacher'}
                  </button>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Manage Assignments Modal ── */}
      <AnimatePresence>
        {isAssigningId && isAssigning && (
          <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAssigningId(null)}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-md cursor-default"
            />
            <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }} className="relative w-full max-w-2xl obsidian-card border-brand-indigo/30 p-6 sm:p-8 shadow-2xl my-4 sm:my-6 pointer-events-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tight uppercase">{isAssigning.name}</h2>
                  <p className="text-brand-indigo text-xs font-bold tracking-widest uppercase mt-0.5">Manage Class Assignments</p>
                </div>
                <button onClick={() => setIsAssigningId(null)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border transition-all">
                  <X className="w-5 h-5 opacity-50" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Add new assignment */}
                <div className="p-5 rounded-2xl bg-brand-indigo/[0.03] border border-brand-indigo/15">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-indigo mb-4 flex items-center gap-1.5">
                    <UserPlus className="w-3 h-3" /> Add New Assignment
                  </h4>

                  {assignError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {assignError}
                    </div>
                  )}

                  <form onSubmit={handleAddAssignment} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex items-center gap-1.5">
                          <School className="w-3 h-3" /> Class & Section
                        </label>
                        <div className="relative">
                          <select
                            className="input-obsidian text-sm font-semibold appearance-none pr-8"
                            value={assignmentForm.school_class_id || ''}
                            onChange={e => setAssignmentForm({ ...assignmentForm, school_class_id: Number(e.target.value) })}
                            required
                          >
                            <option value="">Select class...</option>
                            {schoolClasses.map(sc => (
                              <option key={sc.id} value={sc.id}>{sc.display_name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex items-center gap-1.5">
                          <BookOpen className="w-3 h-3" /> Subject
                        </label>
                        <div className="relative">
                          <select
                            className="input-obsidian text-sm font-semibold appearance-none pr-8"
                            value={assignmentForm.subject_id || ''}
                            onChange={e => setAssignmentForm({ ...assignmentForm, subject_id: Number(e.target.value) })}
                            required
                          >
                            <option value="">Select subject...</option>
                            {subjects.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                        </div>
                      </div>
                    </div>
                    <button type="submit" disabled={isSubmittingAssign} className={cn("indigo-glow-button w-full h-11 text-xs font-black uppercase tracking-wider", isSubmittingAssign && "opacity-50 cursor-wait")}>
                      {isSubmittingAssign ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Assign Class'}
                    </button>
                  </form>
                </div>

                {/* Existing assignments */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">
                    Current Assignments ({isAssigning.assignments?.length ?? 0})
                  </h4>
                  <div className="space-y-2">
                    {isAssigning.assignments?.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-glass-border hover:border-brand-indigo/20 transition-all group/item">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-brand-indigo/5 border border-brand-indigo/15 flex items-center justify-center font-black text-brand-indigo text-xs">
                            {a.school_class.display_name?.split('-').pop()}
                          </div>
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight">{a.subject_ref.name}</p>
                            <p className="text-[10px] text-text-secondary opacity-60">{a.school_class.display_name}</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteAssignment(a.id)} className="p-1.5 text-rose-500/30 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover/item:opacity-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {(!isAssigning.assignments || isAssigning.assignments.length === 0) && (
                      <div className="py-8 text-center obsidian-card border-dashed border-glass-border opacity-40">
                        <p className="text-xs font-bold uppercase tracking-widest">No assignments yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Teacher Modal ── */}
      <AnimatePresence>
        {editingTeacher && (
          <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTeacher(null)}
              className="fixed inset-0 bg-slate-950/65 backdrop-blur-md cursor-default"
            />
            <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-6 sm:p-8 shadow-2xl my-4 sm:my-6 pointer-events-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Edit Teacher</h2>
                    <p className="text-text-secondary text-xs mt-0.5">Update profile information</p>
                  </div>
                  <button onClick={() => setEditingTeacher(null)} className="p-2 hover:bg-white/5 rounded-xl border border-glass-border transition-all">
                    <X className="w-5 h-5 opacity-50" />
                  </button>
                </div>

                {editError && (
                  <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {editError}
                  </div>
                )}

                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Full Name</label>
                    <input autoFocus className="input-obsidian" value={editingTeacher.name} onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Email Address</label>
                    <input type="email" className="input-obsidian" value={editingTeacher.email} onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Phone Number</label>
                    <input className="input-obsidian" value={editingTeacher.phone || ''} onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })} />
                  </div>
                  <button type="submit" disabled={isSubmittingEdit} className={cn("indigo-glow-button w-full h-12 text-sm font-black uppercase tracking-wider mt-2", isSubmittingEdit && "opacity-50 cursor-wait")}>
                    {isSubmittingEdit ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
                  </button>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Teacher Confirmation ── */}
      <ConfirmModal
        open={!!pendingDeleteTeacher}
        title={`Remove ${pendingDeleteTeacher?.name ?? 'this teacher'}?`}
        confirmLabel="Remove teacher"
        tone="danger"
        isLoading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setPendingDeleteTeacher(null)}
        description="The account, its class assignments, and login access will be revoked. This action cannot be undone."
      >
        {pendingDeleteTeacher && (
          <div className="rounded-xl border border-glass-border bg-slate-900/[0.03] dark:bg-white/[0.02] p-4 text-xs space-y-1.5">
            <p className="font-black text-slate-900 dark:text-white text-sm">{pendingDeleteTeacher.name}</p>
            {pendingDeleteTeacher.email && (
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-bold uppercase tracking-widest opacity-60">Email</span> · {pendingDeleteTeacher.email}
              </p>
            )}
            {pendingDeleteTeacher.assignments?.length > 0 && (
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-bold uppercase tracking-widest opacity-60">Assignments</span> · {pendingDeleteTeacher.assignments.length} class{pendingDeleteTeacher.assignments.length !== 1 ? 'es' : ''}
              </p>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
