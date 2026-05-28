import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert, KeyRound, AlertCircle, Fingerprint } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { authApi } from '@/features/auth/api';
import { getErrorMessage } from '@/shared/lib/errorHandler';

// Decorative particle field. Pre-computed at module load so React's
// purity rule isn't violated (Math.random() during render is forbidden)
// and the particle positions stay stable across re-renders of the page.
const PARTICLES = Array.from({ length: 15 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  duration: Math.random() * 8 + 6,
  delay: Math.random() * 8,
}));

export default function AdminLogin() {
  const { login } = useAuth();
  const { setInstitutionName } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [instId, setInstId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !instId) {
      setError("Please fill in all required fields.");
      return;
    }

    try {
      // Interceptor reads role-suffixed key — must match what client.ts expects
      localStorage.setItem('edu_institution_id_admin', instId);

      const data = await authApi.login({ username, password }, instId);

      setError(null);
      // Prefer the real school name when the backend ships it back.
      setInstitutionName(data.institution_name || `Institution ${instId}`);
      login(data.access_token, {
        ...data.user,
        role: data.role,
        institution_id: data.institution_id
      });
      const destination = data.role === 'super_admin' ? '/superadmin/dashboard' : '/admin/directory';
      navigate(destination);
    } catch (err) {
      console.error("Admin Login Failed:", err);
      setError(getErrorMessage(err).message || "Authentication failed. Please check your credentials.");
    }
  };


  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] opacity-20" />

        {/* Floating orbs */}
        <motion.div
          animate={{
            x: [0, 50, -30, 0],
            y: [0, -30, 50, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/4 top-1/3 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 40, -20, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-1/4 bottom-1/3 w-[250px] h-[250px] rounded-full bg-violet-500/10 blur-[80px]"
        />

        {/* Floating particles */}
        {PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            initial={{
              x: `${p.x}%`,
              y: `${p.y}%`,
              opacity: 0,
            }}
            animate={{
              y: [null, "-30%", "130%"],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: "linear",
              delay: p.delay,
            }}
            className="absolute w-1 h-1 bg-indigo-400 rounded-full"
            style={{
              boxShadow: '0 0 4px rgba(129,140,248,0.4)',
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden z-10"
      >
        {/* Inner glow */}
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-indigo-500 opacity-15 blur-[100px]"></div>

        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="relative h-16 w-16 bg-slate-950 rounded-2xl border border-indigo-500/30 flex items-center justify-center shadow-inner"
            >
              <ShieldAlert className="h-8 w-8 text-indigo-500" />
              {/* Orbiting ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-6px] rounded-[20px] border border-dashed border-indigo-500/20"
              />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-8"
          >
            <h1 className="text-2xl font-bold tracking-tighter text-white mb-2">Restricted Access</h1>
            {window.location.search.includes('reason=expired') && (
              <p className="text-indigo-400 text-sm font-bold bg-indigo-400/10 py-1.5 rounded-md mb-2">
                Session expired. Re-authenticate.
              </p>
            )}
            {!window.location.search.includes('reason=expired') && (
              <p className="text-slate-400 text-sm">System Administration Server. Present credentials to unlock routing table.</p>
            )}
          </motion.div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </motion.div>
            )}

            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-2"
              >
                <label className="text-sm font-medium text-slate-300">Institution ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={instId}
                    onChange={(e) => { setInstId(e.target.value); setError(null); }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 font-mono"
                    placeholder="e.g. stmarys2026"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <label className="text-sm font-medium text-slate-300">Administrator ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                    <Fingerprint className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(null); }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    placeholder="Enter Identifier (Admin)"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-2"
              >
                <label className="text-sm font-medium text-slate-300">Root Passkey</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white rounded-lg pl-10 pr-4 py-2.5 outline-none transition-all focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    placeholder="Enter token (Password)"
                  />
                </div>
              </motion.div>
            </div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-3 px-4 font-semibold text-sm transition-all shadow-lg shadow-indigo-500/20 mt-4 flex items-center justify-center gap-2"
            >
              <Fingerprint className="w-4 h-4" /> Initialize Uplink
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
