import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, MessageCircle, Users, Search, ChevronDown, ChevronUp, GraduationCap, UserCircle2 } from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import type { Student } from '@/shared/types';

interface ParentContact {
  studentId: number;
  studentName: string;
  parentName?: string;
  relation?: string;
  phone?: string;
  classLevel: string;
  section: string;
}

function dialPhone(phone: string) {
  window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
}

function openWhatsApp(phone: string, studentName: string) {
  const num = phone.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent(`Hello, I'm ${studentName}'s teacher. I wanted to connect with you regarding your child.`);
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
}

export default function ContactList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    directoryApi.getMyStudents()
      .then(data => {
        setStudents(data);
        // Auto-expand all groups
        const groups: Record<string, boolean> = {};
        data.forEach(s => {
          const key = `${s.class_level || (s.school_class?.grade?.name ?? '')}-${s.section || (s.school_class?.section?.name ?? '')}`;
          groups[key] = true;
        });
        setExpandedGroups(groups);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Build flat contact list — whatsapp/alternate are directly on the student record (parent's contact number)
  const contacts: ParentContact[] = students.map(s => ({
    studentId: s.id,
    studentName: s.name,
    parentName: s.parent?.name,
    relation: s.parent?.relation,
    phone: s.whatsapp || (s as any).alternate,  // whatsapp = primary parent contact, alternate = secondary
    classLevel: s.class_level || String(s.school_class?.grade?.name ?? ''),
    section: s.section || (s.school_class?.section?.name ?? ''),
  }));

  // Group by class-section
  const grouped = contacts.reduce<Record<string, ParentContact[]>>((acc, c) => {
    const key = `Class ${c.classLevel} – Section ${c.section}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const filteredGrouped = Object.entries(grouped).reduce<Record<string, ParentContact[]>>((acc, [key, list]) => {
    const filtered = list.filter(c =>
      c.studentName.toLowerCase().includes(search.toLowerCase()) ||
      (c.parentName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (c.phone?.includes(search) ?? false)
    );
    if (filtered.length > 0) {
      // Standardized alphabetical sorting for roll assignment
      acc[key] = filtered.sort((a, b) => a.studentName.localeCompare(b.studentName));
    }
    return acc;
  }, {});

  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const totalStudents = contacts.length;
  const withParent = contacts.filter(c => c.phone).length;

  return (
    <div className="space-y-5 max-w-5xl pb-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl aurora-gradient flex items-center justify-center shadow-lg aurora-glow shrink-0">
              <Phone className="w-5 h-5 text-white" />
            </div>
            Contact List
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-12">Parent contacts for your assigned classes</p>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <GraduationCap className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{totalStudents}</span>
            <span className="text-xs text-muted-foreground">Students</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
            <Phone className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-foreground">{withParent}</span>
            <span className="text-xs text-muted-foreground">Contactable</span>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by student, parent name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/30 transition-all text-sm"
        />
      </motion.div>

      {/* Groups */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 animate-pulse">
              <div className="h-5 w-48 bg-white/10 rounded-lg mb-4" />
              {[1, 2, 3].map(j => (
                <div key={j} className="flex items-center gap-4 py-3 border-t border-white/5">
                  <div className="h-10 w-10 rounded-xl bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-white/10 rounded" />
                    <div className="h-3 w-24 bg-white/10 rounded" />
                  </div>
                  <div className="h-8 w-20 bg-white/10 rounded-xl" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : Object.keys(filteredGrouped).length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="py-20 text-center flex flex-col items-center gap-4"
        >
          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-foreground font-semibold">No students found</p>
            <p className="text-muted-foreground text-sm mt-1">
              {students.length === 0
                ? 'No classes are assigned to you yet. Ask your admin to add assignments.'
                : 'No results match your search.'}
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {Object.entries(filteredGrouped).map(([groupKey, list], gIdx) => (
            <motion.div
              key={groupKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gIdx * 0.06, type: 'spring', stiffness: 120, damping: 20 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden shadow-xl"
            >
              {/* Group header */}
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl aurora-gradient flex items-center justify-center shrink-0 aurora-glow">
                    <GraduationCap className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-foreground">{groupKey}</span>
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    {list.length} students
                  </span>
                </div>
                {expandedGroups[groupKey]
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </button>

              <AnimatePresence initial={false}>
                {expandedGroups[groupKey] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-white/5 border-t border-white/10">
                      {list.map((contact, idx) => (
                        <motion.div
                          key={contact.studentId}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors group"
                        >
                          {/* Avatar & Roll */}
                          <div className="relative">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                              {contact.studentName.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute -top-1.5 -left-1.5 bg-brand-indigo text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                              #{idx + 1}
                            </div>
                          </div>

                          {/* Student & Parent Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{contact.studentName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {contact.parentName ? (
                                <>
                                  <UserCircle2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate">
                                    {contact.parentName}
                                    {contact.relation && (
                                      <span className="ml-1 text-primary/70">({contact.relation})</span>
                                    )}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground/40 italic">No parent linked</span>
                              )}
                            </div>
                          </div>

                          {/* Phone display */}
                          {contact.phone && (
                            <span className="text-xs font-mono text-muted-foreground hidden sm:block">
                              {contact.phone}
                            </span>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2 shrink-0">
                            {contact.phone ? (
                              <>
                                <motion.button
                                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                                  onClick={() => dialPhone(contact.phone!)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
                                  title="Call parent"
                                >
                                  <Phone className="w-3 h-3" /> Call
                                </motion.button>
                                <motion.button
                                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                                  onClick={() => openWhatsApp(contact.phone!, contact.studentName)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-bold hover:bg-[#25D366]/20 transition-all"
                                  title="WhatsApp parent"
                                >
                                  <MessageCircle className="w-3 h-3" /> WhatsApp
                                </motion.button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground/30 italic px-2">No contact</span>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
