import { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Search, Filter, Plus, 
  ArrowUpRight, History, CheckCircle2, 
  AlertCircle, X, Loader2, ShieldCheck, RefreshCw,
  Phone, MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FinanceSummaryResponse, PaymentDetails, DefaulterResponse, ClassFinanceBreakdownResponse } from '../../api/financeApi';
import { financeApi } from '../../api/financeApi';
import { cn } from '../../lib/utils';
import { useApp } from '../../lib/AppContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';

export default function FinanceDashboard() {
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [payments, setPayments] = useState<PaymentDetails[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterResponse[]>([]);
  const [classBreakdown, setClassBreakdown] = useState<ClassFinanceBreakdownResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'classes' | 'ledger' | 'defaulters'>('classes');
  const { grades, schoolClasses } = useApp();
  const [filterGradeId, setFilterGradeId] = useState<number | null>(null);
  const [filterClassId, setFilterClassId] = useState<number | null>(null);
  const [ledgerMode, setLedgerMode] = useState<string>('ALL');
  const [ledgerStatus, setLedgerStatus] = useState<string>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Manual Payment Form State
  const [manualForm, setManualForm] = useState({
    student_id: '',
    amount: '',
    mode: 'CASH',
    note: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
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
    } catch (err) {
      console.error("Dashboard Data Fetch Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setFormStatus(null);
      await financeApi.recordManualPayment({
        student_id: Number(manualForm.student_id),
        amount: Number(manualForm.amount),
        mode: manualForm.mode,
        note: manualForm.note
      });
      setFormStatus({ type: 'success', message: 'Payment recorded and allocated successfully.' });
      setManualForm({ student_id: '', amount: '', mode: 'CASH', note: '' });
      loadAllData();
      setTimeout(() => setIsManualModalOpen(false), 2000);
    } catch (err: any) {
      setFormStatus({ type: 'error', message: err.message || 'Failed to record payment.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

  const handleBackfill = async () => {
    if (!confirm('This will sync fee records for ALL active students based on their current class fees. Continue?')) return;
    try {
      setIsSyncing(true);
      setSyncResult(null);
      const result = await financeApi.backfillFees();
      setSyncResult(result.message);
      loadAllData();
    } catch (err: any) {
      setSyncResult(`Error: ${err.message || 'Sync failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center pt-32 p-4 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-black text-foreground">Syncing Financial Ledger</h2>
      </div>
    );
  }
  const filteredPayments = (payments || []).filter(p => {
    const matchesSearch = !ledgerSearch || 
      p.id.toString().includes(ledgerSearch) ||
      p.student_id.toString().includes(ledgerSearch) ||
      (p as any).student_name?.toLowerCase().includes(ledgerSearch.toLowerCase());
    
    const matchesMode = ledgerMode === 'ALL' || p.payment_mode === ledgerMode;
    const matchesStatus = ledgerStatus === 'ALL' || p.status === ledgerStatus;
    
    return matchesSearch && matchesMode && matchesStatus;
  });

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
            onClick={() => {
              setManualForm({ student_id: '', amount: '', mode: 'CASH', note: '' });
              setFormStatus(null);
              setIsManualModalOpen(true);
            }}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </div>

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
          <motion.div key="classes" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            {/* Grand Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Classes with Fees', value: classBreakdown?.total_classes_with_fee ?? '—', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                { label: 'Total Collected', value: summary ? `₹${summary.total_collected.toLocaleString()}` : '—', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Total Expected', value: classBreakdown ? `₹${classBreakdown.grand_total_expected.toLocaleString()}` : '—', color: 'text-amber-500', bg: 'bg-amber-500/10' },
                { label: 'Total Pending', value: classBreakdown ? `₹${classBreakdown.grand_total_pending.toLocaleString()}` : '—', color: 'text-rose-500', bg: 'bg-rose-500/10' },
              ].map((s, i) => (
                <div key={i} className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl">
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center mb-4', s.bg)}>
                    <TrendingUp className={cn('w-5 h-5', s.color)} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{s.label}</p>
                  <p className={cn('text-3xl font-black', s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Per-class table */}
            <div className="premium-glass rounded-[3rem] overflow-hidden shadow-xl">
              <div className="p-8 border-b border-glass-border">
                <h3 className="text-2xl font-black text-foreground">Class-wise Fee Breakdown</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Live data — updates on every sync</p>
              </div>
              {(!classBreakdown || classBreakdown.rows.length === 0) ? (
                <div className="py-20 text-center text-muted-foreground font-bold">No class data found. Create classes and enroll students first.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-glass-border">
                        {['Class', 'Fee / Student', 'Students', 'Paid', 'Partial', 'Unpaid', 'No Record', 'Collected', 'Pending', 'Progress'].map(h => (
                          <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {classBreakdown.rows.map((row) => {
                        const pct = row.total_expected > 0 ? Math.round((row.total_collected / row.total_expected) * 100) : 0;
                        return (
                          <tr key={row.class_id} className="hover:bg-slate-50/20 transition-colors">
                            <td className="px-6 py-5 font-black text-foreground text-sm">{row.class_name}</td>
                            <td className="px-6 py-5 font-black text-primary text-sm">₹{row.fee_per_student.toLocaleString()}</td>
                            <td className="px-6 py-5 text-sm font-bold text-foreground">{row.total_students}</td>
                            <td className="px-6 py-5"><span className="px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{row.paid_count}</span></td>
                            <td className="px-6 py-5"><span className="px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 border border-amber-500/20">{row.partial_count}</span></td>
                            <td className="px-6 py-5"><span className="px-3 py-1 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-600 border border-rose-500/20">{row.unpaid_count}</span></td>
                            <td className="px-6 py-5"><span className="px-3 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-500 border border-slate-500/20">{row.no_record_count}</span></td>
                            <td className="px-6 py-5 font-black text-emerald-600 text-sm">₹{row.total_collected.toLocaleString()}</td>
                            <td className="px-6 py-5 font-black text-rose-500 text-sm">₹{row.total_pending.toLocaleString()}</td>
                            <td className="px-6 py-5 min-w-[140px]">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] font-black text-muted-foreground w-8">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}


        {activeTab === 'ledger' && (
          <motion.div
            key="ledger"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="premium-glass overflow-hidden rounded-[3rem] shadow-2xl border-white"
          >
            <div className="p-8 border-b border-glass-border flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search interactions..." 
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-900/40 rounded-2xl border border-white/10 font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground"
                />
              </div>
              <div className="flex items-center gap-4 overflow-x-auto w-full md:w-auto">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 border border-white/10">
                  <Filter className="w-3.5 h-3.5 text-primary" />
                  <select 
                    value={ledgerMode}
                    onChange={(e) => setLedgerMode(e.target.value)}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-400 outline-none cursor-pointer hover:text-white transition-colors"
                  >
                    <option value="ALL">All Modes</option>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="UPI">UPI</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 border border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <select 
                    value={ledgerStatus}
                    onChange={(e) => setLedgerStatus(e.target.value)}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-400 outline-none cursor-pointer hover:text-white transition-colors"
                  >
                    <option value="ALL">All Status</option>
                    <option value="SUCCESS">Success</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-glass-border bg-slate-50/50">
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Log Pointer</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entity ID</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantum</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Medium</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Temporal Data</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                            {p.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-foreground">{(p as any).student_name || `Scholar #${p.student_id}`}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">ID: {p.student_id}</p>
                      </td>
                      <td className="px-8 py-6 text-sm font-black text-primary">₹{p.amount.toLocaleString()}</td>
                      <td className="px-8 py-6 text-xs font-black uppercase tracking-widest text-muted-foreground">{p.payment_mode}</td>
                      <td className="px-8 py-6 text-xs font-bold text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                      <td className="px-8 py-6">
                        <span className={cn(
                          "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm",
                          p.status === 'SUCCESS' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                        )}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'defaulters' && (
          <motion.div
            key="defaulters"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid lg:grid-cols-12 gap-10"
          >
            <div className="lg:col-span-12 premium-glass p-0 rounded-[3rem] shadow-xl overflow-hidden min-h-[500px]">
              <div className="p-10 border-b border-glass-border flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="text-3xl font-black text-foreground tracking-tighter mb-2">Defaulter Roster</h3>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Active collections priority queue</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Class Level</label>
                    <select 
                      className="px-4 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-primary/20"
                      value={filterGradeId || ''}
                      onChange={(e) => {
                        setFilterGradeId(e.target.value ? Number(e.target.value) : null);
                        setFilterClassId(null);
                      }}
                    >
                      <option value="">All Classes</option>
                      {grades.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Section</label>
                    <select 
                      className="px-4 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-30 disabled:cursor-not-allowed"
                      value={filterClassId || ''}
                      disabled={!filterGradeId}
                      onChange={(e) => setFilterClassId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">All Sections</option>
                      {schoolClasses
                        .filter(sc => sc.grade_id === filterGradeId)
                        .map(sc => (
                          <option key={sc.id} value={sc.id}>Section {sc.display_name?.split('-').pop() || sc.section?.name}</option>
                        ))
                      }
                    </select>
                  </div>
                  
                  {(filterGradeId || filterClassId) && (
                    <button 
                      onClick={() => {
                        setFilterGradeId(null);
                        setFilterClassId(null);
                      }}
                      className="mt-5 p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                      title="Clear Filters"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                     <tr className="bg-slate-50/50 text-left">
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scholar Name</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cluster</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dues Magnitude</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contact</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {defaulters
                      .filter(d => {
                        const matchesGrade = !filterGradeId || d.grade_id === filterGradeId;
                        const matchesClass = !filterClassId || d.class_id === filterClassId;
                        return matchesGrade && matchesClass;
                      })
                      .map((d) => (
                      <tr key={d.student_id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-10 py-6 font-black text-foreground">{d.student_name}</td>
                        <td className="px-10 py-6 text-sm font-bold text-muted-foreground">{d.class_name || 'N/A'}</td>
                        <td className="px-10 py-6 font-black text-rose-500">₹{d.total_due.toLocaleString()}</td>
                        <td className="px-10 py-6">
                           {d.phone ? (
                             <div className="flex items-center gap-2">
                               <a 
                                 href={`tel:${d.phone}`}
                                 className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20"
                                 title="Call Parent"
                               >
                                 <Phone className="w-4 h-4" />
                               </a>
                               <a 
                                 href={`https://wa.me/${d.phone.replace(/\D/g, '')}`}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="p-2.5 bg-green-500/10 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm border border-green-500/20"
                                 title="WhatsApp Parent"
                                >
                                 <MessageCircle className="w-4 h-4" />
                               </a>
                             </div>
                           ) : (
                             <span className="text-[10px] font-bold text-muted-foreground italic opacity-40">No Contact</span>
                           )}
                        </td>
                        <td className="px-10 py-6">
                           <button 
                             onClick={() => {
                               setManualForm({ student_id: String(d.student_id), amount: '', mode: 'CASH', note: '' });
                               setFormStatus(null);
                               setIsManualModalOpen(true);
                             }}
                             className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all"
                           >
                             Clear Dues
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Payment Modal */}
      <AnimatePresence>
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManualModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md" 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl premium-glass p-12 rounded-[4rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden"
            >
              <button 
                onClick={() => setIsManualModalOpen(false)}
                className="absolute top-8 right-8 p-3 rounded-2xl bg-slate-100 text-slate-400 hover:text-foreground transition-all"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-4 mb-10">
                <div className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20">
                  <Plus className="w-8 h-8" />
                </div>
                <h2 className="text-4xl font-black text-foreground tracking-tighter">Manual <span className="text-primary italic">Entry</span></h2>
                <p className="text-muted-foreground font-medium italic">Record physical currency or external UPl transfers safely into the ledger.</p>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Scholar ID</label>
                    <input 
                      type="number" 
                      required
                      value={manualForm.student_id}
                      onChange={(e) => setManualForm(f => ({ ...f, student_id: e.target.value }))}
                      className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-black text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Currency Quantum (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={manualForm.amount}
                      onChange={(e) => setManualForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-black text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                      placeholder="5000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Medium</label>
                    <select 
                      value={manualForm.mode}
                      onChange={(e) => setManualForm(f => ({ ...f, mode: e.target.value }))}
                      className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-black text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none appearance-none"
                    >
                      <option value="CASH" className="bg-slate-900">CASH</option>
                      <option value="MANUAL_UPI" className="bg-slate-900">MANUAL UPI</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Internal Ledger Note</label>
                  <textarea 
                    value={manualForm.note}
                    onChange={(e) => setManualForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-bold text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none min-h-[100px]"
                    placeholder="Reference from physical check or UPI screenshot ID..."
                  />
                </div>

                {formStatus && (
                  <div className={cn(
                    "p-6 rounded-3xl flex items-center gap-4 text-xs font-black uppercase tracking-widest",
                    formStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                  )}>
                    {formStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {formStatus.message}
                  </div>
                )}

                <button 
                  disabled={isSubmitting}
                  className="w-full py-6 bg-primary text-primary-foreground rounded-[2.5rem] font-black text-lg uppercase tracking-[0.3em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-7 h-7 animate-spin" /> : <>Commit to Ledger — ₹{manualForm.amount || '0'} <ArrowUpRight className="w-6 h-6" /></>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
