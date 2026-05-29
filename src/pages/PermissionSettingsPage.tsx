import React, { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import {
  DEFAULT_VIEW_PERMISSIONS_BY_POSITION,
  VIEW_PERMISSION_OPTIONS,
  VIEW_PERMISSION_STORAGE_KEY,
  VIEW_PERMISSIONS_UPDATED_EVENT,
  normalizePositionKey,
  type ViewPermissionKey,
} from '../data/viewPermissions';

type PermissionMap = Record<string, ViewPermissionKey[]>;

const POSITION_OPTIONS = ['Kỹ thuật viên', 'Quản lý', 'Admin', 'Kế toán', 'Bán hàng'];

const PermissionSettingsPage: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionMap>(() => {
    try {
      const raw = localStorage.getItem(VIEW_PERMISSION_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as PermissionMap) : {};
      const merged: PermissionMap = {};
      for (const [position, views] of Object.entries(stored)) {
        merged[normalizePositionKey(position)] = views;
      }
      for (const [position, views] of Object.entries(DEFAULT_VIEW_PERMISSIONS_BY_POSITION)) {
        const key = normalizePositionKey(position);
        if (!Object.prototype.hasOwnProperty.call(merged, key)) {
          merged[key] = views;
        }
      }
      return merged;
    } catch {
      return { ...DEFAULT_VIEW_PERMISSIONS_BY_POSITION };
    }
  });

  const positions = useMemo(() => POSITION_OPTIONS, []);

  const getAllowedViews = (position: string): ViewPermissionKey[] => {
    const key = normalizePositionKey(position);
    if (permissions[key]) return permissions[key];
    return DEFAULT_VIEW_PERMISSIONS_BY_POSITION[key] || [];
  };

  const toggleView = (position: string, viewKey: ViewPermissionKey) => {
    const key = normalizePositionKey(position);
    setPermissions((prev) => {
      const current = prev[key] || [];
      const next = current.includes(viewKey)
        ? current.filter((v) => v !== viewKey)
        : [...current, viewKey];
      return { ...prev, [key]: next };
    });
  };

  const selectAllViews = (position: string) => {
    const key = normalizePositionKey(position);
    setPermissions((prev) => ({
      ...prev,
      [key]: VIEW_PERMISSION_OPTIONS.map((view) => view.key),
    }));
  };

  const clearAllViews = (position: string) => {
    const key = normalizePositionKey(position);
    setPermissions((prev) => ({
      ...prev,
      [key]: [],
    }));
  };

  const savePermissions = () => {
    const normalized: PermissionMap = {};
    for (const [position, views] of Object.entries(permissions)) {
      normalized[normalizePositionKey(position)] = views;
    }
    localStorage.setItem(VIEW_PERMISSION_STORAGE_KEY, JSON.stringify(normalized));
    setPermissions(normalized);
    window.dispatchEvent(new Event(VIEW_PERMISSIONS_UPDATED_EVENT));
    window.alert('Đã lưu phân quyền. Menu sẽ cập nhật ngay, không cần đăng xuất.');
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Cài đặt phân quyền theo vị trí</h1>
          <button
            type="button"
            onClick={savePermissions}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90"
          >
            <Save size={16} />
            Lưu
          </button>
        </div>

        <div className="space-y-6">
          {positions.map((position) => {
            const allowedViews = getAllowedViews(position);
            return (
              <div key={position} className="border border-border rounded-xl p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-foreground uppercase">{position}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllViews(position)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => clearAllViews(position)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-accent"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {VIEW_PERMISSION_OPTIONS.map((view) => (
                    <label key={view.key} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={allowedViews.includes(view.key)}
                        onChange={() => toggleView(position, view.key)}
                        className="size-4 rounded border-border text-primary"
                      />
                      {view.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PermissionSettingsPage;
