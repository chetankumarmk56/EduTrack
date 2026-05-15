import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Shield, Edit3, Trash2, Mail, Building2 } from 'lucide-react';
import { superAdminApi } from '@/features/super-admin/api';
import type { Institution } from '@/shared/types';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  institution_id: number;
}

export default function SuperAdminCredentials() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
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
      setAdmins(adminData);
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
      const updateData: any = { name: editName, email: editEmail };
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

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Credential Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage platform-wide institutional administrator identities.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-3">
             <Shield className="h-5 w-5 text-cyan-400" />
             <div className="text-[10px] font-mono leading-tight">
               <div className="text-slate-500 uppercase tracking-widest">Global Auth</div>
               <div className="text-white font-bold uppercase tracking-tighter">Encrypted Link</div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Provision Form */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="xl:col-span-1"
        >
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-slate-800/50 rounded-3xl p-6 relative overflow-hidden h-fit sticky top-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Plus className="h-5 w-5 text-cyan-500" />
              New Credential
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                <input 
                  type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 outline-none focus:border-cyan-500/50 transition-all text-slate-200 text-sm"
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-1">Access Email</label>
                <input 
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 outline-none focus:border-cyan-500/50 transition-all text-slate-200 text-sm"
                  placeholder="admin@school.edu"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-1">Root Password</label>
                <input 
                  type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 outline-none focus:border-cyan-500/50 transition-all text-slate-200 text-sm"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-1">Assign Institution</label>
                <select 
                  value={targetInst} onChange={e => setTargetInst(Number(e.target.value))}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2.5 outline-none focus:border-cyan-500/50 transition-all text-slate-200 text-sm appearance-none"
                >
                  <option value="">Select a School...</option>
                  {institutions.map(inst => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" disabled={isCreating}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-3 font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/10 mt-2 flex items-center justify-center gap-2"
              >
                {isCreating ? 'Encrypting...' : 'Provision Access'}
              </button>
            </form>
          </div>
        </motion.div>

        {/* Credentials List */}
        <div className="xl:col-span-3 space-y-4">
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/5">
                    <th className="px-6 py-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Identiy</th>
                    <th className="px-6 py-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Institution</th>
                    <th className="px-6 py-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-500 font-mono text-xs uppercase animate-pulse">Synchronizing Identities...</td></tr>
                  ) : admins.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-500 text-sm">No administrators found.</td></tr>
                  ) : admins.map((admin, idx) => (
                    <motion.tr 
                      key={admin.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                      className="group hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        {editingAdmin?.id === admin.id ? (
                          <div className="space-y-2 max-w-xs">
                            <input 
                              value={editName} onChange={e => setEditName(e.target.value)}
                              className="bg-slate-950 border border-cyan-500/40 rounded px-2 py-1 text-white text-sm w-full outline-none"
                            />
                            <input 
                              value={editEmail} onChange={e => setEditEmail(e.target.value)}
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-400 text-xs w-full outline-none"
                            />
                            <input 
                              type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                              placeholder="New password (optional)"
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-400 text-xs w-full outline-none"
                            />
                            <div className="flex gap-2">
                              <button onClick={handleUpdate} className="px-3 py-1 bg-cyan-600 text-[10px] font-black uppercase text-white rounded">Save</button>
                              <button onClick={() => setEditingAdmin(null)} className="px-3 py-1 bg-slate-800 text-[10px] font-black uppercase text-slate-400 rounded">X</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition-all">
                              {admin.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-100">{admin.name}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <Mail className="h-3 w-3" />
                                {admin.email}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-600" />
                          <span className="text-sm text-slate-300">
                            {institutions.find(i => i.id === admin.institution_id)?.name || "Unknown"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className="px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 font-bold tracking-tighter uppercase">Authorized</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!editingAdmin && (
                            <>
                              <button 
                                onClick={() => { 
                                  setEditingAdmin(admin); 
                                  setEditName(admin.name); 
                                  setEditEmail(admin.email); 
                                }}
                                className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-cyan-400 transition-all"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(admin.id)}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-all"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
