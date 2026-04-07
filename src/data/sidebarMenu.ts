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
  adminOnly?: boolean;
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/' },
  { icon: FileText, label: 'Bán hàng', path: '/ban-hang' },
  { icon: Wallet, label: 'Thu chi', path: '/thu-chi', adminOnly: true },
  { icon: Wrench, label: 'Dịch vụ', path: '/dich-vu' },
  { icon: Users, label: 'Nhân sự', path: '/nhan-su', adminOnly: true },
  { icon: Wallet, label: 'Tiền lương', path: '/tien-luong', adminOnly: true },
  { icon: Box, label: 'Kho vận', path: '/kho-van' }
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [];
