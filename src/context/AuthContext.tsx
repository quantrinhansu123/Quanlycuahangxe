import React, { createContext, useContext, useState } from 'react';

// Tạm thời định nghĩa interface User
export interface User {
  id: string; // Trong tương lai sẽ lấy id thực từ database
  ho_ten: string;
  vi_tri: string;
  email?: string;
}

interface AuthContextType {
  currentUser: User | null;
  // TODO: login, logout functions...
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null
});

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // Mock tài khoản đang đăng nhập để test trước
  const [currentUser] = useState<User | null>({
    id: 'mock-user-id',
    ho_ten: 'Admin Hệ Thống',
    vi_tri: 'Quản trị viên'
  });

  return (
    <AuthContext.Provider value={{ currentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
