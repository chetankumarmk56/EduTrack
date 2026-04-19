import { CreditCard, Zap, Receipt, History, ArrowRight, ShieldCheck, Wallet } from 'lucide-react';
import { StaggerContainer, StaggerItem } from '../components/ui/PageWrapper';
import { cn } from '../lib/utils';

export default function Payments() {
  const stats = [
    { label: 'Pending Dues', value: '$0.00', icon: Wallet, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Last Payment', value: 'Mar 15, 2024', icon: History, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Total Paid', value: '$4,250.00', icon: ShieldCheck, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ];

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
              Manage school tuition, activity fees, and view your complete transaction history in real-time.
            </p>
          </div>
          
          <div className="px-6 py-4 rounded-[2rem] premium-glass flex items-center gap-4 border-2 border-primary/20 shadow-xl shadow-primary/5">
            <div className="h-12 w-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Account Status</p>
              <p className="text-2xl font-black text-foreground">Fully Paid</p>
            </div>
          </div>
        </div>

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

        {/* Info Area / Coming Soon Placeholder */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          <StaggerItem className="lg:col-span-8 premium-glass p-10 rounded-[3rem] relative overflow-hidden group border-glass-border shadow-2xl">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40" />
            
            <div className="relative z-10 flex flex-col items-center justify-center py-20 text-center space-y-8">
              <div className="h-24 w-24 rounded-[2rem] bg-slate-100 flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
                <Receipt className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-foreground tracking-tight">Payment Portal Initialization</h2>
                <p className="text-muted-foreground font-medium max-w-md mx-auto">
                  We are currently integrating with secure payment gateways to provide a seamless transaction experience. Digital receipts and automated billing will be available soon.
                </p>
              </div>
              <button className="px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-3">
                Setup Direct Debit <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </StaggerItem>

          <StaggerItem className="lg:col-span-4 flex flex-col gap-8">
            <div className="flex-1 p-10 rounded-[3rem] bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 pointer-events-none" />
              <div className="relative z-10">
                <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-8 border border-white/30">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-black tracking-tight mb-4">Security Protocol</h3>
                <p className="text-sm font-medium text-indigo-100 leading-relaxed italic border-l-4 border-white/30 pl-4">
                  "All financial data is encrypted and handled by PCI-DSS compliant processors. Your privacy and security are our highest priority."
                </p>
              </div>
              <div className="relative z-10 pt-6 border-t border-white/20 mt-8">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Encryption Level</p>
                <p className="text-xs font-black text-white">AES-256 GCM Secure</p>
              </div>
            </div>
          </StaggerItem>
        </div>
      </div>
    </div>
  );
}
