import React from 'react';
import { clsx } from 'clsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ModuleCardProps } from './ModuleCard';

interface SubModuleSwitcherProps {
  items: ModuleCardProps[];
  variant?: 'cards' | 'tabs';
}

export const SubModuleSwitcher: React.FC<SubModuleSwitcherProps> = ({ items, variant = 'tabs' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isTabs = variant === 'tabs';

  return (
    <div className={clsx(
      "flex items-center overflow-x-auto custom-scrollbar no-scrollbar",
      isTabs ? "gap-1 bg-muted/20 p-1 rounded-2xl border border-border/40" : "gap-2 pb-2 mb-4 -mx-1 px-1"
    )}>
      {items.map((item, idx) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;

        return (
          <motion.div
            key={idx}
            whileHover={{ y: isTabs ? 0 : -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => item.path && navigate(item.path)}
            className={clsx(
              "flex items-center gap-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 overflow-hidden relative group",
              isTabs ? "px-2.5 py-1.5 sm:px-4" : "px-4 py-2.5 border shadow-sm",
              isActive 
                ? (isTabs ? "bg-card text-primary shadow-sm shadow-primary/5 ring-1 ring-primary/10" : "bg-primary/10 border-primary text-primary shadow-sm") 
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {/* Active Indicator Slide for Tabs */}
            {isActive && isTabs && (
              <motion.div 
                layoutId="header-tab-active"
                className="absolute inset-0 bg-card rounded-xl -z-10 shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}

            <div className={clsx(
              "rounded-lg items-center justify-center shrink-0 transition-colors",
              isTabs ? "hidden sm:flex w-6 h-6 bg-primary/10" : "flex w-8 h-8",
              isActive ? "text-primary bg-primary/20" : "text-muted-foreground/60 bg-muted"
            )}>
              <Icon size={isTabs ? 14 : 18} />
            </div>

            <div className="flex flex-col">
              <span className={clsx(
                "font-bold leading-none tracking-tight",
                isTabs ? "text-[11px] sm:text-[13px]" : "text-[13px] mb-0.5",
                isActive ? "text-primary" : "text-foreground"
              )}>
                {item.title}
              </span>
              {!isTabs && (
                <span className="text-[10px] opacity-60 leading-none truncate max-w-[120px]">
                  {item.description}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
