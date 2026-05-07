import { useState, useEffect } from 'react';
import { Plus, AlertCircle, CheckCircle2, X, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FinanceSummaryResponse, PaymentDetails, DefaulterResponse, ClassFinanceBreakdownResponse } from '../../api/financeApi';
import { financeApi } from '../../api/financeApi';
import { cn } from '../../lib/utils';
import { useApp } from '../../lib/AppContext';
import ClassesOverview from '../../components/finance/ClassesOverview';
import PaymentLedger from '../../components/finance/PaymentLedger';
import DefaultersTable from '../../components/finance/DefaultersTable';
import ManualPaymentModal from '../../components/finance/ManualPaymentModal';

export default function FinanceDashboard() {
  const { grades, schoolClasses } = useApp();
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [payments, setPayments] = useState<PaymentDetails[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterResponse[]>([]);
  const [classBreakdown, setClassBreakdown] = useState<ClassFinanceBreakdownResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'classes' | 'ledger' | 'defaulters'>('classes');
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
      const [sumData, payData, defData, cbData] = await Promise.all([
        financeApi.getSummary(),
        financeApi.getAllPayments({ limit: 50 }),
        financeApi.getDefaulters(),
        financeApi.getClassBreakdown()
      ]);
      setSummary(sumData);
      setPayments(payData?.items || []);
      setDefaulters(defData);
      setClassBreakdown(cbData);
    } catch (err: any) {
      console.error("Dashboard Data Fetch Error:", err);
      setLoadError(err?.message || 'Failed to load financial data. Please refresh.');
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
    } catch (err: any) {
      setSyncResult(`Error: ${err.message || 'Sync failed'}`);
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
      <div className="h-full flex flex-col items-center justify-center pt-32 p-4 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-black text-foreground">Syncing Financial Ledger</h2>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      {/* Header & Tabs */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="space-y-2">
          <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] bg-primary/10 px-4 py-2 rounded-full w-fit">
            Institutional Terminal Active
          </p>
          <h1 className="text-6xl font-black tracking-tighter text-foreground leading-none">
            Finance <span className="text-primary italic">Command</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-slate-900/50 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl">
          {(['classes', 'ledger', 'defaulters'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                activeTab === tab
                  ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
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
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
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
            <PaymentLedger payments={payments} />
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
