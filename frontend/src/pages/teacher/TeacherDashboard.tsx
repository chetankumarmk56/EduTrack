import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../lib/AppContext';
import { useAuth } from '../../lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Save, Plus, Hash, User, Settings, 
  Edit3, Trash2, ChevronDown, Check, 
  AlertCircle, Clock, Users, BarChart3, 
  PieChart, ClipboardCheck 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { StaggerContainer, StaggerItem } from '../../components/ui/PageWrapper';
import { marksApi, type Exam } from '../../api/marksApi';

interface ClassStudent {
  roll: number;
  name: string;
  marks: { test: string | number; score: number }[];
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { 
    classDirectory, 
    teacherDirectory,
    fetchClassMarks,
    teacherStats,
    fetchTeacherStats,
    activeAssignmentId,
    setActiveAssignmentId
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const currentTeacher = useMemo(() => teacherDirectory.find((t: any) => t.user_id === user?.id), [teacherDirectory, user]);
  const assignments: any[] = currentTeacher?.assignments || [];

  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const activeAssignment = useMemo(() => {
    if (!activeAssignmentId) return assignments[0];
    return assignments.find((a: any) => a.id === activeAssignmentId) || assignments[0];
  }, [assignments, activeAssignmentId]);

  // Set initial assignment if none selected
  useEffect(() => {
    if (assignments.length > 0 && !activeAssignmentId) {
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
  
  const activeExam = useMemo(() => exams.find(e => e.id === activeExamId), [exams, activeExamId]);

  const fetchExamsAndMarks = async (filteredDB: any[]) => {
    if (!activeAssignment) return;
    setIsFetching(true);
    try {
      const schoolClassId = activeAssignment.school_class?.id;
      const subjectId = activeAssignment.subject_id || activeAssignment.subject_ref?.id;
      const subjectName = activeAssignment.subject_ref?.name;
      
      if (!schoolClassId || !subjectId) {
        console.warn("⚠️ Marks Context Incomplete: class or subject ID missing.", { schoolClassId, subjectId });
        return;
      }
      
      // 1. Fetch formal exams
      const examData = await marksApi.getExams(schoolClassId, subjectId);
      setExams(examData);
      if (examData.length > 0 && !activeExamId) {
        setActiveExamId(examData[0].id);
      }

      // 2. Fetch marks specific to this exam for better performance and consistency
      const marksData = await fetchClassMarks(subjectName, schoolClassId, activeExamId);
      
      const newStudentsMap = filteredDB.map(student => {
        const marksRecords = marksData.filter((d: any) => d.student_id === student.id);
        const mappedMarks = marksRecords.map((m: any) => ({ 
          test: m.exam_id || m.test_name, 
          score: m.score 
        }));
        return { roll: student.id, name: student.name, marks: mappedMarks };
      });
      setStudents(newStudentsMap); 
    } catch(err) {
      console.error(err);
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
    return classDirectory.filter(
      (s: any) => s.school_class?.id === activeAssignment.school_class?.id
    );
  }, [classDirectory, activeAssignment]);

  // 1. Initial/Global Stats Fetch
  useEffect(() => {
    fetchTeacherStats();
  }, []);

  // 2. Classroom-Specific Data Fetch
  useEffect(() => {
    if (!activeAssignment) return;
    fetchExamsAndMarks(filteredDB);
  }, [activeAssignment?.id, filteredDB.length]);

  const handleScoreChange = (roll: number, newScore: number) => {
    if (!activeExamId) return;
    const validatedScore = Math.max(0, Math.min(newScore, activeMaxScore));
    
    setStudents(prev => prev.map(s => {
      if (s.roll === roll) {
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

  const saveMarks = async () => {
    if (!activeAssignment || !activeExamId) return;
    if (!window.confirm(`Synchronize marks for ${activeAssignment.subject_ref.name} (${activeExam?.name}) to the central ledger?`)) return;

    const batchPayload: any[] = [];
    students.forEach(student => {
        student.marks.forEach(mark => {
            if (mark.test === activeExamId && mark.score !== undefined && mark.score !== null) {
                batchPayload.push({
                   student_id: student.roll,
                   subject: activeAssignment.subject_ref.name,
                   subject_id: activeAssignment.subject_id || activeAssignment.subject_ref?.id,
                   test_name: activeExam?.name,
                   exam_id: activeExamId,
                   score: mark.score,
                   max_score: activeMaxScore
                 });
            }
        });
    });
    
    setSaveStatus('saving');
    try {
        await marksApi.recordMarksBatch(batchPayload);
        setSaveStatus('success');
        fetchExamsAndMarks(classDirectory);
        fetchTeacherStats();
        setTimeout(() => setSaveStatus('idle'), 3000);
    } catch(err) {
        console.error(err);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const handleCreateExam = async () => {
    if (!activeAssignment) return;
    const name = window.prompt("New Assessment Name (e.g., Mid-Term Exam):");
    if (!name) return;

    try {
      const newExam = await marksApi.createExam(
        { name }, 
        activeAssignment.school_class?.id, 
        activeAssignment.subject_id || activeAssignment.subject_ref?.id
      );
      setExams(prev => [...prev, newExam]);
      setActiveExamId(newExam.id);
      
      // Refresh marks list with the new exam context
      if (students.length > 0) {
        setStudents(prev => prev.map(s => ({
          ...s,
          marks: [...s.marks, { test: newExam.id, score: 0 }]
        })));
      }
    } catch (err: any) {
      console.error(err);
      alert(`Ledger Error: ${err.message || 'Could not synchronize assessment structure.'}`);
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
          <h1 className="text-7xl font-black tracking-tighter text-white -ml-1">
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
                  {assignments.map((a: any) => (
                    <option key={a.id} value={a.id} className="bg-card text-foreground font-sans">
                      {a.school_class.grade.name}-{a.school_class.section.name} ({a.subject_ref.name})
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
          onClick={saveMarks}
          disabled={saveStatus === 'saving'}
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
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Synced!' : saveStatus === 'error' ? 'Failed' : 'Synchronize Ledger'}
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
                    className={cn(
                      "flex items-center gap-3 px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-500",
                      activeExamId === exam.id 
                        ? 'aurora-gradient text-white shadow-2xl aurora-glow scale-105' 
                        : 'bg-white/5 border border-white/5 text-muted-foreground hover:text-white hover:bg-white/10 hover:border-white/20'
                    )}
                  >
                    <button 
                      onClick={() => setActiveExamId(exam.id)}
                      className="focus:outline-none"
                    >
                      {exam.name}
                    </button>
                    
                    {activeExamId === exam.id && (
                      <div className="flex items-center ml-2 pl-3 border-l border-white/20 gap-2">
                        <button 
                          className="hover:scale-125 transition-transform text-white/60 hover:text-white"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          className="hover:scale-125 transition-transform text-white/40 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              <button 
                 onClick={handleCreateExam}
                 className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary transition-all ml-2"
              >
                <Plus className="w-4 h-4 mr-2" /> CREATE ASSESSMENT
              </button>
              
              <div className="ml-auto flex items-center gap-8 pl-8 border-l border-white/5">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Cap:</span>
                  <input 
                    type="number" 
                    value={activeMaxScore} 
                    onChange={(e) => setActiveMaxScore(Number(e.target.value))} 
                    className="w-20 h-10 text-sm font-black text-center rounded-xl bg-background/50 border border-white/10 text-primary focus:ring-2 focus:ring-primary/50 outline-none tabular-nums transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                   <button className="p-2.5 rounded-xl border border-white/5 hover:bg-muted text-muted-foreground hover:text-primary transition-all aurora-glow-hover">
                      <Settings className="w-4.5 h-4.5" />
                   </button>
                </div>
              </div>
            </div>

            {/* Obsidian Table */}
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/10">
                  <tr>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5" /> ID</div></th>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Identity</div></th>
                    <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60 text-right w-48">Evaluation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence mode="popLayout">
                    {isFetching ? (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <td colSpan={3} className="px-8 py-32 text-center text-muted-foreground/30 italic font-black uppercase tracking-widest text-xs">
                           Establishing secure ledger connection...
                        </td>
                      </motion.tr>
                    ) : students.length === 0 ? (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
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
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ 
                              duration: 0.4, 
                              delay: idx * 0.02,
                              ease: [0.23, 1, 0.32, 1] 
                            }}
                            key={student.roll} 
                            className="group transition-all hover:bg-white/5"
                          >
                            <td className="px-10 py-6">
                               <span className="text-xs font-black tabular-nums opacity-30 tracking-[0.2em] group-hover:opacity-100 group-hover:text-primary transition-all">{student.roll.toString().padStart(3, '0')}</span>
                            </td>
                            <td className="px-10 py-6">
                               <div className="flex items-center gap-5">
                                  <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all border border-white/5 group-hover:border-primary/30 group-hover:scale-110",
                                    score > (activeMaxScore * 0.8) ? "aurora-gradient text-white aurora-glow" : "bg-muted/40 text-foreground"
                                  )}>
                                     {student.name.charAt(0)}
                                  </div>
                                  <div>
                                     <p className="font-black tracking-tight text-lg group-hover:text-primary transition-colors">{student.name}</p>
                                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 group-hover:text-primary/40 transition-colors">Registered Candidate</p>
                                  </div>
                                </div>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <div className="flex items-center justify-end gap-5">
                                <motion.div 
                                  whileHover={{ scale: 1.05 }}
                                  className="relative"
                                >
                                  <input
                                    type="number"
                                    value={score || ''}
                                    onChange={(e) => handleScoreChange(student.roll, Number(e.target.value))}
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
    </div>
  );
}
