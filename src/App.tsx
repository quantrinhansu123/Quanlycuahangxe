import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import AttendanceManagementPage from './pages/AttendanceManagementPage';
import PersonnelManagementPage from './pages/PersonnelManagementPage';
import CustomerManagementPage from './pages/CustomerManagementPage';
import Dashboard from './pages/Dashboard';
import InventoryManagementPage from './pages/InventoryManagementPage';
import FinancialManagementPage from './pages/FinancialManagementPage';
import ServiceManagementPage from './pages/ServiceManagementPage';
import SalesCardManagementPage from './pages/SalesCardManagementPage';
import SalesCardCTManagementPage from './pages/SalesCardCTManagementPage';
import ModulePage from './pages/ModulePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ban-hang" element={<ModulePage />} />
          <Route path="/ban-hang/khach-hang" element={<CustomerManagementPage />} />
          <Route path="/thu-chi" element={<FinancialManagementPage />} />
          <Route path="/dich-vu" element={<ServiceManagementPage />} />
          <Route path="/ban-hang/phieu-ban-hang" element={<SalesCardManagementPage />} />
          <Route path="/ban-hang/phieu-ban-hang-ct" element={<SalesCardCTManagementPage />} />
          <Route path="/nhan-su" element={<ModulePage />} />
          <Route path="/nhan-su/ung-vien" element={<PersonnelManagementPage />} />
          <Route path="/nhan-su/bang-cham-cong" element={<AttendanceManagementPage />} />
          <Route path="/kho-van" element={<ModulePage />} />
          <Route path="/kho-van/xuat-nhap-kho" element={<InventoryManagementPage />} />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
