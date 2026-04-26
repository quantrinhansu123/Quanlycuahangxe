import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { SidebarItem, SidebarSubItem } from '../../data/sidebarMenu';
import { extraMenuItems, sidebarMenu } from '../../data/sidebarMenu';
import { useAuth } from '../../context/AuthContext';

function isPathUnderGroup(pathname: string, childPaths: string[]) {
  return childPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}


interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ isOpen, setIsOpen }) => {
  const { isAdmin, hasViewAccess } = useAuth();
  
  const filteredMenu = React.useMemo(() => 
    sidebarMenu.filter(item => (!item.adminOnly || isAdmin) && (!item.viewKey || hasViewAccess(item.viewKey))),
  [isAdmin, hasViewAccess]);

  const filteredExtraItems = React.useMemo(() => 
    extraMenuItems.filter(item => (!item.adminOnly || isAdmin) && (!item.viewKey || hasViewAccess(item.viewKey))),
  [isAdmin, hasViewAccess]);
  return (
    <>
      {/* Overlay - visible whenever sidebar is open ON MOBILE */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 bg-card border-r border-border transition-all duration-300 flex flex-col h-full",
          // Mobile: hidden when closed, w-64 when open
          // Desktop: w-[72px] when closed, w-64 when open
          isOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-[72px]"
        )}
      >
        {/* Header / Logo */}
        <div className={clsx(
          "h-[55px] flex items-center border-b border-border overflow-hidden shrink-0 transition-all duration-300",
          isOpen ? "px-4" : "justify-center"
        )}>
          <div className={clsx(
            "bg-transparent flex items-center justify-center shrink-0 transition-all duration-300",
            isOpen ? "w-10 h-10" : "w-12 h-12"
          )}>
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className={clsx("flex flex-col ml-3 whitespace-nowrap transition-opacity duration-300", !isOpen && "opacity-0 hidden")}>
            <span className="font-extrabold text-[15px] leading-tight bg-linear-to-r from-[#D4AF37] via-[#FFD700] to-[#B8860B] bg-clip-text text-transparent">
              Hệ thống VH
            </span>
            <span className="text-[11px] text-muted-foreground font-medium leading-tight">Cửa hàng sửa xe</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar flex flex-col items-center lg:items-stretch">
          {filteredMenu.map((item) => (
            item.children && item.children.length > 0 ? (
              <NavGroup
                key={item.path}
                item={item}
                isOpen={isOpen}
                onNavigate={() => {
                  if (window.innerWidth < 1024) setIsOpen(false);
                }}
              />
            ) : (
              <NavItem
                key={item.path}
                item={item}
                isOpen={isOpen}
                onClick={() => {
                  if (window.innerWidth < 1024) setIsOpen(false);
                }}
              />
            )
          ))}

          <div className="my-4 border-t border-border w-full"></div>

          {filteredExtraItems.map((item) => (
            <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
              if (window.innerWidth < 1024) setIsOpen(false);
            }} />
          ))}
        </nav>
      </aside>
    </>
  );
});

const NavGroup = React.memo(
  ({ item, isOpen, onNavigate }: { item: SidebarItem; isOpen: boolean; onNavigate: () => void }) => {
    const { hasViewAccess } = useAuth();
    const location = useLocation();
    const subItems = item.children;
    const childPaths = useMemo(
      () => (subItems ?? []).map((c) => c.path),
      [subItems]
    );
    const visibleChildren = (subItems ?? []).filter((c) => !c.viewKey || hasViewAccess(c.viewKey));
    const childPathKey = useMemo(() => childPaths.join('|'), [childPaths]);

    const isChildActive = isPathUnderGroup(location.pathname, childPaths);
    const [expanded, setExpanded] = useState(isChildActive);
    const prevPath = useRef(location.pathname);

    useEffect(() => {
      const inGroup = (p: string) => isPathUnderGroup(p, childPaths);
      if (inGroup(location.pathname) && !inGroup(prevPath.current)) setExpanded(true);
      prevPath.current = location.pathname;
    }, [location.pathname, childPathKey, childPaths]);

    const [flyoutOpen, setFlyoutOpen] = useState(false);
    const flyoutRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!flyoutOpen) return;
      const close = (e: MouseEvent) => {
        if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) setFlyoutOpen(false);
      };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }, [flyoutOpen]);

    const Icon = item.icon;

    if (!isOpen) {
      return (
        <div className="relative w-full flex justify-center" ref={flyoutRef}>
          <button
            type="button"
            onClick={() => setFlyoutOpen((o) => !o)}
            className={clsx(
              'flex items-center rounded-xl text-sm font-medium transition-all duration-300 w-11 h-11 justify-center',
              isChildActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            title={item.label}
            aria-expanded={flyoutOpen}
            aria-haspopup="true"
          >
            <Icon size={22} strokeWidth={1.75} />
          </button>
          {flyoutOpen && (
            <div
              className="absolute left-full top-0 ml-1.5 z-50 w-52 py-1.5 rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-150"
              role="menu"
            >
              <div className="px-2.5 pb-1.5 mb-1 border-b border-border/60 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {item.label}
              </div>
              {visibleChildren.map((child: SidebarSubItem) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  role="menuitem"
                  onClick={() => {
                    setFlyoutOpen(false);
                    onNavigate();
                  }}
                  className={({ isActive }) =>
                    clsx(
                      'block px-3 py-2 text-[13px] font-medium rounded-lg mx-1 transition-colors',
                      isActive
                        ? 'bg-primary text-white'
                        : 'text-foreground hover:bg-accent'
                    )
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={clsx(
            'flex items-center rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap px-3 py-2.5 w-full justify-between gap-2',
            isChildActive
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
          aria-expanded={expanded}
        >
          <span className="flex items-center min-w-0">
            <span className="flex items-center justify-center shrink-0 w-5 mr-3">
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <span className="truncate font-medium">{item.label}</span>
          </span>
          <ChevronDown size={16} className={clsx('shrink-0 transition-transform', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <div className="mt-1 ml-2 pl-3 border-l border-border/80 space-y-0.5">
            {visibleChildren.map((child: SidebarSubItem) => (
              <NavLink
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center rounded-lg text-[13px] font-medium py-2 px-2 transition-colors',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }
);

const NavItem = React.memo(({ item, onClick, isOpen }: { item: SidebarItem; onClick?: () => void; isOpen: boolean }) => {
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'flex items-center rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap',
          isOpen ? 'px-3 py-2.5 w-full justify-start' : 'w-11 h-11 justify-center',
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )
      }
      title={!isOpen ? item.label : undefined}
    >
      <div className={clsx("flex items-center justify-center shrink-0", isOpen && "w-5 mr-3")}>
        <item.icon size={22} className={clsx(!isOpen && "mt-0.5")} strokeWidth={1.75} />
      </div>
      <span className={clsx("transition-all duration-300", !isOpen && "opacity-0 w-0 hidden")}>{item.label}</span>
    </NavLink>
  );
});

export default Sidebar;
