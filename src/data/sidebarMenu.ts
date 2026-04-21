import {
  Home,
  FileText,
  Users,
  Box,
  Wallet,
  Wrench,
  BarChart2
} from 'lucide-react';
import React from 'react';

export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly?: boolean;
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home,     label: 'Trang chủ',   path: '/' },
  { icon: FileText, label: 'Bán hàng',    path: '/ban-hang' },
  { icon: Wallet,   label: 'Thu chi',     path: '/thu-chi',     adminOnly: true },
  { icon: Wrench,    label: 'Dịch vụ',    path: '/dich-vu' },
  { icon: BarChart2, label: 'Báo cáo',     path: '/bao-cao',     adminOnly: true },
  { icon: Users,     label: 'Nhân sự',     path: '/nhan-su',     adminOnly: true },
  { icon: Wallet,   label: 'Tiền lương',  path: '/tien-luong' }, // NV xem lương của mình, admin xem tất cả
  { icon: Box,      label: 'Kho vận',     path: '/kho-van',     adminOnly: true },
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [];
