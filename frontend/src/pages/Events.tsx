import { useState, useEffect } from 'react';
import { MapPin, Clock, Calendar, BookOpen, UserCheck, Trophy, Palmtree, Zap, Sparkles, ChevronRight } from 'lucide-react';
import { eventsApi } from '../api/eventsApi';
import { type Event as SchoolEvent } from '../types';
import { cn } from '../lib/utils';
import { StaggerContainer, StaggerItem } from '../components/ui/PageWrapper';

export default function Events() {
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await eventsApi.getEvents();
        setEvents(data);
      } catch (err) {
        console.error("Failed to fetch events:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const getEventStyles = (type: string) => {
    switch (type.toLowerCase()) {
      case 'meeting':
        return { color: 'text-indigo-500', bg: 'bg-indigo-500/10', glow: 'shadow-indigo-500/20', icon: <UserCheck className="w-5 h-5" /> };
      case 'holiday':
        return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20', icon: <Palmtree className="w-5 h-5" /> };
      case 'exam':
        return { color: 'text-rose-500', bg: 'bg-rose-500/10', glow: 'shadow-rose-500/20', icon: <BookOpen className="w-5 h-5" /> };
      case 'sports':
        return { color: 'text-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/20', icon: <Trophy className="w-5 h-5" /> };
      default:
        return { color: 'text-primary', bg: 'bg-primary/10', glow: 'shadow-primary/20', icon: <Zap className="w-5 h-5" /> };
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-10 pb-32">
      {/* Cinematic Header */}
      <div className="space-y-4 text-center lg:text-left">
         <div className="flex items-center justify-center lg:justify-start gap-3 text-primary text-[11px] font-black uppercase tracking-[0.5em] aurora-pulse">
            <Sparkles className="w-5 h-5 crystal-glow" />
            Institutional Timeline Active
         </div>
         <h1 className="text-7xl font-black tracking-tighter text-gradient-crystal leading-tight">
            Upcoming <span className="italic opacity-80">Milestones</span>
         </h1>
         <p className="text-lg font-bold text-muted-foreground/60 max-w-2xl">
            Live synchronization of academic events, campus gatherings, and milestone markers across the institutional network.
         </p>
      </div>

      {loading ? (
        <div className="flex flex-col justify-center items-center py-40 gap-6">
          <div className="relative w-20 h-20">
             <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
             <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-primary animate-pulse">Establishing Secure Stream...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="crystal-glass p-20 rounded-[4rem] flex flex-col items-center justify-center text-center space-y-6 border-dashed border-2 border-primary/20">
          <Calendar className="w-20 h-20 text-primary opacity-20" />
          <div>
             <h3 className="text-2xl font-black text-foreground">Timeline Empty</h3>
             <p className="text-sm font-bold text-muted-foreground/60 mt-2 italic">No active vectors found in the institutional scheduler.</p>
          </div>
        </div>
      ) : (
        <StaggerContainer className="relative space-y-12">
          {/* Crystalline Timeline Rail */}
          <div className="absolute left-10 lg:left-14 top-10 bottom-10 w-1.5 rounded-full bg-gradient-to-b from-primary/40 via-violet-500/20 to-transparent shadow-[0_0_15px_rgba(var(--primary),0.2)]" />
          
          {events.map((event) => {
            const styles = getEventStyles(event.type);
            
            return (
              <StaggerItem key={event.id}>
                 <div className="relative pl-24 lg:pl-32 group">
                    {/* Glowing Timeline Node */}
                    <div className={cn(
                      "absolute left-8 lg:left-12 top-4 w-6 h-6 rounded-full border-[6px] border-[#f4f7fa] z-10 transition-all duration-500 group-hover:scale-150 group-hover:shadow-[0_0_20px_rgba(var(--primary),0.5)]",
                      styles.color.replace('text-', 'bg-')
                    )} />

                    <div className="crystal-glass p-8 md:p-12 rounded-[3.5rem] hover:translate-x-4 transition-all duration-500 group relative overflow-hidden">
                       {/* Background Accent */}
                       <div className={cn("absolute top-0 right-0 w-32 h-32 opacity-0 group-hover:opacity-10 transition-opacity rounded-full blur-3xl", styles.bg)} />
                       
                       <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                          <div className="space-y-4 flex-1">
                             <div className="flex items-center gap-4">
                                <div className={cn("p-4 rounded-2xl crystal-glow", styles.bg, styles.color)}>
                                   {styles.icon}
                                </div>
                                <span className={cn("text-[10px] font-black uppercase tracking-[0.3em]", styles.color)}>
                                   {event.type} Point Identified
                                </span>
                             </div>
                             
                             <h3 className="text-4xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors leading-none">
                                {event.title}
                             </h3>
                             
                             {event.description && (
                               <p className="text-base font-bold text-muted-foreground/70 leading-relaxed max-w-3xl">
                                  {event.description}
                               </p>
                             )}
                          </div>
                          
                          <div className="flex flex-col items-end gap-3 shrink-0">
                             <div className="px-6 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm font-black text-sm text-foreground flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-primary" />
                                {new Date(event.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                             </div>
                             <div className="flex items-center gap-6 pr-2">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                   <Clock className="w-4 h-4" /> {event.time}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                                   <MapPin className="w-4 h-4" /> {event.location}
                                </div>
                             </div>
                          </div>
                       </div>
                       
                       <div className="mt-10 pt-8 border-t border-slate-100/50 flex items-center justify-between relative z-10">
                          <div className="flex items-center gap-4">
                             <div className="flex -space-x-4">
                                {[1,2,3].map(p => (
                                   <div key={p} className="w-10 h-10 rounded-full border-4 border-white bg-slate-100 flex items-center justify-center font-black text-xs text-muted-foreground">
                                      ?
                                   </div>
                                ))}
                             </div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Network Presence Active</p>
                          </div>
                          <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:gap-4 transition-all">
                             View Protocol <ChevronRight className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                 </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}
    </div>
  );
}
