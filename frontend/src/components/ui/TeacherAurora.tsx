import { motion } from 'framer-motion';

export default function TeacherAurora() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1] bg-[#02040a]">
      {/* Cinematic Deep Space Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05)_0%,transparent_70%)]" />
      
      {/* Rotating Neural Orbs */}
      <motion.div
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%]"
      >
        <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[20%] right-[20%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
      </motion.div>

      {/* Primary Aurora Pulse - Emerald */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.4, 0.15],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-emerald-400/20 blur-[140px]"
      />
      
      {/* Secondary Aurora Pulse - Indigo-Violet */}
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.1, 0.3, 0.1],
          x: [0, -50, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-indigo-600/15 blur-[160px]"
      />

      {/* Tertiary Flare - Rose/Pink Accents */}
      <motion.div
        animate={{
          opacity: [0, 0.15, 0],
          scale: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-rose-500/10 blur-[90px]"
      />
      
      {/* High-Fidelity Grain/Noise Layer */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PScwIDAgMjAwIDIwMCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48ZmlsdGVyIGlkPSduJz48ZmVUdXJidWxlbmNlIHR5cGU9J2ZyYWN0YWxOb2lzZScgYmFzZUZyZXF1ZW5jeT0nMC42NScgbnVtT2N0YXZlcz0nMyIgc3RpdGNoVGlsZXM9J3N0aXRjaCcvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbHRlcj0ndXJsKCNuKScvPjwvc3ZnPg==')] opacity-[0.25] mix-blend-soft-light contrast-150 brightness-150" />
      
      {/* Cinematic Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#02040a_100%)] opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#02040a]/40" />
    </div>
  );
}
