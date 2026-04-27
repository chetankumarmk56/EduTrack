import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, 
  Settings2,
  Trash2, LayoutGrid, List as ListIcon,
  ArrowRight, X,
  Pencil, Hash,
  Filter, User, Mail, Phone, Calendar,
  ShieldCheck, Search, School, Layers,
  AlertCircle, CheckCircle, Loader
} from 'lucide-react';
import { directoryApi } from '../../api/directoryApi';
import { useApp } from '../../lib/AppContext';
import { cn } from '../../lib/utils';
import { getErrorMessage } from '../../lib/errorHandler';

export default function StudentDirectory() {
  const { 
    students, 
    schoolClasses, 
    grades, 
    refreshDirectory, 
    refreshStudents,
    isDirectoryLoading 
  } = useApp();

  useEffect(() => {
    refreshStudents();
  }, []);
  
  // Selection State
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(() => {
    const saved = localStorage.getItem('student_directory_grade_id');
    return saved ? Number(saved) : null;
  });
  const [selectedSchoolClassId, setSelectedSchoolClassId] = useState<number | null>(() => {
    const saved = localStorage.getItem('student_directory_class_id');
    return saved ? Number(saved) : null;
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('student_directory_view_mode');
    return (saved as 'grid' | 'list') || 'grid';
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  const [form, setForm] = useState({
    name: '', dob: '', whatsapp: '',
    parent_name: '', parent_email: '', parent_phone: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    refreshDirectory();
  }, [refreshDirectory]);

  // Persistent Filter Persistence
  useEffect(() => {
    if (selectedGradeId) localStorage.setItem('student_directory_grade_id', selectedGradeId.toString());
    else localStorage.removeItem('student_directory_grade_id');
  }, [selectedGradeId]);

  useEffect(() => {
    if (selectedSchoolClassId) localStorage.setItem('student_directory_class_id', selectedSchoolClassId.toString());
    else localStorage.removeItem('student_directory_class_id');
  }, [selectedSchoolClassId]);

  useEffect(() => {
    localStorage.setItem('student_directory_view_mode', viewMode);
  }, [viewMode]);

  // Derived Data
  const filteredSchoolClasses = useMemo(() => 
    schoolClasses.filter(sc => 
      sc.grade_id === selectedGradeId || 
      sc.grade?.id === selectedGradeId
    ),
    [schoolClasses, selectedGradeId]
  );

  const filteredStudents = useMemo(() => {
    if (!selectedSchoolClassId) return [];
    let list = students.filter((s: any) => {
      const matchesClass = s.school_class_id === selectedSchoolClassId || 
                           s.school_class?.id === selectedSchoolClassId ||
                           s.classroom?.id === selectedSchoolClassId;
      return matchesClass;
    });

    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      list = list.filter(s => 
        s.name.toLowerCase().includes(lowSearch) || 
        s.parent_name?.toLowerCase().includes(lowSearch) ||
        s.email?.toLowerCase().includes(lowSearch)
      );
    }
    return list;
  }, [students, selectedSchoolClassId, searchTerm]);

  // Handlers
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

  const handleCreate = async (e: React.FormEvent) => {
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
        password: form.dob, // Default credential is DOB
        school_class_id: selectedSchoolClassId
      } as any);
      
      setIsAdding(false);
      setForm({ 
        name: '', dob: '', whatsapp: '',
        parent_name: '', parent_email: '', parent_phone: ''
      });
      setErrors({});
      setSuccessMessage(`Student "${form.name}" enrolled successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      refreshStudents();
    } catch (err: any) { 
      const error = getErrorMessage(err);
      setErrors({ 
        submit: error.message || "Failed to enroll student. Please check your input and try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    setIsSubmitting(true);
    setErrors({});
    try {
      await directoryApi.updateStudent(editingStudent.id, {
        name: editingStudent.name,
        dob: editingStudent.dob,
        whatsapp: editingStudent.whatsapp,
        school_class_id: editingStudent.school_class_id,
        parent_name: editingStudent.parent_name,
        parent_email: editingStudent.parent_email,
        parent_phone: editingStudent.parent_phone
      } as any);
      setEditingStudent(null);
      setSuccessMessage("Student information updated successfully!");
      setTimeout(() => setSuccessMessage(''), 3000);
      refreshStudents();
    } catch (err: any) { 
      const error = getErrorMessage(err);
      setErrors({ 
        submit: error.message || "Failed to update student information. Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove student "${name}" from records? This action cannot be undone.`)) return;
    
    setDeletingId(id);
    setErrors({});
    try {
      await directoryApi.deleteStudent(id);
      setSuccessMessage(`Student "${name}" has been removed.`);
      setTimeout(() => setSuccessMessage(''), 3000);
      refreshStudents();
    } catch (err: any) { 
      const error = getErrorMessage(err);
      setErrors({ 
        submit: error.message || "Failed to remove student. Please try again."
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-10 pb-20">
      
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <Filter className="w-3 h-3" /> Scholastic Registry
          </div>
          <h1 className="text-5xl font-black tracking-tight text-gradient-indigo">Student Roster</h1>
          <p className="text-text-secondary text-base font-medium max-w-xl">
            Coordinate student data and parent linkages within specific operational segments.
          </p>
        </div>

        {selectedSchoolClassId && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-brand-indigo transition-colors" />
              <input 
                placeholder="Search Identity..."
                className="input-obsidian pl-11 h-[54px] w-64 text-xs font-bold uppercase tracking-widest"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsAdding(true)}
              className="indigo-glow-button h-[54px] px-8"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Enroll Student
            </button>
          </div>
        )}
      </div>

      {/* Control Bar: Dual Filter */}
      <div className="p-8 obsidian-card border-brand-indigo/20 bg-brand-indigo/[0.02] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-indigo/5 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-text-secondary ml-2 flex items-center gap-2">
              <School className="w-3" /> Scholastic Class
            </label>
            <select 
              className="input-obsidian cursor-pointer font-bold text-sm"
              value={selectedGradeId || ''}
              onChange={e => {
                setSelectedGradeId(Number(e.target.value));
                setSelectedSchoolClassId(null);
              }}
            >
              <option value="">Select Class...</option>
              {grades.sort((a,b) => a.level - b.level).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-text-secondary ml-2 flex items-center gap-2">
              <Layers className="w-3 h-3" /> Operational Segment
            </label>
            <select 
              className="input-obsidian cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-bold text-sm"
              disabled={!selectedGradeId}
              value={selectedSchoolClassId || ''}
              onChange={e => setSelectedSchoolClassId(Number(e.target.value))}
            >
              <option value="">{selectedGradeId ? 'Choose Segment...' : 'Awaiting Class Selection'}</option>
              {filteredSchoolClasses.map(sc => (
                <option key={sc.id} value={sc.id}>Section {sc.display_name?.split('-').pop() || sc.section?.name}</option>
              ))}
            </select>
          </div>

          {selectedSchoolClassId && (
            <div className="flex items-end justify-end pb-1">
               <div className="flex items-center bg-white/5 border border-glass-border rounded-xl p-1.5 h-[54px] shadow-inner">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-2 px-6 rounded-lg transition-all flex items-center gap-2", viewMode === 'grid' ? "bg-brand-indigo text-white shadow-lg" : "text-text-secondary hover:text-white")}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Grid</span>
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-2 px-6 rounded-lg transition-all flex items-center gap-2", viewMode === 'list' ? "bg-brand-indigo text-white shadow-lg" : "text-text-secondary hover:text-white")}
                >
                  <ListIcon className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">List</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {selectedSchoolClassId ? (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="space-y-8"
          >
             <div className={cn(
              "grid gap-8 transition-all duration-500",
              viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
            )}>
              {isDirectoryLoading && students.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="obsidian-card p-8 space-y-8 animate-pulse border-glass-border">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-[2rem] bg-white/5" />
                      <div className="space-y-2 flex-1">
                        <div className="h-6 w-3/4 bg-white/5 rounded-lg" />
                        <div className="h-3 w-1/3 bg-white/5 rounded-lg" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="h-20 w-full bg-white/5 rounded-2xl" />
                      <div className="flex justify-between items-center px-2">
                        <div className="h-4 w-20 bg-white/5 rounded-lg" />
                        <div className="h-4 w-20 bg-white/5 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredStudents.map((s: any) => (
                  <motion.div
                    layout
                    key={s.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "obsidian-card group relative p-0 overflow-hidden transition-all border border-glass-border hover:border-brand-indigo/40 hover:shadow-2xl hover:shadow-brand-indigo/5 bg-white/[0.01]",
                      viewMode === 'list' && "flex items-center"
                    )}
                  >
                    {/* Visual Card Accent */}
                    <div className="absolute top-0 left-0 w-full h-1 aurora-gradient opacity-20 group-hover:opacity-100 transition-opacity" />
                    
                    <div className={cn("p-8 w-full", viewMode === 'list' && "flex items-center justify-between")}>
                      <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-[2.5rem] bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center font-black text-3xl text-brand-indigo relative shadow-inner group-hover:scale-105 transition-transform duration-500">
                          {s.name.charAt(0)}
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-emerald-500 border-4 border-obsidian" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-black text-2xl tracking-tight group-hover:text-brand-indigo transition-colors uppercase italic">{s.name}</h4>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-lg border border-emerald-500/20">Enrolled</span>
                          </div>
                        </div>
                      </div>

                      {viewMode === 'grid' && (
                        <div className="mt-10 pt-8 border-t border-glass-border grid grid-cols-1 gap-6">
                          {/* Parent Block */}
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

                          {/* Student Meta */}
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
                          onClick={() => setEditingStudent(s)}
                          className="p-3 rounded-xl bg-white/5 border border-glass-border hover:bg-white/10 text-text-secondary transition-all shadow-lg"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(s.id, s.name)}
                          disabled={deletingId === s.id}
                          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === s.id ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

            {filteredStudents.length === 0 && (
              <div className="py-40 obsidian-card border-dashed flex flex-col items-center justify-center gap-6 opacity-20 grayscale transition-all hover:opacity-40">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-glass-border flex items-center justify-center">
                  <Hash className="w-10 h-10 rotate-12" />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.3em]">No Active Deployments Found</p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="h-[500px] obsidian-card border-dashed flex flex-col items-center justify-center gap-10 opacity-20 text-center bg-white/[0.01]">
            <div className="w-32 h-32 rounded-[2.5rem] bg-white/5 border border-glass-border flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-brand-indigo/10 blur-2xl group-hover:scale-150 transition-transform duration-1000" />
              <Settings2 className="w-12 h-12 text-brand-indigo relative z-10" />
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-black tracking-tight uppercase italic glow-text">Segment Calibration Required</h3>
              <p className="text-sm font-bold max-w-sm mx-auto leading-relaxed opacity-60">
                The scholastic registry is contextually indexed. Select an Academic Rank and Operational Segment to initialize data views.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAdding(false)} className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-3xl obsidian-card border-brand-indigo/30 p-12 shadow-[0_0_100px_rgba(99,102,241,0.15)] overflow-hidden">
               <div className="absolute -top-20 -right-20 w-64 h-64 bg-brand-indigo/10 blur-[100px] rounded-full" />
              
              <div className="flex items-center justify-between mb-12 relative z-10">
                <div className="space-y-1">
                  <h2 className="text-4xl font-black tracking-tight uppercase italic">Enroll Identity</h2>
                  <p className="text-text-secondary text-sm font-medium opacity-60">Initialize new scholastic record within the current segment.</p>
                </div>
                <button onClick={() => { setIsAdding(false); setErrors({}); }} className="p-3 hover:bg-white/5 rounded-2xl transition-all border border-glass-border"><X className="w-8 h-8 opacity-40 hover:opacity-100" /></button>
              </div>

              {errors.submit && (
                <div className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {errors.submit}
                </div>
              )}
              
              <form onSubmit={handleCreate} className="space-y-10 relative z-10">
                <div className="grid grid-cols-2 gap-10">
                  {/* Left Column: Student Details */}
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
                          onChange={e => { setForm({...form, name: e.target.value}); if(errors.name) setErrors({...errors, name: ''}); }} 
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
                            onChange={e => { setForm({...form, dob: e.target.value}); if(errors.dob) setErrors({...errors, dob: ''}); }} 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">WhatsApp Contact</label>
                          <input placeholder="+91..." className="input-obsidian" value={form.whatsapp} onChange={e => setForm({...form, whatsapp: e.target.value})} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Parent Details */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-brand-indigo text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-80">
                       <User className="w-4 h-4" /> Guardian Metadata
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Parent/Guardian Name</label>
                        <input placeholder="e.g. Sarah Grayson" className="input-obsidian" value={form.parent_name} onChange={e => setForm({...form, parent_name: e.target.value})} />
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
                          onChange={e => { setForm({...form, parent_email: e.target.value}); if(errors.parent_email) setErrors({...errors, parent_email: ''}); }} 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Parent Phone Number</label>
                        <input placeholder="+91..." className="input-obsidian" value={form.parent_phone} onChange={e => setForm({...form, parent_phone: e.target.value})} />
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
                      className={cn(
                        "indigo-glow-button h-16 px-12 text-sm font-black uppercase tracking-[0.2em] italic",
                        isSubmitting && "opacity-50 cursor-wait"
                      )}
                    >
                      {isSubmitting ? 'Authorizing...' : 'Authorize Enrollment'} <ArrowRight className={cn("w-5 h-5 ml-3", isSubmitting && "animate-pulse")} />
                    </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal (Reuse similar structure) */}
      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingStudent(null)} className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-3xl obsidian-card border-brand-indigo/30 p-12 shadow-2xl">
              <div className="flex items-center justify-between mb-12">
                <div className="space-y-1">
                  <h2 className="text-4xl font-black tracking-tight uppercase italic">Configure Record</h2>
                  <p className="text-text-secondary text-sm font-medium opacity-60">Update scholastic and guardian identifiers.</p>
                </div>
                <button onClick={() => setEditingStudent(null)} className="p-3 hover:bg-white/5 rounded-2xl transition-all border border-glass-border"><X className="w-8 h-8 opacity-40" /></button>
              </div>

              {errors.submit && (
                <div className="mb-8 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {errors.submit}
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-10">
                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 text-brand-indigo">Identity Name</label>
                        <input className="input-obsidian" value={editingStudent.name} onChange={e => { setEditingStudent({...editingStudent, name: e.target.value}); if(errors.submit) setErrors({}); }} required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Date of Birth</label>
                          <input type="date" className="input-obsidian" value={editingStudent.dob} onChange={e => { setEditingStudent({...editingStudent, dob: e.target.value}); if(errors.submit) setErrors({}); }} required />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">WhatsApp Contact</label>
                          <input className="input-obsidian" value={editingStudent.whatsapp || ''} onChange={e => { setEditingStudent({...editingStudent, whatsapp: e.target.value}); if(errors.submit) setErrors({}); }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4 text-brand-indigo">Guardian Name</label>
                        <input className="input-obsidian" value={editingStudent.parent_name || ''} onChange={e => { setEditingStudent({...editingStudent, parent_name: e.target.value}); if(errors.submit) setErrors({}); }} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Guardian Email</label>
                        <input type="email" className="input-obsidian" value={editingStudent.parent_email || ''} onChange={e => { setEditingStudent({...editingStudent, parent_email: e.target.value}); if(errors.submit) setErrors({}); }} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary ml-4">Guardian Phone</label>
                        <input className="input-obsidian" value={editingStudent.parent_phone || ''} onChange={e => { setEditingStudent({...editingStudent, parent_phone: e.target.value}); if(errors.submit) setErrors({}); }} />
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
    </div>
  );
}
