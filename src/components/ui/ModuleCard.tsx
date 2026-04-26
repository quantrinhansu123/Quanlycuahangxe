import React from 'react';
import { clsx } from 'clsx';
import { HelpCircle, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  const handleClick = () => {
    if (path) {
      navigate(path);
    }
  };

  return (
    <motion.div 
      layoutId={layoutId}
      onClick={handleClick}
      className={clsx(
        "group flex items-center bg-card rounded-xl p-2.5 lg:rounded-2xl lg:p-4 transition-all duration-300 border border-border hover:border-primary/40 hover:shadow-lg cursor-pointer hover:-translate-y-1",
        !path && "opacity-60 grayscale-[0.5] cursor-not-allowed hover:translate-y-0 hover:border-border"
      )}
    >
      <div 
        className={clsx(
          "w-9 h-9 lg:w-12 lg:h-12 rounded-lg flex items-center justify-center shrink-0 mr-2.5 lg:mr-4 transition-all duration-500 group-hover:scale-110 shadow-md",
          colorMap[colorScheme as keyof typeof colorMap]
        )}
      >
        <Icon className="size-4.5 lg:size-6" />
      </div>
      
      <div className="flex-1 min-w-0 pr-2">
        <h3 className="font-bold text-[13px] lg:text-[16px] text-foreground mb-0.5 lg:mb-1 truncate transition-colors group-hover:text-primary leading-tight">
          {title}
        </h3>
        <p className="text-[11px] lg:text-[13px] text-muted-foreground truncate leading-snug opacity-80 font-medium">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-2 shrink-0 text-muted-foreground/30" onClick={(e) => e.stopPropagation()}>
        <button className="hover:text-amber-500 transition-colors" title="Đánh dấu">
          <Star className="size-3 lg:size-3.5" />
        </button>
        <button className="hover:text-primary transition-colors" title="Hướng dẫn">
          <HelpCircle className="size-3 lg:size-3.5" />
        </button>
      </div>
    </motion.div>
  );
});
