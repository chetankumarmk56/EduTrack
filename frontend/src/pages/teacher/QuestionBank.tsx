import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../lib/AppContext';
import { 
  CheckCircle2, Copy, Search, 
  Sparkles,
  BookOpen, Trash2, Loader2,
  FileUp, Trophy, Printer,
  Layers, Zap, Hash, Edit3,
  Dna, Network, Database, Cpu,
  Bookmark
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { StaggerContainer, StaggerItem } from '../../components/ui/PageWrapper';
import { aiApi } from '../../api/aiApi';

interface Question {
  type: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  marks: number;
  question: string;
  options: string[] | null;
  answer: string;
}

const GENERATION_STEPS = [
  { id: 'ingest', name: 'Document Ingestion', icon: FileUp, detail: 'Extracting clean text content...' },
  { id: 'vector', name: 'Vectorization', icon: Dna, detail: 'Generating semantic neural embeddings...' },
  { id: 'index', name: 'Local Indexing', icon: Database, detail: 'Saving to persistent knowledge base...' },
  { id: 'retrieve', name: 'Context Retrieval', icon: Network, detail: 'Mapping domains to relevant chunks...' },
  { id: 'synthesis', name: 'Neural Synthesis', icon: Cpu, detail: 'Crafting Bloom-optimized questions...' },
];

export default function QuestionBank() {
  const { aiAnalysis, setAiAnalysis, teacherSubject } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [topics, setTopics] = useState('');
  const [counts, setCounts] = useState({ easy: 5, medium: 5, hard: 2 });
  const [typeCounts, setTypeCounts] = useState({ mcq: 5, short: 5, long: 2 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [indexedDocs, setIndexedDocs] = useState<{id: number, filename: string}[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  useEffect(() => {
    fetchIndexedDocs();
  }, []);

  const fetchIndexedDocs = async () => {
    try {
      const data = await aiApi.getIndexedDocuments();
      setIndexedDocs(data);
    } catch (err) { console.error(err); }
  };

  const questions: Question[] = useMemo(() => aiAnalysis?.question_bank || [], [aiAnalysis]);
  
  const handleEditQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setAiAnalysis({ ...aiAnalysis, question_bank: updated });
  };

  const handleGenerate = async () => {
    if (!file && !selectedDocId) {
      alert("Please upload a PDF or select a previously indexed document.");
      return;
    }
    if (!topics) {
      alert("Please specify target topics for context retrieval.");
      return;
    }

    setIsGenerating(true);
    setActiveStep(0);
    
    // Simulate pipeline steps for premium feel
    const interval = setInterval(() => {
      setActiveStep(prev => (prev < 4 ? prev + 1 : prev));
    }, 1500);

    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('topics', topics);
    formData.append('easy', String(counts.easy));
    formData.append('medium', String(counts.medium));
    formData.append('hard', String(counts.hard));
    formData.append('mcq', String(typeCounts.mcq));
    formData.append('short', String(typeCounts.short));
    formData.append('long', String(typeCounts.long));
    if (selectedDocId) formData.append('doc_id', String(selectedDocId));

    try {
      const data = await aiApi.generateQuestions(formData);
      setAiAnalysis({ ...aiAnalysis, question_bank: data });
      fetchIndexedDocs(); // Refresh if new file was added
    } catch (err) {
      console.error(err);
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = async (isKey: boolean = false) => {
    if (!questions.length) return;
    setIsExporting(isKey ? 'key' : 'exam');
    try {
      const blob = await aiApi.downloadPdf({
        questions: questions,
        subject: teacherSubject,
        filename: isKey ? "AnswerKey.pdf" : "Examination.pdf",
        is_answer_key: isKey
      });
      
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = isKey ? `Answers_${teacherSubject}.pdf` : `Exam_${teacherSubject}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(null);
    }
  };

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  const filteredQuestions = questions.filter(q => 
    q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.difficulty.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="grid lg:grid-cols-4 gap-10">
        {/* Configuration Hub */}
        <div className="lg:col-span-1 space-y-6">
          <div className="premium-card p-8 bg-card/40 border-glass-border sticky top-24 overflow-hidden group">
            <div className="absolute top-4 right-6 text-[10px] font-black uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-opacity">Protocol RAG</div>
            
            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4 aurora-glow">
              <Zap className="h-3.5 w-3.5 fill-primary" />
              Neural Hub
            </div>
            <h3 className="text-3xl font-black tracking-tighter mb-10">
              RAG Control
            </h3>
            
            <div className="space-y-8 relative z-10">
              {/* Document Source */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">Archive Source</label>
                <div className="space-y-3">
                  <label className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer",
                    file ? "bg-primary/5 border-primary/40 text-primary aurora-glow" : "bg-black/40 border-white/5 hover:border-primary/50 text-muted-foreground",
                    selectedDocId && "opacity-50 grayscale pointer-events-none"
                  )}>
                    <div className={cn("p-3 rounded-xl", file ? "aurora-gradient text-white" : "bg-muted/40 text-muted-foreground")}>
                      <FileUp className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-[0.2em] truncate">{file ? file.name : 'Ingest PDF'}</span>
                    <input type="file" hidden accept=".pdf" onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setSelectedDocId(null);
                    }} />
                  </label>

                  {indexedDocs.length > 0 && (
                    <div className="bg-black/40 border border-white/5 rounded-2xl p-2 max-h-48 overflow-y-auto custom-scrollbar backdrop-blur-md">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/40 p-3">Local Knowledge Base</p>
                      {indexedDocs.map(doc => (
                        <button 
                          key={doc.id}
                          onClick={() => {
                            setSelectedDocId(doc.id === selectedDocId ? null : doc.id);
                            setFile(null);
                          }}
                          className={cn(
                            "w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all mb-1",
                            selectedDocId === doc.id ? "bg-primary/10 border border-primary/20 text-primary aurora-glow" : "hover:bg-white/5 text-muted-foreground/60"
                          )}
                        >
                          <Bookmark className={cn("w-3.5 h-3.5 transition-all text-primary", selectedDocId === doc.id ? "fill-primary" : "opacity-20")} />
                          <span className="text-[10px] font-black uppercase tracking-widest truncate">{doc.filename}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Target Domains */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">Semantic Targets</label>
                <textarea 
                  placeholder="E.g. Cell structure, Photosynthesis mechanics..."
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  className="w-full h-40 p-5 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-bold text-sm transition-all resize-none text-foreground placeholder:text-muted-foreground/20 hover:border-primary/30"
                />
              </div>

              {/* Distribution Ratios */}
              <div className="space-y-6 pt-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">Generation Architecture</label>
                
                {/* Complexity Rows */}
                <div className="grid grid-cols-3 gap-4">
                  {['easy', 'medium', 'hard'].map((diff) => (
                    <div key={diff} className="space-y-2">
                      <span className="text-[9px] font-black text-muted-foreground uppercase text-center block tracking-[0.2em] opacity-60">{diff}</span>
                      <input 
                        type="number" 
                        value={counts[diff as keyof typeof counts]}
                        onChange={(e) => setCounts({...counts, [diff]: Number(e.target.value)})}
                        className="w-full h-12 rounded-xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-center tabular-nums text-sm transition-all hover:border-primary/30"
                      />
                    </div>
                  ))}
                </div>

                {/* Type Rows - MCQ/Short/Long */}
                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                  {['mcq', 'short', 'long'].map((type) => (
                    <div key={type} className="space-y-2">
                      <span className="text-[9px] font-black text-muted-foreground uppercase text-center block tracking-[0.2em] opacity-60">{type}</span>
                      <input 
                        type="number" 
                        value={typeCounts[type as keyof typeof typeCounts]}
                        onChange={(e) => setTypeCounts({...typeCounts, [type]: Number(e.target.value)})}
                        className="w-full h-12 rounded-xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-center tabular-nums text-sm transition-all hover:border-primary/30"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                disabled={isGenerating || (!file && !selectedDocId)}
                className="w-full group relative h-16 aurora-gradient disabled:bg-muted text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 flex items-center justify-center gap-4 transition-all hover:translate-y-[-4px] active:translate-y-0 aurora-glow"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 fill-white" />}
                Initiate RAG Probe
              </button>
            </div>
          </div>
        </div>

        {/* Main Feed */}
        <div className="lg:col-span-3 space-y-12 pb-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 pb-8 border-b border-white/5">
            <div className="space-y-2">
               <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
                 <Layers className="h-4 w-4 fill-primary" />
                 Assessment Matrix
               </div>
               <h1 className="text-5xl font-black tracking-tighter text-foreground -mb-1">Neural Examiner</h1>
               <p className="text-muted-foreground font-medium text-sm">Semantic retrieval and Bloom-optimized synthesis.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-6">
              <div className="bg-muted/20 border border-primary/20 px-10 py-5 rounded-[2.5rem] shadow-premium flex items-center gap-8 group hover:border-primary/50 transition-all backdrop-blur-md">
                  <div className="relative">
                    <Trophy className="w-12 h-12 text-primary group-hover:scale-125 transition-transform aurora-glow animate-pulse" />
                    <div className="absolute inset-0 bg-primary blur-2xl opacity-10" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">Neural Intensity</div>
                    <div className="text-4xl font-black text-foreground tabular-nums leading-none mt-2">{totalMarks} <span className="text-[10px] opacity-30 uppercase tracking-[0.4em] ml-2">Units</span></div>
                  </div>
              </div>

              <div className="flex md:flex-col gap-3">
                  <button 
                    onClick={() => handleDownloadPDF(false)}
                    disabled={isExporting !== null || !questions.length}
                    className="h-14 px-8 bg-black/40 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center gap-4 disabled:opacity-20 group"
                  >
                    {isExporting === 'exam' ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <Printer className="w-5 h-5 text-primary transition-transform group-hover:scale-125" />}
                    Export Examination
                  </button>
                  <button 
                    onClick={() => handleDownloadPDF(true)}
                    disabled={isExporting !== null || !questions.length}
                    className="h-14 px-8 bg-black/40 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center gap-4 disabled:opacity-20 group"
                  >
                    {isExporting === 'key' ? <Loader2 className="w-5 h-5 animate-spin text-emerald-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500 transition-transform group-hover:scale-125" />}
                    Generate Master Key
                  </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                className="premium-card p-16 bg-gradient-to-br from-primary/10 to-transparent border-primary/20 backdrop-blur-3xl text-center relative overflow-hidden shadow-2xl aurora-glow"
              >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5">
                    <motion.div 
                      className="h-full aurora-gradient shadow-[0_0_20px_rgba(99,102,241,0.8)]"
                      initial={{ width: "0%" }}
                      animate={{ width: `${(activeStep + 1) * 20}%` }}
                      transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                    />
                </div>
                
                <div className="flex flex-col items-center gap-10">
                   <div className="relative h-32 w-32">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-[2.5rem] border-2 border-dashed border-primary/40"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        {(() => {
                           const StepIcon = GENERATION_STEPS[activeStep].icon;
                           return <motion.div
                             key={activeStep}
                             initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                             animate={{ scale: 1, opacity: 1, rotate: 0 }}
                             className="p-7 aurora-gradient text-white rounded-[2rem] shadow-2xl aurora-glow"
                           >
                             <StepIcon className="w-10 h-10" />
                           </motion.div>
                        })()}
                      </div>
                   </div>

                   <div className="space-y-4">
                      <h2 className="text-4xl font-black uppercase tracking-tighter">AI Mapping Sequence</h2>
                      <p className="text-muted-foreground font-bold max-w-lg mx-auto leading-relaxed">EduTrack is semantically analyzing your content archive using high-dimensional vector embeddings.</p>
                   </div>

                   <div className="flex gap-6">
                      {GENERATION_STEPS.map((step, idx) => (
                        <div key={step.id} className="flex flex-col items-center gap-3">
                           <div className={cn(
                             "w-4 h-4 rounded-full transition-all duration-700",
                             idx <= activeStep ? "aurora-gradient scale-125 aurora-glow" : "bg-white/5"
                           )} />
                           <span className={cn(
                             "text-[9px] font-black uppercase tracking-[0.3em]",
                             idx === activeStep ? "text-primary opacity-100" : "text-muted-foreground opacity-20"
                           )}>{step.id}</span>
                        </div>
                      ))}
                   </div>

                   <div className="bg-black/60 border border-white/5 px-10 py-5 rounded-2xl flex items-center gap-5 backdrop-blur-xl">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">{GENERATION_STEPS[activeStep].detail}</span>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isGenerating && (
            <>
              <div className="relative group">
                <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-6 w-6 text-primary group-focus-within:scale-125 transition-all opacity-40 group-focus-within:opacity-100" />
                <input
                  type="text"
                  placeholder="SEARCH NEURAL ARCHIVE..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-20 pl-20 pr-10 rounded-[2.5rem] border border-white/5 bg-black/40 backdrop-blur-2xl shadow-2xl outline-none font-black text-xs tracking-[0.4em] focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:font-black placeholder:opacity-20 hover:border-primary/20"
                />
              </div>

              <StaggerContainer className="grid gap-8">
                <AnimatePresence mode="popLayout">
                  {filteredQuestions.length === 0 ? (
                    <StaggerItem>
                      <div className="text-center py-40 bg-card/10 rounded-[3rem] border-2 border-dashed border-white/5 italic text-muted-foreground relative overflow-hidden group hover:border-primary/20 transition-all">
                        <div className="absolute inset-0 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                           <Network className="absolute top-10 left-10 w-48 h-48" />
                           <Database className="absolute bottom-10 right-10 w-48 h-48" />
                        </div>
                        <div className="relative inline-block mb-8">
                          <BookOpen className="w-24 h-24 opacity-5 group-hover:scale-110 transition-transform" />
                          <Sparkles className="absolute -top-3 -right-3 w-10 h-10 text-primary opacity-20 animate-pulse" />
                        </div>
                        <p className="text-base font-black uppercase tracking-[0.4em] opacity-40 group-hover:text-primary transition-colors">Probe Awaiting Data</p>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mt-3 opacity-20">Feed document data into the RAG pipeline to begin extraction.</p>
                      </div>
                    </StaggerItem>
                  ) : (
                    filteredQuestions.map((q, i) => (
                      <StaggerItem key={i}>
                        <motion.div 
                          layout
                          className="group premium-card p-[1px] bg-white/5 hover:bg-gradient-to-br hover:from-primary/40 hover:to-transparent transition-all duration-700 rounded-[2.5rem] overflow-hidden"
                        >
                          <div className="bg-black/40 backdrop-blur-2xl rounded-[2.4rem] p-10 relative overflow-hidden">
                            {/* Neural accent elements */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] pointer-events-none group-hover:bg-primary/10 transition-all duration-700" />
                            
                            <div className="flex flex-col lg:flex-row items-start justify-between gap-10">
                              <div className="flex gap-8 items-start flex-1">
                                <div className={cn(
                                  "w-16 h-16 rounded-[1.8rem] flex items-center justify-center font-black text-xl shadow-2xl border border-white/10 shrink-0 aurora-glow transition-all group-hover:scale-110 duration-500",
                                  q.difficulty === 'Easy' ? 'bg-emerald-500/10 text-emerald-400' : 
                                  q.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                                )}>
                                   {q.difficulty === 'Easy' ? 'E' : q.difficulty === 'Medium' ? 'M' : 'H'}
                                </div>
                                
                                <div className="space-y-6 flex-1">
                                  <div className="flex flex-wrap items-center gap-6">
                                     <div className="bg-white/5 border border-white/5 px-6 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md group-hover:border-primary/20 transition-all">
                                        <span className="text-[10px] font-black tracking-[0.3em] text-muted-foreground/40 uppercase">VALUE</span>
                                        <input 
                                          type="number" 
                                          value={q.marks} 
                                          onChange={(e) => handleEditQuestion(i, 'marks', Number(e.target.value))}
                                          className="w-12 bg-transparent text-primary font-black focus:outline-none tabular-nums text-lg hover:text-primary transition-colors"
                                        />
                                        <Hash className="w-3.5 h-3.5 text-primary/40" />
                                     </div>
                                     <div className="bg-primary/5 border border-primary/20 px-6 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">{q.type}</span>
                                     </div>
                                  </div>
                                  
                                  <div className="relative">
                                    <Edit3 className="absolute -left-10 top-2 w-5 h-5 opacity-0 group-hover:opacity-40 transition-all duration-500 text-primary" />
                                    <textarea 
                                      value={q.question}
                                      onChange={(e) => handleEditQuestion(i, 'question', e.target.value)}
                                      className="text-2xl font-black bg-transparent w-full border-none focus:ring-0 p-0 leading-tight outline-none resize-none text-foreground/90 hover:text-foreground transition-colors placeholder:opacity-10"
                                      rows={2}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex lg:flex-col gap-4 translate-x-10 lg:translate-x-0 lg:translate-y-10 opacity-0 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-700 shrink-0 self-center lg:self-start">
                                 <button className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all shadow-premium aurora-glow-hover"><Copy className="w-5 h-5" /></button>
                                 <button className="p-4 bg-red-500/10 text-red-400 border border-red-500/10 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-premium"><Trash2 className="w-5 h-5" /></button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-8 mt-10 border-t border-white/5 relative z-10 text-right">
                               <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/30 flex items-center gap-3 ml-auto group-hover:text-primary/60 transition-colors">
                                  <CheckCircle2 className="w-4 h-4 fill-primary/10" />
                                  Ready for Deployment
                                </div>
                            </div>
                          </div>
                        </motion.div>
                      </StaggerItem>
                    ))
                  )}
                </AnimatePresence>
              </StaggerContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
