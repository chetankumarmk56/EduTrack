import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, Power, Activity, Globe, Server, Database, Trash2, Edit3, RotateCcw, Archive } from 'lucide-react';
import { superAdminApi } from '@/features/super-admin/api';
import type { Institution } from '@/shared/types';
import { cn } from '@/shared/lib/utils';

type TrashedInstitution = Institution & { deleted_at: string; days_until_purge: number };

export default function SuperAdminDashboard() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [trashed, setTrashed] = useState<TrashedInstitution[]>([]);
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [newInstName, setNewInstName] = useState('');
  const [newInstSlug, setNewInstSlug] = useState('');

  const [editingInst, setEditingInst] = useState<Institution | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');

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
      await superAdminApi.createInstitution({ name: newInstName, slug: newInstSlug });
      setNewInstName('');
      setNewInstSlug('');
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
      await superAdminApi.updateInstitution(editingInst.id, { name: editName, slug: editSlug });
      setEditingInst(null);
      fetchData();
    } catch (err) {
      console.error("Update failed:", err);
    }
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

  return (
    <div className="space-y-8 pb-10">
      {/* Header section with stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 flex items-center justify-between shadow-2xl"
        >
          <div>
            <p className="text-slate-400 text-[10px] font-mono uppercase tracking-[0.2em]">Active Tenants</p>
            <h3 className="text-3xl font-black text-cyan-400 mt-1">{institutions.filter(i => i.is_active).length}</h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
            <Activity className="h-6 w-6 text-cyan-400" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 flex items-center justify-between shadow-2xl"
        >
          <div>
            <p className="text-slate-400 text-[10px] font-mono uppercase tracking-[0.2em]">Total Schools</p>
            <h3 className="text-3xl font-black text-blue-400 mt-1">{institutions.length}</h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <Building2 className="h-6 w-6 text-blue-400" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 flex items-center justify-between col-span-1 md:col-span-2 shadow-2xl relative overflow-hidden group"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-50" />
          <div>
            <p className="text-slate-400 text-[10px] font-mono uppercase tracking-[0.2em]">Infrastructure Status</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex -space-x-1">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <div className="h-2 w-2 rounded-full bg-green-500/50" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tighter">Systems Nominal</h3>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <Server className="h-6 w-6 text-purple-400" />
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Database className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Creation Panel */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-1 space-y-6"
        >
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-slate-800/50 rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Plus className="h-24 w-24 text-cyan-400" />
            </div>
            
            <h2 className="text-2xl font-black text-white mb-2">Provision Tenant</h2>
            <p className="text-slate-400 text-sm mb-8">Deploy a new high-performance institutional instance to the platform.</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-cyan-500/80 uppercase tracking-widest ml-1">Institution Name</label>
                <input 
                  type="text" value={newInstName} onChange={e => setNewInstName(e.target.value)}
                  placeholder="e.g. St. Xavier's Academy"
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 outline-none focus:border-cyan-500/50 transition-all text-slate-100 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-cyan-500/80 uppercase tracking-widest ml-1">Institution ID</label>
                <input
                  type="text" value={newInstSlug}
                  onChange={e => setNewInstSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="stmarys2026"
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 outline-none focus:border-cyan-500/50 transition-all text-slate-100 text-sm font-mono"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Lowercase letters, digits, hyphens. Admins, teachers, and parents of this school will enter this value as their Institution ID when logging in.
                </p>
              </div>

              <button 
                type="submit" disabled={isDeploying}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl py-4 font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-2 group"
              >
                {isDeploying ? (
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Globe className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                    Deploy Instance
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Listings Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                {view === 'active' ? <Building2 className="h-4 w-4 text-cyan-400" /> : <Archive className="h-4 w-4 text-amber-400" />}
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {view === 'active' ? 'Active Infrastructure' : 'Trash'}
              </h2>
            </div>
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              <button
                onClick={() => setView('active')}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                  view === 'active' ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                Active ({institutions.length})
              </button>
              <button
                onClick={() => setView('trash')}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-1.5",
                  view === 'trash' ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
                )}
              >
                <Archive className="h-3 w-3" /> Trash ({trashed.length})
              </button>
            </div>
          </div>

          {view === 'trash' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trashed.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800">
                  <Archive className="h-10 w-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">Trash is empty.</p>
                  <p className="text-slate-600 text-xs mt-1">Deleted schools appear here and are permanently purged after 90 days.</p>
                </div>
              ) : trashed.map(inst => (
                <motion.div
                  key={inst.id}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-slate-900/40 backdrop-blur-xl border border-amber-900/30 rounded-2xl p-6 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                        <Archive className="h-6 w-6 text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-200">{inst.name}</h4>
                        <p className="text-slate-500 text-[10px] font-mono tracking-wider uppercase">ID: <span className="text-amber-400">{inst.slug}</span></p>
                        <p className="text-[10px] text-slate-500 mt-1">Deleted {new Date(inst.deleted_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(inst.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                    >
                      <RotateCcw className="h-3 w-3" /> RESTORE
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-amber-900/20 pt-3">
                    <span className="text-[10px] font-mono text-amber-500/70 uppercase tracking-widest">
                      Permanent deletion in
                    </span>
                    <span className={cn(
                      "text-sm font-black",
                      inst.days_until_purge < 7 ? "text-red-400" : inst.days_until_purge < 30 ? "text-amber-400" : "text-slate-300"
                    )}>
                      {inst.days_until_purge} {inst.days_until_purge === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {view === 'active' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-20 text-center">
                <div className="inline-block h-8 w-8 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Scanning Network...</p>
              </div>
            ) : institutions.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-slate-900/40 rounded-3xl border border-dashed border-slate-800">
                <p className="text-slate-500 text-sm">No institutions detected on the platform.</p>
              </div>
            ) : institutions.map((inst, idx) => (
              <motion.div
                key={inst.id}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 group hover:border-cyan-500/30 transition-all relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-xl bg-slate-800 flex items-center justify-center border border-white/5">
                      <Building2 className="h-6 w-6 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <div>
                      {editingInst?.id === inst.id ? (
                        <form onSubmit={handleUpdate} className="space-y-2">
                          <input 
                            value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                            className="bg-slate-950 border border-cyan-500/40 rounded px-2 py-1 text-white text-base font-bold w-full outline-none"
                          />
                          <input 
                            value={editSlug} onChange={e => setEditSlug(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-400 text-[10px] font-mono w-full outline-none"
                          />
                          <div className="flex gap-2">
                            <button type="submit" className="px-3 py-1 bg-cyan-600 text-[10px] font-black uppercase text-white rounded hover:bg-cyan-500 transition-all">Save</button>
                            <button type="button" onClick={() => setEditingInst(null)} className="px-3 py-1 bg-slate-800 text-[10px] font-black uppercase text-slate-400 rounded hover:bg-slate-700 transition-all">Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <h4 className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors">{inst.name}</h4>
                          <p className="text-slate-500 text-[10px] font-mono tracking-wider uppercase">ID: <span className="text-cyan-400">{inst.slug}</span></p>
                        </>
                      )}
                    </div>
                  </div>

                  {!editingInst && (
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingInst(inst); setEditName(inst.name); setEditSlug(inst.slug); }} className="p-2 hover:bg-cyan-500/10 rounded-lg text-slate-600 hover:text-cyan-500 transition-all">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(inst.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-600 hover:text-red-500 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-1.5 w-1.5 rounded-full", inst.is_active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-red-500")} />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{inst.is_active ? "Live" : "Decommissioned"}</span>
                  </div>
                  
                  <button
                    onClick={() => toggleStatus(inst.id, inst.is_active)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all border",
                      inst.is_active 
                        ? "bg-red-500/5 text-red-500 border-red-500/20 hover:bg-red-500/10" 
                        : "bg-green-500/5 text-green-500 border-green-500/20 hover:bg-green-500/10"
                    )}
                  >
                    <Power className="h-2.5 w-2.5" />
                    {inst.is_active ? "DEACTIVATE" : "ACTIVATE"}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
