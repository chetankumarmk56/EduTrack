import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import {
   Activity, Calendar, ArrowRight, Clock,
   MapPin, Target, ShieldCheck,
   BookOpen, GraduationCap, Megaphone
} from 'lucide-react';
import { StaggerItem } from '@/shared/components/ui/PageWrapper';
import { cn } from '@/shared/lib/utils';
import { announcementApi } from '@/features/announcements/api';

// Animated counter component with smooth easing
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

export default function Dashboard() {
   const { user } = useAuth();
   const navigate = useNavigate();
   const {
      classDirectory,
      teacherDirectory,
      studentProfile,
      studentMarks: rawMarks,
      studentAttendance: rawAttendance,
      studentEvents: rawEvents,
      fetchStudentData,
      parentFees,
      institutionName,
   } = useApp();

   const [unreadCount, setUnreadCount] = useState(0);

   useEffect(() => {
      if (studentProfile?.id && (rawMarks || []).length === 0) {
         fetchStudentData(studentProfile.id);
      }
   }, [studentProfile?.id]);

   useEffect(() => {
      if (user?.role !== 'parent' && user?.role !== 'student') return;
      announcementApi.getMyAnnouncements()
        .then(data => setUnreadCount(data.filter((a: any) => !a.is_read).length))
        .catch((err) => console.error("Failed to load announcements for unread count:", err));
   }, [user?.role]);

   const activeStudent = studentProfile || classDirectory.find((s: any) => s.user_id === user?.id || s.id === user?.id);
   const studentClass = activeStudent?.school_class || activeStudent?.classroom;

   // Filter cross-referenced marks
   const marks = useMemo(() => (rawMarks || []).filter((m: any) =>
      teacherDirectory.some((t: any) =>
         t.assignments?.some((a: any) => {
            const aClass = a.school_class || a.classroom;
            const aGrade = aClass?.grade?.level || aClass?.grade?.name || a.class_level;
            const aSection = aClass?.section?.name || a.section;
            const aSubj = a.subject_ref?.name || a.subject;

            const sGrade = studentClass?.grade?.level || studentClass?.grade?.name || activeStudent?.class_level;
            const sSection = studentClass?.section?.name || activeStudent?.section;

            return String(aGrade) === String(sGrade) &&
               String(aSection).toUpperCase() === String(sSection).toUpperCase() &&
               String(aSubj).toLowerCase() === String(m.subject_ref?.name || m.subject).toLowerCase();
         })
      )
   ), [rawMarks, teacherDirectory, activeStudent, studentClass]);

   const subjectPerformance = useMemo(() => {
      const subjects = Array.from(new Set(marks.map((m: any) => m.subject_ref?.name || m.subject).filter(Boolean)));
      return subjects.map((subj: any) => {
         const subjMarks = marks.filter((m: any) => (m.subject_ref?.name || m.subject) === subj);
         const totalScore = subjMarks.reduce((a: number, b: any) => a + (b.score || 0), 0);
         const totalMax = subjMarks.reduce((a: number, b: any) => a + (b.max_score || 0), 0);
         const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
         return { subject: subj, average: avg, count: subjMarks.length };
      }).sort((a: any, b: any) => b.average - a.average);
   }, [marks]);

   const attendanceCount = useMemo(() => {
      const present = (rawAttendance || []).filter((a: any) => (a.status || '').toLowerCase() === 'present' || (a.status || '').toLowerCase() === 'late').length;
      const total = (rawAttendance || []).length || 100;
      return total > 0 ? Math.round((present / total) * 100) : 100;
   }, [rawAttendance]);

   const overallGrade = useMemo(() => {
      if (subjectPerformance.length === 0) return 0;
      return Math.round(subjectPerformance.reduce((a: number, b: any) => a + b.average, 0) / subjectPerformance.length);
   }, [subjectPerformance]);


   if (!user?.id || !activeStudent) {
      return (
         <div className="h-full flex flex-col items-center justify-center pt-32 p-4 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mb-6"></div>
            <h2 className="text-3xl font-black tracking-tight text-foreground mb-3">Initializing Intelligence Nexus</h2>
            <p className="text-muted-foreground font-medium max-w-sm mx-auto italic">Synchronizing institutional vectors and family profiles...</p>
         </div>
      );
   }

   return (
      <div className="bg-transparent min-h-screen pb-20">
         <div className="w-full space-y-12 py-10 px-4 sm:px-6 lg:px-8">

            <div className="relative group">
               <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-indigo-500/10 to-violet-500/10 blur-3xl opacity-50"></div>
               <div className="relative crystal-glass p-10 md:p-16 rounded-[4.5rem] overflow-hidden border-white shadow-2xl">
                  {/* mesh accent */}
                  <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] -mr-80 -mt-80 animate-pulse" />

                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-12 relative z-10">
                     <div className="space-y-6 flex-1">
                        <div className="flex items-center gap-3 text-primary text-[11px] font-black uppercase tracking-[0.5em] bg-white/40 px-6 py-3 rounded-full border border-white/60 w-fit crystal-glow">
                           <ShieldCheck className="w-5 h-5" /> Parent Dashboard
                        </div>
                        <div>
                           <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-gradient-crystal leading-[0.9] mb-6">
                              {institutionName}
                           </h1>
                           <div className="flex items-center gap-4">
                              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 p-1 shadow-2xl">
                                 <div className="h-full w-full rounded-[0.9rem] bg-white flex items-center justify-center text-primary font-black text-2xl">
                                    {activeStudent.name.charAt(0)}
                                 </div>
                              </div>
                              <div>
                                 <p className="text-2xl font-black text-foreground tracking-tight">{activeStudent.name}</p>
                                 <p className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                                    <GraduationCap className="w-4 h-4 text-primary" /> Grade {activeStudent.school_class?.class_level || activeStudent.class_level}{activeStudent.school_class?.section?.name || activeStudent.section} · <span className="text-indigo-500">Scholar ID #{activeStudent.id}</span>
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-wrap gap-7 w-full lg:w-auto">
                        <motion.div
                           whileHover={{ y: -8, scale: 1.02 }}
                           onClick={() => navigate('/parent/academics')}
                           className="flex-1 lg:flex-none flex items-center gap-7 p-9 rounded-[3.5rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 border border-white/10 cursor-pointer"
                        >
                           <div className="h-20 w-20 rounded-[2.2rem] bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-inner">
                              <Target className="w-10 h-10" />
                           </div>
                           <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-1">Overall Performance</p>
                              <p className="text-6xl font-black tracking-tighter leading-none"><AnimatedCounter value={overallGrade} suffix="%" /></p>
                           </div>
                        </motion.div>

                        <motion.div
                           whileHover={{ y: -8, scale: 1.02 }}
                           onClick={() => navigate('/parent/attendance')}
                           className="flex-1 lg:flex-none flex items-center gap-7 p-9 rounded-[3.5rem] bg-white border border-white shadow-2xl crystal-glow cursor-pointer"
                        >
                           <div className="h-20 w-20 rounded-[2.2rem] bg-violet-600 flex items-center justify-center text-white shadow-xl shadow-violet-500/20">
                              <Activity className="w-10 h-10" />
                           </div>
                           <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-1">Attendance</p>
                              <p className="text-6xl font-black text-foreground tracking-tighter leading-none"><AnimatedCounter value={attendanceCount} suffix="%" /></p>
                           </div>
                        </motion.div>

                        {(user?.role === 'parent' || user?.role === 'student') && (
                           <motion.div
                              whileHover={{ y: -8, scale: 1.02 }}
                              onClick={() => navigate('/parent/announcements')}
                              className="flex-1 lg:flex-none flex items-center gap-7 p-9 rounded-[3.5rem] bg-white border border-white shadow-2xl crystal-glow cursor-pointer relative"
                           >
                              <div className="relative">
                                 <div className="h-20 w-20 rounded-[2.2rem] bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-500/10">
                                    <Megaphone className="w-10 h-10" />
                                 </div>
                                 {unreadCount > 0 && (
                                    <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse">
                                       {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                 )}
                              </div>
                              <div>
                                 <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-1">Announcements</p>
                                 {unreadCount > 0
                                    ? <p className="text-4xl font-black text-rose-500 tracking-tighter leading-none">{unreadCount} <span className="text-xl">Unread</span></p>
                                    : <p className="text-2xl font-black text-emerald-500 tracking-tighter leading-none">All Read</p>
                                 }
                              </div>
                           </motion.div>
                        )}
                     </div>

                  </div>
               </div>
            </div>
            {/* Strategic Tier: Performance & Finance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               {/* Fee Dashboard (Parent Only) */}
               {user?.role === 'parent' && (
                  <StaggerItem className="premium-glass p-10 rounded-[4.5rem] shadow-2xl relative overflow-hidden group border border-white/50">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                     <div className="flex items-center justify-between mb-8">
                        <div>
                           <h2 className="text-3xl font-black text-gradient-crystal tracking-tight">Finance</h2>
                        </div>
                        <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                           <Activity className="w-6 h-6" />
                        </div>
                     </div>

                     <div className="space-y-6">
                        {parentFees.length === 0 ? (
                           <div className="text-center py-10">
                              <p className="text-muted-foreground font-bold italic">No active fee records found.</p>
                           </div>
                        ) : (
                           parentFees.map((fee, i) => {
                              const isOverdue = fee.overdue_days > 0;
                              const statusColor = isOverdue ? "text-rose-500" : "text-amber-500";
                              const bgColor = isOverdue ? "bg-rose-50" : "bg-amber-50";
                              const borderColor = isOverdue ? "border-rose-100" : "border-amber-100";

                              return (
                                 <div key={i} className={cn("p-6 rounded-[2.5rem] border transition-all hover:scale-[1.02]", bgColor, borderColor)}>
                                    <div className="flex justify-between items-start mb-4">
                                       <div>
                                          <p className="text-xs font-black uppercase text-muted-foreground/60 tracking-wider">{fee.student_name}</p>
                                          <p className="text-2xl font-black text-foreground">₹{fee.due_amount.toLocaleString()}</p>
                                       </div>
                                       <div className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white shadow-sm", statusColor, borderColor)}>
                                          {isOverdue ? `Overdue by ${fee.overdue_days}d` : `Due in ${Math.abs(fee.overdue_days)}d`}
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground/60">
                                       <Calendar className="w-4 h-4" />
                                       Deadline: {fee.due_date ? new Date(fee.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                    </div>
                                 </div>
                              );
                           })
                        )}
                     </div>

                     <button
                        onClick={() => window.location.href = '/parent/payments'}
                        className="mt-8 w-full py-5 rounded-[2rem] bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.3em] hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3"
                     >
                        Initialize Settlement <ArrowRight className="w-4 h-4" />
                     </button>
                  </StaggerItem>
               )}

               <StaggerItem className={cn("premium-glass p-10 rounded-[4.5rem] shadow-2xl relative overflow-hidden group", user?.role === 'parent' ? "lg:col-span-2" : "col-span-1")}>
                  <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40 group-hover:scale-110 transition-transform duration-1000" />

                  <div className="flex items-center justify-between mb-12">
                     <div>
                        <h2 className="text-4xl font-black text-gradient-crystal tracking-tight">Academic Performance</h2>
                     </div>
                     <ArrowRight className="w-8 h-8 text-primary cursor-pointer hover:translate-x-3 transition-transform" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-x-20 gap-y-10">
                     {subjectPerformance.slice(0, 6).map((subj, i) => (
                        <div key={i} className="group">
                           <div className="flex justify-between items-center mb-3.5 px-1">
                              <span className="text-sm font-black text-foreground flex items-center gap-3 group-hover:text-primary transition-all">
                                 <BookOpen className="w-5 h-5 text-primary/60 group-hover:text-primary transition-colors" /> {subj.subject}
                              </span>
                              <span className="text-sm font-black text-foreground/40 group-hover:text-primary transition-colors">{subj.average}%</span>
                           </div>
                           <div className="h-5 w-full bg-slate-100/50 rounded-full overflow-hidden p-1.5 border border-white shadow-inner">
                              <motion.div
                                 initial={{ width: 0 }}
                                 animate={{ width: `${subj.average}%` }}
                                 transition={{ duration: 1.5, delay: i * 0.1, ease: "circOut" }}
                                 className={cn("h-full rounded-full shadow-lg", subj.average >= 80 ? "bg-gradient-to-r from-violet-500 to-indigo-500 shadow-violet-500/20" : "bg-primary/60 shadow-primary/10")}
                              />
                           </div>
                        </div>
                     ))}
                  </div>

                  <div className="mt-14 pt-10 border-t border-slate-100/50 grid grid-cols-3 gap-8">
                     <div className="text-center group">
                        <p className="text-3xl font-black text-foreground group-hover:text-primary transition-colors">A+</p>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.3em] mt-2">Institutional Tier</p>
                     </div>
                     <div className="text-center border-x border-slate-100/50 group">
                        <p className="text-3xl font-black text-indigo-500 group-hover:scale-110 transition-transform"><AnimatedCounter value={92} suffix="%" /></p>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.3em] mt-2">Efficiency Index</p>
                     </div>
                     <div className="text-center group">
                        <p className="text-3xl font-black text-emerald-500 flex items-center justify-center gap-2 group-hover:text-emerald-400 transition-colors">
                           <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                           Secure
                        </p>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.3em] mt-2">Ledger Status</p>
                     </div>
                  </div>
               </StaggerItem>
            </div>

            {/* Operational Tier: Bento Hub */}
            <div className="grid md:grid-cols-2 gap-10">
               {/* Attendance Matrix */}
               <StaggerItem className="premium-glass p-12 rounded-[4rem] shadow-xl flex flex-col items-center justify-center text-center space-y-8 group overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative h-48 w-48 flex items-center justify-center">
                     <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle cx="96" cy="96" r="85" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-slate-100/50" />
                        <motion.circle
                           cx="96" cy="96" r="85" stroke="currentColor" strokeWidth="16" fill="transparent"
                           strokeDasharray={2 * Math.PI * 85}
                           initial={{ strokeDashoffset: 2 * Math.PI * 85 }}
                           animate={{ strokeDashoffset: 2 * Math.PI * 85 * (1 - attendanceCount / 100) }}
                           transition={{ duration: 2.5, ease: "circOut" }}
                           strokeLinecap="round"
                           className="text-primary crystal-glow"
                        />
                     </svg>
                     <div className="text-center z-10">
                        <p className="text-5xl font-black text-foreground tabular-nums">{attendanceCount}%</p>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-[0.3em] mt-2">Attendance</p>
                     </div>
                  </div>
                  <div className="relative z-10">
                     <h3 className="text-2xl font-black text-foreground">Attendance Gauge</h3>
                     <p className="text-sm font-bold text-muted-foreground/60 mt-3 max-w-[280px]">Maintained consistent institutional presence across active faculty cycles.</p>
                  </div>
               </StaggerItem>

               {/* Timeline Snapshot */}
               <StaggerItem className="premium-glass p-12 rounded-[4rem] shadow-xl space-y-10 group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                  <div className="flex items-center justify-between relative z-10">
                     <div>
                        <h3 className="text-2xl font-black text-foreground tracking-tight">Timeline Hub</h3>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-widest mt-1">Upcoming milestones</p>
                     </div>
                     <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                        <Calendar className="w-6 h-6" />
                     </div>
                  </div>
                  <div className="space-y-6 relative z-10">
                     {(rawEvents || []).slice(0, 3).map((event, i) => (
                        <div key={i} className="flex gap-6 group/item">
                           <div className="h-14 w-14 rounded-[1.2rem] bg-white border border-slate-100 flex flex-col items-center justify-center shrink-0 shadow-sm group-hover/item:border-primary/30 transition-all">
                              <span className="text-[9px] font-black text-muted-foreground/60 uppercase leading-none mb-1">{new Date(event.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                              <span className="text-xl font-black text-foreground leading-none">{new Date(event.date).getDate()}</span>
                           </div>
                           <div className="min-w-0 flex-1 py-1">
                              <p className="text-base font-black text-foreground truncate group-hover/item:text-primary transition-colors">{event.title}</p>
                              <div className="flex items-center gap-5 text-[11px] text-muted-foreground/60 font-bold mt-2">
                                 <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {event.time}</span>
                                 <span className="flex items-center gap-1.5 font-black uppercase text-[10px] text-emerald-500 tracking-widest"><MapPin className="w-3.5 h-3.5" /> Campus</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
                  <button className="relative z-10 w-full py-5 rounded-[2rem] bg-slate-50 text-muted-foreground/60 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-white hover:text-primary hover:border-primary/20 border border-transparent transition-all">
                     Synchronize Complete Stream
                  </button>
               </StaggerItem>
            </div>
         </div>
      </div>
   );
}
