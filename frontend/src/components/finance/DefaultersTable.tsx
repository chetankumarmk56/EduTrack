import { useState } from 'react';
import { Phone, MessageCircle, X } from 'lucide-react';
import type { DefaulterResponse } from '../../api/financeApi';
import type { Grade, SchoolClass } from '../../types';

interface DefaultersTableProps {
  defaulters: DefaulterResponse[];
  onClearDues: (studentId: number) => void;
  grades: Grade[];
  schoolClasses: SchoolClass[];
}

function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export default function DefaultersTable({ defaulters, onClearDues, grades, schoolClasses }: DefaultersTableProps) {
  const [filterGradeId, setFilterGradeId] = useState<number | null>(null);
  const [filterClassId, setFilterClassId] = useState<number | null>(null);

  const filtered = defaulters.filter(d => {
    const matchesGrade = !filterGradeId || d.grade_id === filterGradeId;
    const matchesClass = !filterClassId || d.class_id === filterClassId;
    return matchesGrade && matchesClass;
  });

  return (
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
              onClick={() => { setFilterGradeId(null); setFilterClassId(null); }}
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
            {filtered.map((d) => (
              <tr key={d.student_id} className="hover:bg-slate-50/30 transition-colors">
                <td className="px-10 py-6 font-black text-foreground">{d.student_name}</td>
                <td className="px-10 py-6 text-sm font-bold text-muted-foreground">{d.class_name || 'N/A'}</td>
                <td className="px-10 py-6 font-black text-rose-500">₹{d.total_due.toLocaleString()}</td>
                <td className="px-10 py-6">
                  {d.phone ? (() => {
                    const waNumber = toWhatsAppNumber(d.phone);
                    return (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${d.phone}`}
                          className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20"
                          title="Call Parent"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        {waNumber && (
                          <a
                            href={`https://wa.me/${waNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 bg-green-500/10 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm border border-green-500/20"
                            title="WhatsApp Parent"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    );
                  })() : (
                    <span className="text-[10px] font-bold text-muted-foreground italic opacity-40">No Contact</span>
                  )}
                </td>
                <td className="px-10 py-6">
                  <button
                    onClick={() => onClearDues(d.student_id)}
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
  );
}
