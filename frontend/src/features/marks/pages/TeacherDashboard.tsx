import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, Plus, Hash, User,
  Edit3, Trash2, ChevronDown, Check,
  AlertCircle, Clock, Users, BarChart3,
  PieChart, ClipboardCheck, Loader2, ClipboardList,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';
import { marksApi, type Exam } from '@/features/marks/api';
import { directoryApi } from '@/features/directory/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import ModalShell, { ModalHeader, ModalBody, ModalFooter } from '@/shared/components/ui/ModalShell';
import { useToast } from '@/shared/components/ui/Toast';
import type { Student } from '@/shared/types';

interface ClassStudent {
  roll: number;
  student_id: number;
  name: string;
  marks: { test: string | number | undefined; score: number }[];
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const {
    teacherDirectory,
    fetchClassMarks,
    teacherStats,
    fetchTeacherStats,
    activeAssignmentId,
    setActiveAssignmentId,
    refreshDirectory,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  // Direct fetch — bypass AppContext cache so newly-enrolled students always show.
  const [classDirectory, setClassDirectory] = useState<Student[]>([]);
  useEffect(() => {
    refreshDirectory(true);
    directoryApi.getMyStudents()
      .then((data) => setClassDirectory(data || []))
      .catch(err => console.error('[TeacherDashboard] getMyStudents failed', err));
  }, [refreshDirectory]);

  const currentTeacher = useMemo(() => teacherDirectory.find((t) => t.user_id === user?.id), [teacherDirectory, user]);
  const assignments = currentTeacher?.assignments || [];

  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const activeAssignment = useMemo(() => {
    if (!activeAssignmentId) return assignments[0];
    return assignments.find((a) => a.id === activeAssignmentId) || assignments[0];
  }, [assignments, activeAssignmentId]);

  // Set initial assignment OR reset if cached id doesn't belong to this teacher
  useEffect(() => {
    if (assignments.length === 0) return;
    const stillValid = assignments.some((a) => a.id === activeAssignmentId);
    if (!activeAssignmentId || !stillValid) {
      setActiveAssignmentId(assignments[0].id);
    }
  }, [assignments, activeAssignmentId]);

  const activeExamId = searchParams.get('exam') ? Number(searchParams.get('exam')) : undefined;
  const setActiveExamId = (id: number | undefined) => {
    if (id) {
       searchParams.set('exam', String(id));
    } else {
       searchParams.delete('exam');
    }
    setSearchParams(searchParams);
  };

  const [activeMaxScore, setActiveMaxScore] = useState(100);
  /** Mirror string for the max-score input. Keeping the raw string while
   *  the user is typing avoids the `0` + digit → `078` jitter that comes
   *  from binding a `<number>` controlled input straight to a numeric state. */
  const [maxScoreInput, setMaxScoreInput] = useState('100');
  useEffect(() => { setMaxScoreInput(String(activeMaxScore)); }, [activeMaxScore]);

  const toast = useToast();

  // Native dialogs replaced with these state-driven modals.
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingDeleteExamId, setPendingDeleteExamId] = useState<number | null>(null);
  const [examDeletingBusy, setExamDeletingBusy] = useState(false);
  const [examEditor, setExamEditor] = useState<
    | { mode: 'create'; name: string }
    | { mode: 'rename'; id: number; name: string }
    | null
  >(null);
  const [examEditorBusy, setExamEditorBusy] = useState(false);
  const [examEditorError, setExamEditorError] = useState<string | null>(null);

  const activeExam = useMemo(() => exams.find(e => e.id === activeExamId), [exams, activeExamId]);

  const fetchExams = async () => {
    if (!activeAssignment) return;
    try {
      const schoolClassId = activeAssignment.school_class?.id;
      const subjectId = activeAssignment.subject_id || activeAssignment.subject_ref?.id;
      
      if (!schoolClassId || !subjectId) return;
      
      const examData = await marksApi.getExams(schoolClassId, subjectId);
      setExams(examData);
      
      // Auto-select first exam if none active
      if (examData.length > 0 && !activeExamId) {
        setActiveExamId(examData[0].id);
      }
    } catch (err) {
      console.error("Failed to load assessments:", err);
    }
  };

  const fetchMarksForActiveExam = async () => {
    if (!activeAssignment || !activeExamId) return;
    setIsFetching(true);
    try {
      const schoolClassId = activeAssignment.school_class?.id;
      const subjectName = activeAssignment.subject_ref?.name;
      
      const marksData = await fetchClassMarks(subjectName, schoolClassId, activeExamId);
      
      setStudents(filteredDB.map((student, idx: number) => {
        const marksRecords = marksData.filter((d) => d.student_id === student.id);
        const mappedMarks = marksRecords.map((m) => ({
          test: m.exam_id || m.test_name,
          score: m.score
        }));
        return {
          roll: student.roll_number ?? idx + 1,
          student_id: student.id,
          name: student.name,
          marks: mappedMarks,
        };
      }));
    } catch(err) {
      console.error("Failed to load marks:", err);
    } finally {
      setIsFetching(false);
    }
  };

  // 1. Initial/Global Stats Fetch
  useEffect(() => {
    fetchTeacherStats();
  }, []);

  const filteredDB = useMemo(() => {
    if (!activeAssignment) return [];
    const targetClassId = activeAssignment.school_class?.id;
    const list = classDirectory.filter((s) => {
      const sClassId = s.school_class?.id ?? s.school_class_id;
      return String(sClassId) === String(targetClassId);
    });
    // Order by backend-assigned roll_number; fall back to name for any rows
    // that haven't been backfilled yet.
    return list.sort((a, b) => {
      const ra = a.roll_number ?? Number.MAX_SAFE_INTEGER;
      const rb = b.roll_number ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }, [classDirectory, activeAssignment]);


  // 2. Classroom-Specific Exam List Fetch
  useEffect(() => {
    if (!activeAssignment) return;
    fetchExams();
  }, [activeAssignment?.id]);

  // 3. Marks Data Fetch on Exam Switch
  useEffect(() => {
    if (!activeAssignment || !activeExamId || filteredDB.length === 0) return;
    fetchMarksForActiveExam();
  }, [activeAssignment?.id, activeExamId, filteredDB.length]);

  // 4. Always seed `students` from filteredDB so the roster shows even
  //    before an exam is created. `fetchMarksForActiveExam` overrides
  //    this with real marks once an exam is selected.
  useEffect(() => {
    if (activeExamId) return; // marks fetch will handle this case
    setStudents(filteredDB.map((s, idx: number) => ({
      roll: s.roll_number ?? idx + 1,
      student_id: s.id,
      name: s.name,
      marks: [],
    })));
  }, [filteredDB, activeExamId]);

  const handleScoreChange = (studentId: number, newScore: number) => {
    if (!activeExamId) return;
    // Hard-clamp on the way in so an over-cap value can never reach state.
    const validatedScore = Math.max(0, Math.min(newScore, activeMaxScore));

    setStudents(prev => prev.map(s => {
      if (s.student_id === studentId) {
        const testIndex = s.marks.findIndex(m => m.test === activeExamId);
        if (testIndex >= 0) {
          const newMarks = [...s.marks];
          newMarks[testIndex].score = validatedScore;
          return { ...s, marks: newMarks };
        } else {
          return { ...s, marks: [...s.marks, { test: activeExamId, score: validatedScore }] };
        }
      }
      return s;
    }));
  };

  /** Highest score across all current students for the active exam — the
   *  floor for `activeMaxScore`. Lowering the cap below this would corrupt
   *  the meaning of existing entries, so we block it. */
  const highestStudentScore = useMemo(() => {
    if (!activeExamId) return 0;
    return students.reduce((max, s) => {
      const score = s.marks.find(m => m.test === activeExamId)?.score ?? 0;
      return score > max ? score : max;
    }, 0);
  }, [students, activeExamId]);

  /** Commits an explicit max-score value from the cap input. Refuses anything
   *  below the highest recorded student score (with a toast) so existing
   *  evaluations stay valid. */
  const commitMaxScore = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next) || next <= 0) {
      setMaxScoreInput(String(activeMaxScore));
      toast.error('Invalid max marks', 'Enter a positive number.');
      return;
    }
    if (next < highestStudentScore) {
      setMaxScoreInput(String(activeMaxScore));
      toast.error(
        'Max marks too low',
        `A student has already been awarded ${highestStudentScore}. Lower that score first.`,
      );
      return;
    }
    setActiveMaxScore(next);
  };

  const requestSaveMarks = () => {
    if (!activeAssignment || !activeExamId) return;
    setShowSaveConfirm(true);
  };

  const performSaveMarks = async () => {
    if (!activeAssignment || !activeExamId) return;
    setShowSaveConfirm(false);

    interface BatchMarkPayload {
      student_id: number;
      subject: string;
      subject_id?: number;
      test_name?: string;
      exam_id: number;
      score: number;
      max_score: number;
    }
    const batchPayload: BatchMarkPayload[] = [];
    students.forEach(student => {
      student.marks.forEach(mark => {
        if (mark.test === activeExamId && mark.score !== undefined && mark.score !== null) {
          batchPayload.push({
            student_id: student.student_id,
            subject: activeAssignment.subject_ref.name,
            subject_id: activeAssignment.subject_id || activeAssignment.subject_ref?.id,
            test_name: activeExam?.name,
            exam_id: activeExamId,
            score: mark.score,
            max_score: activeMaxScore,
          });
        }
      });
    });

    setSaveStatus('saving');
    try {
      await marksApi.recordMarksBatch(batchPayload);
      setSaveStatus('success');
      fetchMarksForActiveExam();
      fetchTeacherStats();
      toast.success('Marks saved', `${batchPayload.length} record${batchPayload.length === 1 ? '' : 's'} synced to the ledger.`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      toast.error('Could not save marks', getErrorMessage(err).message || 'Please try again.');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const openCreateExam = () => {
    if (!activeAssignment) return;
    setExamEditorError(null);
    setExamEditor({ mode: 'create', name: '' });
  };

  const openRenameExam = (id: number, currentName: string) => {
    setExamEditorError(null);
    setExamEditor({ mode: 'rename', id, name: currentName });
  };

  const submitExamEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examEditor) return;
    const name = examEditor.name.trim();
    if (!name) {
      setExamEditorError('Assessment name is required.');
      return;
    }
    setExamEditorBusy(true);
    setExamEditorError(null);
    try {
      if (examEditor.mode === 'create') {
        if (!activeAssignment) return;
        const newExam = await marksApi.createExam(
          { name },
          activeAssignment.school_class?.id,
          activeAssignment.subject_id || activeAssignment.subject_ref?.id,
        );
        setExams(prev => [...prev, newExam]);
        setActiveExamId(newExam.id);
        if (students.length > 0) {
          setStudents(prev => prev.map(s => ({
            ...s,
            marks: [...s.marks, { test: newExam.id, score: 0 }],
          })));
        }
        toast.success('Assessment created', name);
      } else {
        const updated = await marksApi.updateExam(examEditor.id, name);
        setExams(prev => prev.map(e => (e.id === examEditor.id ? updated : e)));
        toast.success('Assessment renamed', name);
      }
      setExamEditor(null);
    } catch (err) {
      console.error(err);
      setExamEditorError(getErrorMessage(err).message || 'Could not save the assessment.');
    } finally {
      setExamEditorBusy(false);
    }
  };

  const performDeleteExam = async () => {
    const examId = pendingDeleteExamId;
    if (examId == null) return;
    setExamDeletingBusy(true);
    try {
      await marksApi.deleteExam(examId);
      setExams(prev => prev.filter(e => e.id !== examId));
      if (activeExamId === examId) setActiveExamId(undefined);
      setPendingDeleteExamId(null);
      toast.success('Assessment removed');
    } catch (err) {
      console.error(err);
      toast.error('Could not remove assessment', getErrorMessage(err).message || 'Please try again.');
    } finally {
      setExamDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Performance HUD */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Enrolled Students', value: teacherStats?.total_students || 0, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Active Sections', value: teacherStats?.active_classes || 0, icon: BarChart3, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Avg Attendance', value: `${teacherStats?.attendance_rate || 0}%`, icon: PieChart, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          { label: 'Pending Marks', value: teacherStats?.pending_marks || 0, icon: ClipboardCheck, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat, i) => (
          <StaggerItem key={i}>
            <div className="premium-card p-8 flex items-center gap-8 group">
              <div className={cn("p-5 rounded-[2rem] shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 aurora-glow", stat.bg, stat.color)}>
                <stat.icon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-1">{stat.label}</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-black tracking-tight tabular-nums group-hover:text-primary transition-colors">{stat.value}</p>
                </div>
              </div>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 pb-4 border-b border-white/5">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-emerald-400 text-[10px] font-black uppercase tracking-[0.4em] aurora-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400 aurora-glow" />
            Faculty Control Center
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white -ml-1">
             Marks <span className="text-emerald-400 italic">Ledger</span>
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-6">
              <div className="flex items-center gap-3 bg-muted/30 border border-primary/20 rounded-2xl px-5 py-3 shadow-premium group hover:border-primary/40 transition-all backdrop-blur-md">
                <span className="text-[10px] font-black uppercase text-primary tracking-widest">Active Ledger:</span>
                <select 
                   value={activeAssignment?.id || ''} 
                   onChange={(e) => setActiveAssignmentId(Number(e.target.value))}
                   className="bg-transparent text-sm font-black text-foreground focus:outline-none cursor-pointer pr-2 appearance-none"
                >
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id} className="bg-card text-foreground font-sans">
                      {a.school_class.grade?.name}-{a.school_class.section?.name} ({a.subject_ref.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors" />
              </div>
          </div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.02, translateY: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={requestSaveMarks}
          disabled={saveStatus === 'saving' || !activeAssignment || !activeExamId}
          className={cn(
            "relative group overflow-hidden text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl flex items-center gap-3 transition-all",
            saveStatus === 'success' ? "bg-emerald-500 shadow-emerald-500/20" :
            saveStatus === 'error' ? "bg-red-500 shadow-red-500/20" :
            "aurora-gradient shadow-primary/20 aurora-glow"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          {saveStatus === 'saving' ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Clock className="w-5 h-5" />
            </motion.div>
          ) : saveStatus === 'success' ? (
            <Check className="w-5 h-5" />
          ) : saveStatus === 'error' ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save'}
        </motion.button>
      </div>

      <StaggerContainer>
        <StaggerItem>
          <div className="premium-card bg-card/40 border-glass-border overflow-hidden">
            {/* Test Selection Bar */}
            <div className="p-6 border-b border-white/5 flex flex-wrap gap-4 items-center bg-muted/20">
              <AnimatePresence mode="popLayout">
                {exams.map((exam) => (
                  <motion.div
                    layout
                    key={exam.id}
                    onClick={() => setActiveExamId(exam.id)}
                    className={cn(
                      "relative flex items-center gap-3 px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300 cursor-pointer",
                      activeExamId === exam.id 
                        ? 'text-white' 
                        : 'text-muted-foreground hover:text-white'
                    )}
                  >
                    {activeExamId === exam.id && (
                      <motion.div 
                        layoutId="activeTab"
                        className="absolute inset-0 aurora-gradient rounded-[1.5rem] shadow-2xl aurora-glow"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10">{exam.name}</span>
                    
                    {activeExamId === exam.id && (
                      <div className="relative z-10 flex items-center ml-2 pl-3 border-l border-white/20 gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openRenameExam(exam.id, exam.name); }}
                          className="hover:scale-125 transition-transform text-white/60 hover:text-white"
                          title="Rename assessment"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingDeleteExamId(exam.id); }}
                          className="hover:scale-125 transition-transform text-white/40 hover:text-red-300"
                          title="Delete assessment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              <button
                 onClick={openCreateExam}
                 className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary transition-all ml-2"
              >
                <Plus className="w-4 h-4 mr-2" /> CREATE ASSESSMENT
              </button>

              <div className="ml-auto flex items-center gap-8 pl-8 border-l border-white/5">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Cap:</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={Math.max(1, highestStudentScore)}
                    value={maxScoreInput}
                    onChange={(e) => {
                      // Only digits — and strip any leading zeroes so
                      // backspacing to "0" then typing "78" never produces "078".
                      const digits = e.target.value.replace(/\D/g, '');
                      const normalised = digits.replace(/^0+(?=\d)/, '');
                      setMaxScoreInput(normalised);
                    }}
                    onBlur={() => commitMaxScore(maxScoreInput)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    title={highestStudentScore > 0 ? `Cannot go below ${highestStudentScore} (highest awarded score)` : undefined}
                    className="w-20 h-10 text-sm font-black text-center rounded-xl bg-background/50 border border-white/10 text-primary focus:ring-2 focus:ring-primary/50 outline-none tabular-nums transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Obsidian Table */}
            <div className="overflow-x-auto custom-scrollbar relative">
              <AnimatePresence>
                {isFetching && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-start justify-center pt-20 pointer-events-none"
                  >
                      <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] aurora-pulse shadow-2xl">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 aurora-glow" />
                        Establishing Secure Ledger Link
                      </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/10">
                  <tr>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5" /> ID</div></th>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Identity</div></th>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60 text-right w-48">Evaluation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence mode="wait">
                    {students.length === 0 && !isFetching ? (
                      <motion.tr
                        key="empty"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        <td colSpan={3} className="px-8 py-32 text-center">
                           <div className="flex flex-col items-center gap-4 opacity-30 italic font-black uppercase tracking-widest text-xs text-muted-foreground">
                              <p>No students enrolled in this sector</p>
                              <p className="text-[10px] normal-case tracking-normal font-normal">You can still manage assessment structures for this classroom.</p>
                           </div>
                        </td>
                      </motion.tr>
                    ) : (
                      students.map((student, idx) => {
                        const score = student.marks.find(m => m.test === activeExamId)?.score || 0;
                        return (
                          <motion.tr
                            layout
                            key={student.roll}
                            initial={{ opacity: 0, x: -30, rotateY: -15, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
                            transition={{ duration: 0.5, delay: idx * 0.03, ease: [0.23, 1, 0.32, 1] }}
                            className="group transition-all hover:bg-white/5"
                          >
                            <td className="px-10 py-6">
                              <span className="text-xs font-black tabular-nums opacity-30 tracking-[0.2em] group-hover:opacity-100 group-hover:text-primary transition-all">#{student.roll.toString().padStart(2, '0')}</span>
                            </td>
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-5">
                                <div className={cn(
                                  "w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all border border-white/5 group-hover:border-primary/30 group-hover:scale-110 shadow-lg",
                                  score > (activeMaxScore * 0.8) ? "aurora-gradient text-white aurora-glow border-none" : "bg-muted/40 text-foreground"
                                )}>
                                  {student.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-black tracking-tight text-lg group-hover:text-primary transition-colors">{student.name}</p>
                                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 group-hover:text-primary/40 transition-colors">Registered Candidate</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-10 py-6 text-right w-48">
                              <div className="flex items-center justify-end gap-5">
                                <motion.div whileHover={{ scale: 1.05 }} className="relative">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={activeMaxScore}
                                    placeholder="0"
                                    value={score || ''}
                                    onChange={(e) => {
                                      // Digits only, never accept a leading zero in the typed string.
                                      const digits = e.target.value.replace(/\D/g, '');
                                      const normalised = digits.replace(/^0+(?=\d)/, '');
                                      handleScoreChange(student.student_id, Number(normalised || 0));
                                    }}
                                    title={`Max ${activeMaxScore}`}
                                    className={cn(
                                      "w-28 h-14 rounded-2xl bg-black border border-white/10 px-5 text-right font-black text-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all tabular-nums aurora-glow-focus hover:border-primary/40",
                                      score >= (activeMaxScore * 0.9) ? "text-primary glow-text" : "text-foreground"
                                    )}
                                  />
                                </motion.div>
                                <div className="text-muted-foreground/20 font-black text-xs uppercase tracking-[0.2em]">
                                  / {activeMaxScore}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* ── Save marks confirmation ───────────────────────────────────── */}
      <ConfirmModal
        open={showSaveConfirm}
        title="Save these marks?"
        description={
          activeAssignment && activeExam
            ? `${activeAssignment.subject_ref.name} — ${activeExam.name} will be written to the central ledger.`
            : 'These marks will be written to the central ledger.'
        }
        confirmLabel="Save marks"
        tone="primary"
        isLoading={saveStatus === 'saving'}
        onConfirm={performSaveMarks}
        onCancel={() => setShowSaveConfirm(false)}
      />

      {/* ── Delete assessment confirmation ────────────────────────────── */}
      <ConfirmModal
        open={pendingDeleteExamId != null}
        title="Delete this assessment?"
        description="All student marks recorded under it will be permanently removed. This action cannot be undone."
        confirmLabel="Delete assessment"
        tone="danger"
        isLoading={examDeletingBusy}
        onConfirm={performDeleteExam}
        onCancel={() => !examDeletingBusy && setPendingDeleteExamId(null)}
      />

      {/* ── Create / rename assessment ────────────────────────────────── */}
      <ModalShell
        open={!!examEditor}
        onClose={() => !examEditorBusy && setExamEditor(null)}
        size="md"
        locked={examEditorBusy}
        labelledBy="exam-editor-title"
      >
        {examEditor && (
          <>
            <ModalHeader
              id="exam-editor-title"
              icon={<ClipboardList className="w-4 h-4" />}
              title={examEditor.mode === 'create' ? 'New assessment' : 'Rename assessment'}
              subtitle={examEditor.mode === 'create'
                ? 'Add a new assessment to this subject and start recording marks.'
                : 'Give this assessment a clearer name.'}
              onClose={() => !examEditorBusy && setExamEditor(null)}
            />
            <ModalBody>
              {examEditorError && (
                <div className="mb-4 px-3 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-snug">{examEditorError}</span>
                </div>
              )}
              <form id="exam-editor-form" onSubmit={submitExamEditor} className="space-y-1">
                <label className="block text-[11px] font-medium text-text-secondary">
                  Assessment name <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <input
                  autoFocus
                  placeholder="e.g. Mid-term exam"
                  className="input-modal"
                  value={examEditor.name}
                  maxLength={80}
                  onChange={e => setExamEditor({ ...examEditor, name: e.target.value })}
                  required
                />
              </form>
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                onClick={() => setExamEditor(null)}
                disabled={examEditorBusy}
                className="modal-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="exam-editor-form"
                disabled={examEditorBusy || !examEditor.name.trim()}
                className={cn('modal-btn-primary', (examEditorBusy || !examEditor.name.trim()) && 'opacity-50 cursor-not-allowed')}
              >
                {examEditorBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {examEditor.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </ModalFooter>
          </>
        )}
      </ModalShell>
    </div>
  );
}
