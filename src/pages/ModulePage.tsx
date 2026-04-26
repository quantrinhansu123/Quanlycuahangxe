import React from 'react';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useLocation, useOutletContext, Outlet, useNavigate } from 'react-router-dom';
import { moduleData } from '../data/moduleData';
import { sidebarMenu } from '../data/sidebarMenu';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

const ModulePage: React.FC = () => {
  const { globalSearch, setGlobalSearch } = useOutletContext<{ globalSearch: string; setGlobalSearch: (val: string) => void }>() || { globalSearch: '', setGlobalSearch: () => {} };
  const location = useLocation();
  // Extract the base module path (e.g., "/ban-hang") correctly even for sub-routes
  const baseModulePath = `/${location.pathname.split('/')[1]}`;
  const currentItem = sidebarMenu.find(item => item.path === baseModulePath);
  const data = moduleData[baseModulePath] || [];
  const subModules = data.length > 0 ? data[0].items : [];
  const navigate = useNavigate();

  // Smart Redirection for Mobile: nhảy thẳng trang con cho các module (gọn hơn), trừ Bán hàng — cần
  // giữ màn hình 2 thẻ (phiếu / khách) thay vì ép vào phiếu bán hàng.
  useEffect(() => {
    if (baseModulePath === '/ban-hang') return;
    const isMobile = window.innerWidth < 1024;
    const isRootModulePath = location.pathname === baseModulePath;

    if (isMobile && isRootModulePath && subModules.length > 0 && subModules[0].path) {
      navigate(subModules[0].path, { replace: true });
    }
  }, [location.pathname, baseModulePath, subModules, navigate]);

  const isSubRoute = location.pathname !== currentItem?.path && location.pathname !== '/';

  return (
    <motion.div 
      className="animate-in fade-in duration-500 w-full flex flex-col h-full"
    >
      {/* Content Area */}
      <div className="min-h-0 h-full">
        <Outlet context={{ globalSearch, setGlobalSearch }} />
        
        {!isSubRoute && (
          <div className="space-y-8 pb-8 animate-in fade-in duration-500">
            {data.map((section, idx) => {
              // Filter items by search query
              const filteredItems = section.items.filter(item => 
                item.title.toLowerCase().includes(globalSearch.toLowerCase()) || 
                item.description.toLowerCase().includes(globalSearch.toLowerCase())
              );

              if (filteredItems.length === 0) return null;

              return (
                <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                  <h2 className="text-[14px] font-bold text-primary mb-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-1 h-4 bg-primary rounded-full"></span>
                      <span>{section.section}</span>
                    </div>
                    <div className="h-px flex-1 bg-border/60"></div>
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredItems.map((item, itemIdx) => (
                      <ModuleCard key={itemIdx} {...item} layoutId={`func-${item.title}`} />
                    ))}
                  </div>
                </div>
              );
            })}
            
            {globalSearch && !data.some(s => s.items.some(i => i.title.toLowerCase().includes(globalSearch.toLowerCase()) || i.description.toLowerCase().includes(globalSearch.toLowerCase()))) && (
              <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border">
                Không tìm thấy kết quả phù hợp cho "{globalSearch}"
              </div>
            )}
            
            {data.length === 0 && (
              <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border border-dashed mt-4">
                Module này đang được phát triển...
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ModulePage;
