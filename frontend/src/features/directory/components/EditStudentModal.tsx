import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, AlertCircle, Loader, UserPlus, User } from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import type { Student } from '@/shared/types';

interface EditStudentModalProps {
  student: Student | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditStudentModal({ student, onClose, onUpdated }: EditStudentModalProps) {
  const [localStudent, setLocalStudent] = useState<Student | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (student) setLocalStudent({ ...student });
    else { setLocalStudent(null); setErrors({}); }
  }, [student]);

  // Lock body scroll while open so the page can't be scrolled past the modal.
  useEffect(() => {
    if (!student) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [student]);

  const update = (field: keyof Student, value: string) => {
    setLocalStudent((prev) => (prev ? { ...prev, [field]: value } : prev));
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
        parent_phone: localStudent.parent_phone,
      });
      onClose();
      onUpdated();
    } catch (err) {
      const error = getErrorMessage(err);
      setErrors({ submit: error.message || "Failed to update student information. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tree = (
    <AnimatePresence>
      {student && localStudent && (
        <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 modal-scrim cursor-default"
          />
          <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="modal-panel relative w-full max-w-2xl p-6 sm:p-8 my-4 sm:my-6 pointer-events-auto"
            >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase">Edit Student</h2>
                <p className="text-text-secondary text-sm mt-0.5">Update student and guardian information.</p>
              </div>
              <button onClick={onClose} className="p-2.5 hover:bg-white/5 rounded-xl transition-all border border-glass-border">
                <X className="w-5 h-5 opacity-50" />
              </button>
            </div>

            {errors.submit && (
              <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">

                {/* Student details */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-brand-indigo/80">
                    <UserPlus className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">Student Details</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Full Name</label>
                      <input className="input-obsidian" value={localStudent.name} onChange={e => update('name', e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Date of Birth</label>
                        <input type="date" className="input-obsidian" value={localStudent.dob} onChange={e => update('dob', e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">WhatsApp</label>
                        <input className="input-obsidian" value={localStudent.whatsapp || ''} onChange={e => update('whatsapp', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Guardian details */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-brand-indigo/80">
                    <User className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">Parent / Guardian</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Guardian Name</label>
                      <input className="input-obsidian" value={localStudent.parent_name || ''} onChange={e => update('parent_name', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Email Address</label>
                      <input type="email" className="input-obsidian" value={localStudent.parent_email || ''} onChange={e => update('parent_email', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Phone Number</label>
                      <input className="input-obsidian" value={localStudent.parent_phone || ''} onChange={e => update('parent_phone', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 border-t border-glass-border flex justify-end">
                <button type="submit" disabled={isSubmitting} className={cn("indigo-glow-button h-12 px-8 text-sm font-black uppercase tracking-wider", isSubmitting && "opacity-50 cursor-wait")}>
                  {isSubmitting
                    ? <><Loader className="w-4 h-4 animate-spin mr-2 inline" /> Saving...</>
                    : <>Save Changes <ArrowRight className="w-4 h-4 ml-2 inline" /></>
                  }
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
}
