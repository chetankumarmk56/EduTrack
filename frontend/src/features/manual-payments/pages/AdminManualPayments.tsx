import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, Coins, Download,
  Eye, Filter, Loader2, MailWarning, RefreshCw, Search, Settings,
  ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { SkeletonHeader, SkeletonStatGrid, SkeletonTable } from '@/shared/components/ui/Skeleton';
import DatePicker from '@/shared/components/ui/DatePicker';

import { manualPaymentsApi } from '../api';
import type {
  ManualPaymentListParams,
  ManualPaymentRequest,
  ManualPaymentStatus,
  ManualPaymentSummary,
} from '../types';
import { MANUAL_PAYMENT_STATUSES, STATUS_LABEL } from '../types';
import { formatDateTime, formatINR } from '../lib/validation';
import StatusBadge from '../components/StatusBadge';
import AdminReviewDrawer from '../components/AdminReviewDrawer';
import SchoolPaymentSettingsForm from '../components/SchoolPaymentSettingsForm';

/**
 * Admin-side review of submitted manual payments.
 *
 * Defaults to oldest-first so the queue is processed in submission order.
 * Filters: status (multi), student/UTR search, class, amount range, date range.
 * The selected row opens a right-side drawer with the full detail + decision
 * controls. On Approve/Partial the backend also mirrors the row into
 * FinanceLedger (via manual_payment_request_id) so the admin finance ledger
 * page stays in sync without duplicating receipt storage.
 */

const EMPTY_SUMMARY: ManualPaymentSummary = {
  total: 0,
  pending_verification: 0,
  approved: 0,
  need_verification: 0,
  rejected: 0,
  failed: 0,
  partial: 0,
  total_approved_amount: 0,
};

const PAGE_SIZE = 25;

export default function AdminManualPayments() {
  const [items, setItems] = useState<ManualPaymentRequest[]>([]);
  const [summary, setSummary] = useState<ManualPaymentSummary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ManualPaymentStatus[]>(
    ['PENDING_VERIFICATION', 'NEED_VERIFICATION'],
  );
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ManualPaymentRequest | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'settings'>('queue');

  const params = useMemo<ManualPaymentListParams>(() => {
    const out: ManualPaymentListParams = {
      order,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    };
    if (selectedStatuses.length > 0) out.status = selectedStatuses;
    if (search.trim()) out.search = search.trim();
    if (classFilter.trim()) out.class_name = classFilter.trim();
    if (minAmount) out.min_amount = Number(minAmount);
    if (maxAmount) out.max_amount = Number(maxAmount);
    if (dateFrom) out.date_from = dateFrom;
    if (dateTo) out.date_to = dateTo;
    return out;
  }, [order, page, selectedStatuses, search, classFilter, minAmount, maxAmount, dateFrom, dateTo]);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (opts?.quiet) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const res = await manualPaymentsApi.list(params);
        setItems(res.items);
        setSummary(res.summary);
        setTotal(res.total);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [params],
  );

  useEffect(() => { void load(); }, [load]);

  // Reset page when filters change (but not when page itself changes)
  useEffect(() => { setPage(0); }, [
    order, selectedStatuses, search, classFilter, minAmount, maxAmount, dateFrom, dateTo,
  ]);

  const toggleStatus = (s: ManualPaymentStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((p) => p !== s) : [...prev, s],
    );
  };

  const onRowSelect = async (req: ManualPaymentRequest) => {
    // Fetch the fresh copy so we get the latest audit trail and mark ADMIN_VIEWED.
    try {
      const fresh = await manualPaymentsApi.get(req.id);
      setSelectedRequest(fresh);
      // Optimistically reflect first_viewed_at update in the table.
      setItems((rows) => rows.map((r) => (r.id === fresh.id ? fresh : r)));
    } catch {
      setSelectedRequest(req);
    }
  };

  const onUpdated = (updated: ManualPaymentRequest) => {
    setItems((rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRequest(updated);
    // Pull a fresh summary in the background; the filter universe may have shifted.
    void load({ quiet: true });
  };

  if (isLoading && items.length === 0 && activeTab === 'queue') {
    return (
      <div className="space-y-8 p-4 sm:p-6">
        <SkeletonHeader />
        <SkeletonStatGrid count={4} />
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  const hasNextPage = page * PAGE_SIZE + items.length < total;
  const hasPrevPage = page > 0;

  return (
    <div className="space-y-6 sm:space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-emerald-600 text-[10px] font-black uppercase tracking-[0.3em] bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" /> New · Manual Verification Queue
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">
            Manual <span className="text-emerald-500 italic">Payments</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Review parent-submitted UPI / bank transfers and confirm them against
            the school's actual account. Approving here updates the student's
            ledger and issues a receipt.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-900/5 dark:bg-white/[0.04] text-[10px] font-black uppercase tracking-widest">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors',
                activeTab === 'queue'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Verification Queue
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors',
                activeTab === 'settings'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              School Settings
            </button>
          </div>
          {activeTab === 'queue' && (
            <>
              <button
                type="button"
                onClick={() => void load({ quiet: true })}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 dark:border-white/10 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
              >
                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
              <div className="ml-auto inline-flex items-center gap-1 p-1 rounded-2xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest">
                <button
                  type="button"
                  onClick={() => setOrder('asc')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl transition-colors',
                    order === 'asc' ? 'bg-primary text-primary-foreground' : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  Oldest first
                </button>
                <button
                  type="button"
                  onClick={() => setOrder('desc')}
                  className={cn(
                    'px-3 py-1.5 rounded-xl transition-colors',
                    order === 'desc' ? 'bg-primary text-primary-foreground' : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  Newest first
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {activeTab === 'settings' && <SchoolPaymentSettingsForm />}

      {activeTab === 'queue' && (
        <>
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          tone="amber"
          label="Pending Verification"
          value={String(summary.pending_verification)}
          sub="awaiting your review"
        />
        <SummaryCard
          icon={<MailWarning className="w-4 h-4" />}
          tone="indigo"
          label="Need More Info"
          value={String(summary.need_verification)}
          sub="paused for clarification"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
          label="Approved"
          value={String(summary.approved + summary.partial)}
          sub={formatINR(summary.total_approved_amount)}
        />
        <SummaryCard
          icon={<XCircle className="w-4 h-4" />}
          tone="rose"
          label="Rejected / Failed"
          value={String(summary.rejected + summary.failed)}
          sub="closed without payment"
        />
      </div>

      {/* Search + status pills + advanced filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm font-bold focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-widest transition-colors',
              showAdvanced
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white',
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {MANUAL_PAYMENT_STATUSES.map((s) => {
            const active = selectedStatuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  'px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all',
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white',
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
          {selectedStatuses.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStatuses([])}
              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10"
            >
              Clear
            </button>
          )}
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
                <FilterField label="Class contains">
                  <input
                    type="text"
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    placeholder="e.g. 10-A"
                    className="filter-input"
                  />
                </FilterField>
                <FilterField label="Min amount (₹)">
                  <input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0"
                    className="filter-input"
                  />
                </FilterField>
                <FilterField label="Max amount (₹)">
                  <input
                    type="number"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="∞"
                    className="filter-input"
                  />
                </FilterField>
                <FilterField label="From date">
                  <DatePicker
                    value={dateFrom}
                    max={dateTo || undefined}
                    placeholder="From date"
                    onChange={(v) => setDateFrom(v)}
                    className="filter-input"
                  />
                </FilterField>
                <FilterField label="To date">
                  <DatePicker
                    value={dateTo}
                    min={dateFrom || undefined}
                    placeholder="To date"
                    onChange={(v) => setDateTo(v)}
                    className="filter-input"
                  />
                </FilterField>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-md overflow-hidden">
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200/60 dark:border-white/5 bg-slate-50/70 dark:bg-white/[0.02]">
                  {['#', 'Student', 'Class', 'Amount', 'UTR / Txn', 'Submitted', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 sm:px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onRowSelect(r)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      r.first_viewed_at
                        ? 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                        : 'bg-amber-500/5 hover:bg-amber-500/10',
                    )}
                  >
                    <td className="px-4 sm:px-5 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                      #{r.id}
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{r.student_name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.parent_name}</p>
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                      {r.class_name || '—'}
                      {r.section_name && <span className="opacity-60"> · {r.section_name}</span>}
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        {formatINR(r.approved_amount ?? r.amount)}
                      </p>
                      {r.approved_amount != null && r.approved_amount !== r.amount && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-through">
                          {formatINR(r.amount)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <p className="text-xs font-mono text-slate-900 dark:text-white truncate max-w-[10rem]">
                        {r.transaction_reference}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(r.transaction_at)}</p>
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(r.submitted_at)}
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!r.first_viewed_at && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                            new
                          </span>
                        )}
                        {(r.status === 'APPROVED' || r.status === 'PARTIAL_PAYMENT') && (
                          <a
                            href={manualPaymentsApi.receiptUrl(r.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10"
                            aria-label="Download receipt"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {items.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-200/60 dark:border-white/5 flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length} of {total}
            </p>
            <div className="ml-auto inline-flex items-center gap-2">
              <button
                type="button"
                disabled={!hasPrevPage}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

        </>
      )}

      <AnimatePresence>
        {selectedRequest && (
          <AdminReviewDrawer
            request={selectedRequest}
            onClose={() => setSelectedRequest(null)}
            onUpdated={onUpdated}
          />
        )}
      </AnimatePresence>

      <style>{`
        .filter-input {
          width: 100%;
          padding: 0.6rem 0.85rem;
          border-radius: 1rem;
          border: 1.5px solid rgb(226 232 240 / 0.7);
          background: white;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--foreground, #0f172a);
        }
        .dark .filter-input {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.1);
          color: #f1f5f9;
        }
        .filter-input:focus { outline: none; border-color: rgb(99 102 241); }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'amber' | 'indigo' | 'emerald' | 'rose';
}

function SummaryCard({ icon, label, value, sub, tone }: SummaryCardProps) {
  const tones = {
    amber: 'bg-amber-500/10 text-amber-600',
    indigo: 'bg-indigo-500/10 text-indigo-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    rose: 'bg-rose-500/10 text-rose-600',
  }[tone];
  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-md p-4 sm:p-5">
      <div className={cn('h-9 w-9 rounded-2xl flex items-center justify-center mb-3', tones)}>
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-0.5">
        {label}
      </p>
      <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
      {sub && (
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1 truncate">
          {sub}
        </p>
      )}
    </div>
  );
}

interface FilterFieldProps {
  label: string;
  children: React.ReactNode;
}

function FilterField({ label, children }: FilterFieldProps) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center space-y-3">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
        <ShieldCheck className="w-6 h-6" />
      </div>
      <p className="text-sm font-black text-slate-900 dark:text-white">Nothing to review right now.</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        Parent submissions will appear here ordered oldest first. Adjust filters above
        to surface approved, rejected, or older submissions.
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
        <AlertTriangle className="w-3 h-3 opacity-60" />
        Tip: keep "Pending Verification" + "Need Verification" pinned for your queue.
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
        <Coins className="w-3 h-3 opacity-60" />
        Approvals flow into student fee ledgers automatically.
      </p>
    </div>
  );
}
