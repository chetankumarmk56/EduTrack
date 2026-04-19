import { Trophy, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Extracurriculars() {
  const { user } = useAuth();
  
  // Real implementation will fetch from a future Extracurriculars API.
  // For now, we render the dynamic secure state indicating no records.
  const sports: any[] = [];

  if (!user?.id) return null;

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4">
             <div className="flex items-center gap-2 text-indigo-500 text-xs font-black uppercase tracking-[0.3em] bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20 w-fit">
                <Sparkles className="w-4 h-4 shadow-[0_0_10px_rgba(99,102,241,0.5)]" /> Physical Education & Arts
             </div>
             <h1 className="text-6xl font-black tracking-tighter text-foreground leading-[0.9]">
                Co-Curricular <span className="text-indigo-500 italic">Portfolio</span>
             </h1>
             <p className="text-muted-foreground font-medium max-w-xl">Athletic rosters, club participations, and institutional achievements.</p>
          </div>
        </div>

        {sports.length === 0 && (
          <div className="crystal-glass p-20 rounded-[4rem] flex flex-col items-center justify-center text-center space-y-6 border-dashed border-2 border-indigo-500/20">
            <Trophy className="w-20 h-20 text-indigo-500 opacity-20" />
            <div>
               <h3 className="text-2xl font-black text-foreground">Portfolio Empty</h3>
               <p className="text-sm font-bold text-muted-foreground/60 mt-2 italic">Awaiting backend synchronization of the co-curricular directory.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
