import React from 'react';
import { ArrowLeft, BarChart2, Home, Bell } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/';
  const isBaoCao = location.pathname.startsWith('/bao-cao');

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-40 px-2 flex items-center justify-between gap-0.5 pb-safe max-w-lg mx-auto w-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="p-2.5 text-muted-foreground hover:text-foreground transition-colors rounded-xl shrink-0"
        aria-label="Quay lại"
      >
        <ArrowLeft size={22} />
      </button>

      <button
        type="button"
        onClick={() => navigate('/bao-cao/san-pham')}
        className={clsx(
          'flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-xl shrink-0 min-w-[3.25rem] transition-colors',
          isBaoCao
            ? 'text-primary bg-primary/15'
            : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
        )}
        aria-label="Báo cáo doanh thu"
      >
        <BarChart2 size={22} strokeWidth={2.25} className="shrink-0" />
        <span className="text-[9px] font-bold leading-none">Báo cáo</span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/')}
        className={clsx(
          "w-12 h-12 rounded-full flex items-center justify-center -translate-y-4 shadow-lg transition-transform hover:scale-105 active:scale-95 shrink-0",
          isHome ? "bg-primary text-white" : "bg-card text-muted-foreground border border-border"
        )}
        aria-label="Trang chủ"
      >
        <Home size={24} />
      </button>

      <button
        type="button"
        className="relative p-2.5 text-muted-foreground hover:text-foreground transition-colors rounded-xl shrink-0"
        aria-label="Thông báo"
      >
        <Bell size={22} />
        <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">
          4
        </span>
      </button>
    </div>
  );
};

export default MobileBottomNav;
