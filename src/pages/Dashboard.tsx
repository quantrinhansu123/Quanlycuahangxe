import { Box, FileText, Users, Wallet, Wrench, BadgeDollarSign } from 'lucide-react';
import React from 'react';
import { useOutletContext } from 'react-router-dom';

import type { ActionCardProps } from '../components/ui/ActionCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useAuth } from '../context/AuthContext';
import { moduleData } from '../data/moduleData';
import type { ViewPermissionKey } from '../data/viewPermissions';
import { removeVietnameseTones } from '../lib/utils';

const dashboardModules: ActionCardProps[] = [
  {
    icon: FileText,
    title: 'Bán hàng',
    description: 'Quản lý đơn hàng và phiếu bán hàng CT.',
    href: '/ban-hang',
    colorScheme: 'orange'
  },
  {
    icon: Wallet,
    title: 'Thu chi',
    description: 'Quản lý dòng tiền và các chứng từ tài chính.',
    href: '/thu-chi',
    colorScheme: 'blue'
  },
  {
    icon: Wrench,
    title: 'Dịch vụ',
    description: 'Quản lý danh mục dịch vụ và giá cả.',
    href: '/dich-vu',
    colorScheme: 'purple'
  },
  {
    icon: Users,
    title: 'Nhân sự',
    description: 'Tuyển dụng, đào tạo, chấm công, lương.',
    href: '/nhan-su',
    colorScheme: 'emerald'
  },
  {
    icon: BadgeDollarSign,
    title: 'Tiền lương',
    description: 'Bảng lương, thuế, bảo hiểm và phụ cấp.',
    href: '/tien-luong',
    colorScheme: 'amber'
  },
  {
    icon: Box,
    title: 'Kho vận',
    description: 'Tồn kho, xuất nhập kho, vận chuyển.',
    href: '/kho-van',
    colorScheme: 'cyan'
  }
];

const Dashboard: React.FC = () => {
  const { globalSearch } = useOutletContext<{ globalSearch: string }>() || { globalSearch: '' };
  const { hasViewAccess } = useAuth();

  const resolveViewKey = React.useCallback((path?: string): ViewPermissionKey | undefined => {
    if (!path) return undefined;
    if (path.startsWith('/ban-hang')) return 'ban-hang';
    if (path.startsWith('/thu-chi')) return 'thu-chi';
    if (path.startsWith('/dich-vu')) return 'dich-vu';
    if (path.startsWith('/bao-cao')) return 'bao-cao';
    if (path.startsWith('/nhan-su')) return 'nhan-su';
    if (path.startsWith('/kho-van')) return 'kho-van';
    if (path.startsWith('/tien-luong')) return 'tien-luong';
    return undefined;
  }, []);

  const allSections = React.useMemo(() =>
    Object.values(moduleData).flat().map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const viewKey = resolveViewKey(item.path);
        return !viewKey || hasViewAccess(viewKey);
      }),
    })).filter((section) => section.items.length > 0),
  [hasViewAccess, resolveViewKey]);

  const visibleDashboardModules = React.useMemo(() =>
    dashboardModules.filter((module) => {
      const viewKey = resolveViewKey(module.href);
      return !viewKey || hasViewAccess(viewKey);
    }),
  [hasViewAccess, resolveViewKey]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-black flex items-center gap-3 text-foreground tracking-tight">
          Chào buổi tối 👋
        </h1>
        <p className="text-muted-foreground mt-1 text-[15px] font-medium opacity-60">Chào mừng bạn quay trở lại hệ thống!</p>
      </div>

      {globalSearch ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="space-y-8">
            {allSections.map((section, idx) => {
              const query = removeVietnameseTones(globalSearch);
              const filteredItems = section.items.filter(item =>
                removeVietnameseTones(item.title).includes(query) ||
                removeVietnameseTones(item.description).includes(query)
              );

              if (filteredItems.length === 0) return null;

              return (
                <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                  <h2 className="text-[16px] font-black text-primary mb-5 flex items-center gap-4 uppercase tracking-widest">
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                      <span>{section.section}</span>
                    </div>
                    <div className="h-px flex-1 bg-border/40"></div>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredItems.map((item, itemIdx) => (
                      <ModuleCard key={itemIdx} {...item} layoutId={`func-${item.title}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {visibleDashboardModules.map((module, idx) => (
            <ActionCard
              key={idx}
              {...module}
              layoutId={`mod-${module.title}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
