import {
  Calendar, ClipboardList, Banknote, Settings, Target, FileSignature,
  FileText, Send, UserCog, Briefcase, 
  PieChart, Wallet, RefreshCw, Wrench,
  Users, ShieldCheck, Megaphone, Star, Award,
  Mail, MessageSquare, Share2, Image,
  Layout, MousePointer2,
  TrendingUp,
  BarChart3, TrendingDown, Landmark, FileEdit,
  Receipt, Coins, CreditCard, CheckCircle2,
  BookOpen, Calculator as CalcIcon, History,
  Truck, Package, ShoppingCart, FileCheck, Tag,
  ArrowLeftRight, MapPin,
  Building2, List, ClipboardCheck, Building, Monitor
} from 'lucide-react';
import type { ModuleCardProps } from '../components/ui/ModuleCard';

// Comprehensive mock data for module pages to match the Quản lý chuỗi cửa hàng sửa xe precisely
export const moduleData: Record<string, { section: string; items: ModuleCardProps[] }[]> = {
  '/hanh-chinh': [
    {
      section: 'Quản lý bán hàng',
      items: [
        { icon: Users, title: 'Khách hàng', description: 'Quản lý danh sách và thông tin khách hàng.', colorScheme: 'blue', path: '/ban-hang/khach-hang' },
        { icon: ShoppingCart, title: 'Bán hàng', description: 'Lập hóa đơn và quản lý giao dịch bán hàng.', colorScheme: 'green' },
        { icon: Wallet, title: 'Thu chi', description: 'Theo dõi các khoản thu và chi tiết tài chính.', colorScheme: 'orange' },
        { icon: Wrench, title: 'Dịch vụ', description: 'Quản lý các gói dịch vụ và tiến độ sửa chữa.', colorScheme: 'purple' }
      ]
    }
  ],
  '/nhan-su': [
    {
      section: 'Quản lý nhân sự',
      items: [
        { icon: Users, title: 'Nhân sự', description: 'Quản lý hồ sơ, thông tin nhân viên trong hệ thống.', colorScheme: 'emerald' },
        { icon: Calendar, title: 'Chấm công', description: 'Thực hiện chấm công hàng ngày cho nhân viên.', colorScheme: 'blue' },
        { icon: ClipboardList, title: 'Bảng chấm công', description: 'Xem và tổng hợp dữ liệu chấm công theo tháng.', colorScheme: 'orange' }
      ]
    }
  ],
  '/kinh-doanh': [
    {
      section: 'CRM & Khách hàng',
      items: [
        { icon: Users, title: 'Danh sách khách hàng', description: 'Hồ sơ khách hàng, liên hệ, lịch sử giao dịch.', colorScheme: 'blue' },
        { icon: UserCog, title: 'Người liên hệ', description: 'Quản lý người liên hệ theo khách hàng, chức vụ, thông tin liên lạc.', colorScheme: 'teal' },
        { icon: MapPin, title: 'Bản đồ khách hàng', description: 'Hiển thị khách hàng trên bản đồ, lên lịch tuyến thăm.', colorScheme: 'green' },
        { icon: Calendar, title: 'Lịch chăm sóc', description: 'Lịch gọi điện, gặp mặt, nhắc chăm sóc theo khách hàng.', colorScheme: 'teal' }
      ]
    },
    {
      section: 'Bán hàng & Đơn hàng',
      items: [
        { icon: Target, title: 'Cơ hội bán hàng', description: 'Pipeline: Lead → Báo giá → Thương thảo → Chốt đơn.', colorScheme: 'orange' },
        { icon: FileText, title: 'Báo giá', description: 'Lập báo giá, phê duyệt, chuyển sang đơn hàng hoặc hợp đồng.', colorScheme: 'pink', path: '/kinh-doanh/bao-gia' },
        { icon: ShoppingCart, title: 'Đơn hàng', description: 'Tạo, duyệt đơn hàng, liên kết báo giá, xuất kho.', colorScheme: 'orange' },
        { icon: FileSignature, title: 'Hợp đồng', description: 'Hợp đồng với khách hàng, điều khoản, theo dõi thanh toán.', colorScheme: 'red' }
      ]
    },
    {
      section: 'Báo cáo',
      items: [
        { icon: BarChart3, title: 'Báo cáo doanh số', description: 'Doanh số theo thời gian, nhân viên, khách hàng, sản phẩm.', colorScheme: 'blue' },
        { icon: PieChart, title: 'Báo cáo công nợ', description: 'Tổng công nợ, nợ quá hạn, tuổi nợ theo khách hàng.', colorScheme: 'purple' },
        { icon: Settings, title: 'Thiết lập CRM', description: 'Cấu hình nhóm khách hàng và thiết lập CRM.', colorScheme: 'slate' }
      ]
    }
  ],
  '/marketing': [
    {
      section: 'Chiến dịch Marketing',
      items: [
        { icon: Megaphone, title: 'Chiến dịch', description: 'Tạo chiến dịch, mục tiêu, thời gian, ngân sách.', colorScheme: 'pink' },
        { icon: Mail, title: 'Email Marketing', description: 'Gửi email hàng loạt, mẫu, A/B test.', colorScheme: 'blue' },
        { icon: MessageSquare, title: 'SMS & Thông báo', description: 'SMS, push, tin nhắn trong app.', colorScheme: 'green' },
        { icon: Share2, title: 'Mạng xã hội', description: 'Lịch đăng bài, đa kênh, lịch sử đăng.', colorScheme: 'purple' },
        { icon: PieChart, title: 'Báo cáo chiến dịch', description: 'Hiệu quả, tỷ lệ mở/click, chuyển đổi.', colorScheme: 'teal' },
        { icon: Settings, title: 'Thiết lập chiến dịch', description: 'Kênh, mẫu, giới hạn gửi.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Nội dung & Truyền thông',
      items: [
        { icon: FileText, title: 'Quản lý nội dung', description: 'Bài viết, landing page, bài quảng cáo.', colorScheme: 'pink' },
        { icon: Image, title: 'Thư viện tài sản', description: 'Hình ảnh, video, file tái sử dụng.', colorScheme: 'purple' },
        { icon: Layout, title: 'Landing page', description: 'Tạo trang đích, form đăng ký, theo dõi.', colorScheme: 'teal' },
        { icon: MousePointer2, title: 'Form thu thập lead', description: 'Form nhúng, popup, tích hợp.', colorScheme: 'orange' },
        { icon: Settings, title: 'Thiết lập nội dung', description: 'Mẫu, thư viện thương hiệu.', colorScheme: 'slate' }
      ]
    }
  ],
  '/tai-chinh': [
    {
      section: 'Kế toán tổng hợp',
      items: [
        { icon: BookOpen, title: 'Sổ cái', description: 'Sổ cái tài khoản, đối chiếu số dư.', colorScheme: 'purple' },
        { icon: CalcIcon, title: 'Định khoản / Hạch toán', description: 'Chứng từ, bút toán, luồng duyệt.', colorScheme: 'purple' },
        { icon: Calendar, title: 'Kỳ kế toán', description: 'Đóng kỳ, khóa sổ, mở kỳ mới.', colorScheme: 'blue' },
        { icon: RefreshCw, title: 'Đối soát số liệu', description: 'Đối chiếu nội bộ, số liệu liên kết.', colorScheme: 'teal' },
        { icon: FileText, title: 'Báo cáo tài chính', description: 'BCKQKD, CĐKT, Lưu chuyển tiền tệ.', colorScheme: 'cyan' },
        { icon: Settings, title: 'Thiết lập kế toán', description: 'Danh mục tài khoản, kỳ, phân quyền.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Công nợ & Thu chi',
      items: [
        { icon: Banknote, title: 'Công nợ phải thu', description: 'Công nợ khách hàng, theo dõi thu, đối soát.', colorScheme: 'green' },
        { icon: CreditCard, title: 'Công nợ phải trả', description: 'Công nợ nhà cung cấp, lịch thanh toán.', colorScheme: 'orange' },
        { icon: Wallet, title: 'Thu tiền / Phiếu thu', description: 'Phiếu thu, đối ứng công nợ, quỹ.', colorScheme: 'teal' },
        { icon: Coins, title: 'Chi tiền / Phiếu chi', description: 'Phiếu chi, tạm ứng, thanh toán.', colorScheme: 'red' },
        { icon: History, title: 'Đối soát công nợ', description: 'Đối soát công nợ, số dư, điều chỉnh.', colorScheme: 'orange' },
        { icon: Settings, title: 'Thiết lập công nợ', description: 'Loại chứng từ, quy trình duyệt.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Ngân sách',
      items: [
        { icon: Calendar, title: 'Kế hoạch ngân sách', description: 'Lập ngân sách năm, quý theo phòng ban, mục.', colorScheme: 'purple' },
        { icon: Share2, title: 'Phân bổ ngân sách', description: 'Phân bổ theo dự án, chi phí, điều chuyển.', colorScheme: 'blue' },
        { icon: TrendingUp, title: 'Theo dõi thực chi', description: 'So sánh dự toán và thực chi, cảnh báo vượt.', colorScheme: 'teal' },
        { icon: BarChart3, title: 'Báo cáo ngân sách', description: 'Báo cáo sử dụng, còn lại, biến động.', colorScheme: 'cyan' },
        { icon: Settings, title: 'Thiết lập ngân sách', description: 'Cấu trúc ngân sách, mẫu, quy trình phê duyệt.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Quỹ, Ngân hàng & Thuế',
      items: [
        { icon: Wallet, title: 'Quỹ tiền mặt', description: 'Sổ quỹ, thu chi tiền mặt, tồn quỹ.', colorScheme: 'teal' },
        { icon: Landmark, title: 'Tài khoản ngân hàng', description: 'Số phụ ngân hàng, giao dịch, số dư.', colorScheme: 'blue' },
        { icon: TrendingDown, title: 'Dự báo dòng tiền', description: 'Dự báo thu chi theo kỳ, kịch bản.', colorScheme: 'teal' },
        { icon: CheckCircle2, title: 'Đối soát ngân hàng', description: 'Đối chiếu số sách và sao kê.', colorScheme: 'teal' },
        { icon: FileEdit, title: 'Kê khai thuế', description: 'Tờ khai GTGT, TNCN, TNDN, tạm tính.', colorScheme: 'orange' },
        { icon: Receipt, title: 'Hóa đơn', description: 'Hóa đơn điện tử, phát hành, hủy, đối soát.', colorScheme: 'red' },
        { icon: Settings, title: 'Thiết lập quỹ & thuế', description: 'Thuế suất, mã thuế, tài khoản ngân hàng.', colorScheme: 'slate' }
      ]
    }
  ],
  '/mua-hang': [
    {
      section: 'Nhà cung cấp',
      items: [
        { icon: Users, title: 'Danh sách nhà cung cấp', description: 'Hồ sơ NCC, liên hệ, điều kiện thanh toán.', colorScheme: 'orange' },
        { icon: Tag, title: 'Phân loại nhà cung cấp', description: 'Nhóm, hạng, ngành hàng.', colorScheme: 'blue' },
        { icon: Star, title: 'Đánh giá nhà cung cấp', description: 'Chất lượng, giao hàng, điểm số.', colorScheme: 'orange' },
        { icon: FileText, title: 'Hợp đồng khung', description: 'Hợp đồng khung, giá, thời hạn.', colorScheme: 'teal' },
        { icon: Settings, title: 'Thiết lập nhà cung cấp', description: 'Trình tự tùy chỉnh, quy trình duyệt, phân quyền.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Đặt hàng & Mua hàng',
      items: [
        { icon: ClipboardList, title: 'Yêu cầu mua hàng', description: 'Đề xuất mua, duyệt, chuyển thành đơn đặt hàng.', colorScheme: 'orange' },
        { icon: ShoppingCart, title: 'Đơn đặt hàng', description: 'Tạo PO, gửi NCC, theo dõi trạng thái.', colorScheme: 'blue', path: '/mua-hang/don-dat-hang' },
        { icon: Truck, title: 'Quản lý lô hàng (Shipment)', description: 'Tạo và cập nhật thông tin lô hàng mua.', colorScheme: 'teal', path: '/mua-hang/quan-ly-lo-hang' },
        { icon: CheckCircle2, title: 'Duyệt đơn đặt hàng', description: 'Luồng duyệt theo giá trị, phòng ban.', colorScheme: 'green' },
        { icon: Truck, title: 'Theo dõi đơn hàng', description: 'Tiến độ giao hàng, nhắc hạn, nhập kho.', colorScheme: 'blue' },
        { icon: BarChart3, title: 'Báo cáo đặt hàng', description: 'Thống kê theo NCC, mặt hàng, thời gian.', colorScheme: 'purple' },
        { icon: Settings, title: 'Thiết lập đặt hàng', description: 'Mẫu PO, hạn mức, quy tắc duyệt.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Đấu thầu / Mời thầu',
      items: [
        { icon: Package, title: 'Gói thầu', description: 'Tạo gói thầu, nội dung, thời hạn.', colorScheme: 'orange' },
        { icon: Send, title: 'Mời thầu', description: 'Mời NCC, hồ sơ mời thầu, deadline.', colorScheme: 'purple' },
        { icon: FileText, title: 'Hồ sơ dự thầu', description: 'Nhận hồ sơ, đánh giá, so sánh.', colorScheme: 'teal' },
        { icon: Award, title: 'Kết quả & Hợp đồng', description: 'Trúng thầu, ký hợp đồng, lưu trữ.', colorScheme: 'orange' },
        { icon: BarChart3, title: 'Báo cáo đấu thầu', description: 'Tổng hợp đấu thầu, tỷ lệ trúng.', colorScheme: 'teal' },
        { icon: Settings, title: 'Thiết lập đấu thầu', description: 'Quy trình, tiêu chí đánh giá.', colorScheme: 'slate' }
      ]
    },
    {
      section: 'Hợp đồng & Thanh toán',
      items: [
        { icon: FileSignature, title: 'Hợp đồng mua hàng', description: 'Hợp đồng, điều khoản, phụ lục.', colorScheme: 'orange' },
        { icon: FileCheck, title: 'Thanh lý & Gia hạn', description: 'Thanh lý, gia hạn, điều chỉnh.', colorScheme: 'teal' },
        { icon: RefreshCw, title: 'Đối soát thanh toán', description: 'Đối chiếu PO - Hóa đơn - Thanh toán.', colorScheme: 'green' },
        { icon: BarChart3, title: 'Báo cáo hợp đồng', description: 'Thời hạn, giá trị, thực hiện.', colorScheme: 'purple' },
        { icon: Settings, title: 'Thiết lập hợp đồng', description: 'Mẫu hợp đồng, quy trình ký.', colorScheme: 'slate' }
      ]
    }
  ],
  '/kho-van': [
    {
      section: 'Quản lý kho',
      items: [
        { icon: ArrowLeftRight, title: 'Xuất nhập kho', description: 'Quản lý các hoạt động nhập hàng vào kho và xuất hàng ra khỏi kho.', colorScheme: 'teal' }
      ]
    }
  ],
  '/he-thong': [
    {
      section: 'Sơ đồ',
      items: [
        { icon: Building2, title: 'Phòng ban', description: 'Cơ cấu tổ chức đơn vị.', colorScheme: 'purple' },
        { icon: List, title: 'Cấp bậc', description: 'Hệ thống thang bảng lương/level.', colorScheme: 'orange' },
        { icon: Briefcase, title: 'Chức vụ', description: 'Quản lý các vị trí công việc.', colorScheme: 'blue' },
        { icon: ClipboardCheck, title: 'Chức năng nhiệm vụ', description: 'Sứ mệnh, chức năng phòng ban và nhiệm vụ, bộ chỉ số KPI.', colorScheme: 'slate' },
        { icon: Users, title: 'Nhân viên', description: 'Hồ sơ và thông tin nhân sự.', colorScheme: 'emerald' }
      ]
    },
    {
      section: 'Bảo mật & Cấu hình',
      items: [
        { icon: Building, title: 'Thông tin công ty', description: 'Thiết lập thông tin pháp nhân.', colorScheme: 'purple' },
        { icon: MapPin, title: 'Chi nhánh', description: 'Quản lý danh sách chi nhánh và địa điểm.', colorScheme: 'slate' },
        { icon: ShieldCheck, title: 'Phân quyền', description: 'Vai trò và quyền hạn.', colorScheme: 'red' },
        { icon: RefreshCw, title: 'Sao lưu & Khôi phục', description: 'Xuất, nhập và khôi phục dữ liệu hệ thống.', colorScheme: 'blue' },
        { icon: Monitor, title: 'Thiết bị đăng nhập', description: 'Quản lý tài khoản đã đăng nhập trên những thiết bị nào. Đăng xuất thiết bị từ xa.', colorScheme: 'teal' }
      ]
    }
  ],
};
