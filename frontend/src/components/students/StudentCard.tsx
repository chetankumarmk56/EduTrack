import { motion } from 'framer-motion';
import { Pencil, Trash2, Loader, User, Mail, Phone, Calendar, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StudentCardProps {
  student: any;
  viewMode: 'grid' | 'list';
  onEdit: (student: any) => void;
  onDelete: (id: number, name: string) => void;
  deletingId: number | null;
}

export default function StudentCard({ student: s, viewMode, onEdit, onDelete, deletingId }: StudentCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "obsidian-card group relative p-0 overflow-hidden transition-all border border-glass-border hover:border-brand-indigo/40 hover:shadow-2xl hover:shadow-brand-indigo/5 bg-white/[0.01]",
        viewMode === 'list' && "flex items-center"
      )}
    >
      <div className="absolute top-0 left-0 w-full h-1 aurora-gradient opacity-20 group-hover:opacity-100 transition-opacity" />

      <div className={cn("p-8 w-full", viewMode === 'list' && "flex items-center justify-between gap-6")}>
        <div className={cn("flex items-center gap-6", viewMode === 'list' && "flex-1 min-w-0")}>
          <div className="w-20 h-20 rounded-[2.5rem] bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-3xl text-brand-indigo relative shadow-inner group-hover:scale-105 transition-transform duration-500">
            {s.name.charAt(0)}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-emerald-500 border-4 border-obsidian" />
          </div>
          <div className={cn("space-y-2", viewMode === 'grid' && "pr-24")}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black bg-brand-indigo text-white px-2 py-0.5 rounded-md flex-shrink-0">Roll #{s.roll_number}</span>
              <h4 className="font-black text-2xl tracking-tight group-hover:text-brand-indigo transition-colors uppercase italic truncate">
                {s.name}
              </h4>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-lg border border-emerald-500/20">Enrolled</span>
            </div>
          </div>
        </div>

        {viewMode === 'grid' && (
          <div className="mt-10 pt-8 border-t border-glass-border grid grid-cols-1 gap-6">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-glass-border space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-indigo flex items-center gap-2">
                <User className="w-3 h-3" /> Primary Guardian
              </p>
              <div className="space-y-1.5">
                <p className="text-sm font-black uppercase italic text-white/90">{s.parent_name || 'Not Configured'}</p>
                <div className="flex flex-col gap-1 opacity-60">
                  <span className="text-[10px] font-bold flex items-center gap-2"><Mail className="w-3 h-3" /> {s.parent_email || 'N/A'}</span>
                  <span className="text-[10px] font-bold flex items-center gap-2"><Phone className="w-3 h-3" /> {s.parent_phone || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-30">Scholastic Hash</p>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-indigo" />
                  <span className="text-[10px] font-black tabular-nums opacity-60">#{s.id.toString().padStart(5, '0')}</span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest opacity-30 text-emerald-500">Credential (DOB)</p>
                <div className="flex items-center justify-end gap-2 text-emerald-500/80">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black tabular-nums">{s.dob || 'UNKNOWN'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={cn("flex items-center gap-2", viewMode === 'grid' ? "absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100" : "opacity-100")}>
          <button
            onClick={() => onEdit(s)}
            className="p-3 rounded-xl bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary transition-all shadow-lg"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(s.id, s.name)}
            disabled={deletingId === s.id}
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deletingId === s.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
