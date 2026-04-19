import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, BookOpen, ShieldAlert, Sparkles, ArrowRight, Target, Star } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const particles = Array.from({ length: 40 });

  const portalCards = [
    { 
      title: "Family Hub", 
      desc: "Deep insights into academic growth and behavior for parents and students.", 
      icon: Target, 
      gradient: "from-indigo-600 to-violet-700",
      glowColor: "rgba(99,102,241,0.2)",
      path: "/parent-login", 
      role: "parent",
      delay: 0.6 
    },
    { 
      title: "Faculty Forge", 
      desc: "Empowering educators with AI-driven lesson planning and advanced marking.", 
      icon: BookOpen, 
      gradient: "from-emerald-500 to-teal-700",
      glowColor: "rgba(16,185,129,0.2)",
      path: "/teacher-login", 
      role: "teacher",
      delay: 0.7 
    },
    { 
      title: "Core Admin", 
      desc: "Enterprise-grade oversight of institutional operations and security.", 
      icon: ShieldAlert, 
      gradient: "from-amber-500 to-orange-700",
      glowColor: "rgba(245,158,11,0.2)",
      path: "/admin-login", 
      role: "admin",
      delay: 0.8 
    }
  ];

  const handlePortalClick = (item: any) => {
    // If user is logged in with a different role, log them out first to prevent GuestRoute loops
    if (user && user.role !== item.role && !(user.role === 'super_admin' && item.role === 'admin')) {
      logout();
    }
    navigate(item.path);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#020617]">
      {/* Cinematic Background */}
      <motion.div 
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 3, ease: "easeOut" }}
        className="absolute inset-0 z-0"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(17,24,39,0)_0%,#020617_100%)] z-10" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center opacity-20 grayscale brightness-50" />
      </motion.div>

      {/* Aurora Blobs */}
      <div className="absolute inset-0 z-[1] pointer-events-none">
        <motion.div 
          animate={{ 
            x: [0, 80, -40, 0],
            y: [0, -40, 80, 0],
            scale: [1, 1.2, 0.9, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[140px]"
        />
        <motion.div 
          animate={{ 
            x: [0, -60, 40, 0],
            y: [0, 60, -20, 0],
            scale: [1, 1.1, 1.2, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[140px]"
        />
      </div>

      {/* Neural Particle System */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {particles.map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: 0,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{ 
              y: [null, Math.random() * -100 - 50 + "%"],
              opacity: [0, 0.7, 0],
            }}
            transition={{ 
              duration: Math.random() * 15 + 10, 
              repeat: Infinity, 
              ease: "linear",
              delay: Math.random() * 10
            }}
            className="absolute h-1 w-1 rounded-full bg-white/20 shadow-[0_0_10px_white]"
          />
        ))}
      </div>

      <div className="relative z-20 w-full max-w-7xl mx-auto py-20">
        <div className="text-center mb-24 px-4 overflow-visible">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex mb-10 items-center gap-3 px-6 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">The Future of Institutional Synergy</span>
          </motion.div>

          <div className="relative inline-block mb-12">
             <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 12, delay: 0.2 }}
                className="relative z-10 h-28 w-28 flex items-center justify-center rounded-[2rem] bg-gradient-to-br from-indigo-500 to-violet-700 shadow-[0_0_40px_rgba(99,102,241,0.5)]"
             >
                <GraduationCap className="h-14 w-14 text-white" />
             </motion.div>
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
               className="absolute inset-[-12px] rounded-[2.5rem] border border-dashed border-indigo-400/20"
             />
             <motion.div 
               animate={{ rotate: -360 }}
               transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
               className="absolute inset-[-24px] rounded-[3rem] border border-dotted border-white/5"
             />
          </div>

          <motion.h1 
            initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="text-7xl md:text-9xl font-black text-white tracking-tighter mb-8 leading-none"
          >
            Edu<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-primary to-violet-400 animate-gradient-x">Track</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed"
          >
            A high-fidelity digital ecosystem orchestrating the synergy between 
            <span className="text-white"> Faculty</span>, <span className="text-white">Families</span>, and <span className="text-white">Foundations</span>.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-3 gap-10 px-6">
          {portalCards.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: item.delay, type: "spring", stiffness: 100 }}
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-white/10 to-transparent rounded-[3rem] blur opacity-0 group-hover:opacity-100 transition duration-500" />
              <button
                onClick={() => handlePortalClick(item)}
                className="relative w-full h-full text-left p-10 rounded-[3rem] bg-white/[0.02] border border-white/5 backdrop-blur-3xl transition-all duration-700 hover:bg-white/[0.05] hover:border-white/10 hover:-translate-y-4 overflow-hidden"
              >
                <div 
                   className="absolute -right-20 -top-20 w-48 h-48 blur-[100px] transition-all duration-700 opacity-30 group-hover:opacity-100"
                   style={{ background: item.glowColor || 'rgba(255,255,255,0.05)' }}
                />
                
                <div className={`relative inline-flex p-6 rounded-3xl bg-gradient-to-br ${item.gradient} mb-10 items-center justify-center transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6 shadow-2xl`}>
                  <item.icon className="w-12 h-12 text-white" />
                </div>

                <h3 className="relative text-3xl font-black text-white mb-4 flex items-center gap-4">
                  {item.title}
                  <ArrowRight className="w-8 h-8 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-700 text-white/50" />
                </h3>
                
                <p className="relative text-slate-400 font-medium leading-relaxed mb-8 group-hover:text-slate-200 transition-colors">
                  {item.desc}
                </p>

                <div className="relative flex items-center gap-3 text-white/40 group-hover:text-white font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-700">
                  <Star className="w-3 h-3 text-indigo-400" />
                  Experience Alpha Presence
                </div>
              </button>
            </motion.div>
          ))}
        </div>

        {/* Elite Footer Metrics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="mt-32 text-center"
        >
          <div className="inline-flex items-center gap-10 px-12 py-5 rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-xl shadow-2xl">
             <div className="flex flex-col items-center">
                <span className="text-3xl font-black text-white">9+</span>
                <span className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-500">Expert Faculty</span>
             </div>
             <div className="w-px h-10 bg-white/10" />
             <div className="flex flex-col items-center">
                <span className="text-3xl font-black text-white">180</span>
                <span className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-500">Live Students</span>
             </div>
             <div className="w-px h-10 bg-white/10" />
             <div className="flex flex-col items-center">
                <span className="text-3xl font-black text-white">100%</span>
                <span className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-500">Uptime Nexus</span>
             </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
