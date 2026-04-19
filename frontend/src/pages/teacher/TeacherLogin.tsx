import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Hash, Lock, AlertCircle } from 'lucide-react';

import { useAuth } from '../../lib/AuthContext';
import { useApp } from '../../lib/AppContext';
import { authApi } from '../../api/authApi';

export default function TeacherLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instId, setInstId] = useState('1');
  const [error, setError] = useState(false);
  const { login } = useAuth();
  const { setInstitutionName } = useApp();
  
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!instId || !trimmedEmail || !password) {
      setError(true);
      return;
    }
    try {
      // Send trimmed email instead of raw email
      const data = await authApi.login({ email: trimmedEmail, password }, instId);
      
      setError(false);
      setInstitutionName(`Institution ${instId}`);
      login(data.access_token, {
        ...data.user,
        role: data.role,
        institution_id: data.institution_id
      });
      const destination = data.role === 'super_admin' ? '/superadmin/dashboard' : 
                         data.role === 'admin' ? '/admin/directory' : 
                         '/teacher/dashboard';
      navigate(destination);
    } catch(err) {
      console.error("Login attempt failed:", err);
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side styling - Brand Graphic */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-emerald-600 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-900 opacity-90"></div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-white max-w-lg p-12"
        >
          <div className="flex h-16 w-16 mb-8 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-lg border border-white/30">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-6">Educator Portal.</h1>
          <p className="text-xl text-white/80 leading-relaxed font-medium">
            Manage your classroom, update marks, toggle attendance, and coordinate with parents all in one place.
          </p>
        </motion.div>
      </div>

      {/* Right side styling - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-card">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 mb-4 lg:hidden">
              <BookOpen className="h-6 w-6 text-emerald-600" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Teacher Access</h2>
            <p className="text-muted-foreground mt-2">Enter your designated classroom credentials.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-danger/10 border border-danger/20 flex items-center gap-3 text-danger text-sm font-medium"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Invalid credentials. Please verify your assignment.</span>
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Institution Code</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="number"
                    value={instId}
                    onChange={(e) => setInstId(e.target.value)}
                    placeholder="e.g. 1"
                    className="flex h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Educator Email</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher.name@school.edu"
                    className="flex h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Authentication Pin</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="*********"
                  className="flex h-11 w-full rounded-md border border-border bg-background px-10 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg h-11 py-2 px-4 shadow-md"
            >
              Access Classroom Portal
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
