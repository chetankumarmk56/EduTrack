import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, MessageCircle, Mail, BookOpen, Users, GraduationCap,
  Search, Sparkles, X, ChevronDown, Hash, School, UserRound,
} from 'lucide-react';
import { directoryApi, type TeacherWithPassword } from '@/features/directory/api';
import { cn } from '@/shared/lib/utils';
import { SkeletonCardGrid } from '@/shared/components/ui/Skeleton';

const AVATAR_PALETTE = [
  { from: '#6366f1', to: '#a855f7' },
  { from: '#8b5cf6', to: '#ec4899' },
  { from: '#06b6d4', to: '#3b82f6' },
  { from: '#10b981', to: '#22d3ee' },
  { from: '#f59e0b', to: '#ef4444' },
  { from: '#14b8a6', to: '#6366f1' },
  { from: '#ec4899', to: '#f97316' },
  { from: '#3b82f6', to: '#8b5cf6' },
];

function paletteFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function uniqueSubjects(t: TeacherWithPassword): string[] {
  const set = new Set<string>();
  (t.assignments ?? []).forEach((a: any) => {
    const s = (a.subject_ref?.name || a.subject || '').trim();
    if (s) set.add(s);
  });
  return Array.from(set);
}

function uniqueClasses(t: TeacherWithPassword): string[] {
  const set = new Set<string>();
  (t.assignments ?? []).forEach((a: any) => {
    const c = a.school_class || a.classroom;
    const label =
      c?.display_name ||
      (c?.grade?.level && c?.section?.name
        ? `${c.grade.level}-${c.section.name}`
        : (a.class_level && a.section ? `${a.class_level}-${a.section}` : ''));
    if (label) set.add(label);
  });
  return Array.from(set);
}

export default function Teachers() {
  const [teachers, setTeachers] = useState<TeacherWithPassword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    directoryApi
      .getMyTeachers()
      .then((res) => setTeachers(res || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => uniqueSubjects(t).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [teachers]);

  const allClassesCount = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => uniqueClasses(t).forEach((c) => set.add(c)));
    return set.size;
  }, [teachers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      const subjects = uniqueSubjects(t);
      const classes = uniqueClasses(t);
      const matchesQ =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        subjects.some((s) => s.toLowerCase().includes(q)) ||
        classes.some((c) => c.toLowerCase().includes(q));
      const matchesSubject = !subjectFilter || subjects.includes(subjectFilter);
      return matchesQ && matchesSubject;
    });
  }, [teachers, search, subjectFilter]);

  return (
    <div className="premium-page-container animate-fade-in flex flex-col gap-8 pb-20">
      {/* Hero */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute -top-24 -left-12 w-[420px] h-[420px] rounded-full blur-3xl opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(99,102,241,0.4) 0%, transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-12 right-0 w-[340px] h-[340px] rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, rgba(168,85,247,0.4) 0%, transparent 60%)',
          }}
        />

        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo text-[10px] font-black uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" /> Faculty Directory
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gradient-indigo leading-[1.05]">
            Meet Your Teachers
          </h1>
          <p className="text-text-secondary text-lg font-medium max-w-2xl">
            Reach out to your child&apos;s subject teachers anytime — by call, WhatsApp or email.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && teachers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-3 gap-3 md:gap-4"
        >
          <StatTile icon={<UserRound className="w-4 h-4" />} label="Faculty" value={teachers.length} />
          <StatTile icon={<BookOpen className="w-4 h-4" />} label="Subjects" value={allSubjects.length} />
          <StatTile icon={<School className="w-4 h-4" />} label="Classes" value={allClassesCount} />
        </motion.div>
      )}

      {/* Search + Filters */}
      {!loading && teachers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-3"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/70 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by teacher, subject or class…"
              className="input-obsidian pl-11 pr-11 py-3 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/5 transition"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            )}
          </div>

          {allSubjects.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              <FilterPill
                active={!subjectFilter}
                onClick={() => setSubjectFilter(null)}
                label="All"
                count={teachers.length}
              />
              {allSubjects.map((s) => (
                <FilterPill
                  key={s}
                  active={subjectFilter === s}
                  onClick={() => setSubjectFilter(subjectFilter === s ? null : s)}
                  label={s}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Loading */}
      {loading && <SkeletonCardGrid count={6} cols="xl" />}

      {/* Empty */}
      {!loading && teachers.length === 0 && (
        <div className="obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center">
            <Users className="w-7 h-7 text-brand-indigo" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="text-lg font-black text-white">No teachers linked yet</h3>
            <p className="text-text-secondary text-sm">
              The school administration hasn&apos;t linked subject teachers to your class yet.
            </p>
          </div>
        </div>
      )}

      {/* No results after filter */}
      {!loading && teachers.length > 0 && filtered.length === 0 && (
        <div className="obsidian-card border-dashed border-glass-border flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Search className="w-8 h-8 text-text-secondary/60" />
          <p className="text-sm font-bold text-white">No matching teachers</p>
          <p className="text-xs text-text-secondary">Try a different name, subject or class.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((teacher, index) => {
              const subjects = uniqueSubjects(teacher);
              const classes = uniqueClasses(teacher);
              const palette = paletteFor(teacher.name || 'T');
              const phone = teacher.phone?.replace(/\s+/g, '') || '';
              const waPhone = phone.replace(/[^0-9]/g, '');
              const isOpen = expandedId === teacher.id;

              return (
                <motion.article
                  key={teacher.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: index * 0.04, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                  className="obsidian-card group relative overflow-hidden flex flex-col"
                  style={{
                    boxShadow: `0 30px 60px -30px ${palette.from}33`,
                  }}
                >
                  {/* Decorative top gradient stripe */}
                  <div
                    aria-hidden
                    className="h-1 w-full"
                    style={{
                      background: `linear-gradient(90deg, ${palette.from}, ${palette.to})`,
                    }}
                  />

                  {/* Soft accent glow */}
                  <div
                    aria-hidden
                    className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle, ${palette.to}, transparent 70%)`,
                    }}
                  />

                  <div className="p-6 flex flex-col gap-5 flex-1">
                    {/* Header */}
                    <div className="flex items-start gap-4">
                      <div className="relative shrink-0">
                        <div
                          className="h-16 w-16 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ring-1 ring-white/20"
                          style={{
                            background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
                          }}
                        >
                          {initialsOf(teacher.name)}
                        </div>
                        {teacher.is_active !== false && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-[#0a0a0f]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-white text-lg leading-tight truncate">
                          {teacher.name}
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mt-1">
                          Subject Teacher
                        </p>
                        {subjects.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {subjects.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="text-[10px] font-black px-2 py-0.5 rounded-md border"
                                style={{
                                  background: `${palette.from}1A`,
                                  borderColor: `${palette.from}40`,
                                  color: palette.from,
                                }}
                              >
                                {s}
                              </span>
                            ))}
                            {subjects.length > 3 && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-text-secondary">
                                +{subjects.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick contact summary */}
                    <div className="space-y-1.5 text-[12.5px]">
                      {teacher.email && (
                        <div className="flex items-center gap-2.5 text-text-secondary truncate">
                          <Mail className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{teacher.email}</span>
                        </div>
                      )}
                      {teacher.phone && (
                        <div className="flex items-center gap-2.5 text-text-secondary">
                          <Phone className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span>{teacher.phone}</span>
                        </div>
                      )}
                      {!teacher.email && !teacher.phone && (
                        <div className="flex items-center gap-2 text-text-secondary/60 italic text-[12px]">
                          <GraduationCap className="w-3.5 h-3.5" />
                          No contact info available
                        </div>
                      )}
                    </div>

                    {/* Expanded panel */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pt-3 border-t border-glass-border space-y-4">
                            {classes.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary">
                                  Classes
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {classes.map((c) => (
                                    <span
                                      key={c}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 border border-white/10 text-text-secondary"
                                    >
                                      <Hash className="w-2.5 h-2.5" />
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {subjects.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-secondary">
                                  Subjects taught
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {subjects.map((s) => (
                                    <span
                                      key={s}
                                      className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md border"
                                      style={{
                                        background: `${palette.from}14`,
                                        borderColor: `${palette.from}33`,
                                        color: palette.from,
                                      }}
                                    >
                                      <BookOpen className="w-2.5 h-2.5" />
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Toggle */}
                    {(classes.length > 0 || subjects.length > 0) && (
                      <button
                        onClick={() =>
                          setExpandedId((cur) => (cur === teacher.id ? null : teacher.id))
                        }
                        className="self-start inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-foreground transition-colors"
                      >
                        {isOpen ? 'Hide details' : 'View details'}
                        <ChevronDown
                          className={cn(
                            'w-3 h-3 transition-transform duration-300',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </button>
                    )}
                  </div>

                  {/* Action footer */}
                  <div className="border-t border-glass-border p-3 flex gap-2 bg-white/[0.015]">
                    <ActionButton
                      enabled={!!phone}
                      href={phone ? `tel:${phone}` : undefined}
                      icon={<Phone className="w-3.5 h-3.5" />}
                      label="Call"
                      tone="indigo"
                    />
                    <ActionButton
                      enabled={!!waPhone}
                      href={waPhone ? `https://wa.me/${waPhone}` : undefined}
                      external
                      icon={<MessageCircle className="w-3.5 h-3.5" />}
                      label="WhatsApp"
                      tone="emerald"
                    />
                    <ActionButton
                      enabled={!!teacher.email}
                      href={teacher.email ? `mailto:${teacher.email}` : undefined}
                      icon={<Mail className="w-3.5 h-3.5" />}
                      label="Email"
                      tone="violet"
                    />
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="obsidian-card px-4 py-4 md:px-5 md:py-5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 border border-brand-indigo/20 flex items-center justify-center text-brand-indigo shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-white leading-none tabular-nums">{value}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mt-1.5">
          {label}
        </p>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all duration-300',
        active
          ? 'bg-[var(--brand-indigo)] border-[var(--brand-indigo)] text-white shadow-[0_8px_20px_-8px_rgba(99,102,241,0.6)]'
          : 'bg-foreground/[0.05] border-foreground/10 text-text-secondary hover:border-foreground/20 hover:text-foreground',
      )}
    >
      {label}
      {typeof count === 'number' && (
        <span className={cn('ml-1.5 opacity-70 tabular-nums')}>{count}</span>
      )}
    </button>
  );
}

function ActionButton({
  enabled,
  href,
  external,
  icon,
  label,
  tone,
}: {
  enabled: boolean;
  href?: string;
  external?: boolean;
  icon: React.ReactNode;
  label: string;
  tone: 'indigo' | 'emerald' | 'violet';
}) {
  const TONES = {
    indigo: {
      bg: 'rgba(99,102,241,0.08)',
      border: 'rgba(99,102,241,0.25)',
      hover: 'rgba(99,102,241,0.15)',
      color: '#a5b4fc',
    },
    emerald: {
      bg: 'rgba(37, 211, 102, 0.08)',
      border: 'rgba(37, 211, 102, 0.25)',
      hover: 'rgba(37, 211, 102, 0.15)',
      color: '#34d399',
    },
    violet: {
      bg: 'rgba(167,139,250,0.08)',
      border: 'rgba(167,139,250,0.25)',
      hover: 'rgba(167,139,250,0.18)',
      color: '#c4b5fd',
    },
  } as const;

  const t = TONES[tone];

  if (!enabled) {
    return (
      <span className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-text-secondary/40 border border-white/5 bg-white/[0.015] cursor-not-allowed">
        {icon}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: t.bg,
        borderColor: t.border,
        color: t.color,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = t.bg)}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}
