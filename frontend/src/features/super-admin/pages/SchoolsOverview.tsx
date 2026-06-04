import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, GraduationCap, Search, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown, X, Eye, Power, Mail, Hash,
  CalendarDays, School, Activity, Layers, Shield, Loader2,
} from 'lucide-react';
import {
  superAdminApi,
  type SchoolOverviewRow,
  type SchoolsOverviewSummary,
  type SchoolDetailResponse,
  type SchoolStatusFilter,
  type SchoolSortBy,
  type SortDir,
} from '@/features/super-admin/api';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/utils';

// Brand surface tokens shared with the dashboard / credentials pages so the
// whole super-admin portal reads as one product. Keep these mirrored if any
// of the sibling pages change.
const surface = {
  card: 'bg-white/80 dark:bg-slate-900/50 backdrop-blur-2xl border border-cyan-900/[0.07] dark:border-white/10 shadow-[0_10px_40px_-15px_rgba(8,47,73,0.18)] dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]',
  inset: 'bg-cyan-50/40 dark:bg-slate-950/40 border border-cyan-900/[0.07] dark:border-white/10',
  ribbon: 'bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-transparent dark:from-cyan-500/15 dark:via-sky-500/10',
};

const textTone = {
  heading: 'text-slate-900 dark:text-white',
  body: 'text-slate-600 dark:text-slate-300',
  muted: 'text-slate-500 dark:text-slate-400',
  faint: 'text-slate-400 dark:text-slate-500',
  brand: 'text-cyan-700 dark:text-cyan-400',
  brandSoft: 'text-cyan-600/80 dark:text-cyan-500/80',
};

const input =
  'w-full bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-2.5 outline-none ' +
  'focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:ring-cyan-500/20 ' +
  'transition-all text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-600';

const PAGE_SIZE = 10;

// Date-only formatter using local components (no toISOString — it would shift
// the day in non-UTC zones).
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

const STATUS_FILTERS: { value: SchoolStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

interface SummaryCard {
  label: string;
  value: number;
  icon: typeof Building2;
  tint: string;
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold',
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function SchoolsOverview() {
  const [rows, setRows] = useState<SchoolOverviewRow[]>([]);
  const [summary, setSummary] = useState<SchoolsOverviewSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters / paging / sorting (server-side).
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<SchoolStatusFilter>('all');
  const [sortBy, setSortBy] = useState<SchoolSortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0); // zero-based

  // Detail drawer.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SchoolDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter / sort change should send the user back to the first page.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status, sortBy, sortDir]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await superAdminApi.getSchoolsOverview({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        status,
        sortBy,
        sortDir,
      });
      setRows(res.items);
      setSummary(res.summary);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load schools overview:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, status, sortBy, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = useCallback(async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await superAdminApi.getSchoolDetail(id));
    } catch (err) {
      console.error('Failed to load school detail:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetail(null);
  }, []);

  const toggleSort = useCallback((col: SchoolSortBy) => {
    setSortBy((prevCol) => {
      if (prevCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevCol;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { label: 'Total Schools', value: summary?.total_schools ?? 0, icon: Building2, tint: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10' },
      { label: 'Total Students', value: summary?.total_students ?? 0, icon: GraduationCap, tint: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' },
      { label: 'Total Teachers', value: summary?.total_teachers ?? 0, icon: Users, tint: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
      { label: 'Active Schools', value: summary?.active_schools ?? 0, icon: Activity, tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
      { label: 'Inactive Schools', value: summary?.inactive_schools ?? 0, icon: Power, tint: 'text-slate-500 dark:text-slate-400 bg-slate-500/10' },
    ],
    [summary],
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* --- Header --- */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('relative rounded-3xl overflow-hidden p-6 sm:p-8', surface.card)}
      >
        <div className={cn('absolute inset-0 opacity-80', surface.ribbon)} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 mb-3">
            <School className={cn('h-3.5 w-3.5', textTone.brand)} />
            <span className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', textTone.brand)}>
              Platform Overview
            </span>
          </div>
          <h1 className={cn('text-3xl sm:text-4xl font-black tracking-tight', textTone.heading)}>
            Schools Overview
          </h1>
          <p className={cn('mt-2 text-sm max-w-2xl', textTone.body)}>
            A centralized view of every school on the platform, with live student and teacher counts.
          </p>
        </div>
      </motion.div>

      {/* --- Summary cards --- */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {summaryCards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            className={cn('rounded-2xl p-4 sm:p-5', surface.card)}
          >
            <div className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3', c.tint)}>
              <c.icon className="h-5 w-5" />
            </div>
            {isLoading && !summary ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className={cn('text-2xl sm:text-3xl font-black tabular-nums', textTone.heading)}>
                {c.value.toLocaleString()}
              </div>
            )}
            <div className={cn('mt-1 text-[11px] font-bold uppercase tracking-wider', textTone.muted)}>
              {c.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* --- Toolbar: search + status filter --- */}
      <div className={cn('rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between', surface.card)}>
        <div className="relative flex-1 max-w-md">
          <Search className={cn('absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4', textTone.faint)} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className={cn(input, 'pl-10')}
            aria-label="Search schools by name"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className={cn('absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-slate-500/10', textTone.faint)}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={cn('inline-flex rounded-xl p-1 self-start sm:self-auto', surface.inset)}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all',
                status === f.value
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : cn('hover:bg-slate-500/10', textTone.muted),
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- Data grid (desktop / tablet) --- */}
      <div className={cn('hidden md:block rounded-2xl overflow-hidden', surface.card)}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={cn('border-b border-cyan-900/[0.06] dark:border-white/5', surface.ribbon)}>
                <SortableTh label="School" col="name" {...{ sortBy, sortDir, toggleSort }} />
                <SortableTh label="Code" col="code" {...{ sortBy, sortDir, toggleSort }} />
                <Th label="Principal / Admin" />
                <SortableTh label="Students" col="total_students" align="right" {...{ sortBy, sortDir, toggleSort }} />
                <SortableTh label="Teachers" col="total_teachers" align="right" {...{ sortBy, sortDir, toggleSort }} />
                <SortableTh label="Status" col="status" {...{ sortBy, sortDir, toggleSort }} />
                <SortableTh label="Created" col="created_at" {...{ sortBy, sortDir, toggleSort }} />
                <Th label="Actions" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-900/[0.05] dark:divide-white/5">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, c) => (
                      <td key={c} className="px-5 py-4">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Building2 className={cn('h-10 w-10 mx-auto mb-3', textTone.faint)} />
                    <p className={cn('text-sm font-semibold', textTone.heading)}>No schools found</p>
                    <p className={cn('text-xs mt-1.5', textTone.muted)}>
                      Try adjusting your search or status filter.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="group hover:bg-cyan-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', surface.inset)}>
                          <Building2 className={cn('h-4 w-4', textTone.brand)} />
                        </div>
                        <span className={cn('font-semibold truncate', textTone.heading)}>{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {s.code ? (
                        <span className={cn('inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-md', surface.inset, textTone.body)}>
                          <Hash className="h-3 w-3 opacity-60" />{s.code}
                        </span>
                      ) : (
                        <span className={textTone.faint}>—</span>
                      )}
                    </td>
                    <td className={cn('px-5 py-3.5 text-sm', textTone.body)}>
                      {s.principal_name || <span className={textTone.faint}>Unassigned</span>}
                    </td>
                    <td className={cn('px-5 py-3.5 text-right tabular-nums font-semibold', textTone.heading)}>
                      {s.total_students.toLocaleString()}
                    </td>
                    <td className={cn('px-5 py-3.5 text-right tabular-nums font-semibold', textTone.heading)}>
                      {s.total_teachers.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5"><StatusPill active={s.is_active} /></td>
                    <td className={cn('px-5 py-3.5 text-sm whitespace-nowrap', textTone.muted)}>
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => openDetail(s.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                          'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20',
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" /> View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        />
      </div>

      {/* --- Mobile card list --- */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={cn('rounded-2xl p-4', surface.card)}>
              <Skeleton className="h-5 w-2/3 mb-3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className={cn('rounded-2xl p-10 text-center', surface.card)}>
            <Building2 className={cn('h-10 w-10 mx-auto mb-3', textTone.faint)} />
            <p className={cn('text-sm font-semibold', textTone.heading)}>No schools found</p>
          </div>
        ) : (
          rows.map((s) => (
            <div key={s.id} className={cn('rounded-2xl p-4', surface.card)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn('font-bold truncate', textTone.heading)}>{s.name}</div>
                  <div className={cn('text-xs mt-0.5 flex items-center gap-1.5', textTone.muted)}>
                    {s.code && <span className="font-mono inline-flex items-center gap-0.5"><Hash className="h-3 w-3" />{s.code}</span>}
                    <span className="truncate">{s.principal_name || 'Unassigned'}</span>
                  </div>
                </div>
                <StatusPill active={s.is_active} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <MiniStat icon={GraduationCap} label="Students" value={s.total_students} />
                <MiniStat icon={Users} label="Teachers" value={s.total_teachers} />
                <MiniStat icon={CalendarDays} label="Created" value={formatDate(s.created_at)} />
              </div>
              <button
                onClick={() => openDetail(s.id)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20 transition-all"
              >
                <Eye className="h-3.5 w-3.5" /> View Details
              </button>
            </div>
          ))
        )}
        {!isLoading && rows.length > 0 && (
          <div className={cn('rounded-2xl', surface.card)}>
            <PaginationBar
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              total={total}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            />
          </div>
        )}
      </div>

      {/* --- Detail drawer --- */}
      <SchoolDetailDrawer
        open={detailId !== null}
        loading={detailLoading}
        detail={detail}
        onClose={closeDetail}
      />
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

interface ThProps {
  label: string;
  align?: 'left' | 'right';
}
function Th({ label, align = 'left' }: ThProps) {
  return (
    <th
      className={cn(
        'px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.2em]',
        textTone.muted,
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {label}
    </th>
  );
}

interface SortableThProps extends ThProps {
  col: SchoolSortBy;
  sortBy: SchoolSortBy;
  sortDir: SortDir;
  toggleSort: (c: SchoolSortBy) => void;
}
function SortableTh({ label, col, sortBy, sortDir, toggleSort, align = 'left' }: SortableThProps) {
  const active = sortBy === col;
  return (
    <th
      className={cn(
        'px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.2em] select-none',
        textTone.muted,
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        onClick={() => toggleSort(col)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors',
          active && textTone.brand,
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string }) {
  return (
    <div className={cn('rounded-lg px-2 py-1.5 text-center', surface.inset)}>
      <Icon className={cn('h-3.5 w-3.5 mx-auto mb-0.5', textTone.brand)} />
      <div className={cn('text-sm font-bold tabular-nums', textTone.heading)}>{value}</div>
      <div className={cn('text-[9px] font-bold uppercase tracking-wider', textTone.faint)}>{label}</div>
    </div>
  );
}

interface PaginationBarProps {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}
function PaginationBar({ rangeStart, rangeEnd, total, page, totalPages, onPrev, onNext }: PaginationBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-cyan-900/[0.06] dark:border-white/5">
      <span className={cn('text-xs', textTone.muted)}>
        {total === 0 ? 'No results' : (
          <>Showing <span className="font-bold">{rangeStart}–{rangeEnd}</span> of <span className="font-bold">{total}</span></>
        )}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page === 0}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            'border border-cyan-900/[0.08] dark:border-white/10',
            page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-cyan-500/10',
            textTone.body,
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className={cn('text-xs font-bold tabular-nums', textTone.muted)}>
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className={cn(
            'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            'border border-cyan-900/[0.08] dark:border-white/10',
            page >= totalPages - 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-cyan-500/10',
            textTone.body,
          )}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  loading: boolean;
  detail: SchoolDetailResponse | null;
  onClose: () => void;
}
function SchoolDetailDrawer({ open, loading, detail, onClose }: DrawerProps) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 z-50 h-full w-full sm:w-[440px] overflow-y-auto',
              'bg-white dark:bg-slate-900 border-l border-cyan-900/[0.08] dark:border-white/10 shadow-2xl',
            )}
            role="dialog"
            aria-label="School details"
          >
            <div className={cn('sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-cyan-900/[0.08] dark:border-white/10 backdrop-blur-xl', surface.ribbon)}>
              <div className="flex items-center gap-2">
                <School className={cn('h-4 w-4', textTone.brand)} />
                <span className={cn('text-sm font-black uppercase tracking-wider', textTone.heading)}>School Details</span>
              </div>
              <button onClick={onClose} className={cn('p-1.5 rounded-lg hover:bg-slate-500/10', textTone.muted)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading || !detail ? (
              <div className="p-6 flex flex-col items-center justify-center gap-3 mt-20">
                <Loader2 className={cn('h-7 w-7 animate-spin', textTone.brand)} />
                <span className={cn('text-sm', textTone.muted)}>Loading school profile…</span>
              </div>
            ) : (
              <div className="p-5 sm:p-6 space-y-6">
                {/* Identity */}
                <div className="flex items-center gap-4">
                  <div className={cn('h-16 w-16 rounded-2xl flex items-center justify-center overflow-hidden shrink-0', surface.inset)}>
                    {detail.logo_url ? (
                      <img src={detail.logo_url} alt={detail.name} className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className={cn('h-7 w-7', textTone.brand)} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className={cn('text-xl font-black tracking-tight truncate', textTone.heading)}>{detail.name}</h2>
                    <div className="mt-1.5 flex items-center gap-2">
                      <StatusPill active={detail.is_active} />
                      {detail.code && (
                        <span className={cn('inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-md', surface.inset, textTone.body)}>
                          <Hash className="h-3 w-3 opacity-60" />{detail.code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={cn('rounded-xl p-4', surface.inset)}>
                    <GraduationCap className={cn('h-5 w-5 mb-2', textTone.brand)} />
                    <div className={cn('text-2xl font-black tabular-nums', textTone.heading)}>{detail.total_students.toLocaleString()}</div>
                    <div className={cn('text-[11px] font-bold uppercase tracking-wider', textTone.muted)}>Students</div>
                  </div>
                  <div className={cn('rounded-xl p-4', surface.inset)}>
                    <Users className={cn('h-5 w-5 mb-2', textTone.brand)} />
                    <div className={cn('text-2xl font-black tabular-nums', textTone.heading)}>{detail.total_teachers.toLocaleString()}</div>
                    <div className={cn('text-[11px] font-bold uppercase tracking-wider', textTone.muted)}>Teachers</div>
                  </div>
                </div>

                {/* Meta */}
                <div className="space-y-3">
                  <DetailRow icon={Layers} label="School Code" value={detail.code || '—'} />
                  <DetailRow icon={CalendarDays} label="Created" value={formatDate(detail.created_at)} />
                  <DetailRow icon={Activity} label="Status" value={detail.is_active ? 'Active' : 'Inactive'} />
                </div>

                {/* Admins */}
                <div>
                  <div className={cn('flex items-center gap-2 mb-2.5 text-[11px] font-bold uppercase tracking-wider', textTone.muted)}>
                    <Shield className="h-3.5 w-3.5" /> School Administrators
                  </div>
                  {detail.admins.length === 0 ? (
                    <div className={cn('rounded-xl p-4 text-sm text-center', surface.inset, textTone.muted)}>
                      No administrators assigned yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detail.admins.map((a) => (
                        <div key={a.id} className={cn('rounded-xl p-3 flex items-center gap-3', surface.inset)}>
                          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center text-sm font-black shrink-0 bg-cyan-500/10', textTone.brand)}>
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={cn('font-semibold text-sm truncate', textTone.heading)}>{a.name}</div>
                            {a.email && (
                              <div className={cn('text-xs flex items-center gap-1 truncate', textTone.muted)}>
                                <Mail className="h-3 w-3" /> {a.email}
                              </div>
                            )}
                          </div>
                          <StatusPill active={a.is_active} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('inline-flex items-center gap-2 text-sm', textTone.muted)}>
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className={cn('text-sm font-semibold', textTone.heading)}>{value}</span>
    </div>
  );
}
