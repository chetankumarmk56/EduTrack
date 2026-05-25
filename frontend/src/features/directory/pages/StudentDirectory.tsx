import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, LayoutGrid, List as ListIcon,
  Search, GraduationCap, Users, AlertCircle, X, ChevronDown
} from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/errorHandler';
import StudentCard from '@/features/directory/components/StudentCard';
import EnrollStudentModal from '@/features/directory/components/EnrollStudentModal';
import EditStudentModal from '@/features/directory/components/EditStudentModal';

export default function StudentDirectory() {
  const {
    students,
    schoolClasses,
    grades,
    refreshDirectory,
    refreshStudents,
    isDirectoryLoading
  } = useApp();

  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(() => {
    const saved = localStorage.getItem('student_directory_grade_id');
    return saved ? Number(saved) : null;
  });
  const [selectedSchoolClassId, setSelectedSchoolClassId] = useState<number | null>(() => {
    const saved = localStorage.getItem('student_directory_class_id');
    return saved ? Number(saved) : null;
  });

  // Fetch only the selected class's students. With no class selected
  // (first visit), we skip the fetch entirely — there's nothing to
  // render until the user picks a class anyway. Previously this page
  // pulled up to 500 students on mount and filtered client-side.
  useEffect(() => {
    if (selectedSchoolClassId) {
      refreshStudents({ schoolClassId: selectedSchoolClassId });
    }
  }, [selectedSchoolClassId, refreshStudents]);
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

    list.sort((a, b) =>
      ((a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER)) ||
      a.name.localeCompare(b.name),
    );

    let listWithRoll = list.map((s, idx) => ({
      ...s,
      roll_number: s.roll_number ?? idx + 1,
    }));

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

  const totalInClass = useMemo(() => {
    if (!selectedSchoolClassId) return 0;
    return students.filter((s: any) =>
      s.school_class_id === selectedSchoolClassId ||
      s.school_class?.id === selectedSchoolClassId ||
      s.classroom?.id === selectedSchoolClassId
    ).length;
  }, [students, selectedSchoolClassId]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" from records? This cannot be undone.`)) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await directoryApi.deleteStudent(id);
      refreshStudents();
    } catch (err: any) {
      const error = getErrorMessage(err);
      setDeleteError(error.message || 'Failed to remove student. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedGrade = grades.find(g => g.id === selectedGradeId);
  const selectedClass = schoolClasses.find(sc => sc.id === selectedSchoolClassId);

  return (
    <div className="w-full animate-fade-in flex flex-col gap-8 pb-20">

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
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <GraduationCap className="w-3 h-3" /> Student Registry
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gradient-indigo">Student Roster</h1>
          <p className="text-text-secondary text-sm font-medium max-w-xl">
            Manage enrolled students and their parent/guardian information.
          </p>
        </div>

        {selectedSchoolClassId && (
          <button onClick={() => setIsAdding(true)} className="indigo-glow-button h-[50px] px-7 self-start xl:self-auto">
            <UserPlus className="w-4 h-4 mr-2" /> Enroll Student
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="obsidian-card p-6 border-brand-indigo/15 bg-brand-indigo/[0.02]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">

          {/* Grade selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-1.5">
              <GraduationCap className="w-3 h-3" /> Class / Grade
            </label>
            <div className="relative">
              <select
                className="input-obsidian cursor-pointer font-semibold text-sm appearance-none pr-10"
                value={selectedGradeId || ''}
                onChange={e => {
                  setSelectedGradeId(Number(e.target.value));
                  setSelectedSchoolClassId(null);
                  setSearchTerm('');
                }}
              >
                <option value="">Select a grade...</option>
                {grades.sort((a, b) => a.level - b.level).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
            </div>
          </div>

          {/* Section selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Section
            </label>
            <div className="relative">
              <select
                className="input-obsidian cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-semibold text-sm appearance-none pr-10"
                disabled={!selectedGradeId}
                value={selectedSchoolClassId || ''}
                onChange={e => { setSelectedSchoolClassId(Number(e.target.value)); setSearchTerm(''); }}
              >
                <option value="">{selectedGradeId ? 'Choose a section...' : 'Select grade first'}</option>
                {filteredSchoolClasses.map(sc => (
                  <option key={sc.id} value={sc.id}>Section {sc.display_name?.split('-').pop() || sc.section?.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
            </div>
          </div>

          {/* Search */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">Search</label>
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-brand-indigo transition-colors" />
              <input
                placeholder="Name, parent name or email..."
                className="input-obsidian pl-10 text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                disabled={!selectedSchoolClassId}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* View toggle + count */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary">View</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white/5 border border-glass-border rounded-xl p-1 flex-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn("flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5", viewMode === 'grid' ? "bg-brand-indigo text-white shadow-lg" : "text-text-secondary hover:text-white")}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Grid</span>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn("flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5", viewMode === 'list' ? "bg-brand-indigo text-white shadow-lg" : "text-text-secondary hover:text-white")}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-wider">List</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip when class is selected */}
      {selectedSchoolClassId && (
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-black text-white">{totalInClass}</span>
            <span className="text-text-secondary font-medium">students enrolled</span>
            {selectedGrade && selectedClass && (
              <span className="text-text-secondary opacity-50">in {selectedGrade.name} · Section {selectedClass.display_name?.split('-').pop()}</span>
            )}
          </div>
          {searchTerm && filteredStudents.length !== totalInClass && (
            <div className="flex items-center gap-2 text-xs text-brand-indigo font-bold">
              <Search className="w-3 h-3" />
              {filteredStudents.length} match{filteredStudents.length !== 1 ? 'es' : ''} for "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {/* Student Grid / Empty State */}
      <div className="min-h-[400px]">
        {selectedSchoolClassId ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className={cn(
              "grid gap-5 transition-all duration-500",
              viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
            )}>
              {isDirectoryLoading && students.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="obsidian-card p-7 space-y-6 animate-pulse border-glass-border">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/5" />
                      <div className="space-y-2 flex-1">
                        <div className="h-5 w-3/4 bg-white/5 rounded-lg" />
                        <div className="h-3 w-1/3 bg-white/5 rounded-lg" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-16 w-full bg-white/5 rounded-xl" />
                      <div className="flex justify-between items-center px-1">
                        <div className="h-3 w-16 bg-white/5 rounded-lg" />
                        <div className="h-3 w-16 bg-white/5 rounded-lg" />
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

            {!isDirectoryLoading && filteredStudents.length === 0 && (
              <div className="py-32 obsidian-card border-dashed flex flex-col items-center justify-center gap-5 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-glass-border flex items-center justify-center">
                  <Search className="w-7 h-7 text-text-secondary opacity-40" />
                </div>
                <div className="space-y-1 opacity-50">
                  <p className="text-sm font-black uppercase tracking-widest">No students found</p>
                  {searchTerm ? (
                    <p className="text-xs text-text-secondary">Try a different name or clear the search</p>
                  ) : (
                    <p className="text-xs text-text-secondary">No students enrolled in this section yet</p>
                  )}
                </div>
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="text-xs text-brand-indigo font-bold hover:underline">Clear search</button>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="h-[440px] obsidian-card border-dashed flex flex-col items-center justify-center gap-8 text-center bg-white/[0.01]">
            <div className="w-24 h-24 rounded-3xl bg-white/5 border border-glass-border flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-brand-indigo/10 blur-2xl" />
              <GraduationCap className="w-10 h-10 text-brand-indigo/60 relative z-10" />
            </div>
            <div className="space-y-2 opacity-60">
              <h3 className="text-xl font-black tracking-tight">Select a Class & Section</h3>
              <p className="text-sm font-medium max-w-xs mx-auto text-text-secondary leading-relaxed">
                Choose a grade and section above to view and manage enrolled students.
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
