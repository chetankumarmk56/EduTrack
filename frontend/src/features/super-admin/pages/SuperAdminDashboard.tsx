import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Plus, Power, Activity, Globe, Server, Database, Trash2, Edit3,
  RotateCcw, Archive, ImagePlus, X, Search, Sparkles, ChevronRight, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  superAdminApi,
  LOGO_ACCEPTED_EXTENSIONS,
  LOGO_ACCEPTED_TYPES,
  LOGO_MAX_SIZE_BYTES,
} from '@/features/super-admin/api';
import type { Institution } from '@/shared/types';
import { SkeletonCardGrid } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/utils';

type TrashedInstitution = Institution & { deleted_at: string; days_until_purge: number };

// Brand surface tokens for the super-admin portal. Centralised so a tweak
// to one card style ripples across the page without leaving inconsistent
// neighbours behind. Tailwind `dark:` works because the layout puts the
// `dark` class on <html> in dark mode.
const surface = {
  // Primary card — used for the major panels (form, list container).
  card: 'bg-white/80 dark:bg-slate-900/50 backdrop-blur-2xl border border-cyan-900/[0.07] dark:border-white/10 shadow-[0_10px_40px_-15px_rgba(8,47,73,0.18)] dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]',
  // Subtle inset surface — used for inputs and inline panels inside cards.
  inset: 'bg-cyan-50/40 dark:bg-slate-950/40 border border-cyan-900/[0.07] dark:border-white/10',
  // Tinted accent header strip behind the brand label / page title.
  ribbon: 'bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-transparent dark:from-cyan-500/15 dark:via-sky-500/10',
};

const textTone = {
  heading: 'text-slate-900 dark:text-white',
  body: 'text-slate-600 dark:text-slate-300',
  muted: 'text-slate-500 dark:text-slate-400',
  faint: 'text-slate-400 dark:text-slate-500',
  brand: 'text-cyan-700 dark:text-cyan-400',
  brandSoft: 'text-cyan-600/80 dark:text-cyan-500/80',
};

const input =
  'w-full bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-3 outline-none ' +
  'focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:ring-cyan-500/20 ' +
  'transition-all text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-600';

export default function SuperAdminDashboard() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [trashed, setTrashed] = useState<TrashedInstitution[]>([]);
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [newInstName, setNewInstName] = useState('');
  const [newInstSlug, setNewInstSlug] = useState('');

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [editingInst, setEditingInst] = useState<Institution | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  // Edit-logo state mirrors the create-logo state but is kept separate
  // so opening the edit panel never disturbs the create form (and vice
  // versa). `editLogoCleared` distinguishes "user explicitly removed the
  // logo" from "user hasn't touched the logo".
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editLogoCleared, setEditLogoCleared] = useState(false);
  const editLogoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (editLogoPreview) URL.revokeObjectURL(editLogoPreview);
    };
  }, [editLogoPreview]);

  // Revoke the object URL when the preview changes or the component unmounts —
  // browsers leak the underlying blob otherwise.
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const resetEditLogoState = () => {
    if (editLogoPreview) URL.revokeObjectURL(editLogoPreview);
    setEditLogoFile(null);
    setEditLogoPreview(null);
    setEditLogoCleared(false);
    if (editLogoInputRef.current) editLogoInputRef.current.value = '';
  };

  const validateLogoFile = (file: File): boolean => {
    const lowerName = file.name.toLowerCase();
    const extOk = LOGO_ACCEPTED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    const typeOk = file.type ? (LOGO_ACCEPTED_TYPES as readonly string[]).includes(file.type) : extOk;
    if (!typeOk || !extOk) {
      toast.error('Unsupported logo type. Use PNG, JPG, JPEG, or WEBP.');
      return false;
    }
    if (file.size > LOGO_MAX_SIZE_BYTES) {
      toast.error('Logo is too large. Max 5 MB.');
      return false;
    }
    return true;
  };

  const handleEditLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateLogoFile(file)) {
      if (editLogoInputRef.current) editLogoInputRef.current.value = '';
      return;
    }
    if (editLogoPreview) URL.revokeObjectURL(editLogoPreview);
    setEditLogoFile(file);
    setEditLogoPreview(URL.createObjectURL(file));
    // Picking a file overrides any previous "remove" intent.
    setEditLogoCleared(false);
  };

  const handleEditLogoRemove = () => {
    if (editLogoPreview) URL.revokeObjectURL(editLogoPreview);
    setEditLogoFile(null);
    setEditLogoPreview(null);
    setEditLogoCleared(true);
    if (editLogoInputRef.current) editLogoInputRef.current.value = '';
  };

  const handleEditLogoUndoRemove = () => {
    setEditLogoCleared(false);
  };

  const clearLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      clearLogo();
      return;
    }
    if (!validateLogoFile(file)) {
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const fetchData = async () => {
    try {
      const [active, trash] = await Promise.all([
        superAdminApi.getInstitutions(),
        superAdminApi.getTrashedInstitutions().catch(() => []),
      ]);
      setInstitutions(active);
      setTrashed(trash);
    } catch (err) {
      console.error("Failed to fetch institutions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (id: number) => {
    if (!confirm("Restore this school? Its admins, teachers, students, and parents will be able to log in again.")) return;
    try {
      await superAdminApi.restoreInstitution(id);
      fetchData();
    } catch (err) {
      console.error("Restore failed:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName || !newInstSlug) return;
    setIsDeploying(true);
    try {
      await superAdminApi.createInstitution({
        name: newInstName,
        slug: newInstSlug,
        logo: logoFile,
      });
      setNewInstName('');
      setNewInstSlug('');
      clearLogo();
      fetchData();
    } catch (err) {
      console.error("Creation failed:", err);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInst) return;
    try {
      await superAdminApi.updateInstitution(editingInst.id, {
        name: editName,
        slug: editSlug,
        // Only forward the file if the user actually picked one.
        logo: editLogoFile ?? undefined,
        // Only send the remove flag when the user explicitly cleared an
        // existing logo (and didn't also upload a replacement). Picking
        // a new file already implicitly replaces, so we don't need both.
        removeLogo: editLogoCleared && !editLogoFile,
      });
      setEditingInst(null);
      resetEditLogoState();
      fetchData();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handleEditCancel = () => {
    setEditingInst(null);
    resetEditLogoState();
  };

  const handleEditOpen = (inst: Institution) => {
    setEditingInst(inst);
    setEditName(inst.name);
    setEditSlug(inst.slug);
    resetEditLogoState();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Move this school to the trash? Admins, teachers, and students lose access immediately. You have 90 days to restore it before everything is permanently deleted.")) return;
    try {
      await superAdminApi.deleteInstitution(id);
      fetchData();
    } catch (err) {
      console.error("Deletion failed:", err);
    }
  };

  const toggleStatus = async (id: number, currentStatus: boolean) => {
    try {
      await superAdminApi.toggleInstitutionStatus(id, !currentStatus);
      fetchData();
    } catch (err) {
      console.error("Status toggle failed:", err);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredActive = q
    ? institutions.filter(i =>
        i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q),
      )
    : institutions;
  const filteredTrashed = q
    ? trashed.filter(i =>
        i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q),
      )
    : trashed;

  const activeCount = institutions.filter(i => i.is_active).length;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header / brand ribbon ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className={cn('relative rounded-3xl overflow-hidden p-6 sm:p-8', surface.card)}
      >
        <div className={cn('absolute inset-0 opacity-80', surface.ribbon)} />
        <div className="absolute -top-20 -right-10 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 px-3 py-1 mb-4">
              <Sparkles className={cn('h-3.5 w-3.5', textTone.brand)} />
              <span className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', textTone.brand)}>
                Platform Control
              </span>
            </div>
            <h1 className={cn('text-3xl sm:text-4xl font-black tracking-tight', textTone.heading)}>
              School Operations
            </h1>
            <p className={cn('mt-2 text-sm', textTone.body)}>
              Provision new institutions, manage existing schools, and review the trash bin.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusPill
              icon={<div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />}
              label="Systems Nominal"
              tone="emerald"
            />
            <StatusPill icon={<Server className="h-3.5 w-3.5" />} label="API" tone="cyan" />
            <StatusPill icon={<Database className="h-3.5 w-3.5" />} label="DB" tone="indigo" />
          </div>
        </div>
      </motion.div>

      {/* ── KPI tiles ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Active Tenants"
          value={activeCount}
          icon={<Activity className="h-5 w-5" />}
          accent="emerald"
        />
        <KpiTile
          label="Total Schools"
          value={institutions.length}
          icon={<Building2 className="h-5 w-5" />}
          accent="cyan"
        />
        <KpiTile
          label="In Trash"
          value={trashed.length}
          icon={<Archive className="h-5 w-5" />}
          accent="amber"
        />
        <KpiTile
          label="Deactivated"
          value={institutions.length - activeCount}
          icon={<Power className="h-5 w-5" />}
          accent="rose"
        />
      </div>

      {/* ── Main grid: create panel + listings ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Provision panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-1"
        >
          <div className={cn('relative rounded-3xl p-6 sm:p-8 overflow-hidden lg:sticky lg:top-6', surface.card)}>
            <div className="absolute top-0 right-0 p-4 opacity-[0.06] dark:opacity-10 pointer-events-none">
              <Plus className="h-28 w-28 text-cyan-500" />
            </div>

            <div className="relative">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center">
                  <Plus className={cn('h-4 w-4', textTone.brand)} />
                </div>
                <h2 className={cn('text-xl font-black tracking-tight', textTone.heading)}>Provision Tenant</h2>
              </div>
              <p className={cn('text-sm mb-6', textTone.muted)}>
                Add a new school to the platform with a name, ID, and optional logo.
              </p>

              <form onSubmit={handleCreate} className="space-y-5">
                <Field label="Institution Name">
                  <input
                    type="text" value={newInstName} onChange={e => setNewInstName(e.target.value)}
                    placeholder="e.g. St. Xavier's Academy"
                    className={input}
                  />
                </Field>

                <Field
                  label="Institution ID"
                  hint="Lowercase letters, digits, hyphens. Admins, teachers, and parents enter this when logging in."
                >
                  <input
                    type="text" value={newInstSlug}
                    onChange={e => setNewInstSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="stmarys2026"
                    className={cn(input, 'font-mono')}
                  />
                </Field>

                <Field
                  label={<>School Logo <span className="text-slate-400 dark:text-slate-500 normal-case font-sans tracking-normal">(optional)</span></>}
                >
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept={LOGO_ACCEPTED_TYPES.join(',')}
                    onChange={handleLogoChange}
                    className="sr-only"
                    id="institution-logo-input"
                  />
                  {logoPreview ? (
                    <div className={cn('flex items-center gap-3 rounded-xl p-3', surface.inset)}>
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-14 w-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700/60 bg-white"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-semibold truncate', textTone.heading)}>{logoFile?.name}</p>
                        <p className={cn('text-[10px] mt-0.5', textTone.faint)}>
                          {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearLogo}
                        className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        aria-label="Remove selected logo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="institution-logo-input"
                      className={cn(
                        'flex flex-col items-center justify-center gap-2 w-full rounded-xl px-4 py-6 cursor-pointer transition-all',
                        'border border-dashed border-cyan-500/30 dark:border-slate-700/60 hover:border-cyan-500/60',
                        'bg-cyan-50/40 dark:bg-slate-950/40 hover:bg-cyan-50/70 dark:hover:bg-cyan-900/10',
                        textTone.muted, 'hover:text-cyan-600 dark:hover:text-cyan-400',
                      )}
                    >
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-xs font-semibold">Click to upload a logo</span>
                      <span className={cn('text-[10px]', textTone.faint)}>PNG, JPG, JPEG, WEBP · up to 5 MB</span>
                    </label>
                  )}
                </Field>

                <button
                  type="submit" disabled={isDeploying}
                  className={cn(
                    'group w-full rounded-xl py-3.5 font-bold text-sm tracking-wide transition-all',
                    'bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white',
                    'shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-60',
                    'flex items-center justify-center gap-2',
                  )}
                >
                  {isDeploying ? (
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Globe className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                      Deploy Instance
                      <ChevronRight className="h-4 w-4 -mr-1 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </motion.div>

        {/* Listings panel */}
        <div className="lg:col-span-2 space-y-5">
          {/* Toolbar */}
          <div className={cn('rounded-2xl p-3 flex flex-col sm:flex-row gap-3 sm:items-center', surface.card)}>
            <div className="inline-flex rounded-xl bg-cyan-50/60 dark:bg-slate-950/60 border border-cyan-900/[0.07] dark:border-white/10 p-1 shrink-0">
              <SegmentedButton
                active={view === 'active'}
                onClick={() => setView('active')}
                tone="cyan"
                icon={<Building2 className="h-3.5 w-3.5" />}
                label={`Active (${institutions.length})`}
              />
              <SegmentedButton
                active={view === 'trash'}
                onClick={() => setView('trash')}
                tone="amber"
                icon={<Archive className="h-3.5 w-3.5" />}
                label={`Trash (${trashed.length})`}
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                className={cn(input, 'pl-9 py-2.5')}
              />
            </div>
          </div>

          {/* Trash view */}
          <AnimatePresence mode="wait">
            {view === 'trash' && (
              <motion.div
                key="trash"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {filteredTrashed.length === 0 ? (
                  <EmptyState
                    icon={<Archive className="h-10 w-10" />}
                    title={trashed.length === 0 ? 'Trash is empty.' : 'No matches.'}
                    subtitle={trashed.length === 0
                      ? 'Deleted schools appear here and are permanently purged after 90 days.'
                      : 'Try a different search term.'}
                  />
                ) : filteredTrashed.map(inst => (
                  <TrashCard
                    key={inst.id}
                    inst={inst}
                    onRestore={() => handleRestore(inst.id)}
                  />
                ))}
              </motion.div>
            )}

            {view === 'active' && (
              <motion.div
                key="active"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {isLoading ? (
                  <div className="col-span-full">
                    <SkeletonCardGrid count={4} cols="md" />
                  </div>
                ) : filteredActive.length === 0 ? (
                  <EmptyState
                    icon={<Building2 className="h-10 w-10" />}
                    title={institutions.length === 0 ? 'No institutions yet.' : 'No matches.'}
                    subtitle={institutions.length === 0
                      ? 'Deploy your first school using the form on the left.'
                      : 'Try a different search term.'}
                  />
                ) : filteredActive.map((inst, idx) => (
                  <SchoolCard
                    key={inst.id}
                    inst={inst}
                    delay={idx * 0.04}
                    isEditing={editingInst?.id === inst.id}
                    blockEdits={!!editingInst && editingInst.id !== inst.id}
                    editName={editName} setEditName={setEditName}
                    editSlug={editSlug} setEditSlug={setEditSlug}
                    editLogoPreview={editLogoPreview}
                    editLogoCleared={editLogoCleared}
                    editLogoInputRef={editLogoInputRef}
                    onEditLogoChange={handleEditLogoChange}
                    onEditLogoRemove={handleEditLogoRemove}
                    onEditLogoUndoRemove={handleEditLogoUndoRemove}
                    onResetEditLogo={resetEditLogoState}
                    onOpenEdit={() => handleEditOpen(inst)}
                    onCancelEdit={handleEditCancel}
                    onSubmitEdit={handleUpdate}
                    onDelete={() => handleDelete(inst.id)}
                    onToggleStatus={() => toggleStatus(inst.id, inst.is_active)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={cn('block text-[10px] font-bold uppercase tracking-[0.18em] ml-0.5', textTone.brandSoft)}>
        {label}
      </label>
      {children}
      {hint && <p className={cn('text-[10px] leading-relaxed', textTone.faint)}>{hint}</p>}
    </div>
  );
}

function StatusPill({
  icon, label, tone,
}: { icon: React.ReactNode; label: string; tone: 'emerald' | 'cyan' | 'indigo' }) {
  const tones = {
    emerald: 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    cyan: 'text-cyan-700 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    indigo: 'text-indigo-700 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  } as const;
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
      tones[tone],
    )}>
      {icon}
      {label}
    </div>
  );
}

function KpiTile({
  label, value, icon, accent,
}: {
  label: string; value: number; icon: React.ReactNode;
  accent: 'emerald' | 'cyan' | 'amber' | 'rose';
}) {
  // Per-accent text and icon-tile colours. Keeping these in one map makes
  // it trivial to add another KPI later without grepping for hex codes.
  const accents = {
    emerald: { value: 'text-emerald-600 dark:text-emerald-400', tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    cyan: { value: 'text-cyan-600 dark:text-cyan-400', tile: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20' },
    amber: { value: 'text-amber-600 dark:text-amber-400', tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
    rose: { value: 'text-rose-600 dark:text-rose-400', tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-2xl p-5 flex items-center justify-between transition-all', surface.card,
        'hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-15px_rgba(8,47,73,0.20)] dark:hover:shadow-[0_25px_60px_-20px_rgba(0,0,0,0.7)]',
      )}
    >
      <div className="min-w-0">
        <p className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', textTone.muted)}>{label}</p>
        <h3 className={cn('text-3xl sm:text-4xl font-black tabular-nums mt-1.5 leading-none', accents[accent].value)}>
          {value}
        </h3>
      </div>
      <div className={cn('h-11 w-11 rounded-xl border flex items-center justify-center shrink-0', accents[accent].tile)}>
        {icon}
      </div>
    </motion.div>
  );
}

function SegmentedButton({
  active, onClick, tone, icon, label,
}: { active: boolean; onClick: () => void; tone: 'cyan' | 'amber'; icon: React.ReactNode; label: string }) {
  const activeTone = tone === 'cyan'
    ? 'bg-gradient-to-br from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/30'
    : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30';
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1.5',
        active ? activeTone : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({
  icon, title, subtitle,
}: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className={cn('col-span-full py-16 text-center rounded-3xl border border-dashed', surface.card,
      'border-cyan-500/20 dark:border-slate-700/60',
    )}>
      <div className={cn('mx-auto mb-4 flex items-center justify-center', textTone.faint)}>{icon}</div>
      <p className={cn('text-sm font-semibold', textTone.heading)}>{title}</p>
      <p className={cn('text-xs mt-1.5', textTone.muted)}>{subtitle}</p>
    </div>
  );
}

function TrashCard({ inst, onRestore }: { inst: TrashedInstitution; onRestore: () => void }) {
  const urgency = inst.days_until_purge < 7 ? 'text-rose-600 dark:text-rose-400'
                : inst.days_until_purge < 30 ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-700 dark:text-slate-300';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'rounded-2xl p-5 overflow-hidden relative border',
        'bg-amber-50/40 dark:bg-amber-900/[0.06] border-amber-500/20 dark:border-amber-500/15',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Archive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h4 className={cn('text-base font-bold truncate', textTone.heading)}>{inst.name}</h4>
            <p className={cn('text-[10px] font-mono tracking-wider uppercase mt-0.5 truncate', textTone.muted)}>
              ID: <span className="text-amber-600 dark:text-amber-400">{inst.slug}</span>
            </p>
            <p className={cn('text-[10px] mt-1', textTone.faint)}>
              Deleted {new Date(inst.deleted_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          onClick={onRestore}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest
                     bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
        >
          <RotateCcw className="h-3 w-3" /> Restore
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-amber-500/15 pt-3">
        <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest',
          'text-amber-700/80 dark:text-amber-400/80')}>
          <AlertTriangle className="h-3 w-3" /> Permanent purge in
        </span>
        <span className={cn('text-sm font-black', urgency)}>
          {inst.days_until_purge} {inst.days_until_purge === 1 ? 'day' : 'days'}
        </span>
      </div>
    </motion.div>
  );
}

interface SchoolCardProps {
  inst: Institution;
  delay: number;
  isEditing: boolean;
  blockEdits: boolean;
  editName: string; setEditName: (v: string) => void;
  editSlug: string; setEditSlug: (v: string) => void;
  editLogoPreview: string | null;
  editLogoCleared: boolean;
  editLogoInputRef: React.RefObject<HTMLInputElement | null>;
  onEditLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditLogoRemove: () => void;
  onEditLogoUndoRemove: () => void;
  onResetEditLogo: () => void;
  onOpenEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (e: React.FormEvent) => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

function SchoolCard({
  inst, delay, isEditing, blockEdits,
  editName, setEditName, editSlug, setEditSlug,
  editLogoPreview, editLogoCleared, editLogoInputRef,
  onEditLogoChange, onEditLogoRemove, onEditLogoUndoRemove, onResetEditLogo,
  onOpenEdit, onCancelEdit, onSubmitEdit, onDelete, onToggleStatus,
}: SchoolCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className={cn(
        'group relative rounded-2xl p-5 overflow-hidden transition-all',
        surface.card,
        !isEditing && 'hover:-translate-y-0.5 hover:border-cyan-500/40 hover:shadow-[0_18px_50px_-15px_rgba(8,145,178,0.25)]',
      )}
    >
      {/* Subtle gradient highlight on hover */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/40 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          <div className="h-12 w-12 rounded-xl bg-cyan-50 dark:bg-slate-800 border border-cyan-900/[0.06] dark:border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
            {inst.logo_url ? (
              <img
                src={inst.logo_url}
                alt={`${inst.name} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-5 w-5 text-cyan-600 dark:text-slate-400 group-hover:text-cyan-500 transition-colors" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <form onSubmit={onSubmitEdit} className="space-y-2.5">
                <input
                  value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  className="w-full bg-white dark:bg-slate-950 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-base font-bold outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
                <input
                  value={editSlug} onChange={e => setEditSlug(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-600 dark:text-slate-400 text-[11px] font-mono outline-none focus:border-cyan-500"
                />

                {/* Compact logo controls. Three visual states:
                    1) Newly picked file → preview + "Undo"
                    2) Existing logo (and not cleared) → current + Change/Remove
                    3) No logo (or cleared) → "Add" placeholder + Undo-remove if just cleared. */}
                <div className={cn('rounded-lg p-2.5 space-y-2', surface.inset)}>
                  <p className={cn('text-[9px] font-bold uppercase tracking-widest', textTone.brandSoft)}>School Logo</p>
                  <input
                    ref={editLogoInputRef}
                    type="file"
                    accept={LOGO_ACCEPTED_TYPES.join(',')}
                    onChange={onEditLogoChange}
                    className="sr-only"
                    id={`edit-logo-${inst.id}`}
                  />
                  <div className="flex items-center gap-2">
                    {editLogoPreview ? (
                      <img src={editLogoPreview} alt="New logo preview"
                           className="h-10 w-10 rounded-md object-cover border border-cyan-500/40 bg-white" />
                    ) : !editLogoCleared && inst.logo_url ? (
                      <img src={inst.logo_url} alt={`${inst.name} logo`}
                           className="h-10 w-10 rounded-md object-cover border border-slate-200 dark:border-slate-700/60 bg-white" />
                    ) : (
                      <div className="h-10 w-10 rounded-md border border-dashed border-cyan-500/30 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/60 flex items-center justify-center text-slate-400 dark:text-slate-600">
                        <ImagePlus className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1 flex flex-wrap gap-1.5">
                      <label htmlFor={`edit-logo-${inst.id}`}
                             className="px-2 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-[9px] font-black uppercase text-cyan-700 dark:text-cyan-400 cursor-pointer transition-colors">
                        {editLogoPreview || (inst.logo_url && !editLogoCleared) ? 'Change' : 'Add'}
                      </label>
                      {editLogoPreview && (
                        <button type="button" onClick={onResetEditLogo}
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[9px] font-black uppercase text-slate-600 dark:text-slate-400 transition-colors">
                          Undo
                        </button>
                      )}
                      {!editLogoPreview && inst.logo_url && !editLogoCleared && (
                        <button type="button" onClick={onEditLogoRemove}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 transition-colors">
                          Remove
                        </button>
                      )}
                      {!editLogoPreview && editLogoCleared && (
                        <button type="button" onClick={onEditLogoUndoRemove}
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[9px] font-black uppercase text-slate-600 dark:text-slate-400 transition-colors">
                          Undo remove
                        </button>
                      )}
                    </div>
                  </div>
                  <p className={cn('text-[9px] leading-relaxed', textTone.faint)}>
                    PNG, JPG, JPEG, WEBP · up to 5 MB
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="submit"
                          className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-[10px] font-black uppercase text-white rounded-md shadow-sm shadow-cyan-500/30 transition-all">
                    Save
                  </button>
                  <button type="button" onClick={onCancelEdit}
                          className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <h4 className={cn('text-lg font-bold tracking-tight truncate', textTone.heading)}>{inst.name}</h4>
                <p className={cn('text-[10px] font-mono tracking-wider uppercase truncate', textTone.muted)}>
                  ID: <span className="text-cyan-600 dark:text-cyan-400">{inst.slug}</span>
                </p>
              </>
            )}
          </div>
        </div>

        {!blockEdits && !isEditing && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onOpenEdit}
                    className="p-2 hover:bg-cyan-500/10 rounded-lg text-slate-500 dark:text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all"
                    aria-label="Edit school">
              <Edit3 className="h-4 w-4" />
            </button>
            <button onClick={onDelete}
                    className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-500 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                    aria-label="Move to trash">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="mt-5 flex items-center justify-between border-t border-cyan-900/[0.06] dark:border-white/5 pt-3">
          <div className="flex items-center gap-2">
            {inst.is_active ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Live</span>
              </>
            ) : (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Decommissioned</span>
              </>
            )}
          </div>
          <button
            onClick={onToggleStatus}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border',
              inst.is_active
                ? 'bg-rose-500/5 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/15'
                : 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15',
            )}
          >
            <Power className="h-3 w-3" />
            {inst.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
