import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Pencil, Trash2,
  Key, Shield, Mail, Phone, BookOpen, X, Search,
  School, AlertCircle, Users, ChevronDown, Loader, Plus,
} from 'lucide-react';
import { directoryApi, type TeacherWithPassword } from '@/features/directory/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import ModalShell, { ModalHeader, ModalBody, ModalFooter } from '@/shared/components/ui/ModalShell';
import { useToast } from '@/shared/components/ui/Toast';

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
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [assignmentForm, setAssignmentForm] = useState({ school_class_id: 0, subject_id: 0 });
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);
  // Local-only search inside the Manage Assignments modal.
  const [assignmentSearch, setAssignmentSearch] = useState('');

  // Delete confirmation
  const [pendingDeleteTeacher, setPendingDeleteTeacher] = useState<TeacherWithPassword | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

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
      const created = await directoryApi.createTeacher(form);
      setForm({ name: '', email: '', phone: '', password: '' });
      refreshTeachers();
      setIsAdding(false);
      toast.success('Teacher added', created?.name);
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
      const updated = await directoryApi.updateTeacher(editingTeacher.id, {
        name: editingTeacher.name,
        email: editingTeacher.email,
        phone: editingTeacher.phone
      });
      setEditingTeacher(null);
      refreshTeachers();
      toast.success('Profile updated', updated?.name);
    } catch (err) {
      setEditError(getErrorMessage(err).message || 'Failed to update teacher.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDelete = (teacher: TeacherWithPassword) => {
    setPendingDeleteTeacher(teacher);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteTeacher) return;
    const target = pendingDeleteTeacher;
    setDeleting(true);
    try {
      await directoryApi.deleteTeacher(target.id);
      toast.success('Teacher removed', `${target.name} was removed from the directory.`);
      setPendingDeleteTeacher(null);
      refreshTeachers();
    } catch (err) {
      toast.error('Could not remove teacher', getErrorMessage(err).message || 'Please try again.');
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
      toast.success('Class assigned');
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
      toast.success('Assignment removed');
    } catch (err) {
      toast.error('Could not remove assignment', getErrorMessage(err).message || 'Please try again.');
    }
  };

  const totalAssignments = useMemo(() =>
    teachers.reduce((sum, t) => sum + (t.assignments?.length ?? 0), 0),
    [teachers]
  );

  const pwCheck = validatePassword(form.password);

  return (
    <div className="w-full animate-fade-in flex flex-col gap-8 pb-20">

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
          onClick={() => { setIsAdding(true); setFormError(null); }}
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
              <p className="text-[10px] text-text-secondary font-medium">Assigned</p>
            </div>
          </div>
        </div>

        <div className="relative group w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-brand-indigo transition-colors" />
          <input
            placeholder="Search"
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
                      {t.plain_password ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <Key className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] font-black text-amber-500 tabular-nums">{t.plain_password}</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingTeacher(t); setEditError(null); }}
                          title="No stored password for this teacher — reset it to set a visible one"
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-glass-border rounded-lg text-text-secondary hover:text-amber-500 hover:border-amber-500/30 transition-colors"
                        >
                          <Key className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-wider">Reset to reveal</span>
                        </button>
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
                        onClick={() => { setIsAssigningId(t.id); setAssignError(null); setAssignmentForm({ school_class_id: 0, subject_id: 0 }); setAssignmentSearch(''); }}
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
      <ModalShell
        open={isAdding}
        onClose={() => !isSubmittingForm && setIsAdding(false)}
        size="lg"
        locked={isSubmittingForm}
        labelledBy="add-teacher-title"
      >
        <ModalHeader
          id="add-teacher-title"
          icon={<UserPlus className="w-4 h-4" />}
          title="Add teacher"
          subtitle="Create a new teacher account and set their login credentials."
          onClose={() => !isSubmittingForm && setIsAdding(false)}
        />

        <ModalBody>
          {formError && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="leading-snug">{formError}</span>
            </div>
          )}

          <form id="add-teacher-form" onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CompactField label="Full name" required className="sm:col-span-2">
              <input
                autoFocus
                placeholder="e.g. Anita Sharma"
                className="input-modal"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </CompactField>
            <CompactField label="Email">
              <input
                type="email"
                placeholder="anita@school.edu"
                className="input-modal"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </CompactField>
            <CompactField label="Phone">
              <input
                placeholder="+91 98765 43210"
                className="input-modal"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                required
              />
            </CompactField>
            <CompactField label="Password" required className="sm:col-span-2">
              <input
                type="password"
                placeholder="Set login password"
                className="input-modal"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {PASSWORD_RULES.map(r => {
                  const ok = form.password ? r.test(form.password) : false;
                  return (
                    <li key={r.label} className={cn(
                      'flex items-center gap-1.5 text-[10.5px] transition-colors',
                      ok ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-text-secondary opacity-70',
                    )}>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        ok ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-text-secondary/40',
                      )} />
                      {r.label}
                    </li>
                  );
                })}
              </ul>
            </CompactField>
          </form>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            disabled={isSubmittingForm}
            className="modal-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-teacher-form"
            disabled={isSubmittingForm || !pwCheck.ok}
            className={cn('modal-btn-primary', (isSubmittingForm || !pwCheck.ok) && 'opacity-50 cursor-not-allowed')}
            title={!pwCheck.ok ? 'Password does not meet the policy yet' : undefined}
          >
            {isSubmittingForm && <Loader className="w-3.5 h-3.5 animate-spin" />}
            Add teacher
          </button>
        </ModalFooter>
      </ModalShell>

      {/* ── Manage Assignments Modal ── */}
      <ModalShell
        open={!!(isAssigningId && isAssigning)}
        onClose={() => setIsAssigningId(null)}
        size="xl"
        labelledBy="manage-assignments-title"
      >
        {isAssigning && (() => {
          const assignments = isAssigning.assignments ?? [];
          const totalAssignments = assignments.length;

          const q = assignmentSearch.trim().toLowerCase();
          const filtered = q
            ? assignments.filter(a =>
                (a.school_class.display_name || '').toLowerCase().includes(q) ||
                (a.subject_ref.name || '').toLowerCase().includes(q),
              )
            : assignments;

          const byClass = new Map<string, typeof assignments>();
          for (const a of filtered) {
            const key = a.school_class.display_name || '—';
            if (!byClass.has(key)) byClass.set(key, []);
            byClass.get(key)!.push(a);
          }
          const groupedClasses = Array.from(byClass.entries())
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

          const distinctSubjects = new Set(assignments.map(a => a.subject_ref.name)).size;
          const distinctClasses = new Set(assignments.map(a => a.school_class.display_name)).size;
          const initials = isAssigning.name
            .split(/\s+/)
            .map(s => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();

          return (
            <>
              {/* Header: avatar + name + summary stats inline */}
              <header className="shrink-0 flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-glass-border">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-indigo/12 border border-brand-indigo/25 grid place-items-center text-brand-indigo text-[11px] font-bold">
                  {initials || 'T'}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 id="manage-assignments-title" className="text-[15px] sm:text-base font-bold tracking-tight text-foreground truncate">
                    {isAssigning.name}
                  </h2>
                  <p className="text-text-secondary text-[12px] mt-0.5 leading-snug">
                    Manage class &amp; subject assignments
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <StatChip label="classes" value={distinctClasses} />
                  <StatChip label="subjects" value={distinctSubjects} />
                  <StatChip label="total" value={totalAssignments} accent />
                </div>
                <button
                  type="button"
                  onClick={() => setIsAssigningId(null)}
                  className="shrink-0 -mt-1 -mr-1.5 w-8 h-8 grid place-items-center rounded-lg text-text-secondary hover:text-foreground hover:bg-white/[0.06] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              {/* Add row — sticky, single line on desktop */}
              <div className="shrink-0 px-5 sm:px-6 py-3 border-b border-glass-border modal-section">
                {assignError && (
                  <div className="mb-2.5 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="leading-snug">{assignError}</span>
                  </div>
                )}
                <form
                  onSubmit={handleAddAssignment}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center"
                >
                  <div className="relative">
                    <School className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none z-10" />
                    <select
                      className="input-modal pl-8 pr-7"
                      value={assignmentForm.school_class_id || ''}
                      onChange={e => setAssignmentForm({ ...assignmentForm, school_class_id: Number(e.target.value) })}
                      required
                    >
                      <option value="">Class &amp; section…</option>
                      {schoolClasses.map(sc => (
                        <option key={sc.id} value={sc.id}>{sc.display_name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                  </div>
                  <div className="relative">
                    <BookOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none z-10" />
                    <select
                      className="input-modal pl-8 pr-7"
                      value={assignmentForm.subject_id || ''}
                      onChange={e => setAssignmentForm({ ...assignmentForm, subject_id: Number(e.target.value) })}
                      required
                    >
                      <option value="">Subject…</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmittingAssign || !assignmentForm.school_class_id || !assignmentForm.subject_id}
                    className={cn(
                      'modal-btn-primary h-9 px-3.5 text-xs gap-1.5',
                      (isSubmittingAssign || !assignmentForm.school_class_id || !assignmentForm.subject_id) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {isSubmittingAssign
                      ? <Loader className="w-3.5 h-3.5 animate-spin" />
                      : <><Plus className="w-3.5 h-3.5" /> Assign</>}
                  </button>
                </form>
              </div>

              {/* Search + compact responsive class grid */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-3">
                {totalAssignments > 0 && (
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary z-10" />
                    <input
                      type="search"
                      placeholder="Filter by class or subject…"
                      className="input-modal pl-8 pr-8"
                      value={assignmentSearch}
                      onChange={e => setAssignmentSearch(e.target.value)}
                    />
                    {assignmentSearch && (
                      <button
                        type="button"
                        onClick={() => setAssignmentSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {totalAssignments === 0 ? (
                  <div className="py-10 text-center border border-dashed border-glass-border rounded-xl">
                    <div className="w-10 h-10 mx-auto rounded-lg bg-brand-indigo/10 border border-brand-indigo/20 grid place-items-center text-brand-indigo mb-2.5">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <p className="text-[13px] font-semibold text-foreground">No assignments yet</p>
                    <p className="text-[11.5px] text-text-secondary mt-1 max-w-xs mx-auto leading-relaxed">
                      Pick a class &amp; subject above to give {isAssigning.name.split(' ')[0]} their first teaching slot.
                    </p>
                  </div>
                ) : groupedClasses.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-glass-border rounded-xl">
                    <Search className="w-4 h-4 mx-auto text-text-secondary mb-2 opacity-60" />
                    <p className="text-[12px] font-semibold text-foreground">No matches</p>
                    <p className="text-[11.5px] text-text-secondary mt-0.5">
                      Nothing matches “{assignmentSearch}”.
                    </p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {groupedClasses.map(([className, items]) => (
                      <li
                        key={className}
                        className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg border border-glass-border hover:border-brand-indigo/25 hover:bg-white/[0.02] dark:hover:bg-white/[0.02] transition-colors min-w-0"
                      >
                        <span className="inline-flex items-center justify-center min-w-[44px] h-6 px-1.5 rounded-md bg-brand-indigo/12 border border-brand-indigo/25 text-brand-indigo text-[11px] font-bold tabular-nums shrink-0">
                          {className}
                        </span>
                        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
                          {items.map(a => (
                            <span
                              key={a.id}
                              className="group/chip inline-flex items-center gap-0.5 pl-1.5 pr-0.5 h-5 rounded text-[11px] font-medium text-foreground hover:bg-rose-500/[0.06] transition-colors"
                            >
                              <span className="truncate max-w-[120px]">{a.subject_ref.name}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteAssignment(a.id)}
                                className="w-4 h-4 grid place-items-center rounded text-text-secondary/60 hover:text-rose-500 transition-colors"
                                title={`Remove ${a.subject_ref.name}`}
                                aria-label={`Remove ${a.subject_ref.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ModalFooter
                leading={
                  <span>
                    {totalAssignments === 0
                      ? 'No assignments yet'
                      : assignmentSearch && filtered.length !== totalAssignments
                        ? `${filtered.length} of ${totalAssignments} shown`
                        : `${totalAssignments} assignment${totalAssignments === 1 ? '' : 's'} across ${distinctClasses} class${distinctClasses === 1 ? '' : 'es'}`}
                  </span>
                }
              >
                <button
                  type="button"
                  onClick={() => setIsAssigningId(null)}
                  className="modal-btn-secondary"
                >
                  Done
                </button>
              </ModalFooter>
            </>
          );
        })()}
      </ModalShell>

      {/* ── Edit Teacher Modal ── */}
      <ModalShell
        open={!!editingTeacher}
        onClose={() => !isSubmittingEdit && setEditingTeacher(null)}
        size="lg"
        locked={isSubmittingEdit}
        labelledBy="edit-teacher-title"
      >
        {editingTeacher && (
          <>
            <ModalHeader
              id="edit-teacher-title"
              icon={<Pencil className="w-4 h-4" />}
              title="Edit teacher"
              subtitle="Update name, email, or phone number."
              onClose={() => !isSubmittingEdit && setEditingTeacher(null)}
            />
            <ModalBody>
              {editError && (
                <div className="mb-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{editError}</span>
                </div>
              )}
              <form id="edit-teacher-form" onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CompactField label="Full name" required className="sm:col-span-2">
                  <input autoFocus className="input-modal" value={editingTeacher.name} onChange={e => setEditingTeacher({ ...editingTeacher, name: e.target.value })} required />
                </CompactField>
                <CompactField label="Email">
                  <input type="email" className="input-modal" value={editingTeacher.email} onChange={e => setEditingTeacher({ ...editingTeacher, email: e.target.value })} required />
                </CompactField>
                <CompactField label="Phone">
                  <input className="input-modal" value={editingTeacher.phone || ''} onChange={e => setEditingTeacher({ ...editingTeacher, phone: e.target.value })} />
                </CompactField>
              </form>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                disabled={isSubmittingEdit}
                className="modal-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-teacher-form"
                disabled={isSubmittingEdit}
                className={cn('modal-btn-primary', isSubmittingEdit && 'opacity-50 cursor-wait')}
              >
                {isSubmittingEdit && <Loader className="w-3.5 h-3.5 animate-spin" />}
                Save changes
              </button>
            </ModalFooter>
          </>
        )}
      </ModalShell>

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

/** Tiny outlined stat pill used in the Manage Assignments header. */
function StatChip({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-medium tabular-nums',
        accent
          ? 'bg-brand-indigo/10 border-brand-indigo/25 text-brand-indigo'
          : 'bg-white/[0.03] border-glass-border text-text-secondary',
      )}
    >
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

/** Compact label/value pair used inside the redesigned modals. */
function CompactField({
  label, required, className, children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="block text-[11px] font-medium text-text-secondary">
        {label}{required && <span className="text-rose-500 dark:text-rose-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
