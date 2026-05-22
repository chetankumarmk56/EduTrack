import { motion } from 'framer-motion';

interface TeacherAuroraProps {
  isDark?: boolean;
}

export default function TeacherAurora({ isDark = true }: TeacherAuroraProps) {
  if (!isDark) {
    return (
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]"
        style={{ background: '#f0f4f8' }}
      >
        {/* Soft ambient center glow */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 40%, rgba(5,150,105,0.05) 0%, transparent 65%)' }}
        />

        {/* Slowly rotating pastel orbs */}
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.04, 1] }}
          transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
          className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%]"
        >
          <div
            className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full blur-[130px]"
            style={{ background: 'rgba(5,150,105,0.07)' }}
          />
          <div
            className="absolute bottom-[20%] right-[20%] w-[40%] h-[40%] rounded-full blur-[130px]"
            style={{ background: 'rgba(99,102,241,0.06)' }}
          />
        </motion.div>

        {/* Primary emerald pulse */}
        <motion.div
          animate={{
            scale: [1, 1.18, 1],
            opacity: [0.07, 0.14, 0.07],
            x: [0, 45, 0],
            y: [0, -25, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full blur-[150px]"
          style={{ background: 'rgba(5,150,105,0.13)' }}
        />

        {/* Secondary indigo pulse */}
        <motion.div
          animate={{
            scale: [1.12, 1, 1.12],
            opacity: [0.05, 0.11, 0.05],
            x: [0, -40, 0],
            y: [0, 22, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full blur-[160px]"
          style={{ background: 'rgba(99,102,241,0.09)' }}
        />

        {/* Tertiary rose accent */}
        <motion.div
          animate={{ opacity: [0, 0.08, 0], scale: [0.6, 1, 0.6] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full blur-[100px]"
          style={{ background: 'rgba(244,63,94,0.06)' }}
        />

        {/* Subtle dot-grid texture */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(15,23,42,0.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            opacity: 0.5,
          }}
        />

        {/* Soft vignette to frame the page */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, transparent 40%, rgba(240,244,248,0.6) 100%)',
          }}
        />
      </div>
    );
  }

  /* ── Dark aurora (original, untouched) ── */
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1] bg-[#02040a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05)_0%,transparent_70%)]" />

      <motion.div
        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%]"
      >
        <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[20%] right-[20%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
      </motion.div>

      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.4, 0.15], x: [0, 50, 0], y: [0, -30, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-emerald-400/20 blur-[140px]"
      />

      <motion.div
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.3, 0.1], x: [0, -50, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/15 blur-[160px]"
      />

      <motion.div
        animate={{ opacity: [0, 0.15, 0], scale: [0.5, 1, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-rose-500/10 blur-[90px]"
      />

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PScwIDAgMjAwIDIwMCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48ZmlsdGVyIGlkPSduJz48ZmVUdXJidWxlbmNlIHR5cGU9J2ZyYWN0YWxOb2lzZScgYmFzZUZyZXF1ZW5jeT0nMC42NScgbnVtT2N0YXZlcz0nMyIgc3RpdGNoVGlsZXM9J3N0aXRjaCcvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbHRlcj0ndXJsKCNuKScvPjwvc3ZnPg==')] opacity-[0.25] mix-blend-soft-light contrast-150 brightness-150" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#02040a_100%)] opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#02040a]/40" />
    </div>
  );
}
