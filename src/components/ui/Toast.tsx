import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';

const icons = {
  success: <CheckCircle2 size={20} className="text-emerald-500" />,
  error: <XCircle size={20} className="text-red-500" />,
  info: <Info size={20} className="text-blue-500" />,
  warning: <AlertTriangle size={20} className="text-amber-500" />,
};

const styles = {
  success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-50 shadow-emerald-500/10",
  error: "border-red-500/20 bg-red-500/5 text-red-950 dark:text-red-50 shadow-red-500/10",
  info: "border-blue-500/20 bg-blue-500/5 text-blue-950 dark:text-blue-50 shadow-blue-500/10",
  warning: "border-amber-500/20 bg-amber-500/5 text-amber-950 dark:text-amber-50 shadow-amber-500/10",
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div 
      className="fixed z-9999 flex flex-col gap-3 pointer-events-none p-4 w-full sm:w-auto"
      style={{
        // Desktop: Top Right, Mobile: Top Center
        top: 0,
        right: 0,
      }}
    >
      <div className="flex flex-col items-center sm:items-end gap-3 w-full">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              layout
              className={cn(
                "pointer-events-auto min-w-[300px] max-w-full sm:max-w-md p-4 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 overflow-hidden",
                styles[toast.type]
              )}
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0">{icons[toast.type]}</div>
                <p className="text-[14px] font-bold tracking-tight">{toast.message}</p>
              </div>
              <button 
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X size={16} className="opacity-40" />
              </button>
              
              {/* Progress Bar for 2s duration */}
              <motion.div 
                className={cn(
                  "absolute bottom-0 left-0 h-0.5 w-full origin-left",
                  toast.type === 'success' && "bg-emerald-500",
                  toast.type === 'error' && "bg-red-500",
                  toast.type === 'info' && "bg-blue-500",
                  toast.type === 'warning' && "bg-amber-500"
                )}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 2, ease: "linear" }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
