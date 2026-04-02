import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import AttendanceManagementPage from './pages/AttendanceManagementPage';
import PersonnelManagementPage from './pages/PersonnelManagementPage';
import CheckInPage from './pages/CheckInPage';
import CustomerManagementPage from './pages/CustomerManagementPage';
import Dashboard from './pages/Dashboard';
import InventoryManagementPage from './pages/InventoryManagementPage';
import FinancialManagementPage from './pages/FinancialManagementPage';
import ServiceManagementPage from './pages/ServiceManagementPage';
import SalesCardManagementPage from './pages/SalesCardManagementPage';
import SalesCardCTManagementPage from './pages/SalesCardCTManagementPage';
import ModulePage from './pages/ModulePage';
import PayrollPage from './pages/PayrollPage';
import PayrollSettingsPage from './pages/PayrollSettingsPage';
import SalaryComponentPage from './pages/SalaryComponentPage';
import AllowancePolicyPage from './pages/AllowancePolicyPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ban-hang" element={<ModulePage />}>
            <Route path="khach-hang" element={<CustomerManagementPage />} />
            <Route path="phieu-ban-hang" element={<SalesCardManagementPage />} />
            <Route path="phieu-ban-hang-ct" element={<SalesCardCTManagementPage />} />
          </Route>

          <Route path="/thu-chi" element={<FinancialManagementPage />} />
          <Route path="/dich-vu" element={<ServiceManagementPage />} />

          <Route path="/nhan-su" element={<ModulePage />}>
            <Route path="ung-vien" element={<PersonnelManagementPage />} />
            <Route path="bang-cham-cong" element={<AttendanceManagementPage />} />
          </Route>

          <Route path="/cham-cong" element={<CheckInPage />} />

          <Route path="/kho-van" element={<ModulePage />}>
            <Route path="xuat-nhap-kho" element={<InventoryManagementPage />} />
          </Route>

          <Route path="/tien-luong" element={<ModulePage />}>
            <Route path="bang-luong" element={<PayrollPage />} />
            <Route path="thong-so" element={<PayrollSettingsPage />} />
            <Route path="thanh-phan" element={<SalaryComponentPage />} />
            <Route path="chinh-sach" element={<AllowancePolicyPage />} />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
