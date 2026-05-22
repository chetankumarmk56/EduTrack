import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, User, ShieldCheck, ArrowRight, AlertCircle, Loader } from 'lucide-react';
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
    if (!form.name.trim()) newErrors.name = "Student name is required.";
    if (!form.dob) newErrors.dob = "Date of birth is required.";
    if (form.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parent_email)) {
      newErrors.parent_email = "Invalid email format.";
    }
    // Parent phone is compulsory — the parent portal login uses (guardian_phone, student_dob).
    const phoneDigits = (form.parent_phone.match(/\d/g) || []).length;
    if (!form.parent_phone.trim()) {
      newErrors.parent_phone = "Parent phone is required for portal login.";
    } else if (phoneDigits < 10) {
      newErrors.parent_phone = "Enter a complete phone number (min 10 digits).";
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
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            className="relative w-full max-w-2xl obsidian-card border-brand-indigo/30 p-8 shadow-[0_0_80px_rgba(99,102,241,0.12)] overflow-hidden"
          >
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-brand-indigo/8 blur-[80px] rounded-full pointer-events-none" />

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase">Enroll Student</h2>
                <p className="text-text-secondary text-sm mt-0.5">Add a new student to the selected class.</p>
              </div>
              <button onClick={handleClose} className="p-2.5 hover:bg-white/5 rounded-xl transition-all border border-glass-border">
                <X className="w-5 h-5 opacity-50 hover:opacity-100" />
              </button>
            </div>

            {errors.submit && (
              <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                {/* Student details */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-brand-indigo/80">
                    <UserPlus className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">Student Details</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between items-center">
                        <span>Full Name</span>
                        {errors.name && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.name}</span>}
                      </label>
                      <input
                        autoFocus
                        placeholder="e.g. Arjun Mehta"
                        className={cn("input-obsidian", errors.name && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.name}
                        onChange={e => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: '' }); }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                          <span>Date of Birth</span>
                          {errors.dob && <span className="text-rose-400 normal-case tracking-normal font-medium italic">Required</span>}
                        </label>
                        <input
                          type="date"
                          className={cn("input-obsidian", errors.dob && "border-rose-500/50 bg-rose-500/[0.02]")}
                          value={form.dob}
                          onChange={e => { setForm({ ...form, dob: e.target.value }); if (errors.dob) setErrors({ ...errors, dob: '' }); }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">WhatsApp</label>
                        <input placeholder="+91..." className="input-obsidian" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Parent/guardian details */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-brand-indigo/80">
                    <User className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">Parent / Guardian</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1">Guardian Name</label>
                      <input placeholder="e.g. Suresh Mehta" className="input-obsidian" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                        <span>Email Address</span>
                        {errors.parent_email && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.parent_email}</span>}
                      </label>
                      <input
                        type="email"
                        placeholder="suresh@gmail.com"
                        className={cn("input-obsidian", errors.parent_email && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.parent_email}
                        onChange={e => { setForm({ ...form, parent_email: e.target.value }); if (errors.parent_email) setErrors({ ...errors, parent_email: '' }); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                        <span>Phone Number <span className="text-rose-400">*</span></span>
                        {errors.parent_phone && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.parent_phone}</span>}
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="+91 98765 43210"
                        className={cn("input-obsidian", errors.parent_phone && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.parent_phone}
                        onChange={e => { setForm({ ...form, parent_phone: e.target.value }); if (errors.parent_phone) setErrors({ ...errors, parent_phone: '' }); }}
                      />
                      <p className="text-[10px] text-text-secondary opacity-50 ml-1">Used as the parent's login credential.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 border-t border-glass-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-text-secondary opacity-40">
                  <ShieldCheck className="w-3.5 h-3.5" /> Login password auto-set to date of birth
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn("indigo-glow-button h-12 px-8 text-sm font-black uppercase tracking-wider", isSubmitting && "opacity-50 cursor-wait")}
                >
                  {isSubmitting
                    ? <><Loader className="w-4 h-4 animate-spin mr-2" /> Enrolling...</>
                    : <>Enroll Student <ArrowRight className="w-4 h-4 ml-2" /></>
                  }
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
