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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Cloud,
  FileText,
  FolderOpen,
  GraduationCap,
  Languages,
  Loader2,
  Printer,
  Rocket,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
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

  // Smoothly bring the result area into view as soon as generation kicks off
  // (so the teacher sees progress) and again when the bank lands.
  const resultRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isGenerating || result) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isGenerating, result]);

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

  // Step completion — drives the stepper rail and the launch checklist.
  const totalM = parseIntOrNull(form.totalMarks);
  const focusValid = !hasFocusTopic || (focusQ !== null) !== (focusPct !== null);
  const step1Done = !!selectedGrade && !!selectedSubject;
  const step2Done = form.chapter.trim().length > 0 && focusValid;
  const step3Done =
    numQ !== null && numQ >= 1 && totalM !== null && totalM >= 1;
  const step4Done = form.files.length > 0;
  const steps: StepMeta[] = [
    { n: 1, label: 'Class', hint: 'Grade & subject', icon: GraduationCap, done: step1Done },
    { n: 2, label: 'Chapter', hint: 'Chapter name', icon: BookOpen, done: step2Done },
    { n: 3, label: 'Settings', hint: 'Count & marks', icon: SlidersHorizontal, done: step3Done },
    { n: 4, label: 'Source', hint: 'Upload document', icon: UploadCloud, done: step4Done },
  ];

  return (
    <div className="flex flex-col gap-6 pb-20 sm:gap-8">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <header className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-28 -left-12 h-72 w-72 rounded-full bg-violet-500/10 blur-[90px]" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="aurora-gradient aurora-glow flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <div className="space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                AI Question Bank Generator
              </span>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Question Bank
              </h1>
              <p className="max-w-xl text-sm font-medium text-slate-400">
                Configure the chapter, pin an optional focus topic, and upload
                your source — the AI returns a ready-to-print question bank.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={isBusy}
            className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-2xl border border-white/10 bg-black/30 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 transition-all hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="relative z-10 mt-7">
          <Stepper steps={steps} />
        </div>
      </header>

      {/* ── Working area ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Configuration form */}
        <section className="space-y-5 xl:col-span-7">
          {/* Step 1 — Class & subject */}
          <SectionCard step="1" title="Class & Subject" icon={GraduationCap} done={step1Done}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Grade">
                <SelectWrap>
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
                </SelectWrap>
              </Field>
              <Field label="Subject">
                <SelectWrap>
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
                </SelectWrap>
              </Field>
            </div>
            {teachingGrades.length === 0 && (
              <p className="mt-3 text-[11px] font-bold text-amber-400">
                No teaching assignments found. Ask your admin to add a class
                assignment before generating question banks.
              </p>
            )}
          </SectionCard>

          {/* Step 2 — Chapter & focus topic */}
          <SectionCard step="2" title="Chapter & Focus" icon={BookOpen} done={step2Done}>
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

              <AnimatePresence initial={false}>
                {hasFocusTopic && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                          label={
                            <span className="inline-flex items-center gap-1.5">
                              <Target className="h-3 w-3" />
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

                      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                        <Target className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                        <p className="text-[11px] font-medium text-slate-300 sm:text-xs">
                          {focusHelper}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </SectionCard>

          {/* Step 3 — Generation settings */}
          <SectionCard
            step="3"
            title="Generation Settings"
            icon={SlidersHorizontal}
            done={step3Done}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Languages className="h-3 w-3" /> Language
                  </span>
                }
              >
                <SelectWrap>
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
                </SelectWrap>
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
                  className={`${inputCls} h-auto resize-y p-4`}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Step 4 — Upload */}
          <SectionCard step="4" title="Upload Source" icon={UploadCloud} done={step4Done}>
            <label
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 bg-black/20 px-4 py-8 text-center transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5',
                isBusy && 'pointer-events-none opacity-40',
              )}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 transition-transform group-hover:scale-105">
                <UploadCloud className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold text-white">
                Tap to choose files
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {ALLOWED_FILE_EXTENSIONS.join('  ·  ')}
              </span>
              <input
                type="file"
                multiple
                accept={ALLOWED_FILE_EXTENSIONS.join(',')}
                disabled={isBusy}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            {form.files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {form.files.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/30 px-4 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate text-sm font-bold text-white">
                      {file.name}
                    </span>
                    <span className="hidden text-[10px] font-black uppercase tracking-widest tabular-nums text-slate-500 sm:inline">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={isBusy}
                      className="rounded-lg p-1.5 text-rose-400 transition-all hover:bg-rose-500/10 disabled:opacity-30"
                      title="Remove file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {isSaving && uploadProgress > 0 && (
              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                  <span>Uploading</span>
                  <span className="text-emerald-400">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div
                    className="aurora-gradient h-full transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </SectionCard>
        </section>

        {/* Launch / blueprint aside */}
        <aside className="xl:col-span-5">
          <div className="space-y-4 xl:sticky xl:top-6">
            <div className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
              <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-violet-500/10 blur-[90px]" />
              <div className="relative z-10">
                <div className="mb-5 flex items-center gap-3">
                  <div className="aurora-gradient aurora-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                    <Rocket className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                      Blueprint
                    </div>
                    <h3 className="text-base font-black text-white sm:text-lg">
                      Generation summary
                    </h3>
                  </div>
                </div>

                <dl className="mb-5 space-y-px overflow-hidden rounded-2xl border border-white/5">
                  <RecapRow
                    label="Class"
                    value={
                      selectedGrade && selectedSubject
                        ? `${selectedGrade.name} · ${selectedSubject.name}`
                        : null
                    }
                  />
                  <RecapRow label="Chapter" value={form.chapter.trim() || null} />
                  <RecapRow
                    label="Focus"
                    value={hasFocusTopic ? form.focusTopic.trim() : 'Whole chapter'}
                    muted={!hasFocusTopic}
                  />
                  <RecapRow label="Language" value={form.language} />
                  <RecapRow
                    label="Questions"
                    value={numQ !== null ? String(numQ) : null}
                  />
                  <RecapRow
                    label="Total marks"
                    value={totalM !== null ? String(totalM) : null}
                  />
                  <RecapRow
                    label="Sources"
                    value={
                      form.files.length
                        ? `${form.files.length} file${form.files.length === 1 ? '' : 's'}`
                        : null
                    }
                  />
                </dl>

                <div className="mb-5 space-y-2">
                  {steps.map((s) => (
                    <div key={s.n} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors',
                          s.done
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-white/5 text-slate-500',
                        )}
                      >
                        {s.done ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <CircleDot className="h-3 w-3" />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-bold',
                          s.done ? 'text-slate-300' : 'text-slate-500',
                        )}
                      >
                        {s.hint}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Status messaging */}
                {validationError && !error && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}
                {error && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {savedIdentity && !result && !isGenerating && (
                  <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs font-bold text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <span className="flex-1">
                      Saved. Tap Generate to produce the question bank.
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canSave}
                    className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-black uppercase tracking-[0.18em] text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : savedIdentity ? (
                      <>
                        <Cloud className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="aurora-gradient aurora-glow flex h-14 items-center justify-center gap-2 rounded-2xl text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  <Cloud className="h-3 w-3" />
                  Output appears below once generated
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Result (full width) ────────────────────────────────── */}
      {(isGenerating || result) && (
        <div ref={resultRef} className="scroll-mt-6">
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
        </div>
      )}
    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────
interface StepMeta {
  n: number;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}

function Stepper({ steps }: { steps: StepMeta[] }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-black transition-all',
                s.done
                  ? 'aurora-gradient aurora-glow text-white'
                  : 'border border-white/10 bg-white/5 text-slate-400',
              )}
            >
              {s.done ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={cn(
                'hidden truncate text-[10px] font-black uppercase tracking-[0.2em] sm:block',
                s.done ? 'text-emerald-400' : 'text-slate-400',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="h-px min-w-[12px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  s.done ? 'aurora-gradient' : 'w-0',
                )}
                style={{ width: s.done ? '100%' : '0%' }}
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function SectionCard({
  step,
  title,
  icon: Icon,
  done,
  children,
}: {
  step: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/5 blur-[90px]" />
      <div className="relative z-10 mb-5 flex items-center gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
            done
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
              : 'border-white/10 bg-white/5 text-slate-300',
          )}
        >
          {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
            Step {step}
          </div>
          <h3 className="truncate text-base font-black leading-tight text-white sm:text-lg">
            {title}
          </h3>
        </div>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
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

function RecapRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | null;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-3.5 py-2.5">
      <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          'max-w-[58%] truncate text-right text-xs font-bold',
          value ? (muted ? 'text-slate-400' : 'text-white') : 'text-slate-600',
        )}
      >
        {value || 'Not set'}
      </dd>
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
      <div className="premium-card border-glass-border relative flex min-h-[360px] flex-col items-center justify-center gap-5 overflow-hidden rounded-3xl p-10 text-center">
        <div className="pointer-events-none absolute inset-0 aurora-gradient opacity-[0.06]" />
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
          <div className="aurora-gradient aurora-glow relative flex h-16 w-16 items-center justify-center rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
            Generating your question bank…
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            The AI service is reading your source from S3 and writing the bank
            back. This can take up to a few minutes.
          </p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-5">
      {/* Result header */}
      <div className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Generated
            </div>
            <h2 className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">
              {chapterName || result.question_bank.chapter || 'Question Bank'}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {subjectName && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                  <BookOpen className="h-3 w-3" />
                  {subjectName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400">
                <span className="tabular-nums">{questions.length}</span> question
                {questions.length === 1 ? '' : 's'}
              </span>
              {totalMarks > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                  <span className="tabular-nums">{totalMarks}</span> marks
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => onExport(false)}
              disabled={!!exporting || isSharing}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:opacity-30"
            >
              {exporting === 'exam' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <Printer className="h-3.5 w-3.5 text-emerald-400" />
              )}
              PDF Exam
            </button>
            <button
              type="button"
              onClick={() => onExport(true)}
              disabled={!!exporting || isSharing}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-black/30 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-30"
            >
              {exporting === 'key' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
              Answer Key
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={!!exporting || isSharing}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600/10 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition-all hover:bg-emerald-600 hover:text-white disabled:opacity-30"
            >
              {isSharing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              WhatsApp
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={!!exporting || isSharing}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:opacity-30"
              >
                <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                Regenerate
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">
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
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-400"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open in dedicated viewer
          <ArrowRight className="h-3.5 w-3.5" />
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
    <div className="premium-card border-glass-border rounded-3xl p-5 transition-colors hover:border-emerald-500/20 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-6 items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[10px] font-black uppercase tracking-[0.2em] tabular-nums text-emerald-400">
          Q{index}
        </span>
        <span className="flex h-6 items-center rounded-md border border-white/10 bg-white/5 px-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-white">
          {typeLabel(q.type)}
        </span>
        {q.difficulty && (
          <span
            className={cn(
              'flex h-6 items-center rounded-md border px-2.5 text-[10px] font-black uppercase tracking-[0.2em]',
              difficultyTone(q.difficulty),
            )}
          >
            {String(q.difficulty)}
          </span>
        )}
        {typeof q.marks === 'number' && q.marks > 0 && (
          <span className="flex h-6 items-center rounded-md border border-white/10 bg-white/5 px-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            {q.marks} mark{q.marks === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="mb-3 whitespace-pre-wrap text-sm font-bold leading-snug text-white sm:text-base">
        {q.question}
      </p>

      {isMcq && Array.isArray(q.options) && q.options.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {q.options.map((opt, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/30 p-2.5"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-[9px] font-black text-emerald-400">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="whitespace-pre-wrap text-xs text-slate-200 sm:text-sm">
                {opt}
              </span>
            </li>
          ))}
        </ul>
      )}

      {q.answer && (
        <div className="mb-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
            Answer
          </p>
          <p className="whitespace-pre-wrap text-xs text-emerald-200 sm:text-sm">
            {q.answer}
          </p>
        </div>
      )}

      {solutionSteps && solutionSteps.length > 0 && (
        <div className="mb-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
            Solution steps
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300 sm:text-sm">
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
        <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Diagram
          </p>
          <p className="whitespace-pre-wrap text-xs text-slate-300 sm:text-sm">
            {typeof diagram === 'string'
              ? diagram
              : diagram.caption || diagram.description || diagram.url || ''}
          </p>
        </div>
      )}

      {q.explanation && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Explanation
          </p>
          <p className="whitespace-pre-wrap text-xs text-slate-300 sm:text-sm">
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
  return 'bg-white/5 text-slate-400 border-white/10';
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
  'w-full h-12 px-4 rounded-2xl border border-white/10 bg-black/30 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 outline-none font-semibold text-sm transition-all hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed';

const selectCls =
  'w-full h-12 pl-4 pr-10 rounded-2xl border border-white/10 bg-black/30 text-white appearance-none cursor-pointer focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 outline-none font-bold text-sm transition-all hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed';
