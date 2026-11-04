import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

export interface ActionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber';
  layoutId?: string;
}

const colorMap = {
  red: 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
  pink: 'bg-pink-50 text-pink-700 ring-pink-100 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20',
  teal: 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/20',
  purple: 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/20',
};

export const ActionCard: React.FC<ActionCardProps> = ({
  icon: Icon,
  title,
  description,
  href,
  colorScheme,
  layoutId
}) => {
  return (
    <Link
      to={href}
      className="group block h-full min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <motion.div
        layoutId={layoutId}
        className="flex h-full min-h-[148px] flex-col rounded-2xl border border-border bg-card p-3.5 transition-colors duration-200 hover:border-primary/35 hover:bg-white hover:shadow-sm active:scale-[0.99] sm:min-h-[160px] sm:p-4 lg:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className={clsx(
              "flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-[1.03] sm:h-12 sm:w-12",
              colorMap[colorScheme as keyof typeof colorMap]
            )}
          >
            <Icon strokeWidth={1.9} className="size-5 sm:size-[22px]" aria-hidden="true" />
          </div>
          <ArrowUpRight strokeWidth={2} className="size-[18px] shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary" aria-hidden="true" />
        </div>

        <div className="mt-3 min-w-0">
          <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-[15px]">
            {title}
          </h3>
          <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-muted-foreground sm:text-[13px]">
            {description}
          </p>
        </div>
      </motion.div>
    </Link>
  );
};
