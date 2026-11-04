import React from 'react';
import { BarChart3, Grid2X2, Home, ShoppingCart, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';

interface MobileBottomNavProps {
  isDrawerOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ isDrawerOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hasViewAccess } = useAuth();

  const items = [
    ...(hasViewAccess('dashboard')
      ? [{ label: 'Trang chủ', path: '/', icon: Home, active: pathname === '/' }]
      : []),
    ...(hasViewAccess('ban-hang') || hasViewAccess('don-hang')
      ? [{
          label: 'Bán hàng',
          path: hasViewAccess('don-hang') ? '/ban-hang/phieu-ban-hang' : '/ban-hang',
          icon: ShoppingCart,
          active: pathname.startsWith('/ban-hang') && pathname !== '/ban-hang/khach-hang',
        }]
      : []),
    ...(hasViewAccess('khach-hang')
      ? [{ label: 'Khách hàng', path: '/ban-hang/khach-hang', icon: Users, active: pathname === '/ban-hang/khach-hang' }]
      : []),
    ...(hasViewAccess('bao-cao')
      ? [{ label: 'Báo cáo', path: '/bao-cao/san-pham', icon: BarChart3, active: pathname.startsWith('/bao-cao') }]
      : []),
  ];

  const isMoreActive = !items.some((item) => item.active);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-20 flex items-center gap-1 border-t border-border bg-card/95 px-2 pt-1.5 backdrop-blur-md lg:hidden"
    >
      {items.map(({ label, path, icon: Icon, active }) => (
        <button
          key={path}
          type="button"
          onClick={() => navigate(path)}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={clsx(
            'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-tight transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon size={20} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
          <span className="max-w-full truncate">{label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        aria-label="Mở tất cả chức năng"
        aria-expanded={isDrawerOpen}
        className={clsx(
          'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold leading-tight transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isMoreActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Grid2X2 size={20} strokeWidth={isMoreActive ? 2.4 : 2} aria-hidden="true" />
        <span className="truncate">Thêm</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
