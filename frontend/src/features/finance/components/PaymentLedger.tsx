import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Download, Calendar, Loader2, RefreshCw, FileText, FileSpreadsheet,
  CheckCircle2, AlertCircle, Clock, RotateCcw, X, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/shared/lib/utils';
import { financeApi } from '@/features/finance/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import DatePicker from '@/shared/components/ui/DatePicker';
import type {
  LedgerEntry, LedgerListParams, LedgerSummary, LedgerFilterOptions,
} from '@/features/finance/api';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

const toDateInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  // Always pick the local Y-M-D — toISOString would drift across timezones,
  // see auto-memory feedback_date_formatting.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const todayStr = () => toDateInput(new Date().toISOString());

const firstOfMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Canonical status → badge palette mapping. Unknown statuses fall back to
// a neutral slate badge so the UI degrades cleanly.
const statusStyles: Record<string, string> = {
  SUCCESS: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  FAILED: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  PENDING: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  REFUNDED: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PARTIALLY_REFUNDED: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  CANCELLED: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const FALLBACK_STATUS_OPTIONS: string[] = [
  'SUCCESS', 'PENDING', 'FAILED', 'CANCELLED',
  'REFUNDED', 'PARTIALLY_REFUNDED',
];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount (high → low)' },
  { value: 'amount_asc', label: 'Amount (low → high)' },
] as const;
type SortValue = typeof SORT_OPTIONS[number]['value'];

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase());

const fmtINR = (n: number) =>
  `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Drop keys whose value is "", null, or undefined. Generic so the caller's
// type flows through to the return value as Partial<T>. Constraint is just
// `object` so interfaces (which lack an implicit index signature) are accepted
// alongside Record-like types.
const stripEmpty = <T extends object>(obj: T): Partial<T> => {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    const v = obj[k];
    if (v === '' || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
};

export default function PaymentLedger() {
  const [filters, setFilters] = useState<LedgerListParams>({
    date_from: firstOfMonthStr(),
    date_to: todayStr(),
    payment_status: '',
    payment_method: '',
    fee_type: '',
    academic_year: '',
    class_id: undefined,
    search: '',
    skip: 0,
    limit: DEFAULT_PAGE_SIZE,
  });

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<LedgerFilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Client-side ordering on top of the backend's date-desc default.
  const [sortBy, setSortBy] = useState<SortValue>('date_desc');

  const facetsLoadedRef = useRef(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFacets = async () => {
    try {
      const f = await financeApi.getLedgerFilters();
      setFacets(f);
      facetsLoadedRef.current = true;

      // If real data exists outside the default month window, widen the
      // initial date range so the user sees something on first load.
      if (f.earliest_payment_date) {
        const earliestStr = toDateInput(f.earliest_payment_date);
        const latestStr = toDateInput(f.latest_payment_date) || todayStr();
        setFilters(prev => {
          if (prev.date_from && prev.date_from <= earliestStr) return prev;
          return { ...prev, date_from: earliestStr, date_to: latestStr };
        });
      }
    } catch (err) {
      // Non-fatal — falls back to month-to-date defaults and empty dropdowns
      console.warn('Failed to load ledger facets', err);
    }
  };

  const loadLedger = async (overrides: Partial<LedgerListParams> = {}) => {
    setError(null);
    setIsLoading(true);
    try {
      const params = stripEmpty<LedgerListParams>({ ...filters, ...overrides });
      const data = await financeApi.getLedger(params);
      setEntries(data.items);
      setSummary(data.summary);
      setTotal(data.total);
    } catch (err) {
      setError(getErrorMessage(err).message || 'Failed to load ledger.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await loadFacets();
      await loadLedger();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-apply dropdown filters (status/method/year/class/fee_type/dates) —
  // they're not free-text so debouncing is unnecessary.
  useEffect(() => {
    if (!facetsLoadedRef.current) return;
    loadLedger({ skip: 0 });
    setFilters(f => ({ ...f, skip: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.date_from, filters.date_to, filters.payment_status, filters.payment_method,
    filters.fee_type, filters.academic_year, filters.class_id, filters.limit,
  ]);

  // Debounced search — only fire after 350ms of no typing
  useEffect(() => {
    if (!facetsLoadedRef.current) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadLedger({ skip: 0 });
      setFilters(f => ({ ...f, skip: 0 }));
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const resetFilters = () => {
    const earliest = facets?.earliest_payment_date ? toDateInput(facets.earliest_payment_date) : firstOfMonthStr();
    const latest = facets?.latest_payment_date ? toDateInput(facets.latest_payment_date) : todayStr();
    const next: LedgerListParams = {
      date_from: earliest,
      date_to: latest,
      payment_status: '',
      payment_method: '',
      fee_type: '',
      academic_year: '',
      class_id: undefined,
      search: '',
      skip: 0,
      limit: filters.limit ?? DEFAULT_PAGE_SIZE,
    };
    setFilters(next);
  };

  const refresh = async () => {
    await loadFacets();
    await loadLedger();
  };

  const handleDownloadReceipt = async (entry: LedgerEntry) => {
    if (!entry.has_receipt) return;
    setDownloadingReceiptId(entry.id);
    try {
      const blob = await financeApi.downloadLedgerReceipt(entry.id);
      const filename = `${entry.receipt_number || `receipt-${entry.id}`}.pdf`;
      downloadBlob(blob, filename);
    } catch (err) {
      const detail = getErrorMessage(err).message || 'Failed to download receipt.';
      toast.error(detail);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    if (!filters.date_from || !filters.date_to) {
      setError('Pick a start and end date before exporting.');
      return;
    }
    setIsExporting(format);
    setError(null);
    try {
      // date_from / date_to are required at this point (we returned above
       // when either was empty), so the cast back to LedgerExportParams is
       // safe even though stripEmpty's return is Partial<T>.
      const blob = await financeApi.exportLedger(
        stripEmpty({
          date_from: filters.date_from,
          date_to: filters.date_to,
          format,
          payment_status: filters.payment_status,
          payment_method: filters.payment_method,
          fee_type: filters.fee_type,
          academic_year: filters.academic_year,
          student_id: filters.student_id,
          class_id: filters.class_id,
        }) as Parameters<typeof financeApi.exportLedger>[0],
      );
      const ext = format === 'excel' ? 'xlsx' : format;
      downloadBlob(blob, `finance-ledger_${filters.date_from}_${filters.date_to}.${ext}`);
    } catch (err) {
      setError(getErrorMessage(err).message || `Failed to export ${format}.`);
    } finally {
      setIsExporting(null);
    }
  };

  const summaryCards = useMemo(() => ([
    {
      label: 'Net Revenue',
      value: summary ? fmtINR(summary.net_revenue) : '—',
      icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10',
      hint: summary ? `Collected ${fmtINR(summary.total_collected)} − Refunded ${fmtINR(summary.total_refunded)}` : null,
    },
    {
      label: 'Pending',
      value: summary ? fmtINR(summary.total_pending) : '—',
      icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10',
      hint: null,
    },
    {
      label: 'Failed',
      value: summary ? fmtINR(summary.total_failed) : '—',
      icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10',
      hint: null,
    },
    {
      label: 'Cancelled',
      value: summary ? fmtINR(summary.total_cancelled ?? 0) : '—',
      icon: X, color: 'text-slate-500', bg: 'bg-slate-500/10',
      hint: null,
    },
    {
      label: 'Refunded',
      value: summary ? fmtINR(summary.total_refunded) : '—',
      icon: RotateCcw, color: 'text-blue-500', bg: 'bg-blue-500/10',
      hint: null,
    },
  ]), [summary]);

  // Client-side ordering — backend already returns date-desc; we re-sort
  // here so the user can flip without a round-trip.
  const sortedEntries = useMemo(() => {
    const arr = [...entries];
    switch (sortBy) {
      case 'date_asc':
        return arr.sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
      case 'amount_desc':
        return arr.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
      case 'amount_asc':
        return arr.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
      case 'date_desc':
      default:
        return arr.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
    }
  }, [entries, sortBy]);

  // Drive every dropdown from facets, with a fallback so the UI is usable
  // before facets arrive or when the ledger has no rows yet.
  const statusOptions = facets?.statuses?.length
    ? facets.statuses
    : FALLBACK_STATUS_OPTIONS;
  const methodOptions = facets?.methods?.length
    ? facets.methods
    : ['UPI', 'CASH', 'MANUAL_UPI'];
  const feeTypeOptions = facets?.fee_types ?? [];
  const yearOptions = facets?.academic_years ?? [];
  const classOptions = facets?.classes ?? [];

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.payment_status) n++;
    if (filters.payment_method) n++;
    if (filters.fee_type) n++;
    if (filters.academic_year) n++;
    if (filters.class_id) n++;
    if (filters.search) n++;
    return n;
  }, [filters]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {summaryCards.map((c, i) => (
          <div key={i} className="premium-glass p-6 rounded-2xl border border-white/10 shadow-lg">
            <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center mb-3', c.bg)}>
              <c.icon className={cn('w-4 h-4', c.color)} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{c.label}</p>
            <p className={cn('text-2xl font-black', c.color)}>{c.value}</p>
            {c.hint && (
              <p className="text-[9px] font-bold text-muted-foreground/70 mt-1 truncate" title={c.hint}>
                {c.hint}
              </p>
            )}
          </div>
        ))}
        <div className="lg:col-span-5 text-xs font-bold text-muted-foreground -mt-1 pl-1 flex items-center justify-between flex-wrap gap-2">
          <span>{summary ? `${summary.transaction_count} transactions in selected range` : ''}</span>
          {facets?.earliest_payment_date && (
            <span className="italic opacity-70">
              Ledger spans {toDateInput(facets.earliest_payment_date)} → {toDateInput(facets.latest_payment_date)}
            </span>
          )}
        </div>
      </div>

      {/* Filters + Export */}
      <div className="premium-glass p-4 sm:p-6 rounded-2xl border border-white/10 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> From
            </label>
            <DatePicker
              value={filters.date_from || ''}
              min={facets?.earliest_payment_date ? toDateInput(facets.earliest_payment_date) : undefined}
              max={filters.date_to || undefined}
              placeholder="From date"
              onChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> To
            </label>
            <DatePicker
              value={filters.date_to || ''}
              min={filters.date_from || undefined}
              max={todayStr()}
              placeholder="To date"
              onChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class</label>
            <select
              value={filters.class_id ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, class_id: e.target.value ? Number(e.target.value) : undefined }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All classes</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academic Year</label>
            <select
              value={filters.academic_year || ''}
              onChange={(e) => setFilters((f) => ({ ...f, academic_year: e.target.value }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</label>
            <select
              value={filters.payment_status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All status</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Method</label>
            <select
              value={filters.payment_method || ''}
              onChange={(e) => setFilters((f) => ({ ...f, payment_method: e.target.value }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All methods</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>{titleCase(m)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fee Type</label>
            <select
              value={filters.fee_type || ''}
              onChange={(e) => setFilters((f) => ({ ...f, fee_type: e.target.value }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              disabled={feeTypeOptions.length === 0}
            >
              <option value="">All types</option>
              {feeTypeOptions.map((ft) => (
                <option key={ft} value={ft}>{titleCase(ft)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3 h-3" /> Search
            </label>
            <input
              type="text"
              placeholder="Name, receipt #, UTR..."
              value={filters.search || ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="px-3 py-2 bg-slate-900/40 rounded-lg border border-white/10 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-black uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700/40 text-foreground rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-700/60 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Clear ({activeFilterCount})
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/30 rounded-lg border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:inline">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortValue)}
              className="bg-transparent text-xs font-bold text-foreground outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/30 rounded-lg border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:inline">Per page</span>
            <select
              value={filters.limit ?? DEFAULT_PAGE_SIZE}
              onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), skip: 0 }))}
              className="bg-transparent text-xs font-bold text-foreground outline-none cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Export buttons — pushed right, wrap on small screens */}
          <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:inline">Export</span>
            <button
              onClick={() => handleExport('excel')}
              disabled={isExporting !== null}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {isExporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting !== null}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-slate-700 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {isExporting === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={isExporting !== null}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {isExporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Ledger Table */}
      <div className="premium-glass overflow-hidden rounded-2xl border border-white/10 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/30">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Receipt #</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date &amp; Time</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Transaction&nbsp;ID</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Method</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Refund</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remarks</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {Array.from({ length: 11 }).map((__, c) => (
                      <td key={c} className="px-4 py-3">
                        <Skeleton rounded="md" className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!isLoading && sortedEntries.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-muted-foreground text-sm font-bold">
                  No transactions match the current filters.
                </td></tr>
              )}

              {!isLoading && sortedEntries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono font-bold text-foreground whitespace-nowrap">{e.receipt_number}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-semibold whitespace-nowrap">
                    {new Date(e.payment_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-black text-foreground">{e.student_name}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                      {e.admission_number || `ID ${e.student_id}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-muted-foreground">{e.class_name || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-[180px] truncate" title={e.transaction_id || ''}>
                    {e.transaction_id || <span className="opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase whitespace-nowrap">{e.payment_method}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-black text-primary">{fmtINR(e.amount)}</p>
                    {e.net_amount !== e.amount && (
                      <p className="text-[10px] font-bold text-muted-foreground">net {fmtINR(e.net_amount)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn(
                      'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border',
                      statusStyles[e.payment_status] || 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                    )}>
                      {titleCase(e.payment_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {e.refund_status ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={cn(
                          'px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border w-fit',
                          statusStyles[e.refund_status] || 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                        )}>
                          {titleCase(e.refund_status)}
                        </span>
                        {e.refunded_amount ? (
                          <span className="text-[10px] font-bold text-blue-600">{fmtINR(e.refunded_amount)}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[10px] opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    {e.error_message || e.notes ? (
                      <p className="text-xs text-muted-foreground italic truncate" title={e.error_message || e.notes || ''}>
                        {e.error_message || e.notes}
                      </p>
                    ) : (
                      <span className="text-[10px] opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {e.has_receipt ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(e)}
                        disabled={downloadingReceiptId === e.id}
                        title={e.manual_payment_request_id ? 'Download manual-payment receipt' : 'Download payment receipt'}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-colors"
                      >
                        {downloadingReceiptId === e.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Receipt className="w-3 h-3" />
                        )}
                        PDF
                      </button>
                    ) : (
                      <span className="text-[10px] opacity-40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > (filters.limit ?? DEFAULT_PAGE_SIZE) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-slate-900/20">
            <p className="text-xs font-bold text-muted-foreground">
              {(filters.skip || 0) + 1} – {Math.min((filters.skip || 0) + entries.length, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={(filters.skip || 0) <= 0 || isLoading}
                onClick={() => {
                  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
                  const next = Math.max(0, (filters.skip || 0) - limit);
                  setFilters((f) => ({ ...f, skip: next }));
                  loadLedger({ skip: next });
                }}
                className="px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-slate-700/40 rounded-md disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={(filters.skip || 0) + entries.length >= total || isLoading}
                onClick={() => {
                  const limit = filters.limit ?? DEFAULT_PAGE_SIZE;
                  const next = (filters.skip || 0) + limit;
                  setFilters((f) => ({ ...f, skip: next }));
                  loadLedger({ skip: next });
                }}
                className="px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-slate-700/40 rounded-md disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
