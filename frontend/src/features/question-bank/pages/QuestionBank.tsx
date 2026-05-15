import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Search,
  Sparkles,
  BookOpen,
  Trash2,
  Loader2,
  FileUp,
  Trophy,
  Printer,
  Layers,
  Zap,
  Edit3,
  Plus,
  Copy as CopyIcon,
  Share2,
  FolderOpen,
  X,
} from 'lucide-react';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { StaggerContainer, StaggerItem } from '@/shared/components/ui/PageWrapper';
import { shareToWhatsApp } from '@/shared/lib/shareToWhatsApp';
import { FilePicker } from '@/shared/components/FilePicker/FilePicker';
import {
  questionBankApi,
  type QuestionItem,
  type QuestionType,
  type Difficulty,
  type QuestionSpec,
} from '@/features/question-bank/api';
import { uploadedFilesApi } from '@/features/my-files/api';

const TYPES: { id: QuestionType; label: string }[] = [
  { id: 'mcq', label: 'MCQ' },
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
];
const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const DEFAULT_MARKS: Record<QuestionType, number> = { mcq: 1, short: 3, long: 7 };

type CountMatrix = Record<QuestionType, Record<Difficulty, number>>;

const emptyMatrix = (): CountMatrix => ({
  mcq: { Easy: 4, Medium: 2, Hard: 0 },
  short: { Easy: 2, Medium: 3, Hard: 1 },
  long: { Easy: 0, Medium: 1, Hard: 2 },
});

const matrixToSpecs = (m: CountMatrix): QuestionSpec[] => {
  const specs: QuestionSpec[] = [];
  (Object.keys(m) as QuestionType[]).forEach((t) =>
    DIFFICULTIES.forEach((d) => {
      const count = m[t][d];
      if (count > 0) specs.push({ type: t, difficulty: d, count });
    }),
  );
  return specs;
};

const newBlankQuestion = (): QuestionItem => ({
  id: `local-${Math.random().toString(36).slice(2, 10)}`,
  type: 'short',
  difficulty: 'Medium',
  marks: DEFAULT_MARKS.short,
  question: '',
  options: null,
  answer: '',
  explanation: '',
});

export default function QuestionBank() {
  const { aiAnalysis, setAiAnalysis, teacherSubject } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [parsedContent, setParsedContent] = useState<string>('');
  const [parsedFilename, setParsedFilename] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [subject, setSubject] = useState(teacherSubject || 'General');
  const [topics, setTopics] = useState('');
  const [matrix, setMatrix] = useState<CountMatrix>(emptyMatrix());
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState<'exam' | 'key' | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const questions: QuestionItem[] = useMemo(
    () => (aiAnalysis?.question_bank as QuestionItem[] | undefined) || [],
    [aiAnalysis],
  );

  const setQuestions = (next: QuestionItem[]) =>
    setAiAnalysis({ ...(aiAnalysis || {}), question_bank: next });

  const totalRequested = useMemo(
    () =>
      (Object.keys(matrix) as QuestionType[]).reduce(
        (sum, t) => sum + DIFFICULTIES.reduce((s, d) => s + (matrix[t][d] || 0), 0),
        0,
      ),
    [matrix],
  );

  const totalMarks = useMemo(
    () => questions.reduce((s, q) => s + (Number(q.marks) || 0), 0),
    [questions],
  );

  const filteredQuestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter(
      (q) =>
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term) ||
        q.type.toLowerCase().includes(term) ||
        q.difficulty.toLowerCase().includes(term),
    );
  }, [questions, searchTerm]);

  // ------------------------------------------------------------------
  // Edit handlers (fully editable per question)
  // ------------------------------------------------------------------
  const updateQuestion = (id: string, patch: Partial<QuestionItem>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const deleteQuestion = (id: string) =>
    setQuestions(questions.filter((q) => q.id !== id));

  const duplicateQuestion = (id: string) => {
    const idx = questions.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const clone: QuestionItem = {
      ...questions[idx],
      id: `local-${Math.random().toString(36).slice(2, 10)}`,
    };
    const next = [...questions];
    next.splice(idx + 1, 0, clone);
    setQuestions(next);
  };

  const addBlankQuestion = () => setQuestions([...questions, newBlankQuestion()]);

  const changeType = (id: string, type: QuestionType) => {
    const current = questions.find((q) => q.id === id);
    if (!current) return;
    const next: Partial<QuestionItem> = { type, marks: DEFAULT_MARKS[type] };
    if (type === 'mcq' && (!current.options || current.options.length === 0)) {
      next.options = ['', '', '', ''];
    } else if (type !== 'mcq') {
      next.options = null;
    }
    updateQuestion(id, next);
  };

  const updateOption = (id: string, optIdx: number, value: string) => {
    const q = questions.find((x) => x.id === id);
    if (!q || !q.options) return;
    const options = [...q.options];
    options[optIdx] = value;
    updateQuestion(id, { options });
  };

  const addOption = (id: string) => {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    const options = [...(q.options || []), ''];
    updateQuestion(id, { options });
  };

  const removeOption = (id: string, optIdx: number) => {
    const q = questions.find((x) => x.id === id);
    if (!q || !q.options) return;
    const options = q.options.filter((_, i) => i !== optIdx);
    updateQuestion(id, { options });
  };

  // ------------------------------------------------------------------
  // API actions
  // ------------------------------------------------------------------
  const handleFileSelect = async (selected: File | null) => {
    setFile(selected);
    if (!selected) {
      setParsedContent('');
      setParsedFilename('');
      return;
    }
    setIsParsing(true);
    try {
      const res = await questionBankApi.parseFile(selected);
      setParsedContent(res.content);
      setParsedFilename(res.filename);
    } catch (err) {
      console.error(err);
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleLibraryPick = async (picked: { id: number; original_filename: string }[]) => {
    setPickerOpen(false);
    const item = picked[0];
    if (!item) return;
    setIsParsing(true);
    try {
      const res = await uploadedFilesApi.getContent(item.id);
      if (!res.content) {
        toast.error('No extractable text in this file.');
        return;
      }
      setFile(null);
      setParsedContent(res.content);
      setParsedFilename(res.original_filename);
    } catch (err) {
      console.error(err);
    } finally {
      setIsParsing(false);
    }
  };

  const handleGenerate = async () => {
    if (!topics.trim()) {
      toast.error('Please enter at least one topic.');
      return;
    }
    if (totalRequested <= 0) {
      toast.error('Set at least one question count in the matrix.');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await questionBankApi.generate({
        topics: topics.trim(),
        content: parsedContent || undefined,
        subject: subject || 'General',
        specs: matrixToSpecs(matrix),
      });
      setQuestions(res.questions);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = async (isAnswerKey: boolean) => {
    if (!questions.length) return;
    setIsExporting(isAnswerKey ? 'key' : 'exam');
    try {
      const blob = await questionBankApi.exportPdf({
        questions,
        subject: subject || 'General',
        is_answer_key: isAnswerKey,
        filename: isAnswerKey
          ? `AnswerKey_${subject || 'General'}.pdf`
          : `QuestionBank_${subject || 'General'}.pdf`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isAnswerKey
        ? `AnswerKey_${subject || 'General'}.pdf`
        : `QuestionBank_${subject || 'General'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(null);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!questions.length || isSharing) return;
    setIsSharing(true);
    try {
      const subjectSlug = subject || 'General';
      const filename = `QuestionBank_${subjectSlug}.pdf`;
      const blob = await questionBankApi.exportPdf({
        questions,
        subject: subjectSlug,
        is_answer_key: false,
        filename,
      });
      await shareToWhatsApp({
        blob,
        filename,
        title: `Question Bank — ${subjectSlug}`,
        text: `Question Bank — ${subjectSlug} (${questions.length} question${
          questions.length === 1 ? '' : 's'
        }, ${totalMarks} marks)`,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSharing(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-10">
      <div className="grid lg:grid-cols-4 gap-10">
        {/* Configuration Panel */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="premium-card p-8 bg-card/40 border-glass-border sticky top-24 overflow-hidden group">
            <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4 aurora-glow">
              <Zap className="h-3.5 w-3.5 fill-primary" />
              Configuration
            </div>
            <h3 className="text-3xl font-black tracking-tighter mb-8">Generator</h3>

            <div className="space-y-7 relative z-10">
              {/* Subject */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-bold text-sm transition-all hover:border-primary/30"
                />
              </div>

              {/* File upload */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">
                  Source File (optional)
                </label>
                <label
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed transition-all cursor-pointer',
                    file
                      ? 'bg-primary/5 border-primary/40 text-primary aurora-glow'
                      : 'bg-black/40 border-white/5 hover:border-primary/50 text-muted-foreground',
                  )}
                >
                  <div
                    className={cn(
                      'p-2.5 rounded-xl',
                      file ? 'aurora-gradient text-white' : 'bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {isParsing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileUp className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] truncate flex-1">
                    {file
                      ? parsedFilename || file.name
                      : 'Upload PDF / DOCX / TXT'}
                  </span>
                  {file && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleFileSelect(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.docx,.txt,.md"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-white/5 bg-black/30 hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Reuse from My Files
                </button>
                {parsedContent && (
                  <p className="text-[10px] text-muted-foreground/60 ml-2">
                    {parsedFilename ? `"${parsedFilename}" · ` : ''}
                    {parsedContent.length.toLocaleString()} characters extracted.
                  </p>
                )}
              </div>

              {/* Topics */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">
                  Topics
                </label>
                <textarea
                  placeholder="e.g. Cell structure, photosynthesis, mitosis…"
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  className="w-full h-32 p-4 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-medium text-sm transition-all resize-none text-foreground placeholder:text-muted-foreground/30 hover:border-primary/30"
                />
              </div>

              {/* Matrix: type × difficulty */}
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">
                  Question Mix
                </label>
                <div className="rounded-2xl border border-white/5 bg-black/40 p-3">
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <span />
                    {DIFFICULTIES.map((d) => (
                      <span
                        key={d}
                        className="text-[9px] font-black uppercase text-center tracking-[0.2em] text-muted-foreground/60"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  {TYPES.map(({ id, label }) => (
                    <div key={id} className="grid grid-cols-4 gap-2 mb-2 last:mb-0">
                      <span className="flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70">
                        {label}
                      </span>
                      {DIFFICULTIES.map((d) => (
                        <input
                          key={d}
                          type="number"
                          min={0}
                          max={50}
                          value={matrix[id][d]}
                          onChange={(e) =>
                            setMatrix({
                              ...matrix,
                              [id]: {
                                ...matrix[id],
                                [d]: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                              },
                            })
                          }
                          className="h-10 rounded-lg border border-white/5 bg-black/60 focus:ring-2 focus:ring-primary/50 outline-none text-center font-black tabular-nums text-sm hover:border-primary/30"
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60 ml-2">
                  Total: <span className="text-primary font-black">{totalRequested}</span> question{totalRequested === 1 ? '' : 's'}
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || isParsing || totalRequested === 0 || !topics.trim()}
                className="w-full group relative h-14 aurora-gradient disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 flex items-center justify-center gap-4 transition-all hover:translate-y-[-2px] active:translate-y-0 aurora-glow"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 fill-white" />}
                Generate Questions
              </button>
            </div>
          </div>
        </aside>

        {/* Main Feed */}
        <section className="lg:col-span-3 space-y-10 pb-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-6 border-b border-white/5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
                <Layers className="h-4 w-4 fill-primary" />
                Assessment Matrix
              </div>
              <h1 className="text-5xl font-black tracking-tighter text-foreground -mb-1">
                Question Bank
              </h1>
              <p className="text-muted-foreground font-medium text-sm">
                AI-assisted generation. Every field below is editable.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-muted/20 border border-primary/20 px-6 py-3 rounded-2xl flex items-center gap-4 backdrop-blur-md">
                <Trophy className="w-7 h-7 text-primary" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">
                    Total Marks
                  </div>
                  <div className="text-2xl font-black text-foreground tabular-nums leading-none mt-1">
                    {totalMarks}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleExportPdf(false)}
                  disabled={isExporting !== null || isSharing || !questions.length}
                  className="h-11 px-5 bg-black/40 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center gap-3 disabled:opacity-30"
                >
                  {isExporting === 'exam' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <Printer className="w-4 h-4 text-primary" />
                  )}
                  Export Exam
                </button>
                <button
                  onClick={() => handleExportPdf(true)}
                  disabled={isExporting !== null || isSharing || !questions.length}
                  className="h-11 px-5 bg-black/40 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center gap-3 disabled:opacity-30"
                >
                  {isExporting === 'key' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  Answer Key
                </button>
                <button
                  onClick={handleShareWhatsApp}
                  disabled={isExporting !== null || isSharing || !questions.length}
                  className="h-11 px-5 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 disabled:opacity-30"
                  title="Share exam paper PDF to WhatsApp"
                >
                  {isSharing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  Share via WhatsApp
                </button>
              </div>
            </div>
          </div>

          {/* Search + add */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative group flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input
                type="text"
                placeholder="Search questions, answers, type or difficulty…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 pl-14 pr-6 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-2xl outline-none font-medium text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:opacity-40 hover:border-primary/20"
              />
            </div>
            <button
              onClick={addBlankQuestion}
              className="h-14 px-6 rounded-2xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Blank Question
            </button>
          </div>

          {/* Generating placeholder */}
          <AnimatePresence>
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="premium-card p-10 bg-gradient-to-br from-primary/10 to-transparent border-primary/20 rounded-3xl text-center flex flex-col items-center gap-5"
              >
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">
                    Generating questions…
                  </h2>
                  <p className="text-muted-foreground text-sm mt-2">
                    Calling OpenAI ({totalRequested} requested). This usually takes
                    a few seconds.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Question cards */}
          {!isGenerating && (
            <StaggerContainer className="grid gap-6">
              <AnimatePresence mode="popLayout">
                {filteredQuestions.length === 0 ? (
                  <StaggerItem>
                    <div className="text-center py-24 bg-card/10 rounded-3xl border-2 border-dashed border-white/5 italic text-muted-foreground">
                      <BookOpen className="w-16 h-16 mx-auto opacity-10 mb-4" />
                      <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40">
                        {questions.length === 0
                          ? 'No questions yet — configure the matrix and click Generate.'
                          : 'No questions match your search.'}
                      </p>
                    </div>
                  </StaggerItem>
                ) : (
                  filteredQuestions.map((q) => (
                    <StaggerItem key={q.id}>
                      <QuestionCard
                        q={q}
                        onChange={(patch) => updateQuestion(q.id, patch)}
                        onChangeType={(t) => changeType(q.id, t)}
                        onUpdateOption={(idx, val) => updateOption(q.id, idx, val)}
                        onAddOption={() => addOption(q.id)}
                        onRemoveOption={(idx) => removeOption(q.id, idx)}
                        onDelete={() => deleteQuestion(q.id)}
                        onDuplicate={() => duplicateQuestion(q.id)}
                      />
                    </StaggerItem>
                  ))
                )}
              </AnimatePresence>
            </StaggerContainer>
          )}
        </section>
      </div>

      <FilePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleLibraryPick}
        mode="single"
        accept={['pdf', 'docx', 'txt', 'md']}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Individual editable question card
// ----------------------------------------------------------------------
interface QuestionCardProps {
  q: QuestionItem;
  onChange: (patch: Partial<QuestionItem>) => void;
  onChangeType: (t: QuestionType) => void;
  onUpdateOption: (idx: number, val: string) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function QuestionCard({
  q,
  onChange,
  onChangeType,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
  onDelete,
  onDuplicate,
}: QuestionCardProps) {
  const difficultyTone =
    q.difficulty === 'Easy'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : q.difficulty === 'Medium'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-red-500/10 text-red-400 border-red-500/20';

  return (
    <motion.div
      layout
      className="group premium-card p-[1px] bg-white/5 hover:bg-gradient-to-br hover:from-primary/40 hover:to-transparent transition-all duration-500 rounded-3xl overflow-hidden"
    >
      <div className="bg-black/40 backdrop-blur-2xl rounded-[1.45rem] p-6 lg:p-8 relative">
        {/* Header controls */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <select
            value={q.type}
            onChange={(e) => onChangeType(e.target.value as QuestionType)}
            className="h-9 px-3 rounded-xl border border-primary/20 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-[0.25em] outline-none focus:ring-2 focus:ring-primary/40"
          >
            {TYPES.map((t) => (
              <option key={t.id} value={t.id} className="bg-black">
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={q.difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
            className={cn(
              'h-9 px-3 rounded-xl border text-[10px] font-black uppercase tracking-[0.25em] outline-none focus:ring-2 focus:ring-primary/40',
              difficultyTone,
            )}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d} className="bg-black">
                {d}
              </option>
            ))}
          </select>

          <div className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/70">
              Marks
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={q.marks}
              onChange={(e) => onChange({ marks: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              className="w-12 bg-transparent text-primary font-black focus:outline-none tabular-nums text-sm text-center"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onDuplicate}
              title="Duplicate question"
              className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all"
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              title="Delete question"
              className="p-2 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question text */}
        <div className="relative mb-4">
          <Edit3 className="absolute -left-7 top-2 w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity text-primary" />
          <textarea
            value={q.question}
            onChange={(e) => onChange({ question: e.target.value })}
            placeholder="Question text…"
            rows={2}
            className="text-lg font-bold bg-transparent w-full border-none focus:ring-0 p-0 leading-snug outline-none resize-none text-foreground placeholder:text-muted-foreground/40"
          />
        </div>

        {/* MCQ options */}
        {q.type === 'mcq' && (
          <div className="space-y-2 mb-4">
            {(q.options || []).map((opt, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-black/30 hover:border-primary/20 transition-colors"
              >
                <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center">
                  {String.fromCharCode(65 + idx)}
                </span>
                <input
                  value={opt}
                  onChange={(e) => onUpdateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/30"
                />
                <button
                  onClick={() => onRemoveOption(idx)}
                  className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Remove option"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={onAddOption}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 hover:text-primary flex items-center gap-1.5 mt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add option
            </button>
          </div>
        )}

        {/* Answer */}
        <div className="space-y-1.5 mb-3">
          <label className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80">
            Answer
          </label>
          <textarea
            value={q.answer}
            onChange={(e) => onChange({ answer: e.target.value })}
            placeholder={q.type === 'mcq' ? 'Type the correct option text…' : 'Model answer…'}
            rows={q.type === 'long' ? 3 : 2}
            className="w-full text-sm bg-black/30 border border-emerald-500/10 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 resize-y text-foreground/90 placeholder:text-muted-foreground/30"
          />
        </div>

        {/* Explanation */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60">
            Explanation (optional)
          </label>
          <textarea
            value={q.explanation}
            onChange={(e) => onChange({ explanation: e.target.value })}
            placeholder="Why this is the correct answer…"
            rows={2}
            className="w-full text-sm bg-black/20 border border-white/5 rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 resize-y text-foreground/80 placeholder:text-muted-foreground/30"
          />
        </div>
      </div>
    </motion.div>
  );
}
