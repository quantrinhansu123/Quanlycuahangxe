import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import TopProgressBar from './components/ui/TopProgressBar';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Lazy load all pages for optimal performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AttendanceManagementPage = lazy(() => import('./pages/AttendanceManagementPage'));
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


function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<TopProgressBar />}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ban-hang" element={<ModulePage />}>
              <Route path="khach-hang" element={<CustomerManagementPage />} />
              <Route path="phieu-ban-hang" element={<SalesCardManagementPage />} />
              <Route path="phieu-ban-hang-ct" element={<SalesCardCTManagementPage />} />
            </Route>

            <Route path="/thu-chi" element={<ProtectedRoute adminOnly><FinancialManagementPage /></ProtectedRoute>} />
            <Route path="/dich-vu" element={<ServiceManagementPage />} />

            <Route path="/nhan-su" element={<ModulePage />}>
              <Route path="ung-vien" element={<ProtectedRoute adminOnly><PersonnelManagementPage /></ProtectedRoute>} />
              <Route path="bang-cham-cong" element={<AttendanceManagementPage />} />
            </Route>

            <Route path="/cham-cong" element={<CheckInPage />} />

            <Route path="/kho-van" element={<ModulePage />}>
              <Route path="xuat-nhap-kho" element={<InventoryManagementPage />} />
            </Route>

            <Route path="/tien-luong" element={<ProtectedRoute adminOnly><ModulePage /></ProtectedRoute>}>
              <Route path="bang-luong" element={<PayrollPage />} />
              <Route path="thong-so" element={<PayrollSettingsPage />} />
              <Route path="thanh-phan" element={<SalaryComponentPage />} />
              <Route path="chinh-sach" element={<AllowancePolicyPage />} />
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
