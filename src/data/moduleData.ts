import {
  ArrowLeftRight,
  ClipboardList,
  ShoppingCart,
  Users,
  Wallet,
  Wrench,
  BadgeDollarSign,
  Settings2,
  Braces,
  Plus,
  Table2
} from 'lucide-react';
import type { ModuleCardProps } from '../components/ui/ModuleCard';

// Comprehensive mock data for module pages to match the Quản lý chuỗi cửa hàng sửa xe precisely
export const moduleData: Record<string, { section: string; items: ModuleCardProps[] }[]> = {
  '/ban-hang': [
    {
      section: 'Quản lý bán hàng',
      items: [
        { icon: ShoppingCart, title: 'Bán hàng', description: 'Lập hóa đơn và quản lý giao dịch bán hàng.', colorScheme: 'green', path: '/ban-hang/phieu-ban-hang' },
        { icon: Users, title: 'Khách hàng', description: 'Quản lý danh sách và thông tin khách hàng.', colorScheme: 'blue', path: '/ban-hang/khach-hang', showInTopbar: false }
      ]
    }
  ],
  '/dich-vu': [
    {
      section: 'Quản lý dịch vụ',
      items: [
        { icon: Wrench, title: 'Dịch vụ', description: 'Quản lý danh mục dịch vụ và giá cả.', colorScheme: 'purple', path: '/dich-vu' }
      ]
    }
  ],
  '/thu-chi': [
    {
      section: 'Tài chính',
      items: [
        { icon: Wallet, title: 'Thu chi', description: 'Quản lý dòng tiền và các chứng từ tài chính.', colorScheme: 'blue', path: '/thu-chi' }
      ]
    }
  ],
  '/nhan-su': [
    {
      section: 'Quản lý nhân sự',
      items: [
        { icon: Plus, title: 'Chấm công', description: 'Nhập thông tin chấm công thủ công (giờ vào, ra, hình ảnh).', colorScheme: 'blue', path: '/nhan-su/them-cham-cong' },
        { icon: ClipboardList, title: 'Bảng chấm công', description: 'Xem và tổng hợp dữ liệu chấm công theo tháng.', colorScheme: 'orange', path: '/nhan-su/bang-cham-cong' },
        { icon: Users, title: 'Nhân sự', description: 'Quản lý danh sách nhân viên, vị trí và cơ sở làm việc.', colorScheme: 'emerald', path: '/nhan-su/ung-vien' }
      ]
    }
  ],
  '/tien-luong': [
    {
      section: 'Quản lý tiền lương',
      items: [
        { icon: Table2, title: 'Bảng lương chấm công', description: 'Nhập công, phụ cấp, ăn ca, tăng ca, hoa hồng — tổng theo nghiệp vụ 28/8.', colorScheme: 'teal', path: '/tien-luong/bang-luong-cham-cong' },
        { icon: BadgeDollarSign, title: 'Bảng lương', description: 'Tính toán và quản lý bảng thanh toán lương hàng tháng.', colorScheme: 'emerald', path: '/tien-luong/bang-luong' },
        { icon: Settings2, title: 'Thông số mặc định', description: 'Cấu hình lương cơ sở, mức đóng bảo hiểm và thuế.', colorScheme: 'blue', path: '/tien-luong/thong-so' },
        { icon: Braces, title: 'Thành phần lương', description: 'Định nghĩa các khoản thu nhập và khấu trừ tùy chỉnh.', colorScheme: 'purple', path: '/tien-luong/thanh-phan' },
        { icon: Wallet, title: 'Chính sách phụ cấp', description: 'Gán mức phụ cấp linh hoạt theo từng vị trí công việc.', colorScheme: 'orange', path: '/tien-luong/chinh-sach' }
      ]
    }
  ],
  '/kho-van': [
    {
      section: 'Quản lý kho',
      items: [
        { icon: ArrowLeftRight, title: 'Xuất nhập kho', description: 'Quản lý các hoạt động nhập hàng vào kho và xuất hàng ra khỏi kho.', colorScheme: 'teal', path: '/kho-van/xuat-nhap-kho' }
      ]
    }
  ],
};
