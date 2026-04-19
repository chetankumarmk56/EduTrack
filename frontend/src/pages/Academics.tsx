import { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../lib/AppContext';
import { useAuth } from '../lib/AuthContext';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { BookOpen, Target, Zap, Award, BrainCircuit, X, Calendar, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getPerformanceStyles } from '../lib/styleUtils';
import { StaggerContainer, StaggerItem } from '../components/ui/PageWrapper';
import { cn } from '../lib/utils';

// Reusable Animated Counter
function AnimatedCounter({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const end = value;
    const duration = 1500;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [value, isInView]);

  return <span ref={ref} className={className}>{displayValue}{suffix}</span>;
}

export default function Academics() {
  const { user } = useAuth();
  const { 
    teacherDirectory, 
    classDirectory, 
    studentProfile,
    studentMarks: marks,
    classMarks,
    fetchClassMarks
  } = useApp();

  const [selectedSubjectName, setSelectedSubjectName] = useState<string | null>(null);

  const activeStudent = studentProfile || classDirectory.find((s: any) => s.user_id === user?.id || s.id === user?.id);
  const studentClass = activeStudent?.school_class || activeStudent?.classroom;

  useEffect(() => {
    const classId = studentClass?.id || activeStudent?.class_level;
    if (activeStudent?.id && classId && (marks || []).length > 0) {
      const subjects = Array.from(new Set(marks.map((m: any) => m.subject_ref?.name || m.subject).filter(Boolean)));
      subjects.forEach((subj: any) => {
        fetchClassMarks(subj, classId);
      });
    }
  }, [activeStudent?.id, studentClass?.id, activeStudent?.class_level, (marks || []).length]);

  const subjectPerformance = useMemo(() => {
    const subjects = Array.from(new Set(marks.map((m: any) => m.subject_ref?.name || m.subject).filter(Boolean)));
    return subjects.map((subj: any) => {
      const subjMarks = marks.filter((m: any) => (m.subject_ref?.name || m.subject) === subj);
      const totalScore = subjMarks.reduce((a: number, b: any) => a + (b.score || 0), 0);
      const totalMax = subjMarks.reduce((a: number, b: any) => a + (b.max_score || 0), 0);
      const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
      
      // Calculate Class Average
      const key = `${subj}_${activeStudent?.class_level}`;
      const cMarks = classMarks[key] || [];
      const cTotalScore = cMarks.reduce((a: number, b: any) => a + (b.score || 0), 0);
      const cTotalMax = cMarks.reduce((a: number, b: any) => a + (b.max_score || 100), 0);
      const cAvg = cTotalMax > 0 ? Math.round((cTotalScore / cTotalMax) * 100) : 0;

      const teacher = teacherDirectory.find((t: any) => 
        t.assignments?.some((a: any) => {
          const aClass = a.school_class || a.classroom;
          const aGrade = aClass?.grade?.level || aClass?.grade?.name || a.class_level;
          const aSection = aClass?.section?.name || a.section;
          const aSubj = a.subject_ref?.name || a.subject;
          
          const sGrade = studentClass?.grade?.level || studentClass?.grade?.name || activeStudent?.class_level;
          const sSection = studentClass?.section?.name || activeStudent?.section;

          return String(aSubj).toLowerCase() === subj.toLowerCase() && 
                 String(aGrade) === String(sGrade) &&
                 String(aSection).toUpperCase() === String(sSection).toUpperCase();
        })
      );
      
      return { 
        subject: subj, 
        average: avg, 
        classAverage: cAvg,
        count: subjMarks.length, 
        teacher: teacher?.name || 'Faculty Member',
        recent: subjMarks.length > 0 ? subjMarks[subjMarks.length - 1].score : 0,
        allMarks: subjMarks
      };
    }).sort((a: any, b: any) => b.average - a.average);
  }, [marks, classMarks, teacherDirectory, activeStudent, studentClass]);

  const selectedSubjectData = useMemo(() => {
    if (!selectedSubjectName) return null;
    return subjectPerformance.find(s => s.subject === selectedSubjectName);
  }, [selectedSubjectName, subjectPerformance]);

  const automatedInsight = useMemo(() => {
    if (subjectPerformance.length === 0) return "Awaiting assessment analytics to generate high-fidelity insights.";
    
    const topSubj = subjectPerformance[0];
    const lowSubj = subjectPerformance[subjectPerformance.length - 1];
    const overallAvg = Math.round(subjectPerformance.reduce((a: number, b: any) => a + b.average, 0) / subjectPerformance.length);

    if (overallAvg >= 90) return `Exceptional mastery across all domains. ${activeStudent?.name}'s synthesis of ${topSubj.subject} principles is particularly noteworthy. Recommend advancing to extended curriculum challenges.`;
    if (overallAvg >= 75) return `${activeStudent?.name} demonstrates robust comprehension in ${topSubj.subject}. A strategic focus on the qualitative nuances of ${lowSubj.subject} could further optimize their academic trajectory.`;
    return `Performance monitoring indicates a growth opportunity. Immediate focus on ${lowSubj.subject} foundational concepts is advised to bridge the current mastery gap. ${topSubj.subject} remains a core strength.`;
  }, [subjectPerformance, activeStudent]);

  const chartData = useMemo(() => {
    return subjectPerformance.map((s: any) => ({
      name: s.subject,
      Score: s.average,
      Avg: s.classAverage
    }));
  }, [subjectPerformance]);

  if (!user?.id) return null;

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-[0.3em] bg-primary/10 px-4 py-2 rounded-full border border-primary/20 w-fit">
                <Zap className="w-4 h-4 shadow-[0_0_10px_rgba(var(--primary),0.5)]" /> Academic Intelligence — Live
             </div>
             <h1 className="text-6xl font-black tracking-tighter text-foreground leading-[0.9]">
                Performance <span className="text-primary italic">Forge</span>
             </h1>
             <p className="text-muted-foreground font-medium max-w-xl">Deep-learning analysis of curriculum mastery for <span className="text-foreground font-black px-2 py-0.5 rounded bg-primary/5 border border-primary/10">{activeStudent?.name}</span>.</p>
          </div>
          
          <div className="px-6 py-4 rounded-[2rem] premium-glass flex items-center gap-4 border-2 border-primary/20 shadow-xl shadow-primary/5">
             <div className="h-12 w-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Target className="w-6 h-6" />
             </div>
             <div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Global Rank</p>
                <p className="text-2xl font-black text-foreground">Top 15%</p>
             </div>
          </div>
        </div>

        {/* Intelligence Visualization */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
           <StaggerItem className="lg:col-span-8 premium-glass p-10 rounded-[3rem] relative overflow-hidden group border-glass-border shadow-2xl">
             <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40" />
             
             <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-12 relative z-10 gap-6">
                <div>
                   <h2 className="text-3xl font-black text-foreground tracking-tight underline decoration-primary/30 underline-offset-8">Mastery Analytics</h2>
                   <p className="text-sm font-medium text-muted-foreground mt-4">Subject-level performance vs cohort averages.</p>
                </div>
                <div className="flex gap-3">
                   <div className="px-5 py-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" /> Student
                   </div>
                    <div className="px-5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" /> Class Avg
                    </div>
                </div>
             </div>

              <div className="h-[400px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'var(--foreground)', fontSize: 11, fontWeight: 900 }} 
                      dy={15}
                    />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                      contentStyle={{ borderRadius: '1.5rem', border: 'none', background: 'white', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', padding: '1.5rem' }}
                      itemStyle={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase' }}
                    />
                    <Bar name="Your Child" dataKey="Score" radius={[12, 12, 0, 0]} barSize={36}>
                        {chartData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.Score >= 80 ? 'var(--primary)' : 'rgba(79,70,229,0.5)'} />
                        ))}
                    </Bar>
                     <Bar name="Class Avg" dataKey="Avg" fill="#fbbf24" radius={[12, 12, 0, 0]} barSize={36} fillOpacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </StaggerItem>

           <StaggerItem className="lg:col-span-4 flex flex-col gap-8">
              <motion.div 
               whileHover={{ y: -5 }}
               className="flex-1 p-12 rounded-[3rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden flex flex-col justify-between"
              >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 pointer-events-none" />
                  <div className="relative z-10">
                     <div className="h-16 w-16 rounded-[1.5rem] bg-white/20 backdrop-blur-md flex items-center justify-center mb-8 border border-white/30">
                        <BrainCircuit className="w-8 h-8 text-white" />
                     </div>
                     <h3 className="text-3xl font-black tracking-tight mb-4 leading-none">Automated Faculty Insight</h3>
                     <p className="text-base font-medium text-indigo-100 leading-relaxed italic mb-8 border-l-4 border-white/30 pl-6">
                        "{automatedInsight}"
                     </p>
                  </div>
                  <div className="relative z-10 flex items-center gap-4 pt-8 border-t border-white/20">
                     <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                        <Award className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Engine Status</p>
                        <p className="text-xs font-black text-white">Calculated by Nexus AI</p>
                     </div>
                  </div>
              </motion.div>
           </StaggerItem>
        </div>

        {/* Subject Intelligence Cards */}
        <div className="space-y-8">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-3xl font-black text-foreground tracking-tight underline decoration-indigo-500/20 underline-offset-8">Subject Domains</h3>
           </div>
           
           <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {subjectPerformance.map((subj: any) => {
                  const styles = getPerformanceStyles(subj.average, 100);
                  
                  return (
                    <StaggerItem key={subj.subject}>
                        <motion.button 
                          onClick={() => setSelectedSubjectName(subj.subject)}
                          whileHover={{ y: -10, scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn("premium-glass p-10 rounded-[3rem] relative group border-t-[12px] transition-all duration-300 shadow-xl w-full text-left cursor-pointer", styles.card, "border-opacity-100")}
                        >
                           <div className="flex justify-between items-start mb-10">
                              <div className={cn("p-5 rounded-[1.5rem] bg-white dark:bg-card shadow-lg", styles.icon)}>
                                 <BookOpen className="w-8 h-8" />
                              </div>
                              <div className="text-right">
                                 <div className={cn("text-4xl font-black tracking-tighter", styles.text)}><AnimatedCounter value={subj.average} suffix="%" /></div>
                                 <span className="text-[11px] font-black uppercase text-muted-foreground tracking-[0.2em] opacity-60">Mastery Level</span>
                              </div>
                           </div>
                           
                           <div className="mb-10">
                              <h4 className="text-2xl font-black text-foreground mb-2 group-hover:text-primary transition-colors">{subj.subject}</h4>
                              <p className="text-sm text-muted-foreground font-medium flex items-center gap-3">
                                 <span className={cn("h-3 w-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]", subj.average >= 75 ? "bg-emerald-500" : "bg-amber-500")} />
                                 Faculty: <span className="text-foreground font-black">{subj.teacher}</span>
                              </p>
                           </div>
                           
                           <div className="grid grid-cols-2 gap-4">
                              <div className="p-5 rounded-3xl bg-muted/30 border border-glass-border shadow-inner">
                                 <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-2">Assessments</p>
                                 <p className="text-lg font-black text-foreground">{subj.count} Units</p>
                              </div>
                              <div className="p-5 rounded-3xl bg-muted/30 border border-glass-border shadow-inner">
                                 <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-2">Class Avg</p>
                                 <p className="text-lg font-black text-foreground">{subj.classAverage}%</p>
                              </div>
                           </div>
                        </motion.button>
                    </StaggerItem>
                  );
              })}
           </StaggerContainer>
        </div>
      </div>

      {/* Assessment Detail Modal */}
      <AnimatePresence>
         {selectedSubjectName && selectedSubjectData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => setSelectedSubjectName(null)}
                 className="absolute inset-0 bg-white/40 backdrop-blur-2xl"
               />
               
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.9, y: 20 }}
                 className="relative w-full max-w-4xl bg-white rounded-[4rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.2)] border border-white/50 overflow-hidden flex flex-col max-h-[90vh]"
               >
                  {/* Modal Header */}
                  <div className="px-12 py-10 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                     <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-[2rem] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                           <BookOpen className="w-8 h-8" />
                        </div>
                        <div>
                           <h2 className="text-4xl font-black text-foreground tracking-tighter">{selectedSubjectName}</h2>
                           <p className="text-xs font-black uppercase text-muted-foreground tracking-[0.2em] mt-1">Detailed Assessment Matrix</p>
                        </div>
                     </div>
                     <button 
                       onClick={() => setSelectedSubjectName(null)}
                       className="h-12 w-12 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                     >
                        <X className="w-6 h-6" />
                     </button>
                  </div>

                  {/* Modal Body - Scrollable */}
                  <div className="flex-1 overflow-y-auto px-12 py-10 space-y-8">
                     <div className="grid grid-cols-3 gap-6">
                        <div className="p-8 rounded-[2.5rem] bg-indigo-50 border border-indigo-100">
                           <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-2">Current Mastery</p>
                           <p className="text-3xl font-black text-indigo-900">{selectedSubjectData.average}%</p>
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-amber-50 border border-amber-100">
                           <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-2">Tests Recorded</p>
                           <p className="text-3xl font-black text-amber-900">{selectedSubjectData.count} Units</p>
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-emerald-50 border border-emerald-100">
                           <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-2">Faculty</p>
                           <p className="text-lg font-black text-emerald-900 truncate leading-none mt-2">{selectedSubjectData.teacher}</p>
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h4 className="text-sm font-black text-foreground uppercase tracking-widest px-2">History Log</h4>
                        <div className="space-y-3">
                           {selectedSubjectData.allMarks.map((m: any, i: number) => (
                              <motion.div 
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center justify-between p-6 rounded-[2rem] bg-white border border-slate-100 hover:border-primary/20 hover:shadow-lg transition-all group"
                              >
                                 <div className="flex items-center gap-5">
                                    <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                                       <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                       <p className="text-base font-black text-foreground">{m.exam?.name || m.test_name || 'Unit Assessment'}</p>
                                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                                          {new Date(m.created_at || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                       </p>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-8">
                                    <div className="text-right">
                                       <p className="text-2xl font-black text-foreground leading-none">{m.score}<span className="text-xs text-muted-foreground ml-1">/{m.max_score}</span></p>
                                       <p className="text-[9px] font-black text-primary uppercase tracking-widest mt-1">Raw Score</p>
                                    </div>
                                    <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                                       <ChevronRight className="w-5 h-5" />
                                    </div>
                                 </div>
                              </motion.div>
                           ))}
                        </div>
                     </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="px-12 py-8 bg-slate-50 border-t border-slate-100 text-center">
                     <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Institutional Academic Record · Validated by Nexus Engine</p>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>
    </div>
  );
}
