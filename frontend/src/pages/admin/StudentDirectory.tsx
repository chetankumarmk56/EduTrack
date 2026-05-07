import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  Settings2,
  LayoutGrid, List as ListIcon,
  Filter, Search, School, Layers,
  Hash, AlertCircle, X
} from 'lucide-react';
import { directoryApi } from '../../api/directoryApi';
import { useApp } from '../../lib/AppContext';
import { cn } from '../../lib/utils';
import { getErrorMessage } from '../../lib/errorHandler';
import StudentCard from '../../components/students/StudentCard';
import EnrollStudentModal from '../../components/students/EnrollStudentModal';
import EditStudentModal from '../../components/students/EditStudentModal';

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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    refreshDirectory();
  }, []);

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
      return s.school_class_id === selectedSchoolClassId ||
        s.school_class?.id === selectedSchoolClassId ||
        s.classroom?.id === selectedSchoolClassId;
    });

    list.sort((a, b) => a.name.localeCompare(b.name));

    let listWithRoll = list.map((s, idx) => ({ ...s, roll_number: idx + 1 }));

    if (searchTerm) {
      const lowSearch = searchTerm.toLowerCase();
      listWithRoll = listWithRoll.filter(s =>
        s.name.toLowerCase().includes(lowSearch) ||
        s.parent_name?.toLowerCase().includes(lowSearch) ||
        s.parent_email?.toLowerCase().includes(lowSearch)
      );
    }

    return listWithRoll;
  }, [students, selectedSchoolClassId, searchTerm]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove student "${name}" from records? This action cannot be undone.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await directoryApi.deleteStudent(id);
      refreshStudents();
    } catch (err: any) {
      const error = getErrorMessage(err);
      setDeleteError(error.message || 'Failed to delete student. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-10 pb-20">

      {deleteError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="opacity-50 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
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
            <button onClick={() => setIsAdding(true)} className="indigo-glow-button h-[54px] px-8">
              <UserPlus className="w-4 h-4 mr-2" /> Enroll Student
            </button>
          </div>
        )}
      </div>

      {/* Control Bar */}
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
              {grades.sort((a, b) => a.level - b.level).map(g => (
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

      {/* Student Grid / Empty State */}
      <div className="min-h-[400px]">
        {selectedSchoolClassId ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
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
                    <StudentCard
                      key={s.id}
                      student={s}
                      viewMode={viewMode}
                      onEdit={setEditingStudent}
                      onDelete={handleDelete}
                      deletingId={deletingId}
                    />
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

      <EnrollStudentModal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        selectedSchoolClassId={selectedSchoolClassId}
        onEnrolled={refreshStudents}
      />

      <EditStudentModal
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onUpdated={refreshStudents}
      />
    </div>
  );
}
