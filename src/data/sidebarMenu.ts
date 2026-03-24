import {
  Home,
  FileText,
  Users,
  Megaphone,
  Wallet,
  ShoppingCart,
  Box,
  Layers,
  Bot,
  Copyright,
  Briefcase
} from 'lucide-react';
import React from 'react';

export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
};

export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/' },
  { icon: FileText, label: 'Bán hàng', path: '/hanh-chinh' },
  { icon: Users, label: 'Nhân sự', path: '/nhan-su' },
  { icon: Briefcase, label: 'Kinh doanh', path: '/kinh-doanh' },
  { icon: Megaphone, label: 'Marketing', path: '/marketing' },
  { icon: Wallet, label: 'Tài chính', path: '/tai-chinh' },
  { icon: ShoppingCart, label: 'Mua hàng', path: '/mua-hang' },
  { icon: Box, label: 'Kho vận', path: '/kho-van' },
  { icon: Layers, label: 'Hệ thống', path: '/he-thong' }
];

// Additional items seen on the dashboard
export const extraMenuItems: SidebarItem[] = [
  { icon: Bot, label: 'Trợ lý AI', path: '/tro-ly-ai' },
  { icon: Copyright, label: 'Thông tin bản quyền', path: '/ban-quyen' }
];
