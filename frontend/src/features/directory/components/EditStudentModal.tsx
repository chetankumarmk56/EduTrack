import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, AlertCircle } from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';

interface EditStudentModalProps {
  student: any | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditStudentModal({ student, onClose, onUpdated }: EditStudentModalProps) {
  const [localStudent, setLocalStudent] = useState<any | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (student) setLocalStudent({ ...student });
    else { setLocalStudent(null); setErrors({}); }
  }, [student]);

  const update = (field: string, value: string) => {
    setLocalStudent((prev: any) => ({ ...prev, [field]: value }));
    if (errors.submit) setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localStudent) return;

    setIsSubmitting(true);
    setErrors({});
    try {
      await directoryApi.updateStudent(localStudent.id, {
        name: localStudent.name,
        dob: localStudent.dob,
        whatsapp: localStudent.whatsapp,
        school_class_id: localStudent.school_class_id,
        parent_name: localStudent.parent_name,
        parent_email: localStudent.parent_email,
        parent_phone: localStudent.parent_phone
      } as any);
      onClose();
      onUpdated();
    } catch (err: any) {
      const error = getErrorMessage(err);
      setErrors({ submit: error.message || "Failed to update student information. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {student && localStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-3xl obsidian-card border-brand-indigo/30 p-12 shadow-2xl">
            <div className="flex items-center justify-between mb-12">
              <div className="space-y-1">
                <h2 className="text-4xl font-black tracking-tight uppercase italic">Configure Record</h2>
                <p className="text-text-secondary text-sm font-medium opacity-60">Update scholastic and guardian identifiers.</p>
              </div>
              <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-2xl transition-all border border-glass-border">
                <X className="w-8 h-8 opacity-40" />
              </button>
            </div>

            {errors.submit && (
              <div className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10">
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 text-brand-indigo">Identity Name</label>
                      <input className="input-obsidian" value={localStudent.name} onChange={e => update('name', e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Date of Birth</label>
                        <input type="date" className="input-obsidian" value={localStudent.dob} onChange={e => update('dob', e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">WhatsApp Contact</label>
                        <input className="input-obsidian" value={localStudent.whatsapp || ''} onChange={e => update('whatsapp', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 text-brand-indigo">Guardian Name</label>
                      <input className="input-obsidian" value={localStudent.parent_name || ''} onChange={e => update('parent_name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Guardian Email</label>
                      <input type="email" className="input-obsidian" value={localStudent.parent_email || ''} onChange={e => update('parent_email', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Guardian Phone</label>
                      <input className="input-obsidian" value={localStudent.parent_phone || ''} onChange={e => update('parent_phone', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-glass-border flex justify-end">
                <button type="submit" disabled={isSubmitting} className={cn("indigo-glow-button h-16 px-12 text-sm font-black uppercase tracking-[0.2em] italic", isSubmitting && "opacity-50 cursor-wait")}>
                  {isSubmitting ? 'Syncing...' : 'Commit Record Sync'} {!isSubmitting && <ArrowRight className="w-5 h-5 ml-3 inline" />}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
