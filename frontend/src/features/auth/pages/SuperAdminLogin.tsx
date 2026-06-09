import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Fingerprint, KeyRound, AlertCircle, Globe } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { authApi } from '@/features/auth/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';

// Decorative particle field. Pre-computed at module load so the
// react-hooks/purity rule isn't violated and positions stay stable
// across re-renders.
const PARTICLES = Array.from({ length: 20 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  duration: Math.random() * 8 + 8,
  delay: Math.random() * 10,
}));

export default function SuperAdminLogin() {
  const { login } = useAuth();
  const { setInstitutionName, setInstitutionLogoUrl } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Credentials required for uplink.");
      return;
    }

    try {
      // Super admin bypasses institution requirement, passing '0' or skipping 
      // but Axios interceptor requires a value so let's pass a dummy '1' 
      // that the backend will ignore for super_admins.
      localStorage.setItem('edu_institution_id', '1');
      
      const data = await authApi.login({ username, password }, '1');
      
      setError(null);
      setInstitutionName("Global Platform");
      // Super-admin is not tied to a single school — clear any cached
      // tenant logo so the sidebar doesn't show stale school branding
      // from a previous admin session on this device.
      setInstitutionLogoUrl(null);
      login(data.access_token, {
        ...data.user,
        role: data.role,
        institution_id: data.institution_id
      });
      navigate('/superadmin/dashboard');
    } catch (err) {
      console.error("Super Admin Login Failed:", err);
      setError(getErrorMessage(err).message || "Authentication failed. Unauthorized access detected.");
    }
  };


  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Matrix/Grid Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a80_1px,transparent_1px),linear-gradient(to_bottom,#0f172a80_1px,transparent_1px)] bg-[size:14px_24px] opacity-50" />
        
        {/* Floating orbs */}
        <motion.div 
          animate={{ x: [0, 50, -30, 0], y: [0, -30, 50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/4 top-1/4 w-[400px] h-[400px] rounded-full bg-cyan-700/10 blur-[100px]"
        />
        <motion.div 
          animate={{ x: [0, -60, 40, 0], y: [0, 60, -40, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-1/4 bottom-1/4 w-[350px] h-[350px] rounded-full bg-blue-700/10 blur-[100px]"
        />
        
        {/* Particles */}
        {PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            initial={{ x: `${p.x}%`, y: `${p.y}%`, opacity: 0 }}
            animate={{ y: [null, "-30%", "130%"], opacity: [0, 0.6, 0] }}
            transition={{ duration: p.duration, repeat: Infinity, ease: "linear", delay: p.delay }}
            className="absolute w-1.5 h-1.5 bg-cyan-400 rounded-full"
            style={{ boxShadow: '0 0 6px rgba(34,211,238,0.5)' }}
          />
        ))}
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
        className="w-full max-w-md bg-black/40 backdrop-blur-2xl border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden z-10"
      >
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[350px] w-[350px] rounded-full bg-cyan-900 opacity-20 blur-[120px]"></div>

        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
              className="relative h-20 w-20 bg-slate-900 rounded-2xl border border-cyan-500/50 flex items-center justify-center shadow-inner overflow-hidden"
            >
               <Globe className="h-10 w-10 text-cyan-400" />
               <motion.div 
                 animate={{ rotate: -360 }}
                 transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                 className="absolute inset-[-10px] rounded-[30px] border-2 border-dashed border-cyan-500/30"
               />
            </motion.div>
          </div>
          
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-center mb-10">
            <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">Global Platform</h1>
            <p className="text-slate-400 text-xs font-mono tracking-widest uppercase">Super Admin Override Interface</p>
          </motion.div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </motion.div>
            )}

            <div className="space-y-5">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }} className="space-y-2">
                <label className="text-xs font-mono text-cyan-500/80 uppercase tracking-widest">Platform Identity</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-cyan-600/50">
                    <Fingerprint className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(null); }}
                    className="w-full bg-slate-900/50 border border-slate-700/50 focus:border-cyan-500 text-cyan-50 rounded-lg pl-11 pr-4 py-3 text-base sm:text-sm outline-none transition-all focus:ring-1 focus:ring-cyan-500"
                    placeholder="Enter Global Username"
                  />
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
                <label className="text-xs font-mono text-cyan-500/80 uppercase tracking-widest">Root Cipher</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-cyan-600/50">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    className="w-full bg-slate-900/50 border border-slate-700/50 focus:border-cyan-500 text-cyan-50 rounded-lg pl-11 pr-4 py-3 text-base sm:text-sm outline-none transition-all focus:ring-1 focus:ring-cyan-500"
                    placeholder="Enter Encrypted Password"
                  />
                </div>
              </motion.div>
            </div>

            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg py-4 px-4 font-bold tracking-widest uppercase text-sm transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] mt-6 flex items-center justify-center gap-2"
            >
              <Globe className="w-5 h-5" /> Establish Link
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
