import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, BookOpen, Clock, Users, Briefcase, GraduationCap, Building } from 'lucide-react';
import { useApp } from '../../lib/AppContext';
import { useAuth } from '../../lib/AuthContext';

export default function TeacherProfile() {
  const { user } = useAuth();
  const { teacherDirectory, classDirectory, institutionName } = useApp();
  const teacherIdentity = user?.id; // Assuming user.id is the teacher identity

  const currentTeacher = useMemo(() => 
    teacherDirectory.find((t: any) => t.user_id === teacherIdentity),
    [teacherDirectory, teacherIdentity]
  );

  const assignments = currentTeacher?.assignments || [];

  // Count unique students across all assignments
  const studentCount = useMemo(() => {
    if (!assignments.length) return 0;
    const studentIds = new Set<number>();
    assignments.forEach((a: any) => {
      classDirectory
        .filter((s: any) => s.school_class_id === a.school_class_id)
        .forEach((s: any) => studentIds.add(s.id));
    });
    return studentIds.size;
  }, [assignments, classDirectory]);

  if (!currentTeacher) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic space-y-4 pt-20">
        <GraduationCap className="w-16 h-16 opacity-20" />
        <p>No educator profile loaded. Please log in again.</p>
      </div>
    );
  }

  const initials = currentTeacher.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Educator Profile</h1>
          <p className="text-muted-foreground">Your identity and current class assignments</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Identity Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-1 md:col-span-1 rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
        >
          <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-700 relative overflow-hidden">
            {/* Animated pattern overlay */}
            <div className="absolute inset-0 opacity-20">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="profile-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#profile-grid)" />
              </svg>
            </div>
            <div className="absolute -bottom-12 left-6 h-24 w-24 rounded-full border-4 border-card bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center font-bold text-2xl text-white shadow-xl">
              {initials}
            </div>
          </div>
          <div className="px-6 pt-16 pb-6">
            <h2 className="text-2xl font-bold text-foreground">{currentTeacher.name}</h2>
            <p className="text-emerald-600 font-medium mb-1">{currentTeacher.subject} Specialist</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-500/20">
                Active Faculty
              </span>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center text-sm text-muted-foreground group hover:text-foreground transition-colors">
                <Mail className="h-4 w-4 mr-3 flex-shrink-0 group-hover:text-emerald-500 transition-colors" />
                <span className="truncate">{currentTeacher.email || 'Not available'}</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground group hover:text-foreground transition-colors">
                <Phone className="h-4 w-4 mr-3 flex-shrink-0 group-hover:text-emerald-500 transition-colors" />
                <span>{currentTeacher.phone || 'Not available'}</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground group hover:text-foreground transition-colors">
                <Building className="h-4 w-4 mr-3 flex-shrink-0 group-hover:text-emerald-500 transition-colors" />
                <span>{institutionName}</span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-border">
              <div className="text-center p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="text-2xl font-black text-foreground">{assignments.length}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Classes</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="text-2xl font-black text-foreground">{studentCount}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Students</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Info Cards */}
        <div className="col-span-1 md:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-emerald-600" />
              Current Class Assignments
            </h3>
            <div className="space-y-3">
              {assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground italic border-2 border-dashed border-border rounded-xl">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>No class assignments found. Contact administration.</p>
                </div>
              ) : (
                assignments.map((a: any, i: number) => {
                  const classStudents = classDirectory.filter(
                    (s: any) => s.school_class_id === a.school_class_id
                  );
                  return (
                    <motion.div 
                      key={a.id || i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/20 hover:border-emerald-500/30 transition-all group"
                    >
                      <div>
                        <h4 className="font-bold text-foreground group-hover:text-emerald-500 transition-colors">
                          Class {a.class_level}-{a.section}
                        </h4>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <BookOpen className="w-3 h-3" />
                          {a.subject}
                          <span className="text-muted-foreground/50">•</span>
                          <Users className="w-3 h-3" />
                          {classStudents.length} Students
                        </p>
                      </div>
                      <div className="mt-2 sm:mt-0 flex items-center text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <Clock className="w-4 h-4 mr-1.5" />
                        Active
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
