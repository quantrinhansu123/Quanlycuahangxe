import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getDefaultHomePath } from '../../data/viewPermissions';
import type { ViewPermissionKey } from '../../data/viewPermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  viewKey?: ViewPermissionKey;
  anyViewKey?: ViewPermissionKey[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  adminOnly = false,
  viewKey,
  anyViewKey,
}) => {
  const { session, isAdmin, isLoading, hasViewAccess, nhanVien } = useAuth();
  const location = useLocation();

  // Chờ auth state khởi tạo xong (tránh flash redirect)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Chưa đăng nhập → về trang login, lưu lại URL để redirect sau khi login
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Trang admin mà không phải admin → về trang chủ
  if (adminOnly && !isAdmin) {
    const fallback = getDefaultHomePath(nhanVien?.vi_tri, isAdmin, nhanVien?.co_so);
    return <Navigate to={fallback} replace />;
  }

  const deniedByViewKey = viewKey && !hasViewAccess(viewKey);
  const deniedByAnyViewKey =
    anyViewKey &&
    anyViewKey.length > 0 &&
    !anyViewKey.some((key) => hasViewAccess(key));

  if (deniedByViewKey || deniedByAnyViewKey) {
    const fallback = getDefaultHomePath(nhanVien?.vi_tri, isAdmin, nhanVien?.co_so);
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
