import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Coins, Download, FileText,
  Loader2, ReceiptText, RefreshCw, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/AuthContext';
import { Skeleton, SkeletonHeader, SkeletonStatGrid } from '@/shared/components/ui/Skeleton';
import { financeApi } from '@/features/finance/api';

import { manualPaymentsApi } from '../api';
import type {
  ManualPaymentRequest, ManualPaymentStudentRef, SchoolPaymentInfo,
} from '../types';
import SchoolPaymentInfoCard from '../components/SchoolPaymentInfoCard';
import PaymentRequestForm from '../components/PaymentRequestForm';
import StatusBadge from '../components/StatusBadge';
import ScreenshotPreview from '../components/ScreenshotPreview';
import { formatDateTime, formatINR } from '../lib/validation';
import type { ParentFormState } from '../lib/validation';

/**
 * Parent / student-facing manual payment page.
 *
 * Two-column layout on desktop: school info + dues on the left,
 * submission form on the right. Submission history is rendered below.
 *
 * This page reads the existing finance dues via the legacy `financeApi`
 * for display purposes only — it never writes to the legacy payment
 * tables. All writes go through `manualPaymentsApi`.
 */

export default function ParentManualPayment() {
  const { user } = useAuth();
  const [students, setStudents] = useState<ManualPaymentStudentRef[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolPaymentInfo | null>(null);
  const [history, setHistory] = useState<ManualPaymentRequest[]>([]);
  const [dues, setDues] = useState<Array<{ student_id: number; student_name: string; total_due: number; total_paid: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [studentsRes, schoolRes, historyRes, duesRes] = await Promise.all([
          manualPaymentsApi.getMyStudents().catch(() => []),
          manualPaymentsApi.getSchoolInfo().catch(() => null),
          manualPaymentsApi.listMine({ limit: 50 }).catch(() => null),
          financeApi.getMyDues().catch(() => []),
        ]);
        if (cancelled) return;
        setStudents(studentsRes);
        setSchoolInfo(schoolRes);
        setHistory(historyRes?.items || []);
        setDues(duesRes as Array<{ student_id: number; student_name: string; total_due: number; total_paid: number }>);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const totalPending = useMemo(
    () => dues.reduce((sum, d) => sum + (d.total_due || 0), 0),
    [dues],
  );
  const totalPaid = useMemo(
    () => dues.reduce((sum, d) => sum + (d.total_paid || 0), 0),
    [dues],
  );
  const pendingSubmissions = useMemo(
    () => history.filter((h) => h.status === 'PENDING_VERIFICATION' || h.status === 'NEED_VERIFICATION').length,
    [history],
  );

  const onSubmit = async (formState: ParentFormState) => {
    if (!formState.student_id) return;
    setIsSubmitting(true);
    try {
      await manualPaymentsApi.submit({
        student_id: formState.student_id,
        parent_name: formState.parent_name.trim(),
        amount: Number(formState.amount),
        transaction_reference: formState.transaction_reference.trim(),
        // datetime-local fields are naive; assume the parent's local TZ.
        transaction_at: new Date(formState.transaction_at).toISOString(),
        fee_type: formState.fee_type,
        installment_label: formState.installment_label.trim() || undefined,
        payer_name: formState.payer_name.trim() || undefined,
        payer_upi: formState.payer_upi.trim() || undefined,
        parent_note: formState.parent_note.trim() || undefined,
        screenshot: formState.screenshot,
      });
      toast.success('Payment submitted! The school office will verify it shortly.');
      setRefreshKey((k) => k + 1);
    } catch {
      // toast already shown by the axios interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadReceipt = async (id: number) => {
    try {
      const url = manualPaymentsApi.receiptUrl(id);
      // Use a hidden link so we don't depend on raw window.open being unblocked,
      // and the auth cookie rides along automatically via `credentials: include`.
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } catch {
      toast.error('Receipt could not be downloaded.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 p-4 sm:p-6">
        <SkeletonHeader />
        <SkeletonStatGrid count={3} />
        <div className="grid lg:grid-cols-12 gap-6">
          <Skeleton rounded="3xl" className="lg:col-span-5 h-96" />
          <Skeleton rounded="3xl" className="lg:col-span-7 h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase tracking-[0.3em] bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
              <Sparkles className="w-3.5 h-3.5" /> UPI Payment · Admin Verified
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-slate-900 dark:text-white leading-[0.95]">
              Pay Fees via <span className="text-emerald-600 italic">UPI</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Pay into the school's UPI ID or bank account using your own UPI / banking app,
              then submit the transaction reference (UTR) and an optional screenshot below.
              The school office manually verifies every payment and issues an official receipt
              once approved.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="self-start md:self-end inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 dark:border-white/10 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Coins className="w-5 h-5" />}
            label="Total Due"
            value={formatINR(totalPending)}
            tone={totalPending > 0 ? 'rose' : 'emerald'}
            sub={totalPending > 0 ? 'Outstanding fees' : 'Fully cleared'}
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Paid (verified)"
            value={formatINR(totalPaid)}
            tone="indigo"
            sub="Across all dues"
          />
          <StatCard
            icon={<ClipboardList className="w-5 h-5" />}
            label="Awaiting Verification"
            value={String(pendingSubmissions)}
            tone={pendingSubmissions > 0 ? 'amber' : 'emerald'}
            sub="Submissions in queue"
          />
        </div>

        {/* Body grid */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left column: school info + dues */}
          <div className="lg:col-span-5 space-y-6">
            {schoolInfo && <SchoolPaymentInfoCard info={schoolInfo} />}

            {dues.length > 0 && (
              <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-md bg-white/70 dark:bg-white/[0.03] backdrop-blur-md p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">
                    Pending Fees
                  </h3>
                </div>
                <div className="space-y-3">
                  {dues.map((d) => (
                    <div
                      key={d.student_id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/70 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                          {d.student_name}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                          Paid: {formatINR(d.total_paid)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'text-base font-black',
                          d.total_due > 0 ? 'text-rose-500' : 'text-emerald-600',
                        )}
                      >
                        {d.total_due > 0 ? formatINR(d.total_due) : 'Settled'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: submission form */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md p-5 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <ReceiptText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                    Submit a payment for verification
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fill in the transaction details after paying via UPI or bank transfer.
                  </p>
                </div>
              </div>

              {students.length === 0 ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex items-start gap-3 text-amber-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs font-bold">
                    No student is linked to your account. Please ask the school office to
                    link your child before submitting a payment here.
                  </p>
                </div>
              ) : (
                <PaymentRequestForm
                  students={students}
                  defaultParentName={user?.name}
                  isSubmitting={isSubmitting}
                  onSubmit={onSubmit}
                />
              )}
            </div>
          </div>
        </div>

        {/* History */}
        <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-xl bg-white/70 dark:bg-white/[0.03] backdrop-blur-md overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200/60 dark:border-white/5 flex items-center gap-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">
              My Submissions
            </h2>
            <span className="ml-auto px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
              {history.length}
            </span>
          </div>
          {history.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400">
              <Loader2 className="w-8 h-8 opacity-20 mx-auto" />
              <p className="mt-2 text-sm font-bold">No submissions yet.</p>
              <p className="text-xs">Once you submit a manual payment, it will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200/60 dark:divide-white/5">
              <AnimatePresence initial={false}>
                {history.map((h) => (
                  <motion.li
                    key={h.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                          {h.student_name}
                        </p>
                        <StatusBadge status={h.status} />
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          UTR: {h.transaction_reference}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Submitted {formatDateTime(h.submitted_at)} · {h.fee_type || 'TUITION'}
                        {h.installment_label && ` · ${h.installment_label}`}
                      </p>
                      {h.rejection_reason && (
                        <p className="text-xs text-rose-500 mt-1">
                          Reason: {h.rejection_reason}
                        </p>
                      )}
                      {(h.status === 'FAILED' || h.status === 'REJECTED') && !h.rejection_reason && (
                        <p className="text-xs text-rose-500 mt-1">
                          Payment failed or could not be verified. Please contact the school for clarification.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 self-stretch sm:self-auto">
                      <p className="text-base font-black text-slate-900 dark:text-white">
                        {formatINR(h.approved_amount ?? h.amount)}
                      </p>
                      {h.screenshot_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewUrl(h.screenshot_url!)}
                          className="text-[10px] font-black uppercase tracking-widest text-primary underline"
                        >
                          Proof
                        </button>
                      )}
                      {(h.status === 'APPROVED' || h.status === 'PARTIAL_PAYMENT') && (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(h.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20"
                        >
                          <Download className="w-3 h-3" />
                          Receipt
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <ScreenshotPreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}

/* ─── Local sub-components ────────────────────────────────────────────── */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'rose' | 'emerald' | 'indigo' | 'amber';
}

function StatCard({ icon, label, value, sub, tone }: StatCardProps) {
  const tonal = {
    rose: 'bg-rose-500/10 text-rose-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    indigo: 'bg-indigo-500/10 text-indigo-600',
    amber: 'bg-amber-500/10 text-amber-600',
  }[tone];
  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 shadow-md bg-white/70 dark:bg-white/[0.03] backdrop-blur-md p-5 sm:p-6">
      <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center mb-3', tonal)}>
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest mb-1">
        {label}
      </p>
      <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">{value}</p>
      {sub && (
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
          {sub}
        </p>
      )}
    </div>
  );
}
