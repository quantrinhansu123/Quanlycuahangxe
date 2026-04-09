import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileBottomNav from './MobileBottomNav';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { moduleData } from '../../data/moduleData';
import { ToastContainer } from '../ui/Toast';

const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const location = useLocation();

  // Pages that focus on heavy data (management tables)
  // Hide sidebar/bottom nav to give maximum space
  const isDataView = (
    location.pathname.split('/').filter(Boolean).length > 1 || 
    ['/thu-chi', '/dich-vu', '/cham-cong'].includes(location.pathname)
  );

  // Extract submodules with memoization to prevent Topbar re-renders
  const subModules = React.useMemo(() => 
    moduleData[`/${location.pathname.split('/')[1]}`]?.flatMap(s => s.items) || [],
    [location.pathname]
  );

  // Auto-close sidebar on mobile when navigating
  React.useEffect(() => {
    if (window.innerWidth < 1024 && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [location.pathname, sidebarOpen]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar - Hidden on focused data views */}
      {!isDataView && <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />}

      {/* Main Content Area */}
      <div 
        className={clsx(
          "flex-1 flex flex-col w-full min-w-0 transition-all duration-300",
          !isDataView ? (sidebarOpen ? "lg:ml-64" : "lg:ml-[72px]") : "lg:ml-0"
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
        <main className={clsx(
          "flex-1 overflow-y-auto custom-scrollbar relative pb-24 lg:pb-6",
          isDataView ? "p-0" : "p-4 lg:p-6"
        )}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ 
                duration: 0.35, 
                ease: [0.32, 0.72, 0, 1] 
              }}
              className="w-full h-full flex flex-col"
            >
              <Outlet context={{ globalSearch, setGlobalSearch }} />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Navigation - Always show on mobile */}
        <MobileBottomNav />
      </div>

      <ToastContainer />
    </div>
  );
};

export default MainLayout;

