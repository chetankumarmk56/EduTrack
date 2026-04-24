import { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Search, Filter, Plus, 
  ArrowUpRight, History, CheckCircle2, 
  AlertCircle, X, Loader2, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FinanceSummaryResponse, PaymentDetails, DefaulterResponse } from '../../api/financeApi';
import { financeApi } from '../../api/financeApi';
import { cn } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, Pie, PieChart as RePieChart
} from 'recharts';

export default function FinanceDashboard() {
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [payments, setPayments] = useState<PaymentDetails[]>([]);
  const [defaulters, setDefaulters] = useState<DefaulterResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'defaulters'>('overview');

  // Manual Payment Form State
  const [manualForm, setManualForm] = useState({
    student_id: '',
    amount: '',
    mode: 'CASH',
    note: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      const [sumData, payData, defData] = await Promise.all([
        financeApi.getSummary(),
        financeApi.getAllPayments({ limit: 50 }),
        financeApi.getDefaulters()
      ]);
      setSummary(sumData);
      setPayments(payData?.items || []);
      setDefaulters(defData);
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
          {(['overview', 'ledger', 'defaulters'] as const).map((tab) => (
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

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-12"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />
                <div className="flex items-center justify-between mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1 text-emerald-500 font-bold text-xs">
                    <ArrowUpRight className="w-4 h-4" /> Live
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Total Collected</p>
                <p className="text-4xl font-black text-foreground">₹{summary?.total_collected.toLocaleString()}</p>
              </div>

              <div className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />
                <div className="flex items-center justify-between mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <History className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Dues Pending</p>
                <p className="text-4xl font-black text-foreground">₹{summary?.total_pending.toLocaleString()}</p>
              </div>

              <div className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-3xl -mr-12 -mt-12 group-hover:scale-110" />
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Defaulter Count</p>
                <p className="text-4xl font-black text-foreground">{defaulters.length}</p>
              </div>

              <div className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all relative overflow-hidden group border-primary/10">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-3xl -mr-12 -mt-12" />
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Ledger Integrity</p>
                <p className="text-4xl font-black text-foreground">100%</p>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid lg:grid-cols-12 gap-10">
              <div className="lg:col-span-8 premium-glass p-10 rounded-[3rem] shadow-xl space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black text-foreground tracking-tight">Collection by Category</h3>
                  <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /> Target Achieved</span>
                  </div>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary?.category_collected || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 900 }}
                      />
                      <Bar dataKey="amount" radius={[10, 10, 10, 10]}>
                        {(summary?.category_collected || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 premium-glass p-10 rounded-[3rem] shadow-xl flex flex-col items-center justify-center overflow-hidden">
                <h3 className="text-xl font-black text-foreground mb-8">Pending Dues Arc</h3>
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={summary?.category_pending || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={10}
                        dataKey="amount"
                        nameKey="category"
                      >
                       {(summary?.category_pending || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: '10px', fontWeight: 900 }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-4">
                  {(summary?.category_pending || []).map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                       <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">{p.category}</span>
                    </div>
                  ))}
                </div>
              </div>
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
                  className="w-full pl-12 pr-6 py-4 bg-slate-50/50 rounded-2xl border border-slate-100 font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div className="flex items-center gap-4 overflow-x-auto w-full md:w-auto">
                <button className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-50 text-xs font-black uppercase tracking-widest border border-slate-100 hover:bg-white transition-all whitespace-nowrap">
                  <Filter className="w-4 h-4" /> All Modes
                </button>
                <button className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-50 text-xs font-black uppercase tracking-widest border border-slate-100 hover:bg-white transition-all whitespace-nowrap">
                  Status: Success
                </button>
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
                  {(payments || []).map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-black text-xs">
                            {p.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-sm font-black text-foreground">Scholar #{p.student_id}</td>
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
              <div className="p-10 border-b border-glass-border">
                <h3 className="text-3xl font-black text-foreground tracking-tighter mb-2">Defaulter Roster</h3>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Active collections priority queue</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                     <tr className="bg-slate-50/50 text-left">
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scholar Name</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cluster</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dues Magnitude</th>
                        <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {defaulters.map((d) => (
                      <tr key={d.student_id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-10 py-6 font-black text-foreground">{d.student_name}</td>
                        <td className="px-10 py-6 text-sm font-bold text-muted-foreground">{d.class_name || 'N/A'}</td>
                        <td className="px-10 py-6 font-black text-rose-500">₹{d.total_due.toLocaleString()}</td>
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
