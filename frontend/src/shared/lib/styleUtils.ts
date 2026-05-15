/**
 * Utility to calculate performance-intensity styles.
 * High Score = Deep/Dark/Solid + Heavy Shadow
 * Low Score = Light/Faded/Translucent + Flat Shadow
 */
export const getPerformanceStyles = (score: number, maxScore: number, isDark: boolean = false) => {
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  if (isDark) {
    // Dark Mode (Obsidian -> Night Blue)
    if (percentage >= 90) return {
      card: "bg-card border-primary shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] border-opacity-50",
      text: "text-primary-foreground",
      bg: "bg-primary/40",
      icon: "text-primary glow-text"
    };
    if (percentage >= 70) return {
      card: "bg-card/80 border-border shadow-xl border-opacity-30",
      text: "text-foreground",
      bg: "bg-white/10",
      icon: "text-primary/80"
    };
    return {
      card: "bg-slate-900/40 border-slate-800 shadow-none border-opacity-20",
      text: "text-muted-foreground",
      bg: "bg-slate-800/20",
      icon: "text-muted-foreground/50"
    };
  } else {
    // Crystal Mode (White -> Pearl Gray)
    if (percentage >= 90) return {
      card: "bg-white border-primary shadow-[0_30px_60px_-12px_rgba(79,70,229,0.12)] border-opacity-70",
      text: "text-indigo-950 font-black",
      bg: "bg-indigo-50/80",
      icon: "text-primary"
    };
    if (percentage >= 70) return {
      card: "bg-white/80 border-slate-200 shadow-lg border-opacity-60",
      text: "text-slate-900 font-bold",
      bg: "bg-emerald-50/60",
      icon: "text-emerald-600"
    };
    return {
      card: "bg-slate-50/50 border-slate-100 shadow-none border-opacity-40",
      text: "text-slate-400 font-medium",
      bg: "bg-slate-100/30",
      icon: "text-slate-400"
    };
  }
};
