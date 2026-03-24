import { clsx } from 'clsx';
import { Box, Clock, FileText, Search, Users, Wallet, Wrench } from 'lucide-react';
import React, { useState } from 'react';
import type { ActionCardProps } from '../components/ui/ActionCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ModuleCard } from '../components/ui/ModuleCard';
import { moduleData } from '../data/moduleData';

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
    icon: Clock,
    title: 'Chấm công',
    description: 'Chấm công vào/ra hàng ngày.',
    href: '/cham-cong',
    colorScheme: 'blue'
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
  const [activeTab, setActiveTab] = useState<'chuc-nang' | 'danh-dau' | 'tat-ca'>('chuc-nang');
  const [searchQuery, setSearchQuery] = useState('');

  const allSections = Object.values(moduleData).flat();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2 text-foreground">
          Chào buổi tối 👋
        </h1>
      </div>

      <div className={clsx(
        "bg-card rounded-xl shadow-sm border border-border p-1.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6 lg:mb-8 transition-all duration-300",
        activeTab === 'tat-ca' ? "w-full" : "max-w-fit"
      )}>
        <div className="flex bg-muted/20 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setActiveTab('chuc-nang')}
            className={clsx(
              "px-4 py-1.5 rounded-md text-[13px] font-bold transition-all duration-200",
              activeTab === 'chuc-nang'
                ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Chức năng
          </button>
          <button
            onClick={() => setActiveTab('danh-dau')}
            className={clsx(
              "px-4 py-1.5 rounded-md text-[13px] font-bold transition-all duration-200",
              activeTab === 'danh-dau'
                ? "bg-card text-primary shadow-sm ring-1 ring-black/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Đánh dấu
          </button>
          <button
            onClick={() => setActiveTab('tat-ca')}
            className={clsx(
              "px-4 py-1.5 rounded-md text-[13px] font-bold transition-all duration-200",
              activeTab === 'tat-ca'
                ? "bg-card text-primary shadow-sm ring-1 ring-primary/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tất cả
          </button>
        </div>

        {/* Search Bar (Only shown on "Tất cả" tab) */}
        {activeTab === 'tat-ca' && (
          <div className="flex-1 flex items-center bg-muted/20 rounded-lg px-3 py-1.5 animate-in slide-in-from-left-2 duration-300">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Tìm kiếm module, chức năng..."
              className="bg-transparent border-none outline-none text-[13px] text-foreground w-full ml-2 placeholder:text-muted-foreground/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {activeTab === 'chuc-nang' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-5">
          {dashboardModules.map((module, idx) => (
            <ActionCard
              key={idx}
              {...module}
              layoutId={`mod-${module.title}`}
            />
          ))}
        </div>
      )}

      {activeTab === 'danh-dau' && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border border-dashed">
          Chưa có module nào được đánh dấu.
        </div>
      )}

      {activeTab === 'tat-ca' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="space-y-8">
            {allSections.map((section, idx) => {
              const filteredItems = section.items.filter(item =>
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description.toLowerCase().includes(searchQuery.toLowerCase())
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
      )}
    </div>
  );
};

export default Dashboard;
