import { useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, BookOpen, ShieldAlert, Sparkles, ArrowRight, Target, Star } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Mouse Tracking — single rAF-throttled listener, no React state churn.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 150 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  useEffect(() => {
    let rafId = 0;
    let pendingX = 0;
    let pendingY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      pendingX = (e.clientX / window.innerWidth) - 0.5;
      pendingY = (e.clientY / window.innerHeight) - 0.5;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        mouseX.set(pendingX);
        mouseY.set(pendingY);
        rafId = 0;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Parallax Transforms
  const heroX = useTransform(smoothX, [-0.5, 0.5], [20, -20]);
  const heroY = useTransform(smoothY, [-0.5, 0.5], [20, -20]);
  const auroraX = useTransform(smoothX, [-0.5, 0.5], [120, -120]);
  const auroraY = useTransform(smoothY, [-0.5, 0.5], [120, -120]);

  // Dynamic Background Gradient based on mouse
  const bgGradient = useMotionTemplate`radial-gradient(circle at ${useTransform(smoothX, [-0.5, 0.5], [20, 80])}% ${useTransform(smoothY, [-0.5, 0.5], [20, 80])}%, rgba(99,102,241,0.08) 0%, transparent 50%)`;

  const particles = Array.from({ length: 14 });

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

  const handlePortalClick = async (item: any) => {
    // If user is logged in with a different role, log them out first to prevent GuestRoute loops.
    // Await so the server-side cookie clear lands before we navigate —
    // otherwise the cached session auto-logs them straight into their
    // old portal instead of the login page they just clicked.
    if (user && user.role !== item.role && !(user.role === 'super_admin' && item.role === 'admin')) {
      await logout();
    }
    navigate(item.path);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-[#020617]">
      {/* Cinematic Magnetic Background */}
      <div className="absolute inset-0 z-0 bg-[#020617]">
        <motion.div 
          style={{ x: auroraX, y: auroraY, background: bgGradient }}
          className="absolute inset-0 z-0"
        />
        <motion.div 
          style={{ opacity: useTransform(smoothY, [-0.5, 0.5], [0.3, 0.6]) }}
          className="absolute inset-0 bg-[url('/nexus_hero_bg.png')] bg-cover bg-center grayscale brightness-[0.4] transition-all duration-1000" 
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,#020617_100%)]" />
        
        {/* Subtle Scanline Effect */}
        <div className="absolute inset-0 z-10 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%]" />
      </div>

      {/* Spectral Aurora Blobs */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        <motion.div 
          style={{ 
            x: useTransform(smoothX, [-0.5, 0.5], [-200, 200]), 
            y: useTransform(smoothY, [-0.5, 0.5], [-200, 200]),
            scale: useTransform(smoothY, [-0.5, 0.5], [1, 1.2]) 
          }}
          className="absolute top-0 left-0 w-[1000px] h-[1000px] rounded-full bg-indigo-600/10 blur-[180px]"
        />
        <motion.div 
          style={{ 
            x: useTransform(smoothX, [-0.5, 0.5], [200, -200]), 
            y: useTransform(smoothY, [-0.5, 0.5], [200, -200]),
            scale: useTransform(smoothX, [-0.5, 0.5], [1.2, 1])
          }}
          className="absolute bottom-0 right-0 w-[900px] h-[900px] rounded-full bg-violet-600/10 blur-[180px]"
        />
      </div>

      {/* Soft cursor-following glow (single element, no per-move state) */}
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <motion.div
          style={{
            x: useTransform(smoothX, [-0.5, 0.5], [window.innerWidth * 0.2, window.innerWidth * 0.8]),
            y: useTransform(smoothY, [-0.5, 0.5], [window.innerHeight * 0.2, window.innerHeight * 0.8]),
          }}
          className="absolute w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px]"
        />
      </div>

      {/* Floating Interactive Geometric Shapes */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            x: useTransform(smoothX, [-0.5, 0.5], [Math.random() * 200 - 100, Math.random() * -200 + 100]),
            y: useTransform(smoothY, [-0.5, 0.5], [Math.random() * 200 - 100, Math.random() * -200 + 100]),
            rotate: useTransform(smoothX, [-0.5, 0.5], [0, i * 90])
          }}
          className="absolute z-[2] opacity-20 pointer-events-none"
          initial={{ top: Math.random() * 100 + "%", left: Math.random() * 100 + "%" }}
        >
          <div className="w-32 h-32 border border-white/10 rounded-3xl rotate-45 backdrop-blur-sm" />
        </motion.div>
      ))}

      {/* Neural Mesh Particle System */}
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
            style={{
              x: useTransform(smoothX, [-0.5, 0.5], [Math.random() * 100 - 50, Math.random() * -100 + 50]),
              translateY: useTransform(smoothY, [-0.5, 0.5], [Math.random() * 80, Math.random() * -80])
            }}
            animate={{ 
              y: [null, Math.random() * -100 - 50 + "%"],
              opacity: [0, 0.8, 0],
            }}
            transition={{ 
              duration: Math.random() * 10 + 8, 
              repeat: Infinity, 
              ease: "easeInOut",
              delay: Math.random() * 5
            }}
            className="absolute h-1 w-1 rounded-full bg-indigo-400/30 shadow-[0_0_12px_rgba(129,140,248,0.5)]"
          />
        ))}
      </div>

      <div className="relative z-20 w-full max-w-7xl mx-auto py-20">
        <motion.div 
          style={{ x: heroX, y: heroY }}
          className="text-center mb-24 px-4 overflow-visible"
        >
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
                whileHover={{ scale: 1.15, rotate: 5 }}
                transition={{ type: "spring", damping: 12, delay: 0.2 }}
                className="relative z-10 h-28 w-28 flex items-center justify-center rounded-[2rem] bg-gradient-to-br from-indigo-500 to-violet-700 shadow-[0_0_60px_rgba(99,102,241,0.6)] cursor-pointer"
             >
                <GraduationCap className="h-14 w-14 text-white" />
             </motion.div>
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
               className="absolute inset-[-12px] rounded-[2.5rem] border border-dashed border-indigo-400/30"
             />
             <motion.div 
               animate={{ rotate: -360 }}
               transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
               className="absolute inset-[-24px] rounded-[3rem] border border-dotted border-white/10"
             />
          </div>

          <motion.h1 
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter mb-6 sm:mb-8 leading-none select-none"
          >
            {"EduTrack".split("").map((char, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.1 * i, duration: 0.8, ease: "circOut" }}
                className={`inline-block ${char === 'T' || char === 'r' || char === 'a' || char === 'c' || char === 'k' ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-primary to-violet-400 animate-gradient-x' : ''}`}
              >
                {char}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed"
          >
            A high-fidelity digital ecosystem orchestrating the synergy between 
            <span className="text-white hover:text-indigo-400 transition-colors cursor-default"> Faculty</span>, 
            <span className="text-white hover:text-emerald-400 transition-colors cursor-default"> Families</span>, and 
            <span className="text-white hover:text-amber-400 transition-colors cursor-default"> Foundations</span>.
          </motion.p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8 md:gap-10 px-3 sm:px-6">
          {portalCards.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ 
                rotateX: (i - 1) * 12, 
                rotateY: (i - 1) * -12,
                translateZ: 50,
                scale: 1.02
              }}
              transition={{ delay: item.delay, type: "spring", stiffness: 150, damping: 15 }}
              className="relative group perspective-2000"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-transparent rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition duration-700" />
              <button
                onClick={() => handlePortalClick(item)}
                className="relative w-full h-full text-left p-6 sm:p-10 md:p-12 rounded-2xl sm:rounded-[3rem] bg-white/[0.01] border border-white/5 backdrop-blur-3xl transition-all duration-700 hover:bg-white/[0.03] hover:border-white/20 overflow-hidden shadow-2xl"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Specular Highlight Overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-700 bg-gradient-to-tr from-transparent via-white to-transparent" />
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
          <div className="inline-flex flex-wrap justify-center items-center gap-5 sm:gap-10 px-6 sm:px-12 py-4 sm:py-5 rounded-2xl sm:rounded-[2.5rem] bg-white/[0.02] border border-white/5 backdrop-blur-xl shadow-2xl">
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
