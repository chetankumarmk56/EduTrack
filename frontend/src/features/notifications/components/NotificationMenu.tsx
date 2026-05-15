import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Clock, Info, AlertCircle } from 'lucide-react';
import { useApp } from '@/shared/contexts/AppContext';
import { cn } from '@/shared/lib/utils';

export default function NotificationMenu() {
  const { notifications, markNotificationRead } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'FEE_REMINDER': return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'ALERT': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all crystal-glow"
      >
        <Bell className={cn("h-5 w-5", unreadCount > 0 ? "text-primary animate-pulse" : "text-muted-foreground")} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-lg">
            {unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-3 w-80 sm:w-96 premium-glass rounded-[2rem] shadow-2xl overflow-hidden z-50 border border-white/50"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/40">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Intelligence Feed</h3>
              {unreadCount > 0 && (
                 <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">
                   {unreadCount} New
                 </span>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <Bell className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-muted-foreground italic">No transmissions found.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div 
                    key={n.id}
                    className={cn(
                      "p-5 border-b border-slate-50 transition-all hover:bg-white/60 relative group",
                      !n.is_read ? "bg-primary/5" : "opacity-70"
                    )}
                  >
                    <div className="flex gap-4">
                      <div className={cn("mt-1 h-8 w-8 rounded-lg flex items-center justify-center shrink-0", !n.is_read ? "bg-white shadow-sm" : "bg-slate-100")}>
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                           <p className={cn("text-sm font-black tracking-tight", !n.is_read ? "text-foreground" : "text-muted-foreground")}>
                             {n.title}
                           </p>
                           {!n.is_read && (
                             <button 
                               onClick={() => markNotificationRead(n.id)}
                               className="p-1 rounded-md hover:bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                               <Check className="w-3.5 h-3.5" />
                             </button>
                           )}
                        </div>
                        <p className="text-xs font-medium text-muted-foreground/80 mt-1 line-clamp-2">
                          {n.message}
                        </p>
                        <div className="flex items-center gap-1.5 mt-3 text-[10px] font-black uppercase tracking-tighter text-muted-foreground/40">
                          <Clock className="w-3 h-3" />
                          {new Date(n.created_at).toLocaleDateString()} at {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button 
              className="w-full p-4 text-[10px] font-black uppercase tracking-[0.3em] text-primary hover:bg-primary/5 transition-colors border-t border-slate-100"
              onClick={() => setIsOpen(false)}
            >
              Close Feed
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
