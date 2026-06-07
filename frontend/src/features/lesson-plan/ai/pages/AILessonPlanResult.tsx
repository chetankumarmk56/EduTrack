import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';

import { lessonPlanAIApi } from '@/features/lesson-plan/ai/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import type {
  ChapterIdentity,
  LessonPlanOutputResponse,
} from '@/features/lesson-plan/ai/types';

import GeneratedLessonPlanView from './GeneratedLessonPlanView';

export default function AILessonPlanResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const identity = useMemo<ChapterIdentity | null>(() => {
    const fields: (keyof ChapterIdentity)[] = [
      'school_id',
      'teacher_id',
      'grade_id',
      'subject_id',
      'chapter_id',
    ];
    const out = {} as ChapterIdentity;
    for (const field of fields) {
      const v = params.get(field);
      if (!v) return null;
      (out as unknown as Record<string, string>)[field] = v;
    }
    return out;
  }, [params]);

  const [data, setData] = useState<LessonPlanOutputResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Initialize from URL state instead of a setState-in-effect, which the
  // new react-hooks/set-state-in-effect rule flags as cascading-render risk.
  const [error, setError] = useState<string | null>(() =>
    identity
      ? null
      : 'Provide all 5 IDs as query params: school_id, teacher_id, grade_id, subject_id, chapter_id.'
  );

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    // This is a standard data-fetching effect: flip the spinner on,
    // request, then flip it off. React 19's set-state-in-effect rule
    // flags the synchronous setLoading(true) but there's no cleaner
    // alternative without switching to use()/Suspense, which would be
    // a much larger refactor for the same observable behaviour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    lessonPlanAIApi
      .fetchOutput(identity)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = getErrorMessage(err).message;
        setError(typeof detail === 'string' ? detail : 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">
          Loading lesson plan…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-16 space-y-6">
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-5 text-sm text-red-300 font-bold">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/teacher/lesson-plan')}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to generator
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <GeneratedLessonPlanView
      plan={data.lesson_plan}
      metadata={data.metadata}
      outputPath={data.output_path}
      providerMeta={data.provider_meta}
      onReset={() => navigate('/teacher/lesson-plan')}
    />
  );
}
