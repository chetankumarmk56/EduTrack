import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  speed?: 'fast' | 'smooth';
}

export function PageWrapper({ children, speed = 'smooth' }: PageWrapperProps) {
  const transition: any = speed === 'fast' 
    ? { type: "spring", stiffness: 300, damping: 30 }
    : { duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }; // Premium backOut-inspired ease

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={transition}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}

export default PageWrapper;

export const StaggerContainer = ({ children, delay = 0.08, className }: { children: ReactNode, delay?: number, className?: string }) => (
  <motion.div
    initial="hidden"
    animate="show"
    className={className}
    variants={{
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: {
          staggerChildren: delay,
          delayChildren: 0.1
        }
      }
    }}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode, className?: string }) => (
  <motion.div
    className={className}
    variants={{
      hidden: { 
        opacity: 0, 
        y: 40, 
        scale: 0.92,
        filter: "blur(10px)" 
      },
      show: { 
        opacity: 1, 
        y: 0, 
        scale: 1,
        filter: "blur(0px)",
        transition: {
          type: "spring",
          stiffness: 80,
          damping: 15,
          mass: 1
        }
      }
    }}
  >
    {children}
  </motion.div>
);
