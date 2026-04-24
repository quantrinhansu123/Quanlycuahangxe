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
const PermissionSettingsPage = lazy(() => import('./pages/PermissionSettingsPage'));


function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<TopProgressBar />}>
        <Routes>
          {/* Public route — không cần login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes — phải đăng nhập */}
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<ProtectedRoute viewKey="dashboard"><Dashboard /></ProtectedRoute>} />

            <Route path="/ban-hang" element={<ProtectedRoute viewKey="ban-hang"><ModulePage /></ProtectedRoute>}>
              <Route path="khach-hang" element={<ProtectedRoute viewKey="ban-hang"><CustomerManagementPage /></ProtectedRoute>} />
              <Route path="phieu-ban-hang" element={<ProtectedRoute viewKey="ban-hang"><SalesCardManagementPage /></ProtectedRoute>} />
              <Route path="phieu-ban-hang-ct" element={<ProtectedRoute viewKey="ban-hang"><SalesCardCTManagementPage /></ProtectedRoute>} />
            </Route>

            {/* Thu chi — chỉ admin */}
            <Route path="/thu-chi" element={<ProtectedRoute viewKey="thu-chi"><FinancialManagementPage /></ProtectedRoute>} />

            <Route path="/dich-vu" element={<ProtectedRoute viewKey="dich-vu"><ServiceManagementPage /></ProtectedRoute>} />

            <Route path="/nhan-su" element={<ProtectedRoute viewKey="nhan-su"><ModulePage /></ProtectedRoute>}>
              <Route path="them-cham-cong" element={<ProtectedRoute viewKey="nhan-su"><AddAttendancePage /></ProtectedRoute>} />
              <Route path="bang-cham-cong" element={<ProtectedRoute viewKey="nhan-su"><AttendanceManagementPage /></ProtectedRoute>} />
              {/* Quản lý nhân viên — chỉ admin */}
              <Route path="ung-vien" element={<ProtectedRoute viewKey="nhan-su-ung-vien"><PersonnelManagementPage /></ProtectedRoute>} />
            </Route>

            <Route path="/cham-cong" element={<ProtectedRoute viewKey="cham-cong"><CheckInPage /></ProtectedRoute>} />

            {/* Kho vận — chỉ admin */}
            <Route path="/kho-van" element={<ProtectedRoute viewKey="kho-van"><ModulePage /></ProtectedRoute>}>
              <Route path="xuat-nhap-kho" element={<ProtectedRoute viewKey="kho-van"><InventoryManagementPage /></ProtectedRoute>} />
            </Route>

            {/* Tiền lương */}
            <Route path="/tien-luong" element={<ProtectedRoute viewKey="tien-luong"><ModulePage /></ProtectedRoute>}>
              {/* bang-luong: admin xem tất cả, nhân viên xem của mình (RLS lọc data) */}
              <Route path="bang-luong" element={<ProtectedRoute viewKey="tien-luong"><PayrollPage /></ProtectedRoute>} />
              {/* Các trang cấu hình — chỉ admin */}
              <Route path="thong-so" element={<ProtectedRoute viewKey="tien-luong-cau-hinh"><PayrollSettingsPage /></ProtectedRoute>} />
              <Route path="thanh-phan" element={<ProtectedRoute viewKey="tien-luong-cau-hinh"><SalaryComponentPage /></ProtectedRoute>} />
              <Route path="chinh-sach" element={<ProtectedRoute viewKey="tien-luong-cau-hinh"><AllowancePolicyPage /></ProtectedRoute>} />
            </Route>

            {/* Báo cáo doanh thu — chỉ admin */}
            <Route path="/bao-cao" element={<ProtectedRoute viewKey="bao-cao"><RevenueReportPage /></ProtectedRoute>}>
              <Route index element={<Navigate to="san-pham" replace />} />
              <Route path=":tab" element={null} />
            </Route>

            <Route
              path="/cai-dat/phan-quyen"
              element={
                <ProtectedRoute adminOnly viewKey="cai-dat-phan-quyen">
                  <PermissionSettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
