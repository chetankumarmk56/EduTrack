import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../lib/AppContext';
import { 
  Calendar, Sparkles, CheckCircle2, AlertCircle, Download, 
  Loader2, Play, UploadCloud, Clock, Share2, 
  BookOpen, ChevronRight, Wand2, Zap, Settings
} from 'lucide-react';
import { StaggerContainer, StaggerItem } from '../../components/ui/PageWrapper';
import { aiApi } from '../../api/aiApi';

interface LessonDay {
  date: string;
  topic: string;
  subtopics: string[];
  objectives: string[];
  duration_hours: number;
}

export default function LessonPlan() {
  const { aiAnalysis, setAiAnalysis, teacherSubject } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('2');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);

  const handleUpload = async () => {
    if (!file || !startDate || !endDate) {
      alert("Please provide the PDF and the full timeline.");
      return;
    }

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('start_date', startDate);
    formData.append('end_date', endDate);
    formData.append('hours_per_day', hoursPerDay);

    try {
      const data = await aiApi.analyzeCurriculum(formData);
      setAiAnalysis(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPPT = async () => {
    if (!aiAnalysis) return;
    setIsGeneratingPPT(true);
    try {
      const blob = await aiApi.downloadPpt(aiAnalysis.suggested_ppt_slides);
      
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LessonPlan_${new Date().getTime()}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingPPT(false);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `AI-generated Lesson Plan for ${teacherSubject}!\n\nSchedule: ${startDate} to ${endDate}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-10">
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-2 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Sparkles className="h-3.5 w-3.5 fill-primary" />
            AI Intelligence Suite
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-foreground -mb-1">
            Curriculum Planner
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            Harnessing <span className="text-primary font-black">Neural Core</span> to architect your teaching journey.
          </p>
        </div>
        <div className="hidden md:flex gap-2">
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-2xl px-5 py-2.5 backdrop-blur-md">
             <Zap className="w-3 h-3 text-primary animate-pulse fill-primary" />
             <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">Neural Analysis Active</span>
          </div>
        </div>
      </div>

      {!aiAnalysis ? (
        <StaggerContainer>
          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* Step 1: Upload Card (2 columns) */}
            <StaggerItem className="lg:col-span-2">
              <div className="premium-card p-10 bg-card/40 border-glass-border relative group overflow-hidden">
                <div className="absolute top-4 right-6 text-[10px] font-black uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-opacity">Protocol 01</div>
                
                {/* Decorative background element */}
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-primary/5 rounded-full blur-[80px] group-hover:bg-primary/10 transition-all" />

                <div className="flex flex-col items-center text-center relative z-10">
                  <div className="relative mb-10">
                    <motion.div 
                      animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className="h-28 w-28 rounded-[2rem] bg-muted/40 border border-white/5 flex items-center justify-center text-primary shadow-2xl group-hover:border-primary/30 transition-all font-black text-4xl"
                    >
                      <UploadCloud className="w-14 h-14" />
                    </motion.div>
                    <div className="absolute -right-3 -bottom-3 aurora-gradient text-white rounded-2xl p-3 shadow-xl aurora-glow">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>
                  
                  <h3 className="text-3xl font-black mb-4 tracking-tight">Ingest Source</h3>
                  <p className="text-muted-foreground text-sm font-bold mb-10 max-w-[260px] leading-relaxed">
                    Upload a Syllabus or Chapter PDF for deep <span className="text-primary font-black">Neural Mapping</span>.
                  </p>

                  <input 
                    type="file" 
                    id="pdf-upload" 
                    hidden 
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <label 
                    htmlFor="pdf-upload"
                    className="cursor-pointer group relative inline-flex items-center justify-center px-10 py-5 aurora-gradient text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 hover:scale-105 transition-all w-full overflow-hidden aurora-glow"
                  >
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <span className="relative z-10">{file ? file.name : "Initialize Document"}</span>
                  </label>
                  {file && (
                    <motion.span 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mt-8 bg-primary/10 px-6 py-2 rounded-2xl border border-primary/20 aurora-glow"
                    >
                      ✓ Target Captured
                    </motion.span>
                  )}
                </div>
              </div>
            </StaggerItem>

            {/* Step 2: Parameters (3 columns) */}
            <StaggerItem className="lg:col-span-3">
              <div className="premium-card p-10 bg-card/40 border-glass-border relative group h-full overflow-hidden">
                <div className="absolute top-4 right-6 text-[10px] font-black uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-opacity">Protocol 02</div>
                
                {/* Decorative background element */}
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px] group-hover:bg-primary/10 transition-all" />

                <h3 className="text-3xl font-black mb-10 flex items-center gap-4 relative z-10">
                  <div className="p-3 rounded-2xl bg-muted/40 border border-white/5 text-primary aurora-glow">
                    <Settings className="w-6 h-6" />
                  </div>
                  Configuration
                </h3>
                
                <div className="grid sm:grid-cols-2 gap-8 mb-12 relative z-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">Commencement</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-16 px-6 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-sm transition-all hover:border-primary/30"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">Termination</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-16 px-6 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-sm transition-all hover:border-primary/30"
                    />
                  </div>
                </div>

                <div className="space-y-5 mb-14 relative z-10">
                  <div className="flex items-center justify-between ml-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">Intensity Velocity</label>
                    <span className="text-2xl font-black text-primary aurora-glow tabular-nums">{hoursPerDay}h<span className="text-xs opacity-40 ml-1">/day</span></span>
                  </div>
                  <div className="relative h-14 flex items-center bg-black/40 px-6 rounded-2xl border border-white/5">
                    <input 
                      type="range" 
                      min="0.5" 
                      max="12" 
                      step="0.5" 
                      value={hoursPerDay}
                      onChange={(e) => setHoursPerDay(e.target.value)}
                      className="w-full h-1.5 bg-muted/40 rounded-full appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>

                <button 
                  disabled={isAnalyzing || !file}
                  onClick={handleUpload}
                  className="w-full group relative h-18 aurora-gradient disabled:bg-muted text-white rounded-2xl font-black text-base uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 flex items-center justify-center gap-4 transition-all hover:translate-y-[-4px] active:translate-y-0 aurora-glow aurora-pulse aurora-border-trace"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Neural Synthesis...
                    </>
                  ) : (
                    <>
                      Construct Master Plan
                      <Wand2 className="w-6 h-6" />
                    </>
                  )}
                </button>
              </div>
            </StaggerItem>
          </div>
        </StaggerContainer>
      ) : (
        <StaggerContainer>
          {/* Analysis Results View */}
          <div className="space-y-12">
            {/* Warning Banner */}
            <AnimatePresence>
              {aiAnalysis.reconsideration_required && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-[2rem] p-8 flex gap-8 items-start shadow-2xl backdrop-blur-xl"
                >
                  <div className="p-4 rounded-2xl bg-red-500/20 text-red-500 shadow-lg shadow-red-500/10">
                    <AlertCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-foreground mb-2 uppercase tracking-tight">Curriculum Density Threshold Exceeded</h4>
                    <p className="text-muted-foreground text-sm font-bold leading-relaxed max-w-2xl">{aiAnalysis.warning_message}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-8 border-b border-white/5">
              <div className="flex items-center gap-6">
                <div className="aurora-gradient text-white p-5 rounded-2xl shadow-2xl aurora-glow">
                  <Calendar className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-4xl font-black tracking-tight">Strategic Timeline</h2>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] opacity-80 mt-1">Synthesis Complete • Optimized Neural Path</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 w-full md:w-auto">
                <button 
                  onClick={handleShareWhatsApp}
                  className="flex-1 md:flex-none h-16 px-10 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-500 hover:text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all"
                >
                  <Share2 className="w-5 h-5 inline mr-3" />
                  Broadcast
                </button>
                <button 
                  onClick={handleDownloadPPT}
                  disabled={isGeneratingPPT}
                  className="flex-1 md:flex-none h-16 px-10 aurora-gradient text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl aurora-glow transition-all"
                >
                  {isGeneratingPPT ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Download className="w-5 h-5 inline mr-3" />}
                  Export Deck
                </button>
              </div>
            </div>

            {/* Timeline List */}
            <div className="grid gap-6">
              {aiAnalysis.lesson_plan.map((day: LessonDay, i: number) => (
                <StaggerItem key={i} className="group flex gap-8">
                  <div className="hidden sm:flex flex-col items-center">
                    <div className="h-20 w-20 rounded-[1.5rem] bg-muted/40 border border-white/5 flex items-center justify-center text-primary font-black text-2xl shadow-premium relative group-hover:border-primary/50 group-hover:aurora-glow transition-all duration-500">
                      <div className="absolute inset-0 bg-primary/5 scale-0 group-hover:scale-100 transition-transform rounded-3xl" />
                      <span className="relative">{i + 1}</span>
                    </div>
                    <div className="w-[3px] flex-1 bg-gradient-to-b from-primary/40 to-transparent my-6 group-last:hidden rounded-full shadow-primary/20" />
                  </div>
                  
                  <div className="flex-1 premium-card p-10 bg-card/40 border-glass-border mb-12 group-hover:translate-x-3 transition-all duration-500 cursor-default relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[60px] translate-x-16 -translate-y-16 group-hover:bg-primary/20 transition-all" />

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-10 pb-6 border-b border-white/5 relative z-10">
                      <div>
                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-3 block opacity-60">{day.date}</span>
                        <h3 className="text-3xl font-black tracking-tight group-hover:text-primary transition-all duration-500">{day.topic}</h3>
                      </div>
                      <div className="bg-primary/10 border border-primary/20 px-8 py-3.5 rounded-2xl text-[10px] font-black text-primary flex items-center gap-3 self-start md:self-center tabular-nums aurora-glow shadow-lg shadow-primary/5">
                        <Clock className="w-4 h-5 fill-primary/20" />
                        {day.duration_hours}H CONTACT SESSION
                      </div>
                    </div>
                    
                    <div className="grid lg:grid-cols-2 gap-16 relative z-10">
                      <div className="space-y-6">
                        <h4 className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-[0.3em] flex items-center gap-3">
                           <BookOpen className="w-4.5 h-4.5 text-primary" /> Content Matrix
                        </h4>
                        <ul className="grid gap-4">
                          {day.subtopics.map((st: string, j: number) => (
                            <li key={j} className="text-sm font-bold text-foreground/90 flex items-start gap-5 p-4 rounded-2xl bg-muted/5 border border-white/5 hover:border-primary/30 hover:bg-muted/10 transition-all group/item">
                              <span className="h-2.5 w-2.5 rounded-full aurora-gradient mt-1.5 flex-shrink-0 aurora-glow group-hover/item:scale-125 transition-transform" />
                              {st}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-6 border-t lg:border-t-0 lg:border-l border-white/5 pt-10 lg:pt-0 lg:pl-16">
                        <h4 className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-[0.3em] flex items-center gap-3">
                           <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" /> Strategic Objectives
                        </h4>
                        <ul className="grid gap-4">
                          {day.objectives.map((obj: string, j: number) => (
                            <li key={j} className="text-sm font-black text-emerald-400/90 flex items-start gap-5 p-4 rounded-2xl bg-emerald-500/5 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all">
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </div>

            <div className="flex justify-center pt-24">
              <button 
                onClick={() => setAiAnalysis(null)}
                className="group flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 hover:text-primary transition-all aurora-glow-hover"
              >
                <div className="flex items-center gap-3 border border-white/10 px-8 py-4 rounded-2xl group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                   <ChevronRight className="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-2" /> 
                   Reset Neural Mapping
                </div>
              </button>
            </div>
          </div>
        </StaggerContainer>
      )}
    </div>
  );
}
