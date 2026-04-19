import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, Mail, BookOpen, Users, GraduationCap } from 'lucide-react';
import { directoryApi, type TeacherWithPassword } from '../api/directoryApi';

export default function Teachers() {
  const [teachers, setTeachers] = useState<TeacherWithPassword[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    directoryApi.getMyTeachers()
      .then(setTeachers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Skeleton cards
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Teachers Directory</h1>
          <p className="text-muted-foreground">Loading your subject teachers…</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card shadow-sm p-6 animate-pulse">
              <div className="flex gap-4 items-center mb-6">
                <div className="h-14 w-14 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="mt-6 flex gap-3">
                <div className="flex-1 h-10 bg-muted rounded-lg" />
                <div className="flex-1 h-10 bg-muted rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Teachers Directory</h1>
        <p className="text-muted-foreground">
          Contact your subject teachers directly by call or WhatsApp.
        </p>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-16 text-center shadow-sm">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-semibold text-lg text-foreground mb-2">No Teachers Linked Yet</h3>
          <p className="text-muted-foreground text-sm">
            The school administration hasn't linked subject teachers to your class yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {teachers.map((teacher, index) => {
            const relevantAssignment = teacher.assignments?.[0];
            const phone = teacher.phone?.replace(/\s+/g, '') || '';

            return (
              <motion.div
                key={teacher.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.08 }}
                className="rounded-xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="p-6 flex-1">
                  <div className="flex gap-4 items-center">
                    <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0">
                      {teacher.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg leading-tight truncate">{teacher.name}</h3>
                      <div className="flex items-center text-sm font-medium text-primary mt-1">
                        <BookOpen className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                        <span className="truncate">
                          {relevantAssignment?.subject || 'Subject Teacher'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2.5">
                    {teacher.email && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Mail className="w-4 h-4 mr-3 flex-shrink-0" />
                        <span className="truncate">{teacher.email}</span>
                      </div>
                    )}
                    {phone && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Phone className="w-4 h-4 mr-3 flex-shrink-0" />
                        <span>{teacher.phone}</span>
                      </div>
                    )}
                    {teacher.assignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {teacher.assignments.map((a: any) => (
                          <span key={a.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {a.class_level}-{a.section} · {a.subject}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border p-4 bg-muted/30 flex gap-3">
                  {phone ? (
                    <>
                      <a
                        href={`tel:${phone}`}
                        className="flex-1 inline-flex justify-center items-center py-2.5 bg-card hover:bg-muted border border-border text-foreground font-medium text-sm rounded-lg transition-colors shadow-sm"
                      >
                        <Phone className="w-4 h-4 mr-2 text-primary" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex justify-center items-center py-2.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 text-[#128C7E] dark:text-[#25D366] font-medium text-sm rounded-lg transition-colors shadow-sm"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                      </a>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center py-2.5 text-muted-foreground/50 text-sm italic gap-2">
                      <GraduationCap className="w-4 h-4" />
                      No contact info available
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
