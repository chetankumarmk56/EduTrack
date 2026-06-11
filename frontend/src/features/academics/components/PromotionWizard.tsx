import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GraduationCap, ArrowRight, Loader2, Download, AlertTriangle,
  CheckCircle2, Sparkles, Users, FileSpreadsheet,
} from 'lucide-react';
import ModalShell, { ModalHeader, ModalBody, ModalFooter } from '@/shared/components/ui/ModalShell';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import { useToast } from '@/shared/components/ui/Toast';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { academicApi, type PromotionPreview } from '@/features/academics/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onPromoted?: () => void;
}

const pct = (v?: number | null) => (v === null || v === undefined ? '—' : `${v}%`);
const rupees = (v: number) => `₹${(v || 0).toLocaleString('en-IN')}`;

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PromotionWizard({ open, onClose, onPromoted }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [retained, setRetained] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null);

  // Load the dry-run preview whenever the wizard opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setRetained(new Set());
    academicApi
      .previewPromotion([])
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((err) => { if (!cancelled) toast.error('Could not load preview', getErrorMessage(err).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, toast]);

  const toggleRetain = useCallback((studentId: number) => {
    setRetained((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }, []);

  // Totals recomputed locally as the admin flips decisions.
  const totals = useMemo(() => {
    let promote = 0, retain = 0, graduate = 0;
    for (const grp of preview?.classes ?? []) {
      for (const s of grp.students) {
        if (grp.is_top_grade) graduate += 1;
        else if (retained.has(s.student_id)) retain += 1;
        else promote += 1;
      }
    }
    return { promote, retain, graduate };
  }, [preview, retained]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const blob = await academicApi.exportPromotionPreview(format);
      const label = preview?.active_year?.label ?? 'current';
      triggerDownload(blob, `promotion-preview_${label}.${format}`);
    } catch (err) {
      toast.error('Export failed', getErrorMessage(err).message);
    } finally {
      setExporting(null);
    }
  };

  const handleExecute = async () => {
    setSubmitting(true);
    try {
      const summary = await academicApi.executePromotion(
        Array.from(retained),
        preview?.next_year_label ?? undefined,
      );
      toast.success(
        `Promoted ${summary.promoted}, retained ${summary.retained}, graduated ${summary.graduated}` +
        (summary.created_classes.length ? ` · created ${summary.created_classes.join(', ')}` : ''),
      );
      setConfirming(false);
      onPromoted?.();
      onClose();
    } catch (err) {
      toast.error('Promotion failed', getErrorMessage(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeLabel = preview?.active_year?.label ?? '—';
  const nextLabel = preview?.next_year_label ?? '—';
  const alreadyPromoted = preview?.already_promoted ?? false;

  return (
    <>
      <ModalShell open={open} onClose={onClose} size="2xl" locked={submitting}>
        <ModalHeader
          icon={<GraduationCap className="w-5 h-5" />}
          title="Promote to Next Academic Year"
          subtitle={
            <span className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">{activeLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
              <span className="font-bold text-indigo-600">{nextLabel}</span>
            </span>
          }
        />

        <ModalBody>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-secondary gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-brand-indigo" />
              <p className="text-sm font-medium">Analysing classes, marks and dues…</p>
            </div>
          ) : !preview ? (
            <div className="py-20 text-center text-text-secondary">No preview data available.</div>
          ) : (
            <div className="space-y-6">
              {alreadyPromoted && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 font-medium">
                    This year ({activeLabel}) has already been promoted. Running again is blocked to
                    prevent double-promotion.
                  </p>
                </div>
              )}

              {/* Summary chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryChip label="Students" value={preview.totals.students} tone="slate" icon={<Users className="w-4 h-4" />} />
                <SummaryChip label="Promote" value={totals.promote} tone="emerald" icon={<ArrowRight className="w-4 h-4" />} />
                <SummaryChip label="Retain" value={totals.retain} tone="amber" icon={<AlertTriangle className="w-4 h-4" />} />
                <SummaryChip label="Graduate" value={totals.graduate} tone="indigo" icon={<GraduationCap className="w-4 h-4" />} />
              </div>

              {preview.auto_create_classes.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                  <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-indigo-700 font-medium">
                    These next-grade classes don't exist yet and will be created automatically:{' '}
                    <span className="font-black">{preview.auto_create_classes.join(', ')}</span>.
                  </p>
                </div>
              )}

              {/* Per-class tables */}
              {preview.classes.map((grp) => (
                <div key={grp.school_class_id} className="rounded-2xl border border-glass-border overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-500/5 border-b border-glass-border">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-black text-foreground">{grp.class_name ?? `Class ${grp.school_class_id}`}</span>
                      <span className="text-[11px] font-bold text-text-secondary">{grp.student_count} students</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600">
                        Class avg {pct(grp.class_overall_percentage)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-bold">
                      {grp.is_top_grade ? (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" /> Graduating grade
                        </span>
                      ) : (
                        <span className="text-text-secondary flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> {grp.target_class_name ?? '—'}
                          {grp.will_create_target && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">will create</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
                          <th className="text-left font-black px-4 py-2">Roll</th>
                          <th className="text-left font-black px-4 py-2">Student</th>
                          <th className="text-left font-black px-4 py-2 hidden sm:table-cell">Admission #</th>
                          <th className="text-right font-black px-4 py-2">Overall %</th>
                          <th className="text-right font-black px-4 py-2">Arrears</th>
                          <th className="text-right font-black px-4 py-2">Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.students.map((s) => {
                          const isRetained = retained.has(s.student_id);
                          const decision = grp.is_top_grade ? 'GRADUATE' : isRetained ? 'RETAIN' : 'PROMOTE';
                          return (
                            <tr key={s.student_id} className="border-t border-glass-border/60">
                              <td className="px-4 py-2 text-text-secondary">{s.roll_number ?? '—'}</td>
                              <td className="px-4 py-2 font-bold text-foreground">{s.name}</td>
                              <td className="px-4 py-2 text-text-secondary hidden sm:table-cell">{s.admission_number ?? '—'}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{pct(s.overall_percentage)}</td>
                              <td className={cn('px-4 py-2 text-right tabular-nums', s.arrears > 0 ? 'text-rose-600 font-bold' : 'text-text-secondary')}>
                                {rupees(s.arrears)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {grp.is_top_grade ? (
                                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600">GRADUATE</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleRetain(s.student_id)}
                                    className={cn(
                                      'text-[11px] font-black px-2.5 py-1 rounded-full transition-colors',
                                      decision === 'RETAIN'
                                        ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25'
                                        : 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25',
                                    )}
                                    title="Click to toggle Promote / Retain"
                                  >
                                    {decision}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {preview.unassigned.length > 0 && (
                <p className="text-xs text-text-secondary px-1">
                  {preview.unassigned.length} student(s) have no class assigned and will be skipped.
                </p>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter leading={preview ? `Tap a decision chip to hold a student back.` : undefined}>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={!preview || !!exporting}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-glass-border text-text-secondary hover:bg-slate-500/5 disabled:opacity-50 flex items-center gap-1.5"
          >
            {exporting === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={!preview || !!exporting}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-glass-border text-text-secondary hover:bg-slate-500/5 disabled:opacity-50 flex items-center gap-1.5"
          >
            {exporting === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!preview || alreadyPromoted || submitting}
            className="px-4 py-2 rounded-xl text-sm font-black bg-brand-indigo text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" /> Confirm Promotion
          </button>
        </ModalFooter>
      </ModalShell>

      <ConfirmModal
        open={confirming}
        onCancel={() => !submitting && setConfirming(false)}
        onConfirm={handleExecute}
        isLoading={submitting}
        tone="primary"
        title={`Promote ${activeLabel} → ${nextLabel}?`}
        confirmLabel="Yes, promote everyone"
        description={
          `This will promote ${totals.promote} student(s), retain ${totals.retain}, and graduate ${totals.graduate}. ` +
          `Historical records stay intact under ${activeLabel}; the new year starts clean. This cannot be undone in one click.`
        }
      />
    </>
  );
}

function SummaryChip({
  label, value, tone, icon,
}: {
  label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'indigo'; icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-500/10 text-slate-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    indigo: 'bg-indigo-500/10 text-indigo-600',
  };
  return (
    <div className={cn('rounded-2xl p-3 flex items-center gap-3', tones[tone])}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</p>
        <p className="text-xl font-black leading-none">{value}</p>
      </div>
    </div>
  );
}
