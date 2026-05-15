import { TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { FinanceSummaryResponse, ClassFinanceBreakdownResponse } from '@/features/finance/api';

interface ClassesOverviewProps {
  summary: FinanceSummaryResponse | null;
  classBreakdown: ClassFinanceBreakdownResponse | null;
}

export default function ClassesOverview({ summary, classBreakdown }: ClassesOverviewProps) {
  return (
    <div className="space-y-8">
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
    </div>
  );
}
