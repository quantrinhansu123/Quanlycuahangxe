import {
  Home,
  FileText,
  Users,
  Box,
  Wallet,
  Wrench
} from 'lucide-react';
import React from 'react';

export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/' },
  { icon: FileText, label: 'Bán hàng', path: '/ban-hang' },
  { icon: Wallet, label: 'Thu chi', path: '/thu-chi' },
  { icon: Wrench, label: 'Dịch vụ', path: '/dich-vu' },
  { icon: Users, label: 'Nhân sự', path: '/nhan-su' },
  { icon: Box, label: 'Kho vận', path: '/kho-van' }
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [];
