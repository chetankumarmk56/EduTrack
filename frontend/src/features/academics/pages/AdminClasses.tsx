import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Hash,
  PlusCircle, X, Pencil,
  BookOpen, GraduationCap, ChevronRight,
  Layers, School, Library, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { academicApi } from '@/features/academics/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import type { Grade, Subject } from '@/shared/types';

type FormBanner = { kind: 'error' | 'success'; text: string } | null;

interface ClassDeleteTarget {
  grade: Grade;
  dependents?: {
    sections: number;
    classrooms: number;
    students: number;
    teacher_assignments: number;
  };
  loadingCounts: boolean;
}

export default function AdminClasses() {
  const { grades: classes, sections, subjects, refreshDirectory } = useApp();

  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [isAddingSubject, setIsAddingSubject] = useState(false);

  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editingClass, setEditingClass] = useState<Grade | null>(null);

  const [classForm, setClassForm] = useState({ name: '', level: 0, tuition_fee: 0, fee_due_date: '' });
  const [sectionInput, setSectionInput] = useState('');
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' });

  // Inline form banners (validation / success messages)
  const [classBanner, setClassBanner] = useState<FormBanner>(null);
  const [sectionBanner, setSectionBanner] = useState<FormBanner>(null);
  const [subjectBanner, setSubjectBanner] = useState<FormBanner>(null);
  const [classSubmitting, setClassSubmitting] = useState(false);
  const [sectionSubmitting, setSectionSubmitting] = useState(false);
  const [subjectSubmitting, setSubjectSubmitting] = useState(false);

  // Confirmation modal state
  const [classDeleteTarget, setClassDeleteTarget] = useState<ClassDeleteTarget | null>(null);
  const [sectionDeleteId, setSectionDeleteId] = useState<number | null>(null);
  const [subjectDeleteId, setSubjectDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  /** Parse the bulk section input ("A, B, C" or "A B C") into clean names. */
  const parseSectionNames = (raw: string): string[] =>
    raw
      .split(/[\s,;\n]+/)
      .map(n => n.trim().toUpperCase())
      .filter(Boolean);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassBanner(null);
    if (!classForm.level || classForm.level < 1) {
      setClassBanner({ kind: 'error', text: 'Please enter a numeric class level (e.g. 10).' });
      return;
    }
    setClassSubmitting(true);
    try {
      const payload = {
        ...classForm,
        fee_due_date: classForm.fee_due_date === '' ? undefined : classForm.fee_due_date,
      };

      const result = editingClass
        ? await academicApi.updateClass(editingClass.id, payload)
        : await academicApi.createClass(payload);

      setIsAddingClass(false);
      setEditingClass(null);
      setClassForm({ name: '', level: 0, tuition_fee: 0, fee_due_date: '' });
      await refreshDirectory(true);
      if (result?.id) setSelectedGradeId(result.id);
    } catch (err) {
      setClassBanner({
        kind: 'error',
        text: getErrorMessage(err).message || 'Unable to save class. Please try again.',
      });
    } finally {
      setClassSubmitting(false);
    }
  };

  const handleAddSections = async (e: React.FormEvent) => {
    e.preventDefault();
    setSectionBanner(null);
    if (!selectedGradeId) return;
    const names = parseSectionNames(sectionInput);
    if (names.length === 0) {
      setSectionBanner({ kind: 'error', text: 'Enter at least one section name.' });
      return;
    }
    setSectionSubmitting(true);
    try {
      // Single name → use the original single-section endpoint so the
      // existing audit / response shape doesn't change. Multiple names →
      // batch endpoint which skips duplicates and reports them.
      if (names.length === 1) {
        await academicApi.deploySegment({ name: names[0], grade_id: selectedGradeId });
        setSectionBanner({ kind: 'success', text: `Section ${names[0]} added.` });
      } else {
        const res = await academicApi.deploySegmentsBulk(selectedGradeId, names);
        const createdNames = res.created.map(s => s.name).join(', ');
        const msg = res.skipped.length
          ? `Added ${res.created.length} section(s): ${createdNames || '—'}. Skipped existing: ${res.skipped.join(', ')}.`
          : `Added ${res.created.length} section(s): ${createdNames}.`;
        setSectionBanner({ kind: res.created.length ? 'success' : 'error', text: msg });
      }
      setSectionInput('');
      await refreshDirectory(true);
    } catch (err) {
      setSectionBanner({
        kind: 'error',
        text: getErrorMessage(err).message || 'Unable to add sections. Please try again.',
      });
    } finally {
      setSectionSubmitting(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubjectBanner(null);
    if (!subjectForm.name.trim()) {
      setSubjectBanner({ kind: 'error', text: 'Subject name is required.' });
      return;
    }
    setSubjectSubmitting(true);
    try {
      const uniqueCode = `${subjectForm.name.substring(0, 3).toUpperCase()}-${Math.floor(Date.now() % 10000)}`;
      await academicApi.createSubject({ name: subjectForm.name.trim(), code: uniqueCode });
      setIsAddingSubject(false);
      setSubjectForm({ name: '', code: '' });
      await refreshDirectory(true);
    } catch (err) {
      setSubjectBanner({
        kind: 'error',
        text: getErrorMessage(err).message || 'Failed to create subject.',
      });
    } finally {
      setSubjectSubmitting(false);
    }
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    try {
      await academicApi.updateSubject(editingSubject.id, {
        name: editingSubject.name,
        code: editingSubject.code,
      });
      setEditingSubject(null);
      await refreshDirectory(true);
    } catch (err) {
      // Surface duplicate-name conflicts back inside the edit modal.
      setEditingSubject(prev => prev ? { ...prev } : prev);
      alert(getErrorMessage(err).message || 'Failed to update subject.');
    }
  };

  const requestDeleteClass = async (grade: Grade) => {
    setClassDeleteTarget({ grade, loadingCounts: true });
    try {
      const dependents = await academicApi.getClassDependents(grade.id);
      setClassDeleteTarget({ grade, dependents, loadingCounts: false });
    } catch {
      // If the count call fails, still allow the deletion attempt — the
      // backend will block with a clear message if needed.
      setClassDeleteTarget({ grade, loadingCounts: false });
    }
  };

  const performClassDelete = async () => {
    if (!classDeleteTarget) return;
    setDeleting(true);
    try {
      await academicApi.deleteClass(classDeleteTarget.grade.id);
      if (selectedGradeId === classDeleteTarget.grade.id) setSelectedGradeId(null);
      setClassDeleteTarget(null);
      await refreshDirectory(true);
    } catch (err) {
      setClassDeleteTarget(prev => prev ? prev : null);
      alert(getErrorMessage(err).message || 'Unable to delete this class.');
    } finally {
      setDeleting(false);
    }
  };

  const performSectionDelete = async () => {
    if (sectionDeleteId == null) return;
    setDeleting(true);
    try {
      await academicApi.deleteSection(sectionDeleteId);
      setSectionDeleteId(null);
      await refreshDirectory(true);
    } catch (err) {
      alert(getErrorMessage(err).message || 'Unable to delete this section.');
    } finally {
      setDeleting(false);
    }
  };

  const performSubjectDelete = async () => {
    if (subjectDeleteId == null) return;
    setDeleting(true);
    try {
      await academicApi.deleteSubject(subjectDeleteId);
      setSubjectDeleteId(null);
      await refreshDirectory(true);
    } catch (err) {
      alert(getErrorMessage(err).message || 'Unable to delete this subject.');
    } finally {
      setDeleting(false);
    }
  };

  const activeGrade = classes.find(c => c.id === selectedGradeId);
  const filteredSections = sections.filter(s => 
    s.grade_id === selectedGradeId
  );

  return (
    <div className="w-full animate-fade-in flex flex-col gap-6 sm:gap-10 md:gap-12 pb-10 sm:pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <GraduationCap className="w-3.5 h-3.5" /> Institutional Matrix
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gradient-indigo">Academic Setup</h1>
          <p className="text-text-secondary text-lg font-medium max-w-2xl">
            Configure the institutional framework by defining scholastic classes, operational segments, and disciplinary fields.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Column 1: Class Registry (Scholastic Units) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
              <School className="w-3.5 h-3.5" /> Classes
            </h3>
            <button 
              onClick={() => { setIsAddingClass(true); setEditingClass(null); setClassForm({ name: '', level: 0, tuition_fee: 0, fee_due_date: '' }); }}
              className="p-2 rounded-xl bg-brand-indigo/10 text-brand-indigo hover:bg-brand-indigo/20 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {classes.sort((a,b) => a.level - b.level).map((c) => (
                <motion.div
                  layout
                  key={c.id}
                  onClick={() => setSelectedGradeId(c.id)}
                  className={cn(
                    "group w-full p-4 rounded-2xl flex items-center justify-between transition-all border text-left relative overflow-hidden cursor-pointer",
                    selectedGradeId === c.id 
                      ? "bg-brand-indigo/10 border-brand-indigo/30 shadow-lg" 
                      : "bg-white/[0.02] border-glass-border hover:border-glass-border-bright"
                  )}
                >
                  <div className="flex items-center gap-4 relative z-10">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg transition-all shadow-inner",
                      selectedGradeId === c.id ? "bg-brand-indigo text-white rotate-3" : "bg-white/5 text-text-secondary"
                    )}>
                      {c.level}
                    </div>
                    <div>
                      <p className="font-black text-white text-sm uppercase italic">{c.name}</p>
                      <p className="text-[8px] uppercase font-black tracking-widest text-text-secondary opacity-50 italic">Scholastic Index {c.level}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingClass(c);
                        setClassForm({ name: c.name, level: c.level, tuition_fee: c.tuition_fee || 0, fee_due_date: c.fee_due_date || '' });
                        setClassBanner(null);
                        setIsAddingClass(true);
                      }}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/10 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); requestDeleteClass(c); }}
                      className="p-2 rounded-lg hover:bg-rose-500/10 text-white/10 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={cn("w-4 h-4 transition-all", selectedGradeId === c.id ? "text-brand-indigo translate-x-1" : "text-text-secondary opacity-20")} />
                  </div>
                  {selectedGradeId === c.id && (
                    <motion.div layoutId="active-indicator" className="absolute left-0 top-0 bottom-0 w-1 bg-brand-indigo" />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {isAddingClass && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="obsidian-card p-6 border-brand-indigo/30 bg-brand-indigo/[0.02]">
              <form onSubmit={handleCreateClass} className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <hgroup>
                    <h4 className="text-[10px] font-black uppercase tracking-widest italic">{editingClass ? 'Configure Class' : 'Register Class'}</h4>
                    <p className="text-[7px] font-black uppercase tracking-widest text-brand-indigo opacity-60 italic">Identity Synchronization</p>
                  </hgroup>
                  <button type="button" onClick={() => { setIsAddingClass(false); setClassBanner(null); }}>
                    <X className="w-4 h-4 opacity-40 hover:opacity-100" />
                  </button>
                </div>

                {classBanner && (
                  <div className={cn(
                    "flex items-start gap-2 p-3 rounded-xl text-[11px] font-bold border",
                    classBanner.kind === 'error'
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  )}>
                    {classBanner.kind === 'error'
                      ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span className="leading-snug">{classBanner.text}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-widest ml-2 text-text-secondary">Numeric Designation</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    autoFocus
                    className="input-obsidian text-sm italic font-black"
                    value={classForm.level || ''}
                    onChange={e => setClassForm({ ...classForm, name: `Class ${e.target.value}`, level: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-widest ml-2 text-text-secondary">Class Payment Fee</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    className="input-obsidian text-sm italic font-black"
                    value={classForm.tuition_fee || ''}
                    onChange={e => setClassForm({ ...classForm, tuition_fee: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-widest ml-2 text-text-secondary">Fee Payment Deadline</label>
                  <input
                    type="date"
                    className="input-obsidian text-sm italic font-black"
                    value={classForm.fee_due_date || ''}
                    onChange={e => setClassForm({ ...classForm, fee_due_date: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={classSubmitting}
                  className={cn(
                    "indigo-glow-button w-full py-3 text-[10px] font-black uppercase tracking-widest italic",
                    classSubmitting && "opacity-60 cursor-wait",
                  )}
                >
                  {classSubmitting ? 'Saving…' : editingClass ? 'Update Registry' : 'Authorize Class'}
                </button>
              </form>
            </motion.div>
          )}
        </div>

        {/* Column 2: Operational Segments (Sections) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="h-full flex flex-col gap-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> Segments
              </h3>
              {selectedGradeId && (
                <button 
                  onClick={() => setIsAddingSection(true)}
                  className="p-2 rounded-xl bg-brand-indigo/10 text-brand-indigo hover:bg-brand-indigo/20 transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {selectedGradeId ? (
                <>
                  <AnimatePresence mode="popLayout">
                    {filteredSections.map((s) => (
                      <motion.div layout key={s.id} className="obsidian-card group p-6 flex items-center justify-between border-glass-border hover:border-brand-indigo/30 transition-all shadow-sm bg-white/[0.01]">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-glass-border flex items-center justify-center font-black text-2xl italic group-hover:text-brand-indigo group-hover:scale-110 transition-all shadow-inner">
                            {s.name}
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-widest text-text-secondary opacity-50">Segment Mapping</p>
                            <p className="font-black text-white uppercase italic text-lg">{activeGrade?.level}-{s.name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSectionDeleteId(s.id)}
                          className="p-2.5 rounded-xl bg-rose-500/5 text-rose-500/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isAddingSection && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <form onSubmit={handleAddSections} className="obsidian-card p-6 border-brand-indigo/20 bg-brand-indigo/[0.02] flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black uppercase tracking-widest italic text-brand-indigo">Deploy Section(s)</h4>
                          <button type="button" onClick={() => { setIsAddingSection(false); setSectionBanner(null); }}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {sectionBanner && (
                          <div className={cn(
                            "flex items-start gap-2 p-3 rounded-xl text-[11px] font-bold border",
                            sectionBanner.kind === 'error'
                              ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                          )}>
                            {sectionBanner.kind === 'error'
                              ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                            <span className="leading-snug">{sectionBanner.text}</span>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest ml-2 text-text-secondary">
                            Identifier(s) — comma or space separated
                          </label>
                          <input
                            autoFocus
                            placeholder="e.g. A, B, C, D"
                            className="input-obsidian text-sm uppercase"
                            value={sectionInput}
                            onChange={e => setSectionInput(e.target.value)}
                          />
                          <p className="text-[9px] text-text-secondary opacity-60 ml-2">
                            Tip: enter several at once. Names already in this class are skipped automatically.
                          </p>
                        </div>
                        <button
                          type="submit"
                          disabled={sectionSubmitting}
                          className={cn(
                            "indigo-glow-button w-full py-3 text-[10px] font-black uppercase italic",
                            sectionSubmitting && "opacity-60 cursor-wait",
                          )}
                        >
                          {sectionSubmitting ? 'Activating…' : 'Activate Section(s)'}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {filteredSections.length === 0 && !isAddingSection && (
                    <div className="py-24 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-4 opacity-20 grayscale transition-all hover:opacity-40">
                      <Hash className="w-12 h-12 rotate-12" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Zero Segments Mapped</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-[400px] obsidian-card border-dashed flex flex-col items-center justify-center gap-6 opacity-10 text-center bg-white/[0.01]">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-glass-border flex items-center justify-center animate-pulse">
                    <Hash className="w-8 h-8 opacity-30" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] max-w-[180px] leading-relaxed">Select a Scholastic Class to calibrate operational segments</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: Curriculum Framework (Subjects) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-text-secondary flex items-center gap-2">
              <Library className="w-3.5 h-3.5" /> Disciplines
            </h3>
            <button 
              onClick={() => setIsAddingSubject(true)}
              className="p-2 rounded-xl bg-brand-indigo/10 text-brand-indigo hover:bg-brand-indigo/20 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {subjects.map((sub) => (
                <motion.div layout key={sub.id} className="obsidian-card group p-6 flex items-center justify-between border-glass-border hover:border-brand-indigo/30 transition-all shadow-sm bg-white/[0.01]">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-brand-indigo/5 border border-brand-indigo/10 flex items-center justify-center transition-all group-hover:rotate-6 group-hover:bg-brand-indigo/10 shadow-inner">
                      <BookOpen className="w-6 h-6 text-brand-indigo opacity-60" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-brand-indigo italic opacity-70">Core Discipline</p>
                      <p className="text-xl font-black tracking-tight text-white uppercase italic">{sub.name}</p>
                      <p className="text-[9px] font-bold text-text-secondary opacity-40 tabular-nums">CODE: {sub.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-10">
                    <button 
                      onClick={() => setEditingSubject(sub)}
                      className="p-2.5 rounded-xl bg-white/5 border border-glass-border hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100 shadow-lg text-text-secondary"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSubjectDeleteId(sub.id)}
                      className="p-2.5 rounded-xl bg-rose-500/5 text-rose-500/20 hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isAddingSubject && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="obsidian-card p-8 border-brand-indigo/30 bg-brand-indigo/[0.02] shadow-2xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-brand-indigo/10 blur-[50px] rounded-full" />
                <form onSubmit={handleCreateSubject} className="space-y-6 relative z-10">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest italic text-brand-indigo">Initialize Discipline</h4>
                    <button type="button" onClick={() => { setIsAddingSubject(false); setSubjectBanner(null); }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {subjectBanner && (
                    <div className={cn(
                      "flex items-start gap-2 p-3 rounded-xl text-[11px] font-bold border",
                      subjectBanner.kind === 'error'
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    )}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="leading-snug">{subjectBanner.text}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase tracking-[0.3em] ml-2 text-text-secondary">Full Nomenclature</label>
                    <input autoFocus placeholder="e.g. Quantum Mechanics" className="input-obsidian text-sm" value={subjectForm.name} onChange={e => setSubjectForm({...subjectForm, name: e.target.value})} required />
                  </div>
                  <button
                    type="submit"
                    disabled={subjectSubmitting}
                    className={cn(
                      "indigo-glow-button w-full py-4 text-[10px] font-black uppercase tracking-widest italic",
                      subjectSubmitting && "opacity-60 cursor-wait",
                    )}
                  >
                    {subjectSubmitting ? 'Saving…' : 'Commit Framework'}
                  </button>
                </form>
              </motion.div>
            )}

            {subjects.length === 0 && !isAddingSubject && (
              <div className="py-24 obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-6 opacity-10">
                <BookOpen className="w-16 h-16 opacity-30" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Zero Disciplines Configured</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Confirmation modals ───────────────────────────────────────── */}
      <ConfirmModal
        open={!!classDeleteTarget}
        title={`Delete ${classDeleteTarget?.grade.name ?? 'class'}?`}
        confirmLabel="Delete class"
        tone="danger"
        isLoading={deleting}
        onConfirm={performClassDelete}
        onCancel={() => !deleting && setClassDeleteTarget(null)}
        description={
          <span>
            This permanently removes the class and every record linked to it.
            This action cannot be undone.
          </span>
        }
      >
        {classDeleteTarget && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-xs">
            <p className="font-black uppercase tracking-widest text-rose-400 mb-3">
              {classDeleteTarget.loadingCounts ? 'Checking dependent records…' : 'Cascading deletes'}
            </p>
            {!classDeleteTarget.loadingCounts && classDeleteTarget.dependents && (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-slate-600 dark:text-slate-300">
                <li className="flex items-center justify-between">
                  <span>Sections</span>
                  <span className="font-black tabular-nums">{classDeleteTarget.dependents.sections}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Classrooms</span>
                  <span className="font-black tabular-nums">{classDeleteTarget.dependents.classrooms}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Active students</span>
                  <span className="font-black tabular-nums">{classDeleteTarget.dependents.students}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Teacher assignments</span>
                  <span className="font-black tabular-nums">{classDeleteTarget.dependents.teacher_assignments}</span>
                </li>
              </ul>
            )}
            {!classDeleteTarget.loadingCounts
              && classDeleteTarget.dependents
              && (classDeleteTarget.dependents.students > 0
                  || classDeleteTarget.dependents.teacher_assignments > 0) && (
              <p className="mt-3 text-[11px] font-bold text-rose-400">
                Warning: enrolled students and active teacher assignments will be detached.
              </p>
            )}
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={sectionDeleteId != null}
        title="Delete this section?"
        confirmLabel="Delete section"
        tone="danger"
        isLoading={deleting}
        onConfirm={performSectionDelete}
        onCancel={() => !deleting && setSectionDeleteId(null)}
        description="Students currently assigned to this section will be detached. This cannot be undone."
      />

      <ConfirmModal
        open={subjectDeleteId != null}
        title="Delete this subject?"
        confirmLabel="Delete subject"
        tone="danger"
        isLoading={deleting}
        onConfirm={performSubjectDelete}
        onCancel={() => !deleting && setSubjectDeleteId(null)}
        description="Removes the subject from your school catalogue. Existing marks and attendance records that reference it may break."
      />

      {/* Edit Subject Modal */}
      <AnimatePresence>
        {editingSubject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingSubject(null)} className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md obsidian-card border-brand-indigo/30 p-8 shadow-2xl overflow-hidden">
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-brand-indigo/10 blur-[60px] rounded-full" />
              <div className="flex items-center justify-between mb-8 relative z-10">
                <h2 className="text-xl font-black italic uppercase tracking-tight text-white">Calibrate Discipline</h2>
                <button onClick={() => setEditingSubject(null)} className="p-2 hover:bg-white/5 rounded-lg transition-all"><X className="w-5 h-5 text-text-secondary" /></button>
              </div>
              <form onSubmit={handleUpdateSubject} className="space-y-6 relative z-10">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary">Identifier</label>
                  <input autoFocus className="input-obsidian text-sm" value={editingSubject.name} onChange={e => setEditingSubject({...editingSubject, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary">Core Hash (Code)</label>
                  <input className="input-obsidian text-sm italic tabular-nums" value={editingSubject.code} onChange={e => setEditingSubject({...editingSubject, code: e.target.value})} />
                </div>
                <button type="submit" className="indigo-glow-button w-full py-4 text-[10px] font-black uppercase tracking-widest mt-4 italic">Commit Hash Update</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
