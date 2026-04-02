import { Box, FileText, Users, Wallet, Wrench, BadgeDollarSign } from 'lucide-react';
import React from 'react';
import { useOutletContext } from 'react-router-dom';

import type { ActionCardProps } from '../components/ui/ActionCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ModuleCard } from '../components/ui/ModuleCard';
import { moduleData } from '../data/moduleData';
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
  const allSections = Object.values(moduleData).flat();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2 text-foreground">
          Chào buổi tối 👋
        </h1>
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
                  <h2 className="text-[14px] font-bold text-primary mb-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="w-1 h-4 bg-primary rounded-full"></span>
                      <span>{section.section}</span>
                    </div>
                    <div className="h-px flex-1 bg-border/60"></div>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
          {dashboardModules.map((module, idx) => (
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
