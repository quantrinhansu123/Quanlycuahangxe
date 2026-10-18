import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileBottomNav from './MobileBottomNav';
import { clsx } from 'clsx';
import { moduleData } from '../../data/moduleData';
import { ToastContainer } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { resolveViewKeyByPath } from '../../data/viewPermissions';
import { ErrorBoundary } from '../ErrorBoundary';
import TopProgressBar from '../ui/TopProgressBar';

const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement | null>(null);
  const pageKey = location.pathname === '/bao-cao' || location.pathname.startsWith('/bao-cao/') ? '/bao-cao' : location.pathname;
  const { hasViewAccess, isAdmin } = useAuth();

  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    const timer = window.setTimeout(() => setGlobalSearch(''), 0);
    return () => window.clearTimeout(timer);
  }, [pageKey]);

  // Pages that focus on heavy data (management tables)
  // Hide sidebar/bottom nav to give maximum space
  const isDataView = (
    location.pathname.split('/').filter(Boolean).length > 1 || 
    ['/thu-chi', '/so-quy', '/dich-vu', '/cham-cong'].includes(location.pathname)
  );

  // Extract submodules with memoization to prevent Topbar re-renders
  const subModules = React.useMemo(() => {
    const items = moduleData[`/${location.pathname.split('/')[1]}`]?.flatMap(s => s.items) || [];
    return items.filter((i) => {
      if (i.showInTopbar === false) return false;
      if (!isAdmin && location.pathname.startsWith('/tien-luong') && i.path !== '/tien-luong/bang-luong') {
        return false;
      }
      const viewKey = resolveViewKeyByPath(i.path);
      return !viewKey || hasViewAccess(viewKey);
    });
  }, [location.pathname, hasViewAccess, isAdmin]);

  // Auto-close sidebar on mobile when navigating
  React.useEffect(() => {
    if (window.innerWidth < 1024 && sidebarOpen) {
      const timer = window.setTimeout(() => setSidebarOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [location.pathname, sidebarOpen]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar - Hidden on focused data views */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Main Content Area */}
      <div 
        className={clsx(
          "flex-1 flex flex-col w-full min-w-0 transition-all duration-300",
          sidebarOpen ? "lg:ml-64" : "lg:ml-[72px]"
        )}
      >
        <Topbar 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          subModules={subModules}
        />

        {/* Scrollable Content */}
        <main ref={mainRef} className={clsx(
          "flex-1 overflow-y-auto custom-scrollbar relative pb-24 lg:pb-6",
          isDataView ? "p-0" : "p-4 lg:p-6"
        )}>
          <div key={pageKey} className="w-full h-full flex flex-col animate-in fade-in duration-150 motion-reduce:animate-none">
            <ErrorBoundary key={pageKey}>
              <React.Suspense fallback={<TopProgressBar />}>
                <Outlet context={{ globalSearch, setGlobalSearch }} />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        </main>

        {/* Mobile Bottom Navigation - Always show on mobile */}
        <MobileBottomNav />
      </div>

      <ToastContainer />
    </div>
  );
};

export default MainLayout;
