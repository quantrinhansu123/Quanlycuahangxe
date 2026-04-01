import React, { useState, useEffect } from 'react';
import { 
  upsertPayrollSetting,
  getPayrollSettings,
  getTaxBrackets
} from '../data/payrollSettingsData';
import type { ThongSoLuong, BieuThueTNCN } from '../data/payrollSettingsData';
import { cn } from '../lib/utils';
import { formatNumberVietnamese, parseNumberVietnamese } from '../lib/utils';

const PayrollSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'luong' | 'thue' | 'bao-hiem'>('luong');
  const [settings, setSettings] = useState<ThongSoLuong[]>([]);
  const [taxBrackets, setTaxBrackets] = useState<BieuThueTNCN[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [settingsData, taxData] = await Promise.all([
        getPayrollSettings(),
        getTaxBrackets()
      ]);
      setSettings(settingsData);
      setTaxBrackets(taxData || []);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSetting = async (id: string, value: number) => {
    try {
      setSaving(true);
      const setting = settings.find(s => s.id === id);
      if (setting) {
        await upsertPayrollSetting({ ...setting, gia_tri: value });
        setSettings(prev => prev.map(s => s.id === id ? { ...s, gia_tri: value } : s));
      }
    } catch (error) {
      console.error('Error updating setting:', error);
    } finally {
      setSaving(false);
    }
  };

  const MoneyInput = ({ value, onSave, className }: { value: number, onSave: (v: number) => void, className?: string }) => {
    const [displayVal, setDisplayVal] = useState(formatNumberVietnamese(value));

    return (
      <input
        type="text"
        inputMode="numeric"
        className={cn("w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500", className)}
        value={displayVal}
        onFocus={e => e.target.select()}
        onChange={e => setDisplayVal(formatNumberVietnamese(e.target.value))}
        onBlur={() => {
          const numericVal = parseNumberVietnamese(displayVal);
          if (numericVal !== value) {
            onSave(numericVal);
          }
        }}
      />
    );
  };

  const tabs = [
    { id: 'luong', label: 'Lương' },
    { id: 'thue', label: 'Thuế TNCN' },
    { id: 'bao-hiem', label: 'Bảo hiểm' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const formatMoney = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

  return (
    <div className="bg-white min-h-screen p-4 sm:p-6 space-y-6 animate-in fade-in duration-500">
      {/* Minimalist Tabs */}
      <div className="flex items-center gap-8 border-b border-gray-100 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "pb-3 text-sm transition-all relative",
              activeTab === tab.id 
                ? "text-green-600 font-bold" 
                : "text-gray-400 hover:text-gray-600 font-medium"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-green-500" />
            )}
          </button>
        ))}
      </div>

      <div className="max-w-6xl">
        {activeTab === 'luong' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Mức lương cơ sở (VND)</label>
                <MoneyInput 
                  value={settings.find(s => s.loai === 'luong_co_so')?.gia_tri || 0}
                  onSave={(v) => {
                    const s = settings.find(s => s.loai === 'luong_co_so');
                    if (s) handleUpdateSetting(s.id, v);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Mức lương trần đóng BHXH, BHYT (VND)</label>
                <MoneyInput 
                  value={settings.find(s => s.loai === 'tran_bhxh_bhyt')?.gia_tri || 0}
                  onSave={(v) => {
                    const s = settings.find(s => s.loai === 'tran_bhxh_bhyt');
                    if (s) handleUpdateSetting(s.id, v);
                  }}
                />
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Mức lương tối thiểu vùng</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f9fafb] border-b border-gray-200 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-200 font-bold text-black uppercase tracking-tight text-xs">Đơn vị / Cơ sở</th>
                      <th className="px-4 py-3 text-right border-r border-gray-200 font-bold text-black uppercase tracking-tight text-xs">Mức lương tối thiểu (VND)</th>
                      <th className="px-4 py-3 text-right font-bold text-black uppercase tracking-tight text-xs">Trần đóng BHTN (VND)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {['Cơ sở Bắc Ninh', 'Cơ sở Bắc Giang'].map(co_so => (
                      <tr key={co_so} className="text-gray-700">
                        <td className="px-4 py-3 border-r border-gray-200">{co_so}</td>
                        <td className="px-4 py-3 text-right border-r border-gray-200">
                          <MoneyInput 
                            value={settings.find(s => s.loai === 'luong_toi_thieu_vung' && s.co_so === co_so)?.gia_tri || 0}
                            className="text-right border-none p-0 bg-transparent focus:text-green-600 font-medium"
                            onSave={(v) => {
                              const s = settings.find(s => s.loai === 'luong_toi_thieu_vung' && s.co_so === co_so);
                              if (s) handleUpdateSetting(s.id, v);
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <MoneyInput 
                            value={settings.find(s => s.loai === 'tran_bhtn' && s.co_so === co_so)?.gia_tri || 0}
                            className="text-right border-none p-0 bg-transparent focus:text-green-600 font-medium"
                            onSave={(v) => {
                              const s = settings.find(s => s.loai === 'tran_bhtn' && s.co_so === co_so);
                              if (s) handleUpdateSetting(s.id, v);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'thue' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-700">Thuế suất của nhân viên thử việc</h3>
              <div className="flex gap-12">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" name="trial_tax" defaultChecked className="w-4 h-4 accent-[#22c55e]" />
                  <span className="text-sm text-gray-700">Theo 10%</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" name="trial_tax" className="w-4 h-4 accent-[#22c55e]" />
                  <span className="text-sm text-gray-700">Theo biểu lũy tiến</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-700">Biểu thuế lũy tiến</h3>
              <div className="border border-gray-200 rounded shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#f9fafb] border-b border-gray-200 text-gray-600">
                    <tr>
                      <th rowSpan={2} className="px-4 py-4 font-bold text-black border-r border-gray-200 text-center w-32">Bậc thuế</th>
                      <th colSpan={2} className="px-4 py-2 font-bold text-black text-center border-r border-gray-200">Phần thu nhập tính thuế/năm (VND)</th>
                      <th colSpan={2} className="px-4 py-2 font-bold text-black text-center border-r border-gray-200">Phần thu nhập tính thuế/tháng (VND)</th>
                      <th rowSpan={2} className="px-4 py-4 font-bold text-black text-center w-40">Thuế suất (%)</th>
                    </tr>
                    <tr className="border-t border-gray-200">
                      <th className="px-4 py-2 font-bold text-center border-r border-gray-200">Trên</th>
                      <th className="px-4 py-2 font-bold text-center border-r border-gray-200">Đến</th>
                      <th className="px-4 py-2 font-bold text-center border-r border-gray-200">Trên</th>
                      <th className="px-4 py-2 font-bold text-center border-r border-gray-200">Đến</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {taxBrackets.map(bracket => (
                      <tr key={bracket.bac_thue} className="hover:bg-gray-50/50">
                        <td className="px-4 py-4 text-center border-r border-gray-200">{bracket.bac_thue}</td>
                        <td className="px-4 py-4 text-right border-r border-gray-200 text-gray-400">{bracket.tu_nam ? formatMoney(bracket.tu_nam) : '-'}</td>
                        <td className="px-4 py-4 text-right border-r border-gray-200 font-bold">{bracket.den_nam ? formatMoney(bracket.den_nam) : ''}</td>
                        <td className="px-4 py-4 text-right border-r border-gray-200 text-gray-400">{bracket.tu_thang ? formatMoney(bracket.tu_thang) : '-'}</td>
                        <td className="px-4 py-4 text-right border-r border-gray-200 font-bold">{bracket.den_thang ? formatMoney(bracket.den_thang) : ''}</td>
                        <td className="px-4 py-4 text-center font-bold">{bracket.thue_suat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bao-hiem' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { label: 'BHXH người lao động', key: 'ty_le_bhxh_nld' },
              { label: 'BHYT người lao động', key: 'ty_le_bhyt_nld' },
              { label: 'BHTN người lao động', key: 'ty_le_bhtn_nld' },
            ].map(item => (
              <div key={item.key} className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">{item.label}</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number"
                    step="0.1"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 font-bold"
                    defaultValue={settings.find(s => s.loai === item.key)?.gia_tri}
                    onBlur={(e) => {
                      const s = settings.find(s => s.loai === item.key);
                      if (s) handleUpdateSetting(s.id, Number(e.target.value));
                    }}
                  />
                  <span className="text-gray-400 text-sm font-medium">%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {saving && (
        <div className="fixed bottom-10 right-10 bg-black/80 text-white px-4 py-2 rounded-lg shadow-xl text-xs font-bold flex items-center gap-2 backdrop-blur-sm">
          <div className="w-3 h-3 border-2 border-white/20 border-t-green-500 rounded-full animate-spin"></div>
          Đang cập nhật...
        </div>
      )}
    </div>
  );
};

export default PayrollSettingsPage;
