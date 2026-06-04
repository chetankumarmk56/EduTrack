/**
 * Question Bank Result viewer + editor.
 *
 * Loads ``output/question_bank.json`` + ``metadata.json`` from S3 and
 * lets the teacher edit *everything*:
 *
 *   • Header / heading: subject, grade, chapter, focus_topic,
 *     focus_questions, focus_percentage, language, number_of_questions,
 *     total_marks.
 *   • Each question: type, difficulty, bloom level, marks, question
 *     text, options, answer, explanation.
 *   • Diagrams: when a question has ``diagram_required=true`` the
 *     teacher can attach an image; the image streams back via
 *     ``GET /api/question-bank/diagram?key=...``.
 *
 * URL contract: pass all five IDs as query params, e.g.
 *   /teacher/question-bank/result
 *     ?school_id=SCH001&teacher_id=TCH102
 *     &grade_id=G08&subject_id=SUBSCI&chapter_id=CH001
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code,
  ImagePlus,
  Languages,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';

import { shareToWhatsApp } from '@/shared/lib/shareToWhatsApp';
import {
  questionBankApi,
  questionBankAIApi,
  type GeneratedQuestion,
  type GeneratedQuestionBank,
  type QuestionBankIdentity,
  type QuestionBankMetadataUpdate,
  type QuestionBankOutputResponse,
  type QuestionItem,
} from '@/features/question-bank/api';

const ID_KEYS: (keyof QuestionBankIdentity)[] = [
  'school_id',
  'teacher_id',
  'grade_id',
  'subject_id',
  'chapter_id',
];

const LANGUAGES = [
  'English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi',
  'Bengali', 'Gujarati', 'Malayalam', 'Punjabi', 'Urdu', 'Sanskrit',
];

const BLOOM_LEVELS = [
  'Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create',
];

function difficultyTone(diff: string | null | undefined): string {
  const d = (diff || '').toLowerCase();
  if (d.startsWith('easy')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  }
  if (d.startsWith('hard')) {
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  }
  if (d.startsWith('med') || d.startsWith('mix')) {
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }
  return 'bg-white/5 text-muted-foreground border-white/10';
}

/** Editable shape for the header — mirrors QuestionBankMetadataUpdate. */
interface HeaderForm {
  subject: string;
  grade: string;
  chapter: string;
  focus_topic: string;
  focus_questions: string; // string for input boxes
  focus_percentage: string;
  language: string;
  number_of_questions: string;
  total_marks: string;
}

function emptyHeader(): HeaderForm {
  return {
    subject: '',
    grade: '',
    chapter: '',
    focus_topic: '',
    focus_questions: '',
    focus_percentage: '',
    language: 'English',
    number_of_questions: '',
    total_marks: '',
  };
}

function headerFromResponse(res: QuestionBankOutputResponse): HeaderForm {
  const m = res.metadata;
  return {
    subject: m.subject ?? '',
    grade: m.grade ?? '',
    chapter: m.chapter ?? '',
    focus_topic: m.focus_topic ?? '',
    focus_questions:
      typeof m.focus_questions === 'number' ? String(m.focus_questions) : '',
    focus_percentage:
      typeof m.focus_percentage === 'number' ? String(m.focus_percentage) : '',
    language: m.language || 'English',
    number_of_questions:
      typeof m.number_of_questions === 'number'
        ? String(m.number_of_questions)
        : '',
    total_marks:
      typeof m.total_marks === 'number' ? String(m.total_marks) : '',
  };
}

function parseIntOrNull(s: string): number | null {
  const t = (s || '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Validate the header form against the same focus rules the backend
 * enforces. Returns null when valid, error message otherwise.
 */
function validateHeader(h: HeaderForm): string | null {
  if (!h.subject.trim()) return 'Subject is required.';
  if (!h.grade.trim()) return 'Grade is required.';
  if (!h.chapter.trim()) return 'Chapter is required.';

  const numQ = parseIntOrNull(h.number_of_questions);
  if (numQ === null || numQ < 1) {
    return 'Number of questions must be a positive whole number.';
  }
  if (numQ > 200) return 'Number of questions must be 200 or fewer.';

  const totalM = parseIntOrNull(h.total_marks);
  if (totalM === null || totalM < 1) {
    return 'Total marks must be a positive whole number.';
  }
  if (totalM > 2000) return 'Total marks must be 2000 or fewer.';

  const focusTopic = h.focus_topic.trim();
  const focusQ = parseIntOrNull(h.focus_questions);
  const focusPct = parseIntOrNull(h.focus_percentage);

  if (!focusTopic && (focusQ !== null || focusPct !== null)) {
    return 'Focus questions/percentage can only be set when a focus topic is provided.';
  }
  if (focusTopic && focusQ !== null && focusPct !== null) {
    return 'Choose either focus questions OR focus percentage, not both.';
  }
  if (focusTopic && focusQ === null && focusPct === null) {
    return 'With a focus topic, enter focus questions OR focus percentage.';
  }
  if (focusQ !== null && focusQ > numQ) {
    return 'Focus questions cannot exceed total number of questions.';
  }
  if (focusPct !== null && (focusPct < 0 || focusPct > 100)) {
    return 'Focus percentage must be between 0 and 100.';
  }
  return null;
}

function headerToPatch(h: HeaderForm): QuestionBankMetadataUpdate {
  const focusTopic = h.focus_topic.trim();
  const focusQ = parseIntOrNull(h.focus_questions);
  const focusPct = parseIntOrNull(h.focus_percentage);
  return {
    subject: h.subject.trim(),
    grade: h.grade.trim(),
    chapter: h.chapter.trim(),
    focus_topic: focusTopic || null,
    focus_questions: focusTopic ? focusQ : null,
    focus_percentage: focusTopic ? focusPct : null,
    language: h.language.trim() || 'English',
    number_of_questions: parseIntOrNull(h.number_of_questions) ?? undefined,
    total_marks: parseIntOrNull(h.total_marks) ?? undefined,
  };
}

/** Map AI-microservice question shapes onto the legacy `QuestionItem`
 *  used by the export-pdf endpoint. */
function toQuestionItems(questions: GeneratedQuestion[]): QuestionItem[] {
  return questions
    .map((q, idx): QuestionItem | null => {
      const rawType = (q.type || '').toLowerCase();
      let mappedType: QuestionItem['type'] = 'short';
      if (rawType === 'mcq' || rawType === 'multiple_choice') mappedType = 'mcq';
      else if (
        rawType === 'long' ||
        rawType === 'long_answer' ||
        rawType === 'essay'
      ) {
        mappedType = 'long';
      } else if (
        rawType === 'short' ||
        rawType === 'short_answer'
      ) {
        mappedType = 'short';
      }

      const rawDiff = (q.difficulty || '').toLowerCase();
      let mappedDiff: QuestionItem['difficulty'] = 'Medium';
      if (rawDiff.startsWith('easy')) mappedDiff = 'Easy';
      else if (rawDiff.startsWith('hard')) mappedDiff = 'Hard';

      const text = (q.question || '').trim();
      if (!text) return null;

      return {
        id: q.id || `q-${idx + 1}`,
        type: mappedType,
        difficulty: mappedDiff,
        marks: Math.max(1, Math.min(20, Number(q.marks) || (mappedType === 'long' ? 7 : mappedType === 'short' ? 3 : 1))),
        question: text,
        options: mappedType === 'mcq' && Array.isArray(q.options) ? q.options : null,
        answer: q.answer || '',
        explanation: q.explanation || '',
      };
    })
    .filter((q): q is QuestionItem => q !== null);
}

export default function QuestionBankResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const identity = useMemo<QuestionBankIdentity | null>(() => {
    const out = {} as QuestionBankIdentity;
    for (const field of ID_KEYS) {
      const v = params.get(field);
      if (!v) return null;
      (out as unknown as Record<string, string>)[field] = v;
    }
    return out;
  }, [params]);

  const [data, setData] = useState<QuestionBankOutputResponse | null>(null);
  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'exam' | 'key' | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const updateHeader = useCallback(
    <K extends keyof HeaderForm>(field: K, value: HeaderForm[K]) => {
      setHeader((h) => {
        // Clearing the focus_topic must also clear the focus_* fields so
        // the form can't silently send a contradictory patch.
        if (field === 'focus_topic' && !(value as string).trim()) {
          return { ...h, focus_topic: '', focus_questions: '', focus_percentage: '' };
        }
        return { ...h, [field]: value };
      });
      setDirty(true);
    },
    [],
  );

  const loadOutput = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setError(null);
    try {
      const res = await questionBankAIApi.fetchOutput(identity);
      setData(res);
      setHeader(headerFromResponse(res));
      setDirty(false);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail ??
        (err instanceof Error ? err.message : 'Failed to load question bank.');
      setError(typeof detail === 'string' ? detail : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [identity]);

  const updateQuestion = useCallback(
    (index: number, patch: Partial<GeneratedQuestion>) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = prev.question_bank.questions.map((q, i) =>
          i === index ? { ...q, ...patch } : q,
        );
        return {
          ...prev,
          question_bank: { ...prev.question_bank, questions: next },
        };
      });
      setDirty(true);
    },
    [],
  );

  const removeQuestion = useCallback((index: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = prev.question_bank.questions.filter((_, i) => i !== index);
      return {
        ...prev,
        question_bank: { ...prev.question_bank, questions: next },
      };
    });
    setDirty(true);
  }, []);

  const addQuestion = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      const blank: GeneratedQuestion = {
        id: `q-${Date.now()}`,
        type: 'short',
        difficulty: 'Medium',
        bloom_level: 'Understand',
        marks: 3,
        question: '',
        options: null,
        answer: '',
        explanation: '',
        diagram_required: false,
        diagram_image_key: null,
      };
      const next = [...prev.question_bank.questions, blank];
      return {
        ...prev,
        question_bank: { ...prev.question_bank, questions: next },
      };
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!identity || !data) return;
    const headerError = validateHeader(header);
    if (headerError) {
      toast.error(headerError);
      return;
    }
    setSaving(true);
    try {
      const res = await questionBankAIApi.saveOutput(
        identity,
        data.question_bank as GeneratedQuestionBank,
        headerToPatch(header),
      );
      setData(res);
      setHeader(headerFromResponse(res));
      setDirty(false);
      toast.success('Question bank saved.');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail ??
        (err instanceof Error ? err.message : 'Save failed.');
      toast.error(typeof detail === 'string' ? detail : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [identity, data, header]);

  // Warn before navigating away with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!identity) {
      setError(
        'Provide all 5 IDs as query params: school_id, teacher_id, grade_id, subject_id, chapter_id.',
      );
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadOutput();
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, loadOutput]);

  const handleRegenerate = async () => {
    if (!identity) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await questionBankAIApi.generate(identity);
      setData(res);
      setHeader(headerFromResponse(res));
      setDirty(false);
      toast.success('Question bank regenerated.');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail ??
        (err instanceof Error ? err.message : 'Regeneration failed.');
      const msg = typeof detail === 'string' ? detail : 'Regeneration failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setRegenerating(false);
    }
  };

  const questions = data?.question_bank.questions ?? [];
  const totalMarks = useMemo(
    () =>
      questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0),
    [questions],
  );

  // Export uses the (in-memory) edited subject; back-compat fallback to
  // the original metadata if the form value is empty for some reason.
  const exportSubject =
    header.subject.trim() ||
    data?.metadata.subject ||
    data?.question_bank.subject ||
    'General';
  const chapterTitle =
    header.chapter.trim() ||
    data?.metadata.chapter ||
    data?.question_bank.chapter ||
    '';

  const handleExportPdf = async (isAnswerKey: boolean) => {
    if (!data) return;
    const items = toQuestionItems(questions);
    if (!items.length) {
      toast.error('No questions available to export.');
      return;
    }
    setExporting(isAnswerKey ? 'key' : 'exam');
    try {
      const blob = await questionBankApi.exportPdf({
        questions: items,
        subject: exportSubject,
        is_answer_key: isAnswerKey,
        filename: isAnswerKey
          ? `AnswerKey_${exportSubject}.pdf`
          : `QuestionBank_${exportSubject}.pdf`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isAnswerKey
        ? `AnswerKey_${exportSubject}.pdf`
        : `QuestionBank_${exportSubject}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF export failed.');
    } finally {
      setExporting(null);
    }
  };

  const handleShare = async () => {
    if (!data || questions.length === 0 || sharing) return;
    const items = toQuestionItems(questions);
    if (!items.length) {
      toast.error('Nothing to share.');
      return;
    }
    setSharing(true);
    try {
      const filename = `QuestionBank_${exportSubject}.pdf`;
      const blob = await questionBankApi.exportPdf({
        questions: items,
        subject: exportSubject,
        is_answer_key: false,
        filename,
      });
      await shareToWhatsApp({
        blob,
        filename,
        title: `Question Bank — ${exportSubject}`,
        text: `Question Bank — ${exportSubject} (${items.length} questions)`,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-muted-foreground px-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">
          Loading question bank…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-sm text-red-300 font-bold">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/teacher/question-bank')}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to generator
          </button>
          {identity && (
            <>
              <button
                type="button"
                onClick={loadOutput}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-black/40 border border-white/10 hover:border-white/20 text-foreground text-[10px] font-black uppercase tracking-[0.2em] transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retry
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl aurora-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all disabled:opacity-40"
              >
                {regenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate now
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const focusEffective: number | null = (() => {
    const fq = parseIntOrNull(header.focus_questions);
    if (fq !== null) return fq;
    const fp = parseIntOrNull(header.focus_percentage);
    const total = parseIntOrNull(header.number_of_questions);
    if (fp !== null && total !== null) return Math.round((total * fp) / 100);
    return null;
  })();

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Top action bar (always visible) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <button
          onClick={() => navigate('/teacher/question-bank')}
          className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground hover:text-primary transition-colors self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to generator
        </button>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${
              dirty
                ? 'bg-primary text-primary-foreground hover:translate-y-[-1px] shadow-lg shadow-primary/20'
                : 'bg-black/40 border border-white/5 text-muted-foreground'
            }`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {dirty ? 'Save changes' : 'Saved'}
          </button>
          <button
            onClick={() => handleExportPdf(false)}
            disabled={exporting !== null || sharing}
            className="h-10 px-4 bg-black/40 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {exporting === 'exam' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Printer className="w-3.5 h-3.5 text-primary" />
            )}
            PDF Exam
          </button>
          <button
            onClick={() => handleExportPdf(true)}
            disabled={exporting !== null || sharing}
            className="h-10 px-4 bg-black/40 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {exporting === 'key' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            PDF Key
          </button>
          <button
            onClick={handleShare}
            disabled={sharing || exporting !== null}
            className="h-10 px-4 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {sharing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            WhatsApp
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating || exporting !== null || sharing}
            className="h-10 px-4 aurora-gradient text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-40 hover:translate-y-[-1px] aurora-glow"
          >
            {regenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Regenerate
          </button>
        </div>
      </div>

      {/* Editable header / heading */}
      <HeaderEditor
        header={header}
        chapterTitle={chapterTitle}
        questionsCount={questions.length}
        totalMarks={totalMarks}
        focusEffective={focusEffective}
        onChange={updateHeader}
      />

      {/* Body — editable question list */}
      <div className="space-y-5">
        {questions.length === 0 ? (
          <div className="text-center py-24 bg-card/10 rounded-3xl border-2 border-dashed border-white/5 italic text-muted-foreground">
            <Code className="w-12 h-12 mx-auto opacity-20 mb-4" />
            <p className="text-sm font-black uppercase tracking-[0.3em] opacity-60">
              The generated bank has no questions.
            </p>
          </div>
        ) : (
          questions.map((q, idx) => (
            <QuestionEditor
              key={(q.id as string | undefined) || idx}
              q={q}
              index={idx + 1}
              identity={identity!}
              onChange={(patch) => updateQuestion(idx, patch)}
              onRemove={() => removeQuestion(idx)}
            />
          ))
        )}

        <button
          type="button"
          onClick={addQuestion}
          className="w-full h-14 rounded-3xl border-2 border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add question
        </button>
      </div>
    </div>
  );
}

// ── Editable header ──────────────────────────────────────────────────
function HeaderEditor({
  header,
  chapterTitle,
  questionsCount,
  totalMarks,
  focusEffective,
  onChange,
}: {
  header: HeaderForm;
  chapterTitle: string;
  questionsCount: number;
  totalMarks: number;
  focusEffective: number | null;
  onChange: <K extends keyof HeaderForm>(field: K, value: HeaderForm[K]) => void;
}) {
  const hasFocusTopic = header.focus_topic.trim().length > 0;
  return (
    <section className="rounded-3xl bg-card/40 border border-white/5 p-5 sm:p-7 space-y-5">
      <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em]">
        <Sparkles className="h-4 w-4" />
        Question bank details
      </div>

      <input
        value={header.chapter}
        onChange={(e) => onChange('chapter', e.target.value)}
        placeholder="Chapter / paper title"
        className="w-full bg-transparent text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-foreground border-b border-transparent hover:border-white/10 focus:border-primary/40 focus:outline-none transition-colors py-2"
      />
      <p className="text-muted-foreground font-medium text-xs sm:text-sm">
        {chapterTitle && header.chapter !== chapterTitle ? (
          <>Editing — was “{chapterTitle}” · </>
        ) : null}
        <span className="tabular-nums">{questionsCount}</span> question
        {questionsCount === 1 ? '' : 's'} ·{' '}
        <span className="tabular-nums">{totalMarks}</span> marks
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <LabeledInput
          label="Subject"
          value={header.subject}
          onChange={(v) => onChange('subject', v)}
        />
        <LabeledInput
          label="Grade"
          value={header.grade}
          onChange={(v) => onChange('grade', v)}
        />
        <LabeledSelect
          label={
            <span className="inline-flex items-center gap-1.5">
              <Languages className="w-3 h-3" /> Language
            </span>
          }
          value={header.language}
          options={LANGUAGES}
          onChange={(v) => onChange('language', v)}
        />
        <LabeledInput
          label="Number of questions"
          value={header.number_of_questions}
          type="number"
          min={1}
          max={200}
          onChange={(v) => onChange('number_of_questions', v)}
        />
        <LabeledInput
          label="Total marks"
          value={header.total_marks}
          type="number"
          min={1}
          max={2000}
          onChange={(v) => onChange('total_marks', v)}
        />
        <LabeledInput
          label="Focus topic (optional)"
          value={header.focus_topic}
          placeholder="Leave blank for chapter-wide bank"
          onChange={(v) => onChange('focus_topic', v)}
        />
      </div>

      {hasFocusTopic && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledInput
            label={
              <span className="inline-flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Focus % (of total)
              </span>
            }
            value={header.focus_percentage}
            type="number"
            min={0}
            max={100}
            disabled={!!header.focus_questions.trim()}
            onChange={(v) => onChange('focus_percentage', v)}
          />
          <LabeledInput
            label="Focus questions (exact)"
            value={header.focus_questions}
            type="number"
            min={0}
            disabled={!!header.focus_percentage.trim()}
            onChange={(v) => onChange('focus_questions', v)}
          />
        </div>
      )}

      {hasFocusTopic && (
        <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
          <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground/90">
            {focusEffective !== null
              ? `${focusEffective} question${focusEffective === 1 ? '' : 's'} will be drawn from the focus topic.`
              : 'Choose exactly one: focus questions OR focus percentage.'}
          </p>
        </div>
      )}
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  disabled,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2 block">
        {label}
      </span>
      <input
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 rounded-xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-bold text-sm transition-all hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2 block">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 rounded-xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-sm transition-all hover:border-primary/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard'] as const;
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
];

function normalizeTypeValue(type: string | null | undefined): string {
  const t = (type || '').toLowerCase();
  if (t === 'mcq' || t === 'multiple_choice' || t === 'multiple choice') return 'mcq';
  if (t === 'long' || t === 'long_answer' || t === 'essay') return 'long';
  return 'short';
}

// ── Single-question editor ───────────────────────────────────────────
function QuestionEditor({
  q,
  index,
  identity,
  onChange,
  onRemove,
}: {
  q: GeneratedQuestion;
  index: number;
  identity: QuestionBankIdentity;
  onChange: (patch: Partial<GeneratedQuestion>) => void;
  onRemove: () => void;
}) {
  const typeValue = normalizeTypeValue(q.type);
  const isMcq = typeValue === 'mcq';
  const options = Array.isArray(q.options) ? q.options : [];
  const diagramRequired = !!q.diagram_required;
  const diagramKey = q.diagram_image_key ?? null;
  const diagramUrl = questionBankAIApi.diagramUrl(identity, diagramKey);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleTypeChange = (next: string) => {
    if (next === 'mcq' && !isMcq) {
      onChange({ type: next, options: options.length ? options : ['', '', '', ''] });
    } else if (next !== 'mcq' && isMcq) {
      onChange({ type: next, options: null });
    } else {
      onChange({ type: next });
    }
  };

  const handleOptionChange = (i: number, value: string) => {
    const next = [...options];
    next[i] = value;
    onChange({ options: next });
  };

  const handleAddOption = () => {
    onChange({ options: [...options, ''] });
  };

  const handleRemoveOption = (i: number) => {
    const next = options.filter((_, idx) => idx !== i);
    onChange({ options: next });
  };

  const handlePickDiagram = () => fileRef.current?.click();

  const handleDiagramSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await questionBankAIApi.uploadDiagram(
        identity,
        file,
        (q.id as string | undefined) || null,
      );
      onChange({ diagram_image_key: res.key });
      toast.success('Diagram uploaded. Remember to save your changes.');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail ??
        (err instanceof Error ? err.message : 'Diagram upload failed.');
      toast.error(typeof detail === 'string' ? detail : 'Diagram upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="rounded-3xl bg-black/40 border border-white/5 p-5 sm:p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-7 px-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.25em] flex items-center">
          Q{index}
        </span>
        <select
          value={typeValue}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="h-7 px-2 rounded-lg bg-white/5 border border-white/10 text-foreground text-[10px] font-black uppercase tracking-[0.25em] cursor-pointer hover:border-primary/40 focus:outline-none focus:border-primary/60"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={
            DIFFICULTY_OPTIONS.find(
              (d) => d.toLowerCase() === (q.difficulty || '').toLowerCase(),
            ) || 'Medium'
          }
          onChange={(e) => onChange({ difficulty: e.target.value })}
          className={`h-7 px-2 rounded-lg border text-[10px] font-black uppercase tracking-[0.25em] cursor-pointer focus:outline-none ${difficultyTone(
            q.difficulty,
          )}`}
        >
          {DIFFICULTY_OPTIONS.map((d) => (
            <option key={d} value={d} className="bg-background text-foreground">
              {d}
            </option>
          ))}
        </select>
        <select
          value={
            BLOOM_LEVELS.find(
              (b) => b.toLowerCase() === (q.bloom_level || '').toLowerCase(),
            ) || 'Understand'
          }
          onChange={(e) => onChange({ bloom_level: e.target.value })}
          className="h-7 px-2 rounded-lg bg-white/5 border border-white/10 text-foreground text-[10px] font-black uppercase tracking-[0.25em] cursor-pointer hover:border-primary/40 focus:outline-none focus:border-primary/60"
          title="Bloom's taxonomy level"
        >
          {BLOOM_LEVELS.map((b) => (
            <option key={b} value={b} className="bg-background text-foreground">
              {b}
            </option>
          ))}
        </select>
        <label className="h-7 px-2 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-1.5">
          Marks
          <input
            type="number"
            min={1}
            max={20}
            value={typeof q.marks === 'number' ? q.marks : ''}
            onChange={(e) =>
              onChange({
                marks: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="w-10 bg-transparent text-foreground tabular-nums focus:outline-none"
          />
        </label>
        <label className="h-7 px-2 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={diagramRequired}
            onChange={(e) =>
              onChange({
                diagram_required: e.target.checked,
                // Clear the attached image if the teacher unchecks
                // "diagram required" so we don't keep an orphan key.
                ...(e.target.checked ? {} : { diagram_image_key: null }),
              })
            }
            className="accent-primary"
          />
          Diagram
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto h-7 w-7 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
          title="Remove question"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 mb-1.5 block">
          Question
        </label>
        <textarea
          value={q.question}
          onChange={(e) => onChange({ question: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-white/5 bg-black/30 p-3 text-base lg:text-lg font-bold text-foreground leading-snug focus:outline-none focus:border-primary/50 resize-y"
        />
      </div>

      {isMcq && (
        <div>
          <label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 mb-1.5 block">
            Options
          </label>
          <ul className="space-y-2">
            {options.map((opt, i) => (
              <li
                key={i}
                className="flex items-start gap-3 p-2 rounded-xl border border-white/5 bg-black/30"
              >
                <span className="w-6 h-6 shrink-0 rounded-md bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center mt-1">
                  {String.fromCharCode(65 + i)}
                </span>
                <textarea
                  value={opt}
                  onChange={(e) => handleOptionChange(i, e.target.value)}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-foreground/90 focus:outline-none resize-y"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(i)}
                  className="h-6 w-6 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center"
                  title="Remove option"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleAddOption}
            className="mt-2 h-8 px-3 rounded-lg border border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" />
            Add option
          </button>
        </div>
      )}

      {/* Diagram upload — visible only when the question needs one. */}
      {diagramRequired && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-700 dark:text-violet-300">
              Diagram image
            </label>
            <div className="flex items-center gap-2">
              {diagramKey && (
                <button
                  type="button"
                  onClick={() => onChange({ diagram_image_key: null })}
                  className="h-7 px-2 rounded-md border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                disabled={uploading}
                onClick={handlePickDiagram}
                className="h-7 px-3 rounded-md bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700 dark:text-violet-200 transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ImagePlus className="w-3 h-3" />
                )}
                {diagramKey ? 'Replace' : 'Upload'}
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => handleDiagramSelected(e.target.files?.[0])}
          />
          {diagramUrl ? (
            <img
              src={diagramUrl}
              alt="Diagram for this question"
              className="max-h-72 rounded-lg border border-white/5 bg-black/30 object-contain w-full sm:w-auto"
            />
          ) : (
            <p className="text-[11px] sm:text-xs text-violet-700/80 dark:text-violet-200/80">
              No image attached. Upload one to illustrate this question — the
              microservice flagged it as needing a diagram.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <label className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80 mb-1.5 block">
          Answer
        </label>
        <textarea
          value={q.answer || ''}
          onChange={(e) => onChange({ answer: e.target.value })}
          rows={2}
          className="w-full bg-transparent text-sm text-emerald-100/90 focus:outline-none resize-y"
        />
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <label className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 mb-1.5 block">
          Explanation
        </label>
        <textarea
          value={q.explanation || ''}
          onChange={(e) => onChange({ explanation: e.target.value })}
          rows={2}
          className="w-full bg-transparent text-sm text-foreground/70 focus:outline-none resize-y"
        />
      </div>
    </div>
  );
}
