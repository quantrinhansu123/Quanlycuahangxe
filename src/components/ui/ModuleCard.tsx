import React from 'react';
import { clsx } from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export interface ModuleCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'slate';
  path?: string;
  layoutId?: string;
  /** When false, the item is hidden from the topbar sub-module tabs (mobile/desktop). */
  showInTopbar?: boolean;
}

const colorMap = {
  red: 'bg-red-500/10 text-red-500',
  green: 'bg-emerald-500/10 text-emerald-500',
  pink: 'bg-pink-500/10 text-pink-500',
  blue: 'bg-blue-500/10 text-blue-500',
  orange: 'bg-orange-500/10 text-orange-500',
  teal: 'bg-teal-500/10 text-teal-500',
  purple: 'bg-purple-500/10 text-purple-500',
  cyan: 'bg-cyan-500/10 text-cyan-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  slate: 'bg-slate-500/10 text-slate-500',
};

export const ModuleCard: React.FC<ModuleCardProps> = React.memo(({
  icon: Icon,
  title,
  description,
  colorScheme,
  path,
  layoutId
}) => {
  const card = (
    <motion.div
      layoutId={layoutId}
      className={clsx(
        'flex min-h-[72px] min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors duration-200 sm:rounded-2xl sm:p-3.5',
        path && 'group-hover:border-primary/35 group-hover:bg-muted/20 group-hover:shadow-sm cursor-pointer',
        !path && 'cursor-default opacity-60'
      )}
    >
      <div
        className={clsx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-[1.03] sm:h-12 sm:w-12',
          colorMap[colorScheme as keyof typeof colorMap]
        )}
      >
        <Icon className="size-5 sm:size-[22px]" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-[15px]">
          {title}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-[1.4] text-muted-foreground sm:text-[13px]">
          {description}
        </p>
      </div>

      <ArrowUpRight
        className="size-[18px] shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
    </motion.div>
  );

  if (!path) return <div aria-disabled="true">{card}</div>;

  return (
    <Link
      to={path}
      aria-label={`${title}. ${description}`}
      className="group block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:rounded-2xl"
    >
      {card}
    </Link>
  );
});
