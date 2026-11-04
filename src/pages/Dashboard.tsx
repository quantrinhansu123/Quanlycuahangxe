import { BarChart2, BookOpen, Box, FileText, ShieldCheck, Users, Wallet, Wrench, BadgeDollarSign, Send, Truck } from 'lucide-react';
import React from 'react';
import { useOutletContext } from 'react-router-dom';

import type { ActionCardProps } from '../components/ui/ActionCard';
import { ActionCard } from '../components/ui/ActionCard';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useAuth } from '../context/AuthContext';
import { HIDE_KHO_VAN, HIDE_SO_QUY } from '../data/featureFlags';
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
  ...(!HIDE_KHO_VAN
    ? [{
        icon: Truck,
        title: 'Nhập hàng',
        description: 'Lập phiếu nhập hàng và tự động cập nhật nhập — xuất — tồn.',
        href: '/kho-van/nhap-hang',
        colorScheme: 'emerald' as const,
      }]
    : []),
  {
    icon: Wallet,
    title: 'Thu chi',
    description: 'Quản lý dòng tiền và các chứng từ tài chính.',
    href: '/thu-chi',
    colorScheme: 'blue'
  },
  ...(!HIDE_SO_QUY
    ? [{
        icon: BookOpen,
        title: 'Sổ quỹ',
        description: 'Sổ kế toán chi tiết quỹ tiền mặt — thu, chi, số tồn.',
        href: '/so-quy',
        colorScheme: 'purple' as const,
      }]
    : []),
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
  ...(!HIDE_KHO_VAN
    ? [{
        icon: Box,
        title: 'Kho vận',
        description: 'Tồn kho, xuất nhập kho, vận chuyển.',
        href: '/kho-van',
        colorScheme: 'cyan' as const,
      }]
    : []),
  {
    icon: Send,
    title: 'Gửi ZNS hàng loạt',
    description: 'Gửi thông báo ZNS tới nhiều khách hàng qua Zalo Official Account.',
    href: '/zns/gui-hang-loat',
    colorScheme: 'blue'
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
  const { hasViewAccess, isAdmin, nhanVien } = useAuth();

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

  const normalizedSearch = removeVietnameseTones(globalSearch.trim());
  const filteredSearchSections = React.useMemo(() => {
    if (!normalizedSearch) return [];

    return allSections.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        removeVietnameseTones(item.title).includes(normalizedSearch) ||
        removeVietnameseTones(item.description).includes(normalizedSearch)
      ),
    })).filter((section) => section.items.length > 0);
  }, [allSections, normalizedSearch]);

  const visibleDashboardModules = React.useMemo(
    () =>
      dashboardModules.filter((module) => {
        if (module.href.startsWith('/cai-dat') && !isAdmin) return false;
        if (module.href === '/zns/gui-hang-loat' && !isAdmin) return false;

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

  const greeting = new Date().getHours() < 11
    ? 'Chào buổi sáng'
    : new Date().getHours() < 18
      ? 'Chào buổi chiều'
      : 'Chào buổi tối';
  const nameParts = nhanVien?.ho_ten.trim().split(/\s+/).filter(Boolean) ?? [];
  const firstName = nameParts[nameParts.length - 1];
  const searchResultCount = filteredSearchSections.reduce((total, section) => total + section.items.length, 0);

  return (
    <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-5 sm:mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          Trung tâm sửa chữa xe
        </p>
        <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-[15px]">
          Chọn chức năng để bắt đầu công việc.
        </p>
      </div>

      {globalSearch.trim() ? (
        <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Kết quả cho “{globalSearch.trim()}”
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {searchResultCount} chức năng phù hợp
            </p>
          </div>

          {filteredSearchSections.length > 0 ? (
            <div className="space-y-6 sm:space-y-7">
              {filteredSearchSections.map((section) => (
                <section key={section.section}>
                  <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.section}
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    {section.items.map((item) => (
                      <ModuleCard key={item.path || item.title} {...item} layoutId={`func-${item.title}`} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center">
              <p className="text-sm font-semibold text-foreground">Không tìm thấy chức năng phù hợp</p>
              <p className="mt-1 text-sm text-muted-foreground">Thử một từ khóa khác hoặc mở “Thêm” để xem toàn bộ menu.</p>
            </div>
          )}
        </div>
      ) : visibleDashboardModules.length === 0 ? (
        <div className="max-w-lg rounded-2xl border border-dashed border-border bg-card p-6 text-center sm:p-8">
          <p className="text-[15px] font-semibold text-foreground">Chưa có module hiển thị</p>
          <p className="text-muted-foreground text-sm mt-2">
            Tài khoản chưa được gán quyền xem module. Liên hệ quản trị viên tại{' '}
            <span className="font-medium text-primary">Cài đặt phân quyền</span>.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">Chức năng chính</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Truy cập nhanh theo quyền của bạn</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {visibleDashboardModules.length} mục
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {visibleDashboardModules.map((module, idx) => (
            <ActionCard
              key={idx}
              {...module}
              layoutId={`mod-${module.title}`}
            />
          ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
