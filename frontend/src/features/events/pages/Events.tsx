import { useState, useEffect } from 'react';
import { MapPin, Clock, Calendar, BookOpen, UserCheck, Trophy, Palmtree, Zap, Sparkles } from 'lucide-react';
import { eventsApi } from '@/features/events/api';
import { type Event as SchoolEvent } from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';

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
    <div className="w-full px-4 md:px-8 xl:px-12 space-y-12 py-10 pb-32">
      {/* Cinematic Header */}
      <div className="space-y-4 text-center lg:text-left">
         <div className="flex items-center justify-center lg:justify-start gap-3 text-primary text-[11px] font-black uppercase tracking-[0.5em] aurora-pulse">
            <Sparkles className="w-5 h-5 crystal-glow" />
            Institutional Timeline Active
         </div>
         <h1 className="text-7xl font-black tracking-tighter text-gradient-crystal leading-tight">
            Upcoming <span className="italic opacity-80">Milestones</span>
         </h1>
         <p className="text-lg font-bold text-muted-foreground/60 max-w-3xl">
            Live synchronization of academic events, campus gatherings, and milestone markers across the institutional network.
         </p>
         {!loading && events.length > 0 && (
           <div className="flex items-center gap-2 pt-2">
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">{events.length} active</span>
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">events on the timeline</span>
           </div>
         )}
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
        <StaggerContainer className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 xl:gap-8">
          {events.map((event) => {
            const styles = getEventStyles(event.type);
            const eventDate = new Date(event.date);

            return (
              <StaggerItem key={event.id}>
                <div className="crystal-glass p-7 xl:p-8 rounded-[2.5rem] relative overflow-hidden h-full flex flex-col gap-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(99,102,241,0.25)] group">
                  {/* Background accent — fades in on hover */}
                  <div className={cn("absolute -top-12 -right-12 w-48 h-48 opacity-30 group-hover:opacity-60 transition-opacity rounded-full blur-3xl", styles.bg)} />

                  {/* Header row: type chip + date badge */}
                  <div className="flex items-start justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("p-3 rounded-2xl crystal-glow shrink-0", styles.bg, styles.color)}>
                        {styles.icon}
                      </div>
                      <span className={cn("text-[10px] font-black uppercase tracking-[0.3em] truncate", styles.color)}>
                        {event.type}
                      </span>
                    </div>

                    <div className="px-4 py-2 rounded-2xl bg-white/80 backdrop-blur border border-slate-100 shadow-sm shrink-0 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                        {eventDate.toLocaleDateString(undefined, { month: 'short' })}
                      </p>
                      <p className="text-2xl font-black text-foreground leading-none tabular-nums">
                        {eventDate.getDate()}
                      </p>
                      <p className="text-[9px] font-black tracking-widest text-muted-foreground/40">
                        {eventDate.toLocaleDateString(undefined, { year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Title + description */}
                  <div className="space-y-3 relative z-10 flex-1">
                    <h3 className="text-2xl xl:text-3xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2">
                      {event.title}
                    </h3>
                    {event.description && (
                      <p className="text-sm font-medium text-muted-foreground/70 leading-relaxed line-clamp-3">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Meta row: time + location */}
                  <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100/60 relative z-10">
                    {event.time && (
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                        <Clock className="w-3.5 h-3.5" /> {event.time}
                      </div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500 min-w-0">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
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
