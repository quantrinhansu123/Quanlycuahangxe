import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import TopProgressBar from './components/ui/TopProgressBar';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Lazy load all pages for optimal performance
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AttendanceManagementPage = lazy(() => import('./pages/AttendanceManagementPage'));
const AddAttendancePage = lazy(() => import('./pages/AddAttendancePage'));
const PersonnelManagementPage = lazy(() => import('./pages/PersonnelManagementPage'));
const CheckInPage = lazy(() => import('./pages/CheckInPage'));
const CustomerManagementPage = lazy(() => import('./pages/CustomerManagementPage'));
const InventoryManagementPage = lazy(() => import('./pages/InventoryManagementPage'));
const FinancialManagementPage = lazy(() => import('./pages/FinancialManagementPage'));
const ServiceManagementPage = lazy(() => import('./pages/ServiceManagementPage'));
const SalesCardManagementPage = lazy(() => import('./pages/SalesCardManagementPage'));
const SalesCardCTManagementPage = lazy(() => import('./pages/SalesCardCTManagementPage'));
const ModulePage = lazy(() => import('./pages/ModulePage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const PayrollSettingsPage = lazy(() => import('./pages/PayrollSettingsPage'));
const SalaryComponentPage = lazy(() => import('./pages/SalaryComponentPage'));
const AllowancePolicyPage = lazy(() => import('./pages/AllowancePolicyPage'));
const RevenueReportPage = lazy(() => import('./pages/RevenueReportPage'));


function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<TopProgressBar />}>
        <Routes>
          {/* Public route — không cần login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes — phải đăng nhập */}
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />

            <Route path="/ban-hang" element={<ModulePage />}>
              <Route path="khach-hang" element={<CustomerManagementPage />} />
              <Route path="phieu-ban-hang" element={<SalesCardManagementPage />} />
              <Route path="phieu-ban-hang-ct" element={<SalesCardCTManagementPage />} />
            </Route>

            {/* Thu chi — chỉ admin */}
            <Route path="/thu-chi" element={<ProtectedRoute adminOnly><FinancialManagementPage /></ProtectedRoute>} />

            <Route path="/dich-vu" element={<ServiceManagementPage />} />

            <Route path="/nhan-su" element={<ModulePage />}>
              <Route path="them-cham-cong" element={<AddAttendancePage />} />
              <Route path="bang-cham-cong" element={<AttendanceManagementPage />} />
              {/* Quản lý nhân viên — chỉ admin */}
              <Route path="ung-vien" element={<ProtectedRoute adminOnly><PersonnelManagementPage /></ProtectedRoute>} />
            </Route>

            <Route path="/cham-cong" element={<CheckInPage />} />

            {/* Kho vận — chỉ admin */}
            <Route path="/kho-van" element={<ProtectedRoute adminOnly><ModulePage /></ProtectedRoute>}>
              <Route path="xuat-nhap-kho" element={<InventoryManagementPage />} />
            </Route>

            {/* Tiền lương */}
            <Route path="/tien-luong" element={<ProtectedRoute adminOnly><ModulePage /></ProtectedRoute>}>
              {/* bang-luong: admin xem tất cả, nhân viên xem của mình (RLS lọc data) */}
              <Route path="bang-luong" element={<PayrollPage />} />
              {/* Các trang cấu hình — chỉ admin */}
              <Route path="thong-so" element={<ProtectedRoute adminOnly><PayrollSettingsPage /></ProtectedRoute>} />
              <Route path="thanh-phan" element={<ProtectedRoute adminOnly><SalaryComponentPage /></ProtectedRoute>} />
              <Route path="chinh-sach" element={<ProtectedRoute adminOnly><AllowancePolicyPage /></ProtectedRoute>} />
            </Route>

            {/* Báo cáo doanh thu — chỉ admin */}
            <Route path="/bao-cao" element={<ProtectedRoute adminOnly><RevenueReportPage /></ProtectedRoute>}>
              <Route index element={<Navigate to="san-pham" replace />} />
              <Route path=":tab" element={null} />
            </Route>

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
