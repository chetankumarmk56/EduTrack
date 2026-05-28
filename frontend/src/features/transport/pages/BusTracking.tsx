import { Bus, Wrench } from 'lucide-react';

export default function BusTracking() {
   return (
      <div className="premium-page-container animate-fade-in flex items-center justify-center min-h-[calc(100vh-120px)]">
         <div className="relative max-w-xl w-full text-center space-y-8 p-8 sm:p-12 rounded-2xl sm:rounded-[3rem] border border-glass-border bg-white/[0.02] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative space-y-6">
               <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
                  <Bus className="w-10 h-10 sm:w-12 sm:h-12" />
               </div>

               <div className="space-y-3">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase italic">
                     Bus Tracking
                  </h1>
                  <p className="text-sm sm:text-base font-medium text-text-secondary leading-relaxed">
                     Live bus tracking is still being implemented. You'll be able to follow your child's bus on a real-time map here once the feature is ready.
                  </p>
               </div>

               <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
                  <Wrench className="w-3 h-3" />
                  Coming Soon
               </div>
            </div>
         </div>
      </div>
   );
}
