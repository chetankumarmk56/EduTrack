import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, User, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';

interface EnrollStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSchoolClassId: number | null;
  onEnrolled: () => void;
}

const EMPTY_FORM = { name: '', dob: '', whatsapp: '', parent_name: '', parent_email: '', parent_phone: '' };

export default function EnrollStudentModal({ isOpen, onClose, selectedSchoolClassId, onEnrolled }: EnrollStudentModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Full Legal Identity is required.";
    if (!form.dob) newErrors.dob = "Date of Birth is required.";
    if (form.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parent_email)) {
      newErrors.parent_email = "Invalid email format.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolClassId) {
      setErrors({ submit: "Please select a class before enrolling a student." });
      return;
    }
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});
    try {
      await directoryApi.createStudent({
        ...form,
        password: form.dob,
        school_class_id: selectedSchoolClassId
      } as any);
      handleClose();
      onEnrolled();
    } catch (err: any) {
      const error = getErrorMessage(err);
      setErrors({ submit: error.message || "Failed to enroll student. Please check your input and try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-3xl obsidian-card border-brand-indigo/30 p-12 shadow-[0_0_100px_rgba(99,102,241,0.15)] overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-brand-indigo/10 blur-[100px] rounded-full" />

            <div className="flex items-center justify-between mb-12 relative z-10">
              <div className="space-y-1">
                <h2 className="text-4xl font-black tracking-tight uppercase italic">Enroll Identity</h2>
                <p className="text-text-secondary text-sm font-medium opacity-60">Initialize new scholastic record within the current segment.</p>
              </div>
              <button onClick={handleClose} className="p-3 hover:bg-white/5 rounded-2xl transition-all border border-glass-border">
                <X className="w-8 h-8 opacity-40 hover:opacity-100" />
              </button>
            </div>

            {errors.submit && (
              <div className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-brand-indigo text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-80">
                    <UserPlus className="w-4 h-4" /> Scholastic Data
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 flex justify-between">
                        <span>Full Legal Identity</span>
                        {errors.name && <span className="text-rose-500 lowercase tracking-normal italic font-medium">{errors.name}</span>}
                      </label>
                      <input
                        autoFocus
                        placeholder="e.g. Liam Grayson"
                        className={cn("input-obsidian", errors.name && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.name}
                        onChange={e => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: '' }); }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 flex justify-between">
                          <span>Date of Birth</span>
                          {errors.dob && <span className="text-rose-500 lowercase tracking-normal italic font-medium">required</span>}
                        </label>
                        <input
                          type="date"
                          className={cn("input-obsidian", errors.dob && "border-rose-500/50 bg-rose-500/[0.02]")}
                          value={form.dob}
                          onChange={e => { setForm({ ...form, dob: e.target.value }); if (errors.dob) setErrors({ ...errors, dob: '' }); }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">WhatsApp Contact</label>
                        <input placeholder="+91..." className="input-obsidian" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-brand-indigo text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-80">
                    <User className="w-4 h-4" /> Guardian Metadata
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Parent/Guardian Name</label>
                      <input placeholder="e.g. Sarah Grayson" className="input-obsidian" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 flex justify-between">
                        <span>Parent Email</span>
                        {errors.parent_email && <span className="text-rose-500 lowercase tracking-normal italic font-medium">{errors.parent_email}</span>}
                      </label>
                      <input
                        type="email"
                        placeholder="sarah@nexus.edu"
                        className={cn("input-obsidian", errors.parent_email && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.parent_email}
                        onChange={e => { setForm({ ...form, parent_email: e.target.value }); if (errors.parent_email) setErrors({ ...errors, parent_email: '' }); }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Parent Phone Number</label>
                      <input placeholder="+91..." className="input-obsidian" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-glass-border flex items-center justify-between">
                <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary opacity-40">
                  <ShieldCheck className="w-4 h-4" /> Credentials will be Auto-Generated
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn("indigo-glow-button h-16 px-12 text-sm font-black uppercase tracking-[0.2em] italic", isSubmitting && "opacity-50 cursor-wait")}
                >
                  {isSubmitting ? 'Authorizing...' : 'Authorize Enrollment'} <ArrowRight className={cn("w-5 h-5 ml-3", isSubmitting && "animate-pulse")} />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
