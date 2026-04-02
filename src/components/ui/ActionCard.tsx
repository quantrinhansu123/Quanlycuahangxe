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
  red: 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md shadow-red-500/20',
  green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
  pink: 'bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-md shadow-pink-500/20',
  blue: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md shadow-blue-500/20',
  orange: 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/30',
  teal: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/20',
  purple: 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md shadow-violet-500/20',
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/20',
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20',
  slate: 'bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-md shadow-slate-600/20',
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
      className="group relative block"
    >
      <motion.div
        layoutId={layoutId}
        className="bg-card rounded-2xl p-4 lg:rounded-3xl lg:p-6 transition-all duration-300 hover:shadow-xl border border-border hover:border-primary/30 hover:-translate-y-1.5 h-full flex flex-col justify-between"
      >
        {/* Hover Arrow Icon */}
        <div className="absolute top-2 right-2 lg:top-3 lg:right-3 w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary opacity-0 -translate-x-1 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 shadow-md shadow-primary/20">
          <ArrowUpRight strokeWidth={2.5} className="size-4 lg:size-5" />
        </div>

        <div className="flex flex-col items-center text-center h-full pt-1">
          <div
            className={clsx(
              "w-12 h-12 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl flex items-center justify-center mb-3 lg:mb-5 transition-transform duration-500 group-hover:scale-110 shadow-lg",
              colorMap[colorScheme as keyof typeof colorMap]
            )}
          >
            <Icon strokeWidth={2} className="size-6 lg:size-10" />
          </div>

          <div className="space-y-1.5 lg:space-y-2">
            <h3 className="font-bold text-[15px] lg:text-[19px] text-foreground mb-0.5 lg:mb-1 group-hover:text-primary transition-colors tracking-tight leading-snug">
              {title}
            </h3>

            <p className="text-[12px] lg:text-[14px] text-muted-foreground leading-snug line-clamp-2 px-1 opacity-80 font-medium">
              {description}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
};
