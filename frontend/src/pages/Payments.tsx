import { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, Zap, Receipt, History, 
  ArrowRight, ShieldCheck, Wallet, CheckCircle2,
  Clock, AlertCircle, Loader2
} from 'lucide-react';
import { StaggerContainer, StaggerItem } from '../components/ui/PageWrapper';
import { cn } from '../lib/utils';
import type { StudentDuesResponse } from '../api/financeApi';
import { financeApi } from '../api/financeApi';
import { useAuth } from '../lib/AuthContext';
import { useApp } from '../lib/AppContext';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function Payments() {
  const { user } = useAuth();
  const { studentProfile } = useApp();
  const [dues, setDues] = useState<StudentDuesResponse | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const studentId = studentProfile?.id || (user?.role === 'student' ? user?.id : null);

  useEffect(() => {
    if (studentId) {
      loadDues();
    }
    
    // Cleanup: Ensure scrolling is restored if component unmounts mid-flow
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [studentId]);

  const loadDues = async () => {
    try {
      setIsLoading(true);
      const data = await financeApi.getStudentDues(studentId);
      setDues(data);
      setPayAmount(data.total_due);
    } catch (err) {
      console.error("Failed to load dues:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    if (!dues || dues.total_due <= 0) return;

    try {
      const targetAmount = Math.min(payAmount, dues?.total_due || 0);
      if (targetAmount <= 0) throw new Error("Please enter a valid amount.");

      setIsProcessing(true);
      setStatus(null);

      // 1. Create Order First - Pass the custom amount
      const order = await financeApi.createOrder(studentId, targetAmount);

      // 2. Handle Mock Mode
      if (order.is_mock) {
        console.log("Simulated Mode: Bypassing Razorpay UI.");
        setStatus({ type: 'success', message: 'Simulating successful payment...' });
        
        // Auto-verify with mock details after a brief delay
        setTimeout(async () => {
          try {
            await financeApi.verifyPayment({
              razorpay_order_id: order.order_id,
              razorpay_payment_id: `pay_mock_success_${Date.now()}`,
              razorpay_signature: 'mock_signature'
            });
            setStatus({ type: 'success', message: 'Simulated Payment successful! Your dues have been updated.' });
            loadDues();
          } catch (err: any) {
            setStatus({ type: 'error', message: 'Simulation failed.' });
          } finally {
            setIsProcessing(false);
          }
        }, 1500);
        return;
      }

      // 3. Load SDK (Only for real payments)
      const res = await loadRazorpay();
      if (!res) {
        setStatus({ type: 'error', message: 'Razorpay SDK failed to load. Are you online?' });
        setIsProcessing(false);
        return;
      }

      // 4. Open Checkout (Original logic for real keys)
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'EduTrack Academy',
        description: `Fees for ${dues.student_name}`,
        order_id: order.order_id,
        handler: async (response: any) => {
          try {
            setIsProcessing(true);
            await financeApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            
            setStatus({ type: 'success', message: 'Payment successful! Your dues have been updated.' });
            loadDues();
          } catch (err: any) {
            setStatus({ type: 'error', message: err.message || 'Verification failed.' });
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: dues.student_name,
        },
        theme: {
          color: '#4f46e5'
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (err: any) {
      console.error("Payment initiation failed:", err);
      setStatus({ type: 'error', message: err.message || 'Failed to initiate payment.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const stats = useMemo(() => [
    { label: 'Pending Dues', value: `₹${dues?.total_due.toLocaleString() || '0'}`, icon: Wallet, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Account Holder', value: dues?.student_name || 'Loading...', icon: History, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Status', value: dues?.total_due === 0 ? 'Fully Paid' : 'Outstandings', icon: ShieldCheck, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ], [dues]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center pt-32">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen pb-20">
      <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-[0.3em] bg-primary/10 px-4 py-2 rounded-full border border-primary/20 w-fit">
              <Zap className="w-4 h-4 shadow-[0_0_10px_rgba(var(--primary),0.5)]" /> Financial Terminal — Secure
            </div>
            <h1 className="text-6xl font-black tracking-tighter text-foreground leading-[0.9]">
              Fees & <span className="text-primary italic">Payments</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-xl">
              Securely manage your academic dues and institutional fees powered by Razorpay.
            </p>
          </div>
          
          <div className={cn(
            "px-6 py-4 rounded-[2rem] premium-glass flex items-center gap-4 border-2 shadow-xl transition-all duration-500",
            dues?.total_due === 0 ? "border-emerald-500/20 shadow-emerald-500/5" : "border-primary/20 shadow-primary/5"
          )}>
            <div className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg",
              dues?.total_due === 0 ? "bg-emerald-500 shadow-emerald-500/20" : "bg-primary shadow-primary/20"
            )}>
              {dues?.total_due === 0 ? <CheckCircle2 className="w-6 h-6 text-white" /> : <CreditCard className="w-6 h-6 text-white" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Account Status</p>
              <p className="text-2xl font-black text-foreground">{dues?.total_due === 0 ? 'Fully Paid' : 'Outstanding'}</p>
            </div>
          </div>
        </div>

        {/* Status Notification */}
        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={cn(
                "p-6 rounded-[2rem] flex items-center gap-4 border shadow-2xl",
                status.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-rose-500/10 border-rose-500/20 text-rose-700"
              )}
            >
              {status.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              <p className="font-bold">{status.message}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <StaggerItem key={i}>
              <div className="premium-glass p-8 rounded-[2.5rem] border-glass-border shadow-xl hover:shadow-2xl transition-all duration-500 group">
                <div className="flex items-center gap-4 mb-4">
                  <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500", stat.bg)}>
                    <stat.icon className={cn("w-6 h-6", stat.color)} />
                  </div>
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">{stat.label}</p>
                </div>
                <p className="text-3xl font-black text-foreground">{stat.value}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Main Content Area */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <StaggerItem className="lg:col-span-8 premium-glass p-10 rounded-[3rem] relative overflow-hidden group border-glass-border shadow-2xl">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40" />
            
            <div className="relative z-10 space-y-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-black text-foreground tracking-tight">Fee Breakdown</h2>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-1">Academic Cycle 2024-25</p>
                </div>
                <Receipt className="w-8 h-8 text-primary/20" />
              </div>

              <div className="space-y-4">
                {dues?.breakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-6 rounded-[2rem] bg-white/40 border border-white hover:bg-white/60 transition-colors group">
                    <div className="flex items-center gap-6">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                         <span className="text-primary font-black uppercase text-xs">{item.fee_type[0]}</span>
                      </div>
                      <div>
                        <p className="text-lg font-black text-foreground">{item.fee_type}</p>
                        <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-tighter">Total: ₹{item.total.toLocaleString()} · Paid: ₹{item.paid.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-xl font-black", item.due > 0 ? "text-rose-500" : "text-emerald-500")}>
                        {item.due > 0 ? `₹${item.due.toLocaleString()}` : "Settled"}
                      </p>
                      <p className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-widest">Outstanding</p>
                    </div>
                  </div>
                ))}
              </div>

              {dues && dues.total_due > 0 && (
                <div className="space-y-4">
                  <div className="p-6 rounded-[2rem] bg-indigo-50 border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Installment Amount</p>
                      <p className="text-sm font-bold text-indigo-900/60 leading-tight">Enter how much you want to pay now. The system will settle your most urgent dues first.</p>
                    </div>
                    <div className="relative w-full md:w-64">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-indigo-300">₹</span>
                      <input 
                        type="number"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Math.min(Number(e.target.value), dues.total_due))}
                        className="w-full bg-white border-2 border-indigo-200 rounded-2xl py-4 pl-12 pr-6 text-2xl font-black text-indigo-600 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                        max={dues.total_due}
                        min={1}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handlePayment}
                    disabled={isProcessing || payAmount <= 0}
                    className="w-full py-6 bg-primary text-primary-foreground rounded-[2rem] font-black text-lg uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group disabled:opacity-50 disabled:scale-100"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-7 h-7 animate-spin" />
                    ) : (
                      <>
                        Pay Installment — ₹{payAmount.toLocaleString()} 
                        <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {dues?.total_due === 0 && (
                <div className="py-12 text-center space-y-6">
                  <div className="h-20 w-20 rounded-[2rem] bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-foreground">Account Fully Settled</h3>
                    <p className="text-muted-foreground font-medium max-w-sm mx-auto">Thank you for your timely payments. All your academic dues are currently clear.</p>
                  </div>
                </div>
              )}
            </div>
          </StaggerItem>

          <StaggerItem className="lg:col-span-4 flex flex-col gap-8">
            <div className="flex-1 p-10 rounded-[3rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 pointer-events-none" />
              <div className="relative z-10">
                <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-8 border border-white/30">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-4 tracking-tighter">Security Protocol</h3>
                <p className="text-sm font-medium text-indigo-100 leading-relaxed italic border-l-4 border-white/30 pl-4">
                  "Your payments are distributed across your fees based on urgency. We ensure that priority dues (like Tuition) are cleared first."
                </p>
              </div>
              <div className="relative z-10 pt-6 border-t border-white/20 mt-8">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Payment Strategy</p>
                <p className="text-xs font-black text-white italic">Auto-Allocation Enabled</p>
              </div>
            </div>

            <div className="p-8 rounded-[3rem] premium-glass border-glass-border shadow-xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-sm font-black text-foreground">Timeline History</h4>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted-foreground uppercase tracking-widest">Last Check</span>
                  <span className="text-foreground">Just now</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-muted-foreground uppercase tracking-widest">Method</span>
                  <span className="text-foreground">Razorpay Secure</span>
                </div>
              </div>
            </div>
          </StaggerItem>
        </div>
      </div>
    </div>
  );
}
