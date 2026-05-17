import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Phone, MessageCircle, Users, Search, GraduationCap, UserCircle2, Filter, X } from 'lucide-react';
import { directoryApi } from '@/features/directory/api';
import type { Student } from '@/shared/types';
import { cn } from '@/shared/lib/utils';

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

/** Strip "Grade " / "Class " prefixes so "Grade 10" → "10". */
function shortGrade(level: string): string {
  return level.replace(/^(grade|class)\s+/i, '').trim();
}

/** Combine "10" + "A" → "10A" for a compact class chip label. */
function compactClassLabel(level: string, section: string): string {
  const g = shortGrade(level);
  return section ? `${g}${section}` : g;
}

/** Sort groups by numeric grade asc, then section A→Z. */
function compareGroups(a: ParentContact[], b: ParentContact[]): number {
  const ga = parseInt(shortGrade(a[0].classLevel), 10);
  const gb = parseInt(shortGrade(b[0].classLevel), 10);
  if (!Number.isNaN(ga) && !Number.isNaN(gb) && ga !== gb) return ga - gb;
  const la = `${a[0].classLevel}-${a[0].section}`;
  const lb = `${b[0].classLevel}-${b[0].section}`;
  return la.localeCompare(lb);
}

export default function ContactList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState<string>('ALL');
  const [filterSection, setFilterSection] = useState<string>('ALL');

  useEffect(() => {
    directoryApi.getMyStudents()
      .then(setStudents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Build flat contact list — whatsapp/alternate are directly on the student record (parent's contact number)
  const contacts: ParentContact[] = useMemo(() => students.map(s => ({
    studentId: s.id,
    studentName: s.name,
    parentName: s.parent?.name,
    relation: s.parent?.relation,
    phone: s.whatsapp || (s as any).alternate,  // whatsapp = primary parent contact, alternate = secondary
    classLevel: s.class_level || String(s.school_class?.grade?.name ?? ''),
    section: s.section || (s.school_class?.section?.name ?? ''),
  })), [students]);

  // Unique grades / sections present in the teacher's assigned students.
  const availableGrades = useMemo(() => {
    const set = new Set(contacts.map(c => shortGrade(c.classLevel)).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10); const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [contacts]);

  const availableSections = useMemo(() => {
    const set = new Set(contacts.map(c => c.section).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  // Apply class/section filters before grouping.
  const scoped = useMemo(() => contacts.filter(c => {
    if (filterGrade !== 'ALL' && shortGrade(c.classLevel) !== filterGrade) return false;
    if (filterSection !== 'ALL' && c.section !== filterSection) return false;
    return true;
  }), [contacts, filterGrade, filterSection]);

  // Group by compact class label ("10A", "9B", ...)
  const grouped = scoped.reduce<Record<string, ParentContact[]>>((acc, c) => {
    const key = compactClassLabel(c.classLevel, c.section);
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const q = search.toLowerCase().trim();
  const filteredGroups: Array<[string, ParentContact[]]> = Object.entries(grouped)
    .map(([key, list]) => {
      const filtered = q
        ? list.filter(c =>
            c.studentName.toLowerCase().includes(q) ||
            (c.parentName?.toLowerCase().includes(q) ?? false) ||
            (c.phone?.includes(search) ?? false)
          )
        : list;
      return [key, filtered.sort((a, b) => a.studentName.localeCompare(b.studentName))] as [string, ParentContact[]];
    })
    .filter(([, list]) => list.length > 0)
    .sort(([, a], [, b]) => compareGroups(a, b));

  const totalStudents = contacts.length;
  const withParent = contacts.filter(c => c.phone).length;
  const isFiltering = filterGrade !== 'ALL' || filterSection !== 'ALL' || q.length > 0;
  const clearFilters = () => { setFilterGrade('ALL'); setFilterSection('ALL'); setSearch(''); };

  return (
    <div className="space-y-5 w-full pb-12">
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

      {/* Class & Section filters */}
      {!loading && contacts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3"
        >
          {/* Class row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 mr-1 shrink-0">
              <Filter className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-14">Class</span>
            </div>
            <FilterPill
              active={filterGrade === 'ALL'}
              onClick={() => setFilterGrade('ALL')}
              label="All"
            />
            {availableGrades.map(g => (
              <FilterPill
                key={g}
                active={filterGrade === g}
                onClick={() => setFilterGrade(g)}
                label={g}
              />
            ))}
          </div>

          {/* Section row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 mr-1 shrink-0">
              <Filter className="w-3.5 h-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-14">Section</span>
            </div>
            <FilterPill
              active={filterSection === 'ALL'}
              onClick={() => setFilterSection('ALL')}
              label="All"
            />
            {availableSections.map(s => (
              <FilterPill
                key={s}
                active={filterSection === s}
                onClick={() => setFilterSection(s)}
                label={s}
              />
            ))}

            {isFiltering && (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400 transition-all"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </motion.div>
      )}

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
      ) : filteredGroups.length === 0 ? (
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
          {filteredGroups.map(([groupKey, list], gIdx) => (
            <motion.div
              key={groupKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gIdx * 0.04, type: 'spring', stiffness: 120, damping: 20 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden shadow-xl"
            >
              {/* Group header — static, no toggle */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl aurora-gradient flex items-center justify-center shrink-0 aurora-glow">
                    <GraduationCap className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-lg font-black tracking-tight text-foreground">{groupKey}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    {list.length} {list.length === 1 ? 'student' : 'students'}
                  </span>
                </div>
              </div>

              {/* Students — always visible */}
              <div className="divide-y divide-white/5">
                {list.map((contact, idx) => (
                  <div
                    key={contact.studentId}
                    className="flex items-center gap-5 px-5 py-4 hover:bg-white/5 transition-colors group"
                  >
                    {/* Avatar & Roll */}
                    <div className="relative">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-base shrink-0">
                        {contact.studentName.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -top-1.5 -left-1.5 bg-brand-indigo text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                        #{idx + 1}
                      </div>
                    </div>

                    {/* Student & Parent Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base text-foreground truncate">{contact.studentName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {contact.parentName ? (
                          <>
                            <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm text-muted-foreground truncate">
                              {contact.parentName}
                              {contact.relation && (
                                <span className="ml-1 text-primary/70">({contact.relation})</span>
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground/40 italic">No parent linked</span>
                        )}
                      </div>
                    </div>

                    {/* Phone display */}
                    {contact.phone && (
                      <span className="text-sm font-mono tracking-wide text-muted-foreground hidden sm:block mr-6">
                        {contact.phone}
                      </span>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 shrink-0">
                      {contact.phone ? (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                            onClick={() => dialPhone(contact.phone!)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-all"
                            title="Call parent"
                          >
                            <Phone className="w-4 h-4" /> Call
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                            onClick={() => openWhatsApp(contact.phone!, contact.studentName)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-bold hover:bg-[#25D366]/20 transition-all"
                            title="WhatsApp parent"
                          >
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                          </motion.button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/30 italic px-2">No contact</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active, onClick, label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all',
        active
          ? 'bg-primary/15 border-primary/40 text-primary shadow-[0_0_15px_-5px_rgba(99,102,241,0.4)]'
          : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
