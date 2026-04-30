import { useState, useEffect } from 'react';
import {
  CreditCard, Zap, Receipt, History,
  ArrowRight, ShieldCheck, Wallet, CheckCircle2,
  Clock, AlertTriangle, Loader2, Calendar, Users
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { StudentDuesResponse } from '../api/financeApi';
import { financeApi } from '../api/financeApi';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window { Razorpay: any; }
}

export default function Payments() {
  const [duesList, setDuesList] = useState<StudentDuesResponse[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => { loadDues(); }, []);

  const dues = duesList[selectedIdx] || null;

  useEffect(() => {
    if (dues?.student_id) loadHistory(dues.student_id);
  }, [selectedIdx, duesList]);

  const loadDues = async () => {
    try {
      setIsLoading(true);
      const data = await financeApi.getMyDues();
      setDuesList(data);
      if (data[0]) setPayAmount(data[0].total_due);
    } catch (err) {
      console.error('Failed to load dues:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async (studentId: number) => {
    try {
      setIsHistoryLoading(true);
      const data = await financeApi.getStudentPayments(studentId);
      setPaymentHistory(data);
    } catch {
      setPaymentHistory([]);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadRazorpay = () =>
    new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const handlePayment = async () => {
    if (!dues || dues.total_due <= 0) return;
    const targetAmount = Math.min(payAmount, dues.total_due);
    if (targetAmount <= 0) return;
    try {
      setIsProcessing(true);
      setStatus(null);
      await loadRazorpay();
      const order = await financeApi.createOrder(dues.student_id, targetAmount);
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'EduTrack School Fees',
        description: `Fee payment for ${dues.student_name}`,
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            await financeApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setStatus({ type: 'success', message: 'Payment successful! Your dues have been updated.' });
            loadDues();
          } catch (err: any) {
            setStatus({ type: 'error', message: err.message || 'Verification failed.' });
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: { name: dues.student_name },
        theme: { color: '#4f46e5' },
        modal: {
          ondismiss: async () => {
            console.log("Payment modal dismissed by user.");
            try {
              await financeApi.cancelPayment({
                razorpay_order_id: order.order_id,
                student_id: dues.student_id
              });
              loadDues(); // Refresh history to show CANCELLED
            } catch (err) {
              console.error("Failed to notify cancellation:", err);
            }
            setIsProcessing(false);
          }
        }
      };
      new (window as any).Razorpay(options).open();
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to initiate payment.' });
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center pt-32">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // --- Derived values ---
  const dueDate = dues?.due_date ? new Date(dues.due_date) : null;
  const isOverdue = dues?.is_overdue ?? false;
  const totalPaid = dues?.total_paid ?? 0;
  const noDues = !dues || dues.total_due === 0;
  const noRecord = duesList.length === 0;

  const dueDateLabel = dueDate
    ? dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-8 py-8 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-[0.3em] bg-primary/10 px-4 py-2 rounded-full border border-primary/20 w-fit">
              <Zap className="w-4 h-4" /> Financial Terminal — Secure
            </div>
            <h1 className="text-5xl font-black tracking-tighter text-foreground leading-[0.9]">
              Fees &amp; <span className="text-primary italic">Payments</span>
            </h1>
          </div>

          {/* Account Status badge */}
          <div className={cn(
            'px-6 py-4 rounded-[2rem] premium-glass flex items-center gap-4 border-2 shadow-xl transition-all duration-500',
            isOverdue ? 'border-rose-500/40 shadow-rose-500/10'
              : noDues ? 'border-emerald-500/20 shadow-emerald-500/5'
              : 'border-primary/20 shadow-primary/5'
          )}>
            <div className={cn(
              'h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg',
              isOverdue ? 'bg-rose-500 shadow-rose-500/20'
                : noDues ? 'bg-emerald-500 shadow-emerald-500/20'
                : 'bg-primary shadow-primary/20'
            )}>
              {isOverdue ? <AlertTriangle className="w-6 h-6 text-white" />
                : noDues ? <CheckCircle2 className="w-6 h-6 text-white" />
                : <CreditCard className="w-6 h-6 text-white" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Account Status</p>
              <p className={cn(
                'text-2xl font-black',
                isOverdue ? 'text-rose-500' : noDues ? 'text-emerald-600' : 'text-foreground'
              )}>
                {isOverdue ? 'Overdue!' : noDues ? 'Fully Paid' : 'Outstanding'}
              </p>
            </div>
          </div>
        </div>

        {/* Multi-child selector for parents */}
        {duesList.length > 1 && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
              <Users className="w-4 h-4" /> Viewing fees for:
            </span>
            {duesList.map((d, i) => (
              <button
                key={d.student_id}
                onClick={() => { setSelectedIdx(i); setPayAmount(d.total_due); }}
                className={cn(
                  'px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border',
                  selectedIdx === i
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30'
                )}
              >{d.student_name}</button>
            ))}
          </div>
        )}

        {/* Overdue alert banner */}
        <AnimatePresence>
          {isOverdue && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-5 rounded-[1.5rem] bg-rose-500/10 border border-rose-500/30 flex items-center gap-4 text-rose-600"
            >
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-black text-sm">Payment Overdue</p>
                <p className="text-xs font-medium opacity-80">
                  The due date was <strong>{dueDateLabel}</strong>. Please clear your dues immediately to avoid penalties.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status notification */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className={cn(
                'p-5 rounded-[1.5rem] flex items-center gap-4 border shadow-xl',
                status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-rose-500/10 border-rose-500/20 text-rose-700'
              )}
            >
              {status.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
              <p className="font-bold text-sm">{status.message}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            {
              label: 'Amount Due', icon: Wallet, color: 'text-rose-500', bg: 'bg-rose-500/10',
              value: noRecord ? '—' : `₹${(dues?.total_due ?? 0).toLocaleString()}`,
              sub: noRecord ? 'No record' : dues?.total_due === 0 ? 'All cleared' : 'Outstanding',
            },
            {
              label: 'Amount Paid', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10',
              value: noRecord ? '—' : `₹${totalPaid.toLocaleString()}`,
              sub: noRecord ? 'No record' : `${paymentHistory.length} transactions`,
            },
            {
              label: 'Due Date', icon: Calendar, color: isOverdue ? 'text-rose-500' : 'text-indigo-500', bg: isOverdue ? 'bg-rose-500/10' : 'bg-indigo-500/10',
              value: dueDate ? dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—',
              sub: isOverdue ? 'OVERDUE' : dueDate ? dueDate.getFullYear().toString() : 'Not set',
            },
            {
              label: 'Student', icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-500/10',
              value: dues?.student_name || '—',
              sub: noDues ? 'Fully Paid' : 'Active',
            },
          ].map((s, i) => (
            <div key={i} className="premium-glass p-7 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all group">
              <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform', s.bg)}>
                <s.icon className={cn('w-5 h-5', s.color)} />
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">{s.label}</p>
              <p className={cn('text-2xl font-black text-foreground truncate', s.color === 'text-rose-500' && !noRecord && (dues?.total_due ?? 0) > 0 ? 'text-rose-500' : '')}>{s.value}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* No record state */}
        {noRecord && (
          <div className="premium-glass rounded-[3rem] p-12 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h2 className="text-2xl font-black text-foreground">No Fee Record Found</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your fee record hasn't been set up yet. Please contact the school administration.
            </p>
          </div>
        )}

        {/* Fee Breakdown + Payment */}
        {!noRecord && (
          <div className="grid lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-8 premium-glass p-10 rounded-[3rem] relative overflow-hidden border-glass-border shadow-2xl">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40" />
              <div className="relative z-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-black text-foreground tracking-tight">Fee Breakdown</h2>
                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-1">Academic Year 2024–25</p>
                  </div>
                  <Receipt className="w-8 h-8 text-primary/20" />
                </div>

                {dues?.breakdown.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                    <p className="font-black text-foreground text-lg">All fees are cleared!</p>
                    <p className="text-muted-foreground text-sm mt-1">No outstanding dues for this student.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dues?.breakdown.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-6 rounded-[2rem] bg-white/40 border border-white hover:bg-white/60 transition-colors group">
                        <div className="flex items-center gap-5">
                          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="text-primary font-black text-sm">{item.fee_type[0]}</span>
                          </div>
                          <div>
                            <p className="text-base font-black text-foreground">{item.fee_type}</p>
                            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-tighter">
                              Total: ₹{item.total.toLocaleString()} · Paid: ₹{item.paid.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn('text-xl font-black', item.due > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                            {item.due > 0 ? `₹${item.due.toLocaleString()}` : 'Settled'}
                          </p>
                          <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-widest">Outstanding</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment input + button */}
                {(dues?.total_due ?? 0) > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="p-5 rounded-[2rem] bg-indigo-50 border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Pay Now</p>
                        <p className="text-sm font-bold text-indigo-900/60 leading-tight">Enter the amount you want to pay. Priority dues are cleared first.</p>
                      </div>
                      <div className="relative w-full md:w-56">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-indigo-300">₹</span>
                        <input
                          type="number"
                          value={payAmount}
                          onChange={(e) => setPayAmount(Math.min(Number(e.target.value), dues!.total_due))}
                          className="w-full bg-white border-2 border-indigo-200 rounded-2xl py-4 pl-10 pr-4 text-xl font-black text-indigo-600 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                          max={dues?.total_due}
                          min={1}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handlePayment}
                      disabled={isProcessing || payAmount <= 0}
                      className="w-full py-5 bg-primary text-primary-foreground rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group disabled:opacity-50 disabled:scale-100"
                    >
                      {isProcessing ? <Loader2 className="w-7 h-7 animate-spin" /> : (
                        <>Pay ₹{payAmount.toLocaleString()} via Razorpay <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" /></>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Side info panel */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* Due date card */}
              <div className={cn(
                'p-8 rounded-[3rem] border-2 shadow-xl relative overflow-hidden',
                isOverdue ? 'bg-rose-600 border-rose-500 text-white' : 'premium-glass border-glass-border'
              )}>
                {isOverdue && <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/10 pointer-events-none" />}
                <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center mb-5 border', isOverdue ? 'bg-white/20 border-white/30' : 'bg-primary/10 border-primary/20')}>
                  <Calendar className={cn('w-6 h-6', isOverdue ? 'text-white' : 'text-primary')} />
                </div>
                <p className={cn('text-[10px] font-black uppercase tracking-widest mb-1', isOverdue ? 'text-rose-200' : 'text-muted-foreground')}>
                  {isOverdue ? '⚠ Payment Overdue' : 'Due Date'}
                </p>
                <p className={cn('text-3xl font-black tracking-tight', isOverdue ? 'text-white' : 'text-foreground')}>{dueDateLabel}</p>
                {isOverdue && (
                  <p className="text-rose-100 text-xs font-medium mt-2">Please clear immediately to avoid late fees.</p>
                )}
                {!isOverdue && dueDate && (
                  <p className="text-muted-foreground text-xs font-bold mt-2 uppercase tracking-widest">
                    {Math.max(0, Math.ceil((dueDate.getTime() - Date.now()) / 86400000))} days remaining
                  </p>
                )}
              </div>

              {/* Security info */}
              <div className="flex-1 p-8 rounded-[3rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden flex flex-col justify-between">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 pointer-events-none" />
                <div className="relative z-10">
                  <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6 border border-white/30">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-black mb-3">Secure Payments</h3>
                  <p className="text-sm text-indigo-100 leading-relaxed italic border-l-4 border-white/30 pl-4">
                    "Payments are distributed across your dues automatically. Priority dues are cleared first."
                  </p>
                </div>
                <div className="relative z-10 pt-5 border-t border-white/20 mt-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Powered by</p>
                  <p className="text-xs font-black text-white">Razorpay · PCI-DSS Compliant</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment History — always shown */}
        <div className="premium-glass rounded-[3rem] overflow-hidden shadow-xl">
          <div className="p-8 border-b border-glass-border flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground">Payment History</h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {dues?.student_name ? `For ${dues.student_name}` : 'All transactions'}
              </p>
            </div>
            {paymentHistory.length > 0 && (
              <span className="ml-auto px-4 py-1.5 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full border border-primary/20">
                {paymentHistory.length} records
              </span>
            )}
          </div>
          <div className="overflow-x-auto min-h-[160px]">
            {isHistoryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : paymentHistory.length === 0 ? (
              <div className="text-center py-14 space-y-3">
                <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground font-bold">No payment history yet.</p>
                <p className="text-xs text-muted-foreground/60">Payments made via Razorpay or recorded by the admin will appear here.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-glass-border bg-slate-50/50">
                    {['Date', 'Amount', 'Method', 'Note', 'Status'].map(h => (
                      <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paymentHistory.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/20 transition-colors">
                      <td className="px-8 py-5 text-sm text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-8 py-5 text-sm font-black text-primary">₹{p.amount?.toLocaleString()}</td>
                      <td className="px-8 py-5 text-xs font-black uppercase tracking-widest text-muted-foreground">{p.payment_mode}</td>
                      <td className="px-8 py-5 text-xs text-muted-foreground italic">{p.note || '—'}</td>
                      <td className="px-8 py-5">
                        <span className={cn(
                          'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border',
                          p.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                        )}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
