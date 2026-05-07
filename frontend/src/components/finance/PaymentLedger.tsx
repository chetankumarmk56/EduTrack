import { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PaymentDetails } from '../../api/financeApi';

interface PaymentLedgerProps {
  payments: PaymentDetails[];
}

export default function PaymentLedger({ payments }: PaymentLedgerProps) {
  const [ledgerMode, setLedgerMode] = useState('ALL');
  const [ledgerStatus, setLedgerStatus] = useState('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');

  const filteredPayments = payments.filter(p => {
    const matchesSearch = !ledgerSearch ||
      p.id.toString().includes(ledgerSearch) ||
      p.student_id.toString().includes(ledgerSearch) ||
      p.student_name?.toLowerCase().includes(ledgerSearch.toLowerCase());
    const matchesMode = ledgerMode === 'ALL' || p.payment_mode === ledgerMode;
    const matchesStatus = ledgerStatus === 'ALL' || p.status === ledgerStatus;
    return matchesSearch && matchesMode && matchesStatus;
  });

  return (
    <div className="premium-glass overflow-hidden rounded-[3rem] shadow-2xl border-white">
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
                  <p className="text-sm font-black text-foreground">{p.student_name || `Scholar #${p.student_id}`}</p>
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
    </div>
  );
}
