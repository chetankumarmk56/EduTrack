import { motion } from 'framer-motion';

export default function ParentAurora() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1] bg-[#f4f7fa]">
      {/* Arctic mesh-gradient base */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.05)_0%,transparent_50%)]" />
      
      {/* Soft Celestial Orbs - Violet */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-200/40 blur-[100px]"
      />
      
      {/* Soft Celestial Orbs - Rose */}
      <motion.div
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.2, 0.4, 0.2],
          x: [0, -50, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-rose-100/40 blur-[120px]"
      />

      {/* Arctic Sky Flare */}
      <motion.div
        animate={{
          opacity: [0.1, 0.3, 0.1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-sky-100/30 blur-[80px]"
      />
      
      {/* Soft Grain for paper-like texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PScwIDAgMjAwIDIwMCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48ZmlsdGVyIGlkPSduJz48ZmVUdXJidWxlbmNlIHR5cGU9J2ZyYWN0YWxOb2lzZScgYmFzZUZyZXF1ZW5jeT0nMC42NScgbnVtT2N0YXZlcz0nMyIgc3RpdGNoVGlsZXM9J3N0aXRjaCcvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbHRlcj0ndXJsKCNuKScvPjwvc3ZnPg==')] opacity-[0.05] contrast-100 brightness-100 mix-blend-multiply" />
      
      {/* Light Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(244,247,250,0.8)_100%)]" />
    </div>
  );
}
