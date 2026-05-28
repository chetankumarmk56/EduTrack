import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, FileText } from 'lucide-react';

interface Props {
  url: string | null;
  onClose: () => void;
}

const PDF_REGEX = /\.pdf(\?|$)/i;

export default function ScreenshotPreview({ url, onClose }: Props) {
  useEffect(() => {
    if (!url) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [url, onClose]);

  const isPdf = url ? PDF_REGEX.test(url) : false;

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="relative max-w-3xl w-full max-h-[90vh] rounded-3xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Transaction proof
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-700"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-700"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[80vh] bg-slate-50 flex items-center justify-center">
              {isPdf ? (
                <div className="p-10 flex flex-col items-center gap-3 text-slate-600">
                  <FileText className="w-12 h-12" />
                  <p className="text-sm font-bold">PDF proof attached.</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-black uppercase tracking-widest text-primary underline"
                  >
                    Open PDF
                  </a>
                </div>
              ) : (
                <img
                  src={url}
                  alt="Transaction proof"
                  className="max-w-full max-h-[80vh] object-contain"
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
