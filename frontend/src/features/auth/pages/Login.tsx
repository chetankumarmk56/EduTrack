import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useApp } from '@/shared/contexts/AppContext';
import { authApi } from '@/features/auth/api';
import { motion } from 'framer-motion';
import { GraduationCap, Phone, AlertCircle, ChevronDown } from 'lucide-react';

const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const months = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' }, { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' }, { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' }, { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' }
];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => String(currentYear - i));

export default function Login() {
  const { login } = useAuth();
  const { setInstitutionName } = useApp();
  // New parent-portal login: guardian phone + student DOB. The school admin
  // recorded the guardian phone against the student at enrollment time, and
  // the (phone, DOB) pair is unique in practice — siblings share the phone
  // but not their dates of birth. Institution ID is no longer required;
  // backend derives it from the matched student record.
  const [parentPhone, setParentPhone] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedPhone = parentPhone.trim();
    if (!trimmedPhone || !dobDay || !dobMonth || !dobYear) {
      setError('Please enter the guardian phone number and a complete date of birth.');
      return;
    }
    // Reject phones with fewer than 4 digits early so the backend's
    // validation message isn't the only feedback path.
    const digitCount = (trimmedPhone.match(/\d/g) || []).length;
    if (digitCount < 10) {
      setError('Please enter a complete phone number (10 digits).');
      return;
    }

    const formattedDOB = `${dobYear}-${dobMonth}-${dobDay}`;

    try {
      const data = await authApi.parentLogin({
        parent_phone: trimmedPhone,
        dob: formattedDOB,
      });

      setError(null);
      // Prefer the real school name returned by the server; only fall back
      // to the numeric id label if the backend somehow didn't include it.
      if (data.institution_name) {
        setInstitutionName(data.institution_name);
      } else if (data.institution_id) {
        setInstitutionName(`Institution ${data.institution_id}`);
      }
      login(data.access_token, {
        ...data.user,
        role: data.role,
        institution_id: data.institution_id,
      });
      const destination = data.role === 'super_admin' ? '/superadmin/dashboard' :
                         data.role === 'admin' ? '/admin/directory' :
                         '/parent/dashboard';
      navigate(destination);
    } catch (err: any) {
      console.error('Parent Login Error:', err);
      // Surface the server's friendly message when present; fall back to
      // a generic line so we don't leak whether it was the phone or DOB.
      setError(err?.message || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side styling - Brand Graphic */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-indigo-600 to-purple-800 opacity-90"></div>
        
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
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-6">Empowering Parents. Navigating Success.</h1>
          <p className="text-xl text-white/80 leading-relaxed font-medium">
            Stay connected with your child's academic journey in real-time with EduTrack's comprehensive dashboard.
          </p>
        </motion.div>
      </div>

      {/* Right side styling - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-card">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4 lg:hidden">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome Back</h2>
            {window.location.search.includes('reason=expired') && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-primary text-sm font-bold mt-2 bg-primary/10 py-2 rounded-lg"
              >
                Session expired. Please login again.
              </motion.p>
            )}
            {!window.location.search.includes('reason=expired') && (
              <p className="text-muted-foreground mt-2">Enter your student's credentials to access the portal.</p>
            )}
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-danger/10 border border-danger/20 flex items-center gap-3 text-danger text-sm font-medium"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Guardian Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    autoComplete="tel"
                    inputMode="tel"
                    className="flex h-11 w-full rounded-md border border-border bg-background px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The same guardian number you gave the school admin during enrollment.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Student Date of Birth
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="flex h-11 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      <option value="" disabled>Day</option>
                      {days.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                  
                  <div className="relative">
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="flex h-11 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      <option value="" disabled>Month</option>
                      {months.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="flex h-11 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      <option value="" disabled>Year</option>
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg h-11 py-2 px-4 shadow-md"
            >
              Access Portal
            </button>
          </form>

          <p className="px-8 text-center text-sm text-muted-foreground mt-8">
            Having trouble logging in? <br className="sm:hidden" />
            <a href="#" className="underline underline-offset-4 hover:text-primary">Contact school administration.</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
