import { motion, type Transition } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  speed?: 'fast' | 'smooth';
}

export function PageWrapper({ children, speed = 'smooth' }: PageWrapperProps) {
  const transition: Transition = speed === 'fast'
    ? { duration: 0.15, ease: 'easeOut' }
    : { duration: 0.22, ease: 'easeOut' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={transition}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}

export default PageWrapper;

export const StaggerContainer = ({ children, delay = 0.03, className }: { children: ReactNode, delay?: number, className?: string }) => (
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
          delayChildren: 0,
        },
      },
    }}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ children, className }: { children: ReactNode, className?: string }) => (
  <motion.div
    className={className}
    variants={{
      hidden: { opacity: 0, y: 12 },
      show: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.2, ease: 'easeOut' },
      },
    }}
  >
    {children}
  </motion.div>
);
