import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarRange,
  Check,
  CheckCircle2,
  Cloud,
  FileText,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  Palmtree,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { timetableApi } from '@/features/timetable/api';
import type { TeacherTimetable } from '@/shared/types';
import {
  calculateScheduleFromTimetable,
  type TimetableScheduleResult,
} from '@/features/lesson-plan/services/calculateScheduleFromTimetable';
import { cn } from '@/shared/lib/utils';
import DatePicker from '@/shared/components/ui/DatePicker';

import { lessonPlanAIApi } from '@/features/lesson-plan/ai/api';
import { addPending, removePending } from '@/features/lesson-plan/ai/pendingGenerations';
import type {
  ChapterIdentity,
  UploadResponse,
} from '@/features/lesson-plan/ai/types';

// Unrestricted: any file type, any count. Backend storage handles the rest.

/**
 * Lesson Plan — S3-only flow.
 *
 *   Step 1: pick Grade / Section / Subject from the teacher's assignments.
 *   Step 2: per chapter — name + date range (drives class count from the
 *           timetable) + files.
 *   Generate ─▶ a single action that (a) uploads the chapter's files +
 *               writes metadata.json under
 *               lesson-plan/<schoolId>/<teacherId>/<gradeId>/<subjectId>/<chapterId>/,
 *               then (b) kicks off generation in the background and returns
 *               to the calendar. The teacher waits only on the quick S3
 *               save; the plan appears on the calendar when generation
 *               finishes (the dashboard polls output/lesson_plan.json).
 *
 * School and Teacher IDs are derived silently from the logged-in user and
 * never displayed.
 */

interface ChapterDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  instructions: string;
  files: File[];
  showBreakdown: boolean;
  saved?: UploadResponse;
  isSaving?: boolean;
  isGenerating?: boolean;
  error?: string;
}

let chapterIdCounter = 0;
function blankChapter(): ChapterDraft {
  chapterIdCounter += 1;
  return {
    id: `ch_${Date.now()}_${chapterIdCounter}`,
    name: '',
    startDate: '',
    endDate: '',
    instructions: '',
    files: [],
    showBreakdown: false,
  };
}

export default function AILessonPlan() {
  const navigate = useNavigate();
  const { teachers, events } = useApp();
  const { user } = useAuth();

  // ── Silently derived IDs (never shown in UI) ──────────────────────
  const me = useMemo(
    () => teachers.find((t) => t.user_id === user?.id) ?? null,
    [teachers, user],
  );
  // Use raw database IDs for every path segment — guarantees uniqueness
  // even if two schools, teachers, subjects, or chapters share a name.
  // Human-readable labels are still persisted to metadata.json so the
  // dashboard renders them correctly.
  const schoolIdSegment = user?.institution_id ? String(user.institution_id) : '';
  const teacherIdSegment = me?.id ? String(me.id) : '';

  // ── Class selection (grade / section / subject from assignments) ──
  const [gradeId, setGradeId] = useState<number | ''>('');
  const [sectionId, setSectionId] = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');

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

  const teachingSections = useMemo(() => {
    if (!gradeId) return [];
    const map = new Map<
      number,
      { id: number; name: string; schoolClassId: number }
    >();
    me?.assignments?.forEach((a) => {
      if (a.school_class?.grade_id !== gradeId) return;
      const s = a.school_class?.section;
      if (s?.id)
        map.set(s.id, {
          id: s.id,
          name: s.name,
          schoolClassId: a.school_class.id,
        });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [me, gradeId]);

  const selectedSchoolClassId = useMemo(() => {
    if (!sectionId) return null;
    return teachingSections.find((s) => s.id === sectionId)?.schoolClassId ?? null;
  }, [teachingSections, sectionId]);

  const teachingSubjects = useMemo(() => {
    if (!selectedSchoolClassId) return [];
    const map = new Map<number, { id: number; name: string }>();
    me?.assignments?.forEach((a) => {
      if (a.school_class?.id !== selectedSchoolClassId) return;
      const subj = a.subject_ref;
      if (subj?.id) map.set(subj.id, { id: subj.id, name: subj.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [me, selectedSchoolClassId]);

  // Cascade resets
  useEffect(() => { setSectionId(''); setSubjectId(''); }, [gradeId]);
  useEffect(() => { setSubjectId(''); }, [sectionId]);

  const selectedGrade = useMemo(
    () => teachingGrades.find((g) => g.id === gradeId) ?? null,
    [teachingGrades, gradeId],
  );
  const selectedSection = useMemo(
    () => teachingSections.find((s) => s.id === sectionId) ?? null,
    [teachingSections, sectionId],
  );
  const selectedSubject = useMemo(
    () => teachingSubjects.find((s) => s.id === subjectId) ?? null,
    [teachingSubjects, subjectId],
  );

  // ── Timetable for auto class-count ────────────────────────────────
  const [timetable, setTimetable] = useState<TeacherTimetable | null>(null);
  const [isTimetableLoading, setIsTimetableLoading] = useState(false);
  const [timetableError, setTimetableError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsTimetableLoading(true);
    setTimetableError(null);
    timetableApi
      .getMyTimetable()
      .then((tt) => { if (mounted) setTimetable(tt); })
      .catch((err) => {
        if (mounted) setTimetableError(err?.message || 'Failed to load timetable.');
      })
      .finally(() => { if (mounted) setIsTimetableLoading(false); });
    return () => { mounted = false; };
  }, []);

  // ── Chapters ──────────────────────────────────────────────────────
  const draftKey = user?.id ? `lesson_plan_form_draft_${user.id}` : null;

  /**
   * Hydrate from localStorage on first render so chapter names, dates,
   * instructions, and Save markers survive a navigation away. Files cannot
   * be serialised (browser limitation), but every saved chapter has a
   * ``saved`` record pointing at its S3 assets so the user can still
   * regenerate without re-uploading.
   */
  const [chapters, setChapters] = useState<ChapterDraft[]>(() => {
    if (!draftKey) return [blankChapter()];
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return [blankChapter()];
      const parsed = JSON.parse(raw) as { chapters?: PersistedChapter[] } | null;
      if (!parsed?.chapters || parsed.chapters.length === 0) return [blankChapter()];
      return parsed.chapters.map(hydratePersistedChapter);
    } catch {
      return [blankChapter()];
    }
  });

  // Rehydrate class selectors from the same draft (kept in their own state
  // declarations above; we patch them here in an effect so initial render
  // can still happen synchronously without races).
  const didHydrateClassRef = useRef(false);
  useEffect(() => {
    if (didHydrateClassRef.current) return;
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedDraft | null;
      if (!parsed) return;
      if (typeof parsed.gradeId === 'number') setGradeId(parsed.gradeId);
      if (typeof parsed.sectionId === 'number') setSectionId(parsed.sectionId);
      if (typeof parsed.subjectId === 'number') setSubjectId(parsed.subjectId);
    } catch {
      // ignore parse errors — falling back to a clean form is safe.
    } finally {
      didHydrateClassRef.current = true;
    }
  }, [draftKey]);

  // Persist on any change.
  useEffect(() => {
    if (!draftKey) return;
    try {
      const payload: PersistedDraft = {
        gradeId: typeof gradeId === 'number' ? gradeId : null,
        sectionId: typeof sectionId === 'number' ? sectionId : null,
        subjectId: typeof subjectId === 'number' ? subjectId : null,
        chapters: chapters.map(persistChapter),
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // localStorage may be full; ignore.
    }
  }, [draftKey, gradeId, sectionId, subjectId, chapters]);

  const chapterSchedules = useMemo<Record<string, TimetableScheduleResult | null>>(() => {
    if (!timetable || !selectedSchoolClassId || !subjectId) {
      return Object.fromEntries(chapters.map((c) => [c.id, null]));
    }
    const out: Record<string, TimetableScheduleResult | null> = {};
    for (const ch of chapters) {
      if (!ch.startDate || !ch.endDate) {
        out[ch.id] = null;
        continue;
      }
      out[ch.id] = calculateScheduleFromTimetable({
        startDate: ch.startDate,
        endDate: ch.endDate,
        schoolClassId: selectedSchoolClassId,
        subjectId: subjectId as number,
        slots: timetable.slots,
        periods: timetable.periods,
        events,
      });
    }
    return out;
  }, [timetable, selectedSchoolClassId, subjectId, events, chapters]);

  const updateChapter = (id: string, patch: Partial<ChapterDraft>) => {
    setChapters((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const invalidateChapter = (id: string) => {
    updateChapter(id, { saved: undefined, error: undefined });
  };

  const addChapter = () => {
    setChapters((list) => [...list, blankChapter()]);
  };

  const removeChapter = (id: string) => {
    setChapters((list) =>
      list.length <= 1 ? list : list.filter((c) => c.id !== id),
    );
  };

  const addFilesToChapter = (id: string, list: FileList | null) => {
    if (!list || list.length === 0) return;
    // Snapshot the FileList immediately. The caller resets `input.value`
    // right after this call, which empties the live FileList — so reading
    // it from inside the setChapters updater (which runs later, and twice
    // under StrictMode) would yield zero files and silently drop the upload.
    const picked = Array.from(list);
    setChapters((cur) =>
      cur.map((c) =>
        c.id !== id
          ? c
          : { ...c, files: [...c.files, ...picked], saved: undefined },
      ),
    );
  };

  const removeFileFromChapter = (id: string, idx: number) => {
    setChapters((cur) =>
      cur.map((c) =>
        c.id === id
          ? {
              ...c,
              files: c.files.filter((_, i) => i !== idx),
              saved: undefined,
            }
          : c,
      ),
    );
  };

  // ── Identity per chapter ──────────────────────────────────────────
  const chapterIdentity = (ch: ChapterDraft): ChapterIdentity | null => {
    if (!schoolIdSegment || !teacherIdSegment) return null;
    if (!selectedGrade || !selectedSubject) return null;
    if (!ch.id) return null;
    return {
      school_id: schoolIdSegment,
      teacher_id: teacherIdSegment,
      grade_id: String(selectedGrade.id),
      subject_id: String(selectedSubject.id),
      // ``ch.id`` is the stable client-side id assigned when the chapter
      // row was first added (e.g. ``ch_1734567890123_1``). It survives
      // localStorage rehydration, so renaming the chapter doesn't move
      // its data to a new prefix.
      chapter_id: ch.id,
    };
  };

  // ── Save (per chapter) ───────────────────────────────────────────
  const validateForSave = (ch: ChapterDraft): string | null => {
    if (!user || !me) return 'Profile not loaded yet.';
    if (!selectedGrade) return 'Choose a grade above.';
    if (!selectedSection) return 'Choose a section above.';
    if (!selectedSubject) return 'Choose a subject above.';
    if (!ch.name.trim()) return 'Chapter name is required.';
    if (!ch.startDate || !ch.endDate) return 'Pick a start and end date.';
    if (new Date(ch.endDate) < new Date(ch.startDate))
      return 'End date is before start date.';
    if (ch.files.length === 0) return 'Pick at least one file to upload.';
    const id = chapterIdentity(ch);
    if (!id) return 'Could not derive the chapter identity.';
    return null;
  };

  // ── Generate (one action: save → kick off generation → calendar) ──
  // A single button does both: it persists the chapter to S3, then fires
  // generation WITHOUT blocking the UI. The teacher only waits on the quick
  // S3 save; the AI runs in the background and the plan lands on the
  // calendar when ready (the calendar polls S3 for the output).
  const handleGenerateChapter = async (id: string) => {
    const ch = chapters.find((c) => c.id === id);
    if (!ch) return;

    const err = validateForSave(ch);
    if (err) {
      updateChapter(id, { error: err });
      return;
    }
    const ident = chapterIdentity(ch)!;
    const schedule = chapterSchedules[id];
    const numberOfClasses = schedule?.totalSessions || 0;
    const sessionDates = schedule?.sessions.map((s) => s.date) ?? [];

    // Pick a stable color hue for this chapter based on how many chapters
    // already exist with a hue assigned — keeps the legend predictable.
    const existingHues = chapters
      .filter((c) => c.id !== id && c.saved)
      .length;
    const colorHue = (existingHues * 45) % 360;

    updateChapter(id, { isGenerating: true, error: undefined });

    // Step 1 — Save: upload files + metadata to S3. Generation reads this
    // metadata back, so it must complete first. This is a fast S3 write —
    // the only thing the teacher actually waits on.
    try {
      const res = await lessonPlanAIApi.upload({
        ...ident,
        files: ch.files,
        number_of_classes: numberOfClasses > 0 ? numberOfClasses : 1,
        additional_info: ch.instructions.trim(),
        chapter_name: ch.name.trim(),
        grade_label: selectedGrade?.name,
        section_label: selectedSection?.name,
        subject_label: selectedSubject?.name,
        start_date: ch.startDate,
        end_date: ch.endDate,
        session_dates: sessionDates,
        color_hue: colorHue,
      });
      updateChapter(id, { saved: res });
    } catch (e) {
      updateChapter(id, {
        isGenerating: false,
        error: extractErr(e, 'Could not save the chapter.'),
      });
      return;
    }

    // Step 2 — Generate (non-blocking). Mark the chapter pending, fire
    // generation in the background, and go straight to the calendar — it
    // polls for the output and maps the plan the moment S3 has it. The
    // backend writes the finished plan to S3 regardless of whether this
    // request's response makes it back, so we don't await it here.
    addPending(ident, ch.name.trim());
    lessonPlanAIApi
      .generate(ident, { silent: true })
      .then(() => removePending(ident)) // output is in S3 now → stop polling for it
      .catch(() => {
        /* Leave the marker: the response may have been cut while generation
           kept running server-side. The calendar reconciles against S3 and
           expires the marker if no output ever appears. */
      });
    toast.success(`Generating "${ch.name}" — it'll appear on the calendar when ready.`);
    navigate('/teacher/lesson-plan');
  };

  // ── Render-time derivations ───────────────────────────────────────
  const classReady = !!selectedGrade && !!selectedSection && !!selectedSubject;
  const totalScheduledClasses = chapters.reduce(
    (sum, c) => sum + (chapterSchedules[c.id]?.totalSessions ?? 0),
    0,
  );

  // ── Form view ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-20 sm:gap-8">
      <button
        type="button"
        onClick={() => navigate('/teacher/lesson-plan')}
        className="group inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 transition-colors hover:text-emerald-400"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
        Back to Lesson Plans
      </button>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <header className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-28 -left-12 h-72 w-72 rounded-full bg-violet-500/10 blur-[90px]" />
        <div className="relative z-10 flex items-start gap-4">
          <div className="aurora-gradient aurora-glow flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
              AI Intelligence Suite
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Add Lesson
            </h1>
            <p className="max-w-xl text-sm font-medium text-slate-400">
              Upload chapter resources and we'll count classes from your
              timetable. Saved chapters stay loaded — use{' '}
              <span className="font-black text-emerald-400">
                Add Another Chapter
              </span>{' '}
              for the next one.
            </p>
          </div>
        </div>
      </header>

      {/* ── Working area ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Class + summary rail */}
        <aside className="xl:col-span-4">
          <div className="space-y-4 xl:sticky xl:top-6">
            {/* Step 1 — Class */}
            <div className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-5 sm:p-6">
              <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/5 blur-[90px]" />
              <div className="relative z-10">
                <div className="mb-5 flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                      classReady
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                        : 'border-white/10 bg-white/5 text-slate-300',
                    )}
                  >
                    {classReady ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <GraduationCap className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                      Step 1
                    </div>
                    <h3 className="text-base font-black text-white sm:text-lg">
                      Choose Your Class
                    </h3>
                  </div>
                </div>

                <div className="space-y-4">
                  <Field label="Grade">
                    <SelectWrap>
                      <select
                        value={gradeId}
                        onChange={(e) =>
                          setGradeId(e.target.value ? Number(e.target.value) : '')
                        }
                        className={selectCls}
                      >
                        <option value="">Select grade</option>
                        {teachingGrades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </SelectWrap>
                  </Field>
                  <Field label="Section">
                    <SelectWrap>
                      <select
                        value={sectionId}
                        onChange={(e) =>
                          setSectionId(e.target.value ? Number(e.target.value) : '')
                        }
                        disabled={!gradeId}
                        className={selectCls}
                      >
                        <option value="">Select section</option>
                        {teachingSections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </SelectWrap>
                  </Field>
                  <Field label="Subject">
                    <SelectWrap>
                      <select
                        value={subjectId}
                        onChange={(e) =>
                          setSubjectId(e.target.value ? Number(e.target.value) : '')
                        }
                        disabled={!sectionId}
                        className={selectCls}
                      >
                        <option value="">Select subject</option>
                        {teachingSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </SelectWrap>
                  </Field>
                </div>

                {isTimetableLoading && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Syncing timetable…
                  </div>
                )}
                {timetableError && (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300">
                    {timetableError}
                  </div>
                )}
                {!isTimetableLoading && !timetableError && timetable && (
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Timetable synced
                  </div>
                )}
              </div>
            </div>

            {/* Plan summary */}
            <div className="premium-card border-glass-border rounded-3xl p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                <Layers className="h-3.5 w-3.5" />
                Plan summary
              </div>
              <dl className="space-y-px overflow-hidden rounded-2xl border border-white/5">
                <SummaryRow
                  label="Class"
                  value={
                    classReady
                      ? `${selectedGrade!.name} · ${selectedSection!.name} · ${selectedSubject!.name}`
                      : null
                  }
                />
                <SummaryRow label="Chapters" value={String(chapters.length)} />
                <SummaryRow
                  label="Classes scheduled"
                  value={
                    classReady && totalScheduledClasses > 0
                      ? String(totalScheduledClasses)
                      : classReady
                        ? '0'
                        : null
                  }
                />
              </dl>
              <p className="mt-4 flex items-start gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                <Cloud className="mt-px h-3.5 w-3.5 shrink-0" />
                Generate saves your chapter & builds the plan — it appears on the
                calendar when ready.
              </p>
            </div>
          </div>
        </aside>

        {/* Step 2 — Chapters */}
        <section className="space-y-5 xl:col-span-8">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
              Step 2
            </span>
            <span className="text-xl font-black text-white">Add Chapters</span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] tabular-nums text-slate-300">
              {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
            </span>
          </div>

          <AnimatePresence initial={false}>
            {chapters.map((chapter, idx) => {
              const schedule = chapterSchedules[chapter.id];
              return (
                <motion.div
                  key={chapter.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="premium-card border-glass-border relative overflow-hidden rounded-3xl p-5 sm:p-7"
                >
                  <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/5 blur-[80px]" />

                  <div className="relative z-10 mb-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="aurora-gradient aurora-glow flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black text-white">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                          Chapter {idx + 1}
                        </div>
                        <div className="truncate text-base font-black text-white">
                          {chapter.name || 'Untitled chapter'}
                        </div>
                      </div>
                    </div>
                    {chapters.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChapter(chapter.id)}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5 text-rose-400 transition-all hover:bg-rose-500/15"
                        title="Remove this chapter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="relative z-10 grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Field label="Chapter Name">
                        <input
                          type="text"
                          placeholder="e.g. Matrix"
                          value={chapter.name}
                          onChange={(e) => {
                            updateChapter(chapter.id, { name: e.target.value });
                            invalidateChapter(chapter.id);
                          }}
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <Field label="Start Date">
                      <DatePicker
                        value={chapter.startDate}
                        placeholder="Start date"
                        max={chapter.endDate || undefined}
                        onChange={(v) => {
                          updateChapter(chapter.id, { startDate: v });
                          invalidateChapter(chapter.id);
                        }}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="End Date">
                      <DatePicker
                        value={chapter.endDate}
                        placeholder="End date"
                        min={chapter.startDate || undefined}
                        onChange={(v) => {
                          updateChapter(chapter.id, { endDate: v });
                          invalidateChapter(chapter.id);
                        }}
                        className={inputCls}
                      />
                    </Field>

                    {/* Live class count from timetable */}
                    <div className="md:col-span-2">
                      {!timetable || !subjectId ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                          Pick grade, section, and subject to count classes.
                        </div>
                      ) : !schedule ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                          Pick start and end dates to see the class count.
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'flex flex-wrap items-center gap-4 rounded-2xl border p-4',
                            schedule.totalSessions > 0
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-amber-500/30 bg-amber-500/5',
                          )}
                        >
                          <div className="flex items-center gap-3 pr-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                              <CalendarRange className="h-6 w-6" />
                            </div>
                            <div>
                              <div className="text-3xl font-black tabular-nums leading-none text-white">
                                {schedule.totalSessions}
                              </div>
                              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                Classes · {Math.round(schedule.totalHours * 10) / 10}h
                              </div>
                            </div>
                          </div>
                          {schedule.excludedDays.length > 0 && (
                            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-emerald-400">
                                <Palmtree className="h-6 w-6" />
                              </div>
                              <div>
                                <div className="text-3xl font-black tabular-nums leading-none text-white">
                                  {schedule.excludedDays.length}
                                </div>
                                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                  Days skipped
                                </div>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              updateChapter(chapter.id, {
                                showBreakdown: !chapter.showBreakdown,
                              })
                            }
                            disabled={
                              schedule.totalSessions === 0 &&
                              schedule.excludedDays.length === 0
                            }
                            className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-400 disabled:opacity-30"
                          >
                            <ListChecks className="h-3.5 w-3.5" />
                            {chapter.showBreakdown ? 'Hide' : 'Show'} dates
                          </button>
                        </div>
                      )}
                      {schedule && schedule.totalSessions === 0 && (
                        <p className="ml-2 mt-2 text-xs font-bold text-amber-400">
                          No timetabled classes for this subject in that range.
                        </p>
                      )}
                      <AnimatePresence>
                        {schedule &&
                          chapter.showBreakdown &&
                          (schedule.sessions.length > 0 ||
                            schedule.excludedDays.length > 0) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto pr-2">
                                {schedule.sessions.map((s, i) => (
                                  <div
                                    key={`${s.date}-${s.period_id}-${i}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs font-bold"
                                  >
                                    <span className="min-w-[6.5rem] tabular-nums text-slate-400">
                                      {s.date}
                                    </span>
                                    <span className="flex-1 truncate text-white">
                                      {s.period_name}
                                    </span>
                                    <span className="tabular-nums text-slate-500">
                                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                    </span>
                                    <span className="tabular-nums text-emerald-400">
                                      {Math.round(s.duration_hours * 10) / 10}h
                                    </span>
                                  </div>
                                ))}
                                {schedule.excludedDays.map((d) => (
                                  <div
                                    key={`excl-${d.date}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-xs font-bold"
                                  >
                                    <span className="min-w-[6.5rem] tabular-nums text-slate-400">
                                      {d.date}
                                    </span>
                                    <span className="flex-1 truncate text-emerald-300">
                                      {d.reason}
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70">
                                      Skipped
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                      </AnimatePresence>
                    </div>

                    <div className="md:col-span-2">
                      <Field label="Additional Instructions (optional)">
                        <textarea
                          rows={3}
                          placeholder="Anything specific to highlight or skip — focus areas, lab notes, revision approach…"
                          value={chapter.instructions}
                          onChange={(e) => {
                            updateChapter(chapter.id, { instructions: e.target.value });
                            invalidateChapter(chapter.id);
                          }}
                          className={`${inputCls} h-auto resize-y p-4`}
                        />
                      </Field>
                    </div>

                    <div className="space-y-3 md:col-span-2">
                      <div className="ml-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                        Syllabus File (any file type)
                      </div>
                      {/* Native file input wrapped in a <label>: clicking the
                          label activates the contained input via the HTML spec
                          (no programmatic .click(), no `htmlFor`), so it stays
                          reliable on every browser. */}
                      <label
                        className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 bg-black/20 px-4 py-7 text-center transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 transition-transform group-hover:scale-105">
                          <UploadCloud className="h-6 w-6" />
                        </span>
                        <span className="text-sm font-bold text-white">
                          Tap to choose files
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Any file type · multiple allowed
                        </span>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            addFilesToChapter(chapter.id, e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {chapter.files.length > 0 && (
                        <ul className="space-y-2 pt-1">
                          {chapter.files.map((file, i) => (
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
                              <span className="text-[10px] font-black uppercase tracking-widest tabular-nums text-slate-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFileFromChapter(chapter.id, i)}
                                className="rounded-lg p-1.5 text-rose-400 transition-all hover:bg-rose-500/10"
                                title="Remove file"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Per-chapter status + actions */}
                  {chapter.error && (
                    <div className="relative z-10 mt-5 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-300">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <span className="flex-1">{chapter.error}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateChapter(chapter.id, { error: undefined })
                        }
                        className="opacity-60 hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {chapter.saved && (
                    <div className="relative z-10 mt-5 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
                          Saved
                        </div>
                        <div className="mt-0.5 text-xs font-bold text-emerald-300">
                          {chapter.saved.resources.length} file
                          {chapter.saved.resources.length === 1 ? '' : 's'} ready.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative z-10 mt-6">
                    <button
                      type="button"
                      onClick={() => handleGenerateChapter(chapter.id)}
                      disabled={chapter.isGenerating}
                      className="aurora-gradient aurora-glow flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                    >
                      {chapter.isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving & generating…
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4" />
                          Generate
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <button
            type="button"
            onClick={addChapter}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-400"
          >
            <Plus className="h-4 w-4" /> Add Another Chapter
          </button>
        </section>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────
function extractErr(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: unknown } } }).response;
    const detail = r?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

// ── Draft persistence ───────────────────────────────────────────────
interface PersistedChapter {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  instructions: string;
  showBreakdown: boolean;
  saved?: UploadResponse;
}

interface PersistedDraft {
  gradeId: number | null;
  sectionId: number | null;
  subjectId: number | null;
  chapters: PersistedChapter[];
}

function persistChapter(c: ChapterDraft): PersistedChapter {
  return {
    id: c.id,
    name: c.name,
    startDate: c.startDate,
    endDate: c.endDate,
    instructions: c.instructions,
    showBreakdown: c.showBreakdown,
    saved: c.saved,
  };
}

function hydratePersistedChapter(p: PersistedChapter): ChapterDraft {
  return {
    id: p.id || `ch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: p.name ?? '',
    startDate: p.startDate ?? '',
    endDate: p.endDate ?? '',
    instructions: p.instructions ?? '',
    files: [], // browsers cannot rehydrate File handles
    showBreakdown: !!p.showBreakdown,
    saved: p.saved,
  };
}

// ── UI atoms ────────────────────────────────────────────────────────
const inputCls =
  'w-full h-12 px-4 rounded-2xl border border-white/10 bg-black/30 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 outline-none font-semibold text-sm transition-all hover:border-white/20 disabled:opacity-40';

const selectCls =
  'w-full h-12 pl-4 pr-10 rounded-2xl border border-white/10 bg-black/30 text-white appearance-none cursor-pointer focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 outline-none font-bold text-sm transition-all hover:border-white/20 disabled:opacity-40';

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <svg
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white/[0.02] px-3.5 py-2.5">
      <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          'max-w-[60%] truncate text-right text-xs font-bold tabular-nums',
          value ? 'text-white' : 'text-slate-600',
        )}
      >
        {value || 'Not set'}
      </dd>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 block text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
