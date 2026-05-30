import { motion } from 'framer-motion';
import { Pencil, Trash2, Loader, Mail, Phone, Calendar, Hash } from 'lucide-react';
import type { Student } from '@/shared/types';

interface StudentCardProps {
  student: Student;
  viewMode: 'grid' | 'list';
  onEdit: (student: Student) => void;
  onDelete: (id: number, name: string) => void;
  deletingId: number | null;
}

export default function StudentCard({ student: s, viewMode, onEdit, onDelete, deletingId }: StudentCardProps) {
  const initials = s.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  if (viewMode === 'list') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        className="obsidian-card group p-4 border border-glass-border hover:border-brand-indigo/30 transition-all bg-white/[0.01]"
      >
        <div className="flex items-center gap-4">
          {/* Roll + Avatar */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-black text-text-secondary w-7 text-center tabular-nums">#{s.roll_number}</span>
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-sm text-brand-indigo">
              {initials}
            </div>
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <p className="font-black text-base text-white group-hover:text-brand-indigo transition-colors truncate uppercase tracking-tight">{s.name}</p>
            <p className="text-[10px] text-text-secondary opacity-60 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> DOB: {s.dob || 'Not set'}
            </p>
          </div>

          {/* Parent info */}
          <div className="hidden md:flex flex-col gap-0.5 min-w-0 flex-1">
            <p className="text-xs font-semibold text-white/70 truncate">{s.parent?.name || 'No guardian'}</p>
            <div className="flex items-center gap-3 text-[10px] text-text-secondary">
              {s.parent?.email && (
                <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" /> {s.parent.email}</span>
              )}
              {s.parent?.primary_phone && (
                <span className="flex items-center gap-1 shrink-0"><Phone className="w-3 h-3" /> {s.parent.primary_phone}</span>
              )}
              {!s.parent?.email && !s.parent?.primary_phone && (
                <span className="opacity-40 italic">No contact info</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onEdit(s)}
              className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary hover:text-white transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(s.id, s.name)}
              disabled={deletingId === s.id}
              className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              {deletingId === s.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className="obsidian-card group relative p-0 overflow-hidden transition-all border border-glass-border hover:border-brand-indigo/40 hover:shadow-xl hover:shadow-brand-indigo/5 bg-white/[0.01]"
    >
      <div className="absolute top-0 left-0 w-full h-0.5 aurora-gradient opacity-20 group-hover:opacity-100 transition-opacity" />

      <div className="p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-xl text-brand-indigo relative group-hover:scale-105 transition-transform duration-300">
              {initials}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-emerald-500 border-[3px] border-obsidian" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-black bg-brand-indigo/80 text-white px-2 py-0.5 rounded-md">#{s.roll_number}</span>
                <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20">Enrolled</span>
              </div>
              <h4 className="font-black text-lg tracking-tight group-hover:text-brand-indigo transition-colors uppercase leading-tight">
                {s.name}
              </h4>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 shrink-0">
            <button
              onClick={() => onEdit(s)}
              className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary hover:text-white transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(s.id, s.name)}
              disabled={deletingId === s.id}
              className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all disabled:opacity-50"
            >
              {deletingId === s.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Parent/Guardian Info */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-glass-border space-y-3">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-indigo/70 flex items-center gap-1.5">
            Parent / Guardian
          </p>
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-white/90 truncate">{s.parent?.name || 'Not set'}</p>
            <div className="space-y-1">
              <span className="text-[11px] text-text-secondary flex items-center gap-2">
                <Mail className="w-3 h-3 text-brand-indigo/50 shrink-0" />
                <span className="truncate">{s.parent?.email || 'No email'}</span>
              </span>
              <span className="text-[11px] text-text-secondary flex items-center gap-2">
                <Phone className="w-3 h-3 text-brand-indigo/50 shrink-0" />
                {s.parent?.primary_phone || 'No phone'}
              </span>
              {s.parent?.secondary_phone && (
                <span className="text-[11px] text-text-secondary flex items-center gap-2">
                  <Phone className="w-3 h-3 text-brand-indigo/30 shrink-0" />
                  {s.parent.secondary_phone} <span className="opacity-50">(alt)</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer meta */}
        <div className="flex items-center justify-between text-[10px] text-text-secondary px-1">
          <div className="flex items-center gap-1.5 opacity-50">
            <Hash className="w-3 h-3" />
            <span className="tabular-nums">{s.id.toString().padStart(5, '0')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-emerald-500/70" />
            <span className="text-emerald-400/80 font-semibold tabular-nums">{s.dob || 'DOB not set'}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
