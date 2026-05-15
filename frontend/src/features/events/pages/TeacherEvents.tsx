import { motion } from 'framer-motion';
import { MapPin, Clock, Calendar, BookOpen, UserCheck, Trophy, Palmtree, ArrowRight, Info } from 'lucide-react';
import { useApp } from '@/shared/contexts/AppContext';

export default function TeacherEvents() {
  const { events, isEventsLoading: loading } = useApp();

  const getEventStyles = (type: string) => {
    switch (type.toLowerCase()) {
      case 'meeting':
        return { color: 'bg-blue-600 text-blue-600 border-blue-200', icon: <UserCheck className="w-4 h-4" /> };
      case 'holiday':
        return { color: 'bg-emerald-600 text-emerald-600 border-emerald-200', icon: <Palmtree className="w-4 h-4" /> };
      case 'exam':
        return { color: 'bg-rose-600 text-rose-600 border-rose-200', icon: <BookOpen className="w-4 h-4" /> };
      case 'sports':
        return { color: 'bg-amber-600 text-amber-600 border-amber-200', icon: <Trophy className="w-4 h-4" /> };
      default:
        return { color: 'bg-slate-600 text-slate-600 border-slate-200', icon: <Calendar className="w-4 h-4" /> };
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Teacher Event Calendar</h1>
        <p className="text-muted-foreground italic">Stay synchronized with the school's academic and extracurricular master schedule.</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-muted-foreground italic border-2 border-dashed border-border rounded-2xl bg-muted/30">
          <Calendar className="w-12 h-12 mb-4 opacity-20" />
          <p>No master events found in the database. Contact Administration if this is an error.</p>
        </div>
      ) : (
        <div className="relative border-l-2 border-emerald-100 ml-4 pl-8 space-y-10 py-4">
          {events.map((event, index) => {
            const styles = getEventStyles(event.type);
            const isMultiDay = !!event.end_date;

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className={`absolute -left-[41px] top-2 h-5 w-5 rounded-full border-4 border-background ${styles.color.split(' ')[0]}`}></div>
                
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                  <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-[0.03] transition-transform group-hover:scale-110 ${styles.color.split(' ')[0]}`}></div>
                  
                  <div className="flex flex-col md:flex-row md:items-start justify-between mb-4 gap-4">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-foreground group-hover:text-emerald-700 transition-colors">{event.title}</h3>
                      {event.description && (
                        <p className="text-sm text-muted-foreground flex items-start gap-2 max-w-2xl">
                          <Info className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
                          {event.description}
                        </p>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider w-fit
                      ${styles.color.split(' ').slice(1).join(' ')} ${styles.color.split(' ')[0]}/10 border ${styles.color.split(' ')[2]}`}>
                      {styles.icon}
                      {event.type}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm text-muted-foreground mt-6 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-foreground">
                        {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        {isMultiDay && (
                          <span className="mx-2 inline-flex items-center">
                            <ArrowRight className="w-3 h-3 mx-1 opacity-50" />
                            {new Date(event.end_date!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-foreground">{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-foreground">{event.location}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
