import { useState, useEffect } from 'react';
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

  // Lock body scroll while the modal is open so the page underneath
  // doesn't keep growing as the user scrolls. Previously the user could
  // scroll past the bottom of the page into blank space.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    onClose();
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const nameRegex = /^[A-Za-z][A-Za-z\s.'-]{1,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const name = form.name.trim();
    if (!name) {
      newErrors.name = "Student name is required.";
    } else if (name.length < 2) {
      newErrors.name = "Name must be at least 2 characters.";
    } else if (!nameRegex.test(name)) {
      newErrors.name = "Name can only contain letters, spaces, and . ' -";
    }

    if (!form.dob) {
      newErrors.dob = "Date of birth is required.";
    } else {
      const dobDate = new Date(form.dob);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(dobDate.getTime())) {
        newErrors.dob = "Invalid date.";
      } else if (dobDate >= today) {
        newErrors.dob = "Must be in the past.";
      } else {
        const ageMs = today.getTime() - dobDate.getTime();
        const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
        if (ageYears < 3) newErrors.dob = "Student must be at least 3 years old.";
        else if (ageYears > 25) newErrors.dob = "Date of birth seems too old.";
      }
    }

    const whatsappDigits = (form.whatsapp.match(/\d/g) || []).length;
    if (!form.whatsapp.trim()) {
      newErrors.whatsapp = "WhatsApp number is required.";
    } else if (whatsappDigits < 10) {
      newErrors.whatsapp = "Enter a complete number (min 10 digits).";
    } else if (whatsappDigits > 15) {
      newErrors.whatsapp = "Number is too long (max 15 digits).";
    }

    const parentName = form.parent_name.trim();
    if (!parentName) {
      newErrors.parent_name = "Guardian name is required.";
    } else if (parentName.length < 2) {
      newErrors.parent_name = "Name must be at least 2 characters.";
    } else if (!nameRegex.test(parentName)) {
      newErrors.parent_name = "Name can only contain letters, spaces, and . ' -";
    }

    if (!form.parent_email.trim()) {
      newErrors.parent_email = "Email is required.";
    } else if (!emailRegex.test(form.parent_email.trim())) {
      newErrors.parent_email = "Invalid email format.";
    }

    // Parent phone is compulsory — the parent portal login uses (guardian_phone, student_dob).
    const phoneDigits = (form.parent_phone.match(/\d/g) || []).length;
    if (!form.parent_phone.trim()) {
      newErrors.parent_phone = "Parent phone is required for portal login.";
    } else if (phoneDigits < 10) {
      newErrors.parent_phone = "Enter a complete phone number (min 10 digits).";
    } else if (phoneDigits > 15) {
      newErrors.parent_phone = "Number is too long (max 15 digits).";
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
        name: form.name.trim(),
        dob: form.dob,
        whatsapp: form.whatsapp.trim(),
        parent_name: form.parent_name.trim(),
        parent_email: form.parent_email.trim(),
        parent_phone: form.parent_phone.trim(),
        password: form.dob,
        school_class_id: selectedSchoolClassId,
      });
      handleClose();
      onEnrolled();
    } catch (err) {
      const error = getErrorMessage(err);
      setErrors({ submit: error.message || "Failed to enroll student. Please check your input and try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-md cursor-default"
          />
          <div className="relative min-h-full flex items-start sm:items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="relative w-full max-w-2xl obsidian-card border-brand-indigo/30 p-6 sm:p-8 shadow-[0_0_80px_rgba(99,102,241,0.12)] my-4 sm:my-6 pointer-events-auto"
            >
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-brand-indigo/8 blur-[80px] rounded-full pointer-events-none" />

            <div className="flex items-center justify-between mb-6 sm:mb-8 relative z-10">
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Enroll Student</h2>
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

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">

                {/* Student details */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-brand-indigo/80">
                    <UserPlus className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">Student Details</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between items-center">
                        <span>Full Name <span className="text-rose-400">*</span></span>
                        {errors.name && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.name}</span>}
                      </label>
                      <input
                        autoFocus
                        placeholder="e.g. Arjun Mehta"
                        maxLength={80}
                        className={cn("input-obsidian", errors.name && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.name}
                        onChange={e => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: '' }); }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                          <span>Date of Birth <span className="text-rose-400">*</span></span>
                          {errors.dob && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.dob}</span>}
                        </label>
                        <input
                          type="date"
                          max={(() => {
                            const t = new Date();
                            const y = t.getFullYear();
                            const m = String(t.getMonth() + 1).padStart(2, '0');
                            const d = String(t.getDate()).padStart(2, '0');
                            return `${y}-${m}-${d}`;
                          })()}
                          className={cn("input-obsidian", errors.dob && "border-rose-500/50 bg-rose-500/[0.02]")}
                          value={form.dob}
                          onChange={e => { setForm({ ...form, dob: e.target.value }); if (errors.dob) setErrors({ ...errors, dob: '' }); }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                          <span>WhatsApp <span className="text-rose-400">*</span></span>
                          {errors.whatsapp && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.whatsapp}</span>}
                        </label>
                        <input
                          type="tel"
                          inputMode="tel"
                          placeholder="+91 98765 43210"
                          maxLength={20}
                          className={cn("input-obsidian", errors.whatsapp && "border-rose-500/50 bg-rose-500/[0.02]")}
                          value={form.whatsapp}
                          onChange={e => { setForm({ ...form, whatsapp: e.target.value }); if (errors.whatsapp) setErrors({ ...errors, whatsapp: '' }); }}
                        />
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
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                        <span>Guardian Name <span className="text-rose-400">*</span></span>
                        {errors.parent_name && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.parent_name}</span>}
                      </label>
                      <input
                        placeholder="e.g. Suresh Mehta"
                        maxLength={80}
                        className={cn("input-obsidian", errors.parent_name && "border-rose-500/50 bg-rose-500/[0.02]")}
                        value={form.parent_name}
                        onChange={e => { setForm({ ...form, parent_name: e.target.value }); if (errors.parent_name) setErrors({ ...errors, parent_name: '' }); }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary ml-1 flex justify-between">
                        <span>Email Address <span className="text-rose-400">*</span></span>
                        {errors.parent_email && <span className="text-rose-400 normal-case tracking-normal font-medium italic">{errors.parent_email}</span>}
                      </label>
                      <input
                        type="email"
                        placeholder="suresh@gmail.com"
                        maxLength={120}
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

              <div className="pt-5 border-t border-glass-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0">
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
        </div>
      )}
    </AnimatePresence>
  );
}
