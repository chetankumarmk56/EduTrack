import { useState, useEffect } from 'react';
import { Plus, AlertCircle, CheckCircle2, X, Loader2, RefreshCw, History, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FinanceSummaryResponse, DefaulterResponse, ClassFinanceBreakdownResponse, ArrearsStudentResponse } from '@/features/finance/api';
import { financeApi } from '@/features/finance/api';
import { SkeletonHeader, SkeletonStatGrid, SkeletonTable } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/utils';
import { useApp } from '@/shared/contexts/AppContext';
import ClassesOverview from '@/features/finance/components/ClassesOverview';
import PaymentLedger from '@/features/finance/components/PaymentLedger';
import DefaultersTable from '@/features/finance/components/DefaultersTable';
import ManualPaymentModal from '@/features/finance/components/ManualPaymentModal';
import FeeRemindersPanel from '@/features/finance/components/FeeRemindersPanel';

export default function FinanceDashboard() {
  const { grades, schoolClasses } = useApp();
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [defaulters, setDefaulters] = useState<DefaulterResponse[]>([]);
  const [arrears, setArrears] = useState<ArrearsStudentResponse[]>([]);
  const [showArrears, setShowArrears] = useState(false);
  const [classBreakdown, setClassBreakdown] = useState<ClassFinanceBreakdownResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'classes' | 'ledger' | 'defaulters' | 'reminders'>('classes');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualStudentId, setManualStudentId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoadError(null);
    try {
      setIsLoading(true);
      const [sumData, defData, cbData, arrData] = await Promise.all([
        financeApi.getSummary(),
        financeApi.getDefaulters(),
        financeApi.getClassBreakdown(),
        financeApi.getArrears().catch(() => [] as ArrearsStudentResponse[]),
      ]);
      setSummary(sumData);
      setDefaulters(defData);
      setClassBreakdown(cbData);
      setArrears(arrData);
    } catch (err) {
      console.error("Dashboard Data Fetch Error:", err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load financial data. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackfill = async () => {
    if (!confirm('This will sync fee records for ALL active students based on their current class fees. Continue?')) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await financeApi.backfillFees();
      setSyncResult(result.message);
      loadAllData();
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : 'Sync failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const openManualModal = (studentId = '') => {
    setManualStudentId(studentId);
    setIsManualModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-8 p-4 sm:p-6">
        <SkeletonHeader />
        <SkeletonStatGrid count={4} />
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-10 pb-20">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="space-y-2">
          <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-primary/10 px-4 py-2 rounded-full w-fit">
            Institutional Terminal Active
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-foreground leading-none">
            Finance <span className="text-primary italic">Command</span>
          </h1>
        </div>

        {/* Carried-forward arrears: students promoted while still owing a
            previous year's fee. Informational — never blocks anything. */}
        {arrears.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowArrears((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left"
            >
              <span className="flex items-center gap-3 min-w-0">
                <History className="w-5 h-5 text-amber-600 shrink-0" />
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  {arrears.length} student{arrears.length === 1 ? '' : 's'} carrying{' '}
                  ₹{arrears.reduce((s, a) => s + (a.previous_year_due || 0), 0).toLocaleString('en-IN')}{' '}
                  in previous-year arrears
                </span>
              </span>
              <ChevronDown className={cn('w-4 h-4 text-amber-600 shrink-0 transition-transform', showArrears && 'rotate-180')} />
            </button>
            {showArrears && (
              <div className="px-2 sm:px-3 pb-3 space-y-2">
                {arrears.map((a) => (
                  <div key={a.student_id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 dark:bg-white/[0.03] px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {a.student_name}
                        {a.current_class_name && (
                          <span className="ml-2 text-[11px] font-medium text-muted-foreground">now in {a.current_class_name}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {a.admission_number ? `${a.admission_number} · ` : ''}
                        {a.arrears.map((x) => `${x.academic_year ?? '—'} (${x.class_name ?? '—'})`).join(', ')}
                        {a.phone ? ` · ${a.phone}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-black text-amber-600 shrink-0">
                      ₹{(a.previous_year_due || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab bar + action buttons — scrollable on small screens */}
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl w-max min-w-full sm:w-auto sm:min-w-0">
            {(['classes', 'ledger', 'defaulters', 'reminders'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 sm:px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 whitespace-nowrap',
                  activeTab === tab
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105'
                    : 'text-slate-400 hover:text-white hover:bg-white/5',
                )}
              >
                {tab}
              </button>
            ))}
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button
            onClick={handleBackfill}
            disabled={isSyncing}
            title="Sync fee records for all active students based on current class fees"
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-60"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Fees
          </button>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button
            onClick={() => openManualModal()}
            className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
          </div>
        </div>
      </div>

      {/* Load Error Banner */}
      {loadError && (
        <div className="p-4 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-600">
          <AlertCircle className="w-4 h-4" />
          {loadError}
          <button onClick={() => setLoadError(null)} className="ml-auto opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Sync Result Banner */}
      {syncResult && (
        <div className={cn(
          "p-4 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest border",
          syncResult.startsWith('Error')
            ? "bg-rose-500/10 border-rose-500/20 text-rose-600"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
        )}>
          {syncResult.startsWith('Error') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-auto opacity-40 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'classes' && (
          <motion.div key="classes" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ClassesOverview summary={summary} classBreakdown={classBreakdown} />
          </motion.div>
        )}

        {activeTab === 'ledger' && (
          <motion.div key="ledger" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <PaymentLedger />
          </motion.div>
        )}

        {activeTab === 'defaulters' && (
          <motion.div key="defaulters" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid lg:grid-cols-12 gap-10">
            <DefaultersTable
              defaulters={defaulters}
              onClearDues={(studentId) => openManualModal(String(studentId))}
              grades={grades}
              schoolClasses={schoolClasses}
            />
          </motion.div>
        )}

        {activeTab === 'reminders' && (
          <motion.div key="reminders" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <FeeRemindersPanel />
          </motion.div>
        )}
      </AnimatePresence>

      <ManualPaymentModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        initialStudentId={manualStudentId}
        onRecorded={loadAllData}
      />
    </div>
  );
}
