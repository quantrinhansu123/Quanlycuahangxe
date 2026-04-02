import React from 'react';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useLocation, useOutletContext, Outlet } from 'react-router-dom';
import { moduleData } from '../data/moduleData';
import { sidebarMenu } from '../data/sidebarMenu';
import { motion } from 'framer-motion';

const ModulePage: React.FC = () => {
  const { globalSearch } = useOutletContext<{ globalSearch: string }>() || { globalSearch: '' };
  const location = useLocation();
  
  // Extract the base module path (e.g., "/ban-hang") correctly even for sub-routes
  const baseModulePath = `/${location.pathname.split('/')[1]}`;
  
  const currentItem = sidebarMenu.find(item => item.path === baseModulePath);
  const data = moduleData[baseModulePath] || [];

  const isSubRoute = location.pathname !== currentItem?.path && location.pathname !== '/';

  return (
    <motion.div 
      className="animate-in fade-in duration-500 w-full flex flex-col h-full"
    >
      {/* Content Area */}
      <div className="min-h-0">
        {isSubRoute ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
            <Outlet context={{ globalSearch }} />
          </div>
        ) : (
          <div className="space-y-8 pb-8">
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
