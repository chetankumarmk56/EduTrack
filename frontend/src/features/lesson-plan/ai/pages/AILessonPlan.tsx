import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  FileText,
  ListChecks,
  Loader2,
  Palmtree,
  Plus,
  Save,
  Sparkles,
  Trash2,
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

import { lessonPlanAIApi } from '@/features/lesson-plan/ai/api';
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
 *   Save  ─▶ uploads every chapter's files + writes metadata.json under
 *            lesson-plan/<schoolId>/<teacherId>/<gradeId>/<subjectId>/<chapterId>/
 *   Generate ─▶ reads the matching output/lesson_plan.json that the
 *               external microservice has produced.
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

  const handleSaveChapter = async (id: string) => {
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

    updateChapter(id, { isSaving: true, error: undefined });
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
      updateChapter(id, { saved: res, isSaving: false });
      toast.success(`Saved "${ch.name}"`);
    } catch (e) {
      updateChapter(id, {
        isSaving: false,
        error: extractErr(e, 'Could not save the chapter.'),
      });
    }
  };

  // ── Generate (per chapter — read from S3, then return to dashboard) ──
  const handleGenerateChapter = async (id: string) => {
    const ch = chapters.find((c) => c.id === id);
    if (!ch) return;
    const ident = chapterIdentity(ch);
    if (!ident) {
      updateChapter(id, {
        error:
          'Pick Grade / Section / Subject and give the chapter a name first.',
      });
      return;
    }
    if (!ch.saved) {
      updateChapter(id, {
        error: 'Save the chapter first before generating.',
      });
      return;
    }
    updateChapter(id, { isGenerating: true, error: undefined });
    try {
      await lessonPlanAIApi.generate(ident);
      updateChapter(id, { isGenerating: false });
      toast.success(`Generated "${ch.name}" — opening the calendar.`);
      navigate('/teacher/lesson-plan');
    } catch (e) {
      updateChapter(id, {
        isGenerating: false,
        error: extractErr(e, 'Generation failed — check the AI service logs.'),
      });
    }
  };

  // ── Form view ────────────────────────────────────────────────────
  return (
    <div className="space-y-10">
      <button
        type="button"
        onClick={() => navigate('/teacher/lesson-plan')}
        className="group inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
        Back to Lesson Plans
      </button>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-2 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <Sparkles className="h-3.5 w-3.5 fill-primary" />
            AI Intelligence Suite
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-foreground -mb-1">
            Add Lesson
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            Upload chapter resources and we'll count classes from your timetable. Previously added chapters stay loaded; use <span className="text-primary font-black">Add Another Chapter</span> below for the next one.
          </p>
        </div>
      </div>

      {/* Step 1 — Choose Class */}
      <div className="premium-card p-8 bg-card/40 border-glass-border relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary/5 rounded-full blur-[100px]" />
        <h3 className="text-xl font-black mb-6 flex items-center gap-3 relative z-10">
          <span className="text-primary text-[10px] font-black uppercase tracking-[0.3em]">Step 1</span>
          <span className="text-foreground">Choose Your Class</span>
        </h3>
        <div className="grid sm:grid-cols-3 gap-5 relative z-10">
          <Field label="Grade">
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value ? Number(e.target.value) : '')}
              className={selectCls}
            >
              <option value="">Select grade</option>
              {teachingGrades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Section">
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : '')}
              disabled={!gradeId}
              className={selectCls}
            >
              <option value="">Select section</option>
              {teachingSections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}
              disabled={!sectionId}
              className={selectCls}
            >
              <option value="">Select subject</option>
              {teachingSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {isTimetableLoading && (
          <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground/70 relative z-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Syncing timetable…
          </div>
        )}
        {timetableError && (
          <div className="mt-5 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300 font-bold relative z-10">
            {timetableError}
          </div>
        )}
      </div>

      {/* Step 2 — Chapters */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-primary text-[10px] font-black uppercase tracking-[0.3em]">Step 2</span>
          <span className="text-xl font-black text-foreground">Add Chapters</span>
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
                className="premium-card p-8 bg-card/40 border-glass-border relative overflow-hidden"
              >
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-primary/5 rounded-full blur-[80px]" />

                <div className="flex items-center justify-between gap-4 mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-black text-sm aurora-glow">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">
                        Chapter {idx + 1}
                      </div>
                      <div className="text-base font-black text-foreground">
                        {chapter.name || 'Untitled chapter'}
                      </div>
                    </div>
                  </div>
                  {chapters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChapter(chapter.id)}
                      className="p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/15 text-rose-400 transition-all"
                      title="Remove this chapter"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-5 relative z-10">
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
                    <input
                      type="date"
                      value={chapter.startDate}
                      onChange={(e) => {
                        updateChapter(chapter.id, { startDate: e.target.value });
                        invalidateChapter(chapter.id);
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="End Date">
                    <input
                      type="date"
                      value={chapter.endDate}
                      onChange={(e) => {
                        updateChapter(chapter.id, { endDate: e.target.value });
                        invalidateChapter(chapter.id);
                      }}
                      className={inputCls}
                    />
                  </Field>

                  {/* Live class count from timetable */}
                  <div className="md:col-span-2">
                    {!timetable || !subjectId ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
                        Pick grade, section, and subject above to count classes.
                      </div>
                    ) : !schedule ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
                        Pick start and end dates to see the class count.
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'rounded-2xl border p-5 flex flex-wrap items-center gap-5',
                          schedule.totalSessions > 0
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-amber-500/5 border-amber-500/30',
                        )}
                      >
                        <div className="flex-1 min-w-[140px]">
                          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 mb-1">
                            Classes in range
                          </div>
                          <div className="text-3xl font-black tabular-nums text-foreground">
                            {schedule.totalSessions}
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 mt-1">
                            {Math.round(schedule.totalHours * 10) / 10}h total
                          </div>
                        </div>
                        {schedule.excludedDays.length > 0 && (
                          <div className="flex-1 min-w-[140px]">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-1">
                              <Palmtree className="w-3 h-3" /> Excluded
                            </div>
                            <div className="text-2xl font-black tabular-nums text-emerald-400">
                              {schedule.excludedDays.length}
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 mt-1">
                              Non-teaching day
                              {schedule.excludedDays.length === 1 ? '' : 's'} skipped
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
                          className="px-3 py-2 rounded-xl border border-white/10 bg-black/30 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 disabled:opacity-30"
                        >
                          <ListChecks className="w-3.5 h-3.5" />
                          {chapter.showBreakdown ? 'Hide' : 'Show'} dates
                        </button>
                      </div>
                    )}
                    {schedule && schedule.totalSessions === 0 && (
                      <p className="mt-2 ml-2 text-xs font-bold text-amber-300/80">
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
                            <div className="mt-4 max-h-56 overflow-y-auto pr-2 space-y-1.5">
                              {schedule.sessions.map((s, i) => (
                                <div
                                  key={`${s.date}-${s.period_id}-${i}`}
                                  className="flex items-center justify-between gap-3 text-xs font-bold px-3 py-2 rounded-lg bg-black/30 border border-white/5"
                                >
                                  <span className="tabular-nums text-muted-foreground/80 min-w-[6.5rem]">
                                    {s.date}
                                  </span>
                                  <span className="flex-1 truncate text-foreground">
                                    {s.period_name}
                                  </span>
                                  <span className="text-muted-foreground/60 tabular-nums">
                                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                  </span>
                                  <span className="text-primary tabular-nums">
                                    {Math.round(s.duration_hours * 10) / 10}h
                                  </span>
                                </div>
                              ))}
                              {schedule.excludedDays.map((d) => (
                                <div
                                  key={`excl-${d.date}`}
                                  className="flex items-center justify-between gap-3 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
                                >
                                  <span className="tabular-nums text-muted-foreground/80 min-w-[6.5rem]">
                                    {d.date}
                                  </span>
                                  <span className="flex-1 truncate text-emerald-300">
                                    {d.reason}
                                  </span>
                                  <span className="text-emerald-400/60 text-[10px] font-black uppercase tracking-widest">
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
                        className={`${inputCls} resize-y h-auto p-4`}
                      />
                    </Field>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2">
                      Syllabus File (any file type)
                    </div>
                    {/* Direct, visible native file input — styled via Tailwind's
                        `file:` variant on the built-in ::file-selector-button.
                        No overlays, no programmatic .click(), no `htmlFor`. This
                        is the picker the browser already handles natively,
                        so it works on every browser without exception. */}
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        addFilesToChapter(chapter.id, e.target.files);
                        e.target.value = '';
                      }}
                      className="block w-full text-sm text-muted-foreground cursor-pointer
                                 file:mr-4 file:px-5 file:py-3 file:rounded-2xl file:border-0
                                 file:font-black file:text-[10px] file:uppercase file:tracking-[0.2em]
                                 file:text-white file:cursor-pointer file:shadow-lg file:shadow-primary/10
                                 file:bg-gradient-to-r file:from-emerald-500 file:to-violet-500
                                 hover:file:opacity-90"
                    />

                    {chapter.files.length > 0 && (
                      <ul className="space-y-2 pt-1">
                        {chapter.files.map((file, i) => (
                          <li
                            key={`${file.name}-${i}`}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/30 border border-white/5"
                          >
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="flex-1 truncate text-sm font-bold text-foreground">
                              {file.name}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 tabular-nums">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFileFromChapter(chapter.id, i)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-all"
                              title="Remove file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Per-chapter status + actions */}
                {chapter.error && (
                  <div className="mt-5 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300 font-bold relative z-10">
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">{chapter.error}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateChapter(chapter.id, { error: undefined })
                      }
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {chapter.saved && (
                  <div className="mt-5 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/30 flex items-center gap-3 relative z-10">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-emerald-300 text-[10px] font-black uppercase tracking-[0.3em]">
                        Saved
                      </div>
                      <div className="text-emerald-200/80 text-xs font-bold mt-0.5">
                        {chapter.saved.resources.length} file{chapter.saved.resources.length === 1 ? '' : 's'} ready · click Generate when you're ready.
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 grid sm:grid-cols-2 gap-3 relative z-10">
                  <button
                    type="button"
                    onClick={() => handleSaveChapter(chapter.id)}
                    disabled={chapter.isSaving || chapter.isGenerating}
                    className="h-12 px-5 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {chapter.isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
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
                    onClick={() => handleGenerateChapter(chapter.id)}
                    disabled={chapter.isSaving || chapter.isGenerating}
                    className="h-12 px-5 rounded-2xl aurora-gradient text-white font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] aurora-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                  >
                    {chapter.isGenerating ? (
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
              </motion.div>
            );
          })}
        </AnimatePresence>

        <button
          type="button"
          onClick={addChapter}
          className="w-full py-5 rounded-2xl border-2 border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3"
        >
          <Plus className="w-4 h-4" /> Add Another Chapter
        </button>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 flex items-center gap-2">
        <Cloud className="w-3.5 h-3.5" />
        Save keeps your chapter's files and details · Generate builds the lesson plan from them.
      </p>
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
  'w-full h-12 px-4 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-bold text-sm transition-all hover:border-primary/30 disabled:opacity-40';

const selectCls =
  'w-full h-12 px-4 rounded-2xl border border-white/5 bg-black/40 focus:ring-2 focus:ring-primary/50 outline-none font-black text-sm transition-all hover:border-primary/30 disabled:opacity-40';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 ml-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}
