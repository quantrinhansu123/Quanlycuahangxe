import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import AIPage from './pages/AIPage';
import CopyrightPage from './pages/CopyrightPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import CandidatesPage from './pages/CandidatesPage';
import RecordArchivePage from './pages/RecordArchivePage';
import ContractManagementPage from './pages/ContractManagementPage';
import ShipmentManagementPage from './pages/ShipmentManagementPage';
import QuoteManagementPage from './pages/QuoteManagementPage';
import PurchaseOrderPage from './pages/PurchaseOrderPage';
import CustomerManagementPage from './pages/CustomerManagementPage.tsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ho-so" element={<ProfilePage />} />
          <Route path="/hanh-chinh" element={<ModulePage />} />
          <Route path="/ban-hang/khach-hang" element={<CustomerManagementPage />} />
          <Route path="/ban-hang/luu-tru-ho-so" element={<RecordArchivePage />} />
          <Route path="/hanh-chinh/quan-ly-hop-dong" element={<ContractManagementPage />} />
          <Route path="/nhan-su" element={<ModulePage />} />
          <Route path="/nhan-su/ung-vien" element={<CandidatesPage />} />
          <Route path="/kinh-doanh" element={<ModulePage />} />
          <Route path="/kinh-doanh/bao-gia" element={<QuoteManagementPage />} />
          <Route path="/marketing" element={<ModulePage />} />
          <Route path="/tai-chinh" element={<ModulePage />} />
          <Route path="/mua-hang" element={<ModulePage />} />
          <Route path="/mua-hang/quan-ly-lo-hang" element={<ShipmentManagementPage />} />
          <Route path="/mua-hang/don-dat-hang" element={<PurchaseOrderPage />} />
          <Route path="/kho-van" element={<ModulePage />} />
          <Route path="/dieu-hanh" element={<ModulePage />} />
          <Route path="/he-thong" element={<ModulePage />} />
          <Route path="/tro-ly-ai" element={<AIPage />} />
          <Route path="/ban-quyen" element={<CopyrightPage />} />
          <Route path="/cai-dat" element={<SettingsPage />} />
          
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
