import {
  Home,
  FileText,
  Users,
  Box,
  Wallet,
  Wrench,
  BarChart2,
  ShieldCheck
} from 'lucide-react';
import React from 'react';
import type { ViewPermissionKey } from './viewPermissions';

export type SidebarSubItem = {
  label: string;
  path: string;
  viewKey?: ViewPermissionKey;
};

export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly?: boolean;
  viewKey?: ViewPermissionKey;
  children?: SidebarSubItem[];
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/', viewKey: 'dashboard' },
  {
    icon: FileText,
    label: 'Bán hàng',
    path: '/ban-hang',
    viewKey: 'ban-hang',
    children: [
      { label: 'Phiếu bán hàng', path: '/ban-hang/phieu-ban-hang' },
      { label: 'Khách hàng', path: '/ban-hang/khach-hang' },
    ],
  },
  { icon: Wallet, label: 'Thu chi', path: '/thu-chi', viewKey: 'thu-chi' },
  { icon: Wrench, label: 'Dịch vụ', path: '/dich-vu', viewKey: 'dich-vu' },
  { icon: BarChart2, label: 'Báo cáo', path: '/bao-cao', viewKey: 'bao-cao' },
  { icon: Users, label: 'Nhân sự', path: '/nhan-su', viewKey: 'nhan-su' },
  { icon: Wallet, label: 'Tiền lương', path: '/tien-luong', viewKey: 'tien-luong' }, // NV xem lương của mình, admin xem tất cả
  { icon: Box, label: 'Kho vận', path: '/kho-van', viewKey: 'kho-van' },
  { icon: ShieldCheck, label: 'Cài đặt phân quyền', path: '/cai-dat/phan-quyen', adminOnly: true, viewKey: 'cai-dat-phan-quyen' },
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [];
