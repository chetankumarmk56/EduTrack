import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Shield, Edit3, Trash2, Mail, Building2, Search, Users, KeyRound, ChevronDown,
} from 'lucide-react';
import { superAdminApi, type AdminUser as ApiAdminUser } from '@/features/super-admin/api';
import type { Institution } from '@/shared/types';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/utils';

// Narrows the API's AdminUser to the fields this page actually uses
// (and makes is_active / institution_id required for the table view).
type AdminUser = ApiAdminUser & {
  is_active: boolean;
  institution_id: number;
  role: string;
};

// Brand surface tokens shared with the dashboard so both pages feel like
// a single product. Keep these mirrored if either file changes.
const surface = {
  card: 'bg-white/80 dark:bg-slate-900/50 backdrop-blur-2xl border border-cyan-900/[0.07] dark:border-white/10 shadow-[0_10px_40px_-15px_rgba(8,47,73,0.18)] dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]',
  inset: 'bg-cyan-50/40 dark:bg-slate-950/40 border border-cyan-900/[0.07] dark:border-white/10',
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
  'w-full bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-2.5 outline-none ' +
  'focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:focus:ring-cyan-500/20 ' +
  'transition-all text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-600';

export default function SuperAdminCredentials() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [targetInst, setTargetInst] = useState<number | ''>('');

  // Edit state
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const fetchData = async () => {
    try {
      const [adminData, instData] = await Promise.all([
        superAdminApi.getAdmins(),
        superAdminApi.getInstitutions()
      ]);
      setAdmins(adminData as AdminUser[]);
      setInstitutions(instData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword || !targetInst) return;
    setIsCreating(true);
    try {
      await superAdminApi.createAdmin(targetInst, {
        name: newName,
        email: newEmail,
        password: newPassword,
        role: 'admin'
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setTargetInst('');
      fetchData();
    } catch (err) {
      console.error("Creation failed:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    try {
      const updateData: { name: string; email: string; password?: string } = {
        name: editName,
        email: editEmail,
      };
      if (editPassword) updateData.password = editPassword;

      await superAdminApi.updateAdmin(editingAdmin.id, updateData);
      setEditingAdmin(null);
      setEditPassword('');
      fetchData();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to revoke these credentials? The admin will lose all institutional access immediately.")) return;
    try {
      await superAdminApi.deleteAdmin(id);
      fetchData();
    } catch (err) {
      console.error("Deletion failed:", err);
    }
  };

  const instById = useMemo(
    () => new Map(institutions.map(i => [i.id, i] as const)),
    [institutions],
  );

  const q = search.trim().toLowerCase();
  const filteredAdmins = q
    ? admins.filter(a =>
        a.name.toLowerCase().includes(q)
        || a.email.toLowerCase().includes(q)
        || (instById.get(a.institution_id)?.name || '').toLowerCase().includes(q),
      )
    : admins;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header ribbon ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className={cn('relative rounded-3xl overflow-hidden p-6 sm:p-8', surface.card)}
      >
        <div className={cn('absolute inset-0 opacity-80', surface.ribbon)} />
        <div className="absolute -top-20 -right-10 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 px-3 py-1 mb-4">
              <Shield className={cn('h-3.5 w-3.5', textTone.brand)} />
              <span className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', textTone.brand)}>
                Credentials
              </span>
            </div>
            <h1 className={cn('text-3xl sm:text-4xl font-black tracking-tight', textTone.heading)}>
              Administrator Identities
            </h1>
            <p className={cn('mt-2 text-sm', textTone.body)}>
              Provision, edit, and revoke admin accounts across every institution on the platform.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <CountChip icon={<Users className="h-3.5 w-3.5" />} label="Admins" value={admins.length} />
            <CountChip icon={<Building2 className="h-3.5 w-3.5" />} label="Schools" value={institutions.length} />
          </div>
        </div>
      </motion.div>

      {/* ── Main grid: provision form + table ──────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 lg:gap-8">
        {/* Provision form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="xl:col-span-1"
        >
          <div className={cn('relative rounded-3xl p-6 sm:p-7 xl:sticky xl:top-6 overflow-hidden', surface.card)}>
            <div className="absolute top-0 right-0 p-4 opacity-[0.06] dark:opacity-10 pointer-events-none">
              <KeyRound className="h-24 w-24 text-cyan-500" />
            </div>

            <div className="relative">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-9 w-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center">
                  <Plus className={cn('h-4 w-4', textTone.brand)} />
                </div>
                <h2 className={cn('text-xl font-black tracking-tight', textTone.heading)}>New Credential</h2>
              </div>
              <p className={cn('text-sm mb-6', textTone.muted)}>
                Bind a fresh admin login to one of your schools.
              </p>

              <form onSubmit={handleCreate} className="space-y-4">
                <Field label="Full Name">
                  <input
                    type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    className={input} placeholder="Jane Doe"
                  />
                </Field>

                <Field label="Access Email">
                  <input
                    type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    className={input} placeholder="admin@school.edu"
                  />
                </Field>

                <Field label="Root Password">
                  <input
                    type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    className={input} placeholder="••••••••"
                  />
                </Field>

                <Field label="Assign Institution">
                  <div className="relative">
                    <select
                      value={targetInst} onChange={e => setTargetInst(Number(e.target.value))}
                      className={cn(input, 'appearance-none pr-9')}
                    >
                      <option value="">Select a school…</option>
                      {institutions.map(inst => (
                        <option key={inst.id} value={inst.id}>{inst.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                  </div>
                </Field>

                <button
                  type="submit" disabled={isCreating}
                  className={cn(
                    'group w-full rounded-xl py-3.5 font-bold text-sm tracking-wide transition-all',
                    'bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white',
                    'shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-60',
                    'flex items-center justify-center gap-2 mt-1',
                  )}
                >
                  {isCreating ? (
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                      Provision Access
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </motion.div>

        {/* Admins table */}
        <div className="xl:col-span-3 space-y-4">
          {/* Toolbar */}
          <div className={cn('rounded-2xl p-3 flex items-center gap-3', surface.card)}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                className={cn(input, 'pl-9')}
              />
            </div>
            <div className={cn('hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl', surface.inset)}>
              <Users className={cn('h-4 w-4', textTone.brand)} />
              <span className={cn('text-xs font-bold', textTone.heading)}>{filteredAdmins.length}</span>
              <span className={cn('text-[10px] font-bold uppercase tracking-widest', textTone.muted)}>
                {filteredAdmins.length === 1 ? 'admin' : 'admins'}
              </span>
            </div>
          </div>

          <div className={cn('rounded-2xl overflow-hidden', surface.card)}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-cyan-50/60 dark:bg-white/5 border-b border-cyan-900/[0.07] dark:border-white/10">
                    {['Identity', 'Institution', 'Status', 'Actions'].map(h => (
                      <th key={h} className={cn('px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.2em]', textTone.muted)}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-900/[0.05] dark:divide-white/5">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`skel-${i}`}>
                        {Array.from({ length: 4 }).map((__, c) => (
                          <td key={c} className="px-5 py-4">
                            <Skeleton rounded="md" className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredAdmins.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-16">
                        <div className="text-center">
                          <Users className={cn('h-10 w-10 mx-auto mb-3', textTone.faint)} />
                          <p className={cn('text-sm font-semibold', textTone.heading)}>
                            {admins.length === 0 ? 'No administrators yet.' : 'No matches.'}
                          </p>
                          <p className={cn('text-xs mt-1.5', textTone.muted)}>
                            {admins.length === 0
                              ? 'Use the form on the left to provision your first admin.'
                              : 'Try a different search term.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAdmins.map((admin, idx) => {
                    const inst = instById.get(admin.institution_id);
                    return (
                      <motion.tr
                        key={admin.id}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                        className="group hover:bg-cyan-50/40 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-5 py-4">
                          {editingAdmin?.id === admin.id ? (
                            <div className="space-y-2 max-w-xs">
                              <input
                                value={editName} onChange={e => setEditName(e.target.value)}
                                className="w-full bg-white dark:bg-slate-950 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-500/20"
                              />
                              <input
                                value={editEmail} onChange={e => setEditEmail(e.target.value)}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-600 dark:text-slate-400 text-xs outline-none focus:border-cyan-500"
                              />
                              <input
                                type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                                placeholder="New password (optional)"
                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-600 dark:text-slate-400 text-xs outline-none focus:border-cyan-500"
                              />
                              <div className="flex gap-2 pt-0.5">
                                <button onClick={handleUpdate}
                                        className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-[10px] font-black uppercase text-white rounded-md shadow-sm shadow-cyan-500/30 transition-all">
                                  Save
                                </button>
                                <button onClick={() => { setEditingAdmin(null); setEditPassword(''); }}
                                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 rounded-md transition-all">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-cyan-100 dark:bg-slate-800 flex items-center justify-center font-bold text-cyan-700 dark:text-slate-400 group-hover:bg-cyan-500/15 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-all border border-cyan-900/[0.06] dark:border-white/5">
                                {admin.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className={cn('font-semibold truncate', textTone.heading)}>{admin.name}</div>
                                <div className={cn('text-xs flex items-center gap-1.5 mt-0.5 truncate', textTone.muted)}>
                                  <Mail className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{admin.email}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-cyan-50 dark:bg-slate-800 border border-cyan-900/[0.06] dark:border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                              {inst?.logo_url ? (
                                <img src={inst.logo_url} alt={`${inst.name} logo`} className="h-full w-full object-cover" />
                              ) : (
                                <Building2 className={cn('h-4 w-4', textTone.muted)} />
                              )}
                            </div>
                            <span className={cn('text-sm font-medium truncate', textTone.body)}>
                              {inst?.name || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-bold tracking-widest uppercase text-[10px]">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Authorized
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!editingAdmin && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingAdmin(admin);
                                    setEditName(admin.name);
                                    setEditEmail(admin.email);
                                  }}
                                  className="p-2 hover:bg-cyan-500/10 rounded-lg text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all"
                                  aria-label="Edit admin"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(admin.id)}
                                  className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                                  aria-label="Revoke credentials"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ───────────────────────────

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={cn('block text-[10px] font-bold uppercase tracking-[0.18em] ml-0.5', textTone.brandSoft)}>
        {label}
      </label>
      {children}
    </div>
  );
}

function CountChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className={cn(
      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5',
      'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    )}>
      {icon}
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</span>
    </div>
  );
}
