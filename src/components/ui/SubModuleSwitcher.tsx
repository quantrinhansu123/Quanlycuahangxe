import React from 'react';
import { clsx } from 'clsx';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ModuleCardProps } from './ModuleCard';

interface SubModuleSwitcherProps {
  items: ModuleCardProps[];
  variant?: 'cards' | 'tabs';
}

export const SubModuleSwitcher: React.FC<SubModuleSwitcherProps> = ({ items, variant = 'tabs' }) => {
  const location = useLocation();

  const isTabs = variant === 'tabs';

  return (
    <div className={clsx(
      "flex items-center overflow-x-auto custom-scrollbar no-scrollbar",
      isTabs ? "gap-1 bg-muted/20 p-1 rounded-2xl border border-border/40" : "gap-2 pb-2 mb-4 -mx-1 px-1"
    )}>
      {items.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        const card = (
          <motion.div
            whileHover={{ y: isTabs ? 0 : -2 }}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              'group relative flex min-h-11 items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl transition-colors',
              item.path ? 'cursor-pointer' : 'cursor-default opacity-60',
              isTabs ? 'px-3 py-2 sm:px-4' : 'px-4 py-2.5 border shadow-sm',
              isActive
                ? (isTabs ? 'bg-card text-primary shadow-sm shadow-primary/5 ring-1 ring-primary/10' : 'bg-primary/10 border-primary text-primary shadow-sm')
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            {isActive && isTabs && (
              <motion.div
                layoutId="header-tab-active"
                className="absolute inset-0 -z-10 rounded-xl bg-card shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}

            <span className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Icon size={16} aria-hidden="true" />
            </span>

            <span className="flex min-w-0 flex-col">
              <span className={clsx(
                'font-semibold leading-none tracking-tight',
                isTabs ? 'text-xs sm:text-[13px]' : 'mb-0.5 text-[13px]',
                isActive ? 'text-primary' : 'text-foreground'
              )}>
                {item.title}
              </span>
              {!isTabs && (
                <span className="max-w-[120px] truncate text-[10px] leading-none text-muted-foreground">
                  {item.description}
                </span>
              )}
            </span>
          </motion.div>
        );

        return item.path ? (
          <Link
            key={item.path}
            to={item.path}
            aria-label={item.title}
            aria-current={isActive ? 'page' : undefined}
            className="block shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {card}
          </Link>
        ) : (
          <div key={item.title} aria-disabled="true">{card}</div>
        );
      })}
    </div>
  );
};
