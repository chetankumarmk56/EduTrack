import { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../lib/AppContext';
import { useAuth } from '../lib/AuthContext';
import { motion, useInView } from 'framer-motion';
import { Calendar, CheckCircle, XCircle, Clock, Activity, Users, ChevronRight, Search } from 'lucide-react';
import { StaggerItem } from '../components/ui/PageWrapper';
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

export default function Attendance() {
  const { user } = useAuth();
  const { studentAttendance: attendance, studentProfile } = useApp();
  const [filterState, setFilterState] = useState<'all' | 'present' | 'absent' | 'late'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const subjectAttendance = useMemo(() => {
    return attendance.filter(a => a.subject && a.subject.trim() !== '');
  }, [attendance]);

  const stats = useMemo(() => {
    const total = subjectAttendance.length;
    const presentCount = subjectAttendance.filter(a => a.status.toLowerCase() === 'present' || a.status.toLowerCase() === 'late').length;
    const absentCount = total - presentCount;
    const rate = total > 0 ? Math.round((presentCount / total) * 100) : 100;
    return { total, present: presentCount, absent: absentCount, rate };
  }, [subjectAttendance]);

  const filteredAttendance = useMemo(() => {
    let list = [...subjectAttendance];
    if (filterState !== 'all') {
      list = list.filter(a => a.status.toLowerCase() === filterState);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(a => 
        a.subject?.toLowerCase().includes(query) || 
        a.date.includes(query)
      );
    }
    // Sort by date descending
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [subjectAttendance, filterState, searchQuery]);

  if (!user?.id) return null;

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 sm:px-6 lg:px-8">
        
        {/* Elite Attendance Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase tracking-[0.3em] bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 w-fit">
                <Activity className="w-4 h-4 shadow-[0_0_10px_rgba(16,185,129,0.5)]" /> Live Attendance Matrix
             </div>
             <h1 className="text-6xl font-black tracking-tighter text-foreground leading-[0.9]">
                Presence <span className="text-emerald-500 italic">Vault</span>
             </h1>
             <p className="text-muted-foreground font-medium max-w-xl">Real-time faculty reporting for <span className="text-foreground font-black px-2 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10">{studentProfile?.name}</span>.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
             <div className="px-8 py-6 rounded-[2rem] premium-glass border-2 border-emerald-500/20 shadow-xl shadow-emerald-500/5 flex flex-col items-center">
                <div className="text-4xl font-black text-emerald-500 tracking-tighter"><AnimatedCounter value={stats.rate} suffix="%" /></div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mt-1">Consistency</p>
             </div>
             <div className="px-8 py-6 rounded-[2rem] premium-glass border-2 border-primary/20 shadow-xl shadow-primary/5 flex flex-col items-center">
                <div className="text-4xl font-black text-primary tracking-tighter"><AnimatedCounter value={stats.total} /></div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mt-1">Total Classes</p>
             </div>
          </div>
        </div>

        {/* Intelligence Grid */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
           
           {/* Filters Bento */}
           <StaggerItem className="lg:col-span-3 space-y-6">
              <div className="premium-glass p-8 rounded-[2.5rem] space-y-8">
                 <div>
                    <h3 className="text-lg font-black text-foreground tracking-tight mb-4">Filter Matrix</h3>
                    <div className="relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                       <input 
                        type="text" 
                        placeholder="Search subject..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-muted/20 border border-glass-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    {[
                       { id: 'all', label: 'All Classes', icon: Users, color: 'primary' },
                       { id: 'present', label: 'Present', icon: CheckCircle, color: 'emerald-500' },
                       { id: 'absent', label: 'Absent', icon: XCircle, color: 'rose-500' },
                       { id: 'late', label: 'Delayed', icon: Clock, color: 'amber-500' }
                    ].map(f => (
                       <button
                        key={f.id}
                        onClick={() => setFilterState(f.id as any)}
                        className={cn(
                           "w-full flex items-center justify-between p-4 rounded-2xl transition-all border",
                           filterState === f.id 
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 border-emerald-400" 
                            : "bg-muted/10 text-muted-foreground border-transparent hover:bg-muted/20"
                        )}
                       >
                          <div className="flex items-center gap-3">
                             <f.icon className="w-4 h-4" />
                             <span className="text-xs font-black uppercase tracking-widest">{f.label}</span>
                          </div>
                          {filterState === f.id && <ChevronRight className="w-4 h-4" />}
                       </button>
                    ))}
                 </div>
              </div>
           </StaggerItem>

           {/* Results Bento */}
           <StaggerItem className="lg:col-span-9">
              <div className="premium-glass rounded-[3rem] overflow-hidden shadow-2xl">
                 <div className="px-10 py-8 border-b border-glass-border flex items-center justify-between bg-slate-50">
                    <h3 className="text-xl font-black text-foreground">Class Log</h3>
                    <div className="text-xs font-black uppercase text-muted-foreground tracking-widest bg-slate-100 px-4 py-2 rounded-full">
                       Displaying {filteredAttendance.length} matches
                    </div>
                 </div>

                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                       <thead>
                          <tr className="border-b border-glass-border">
                             <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Status</th>
                             <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Subject</th>
                             <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Date & Time</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-glass-border">
                          {filteredAttendance.length > 0 ? filteredAttendance.map((record, i) => (
                             <motion.tr 
                              key={i}
                              whileHover={{ backgroundColor: 'rgba(var(--primary), 0.02)' }}
                              className="group transition-colors"
                             >
                                <td className="px-10 py-6">
                                   <div className={cn(
                                      "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                      record.status.toLowerCase() === 'present' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
                                      record.status.toLowerCase() === 'absent' && "bg-rose-500/10 text-rose-600 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
                                      record.status.toLowerCase() === 'late' && "bg-amber-500/10 text-amber-600 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                   )}>
                                      {record.status.toLowerCase() === 'present' && <CheckCircle className="w-3 h-3" />}
                                      {record.status.toLowerCase() === 'absent' && <XCircle className="w-3 h-3" />}
                                      {record.status.toLowerCase() === 'late' && <Clock className="w-3 h-3" />}
                                      {record.status}
                                   </div>
                                </td>
                                <td className="px-10 py-6">
                                   <p className="text-base font-black text-foreground">{record.subject}</p>
                                </td>
                                <td className="px-10 py-6 text-right">
                                   <p className="text-sm font-black text-foreground">{new Date(record.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                   <p className="text-xs font-medium text-muted-foreground">Recorded at 09:00 AM</p>
                                </td>
                             </motion.tr>
                          )) : (
                             <tr>
                                <td colSpan={3} className="px-10 py-32 text-center">
                                   <div className="flex flex-col items-center">
                                      <div className="h-20 w-20 rounded-[2rem] bg-muted/10 flex items-center justify-center mb-6 border border-glass-border">
                                         <Calendar className="w-10 h-10 text-muted-foreground/30" />
                                      </div>
                                      <h4 className="text-xl font-black text-foreground">Matrix Empty</h4>
                                      <p className="text-sm font-medium text-muted-foreground mt-2 max-w-xs mx-auto">None of the recorded classes match your current filter matrix.</p>
                                      <button 
                                       onClick={() => {setFilterState('all'); setSearchQuery('');}}
                                       className="mt-8 px-6 py-3 rounded-2xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:shadow-lg shadow-emerald-500/20 transition-all"
                                      >
                                         Reset Filters
                                      </button>
                                   </div>
                                </td>
                             </tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
           </StaggerItem>
        </div>
      </div>
    </div>
  );
}
