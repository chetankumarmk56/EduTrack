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

function AnimatedCounter({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
   const [displayValue, setDisplayValue] = useState(0);
   const ref = useRef<HTMLSpanElement>(null);
   const isInView = useInView(ref, { once: true });

   useEffect(() => {
      if (!isInView) return;
      const start = 0;
      const end = value;
      const duration = 1500;
      const startTime = performance.now();
      const animate = (currentTime: number) => {
         const elapsed = currentTime - startTime;
         const progress = Math.min(elapsed / duration, 1);
         const eased = 1 - Math.pow(1 - progress, 4);
         setDisplayValue(Math.round(start + (end - start) * eased));
         if (progress < 1) requestAnimationFrame(animate);
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
        .then(data => setUnreadCount(data.filter((a) => !a.is_read).length))
        .catch((err) => console.error('Failed to load announcements for unread count:', err));
   }, [user?.role]);

   const activeStudent = studentProfile || classDirectory.find((s) => s.user_id === user?.id || s.id === user?.id);
   const studentClass = activeStudent?.school_class || activeStudent?.classroom;

   const marks = useMemo(() => (rawMarks || []).filter((m) =>
      teacherDirectory.some((t) =>
         t.assignments?.some((a) => {
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
      const subjects = Array.from(new Set(marks.map((m) => m.subject_ref?.name || m.subject).filter(Boolean)));
      return subjects.map((subj) => {
         const subjMarks = marks.filter((m) => (m.subject_ref?.name || m.subject) === subj);
         const totalScore = subjMarks.reduce((a, b) => a + (b.score || 0), 0);
         const totalMax = subjMarks.reduce((a, b) => a + (b.max_score || 0), 0);
         const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
         return { subject: subj, average: avg, count: subjMarks.length };
      }).sort((a, b) => b.average - a.average);
   }, [marks]);

   const attendanceCount = useMemo(() => {
      const present = (rawAttendance || []).filter((a) => (a.status || '').toLowerCase() === 'present' || (a.status || '').toLowerCase() === 'late').length;
      const total = (rawAttendance || []).length || 100;
      return total > 0 ? Math.round((present / total) * 100) : 100;
   }, [rawAttendance]);

   const overallGrade = useMemo(() => {
      if (subjectPerformance.length === 0) return 0;
      return Math.round(subjectPerformance.reduce((a, b) => a + b.average, 0) / subjectPerformance.length);
   }, [subjectPerformance]);

   if (!user?.id || !activeStudent) {
      return (
         <div className="h-full flex flex-col items-center justify-center pt-20 p-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-6"></div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-foreground mb-3">Initializing Intelligence Nexus</h2>
            <p className="text-muted-foreground font-medium max-w-sm mx-auto italic text-sm">Synchronizing institutional vectors and family profiles...</p>
         </div>
      );
   }

   return (
      <div className="bg-transparent min-h-screen pb-20">
         <div className="w-full space-y-6 sm:space-y-8 md:space-y-12 py-4 sm:py-6 md:py-10">

            {/* ── Hero Card ── */}
            <div className="relative group">
               <div className="absolute -inset-2 sm:-inset-4 bg-gradient-to-r from-primary/20 via-indigo-500/10 to-violet-500/10 blur-3xl opacity-50" />
               <div className="relative crystal-glass p-5 sm:p-8 md:p-10 lg:p-12 rounded-3xl sm:rounded-[2.5rem] md:rounded-[3rem] overflow-hidden border-white shadow-2xl">
                  <div className="absolute top-0 right-0 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-primary/10 rounded-full blur-[100px] -mr-40 sm:-mr-80 -mt-40 sm:-mt-80 animate-pulse" />

                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 md:gap-10 relative z-10">
                     <div className="space-y-4 sm:space-y-6 flex-1 min-w-0 w-full lg:max-w-[55%]">
                        <div className="flex items-center gap-2 sm:gap-3 text-primary text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] bg-white/40 px-4 sm:px-6 py-2 sm:py-3 rounded-full border border-white/60 w-fit crystal-glow">
                           <ShieldCheck className="w-4 h-4" /> Parent Dashboard
                        </div>
                        <div>
                           <h1
                              title={institutionName}
                              className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.5rem] xl:text-5xl font-black tracking-tight text-gradient-crystal leading-[1.05] mb-4 sm:mb-6 [text-wrap:balance] [overflow-wrap:anywhere] line-clamp-3"
                           >
                              {institutionName}
                           </h1>
                           <div className="flex items-center gap-3 sm:gap-4">
                              <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 p-0.5 sm:p-1 shadow-2xl shrink-0">
                                 <div className="h-full w-full rounded-[0.6rem] sm:rounded-[0.9rem] bg-white flex items-center justify-center text-primary font-black text-xl sm:text-2xl">
                                    {activeStudent.name.charAt(0)}
                                 </div>
                              </div>
                              <div className="min-w-0">
                                 <p className="text-lg sm:text-2xl font-black text-foreground tracking-tight truncate">{activeStudent.name}</p>
                                 <p className="text-xs sm:text-sm font-bold text-muted-foreground flex flex-wrap items-center gap-1 sm:gap-2 mt-0.5">
                                    <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
                                    Grade {activeStudent.school_class?.class_level || activeStudent.class_level}{activeStudent.school_class?.section?.name || activeStudent.section}
                                    <span className="hidden sm:inline">·</span>
                                    <span className="text-indigo-500 text-[11px] sm:text-sm">Scholar ID #{activeStudent.id}</span>
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Stat Cards */}
                     <div className="flex flex-col sm:flex-row lg:flex-col gap-3 sm:gap-4 md:gap-5 w-full lg:w-auto lg:max-w-[420px] lg:shrink-0">
                        <motion.div
                           whileHover={{ y: -4, scale: 1.01 }}
                           onClick={() => navigate('/parent/academics')}
                           className="flex flex-1 sm:flex-none items-center gap-4 sm:gap-6 p-5 sm:p-7 rounded-2xl sm:rounded-[2.5rem] bg-indigo-600 text-white shadow-xl shadow-indigo-500/30 border border-white/10 cursor-pointer"
                        >
                           <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl sm:rounded-[1.8rem] bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-inner shrink-0">
                              <Target className="w-6 h-6 sm:w-8 sm:h-8" />
                           </div>
                           <div>
                              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-0.5">Overall Performance</p>
                              <p className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-none"><AnimatedCounter value={overallGrade} suffix="%" /></p>
                           </div>
                        </motion.div>

                        <motion.div
                           whileHover={{ y: -4, scale: 1.01 }}
                           onClick={() => navigate('/parent/attendance')}
                           className="flex flex-1 sm:flex-none items-center gap-4 sm:gap-6 p-5 sm:p-7 rounded-2xl sm:rounded-[2.5rem] bg-white border border-white shadow-xl crystal-glow cursor-pointer"
                        >
                           <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl sm:rounded-[1.8rem] bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 shrink-0">
                              <Activity className="w-6 h-6 sm:w-8 sm:h-8" />
                           </div>
                           <div>
                              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-0.5">Attendance</p>
                              <p className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground tracking-tighter leading-none"><AnimatedCounter value={attendanceCount} suffix="%" /></p>
                           </div>
                        </motion.div>

                        {(user?.role === 'parent' || user?.role === 'student') && (
                           <motion.div
                              whileHover={{ y: -4, scale: 1.01 }}
                              onClick={() => navigate('/parent/announcements')}
                              className="flex flex-1 sm:flex-none items-center gap-4 sm:gap-6 p-5 sm:p-7 rounded-2xl sm:rounded-[2.5rem] bg-white border border-white shadow-xl crystal-glow cursor-pointer relative"
                           >
                              <div className="relative shrink-0">
                                 <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl sm:rounded-[1.8rem] bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/10">
                                    <Megaphone className="w-6 h-6 sm:w-8 sm:h-8" />
                                 </div>
                                 {unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse">
                                       {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                 )}
                              </div>
                              <div>
                                 <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-0.5">Announcements</p>
                                 {unreadCount > 0
                                    ? <p className="text-2xl sm:text-3xl font-black text-rose-500 tracking-tighter leading-none">{unreadCount} <span className="text-base sm:text-xl">Unread</span></p>
                                    : <p className="text-xl sm:text-2xl font-black text-emerald-500 tracking-tighter leading-none">All Read</p>
                                 }
                              </div>
                           </motion.div>
                        )}
                     </div>
                  </div>
               </div>
            </div>

            {/* ── Strategic Tier: Performance & Finance ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
               {user?.role === 'parent' && (
                  <StaggerItem className="premium-glass p-5 sm:p-8 md:p-10 rounded-3xl sm:rounded-[3.5rem] shadow-2xl relative overflow-hidden group border border-white/50">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                     <div className="flex items-center justify-between mb-6 sm:mb-8">
                        <h2 className="text-2xl sm:text-3xl font-black text-gradient-crystal tracking-tight">Finance</h2>
                        <div className="p-3 rounded-xl sm:rounded-2xl bg-primary/10 text-primary border border-primary/20">
                           <Activity className="w-5 h-5" />
                        </div>
                     </div>

                     <div className="space-y-4 sm:space-y-6">
                        {parentFees.length === 0 ? (
                           <div className="text-center py-8">
                              <p className="text-muted-foreground font-bold italic text-sm">No active fee records found.</p>
                           </div>
                        ) : (
                           parentFees.map((fee, i) => {
                              const isOverdue = fee.overdue_days > 0;
                              const statusColor = isOverdue ? 'text-rose-500' : 'text-amber-500';
                              const bgColor = isOverdue ? 'bg-rose-50' : 'bg-amber-50';
                              const borderColor = isOverdue ? 'border-rose-100' : 'border-amber-100';
                              return (
                                 <div key={i} className={cn('p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border transition-all hover:scale-[1.01]', bgColor, borderColor)}>
                                    <div className="flex justify-between items-start mb-3 gap-2">
                                       <div className="min-w-0">
                                          <p className="text-xs font-black uppercase text-muted-foreground/60 tracking-wider truncate">{fee.student_name}</p>
                                          <p className="text-xl sm:text-2xl font-black text-foreground">₹{fee.due_amount.toLocaleString()}</p>
                                       </div>
                                       <div className={cn('px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white shadow-sm shrink-0', statusColor, borderColor)}>
                                          {isOverdue ? `+${fee.overdue_days}d` : `-${Math.abs(fee.overdue_days)}d`}
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground/60">
                                       <Calendar className="w-3.5 h-3.5 shrink-0" />
                                       {fee.due_date ? new Date(fee.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                    </div>
                                 </div>
                              );
                           })
                        )}
                     </div>

                     <button
                        onClick={() => window.location.href = '/parent/payments'}
                        className="mt-6 sm:mt-8 w-full py-4 sm:py-5 rounded-xl sm:rounded-[2rem] bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.3em] hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3"
                     >
                        Initialize Settlement <ArrowRight className="w-4 h-4" />
                     </button>
                  </StaggerItem>
               )}

               <StaggerItem className={cn('premium-glass p-5 sm:p-8 md:p-10 rounded-3xl sm:rounded-[3.5rem] shadow-2xl relative overflow-hidden group', user?.role === 'parent' ? 'lg:col-span-2' : 'col-span-1')}>
                  <div className="absolute top-0 right-0 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-primary/5 rounded-full blur-[80px] -mr-40 -mt-40 group-hover:scale-110 transition-transform duration-1000" />

                  <div className="flex items-center justify-between mb-6 sm:mb-10 md:mb-12">
                     <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gradient-crystal tracking-tight leading-tight">Academic Performance</h2>
                     <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-primary cursor-pointer hover:translate-x-2 transition-transform shrink-0" />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-x-8 md:gap-x-20 gap-y-6 sm:gap-y-8 md:gap-y-10">
                     {subjectPerformance.slice(0, 6).map((subj, i) => (
                        <div key={i} className="group">
                           <div className="flex justify-between items-center mb-2.5 px-1">
                              <span className="text-sm font-black text-foreground flex items-center gap-2 group-hover:text-primary transition-all min-w-0">
                                 <BookOpen className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
                                 <span className="truncate">{subj.subject}</span>
                              </span>
                              <span className="text-sm font-black text-foreground/40 group-hover:text-primary transition-colors shrink-0 ml-2">{subj.average}%</span>
                           </div>
                           <div className="h-4 w-full bg-slate-100/50 rounded-full overflow-hidden p-1 border border-white shadow-inner">
                              <motion.div
                                 initial={{ width: 0 }}
                                 animate={{ width: `${subj.average}%` }}
                                 transition={{ duration: 1.5, delay: i * 0.1, ease: 'circOut' }}
                                 className={cn('h-full rounded-full shadow-lg', subj.average >= 80 ? 'bg-gradient-to-r from-violet-500 to-indigo-500 shadow-violet-500/20' : 'bg-primary/60 shadow-primary/10')}
                              />
                           </div>
                        </div>
                     ))}
                  </div>

                  <div className="mt-8 sm:mt-12 md:mt-14 pt-6 sm:pt-10 border-t border-slate-100/50 grid grid-cols-3 gap-4 sm:gap-8">
                     <div className="text-center group">
                        <p className="text-xl sm:text-3xl font-black text-foreground group-hover:text-primary transition-colors">A+</p>
                        <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.2em] sm:tracking-[0.3em] mt-1.5">Institutional Tier</p>
                     </div>
                     <div className="text-center border-x border-slate-100/50 group">
                        <p className="text-xl sm:text-3xl font-black text-indigo-500 group-hover:scale-110 transition-transform"><AnimatedCounter value={92} suffix="%" /></p>
                        <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.2em] sm:tracking-[0.3em] mt-1.5">Efficiency Index</p>
                     </div>
                     <div className="text-center group">
                        <p className="text-sm sm:text-base md:text-3xl font-black text-emerald-500 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 group-hover:text-emerald-400 transition-colors">
                           <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                           Secure
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground/40 tracking-[0.2em] sm:tracking-[0.3em] mt-1.5">Ledger Status</p>
                     </div>
                  </div>
               </StaggerItem>
            </div>

            {/* ── Operational Tier: Bento Hub ── */}
            <div className="grid sm:grid-cols-2 gap-5 sm:gap-8 md:gap-10">
               {/* Attendance Matrix */}
               <StaggerItem className="premium-glass p-6 sm:p-10 md:p-12 rounded-3xl sm:rounded-[3.5rem] shadow-xl flex flex-col items-center justify-center text-center space-y-5 sm:space-y-8 group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative h-36 w-36 sm:h-48 sm:w-48 flex items-center justify-center">
                     <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle cx="50%" cy="50%" r="42%" stroke="currentColor" strokeWidth="10%" fill="transparent" className="text-slate-100/50" />
                        <motion.circle
                           cx="50%" cy="50%" r="42%" stroke="currentColor" strokeWidth="10%" fill="transparent"
                           strokeDasharray={`${2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                           initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                           animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - attendanceCount / 100) }}
                           transition={{ duration: 2.5, ease: 'circOut' }}
                           strokeLinecap="round"
                           className="text-primary crystal-glow"
                        />
                     </svg>
                     <div className="text-center z-10">
                        <p className="text-3xl sm:text-5xl font-black text-foreground tabular-nums">{attendanceCount}%</p>
                        <p className="text-[9px] sm:text-[10px] font-black uppercase text-muted-foreground/60 tracking-[0.3em] mt-1">Attendance</p>
                     </div>
                  </div>
                  <div className="relative z-10">
                     <h3 className="text-xl sm:text-2xl font-black text-foreground">Attendance Gauge</h3>
                     <p className="text-sm font-bold text-muted-foreground/60 mt-2 max-w-[260px]">Maintained consistent institutional presence across active faculty cycles.</p>
                  </div>
               </StaggerItem>

               {/* Timeline Snapshot */}
               <StaggerItem className="premium-glass p-6 sm:p-10 md:p-12 rounded-3xl sm:rounded-[3.5rem] shadow-xl space-y-6 sm:space-y-10 group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
                  <div className="flex items-center justify-between relative z-10">
                     <div>
                        <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Timeline Hub</h3>
                        <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-widest mt-0.5">Upcoming milestones</p>
                     </div>
                     <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-primary/10 text-primary border border-primary/20">
                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
                     </div>
                  </div>
                  <div className="space-y-4 sm:space-y-6 relative z-10">
                     {(rawEvents || []).slice(0, 3).map((event, i) => (
                        <div key={i} className="flex gap-4 sm:gap-6 group/item">
                           <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-[1.2rem] bg-white border border-slate-100 flex flex-col items-center justify-center shrink-0 shadow-sm group-hover/item:border-primary/30 transition-all">
                              <span className="text-[8px] sm:text-[9px] font-black text-muted-foreground/60 uppercase leading-none mb-0.5">{new Date(event.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                              <span className="text-lg sm:text-xl font-black text-foreground leading-none">{new Date(event.date).getDate()}</span>
                           </div>
                           <div className="min-w-0 flex-1 py-1">
                              <p className="text-sm sm:text-base font-black text-foreground truncate group-hover/item:text-primary transition-colors">{event.title}</p>
                              <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-[11px] text-muted-foreground/60 font-bold mt-1.5">
                                 <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {event.time}</span>
                                 <span className="flex items-center gap-1.5 font-black uppercase text-[10px] text-emerald-500 tracking-widest"><MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Campus</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
                  <button className="relative z-10 w-full py-4 sm:py-5 rounded-xl sm:rounded-[2rem] bg-slate-50 text-muted-foreground/60 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-white hover:text-primary hover:border-primary/20 border border-transparent transition-all">
                     Synchronize Complete Stream
                  </button>
               </StaggerItem>
            </div>
         </div>
      </div>
   );
}
