import { clsx } from 'clsx';
import {
  AlertTriangle,
  Bell,
  Calendar, CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Home,
  Info,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Trash2,
  User,
  Search
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { moduleData } from '../../data/moduleData';
import { extraMenuItems, sidebarMenu } from '../../data/sidebarMenu';
import { SubModuleSwitcher } from '../ui/SubModuleSwitcher';
import type { ModuleCardProps } from '../ui/ModuleCard';

interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'info' | 'warning' | 'success';
  isRead: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Chào mừng trở lại',
    description: 'Đây là thông báo mẫu. Bạn có thể thêm, đánh dấu đã đọc hoặc xóa từng thông báo.',
    time: '2 phút trước',
    type: 'info',
    isRead: false,
  },
  {
    id: '2',
    title: 'Cập nhật hệ thống',
    description: 'Phiên bản mới đã sẵn sàng. Vui lòng làm mới trang khi thuận tiện.',
    time: '1 giờ trước',
    type: 'success',
    isRead: false,
  },
  {
    id: '3',
    title: 'Đơn nghỉ phép đã duyệt',
    description: 'Đơn xin nghỉ phép từ 12/02 đến 14/02 đã được phê duyệt.',
    time: '3 giờ trước',
    type: 'success',
    isRead: false,
  },
  {
    id: '4',
    title: 'Bảo trì định kỳ',
    description: 'Hệ thống sẽ bảo trì từ 23:00 ngày 15/02 đến 02:00 ngày 16/02. Vui lòng lưu dữ liệu trước...',
    time: '5 giờ trước',
    type: 'warning',
    isRead: false,
  },
  {
    id: '5',
    title: 'Nhắc nhở nộp báo cáo',
    description: 'Báo cáo tháng 1 chưa được nộp. Hạn chót: 15/02.',
    time: '1 ngày trước',
    type: 'warning',
    isRead: true,
  },
  {
    id: '6',
    title: 'Lương tháng 1 đã sẵn sàng',
    description: 'Phiếu lương tháng 1/2026 đã được cập nhật trên hệ thống.',
    time: '2 ngày trước',
    type: 'success',
    isRead: true,
  },
  {
    id: '7',
    title: 'Nội quy công ty mới',
    description: 'Vui lòng đọc và xác nhận nội quy làm việc mới áp dụng từ tháng sau.',
    time: '3 ngày trước',
    type: 'info',
    isRead: true,
  },
  {
    id: '8',
    title: 'Thông báo cũ',
    description: 'Đây là một thông báo cũ để kiểm tra tính năng xem tất cả.',
    time: '1 tuần trước',
    type: 'info',
    isRead: true,
  }
];

interface TopbarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  globalSearch: string;
  setGlobalSearch: (val: string) => void;
  subModules: ModuleCardProps[];
}

export const Topbar: React.FC<TopbarProps> = React.memo(({ 
  sidebarOpen, 
  setSidebarOpen, 
  globalSearch, 
  setGlobalSearch,
  subModules
}) => {
  const [time, setTime] = useState(new Date());
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { avatar } = useTheme();
  const { nhanVien, signOut, hasViewAccess } = useAuth();
  const canOpenPermissionSettings = hasViewAccess('cai-dat-phan-quyen');

  const defaultAvatar = "https://ui-avatars.com/api/?name=User&background=random&color=random";
  const userAvatar = avatar || defaultAvatar;


  const unreadCount = notifications.filter(n => !n.isRead).length;
  const displayNotifications = isExpanded ? notifications : notifications.slice(0, 5);
  const hasMore = notifications.length > 5;

  // Enhanced breadcrumb logic
  const pathSegments = location.pathname.split('/').filter(Boolean);

  const getLabel = (path: string) => {
    // Check specific module items in moduleData first
    for (const mainPath in moduleData) {
      for (const section of moduleData[mainPath]) {
        const found = section.items.find((item: any) => item.path === path);
        if (found) return found.title;
      }
    }

    // Check sidebar and extra menu items
    const menuItems = [...sidebarMenu, ...extraMenuItems, { path: '/ho-so', label: 'Hồ sơ cá nhân' }];
    const found = menuItems.find(item => item.path === path);
    if (found) return found.label;

    // Fallback labels for segments
    const segmentLabels: Record<string, string> = {
      'nhan-su': 'Nhân sự',
      'ban-hang': 'Bán hàng',
      'kinh-doanh': 'Kinh doanh',
      'marketing': 'Marketing',
      'tai-chinh': 'Tài chính',
      'mua-hang': 'Mua hàng',
      'kho-van': 'Kho vận',
      'dieu-hanh': 'Điều hành',
      'he-thong': 'Hệ thống',
      'ung-vien': 'Ứng viên'
    };

    const segment = path.split('/').pop() || '';
    return segmentLabels[segment] || segment;
  };

  const breadcrumbs = pathSegments.map((_, index) => {
    const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
    return {
      path,
      label: getLabel(path)
    };
  });




  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setIsExpanded(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('vi-VN', { hour12: false });
  };

  const formatDate = (date: Date) => {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getDay()];
    return `${dayName}, ${date.toLocaleDateString('vi-VN')}`;
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'info': return <Info size={18} className="text-blue-500" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
      case 'success': return <CheckCircle2 size={18} className="text-emerald-500" />;
    }
  };

  const getTypeStyles = (type: Notification['type'], isRead: boolean) => {
    if (isRead) return '';
    switch (type) {
      case 'info': return 'border-l-4 border-l-blue-500 bg-blue-500/10';
      case 'warning': return 'border-l-4 border-l-amber-500 bg-amber-500/10';
      case 'success': return 'border-l-4 border-l-emerald-500 bg-emerald-500/10';
    }
  };

  return (
    <header className="h-[55px] bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 z-30 sticky top-0">
      {/* Left side: Hamburger, Title & Tabs */}
      <div className="flex items-center gap-1 flex-1 min-w-0 pr-2">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 text-muted-foreground hover:bg-muted border border-border/50 rounded-lg bg-card shadow-sm transition-colors shrink-0"
        >
          {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
        </button>

        {/* Unified Title & Switcher Container */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-1">
          {/* Breadcrumbs for PC (Home > Module > Page) */}
          <div className={clsx(
            "items-center gap-1.5 shrink-0 text-[11px] sm:text-[13px] font-medium text-muted-foreground",
            subModules.length > 0 ? "hidden lg:flex" : "flex"
          )}>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/')}>
                <Home size={13} />
                <span className="hidden sm:inline">Trang chủ</span>
              </span>
              
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  <ChevronRight size={10} className="opacity-40" />
                  <span 
                    className={clsx(
                      "transition-colors",
                      idx === breadcrumbs.length - 1 ? "font-bold text-foreground" : "hover:text-primary cursor-pointer"
                    )}
                    onClick={() => idx < breadcrumbs.length - 1 && navigate(crumb.path)}
                  >
                    {crumb.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Inline Tabs (Mobile only) */}
          {subModules.length > 0 && (
            <div className="flex lg:hidden items-center h-7">
              <SubModuleSwitcher items={subModules} variant="tabs" />
            </div>
          )}
        </div>
      </div>

      {/* Global Search Bar (From user's markup) */}
      <div className="flex-1 max-w-xs px-2 mx-auto justify-center hidden sm:flex lg:ml-8 lg:mr-8 transition-all duration-300 relative z-10 w-full animate-in slide-in-from-top-2">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-muted-foreground">
            <Search size={14} />
          </div>
          <input
            type="text"
            className="w-full text-[13px] bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 rounded-full pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-background transition-all placeholder:text-muted-foreground/60"
            placeholder="Tìm theo tên/mô tả..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Right side: Clock, Notifications, User */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Clock & Date (Hidden on mobile) */}
        <div className="hidden md:flex items-center bg-card border border-border shadow-sm px-4 py-1.5 rounded-full gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <span className="font-bold text-foreground tabular-nums">{formatTime(time)}</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={16} className="text-primary" />
            <span className="font-medium whitespace-nowrap">{formatDate(time)}</span>
          </div>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationDropdownRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            className={clsx(
              "relative p-2 text-muted-foreground hover:bg-accent rounded-full transition-colors",
              showNotifications && "bg-accent text-primary"
            )}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-card">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-[350px] bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
              {/* Header */}
              <div className="p-3 border-b border-border flex items-center justify-between bg-card sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-primary" />
                  <h3 className="font-bold text-foreground text-[13px]">Thông báo</h3>
                  {unreadCount > 0 && (
                    <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                    title="Đánh dấu tất cả là đã đọc"
                  >
                    <CheckCheck size={16} />
                  </button>
                  <button
                    onClick={clearAll}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Xóa tất cả"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className={clsx(
                "overflow-y-auto custom-scrollbar transition-all duration-300",
                isExpanded ? "max-h-[400px]" : "max-h-[350px]"
              )}>
                {notifications.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {displayNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={clsx(
                          "p-3 transition-colors cursor-pointer hover:bg-muted/30 relative",
                          getTypeStyles(notification.type, notification.isRead)
                        )}
                      >
                        <div className="flex gap-2.5">
                          <div className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            notification.type === 'info' && "bg-blue-50",
                            notification.type === 'warning' && "bg-amber-50",
                            notification.type === 'success' && "bg-emerald-50"
                          )}>
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-0.5">
                              <h4 className={clsx(
                                "font-bold text-[13px] leading-tight transition-colors truncate",
                                notification.isRead ? "text-foreground/70" : "text-primary"
                              )}>
                                {notification.title}
                              </h4>
                              {!notification.isRead && (
                                <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0 mt-1" />
                              )}
                            </div>
                            <p className="text-[12px] text-muted-foreground leading-snug mb-0.5 line-clamp-1">
                              {notification.description}
                            </p>
                            <span className="text-[10px] text-muted-foreground/50">{notification.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-muted-foreground">
                    <Bell size={32} className="mb-2 opacity-20" />
                    <p className="text-[12px]">Không có thông báo nào</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              {hasMore && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full p-2.5 text-center text-[12px] font-bold text-primary hover:bg-primary/5 border-t border-border transition-colors flex items-center justify-center gap-1"
                >
                  {isExpanded ? 'Thu gọn' : 'Xem tất cả thông báo'}
                  <ChevronRight size={14} className={clsx("transition-transform", isExpanded && "rotate-90")} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={userDropdownRef}>
          <div
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            className={clsx(
              "flex items-center gap-3 pl-2 sm:pl-4 sm:border-l border-border cursor-pointer group transition-all duration-200",
              showUserDropdown && "opacity-80"
            )}
          >
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shadow-sm shadow-primary/5">
                <img
                  src={userAvatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card shadow-sm shadow-emerald-500/50"></div>
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-bold leading-tight text-foreground group-hover:text-primary transition-colors">{nhanVien?.ho_ten || 'Tài khoản'}</span>
                <ChevronDown size={12} className={clsx("text-muted-foreground transition-transform duration-200", showUserDropdown && "rotate-180")} />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight font-medium">{nhanVien?.vi_tri || 'Nhân viên'}</span>
            </div>
          </div>

          {/* User Dropdown Menu */}
          {showUserDropdown && (
            <div className="absolute right-0 mt-3 w-56 bg-card rounded-xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
              <div className="p-1.5 space-y-0.5">
                <button
                  onClick={() => {
                    navigate('/ho-so');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary/70">
                    <User size={18} />
                  </div>
                  <span className="text-[13px] font-semibold">Hồ sơ cá nhân</span>
                </button>

                {canOpenPermissionSettings && (
                  <button
                    onClick={() => {
                      navigate('/cai-dat/phan-quyen');
                      setShowUserDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary/70">
                      <Settings size={18} />
                    </div>
                    <span className="text-[13px] font-semibold">Cài đặt phân quyền</span>
                  </button>
                )}

                <div className="my-1 border-t border-border/50" />

                <button
                  onClick={async () => {
                    setShowUserDropdown(false);
                    await signOut();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/5 flex items-center justify-center">
                    <LogOut size={18} />
                  </div>
                  <span className="text-[13px] font-bold">Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
});

export default Topbar;
