import { MapPin, Clock, Calendar, BookOpen, UserCheck, Trophy, Palmtree, Zap, Sparkles } from 'lucide-react';
import { type Event as SchoolEvent } from '@/shared/types';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';
import { SkeletonCardGrid } from '@/shared/components/ui/Skeleton';

export default function Events() {
  // Events are already hydrated into the shared context slice on auth
  // (refreshDirectory → refreshEvents) and kept in localStorage, so this
  // page reads from there instead of firing its own /events request on
  // every visit. Same source the teacher Events page already uses.
  const { events, isEventsLoading: loading } = useApp();

  const getEventStyles = (event: SchoolEvent) => {
    if (event.is_holiday) {
      return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20', icon: <Palmtree className="w-5 h-5" /> };
    }
    const type = (event.type || '').toLowerCase();
    if (type.includes('meeting')) {
      return { color: 'text-indigo-500', bg: 'bg-indigo-500/10', glow: 'shadow-indigo-500/20', icon: <UserCheck className="w-5 h-5" /> };
    }
    if (type.includes('exam')) {
      return { color: 'text-rose-500', bg: 'bg-rose-500/10', glow: 'shadow-rose-500/20', icon: <BookOpen className="w-5 h-5" /> };
    }
    if (type.includes('sport')) {
      return { color: 'text-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/20', icon: <Trophy className="w-5 h-5" /> };
    }
    return { color: 'text-primary', bg: 'bg-primary/10', glow: 'shadow-primary/20', icon: <Zap className="w-5 h-5" /> };
  };

  return (
    <div className="w-full space-y-8 sm:space-y-12 py-6 sm:py-10 pb-24">
      {/* Cinematic Header */}
      <div className="space-y-4 text-center lg:text-left">
         <div className="flex items-center justify-center lg:justify-start gap-3 text-primary text-[11px] font-black uppercase tracking-[0.5em] aurora-pulse">
            <Sparkles className="w-5 h-5 crystal-glow" />
            Institutional Timeline Active
         </div>
         <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-gradient-crystal leading-tight">
            Upcoming <span className="italic opacity-80">Milestones</span>
         </h1>
         <p className="text-base sm:text-lg font-bold text-muted-foreground/60 max-w-3xl">
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
        <SkeletonCardGrid count={6} cols="lg" />
      ) : events.length === 0 ? (
        <div className="crystal-glass p-10 sm:p-16 md:p-20 rounded-3xl sm:rounded-[4rem] flex flex-col items-center justify-center text-center space-y-6 border-dashed border-2 border-primary/20">
          <Calendar className="w-20 h-20 text-primary opacity-20" />
          <div>
             <h3 className="text-2xl font-black text-foreground">Timeline Empty</h3>
             <p className="text-sm font-bold text-muted-foreground/60 mt-2 italic">No active vectors found in the institutional scheduler.</p>
          </div>
        </div>
      ) : (
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 xl:gap-8">
          {events.map((event) => {
            const styles = getEventStyles(event);
            const eventDate = new Date(event.date);

            return (
              <StaggerItem key={event.id}>
                <div className="crystal-glass p-5 sm:p-7 xl:p-8 rounded-3xl sm:rounded-[2.5rem] relative overflow-hidden h-full flex flex-col gap-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(99,102,241,0.25)] group">
                  {/* Background accent — fades in on hover */}
                  <div className={cn("absolute -top-12 -right-12 w-48 h-48 opacity-30 group-hover:opacity-60 transition-opacity rounded-full blur-3xl", styles.bg)} />

                  {/* Header row: type chip + date badge */}
                  <div className="flex items-start justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <div className={cn("p-3 rounded-2xl crystal-glow shrink-0", styles.bg, styles.color)}>
                        {styles.icon}
                      </div>
                      <span className={cn("text-[10px] font-black uppercase tracking-[0.3em] truncate", styles.color)}>
                        {event.type}
                      </span>
                      {event.is_holiday && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[9px] font-black uppercase tracking-widest">
                          <Palmtree className="w-2.5 h-2.5" /> Non-Teaching Day — No Classes
                        </span>
                      )}
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
