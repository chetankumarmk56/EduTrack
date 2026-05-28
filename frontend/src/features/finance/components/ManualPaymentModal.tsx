import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, CheckCircle2, AlertCircle, Loader2, ArrowUpRight } from 'lucide-react';
import { financeApi } from '@/features/finance/api';
import { cn } from '@/shared/lib/utils';

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStudentId: string;
  onRecorded: () => void;
}

export default function ManualPaymentModal({ isOpen, onClose, initialStudentId, onRecorded }: ManualPaymentModalProps) {
  const [form, setForm] = useState({ student_id: '', amount: '', mode: 'CASH', note: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ student_id: initialStudentId, amount: '', mode: 'CASH', note: '' });
      setFormStatus(null);
    }
  }, [isOpen, initialStudentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormStatus(null);
    try {
      await financeApi.recordManualPayment({
        student_id: Number(form.student_id),
        amount: Number(form.amount),
        mode: form.mode,
        note: form.note
      });
      setFormStatus({ type: 'success', message: 'Payment recorded and allocated successfully.' });
      onRecorded();
      setTimeout(onClose, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record payment.';
      setFormStatus({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-xl premium-glass p-6 sm:p-10 md:p-12 rounded-t-3xl sm:rounded-[3rem] md:rounded-[4rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden max-h-[92vh] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute top-8 right-8 p-3 rounded-2xl bg-slate-100 text-slate-400 hover:text-foreground transition-all"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="space-y-4 mb-10">
              <div className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/20">
                <Plus className="w-8 h-8" />
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-foreground tracking-tighter">Manual <span className="text-primary italic">Entry</span></h2>
              <p className="text-muted-foreground font-medium italic">Record physical currency or external UPI transfers safely into the ledger.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Scholar ID</label>
                  <input
                    type="number"
                    required
                    value={form.student_id}
                    onChange={(e) => setForm(f => ({ ...f, student_id: e.target.value }))}
                    className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-black text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Currency Quantum (₹)</label>
                  <input
                    type="number"
                    required
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-8 py-5 rounded-3xl bg-slate-900/50 border border-white/10 font-black text-white focus:ring-4 focus:ring-primary/20 transition-all outline-none"
                    placeholder="5000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Medium</label>
                  <select
                    value={form.mode}
                    onChange={(e) => setForm(f => ({ ...f, mode: e.target.value }))}
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
                  value={form.note}
                  onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
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
                {isSubmitting ? <Loader2 className="w-7 h-7 animate-spin" /> : <>Commit to Ledger — ₹{form.amount || '0'} <ArrowUpRight className="w-6 h-6" /></>}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
