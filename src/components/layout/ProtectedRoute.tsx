import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
  const { session, isAdmin, isLoading } = useAuth();
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
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
