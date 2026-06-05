import { BarChart2, BookOpen, Box, FileText, ShieldCheck, Users, Wallet, Wrench, BadgeDollarSign } from 'lucide-react';
import React from 'react';
import { useOutletContext } from 'react-router-dom';

import type { ActionCardProps } from '../components/ui/ActionCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useAuth } from '../context/AuthContext';
import { moduleData } from '../data/moduleData';
import { resolveViewKeyByPath } from '../data/viewPermissions';
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
    icon: BookOpen,
    title: 'Sổ quỹ',
    description: 'Sổ kế toán chi tiết quỹ tiền mặt — thu, chi, số tồn.',
    href: '/so-quy',
    colorScheme: 'purple'
  },
  {
    icon: Wrench,
    title: 'Dịch vụ',
    description: 'Quản lý danh mục dịch vụ và giá cả.',
    href: '/dich-vu',
    colorScheme: 'purple'
  },
  {
    icon: BarChart2,
    title: 'Báo cáo',
    description: 'Doanh thu, lợi nhuận, theo ngày/cơ sở và biểu đồ.',
    href: '/bao-cao/san-pham',
    colorScheme: 'teal'
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
  },
  {
    icon: ShieldCheck,
    title: 'Cài đặt phân quyền',
    description: 'Quyền theo vị trí: trang chủ, bán hàng, báo cáo…',
    href: '/cai-dat/phan-quyen',
    colorScheme: 'pink'
  }
];

const Dashboard: React.FC = () => {
  const { globalSearch } = useOutletContext<{ globalSearch: string }>() || { globalSearch: '' };
  const { hasViewAccess, isAdmin } = useAuth();

  const resolveViewKey = React.useCallback(
    (path?: string) => resolveViewKeyByPath(path),
    []
  );

  const allSections = React.useMemo(() =>
    Object.values(moduleData).flat().map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const viewKey = resolveViewKey(item.path);
        return !viewKey || hasViewAccess(viewKey);
      }),
    })).filter((section) => section.items.length > 0),
  [hasViewAccess, resolveViewKey]);

  const visibleDashboardModules = React.useMemo(
    () =>
      dashboardModules.filter((module) => {
        if (module.href.startsWith('/cai-dat') && !isAdmin) return false;

        // "Bán hàng" parent card is visible if user has parent or any child permission.
        if (module.href === '/ban-hang') {
          return (
            hasViewAccess('ban-hang') ||
            hasViewAccess('khach-hang') ||
            hasViewAccess('don-hang')
          );
        }

        // "Nhân sự" parent card is visible if user has parent or any child permission.
        if (module.href === '/nhan-su') {
          return (
            hasViewAccess('nhan-su') ||
            hasViewAccess('cham-cong') ||
            hasViewAccess('nhan-su-ung-vien')
          );
        }

        const viewKey = resolveViewKey(module.href);
        return !viewKey || hasViewAccess(viewKey);
      }),
    [hasViewAccess, resolveViewKey, isAdmin]
  );

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
      ) : visibleDashboardModules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center max-w-lg">
          <p className="text-[15px] font-semibold text-foreground">Chưa có module hiển thị</p>
          <p className="text-muted-foreground text-sm mt-2">
            Tài khoản chưa được gán quyền xem module. Liên hệ quản trị viên tại{' '}
            <span className="font-medium text-primary">Cài đặt phân quyền</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8 gap-5">
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
