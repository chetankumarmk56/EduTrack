import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/shared/contexts/AppContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Save, AlertCircle, Check, ChevronDown, Hash, UserCircle, Clock, Users, PieChart } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { attendanceApi } from '@/features/attendance/api';
import { directoryApi } from '@/features/directory/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import ConfirmModal from '@/shared/components/ui/ConfirmModal';
import DatePicker from '@/shared/components/ui/DatePicker';
import { useToast } from '@/shared/components/ui/Toast';
import type { Student } from '@/shared/types';

export default function TeacherAttendance() {
  const { user } = useAuth();
  const { teacherDirectory, teacherStats, fetchTeacherStats, activeAssignmentId, setActiveAssignmentId, refreshDirectory } = useApp();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Direct fetch — bypass AppContext cache so newly-enrolled students always show.
  const [classDirectory, setClassDirectory] = useState<Student[]>([]);
  useEffect(() => {
    refreshDirectory(true);
    directoryApi.getMyStudents()
      .then((data) => setClassDirectory(data || []))
      .catch(err => console.error('[TeacherAttendance] getMyStudents failed', err));
  }, [refreshDirectory]);

  // Find current teacher's assignments
  const teacherIdentity = user?.id;
  const currentTeacher = teacherDirectory.find((t) => t.user_id === teacherIdentity);
  const assignments = currentTeacher?.assignments || [];

  // Set initial assignment OR reset if the cached id doesn't belong to this teacher
  useEffect(() => {
    if (assignments.length === 0) return;
    const stillValid = assignments.some((a) => a.id === activeAssignmentId);
    if (!activeAssignmentId || !stillValid) {
      setActiveAssignmentId(assignments[0].id);
    }
  }, [assignments, activeAssignmentId]);

  const activeAssignment = assignments.find((a) => a.id === activeAssignmentId) || assignments[0];

  // Local state to track dynamic attendance status per student ID for the selected date
  const [localAttendance, setLocalAttendance] = useState<Record<number, 'present' | 'absent' | 'late'>>({});

  // Snapshot of the last server state for the current date / class / subject.
  // `null` means no record has ever been saved for this combo — in that case
  // Save is enabled so the teacher can commit the baseline. Otherwise we
  // compare against this snapshot to decide whether anything has changed.
  const [serverSnapshot, setServerSnapshot] = useState<Record<number, 'present' | 'absent' | 'late'> | null>(null);

  const isWeekend = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }, [selectedDate]);

  // Sync from backend natively!
  const fetchAttendanceForDate = async (filteredStudents: Student[]) => {
    if (!activeAssignment) return;

    setIsFetching(true);
    // Reset the snapshot up-front; the fetch result will set the next one.
    setServerSnapshot(null);

    const newLocalStatus: Record<number, 'present' | 'absent' | 'late'> = {};

    // Initialize all students to 'present' first
    filteredStudents.forEach(s => {
        newLocalStatus[s.id] = 'present';
    });

    let hasServerRecords = false;
    try {
        const data = await attendanceApi.getClassAttendance(
            activeAssignment.school_class.id,
            selectedDate,
            activeAssignment.subject_ref.name
        );

        data.forEach((record) => {
            newLocalStatus[record.student_id] = record.status.toLowerCase() as 'present' | 'absent' | 'late';
        });
        hasServerRecords = data.length > 0;
    } catch(err) {
        console.error("Error fetching class attendance:", err);
    } finally {
        setIsFetching(false);
    }

    setLocalAttendance(newLocalStatus);
    // Only snapshot when we actually got server records — otherwise the
    // teacher still needs to write the baseline, so Save stays enabled.
    setServerSnapshot(hasServerRecords ? { ...newLocalStatus } : null);
    setSaveStatus('idle');
  };

  const filteredDB = useMemo(() => {
    if (!activeAssignment) return [];
    const targetClassId = activeAssignment.school_class?.id;
    const list = classDirectory.filter((s) => {
      const sClassId = s.school_class?.id ?? s.school_class_id;
      return String(sClassId) === String(targetClassId);
    });
    // Backend assigns roll_number in alphabetical order; sort by it so the row
    // numbers shown match the persisted roll numbers everywhere else.
    return list.sort((a, b) => {
      const ra = a.roll_number ?? Number.MAX_SAFE_INTEGER;
      const rb = b.roll_number ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }, [classDirectory, activeAssignment]);

  useEffect(() => {
     if (filteredDB.length > 0 && activeAssignment) {
        fetchAttendanceForDate(filteredDB);
        fetchTeacherStats();
     }
  }, [classDirectory, activeAssignment, selectedDate]);


  const markStudent = (id: number, status: 'present' | 'absent' | 'late') => {
    setLocalAttendance(prev => ({ ...prev, [id]: status }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const [showCommitConfirm, setShowCommitConfirm] = useState(false);
  const toast = useToast();

  // Whether the current local state differs from the last server snapshot
  // for this date / class / subject. When no snapshot exists yet (no record
  // has ever been saved for this combo) we treat the page as dirty so the
  // teacher can commit the baseline.
  const isDirty = useMemo(() => {
    if (filteredDB.length === 0) return false;
    if (!serverSnapshot) return true;
    return filteredDB.some(s => {
      const current = localAttendance[s.id] || 'present';
      const saved = serverSnapshot[s.id] || 'present';
      return current !== saved;
    });
  }, [filteredDB, localAttendance, serverSnapshot]);

  const requestSaveAttendance = () => {
    if (!activeAssignment || filteredDB.length === 0) return;
    setShowCommitConfirm(true);
  };

  const performSaveAttendance = async () => {
    if (!activeAssignment || filteredDB.length === 0) return;
    setShowCommitConfirm(false);
    setIsSaving(true);
    setSaveStatus('idle');

    const records = filteredDB.map((student) => ({
      student_id: student.id,
      subject: activeAssignment.subject_ref.name,
      date: selectedDate,
      status: ((localAttendance[student.id] || 'present').charAt(0).toUpperCase() + (localAttendance[student.id] || 'present').slice(1)) as 'Present' | 'Absent' | 'Late'
    }));

    try {
      await attendanceApi.markAttendanceBatch({
        date: selectedDate,
        school_class_id: activeAssignment.school_class.id,
        subject: activeAssignment.subject_ref.name,
        records: records.map((r) => ({ student_id: r.student_id, status: r.status }))
      });
      setSaveStatus('success');
      fetchTeacherStats();
      // Snapshot the committed state so the Save button re-disables until
      // the teacher makes another change.
      setServerSnapshot({ ...localAttendance });
      toast.success('Attendance saved', `${records.length} student${records.length === 1 ? '' : 's'} on ${selectedDate}.`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error("Failed to save attendance batch", err);
      setSaveStatus('error');
      toast.error('Could not save attendance', getErrorMessage(err).message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-10 pb-20">
      {/* Attendance Stats Bar */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] premium-card p-4 bg-emerald-500/5 border-emerald-500/20 flex items-center gap-4 group">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
             <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-emerald-400/60 tracking-widest">Marked Present</p>
            <p className="text-xl font-black mt-0.5 tabular-nums">
              {Object.values(localAttendance).filter(v => v === 'present').length} / {filteredDB.length}
            </p>
          </div>
        </div>
        
        <div className="flex-1 min-w-[200px] premium-card p-4 bg-card/40 border-glass-border flex items-center gap-4">
          <div className="p-3 rounded-xl bg-muted/40 text-muted-foreground group-hover:scale-110 transition-transform">
             <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">Assigned Students</p>
            <p className="text-xl font-black mt-0.5 tabular-nums">{filteredDB.length}</p>
          </div>
        </div>

        <div className="flex-1 min-w-[200px] premium-card p-4 bg-purple-500/5 border-purple-500/20 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
             <PieChart className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-purple-400/60 tracking-widest">Global Punctuality</p>
            <p className="text-xl font-black mt-0.5 tabular-nums">{teacherStats?.attendance_rate || 0}%</p>
          </div>
        </div>
      </div>

      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 pb-4 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.3em] aurora-glow">
            <CheckCircle2 className="h-3.5 w-3.5 fill-primary" />
            Registry Hub
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-foreground -mb-1">
            Student Attendance
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-6">
              <div className="flex items-center gap-3 bg-muted/30 border border-primary/20 rounded-2xl px-5 py-3 shadow-premium group hover:border-primary/40 transition-all backdrop-blur-md">
                <span className="text-[10px] font-black uppercase text-primary tracking-widest">Active Class:</span>
                <select 
                   value={activeAssignmentId || ''} 
                   onChange={(e) => setActiveAssignmentId(Number(e.target.value))}
                   className="bg-transparent text-sm font-black text-foreground focus:outline-none cursor-pointer pr-2 appearance-none"
                >
                  {assignments.length === 0 && <option value="">No Classes Assigned</option>}
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id} className="bg-card text-foreground font-sans">
                      {a.school_class.grade?.name}-{a.school_class.section?.name} ({a.subject_ref.name})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors" />
              </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <DatePicker
            value={selectedDate}
            onChange={(v) => setSelectedDate(v)}
            className="px-4 py-4 border border-white/10 rounded-2xl bg-muted/30 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:border-primary/30"
          />

          <motion.button
            whileHover={!isDirty || isSaving ? undefined : { scale: 1.02, translateY: -2 }}
            whileTap={!isDirty || isSaving ? undefined : { scale: 0.98 }}
            onClick={requestSaveAttendance}
            disabled={isSaving || filteredDB.length === 0 || !isDirty}
            title={
              filteredDB.length === 0
                ? 'No students to record'
                : !isDirty
                  ? 'No changes to save'
                  : undefined
            }
            className={cn(
               "relative group overflow-hidden px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center gap-3 disabled:cursor-not-allowed",
                isSaving || saveStatus === 'success'
                  ? "bg-emerald-500 text-white shadow-emerald-500/20"
                  : saveStatus === 'error'
                    ? "bg-red-500 text-white shadow-red-500/20"
                    : !isDirty
                      ? "bg-muted/40 text-muted-foreground border border-glass-border shadow-none opacity-70"
                      : "aurora-gradient text-white shadow-primary/20 aurora-glow aurora-pulse aurora-border-trace"
            )}
          >
            {isDirty && !isSaving && saveStatus === 'idle' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            )}
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Clock className="w-5 h-5" />
              </motion.div>
            ) : saveStatus === 'success' || !isDirty ? (
              <Check className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving
              ? 'Saving…'
              : saveStatus === 'success'
                ? 'Saved!'
                : !isDirty
                  ? 'Saved'
                  : 'Save'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {isWeekend && (
          <motion.div 
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            className="rounded-2xl bg-primary/10 border border-primary/20 p-5 flex items-center gap-4 text-primary backdrop-blur-md aurora-glow"
          >
            <AlertCircle className="w-6 h-6 flex-shrink-0 animate-pulse" />
            <p className="text-xs font-black uppercase tracking-widest">
              Security Protocol Notice: Weekend selected. Automated record keeping disabled.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="premium-card bg-card/40 border-glass-border overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/10">
              <tr>
                <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5" /> ID</div></th>
                <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60"><div className="flex items-center gap-2"><UserCircle className="w-3.5 h-3.5" /> Student Identity</div></th>
                <th className="px-10 py-6 font-black uppercase tracking-[0.3em] text-[10px] text-muted-foreground/60 text-right">Registry Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {isFetching ? (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={3} className="px-8 py-32 text-center text-muted-foreground/30 italic font-black uppercase tracking-widest text-xs">
                       Establishing secure ledger connection...
                    </td>
                  </motion.tr>
                ) : filteredDB.length === 0 ? (
                  <motion.tr 
                    key="no-students"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={3} className="px-8 py-32 text-center text-muted-foreground/30 italic font-black uppercase tracking-widest text-xs">
                      {activeAssignment 
                        ? "Sector is currently vacant. No candidates found."
                        : "Initialize assignment protocol to proceed."}
                    </td>
                  </motion.tr>
                ) : (
                  filteredDB.map((student, idx: number) => {
                    const status = localAttendance[student.id];
                    
                    if (!status) return (
                      <tr key={student.id} className="animate-pulse">
                        <td className="px-10 py-8 bg-muted/10 h-16 rounded-lg" colSpan={3}></td>
                      </tr>
                    ); 

                    return (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: idx * 0.02 }}
                        key={student.id} 
                        className="group transition-all hover:bg-white/5"
                      >
                         <td className="px-10 py-6 font-black text-xs opacity-30 tracking-[0.2em] group-hover:opacity-100 group-hover:text-primary transition-all">
                           #{ (student.roll_number ?? idx + 1).toString().padStart(2, '0') }
                         </td>
                        <td className="px-10 py-6">
                           <div className="flex items-center gap-5">
                              <div className={cn(
                                "w-11 h-11 rounded-2xl flex items-center justify-center font-black transition-all border border-white/5 group-hover:scale-110 group-hover:border-primary/30",
                                status === 'present' ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground'
                              )}>
                                 {student.name.charAt(0)}
                              </div>
                              <div>
                                 <p className="font-black tracking-tight text-lg group-hover:text-primary transition-colors">{student.name}</p>
                                 <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 group-hover:text-primary/40 transition-colors">Registered Student</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex justify-end gap-3">
                            <button 
                              onClick={() => markStudent(student.id, 'present')}
                              className={cn(
                                "px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center transition-all border",
                                status === 'present' 
                                  ? 'aurora-gradient text-white aurora-glow' 
                                  : 'bg-muted/40 border-white/5 text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/40'
                              )}
                            >
                              P
                            </button>
                            <button 
                              onClick={() => markStudent(student.id, 'absent')}
                              className={cn(
                                "px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center transition-all border",
                                status === 'absent' 
                                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                                  : 'bg-muted/40 border-white/5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40'
                              )}
                            >
                              A
                            </button>
                            <button 
                              onClick={() => markStudent(student.id, 'late')}
                              className={cn(
                                "px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center transition-all border",
                                status === 'late' 
                                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' 
                                  : 'bg-muted/40 border-white/5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40'
                              )}
                            >
                              L
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={showCommitConfirm}
        title="Save attendance?"
        description={
          activeAssignment
            ? `${activeAssignment.subject_ref.name} — ${selectedDate}. ${filteredDB.length} student${filteredDB.length === 1 ? '' : 's'} will be recorded.`
            : 'Attendance records will be saved.'
        }
        confirmLabel="Save attendance"
        tone="primary"
        isLoading={isSaving}
        onConfirm={performSaveAttendance}
        onCancel={() => !isSaving && setShowCommitConfirm(false)}
      />
    </div>
  );
}
