import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { SkeletonHeader, SkeletonStatGrid, SkeletonCardGrid } from '@/shared/components/ui/Skeleton';
import {
  Mail, Phone, Heart,
  TrendingUp, TrendingDown,
  MapPin, CalendarDays
} from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';

export default function Profile() {
  const { user } = useAuth();
  const { studentProfile: activeStudent, studentMarks: marks } = useApp();

  // Compute Top Score and Least Score natively with relational mapping
  const academics = useMemo(() => {
    let top = { score: 0, subject: 'No Data', test: '-' };
    let least = { score: 0, subject: 'No Data', test: '-' };

    if (marks && marks.length > 0) {
      let max = -1;
      let min = 101;

      marks.forEach((m) => {
        const subjName = m.subject_ref?.name || m.subject || 'Unknown';
        const percentage = m.max_score > 0 ? (m.score / m.max_score) * 100 : 0;
        
        if (percentage > max) {
          max = percentage;
          top = { score: Math.round(percentage), subject: subjName, test: m.exam?.name || m.test_name || 'N/A' };
        }
        if (percentage < min) {
          min = percentage;
          least = { score: Math.round(percentage), subject: subjName, test: m.exam?.name || m.test_name || 'N/A' };
        }
      });
      
      // If min wasn't updated (e.g. only one mark exists)
      if (min === 101 && max !== -1) {
        least = { ...top };
      }
    }
    
    return { top, least };
  }, [marks]);

  if (!user?.id || !activeStudent) {
    return (
      <div className="space-y-8 p-6">
        <SkeletonHeader />
        <SkeletonStatGrid count={4} />
        <SkeletonCardGrid count={4} cols="md" />
      </div>
    );
  }

  const parentName = activeStudent.parent?.name || 'Guardian';
  const parentEmail = activeStudent.parent?.email || activeStudent.parent?.user?.email || 'N/A';
  const parentPhone = activeStudent.parent?.primary_phone || activeStudent.parent?.secondary_phone || 'N/A';

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
          <div className="space-y-2 sm:space-y-4">
             <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-foreground leading-[0.9]">
                Profile
             </h1>
          </div>
        </div>

        <div className="grid gap-5 sm:gap-8 lg:grid-cols-12">
          {/* Main Profile Column */}
          <StaggerContainer className="lg:col-span-8 space-y-5 sm:space-y-8">
            <StaggerItem>
              <div className="premium-glass p-5 sm:p-8 md:p-12 rounded-3xl sm:rounded-[3.5rem] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] -mr-32 -mt-32" />

                <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 items-center sm:items-start relative z-10">
                  <motion.div
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    className="h-28 w-28 sm:h-44 sm:w-44 rounded-3xl sm:rounded-[3rem] bg-gradient-to-tr from-primary to-indigo-400 p-0.5 sm:p-1 shadow-2xl shrink-0"
                  >
                    <div className="h-full w-full rounded-[1.7rem] sm:rounded-[2.8rem] bg-white flex items-center justify-center text-primary font-black text-3xl sm:text-5xl border-4 border-white">
                      {activeStudent.name.charAt(0)}
                    </div>
                  </motion.div>

                  <div className="flex-1 text-center sm:text-left space-y-4 sm:space-y-6 min-w-0">
                    <div>
                      <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-foreground mb-2 break-words">{activeStudent.name}</h2>
                      <div className="flex flex-wrap justify-center md:justify-start gap-3">
                        <span className="px-4 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-widest">
                          Student ID: #{activeStudent.id}
                        </span>
                        <span className="px-4 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest">
                          Class {activeStudent.school_class?.class_level || activeStudent.class_level}{activeStudent.school_class?.section?.name || activeStudent.section}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6 border-t border-glass-border">
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 flex items-center gap-2">
                          <CalendarDays className="w-3 h-3 text-primary" /> Birthday
                        </p>
                        <p className="font-bold text-foreground">{activeStudent.dob || 'Not Set'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-primary" /> Campus
                        </p>
                        <p className="font-bold text-foreground">Main Wing</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5 flex items-center gap-2">
                          <Heart className="w-3 h-3 text-primary" /> Role
                        </p>
                        <p className="font-bold text-foreground">Premium User</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Academic Stats Bento */}
            <StaggerItem>
              <div className="grid sm:grid-cols-2 gap-6">
                <motion.div 
                  whileHover={{ y: -5 }}
                  className="premium-glass p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border-l-[8px] sm:border-l-[12px] border-emerald-500 shadow-xl shadow-emerald-500/5"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Peak Score</span>
                  </div>
                  <h3 className="text-4xl font-black text-foreground mb-1">{academics.top.score}%</h3>
                  <p className="text-sm font-black text-foreground mb-1">{academics.top.subject}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{academics.top.test}</p>
                </motion.div>

                <motion.div 
                  whileHover={{ y: -5 }}
                  className="premium-glass p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border-l-[8px] sm:border-l-[12px] border-amber-500 shadow-xl shadow-amber-500/5"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                      <TrendingDown className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">Growth Area</span>
                  </div>
                  <h3 className="text-4xl font-black text-foreground mb-1">{academics.least.score}%</h3>
                  <p className="text-sm font-black text-foreground mb-1">{academics.least.subject}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{academics.least.test}</p>
                </motion.div>
              </div>
            </StaggerItem>
          </StaggerContainer>

          {/* Sidebar Sidebar Column */}
          <StaggerContainer className="lg:col-span-4 space-y-8" delay={0.15}>
            {/* Parent Info Card */}
            <StaggerItem>
              <div className="premium-glass p-5 sm:p-8 rounded-2xl sm:rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="relative z-10 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/20">
                      {parentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-foreground tracking-tight">Parent Profile</h3>
                      <p className="text-[10px] font-black uppercase text-primary tracking-widest">Primary Contact</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="group">
                      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-2 group-hover:text-primary transition-colors">Guardian Name</p>
                      <p className="text-lg font-black text-foreground">{parentName}</p>
                    </div>
                    <div className="group">
                      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-2 group-hover:text-primary transition-colors">Primary Email</p>
                      <p className="text-lg font-black text-foreground flex items-center gap-2 truncate">
                        <Mail className="w-4 h-4 text-primary shrink-0" /> {parentEmail}
                      </p>
                    </div>
                    <div className="group">
                      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-2 group-hover:text-primary transition-colors">Whatsapp / Contact</p>
                      <p className="text-lg font-black text-foreground flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary shrink-0" /> {parentPhone}
                      </p>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-glass-border">
                    <div className="p-4 rounded-2xl bg-muted/20 border border-glass-border">
                       <p className="text-[10px] font-black text-muted-foreground leading-relaxed italic text-center">
                         Contact information is synced with student registration database.
                       </p>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </div>
    </div>
  );
}
