/**
 * Question Bank generator — flat S3 + external AI microservice flow.
 *
 * The microservice contract is now flat:
 *   { subject, grade, chapter, focus_topic, focus_percentage,
 *     focus_questions, language, number_of_questions, total_marks,
 *     questions: [] }
 *
 * Save   → POST /api/question-bank/upload   (PDF + metadata.json → S3)
 * Gen    → POST /api/question-bank/generate-s3 (dispatch microservice,
 *           returns flat questions[])
 *
 * focus_questions takes priority over focus_percentage. If both empty,
 * the microservice generates a normal chapter-wide bank.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  FileText,
  FolderOpen,
  Languages,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { cn } from '@/shared/lib/utils';
import { shareToWhatsApp } from '@/shared/lib/shareToWhatsApp';
import {
  questionBankAIApi,
  questionBankApi,
  type GeneratedQuestion,
  type QuestionBankIdentity,
  type QuestionBankOutputResponse,
  type QuestionItem,
} from '@/features/question-bank/api';

// ── Constants ─────────────────────────────────────────────────────────
const LANGUAGES = [
  'English',
  'Hindi',
  'Kannada',
  'Tamil',
  'Telugu',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Malayalam',
  'Punjabi',
  'Urdu',
  'Sanskrit',
] as const;

const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.pptx'];

// ── Form state ────────────────────────────────────────────────────────
interface FormState {
  gradeId: number | '';
  subjectId: number | '';
  chapter: string;
  focusTopic: string;
  focusPercentage: string; // empty string vs number — keep as string for input
  focusQuestions: string;
  language: string;
  numberOfQuestions: string;
  totalMarks: string;
  extraInstructions: string;
  files: File[];
}

const initialForm = (defaultLanguage: string): FormState => ({
  gradeId: '',
  subjectId: '',
  chapter: '',
  focusTopic: '',
  focusPercentage: '',
  focusQuestions: '',
  language: defaultLanguage || 'English',
  numberOfQuestions: '20',
  totalMarks: '40',
  extraInstructions: '',
  files: [],
});

const slugify = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'chapter';

const parseIntOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

// ── Component ─────────────────────────────────────────────────────────
export default function QuestionBank() {
  const navigate = useNavigate();
  const { teachers } = useApp();
  const { user } = useAuth();

  // Silent identity from auth + teacher assignment graph.
  const me = useMemo(
    () => teachers.find((t) => t.user_id === user?.id) ?? null,
    [teachers, user],
  );
  const schoolId = user?.institution_id ? String(user.institution_id) : '';
  const teacherId = me?.id ? String(me.id) : '';

  const [form, setForm] = useState<FormState>(() => initialForm('English'));
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Grade list from teacher's assignments ─────────────────────────
  const teachingGrades = useMemo(() => {
    const map = new Map<number, { id: number; name: string; level?: number }>();
    me?.assignments?.forEach((a) => {
      const g = a.school_class?.grade;
      if (g?.id) map.set(g.id, { id: g.id, name: g.name, level: g.level });
    });
    return Array.from(map.values()).sort(
      (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name),
    );
  }, [me]);

  // ── Subject list for the selected grade — deduped by subject id ───
  // A teacher may teach the same subject across several sections of a
  // grade (10A, 10B, 10C all do Maths). We collapse those to one entry
  // so the form mirrors the microservice contract (grade + subject only,
  // no section).
  const teachingSubjects = useMemo(() => {
    if (!form.gradeId) return [];
    const map = new Map<number, { id: number; name: string }>();
    me?.assignments?.forEach((a) => {
      if (a.school_class?.grade_id !== form.gradeId) return;
      const subj = a.subject_ref;
      if (subj?.id && !map.has(subj.id)) {
        map.set(subj.id, { id: subj.id, name: subj.name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [me, form.gradeId]);

  // Reset subject when grade changes.
  useEffect(() => {
    setForm((f) => ({ ...f, subjectId: '' }));
  }, [form.gradeId]);

  const selectedGrade = teachingGrades.find((g) => g.id === form.gradeId);
  const selectedSubject = teachingSubjects.find((s) => s.id === form.subjectId);

  // ── Async state ─────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [savedIdentity, setSavedIdentity] = useState<QuestionBankIdentity | null>(
    null,
  );
  const [result, setResult] = useState<QuestionBankOutputResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<'exam' | 'key' | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Any meaningful input change invalidates the prior save — forces the
  // teacher to re-save so the S3 metadata always reflects the UI.
  useEffect(() => {
    if (savedIdentity) setSavedIdentity(null);
    if (result) setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.gradeId,
    form.subjectId,
    form.chapter,
    form.focusTopic,
    form.focusPercentage,
    form.focusQuestions,
    form.language,
    form.numberOfQuestions,
    form.totalMarks,
    form.extraInstructions,
    form.files.length,
  ]);

  // ── Derived ─────────────────────────────────────────────────────────
  const chapterId = useMemo(() => slugify(form.chapter), [form.chapter]);

  const identity = useMemo<QuestionBankIdentity | null>(() => {
    if (!schoolId || !teacherId) return null;
    if (!selectedGrade || !selectedSubject) return null;
    if (!form.chapter.trim()) return null;
    return {
      school_id: schoolId,
      teacher_id: teacherId,
      grade_id: String(selectedGrade.id),
      subject_id: String(selectedSubject.id),
      chapter_id: chapterId,
    };
  }, [schoolId, teacherId, selectedGrade, selectedSubject, form.chapter, chapterId]);

  // Pre-parse the numeric inputs. The focus_* fields are only meaningful
  // when a focus_topic is present — when it's empty we ignore whatever
  // the user may have typed earlier and the form clears them on blur.
  const numQ = parseIntOrNull(form.numberOfQuestions);
  const hasFocusTopic = form.focusTopic.trim().length > 0;
  const focusQ = hasFocusTopic ? parseIntOrNull(form.focusQuestions) : null;
  const focusPct = hasFocusTopic ? parseIntOrNull(form.focusPercentage) : null;
  const focusEffective: number | null =
    focusQ !== null
      ? focusQ
      : focusPct !== null && numQ !== null
        ? Math.round((numQ * focusPct) / 100)
        : null;

  // Clear the focus inputs whenever the focus_topic clears, so a previously
  // typed value can't sneak into the payload.
  useEffect(() => {
    if (!hasFocusTopic && (form.focusQuestions || form.focusPercentage)) {
      setForm((f) => ({ ...f, focusQuestions: '', focusPercentage: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFocusTopic]);

  // ── Validation ──────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!user || !me) return 'Your profile is still loading.';
    if (!selectedGrade) return 'Choose the grade.';
    if (!selectedSubject) return 'Choose the subject.';
    if (!form.chapter.trim()) return 'Enter the chapter name.';

    if (numQ === null || numQ < 1) {
      return 'Number of questions must be a positive whole number.';
    }
    if (numQ > 200) return 'Number of questions must be 200 or fewer.';

    const totalM = parseIntOrNull(form.totalMarks);
    if (totalM === null || totalM < 1) {
      return 'Total marks must be a positive whole number.';
    }
    if (totalM > 2000) return 'Total marks must be 2000 or fewer.';

    // Focus rules — only enforced when a focus_topic is present. Without
    // a topic the focus_* inputs are hidden, so we don't validate them.
    if (hasFocusTopic) {
      if (focusQ !== null && focusPct !== null) {
        return 'Choose either focus questions or focus percentage, not both.';
      }
      if (focusQ === null && focusPct === null) {
        return 'With a focus topic, enter focus questions OR focus percentage.';
      }
      if (form.focusQuestions.trim() && focusQ === null) {
        return 'Focus questions must be a whole number.';
      }
      if (focusQ !== null && focusQ > numQ) {
        return 'Focus questions cannot exceed the total number of questions.';
      }
      if (form.focusPercentage.trim() && focusPct === null) {
        return 'Focus percentage must be a number.';
      }
      if (focusPct !== null && (focusPct < 0 || focusPct > 100)) {
        return 'Focus percentage must be between 0 and 100.';
      }
    }

    if (form.files.length === 0) return 'Upload at least one source document.';
    if (!identity) return 'Could not derive the chapter identity.';
    return null;
  };

  // ── File picking ────────────────────────────────────────────────────
  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list).filter((f) => {
      const name = f.name.toLowerCase();
      return ALLOWED_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
    });
    if (picked.length === 0) {
      toast.error(
        `Only ${ALLOWED_FILE_EXTENSIONS.join(', ')} files are supported.`,
      );
      return;
    }
    setForm((f) => ({ ...f, files: [...f.files, ...picked] }));
  };

  const removeFile = (idx: number) =>
    setForm((f) => ({
      ...f,
      files: f.files.filter((_, i) => i !== idx),
    }));

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async (): Promise<QuestionBankIdentity | null> => {
    const err = validate();
    if (err) {
      setError(err);
      toast.error(err);
      return null;
    }
    setError(null);
    setIsSaving(true);
    setUploadProgress(0);
    try {
      // Without a focus_topic, neither focus field can be set — the form
      // strips them via `hasFocusTopic` above. With a focus_topic, the
      // validator already guaranteed exactly one of the two is filled.
      const focusTopicToSend = hasFocusTopic ? form.focusTopic.trim() : null;
      const focusQuestionsToSend = hasFocusTopic ? focusQ : null;
      const focusPercentageToSend = hasFocusTopic ? focusPct : null;

      await questionBankAIApi.upload({
        ...identity!,
        files: form.files,
        subject: selectedSubject!.name,
        grade: selectedGrade!.name,
        chapter: form.chapter.trim(),
        focus_topic: focusTopicToSend,
        focus_percentage: focusPercentageToSend,
        focus_questions: focusQuestionsToSend,
        language: form.language,
        number_of_questions: numQ!,
        total_marks: parseIntOrNull(form.totalMarks)!,
        extra_instructions: form.extraInstructions.trim(),
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      setSavedIdentity(identity);
      toast.success('Saved to your library.');
      return identity;
    } catch (e) {
      const detail = extractErr(e, 'Could not save. Please try again.');
      setError(detail);
      toast.error(detail);
      return null;
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  };

  // ── Generate ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    // Save-first: refuse to call /generate-s3 until /upload succeeds.
    let activeIdentity = savedIdentity;
    if (!activeIdentity) {
      activeIdentity = await handleSave();
      if (!activeIdentity) return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const res = await questionBankAIApi.generate(activeIdentity);
      setResult(res);
      const count = res.question_bank?.questions?.length ?? 0;
      if (count === 0) {
        toast('Generated, but the bank came back empty.', { icon: '⚠️' });
      } else {
        toast.success(`Question bank generated — ${count} questions.`);
      }
    } catch (e) {
      const detail = extractErr(
        e,
        'Generation failed. Check the AI service and try again.',
      );
      setError(detail);
      toast.error(detail);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm(form.language));
    setSavedIdentity(null);
    setResult(null);
    setError(null);
    toast.success('Form reset.');
  };

  // ── Export / share (uses legacy export-pdf endpoint) ────────────────
  const generatedQuestions = result?.question_bank.questions ?? [];

  const handleExportPdf = async (isAnswerKey: boolean) => {
    if (!result || generatedQuestions.length === 0) return;
    const items = toQuestionItems(generatedQuestions);
    if (items.length === 0) {
      toast.error('No exportable questions.');
      return;
    }
    setIsExporting(isAnswerKey ? 'key' : 'exam');
    const subjectName = selectedSubject?.name || 'General';
    try {
      const blob = await questionBankApi.exportPdf({
        questions: items,
        subject: subjectName,
        is_answer_key: isAnswerKey,
        filename: isAnswerKey
          ? `AnswerKey_${subjectName}.pdf`
          : `QuestionBank_${subjectName}.pdf`,
      });
      downloadBlob(
        blob,
        isAnswerKey
          ? `AnswerKey_${subjectName}.pdf`
          : `QuestionBank_${subjectName}.pdf`,
      );
    } catch {
      toast.error('PDF export failed.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!result || generatedQuestions.length === 0 || isSharing) return;
    setIsSharing(true);
    const subjectName = selectedSubject?.name || 'General';
    try {
      const items = toQuestionItems(generatedQuestions);
      const filename = `QuestionBank_${subjectName}.pdf`;
      const blob = await questionBankApi.exportPdf({
        questions: items,
        subject: subjectName,
        is_answer_key: false,
        filename,
      });
      await shareToWhatsApp({
        blob,
        filename,
        title: `Question Bank — ${subjectName}`,
        text: `Question Bank — ${subjectName} (${items.length} questions)`,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSharing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  const validationError = validate();
  const canSave = !validationError && !isSaving && !isGenerating;
  const canGenerate =
    !isSaving && !isGenerating && (!!savedIdentity || !validationError);
  const isBusy = isSaving || isGenerating;
  const focusHelper = useMemo(() => {
    if (focusQ !== null) {
      return `${focusQ} question${focusQ === 1 ? '' : 's'} will be drawn from the focus topic.`;
    }
    if (focusPct !== null && numQ !== null) {
      return `≈ ${focusEffective} question${focusEffective === 1 ? '' : 's'} (${focusPct}% of ${numQ}) will be drawn from the focus topic.`;
    }
    return 'Choose exactly one: focus questions OR focus percentage.';
  }, [focusQ, focusPct, numQ, focusEffective]);

  return (
    <div className="flex flex-col gap-8 sm:gap-10 pb-16">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 pb-6 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Sparkles className="h-3.5 w-3.5 fill-primary" />
            AI Question Bank Generator
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-foreground -mb-1">
            Question Bank
          </h1>
          <p className="text-muted-foreground font-medium text-sm max-w-xl">
            Configure the chapter, optionally pin a focus topic, upload the
            source PDF, and the AI service will return a flat question bank.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-end">
          <button
            type="button"
            onClick={handleReset}
            disabled={isBusy}
            className="h-11 px-4 rounded-2xl bg-black/40 border border-white/10 hover:border-white/20 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-all disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* ── Configuration column ─────────────────────────────────── */}
        <section className="xl:col-span-5 space-y-6">
          {/* Step 1 — Class & subject */}
          <Card step="1" title="Class & Subject">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Grade">
                <select
                  value={form.gradeId}
                  onChange={(e) =>
                    setField(
                      'gradeId',
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  disabled={isBusy}
                  className={selectCls}
                >
                  <option value="">Select</option>
                  {teachingGrades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject">
                <select
                  value={form.subjectId}
                  onChange={(e) =>
                    setField(
                      'subjectId',
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  disabled={!form.gradeId || isBusy}
                  className={selectCls}
                >
                  <option value="">Select</option>
                  {teachingSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {teachingGrades.length === 0 && (
              <p className="text-[10px] font-bold text-amber-300/80 mt-3">
                No teaching assignments found. Ask your admin to add a class
                assignment before generating question banks.
              </p>
            )}
          </Card>

          {/* Step 2 — Chapter & focus topic */}
          <Card step="2" title="Chapter & Focus">
            <div className="space-y-4">
              <Field label="Chapter">
                <input
                  type="text"
                  placeholder="e.g. Force and Laws of Motion"
                  value={form.chapter}
                  onChange={(e) => setField('chapter', e.target.value)}
                  disabled={isBusy}
                  className={inputCls}
                />
              </Field>

              <Field label="Focus topic (optional)">
                <input
                  type="text"
                  placeholder="Leave blank for a normal chapter-wide bank"
                  value={form.focusTopic}
                  onChange={(e) => setField('focusTopic', e.target.value)}
                  disabled={isBusy}
                  className={inputCls}
                />
              </Field>

              {hasFocusTopic && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <Target className="w-3 h-3" />
                          Focus % (of total)
                        </span>
                      }
                    >
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        placeholder="e.g. 40"
                        value={form.focusPercentage}
                        onChange={(e) =>
                          setField('focusPercentage', e.target.value)
                        }
                        disabled={isBusy || !!form.focusQuestions.trim()}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Focus questions (exact)">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="e.g. 8"
                        value={form.focusQuestions}
                        onChange={(e) =>
                          setField('focusQuestions', e.target.value)
                        }
                        disabled={isBusy || !!form.focusPercentage.trim()}
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
                    <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] sm:text-xs font-medium text-muted-foreground/90">
                      {focusHelper}
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Step 3 — Generation settings */}
          <Card step="3" title="Generation Settings">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Languages className="w-3 h-3" /> Language
                  </span>
                }
              >
                <select
                  value={form.language}
                  onChange={(e) => setField('language', e.target.value)}
                  disabled={isBusy}
                  className={selectCls}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="hidden sm:block" />
              <Field label="Number of questions">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  placeholder="20"
                  value={form.numberOfQuestions}
                  onChange={(e) =>
                    setField('numberOfQuestions', e.target.value)
                  }
                  disabled={isBusy}
                  className={inputCls}
                />
              </Field>
              <Field label="Total marks">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={2000}
                  placeholder="40"
                  value={form.totalMarks}
                  onChange={(e) => setField('totalMarks', e.target.value)}
                  disabled={isBusy}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Extra instructions (optional)">
                <textarea
                  rows={3}
                  placeholder="e.g. Focus on application-based MCQs, avoid trivia, include CBSE-style HOTs…"
                  value={form.extraInstructions}
                  onChange={(e) =>
                    setField('extraInstructions', e.target.value)
                  }
                  disabled={isBusy}
                  className={`${inputCls} resize-y h-auto p-4`}
                />
              </Field>
            </div>
          </Card>

          {/* Step 4 — Upload */}
          <Card step="4" title="Upload Chapter PDF">
            <input
              type="file"
              multiple
              accept={ALLOWED_FILE_EXTENSIONS.join(',')}
              disabled={isBusy}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
              className="block w-full text-sm text-muted-foreground cursor-pointer
                         file:mr-4 file:px-5 file:py-3 file:rounded-2xl file:border-0
                         file:font-black file:text-[10px] file:uppercase file:tracking-[0.2em]
                         file:text-white file:cursor-pointer file:shadow-lg file:shadow-primary/10
                         file:bg-gradient-to-r file:from-emerald-500 file:to-violet-500
                         hover:file:opacity-90 disabled:opacity-40"
            />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 mt-2">
              Accepted: {ALLOWED_FILE_EXTENSIONS.join(', ')}
            </p>

            {form.files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {form.files.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/30 border border-white/5"
                  >
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="flex-1 truncate text-sm font-bold text-foreground">
                      {file.name}
                    </span>
                    <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 tabular-nums">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={isBusy}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-all disabled:opacity-30"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {isSaving && uploadProgress > 0 && (
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                  <span>Uploading</span>
                  <span className="text-primary">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full aurora-gradient transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Validation banner */}
          {validationError && !error && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-sm text-amber-200 font-bold">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300 font-bold">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="opacity-60 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {savedIdentity && !result && !isGenerating && (
            <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-4 text-sm font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span className="flex-1 text-emerald-200/90">
                Saved. Tap Generate to produce the question bank.
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 sticky bottom-4 z-10">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="h-14 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/5 backdrop-blur-md"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : savedIdentity ? (
                <>
                  <Cloud className="w-4 h-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="h-14 rounded-2xl aurora-gradient text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] aurora-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 backdrop-blur-md"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </section>

        {/* ── Output column ────────────────────────────────────────── */}
        <section className="xl:col-span-7 space-y-6">
          <ResultPanel
            isGenerating={isGenerating}
            result={result}
            chapterName={form.chapter}
            subjectName={selectedSubject?.name}
            onExport={handleExportPdf}
            exporting={isExporting}
            onShare={handleShareWhatsApp}
            isSharing={isSharing}
            onOpenStandalone={
              result && identity
                ? () =>
                    navigate({
                      pathname: '/teacher/question-bank/result',
                      search: new URLSearchParams(
                        identity as unknown as Record<string, string>,
                      ).toString(),
                    })
                : undefined
            }
            onRegenerate={savedIdentity ? handleGenerate : undefined}
          />
        </section>
      </div>
    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────
function Card({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="premium-card p-5 sm:p-6 bg-card/40 border-glass-border relative overflow-hidden">
      <div className="absolute -top-16 -right-16 w-60 h-60 bg-primary/5 rounded-full blur-[100px]" />
      <h3 className="text-base sm:text-lg font-black mb-4 flex items-center gap-3 relative z-10">
        <span className="text-primary text-[10px] font-black uppercase tracking-[0.3em]">
          Step {step}
        </span>
        <span className="text-foreground">{title}</span>
      </h3>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2 block mb-2">
      {children}
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

// ── Result panel ──────────────────────────────────────────────────────
function ResultPanel({
  isGenerating,
  result,
  chapterName,
  subjectName,
  onExport,
  exporting,
  onShare,
  isSharing,
  onOpenStandalone,
  onRegenerate,
}: {
  isGenerating: boolean;
  result: QuestionBankOutputResponse | null;
  chapterName: string;
  subjectName?: string;
  onExport: (isAnswerKey: boolean) => void;
  exporting: 'exam' | 'key' | null;
  onShare: () => void;
  isSharing: boolean;
  onOpenStandalone?: () => void;
  onRegenerate?: () => void;
}) {
  const questions = result?.question_bank.questions ?? [];
  const totalMarks = questions.reduce(
    (s, q) => s + (typeof q.marks === 'number' ? q.marks : 0),
    0,
  );

  if (isGenerating) {
    return (
      <div className="premium-card p-10 bg-gradient-to-br from-primary/10 to-transparent border-primary/20 rounded-3xl text-center flex flex-col items-center gap-5 min-h-[420px] justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <div>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
            Generating questions…
          </h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">
            Dispatching to the AI service. The microservice reads your PDF
            from S3 and writes the question bank back. This may take up to a
            few minutes.
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="premium-card p-8 sm:p-12 bg-card/30 border-glass-border rounded-3xl text-center min-h-[420px] flex flex-col items-center justify-center gap-5">
        <BookOpen className="w-14 h-14 text-muted-foreground/20" />
        <div className="space-y-2 max-w-sm">
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-[0.15em] text-muted-foreground/70">
            Awaiting generation
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground/60">
            Fill in the form on the left, upload your source documents, and
            hit Generate. The output will render here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Result header */}
      <div className="premium-card p-5 sm:p-6 bg-card/40 border-glass-border rounded-3xl flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Generated
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
            {chapterName || result.question_bank.chapter || 'Question Bank'}
          </h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-1">
            {subjectName ? `${subjectName} · ` : ''}
            <span className="tabular-nums">{questions.length}</span> question
            {questions.length === 1 ? '' : 's'}
            {totalMarks > 0 && (
              <>
                {' · '}
                <span className="tabular-nums">{totalMarks}</span> marks
              </>
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onExport(false)}
            disabled={!!exporting || isSharing}
            className="h-10 px-4 bg-black/40 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {exporting === 'exam' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Printer className="w-3.5 h-3.5 text-primary" />
            )}
            PDF Exam
          </button>
          <button
            type="button"
            onClick={() => onExport(true)}
            disabled={!!exporting || isSharing}
            className="h-10 px-4 bg-black/40 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {exporting === 'key' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            Answer Key
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={!!exporting || isSharing}
            className="h-10 px-4 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {isSharing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            WhatsApp
          </button>
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={!!exporting || isSharing}
              className="h-10 px-4 bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-30"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="rounded-3xl bg-card/30 border-2 border-dashed border-white/10 p-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground/60">
            The generated bank has no questions.
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-3 sm:space-y-4">
            {questions.map((q, idx) => (
              <motion.div
                key={(q.id as string | undefined) || idx}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <QuestionRow q={q} index={idx + 1} />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {onOpenStandalone && (
        <button
          type="button"
          onClick={onOpenStandalone}
          className="w-full h-12 rounded-2xl border border-white/10 bg-black/30 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] font-black uppercase tracking-[0.25em] transition-all flex items-center justify-center gap-2"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open in dedicated viewer
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function QuestionRow({
  q,
  index,
}: {
  q: GeneratedQuestion;
  index: number;
}) {
  const isMcq = (q.type || '').toLowerCase() === 'mcq';
  // The microservice may attach diagram metadata or solution-steps for
  // numerical questions. Surface them when present so the teacher sees
  // the full payload, not just the question stem.
  const solutionSteps = Array.isArray((q as Record<string, unknown>).solution_steps)
    ? ((q as Record<string, unknown>).solution_steps as unknown[])
    : null;
  const diagram = (q as Record<string, unknown>).diagram as
    | string
    | { caption?: string; url?: string; description?: string }
    | null
    | undefined;
  return (
    <div className="rounded-3xl bg-card/40 border border-white/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="h-6 px-2.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] flex items-center tabular-nums">
          Q{index}
        </span>
        <span className="h-6 px-2.5 rounded-md bg-white/5 border border-white/10 text-foreground text-[10px] font-black uppercase tracking-[0.2em] flex items-center">
          {typeLabel(q.type)}
        </span>
        {q.difficulty && (
          <span
            className={cn(
              'h-6 px-2.5 rounded-md border text-[10px] font-black uppercase tracking-[0.2em] flex items-center',
              difficultyTone(q.difficulty),
            )}
          >
            {String(q.difficulty)}
          </span>
        )}
        {typeof q.marks === 'number' && q.marks > 0 && (
          <span className="h-6 px-2.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] flex items-center">
            {q.marks} mark{q.marks === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="text-sm sm:text-base font-bold text-foreground leading-snug whitespace-pre-wrap mb-3">
        {q.question}
      </p>

      {isMcq && Array.isArray(q.options) && q.options.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {q.options.map((opt, i) => (
            <li
              key={i}
              className="flex items-start gap-3 p-2.5 rounded-lg border border-white/5 bg-black/30"
            >
              <span className="w-5 h-5 shrink-0 rounded bg-primary/10 text-primary text-[9px] font-black flex items-center justify-center">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap">
                {opt}
              </span>
            </li>
          ))}
        </ul>
      )}

      {q.answer && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 mb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 mb-1">
            Answer
          </p>
          <p className="text-xs sm:text-sm text-emerald-100/90 whitespace-pre-wrap">
            {q.answer}
          </p>
        </div>
      )}

      {solutionSteps && solutionSteps.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80 mb-2">
            Solution steps
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-xs sm:text-sm text-foreground/80">
            {solutionSteps.map((step, i) => (
              <li key={i} className="whitespace-pre-wrap">
                {typeof step === 'string'
                  ? step
                  : JSON.stringify(step, null, 0)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {diagram && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 mb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">
            Diagram
          </p>
          <p className="text-xs sm:text-sm text-foreground/70 whitespace-pre-wrap">
            {typeof diagram === 'string'
              ? diagram
              : diagram.caption || diagram.description || diagram.url || ''}
          </p>
        </div>
      )}

      {q.explanation && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">
            Explanation
          </p>
          <p className="text-xs sm:text-sm text-foreground/70 whitespace-pre-wrap">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────
function extractErr(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: unknown } } }).response;
    const detail = r?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function difficultyTone(diff: string | null | undefined): string {
  const d = (diff || '').toLowerCase();
  if (d.startsWith('easy'))
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (d.startsWith('hard'))
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (d.startsWith('med') || d.startsWith('mix'))
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-white/5 text-muted-foreground border-white/10';
}

function typeLabel(type: string | null | undefined): string {
  const t = (type || '').toLowerCase();
  if (t === 'mcq' || t === 'multiple_choice' || t === 'multiple choice')
    return 'MCQ';
  if (t === 'short' || t === 'short_answer' || t === 'short answer')
    return 'SHORT';
  if (
    t === 'long' ||
    t === 'long_answer' ||
    t === 'long answer' ||
    t === 'essay'
  )
    return 'LONG';
  if (t === 'numerical' || t === 'numeric') return 'NUMERICAL';
  return (t || 'Q').toUpperCase();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Adapts the loose external-AI question shape into the legacy
// `QuestionItem` schema the `/export-pdf` endpoint expects.
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
      )
        mappedType = 'long';
      else if (rawType === 'short' || rawType === 'short_answer')
        mappedType = 'short';

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
        marks: Math.max(
          1,
          Math.min(
            20,
            Number(q.marks) ||
              (mappedType === 'long' ? 7 : mappedType === 'short' ? 3 : 1),
          ),
        ),
        question: text,
        options:
          mappedType === 'mcq' && Array.isArray(q.options) ? q.options : null,
        answer: q.answer || '',
        explanation: q.explanation || '',
      };
    })
    .filter((q): q is QuestionItem => q !== null);
}

// ── Atoms ─────────────────────────────────────────────────────────────
const inputCls =
  'w-full h-12 px-4 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-bold text-sm transition-all hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed';

const selectCls =
  'w-full h-12 px-4 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-sm transition-all hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed';
