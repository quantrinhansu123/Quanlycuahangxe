import { clsx } from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart2,
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
  Search,
  X,
  Sun,
  Moon,
  RefreshCw
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/theme';
import { useAuth } from '../../context/AuthContext';
import { moduleData } from '../../data/moduleData';
import { extraMenuItems, sidebarMenu } from '../../data/sidebarMenu';
import { formatTime24h } from '../../utils/datetimeFormat';
import { usePageRefreshActions } from '../../context/PageRefreshContext';
import { SubModuleSwitcher } from '../ui/SubModuleSwitcher';
import type { ModuleCardProps } from '../ui/ModuleCard';
import {
  clearAppNotifications,
  getAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
} from '../../data/notificationData';
import './Topbar.css';

interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'info' | 'warning' | 'success';
  isRead: boolean;
  route: string | null;
}

function formatRelativeNotificationTime(value: string): string {
  const date = new Date(value);
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(deltaSeconds)) return '';
  if (deltaSeconds < 60) return 'Vừa xong';
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)} phút trước`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)} giờ trước`;
  if (deltaSeconds < 604800) return `${Math.floor(deltaSeconds / 86400)} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileSearch, setMobileSearch] = useState({ locationKey: location.key, open: false });
  const showMobileSearch = mobileSearch.locationKey === location.key && mobileSearch.open;
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const { avatar, theme, setTheme } = useTheme();
  const { nhanVien, signOut, hasViewAccess } = useAuth();
  const { canRefresh, isRefreshing, refreshCurrentPage } = usePageRefreshActions();
  const canOpenPermissionSettings = hasViewAccess('cai-dat-phan-quyen');

  const notificationUserId = nhanVien?.id;
  const loadNotifications = useCallback(async (): Promise<Notification[]> => {
    if (!notificationUserId || notificationUserId === 'demo-nv-uuid') return [];
    const rows = await getAppNotifications(notificationUserId);
    return rows.map(row => ({
      id: row.id, title: row.tieu_de, description: row.noi_dung,
      time: formatRelativeNotificationTime(row.created_at), type: row.loai,
      isRead: Boolean(row.da_doc_luc), route: row.duong_dan,
    }));
  }, [notificationUserId]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadNotifications().then(rows => { if (!cancelled) setNotifications(rows); })
        .catch(error => console.error('Không thể tải thông báo:', error));
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [loadNotifications]);

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
        const found = section.items.find((item) => item.path === path);
        if (found) return found.title;
      }
    }

    // Check sidebar and extra menu items
    const menuItems = [...sidebarMenu, ...extraMenuItems, { path: '/ho-so', label: 'Hồ sơ cá nhân' }];
    const found = menuItems.find(item => item.path === path);
    if (found) return found.label;

    // Fallback labels for segments
    const segmentLabels: Record<string, string> = {
      'bao-cao': 'Báo cáo',
      'san-pham': 'Tổng hợp',
      'bieu-do': 'Biểu đồ',
      'theo-ngay': 'Theo ngày',
      'co-so': 'Theo cơ sở',
      'nhan-su': 'Nhân sự',
      'ban-hang': 'Bán hàng',
      'kinh-doanh': 'Kinh doanh',
      'marketing': 'Marketing',
      'tai-chinh': 'Tài chính',
      'mua-hang': 'Mua hàng',
      'kho-van': 'Kho vận',
      'dieu-hanh': 'Điều hành',
      'he-thong': 'Hệ thống',
      'ung-vien': 'Nhân sự',
      'so-quy': 'Sổ quỹ',
      'thu-chi': 'Thu chi',
      'cai-dat': 'Cài đặt',
      'phan-quyen': 'Phân quyền'
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

  const currentTitle = breadcrumbs[breadcrumbs.length - 1]?.label || 'Trang chủ';
  const isDashboard = location.pathname === '/';
  const handleBack = () => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }

    const moduleParent = location.pathname.match(/^\/(ban-hang|nhan-su|tien-luong|kho-van)\//)?.[1];
    navigate(moduleParent ? `/${moduleParent}` : '/', { replace: true });
  };




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
    return formatTime24h(date, true);
  };

  const formatDate = (date: Date) => {
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getDay()];
    return `${dayName}, ${date.toLocaleDateString('vi-VN')}`;
  };

  const markAllAsRead = async () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    if (nhanVien?.id) {
      try {
        await markAllAppNotificationsRead(nhanVien.id);
      } catch (error) {
        console.error('Không thể đánh dấu đã đọc:', error);
        void loadNotifications().then(setNotifications).catch(error => console.error('Không thể tải thông báo:', error));
      }
    }
  };

  const clearAll = async () => {
    setNotifications([]);
    if (nhanVien?.id) {
      try {
        await clearAppNotifications(nhanVien.id);
      } catch (error) {
        console.error('Không thể xóa thông báo:', error);
        void loadNotifications().then(setNotifications).catch(error => console.error('Không thể tải thông báo:', error));
      }
    }
  };

  const openNotification = async (notification: Notification) => {
    const { id } = notification;
    setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await markAppNotificationRead(id);
    } catch (error) {
      console.error('Không thể cập nhật thông báo:', error);
    }
    setShowNotifications(false);
    if (notification.route) navigate(notification.route);
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
    <header className="sticky top-0 z-30 w-full min-w-0 shrink-0 border-b border-border bg-card">
      <div className="topbar-main-row flex h-14 items-center gap-1 px-2.5 sm:h-[55px] sm:gap-2 sm:px-4 lg:px-6">
        <div className="topbar-primary flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
            aria-expanded={sidebarOpen}
            className="topbar-menu-button topbar-compact-control flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeft size={19} />}
          </button>

          {!isDashboard && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Quay lại"
              title="Quay lại"
              className="topbar-back-button topbar-compact-control flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
          )}

          <div className="topbar-title min-w-0 flex-1">
            <div className="hidden min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground lg:flex">
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 transition-colors hover:text-primary"
                onClick={() => navigate('/')}
              >
                <Home size={14} aria-hidden="true" />
                <span>Trang chủ</span>
              </button>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  <ChevronRight size={12} className="shrink-0 opacity-40" aria-hidden="true" />
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="truncate font-semibold text-foreground">{crumb.label}</span>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 transition-colors hover:text-primary"
                      onClick={() => navigate(crumb.path)}
                    >
                      {crumb.label}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
            <span className="topbar-title-text block truncate text-[15px] font-semibold tracking-tight text-foreground lg:hidden">
              {currentTitle}
            </span>
          </div>

          {canRefresh && (
            <button
              type="button"
              onClick={() => {
                void refreshCurrentPage().catch((error) => console.error('Không thể làm mới dữ liệu trang:', error));
              }}
              disabled={isRefreshing}
              aria-label={isRefreshing ? 'Đang làm mới dữ liệu' : 'Làm mới dữ liệu'}
              aria-busy={isRefreshing}
              title={isRefreshing ? 'Đang làm mới' : 'Làm mới dữ liệu'}
              className="topbar-refresh-button topbar-compact-control flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={18} className={clsx(isRefreshing && 'animate-spin')} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="topbar-desktop-search hidden w-full max-w-xs flex-1 justify-center px-2 sm:flex lg:mx-6">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              <Search size={15} aria-hidden="true" />
            </div>
            <input
              type="search"
              aria-label="Tìm chức năng"
              className="w-full rounded-full border border-transparent bg-muted/70 py-2 pl-9 pr-3 text-[13px] transition-colors placeholder:text-muted-foreground/80 hover:border-border focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="Tìm chức năng..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="topbar-actions flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          {isDashboard && (
            <button
              type="button"
              onClick={() => setMobileSearch({ locationKey: location.key, open: !showMobileSearch })}
              aria-label={showMobileSearch ? 'Đóng tìm kiếm' : 'Tìm chức năng'}
              aria-expanded={showMobileSearch}
              className="topbar-search-button topbar-compact-control flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
            >
              <Search size={20} aria-hidden="true" />
            </button>
          )}

        {/* Right side: reports, clock, notifications and profile */}
        {/* Báo cáo — ẩn với kỹ thuật viên / không có quyền */}
        {hasViewAccess('bao-cao') && (
        <button
          type="button"
          onClick={() => navigate('/bao-cao/san-pham')}
          className={clsx(
            'hidden shrink-0 items-center gap-1 rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-2 text-primary transition-colors lg:flex',
            'hover:bg-primary/20 active:scale-[0.98]',
            location.pathname.startsWith('/bao-cao') && 'ring-2 ring-primary/40'
          )}
          title="Báo cáo doanh thu"
          aria-label="Báo cáo doanh thu"
        >
          <BarChart2 size={20} className="shrink-0" strokeWidth={2.25} />
          <span className="hidden md:inline text-[11px] font-black leading-none">Báo cáo</span>
        </button>
        )}

        {/* Clock & Date (Hidden on mobile) */}
        <div className="hidden xl:flex items-center bg-card border border-border shadow-sm px-3 sm:px-4 py-1.5 rounded-full gap-2 sm:gap-3 text-[13px]">
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
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="topbar-theme-button topbar-compact-control flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={theme === 'dark' ? 'Chuyển sang ban ngày' : 'Chuyển sang ban đêm'}
          aria-label="Chuyển chế độ sáng tối"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <div className="topbar-notifications relative" ref={notificationDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
            aria-expanded={showNotifications}
            className={clsx(
              "topbar-compact-control relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            <div className="absolute right-0 z-50 mt-2 w-[min(350px,calc(100vw-1rem))] bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
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
                        onClick={() => void openNotification(notification)}
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
        <div className="topbar-profile relative" ref={userDropdownRef}>
          <button
            type="button"
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            aria-label={`Menu tài khoản${nhanVien?.ho_ten ? ` của ${nhanVien.ho_ten}` : ''}`}
            aria-expanded={showUserDropdown}
            className={clsx(
              "topbar-compact-control topbar-profile-button flex h-11 items-center justify-center gap-2 rounded-xl px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:rounded-none sm:border-l sm:border-border sm:pl-3 sm:pr-0",
              showUserDropdown && "opacity-80"
            )}
          >
            <div className="relative">
              <div className="topbar-avatar w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shadow-sm shadow-primary/5">
                <img
                  src={userAvatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card shadow-sm shadow-emerald-500/50"></div>
            </div>
            <div className="hidden xl:flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-bold leading-tight text-foreground group-hover:text-primary transition-colors">{nhanVien?.ho_ten || 'Tài khoản'}</span>
                <ChevronDown size={12} className={clsx("text-muted-foreground transition-transform duration-200", showUserDropdown && "rotate-180")} />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight font-medium">{nhanVien?.vi_tri || 'Nhân viên'}</span>
            </div>
          </button>

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
      </div>

      {showMobileSearch && isDashboard && (
        <div className="border-t border-border px-3 py-2 sm:hidden">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                aria-label="Tìm chức năng"
                className="h-11 w-full rounded-xl border border-border bg-muted/70 pl-10 pr-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:ring-2 focus:ring-ring/20"
                placeholder="Tìm chức năng..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearch({ locationKey: location.key, open: false })}
              aria-label="Đóng tìm kiếm"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {subModules.length > 1 && (
        <div className="overflow-x-auto border-t border-border/70 px-3 py-2 lg:hidden">
          <SubModuleSwitcher items={subModules} variant="tabs" />
        </div>
      )}
    </header>
  );
});

export default Topbar;
