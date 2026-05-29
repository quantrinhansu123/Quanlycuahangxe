import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search } from 'lucide-react';
import { getPersonnel } from '../data/personnelData';
import { removeVietnameseTones } from '../lib/utils';
import {
  buildPermissionKey,
  DEFAULT_VIEW_PERMISSIONS_BY_POSITION,
  DEPARTMENT_OPTIONS,
  formatPermissionKeyLabel,
  isCompositePermissionKey,
  normalizeDepartmentKey,
  normalizePositionKey,
  parsePermissionKey,
  PERMISSION_KEY_SEP,
  POSITION_OPTIONS,
  VIEW_PERMISSION_OPTIONS,
  VIEW_PERMISSION_STORAGE_KEY,
  VIEW_PERMISSIONS_UPDATED_EVENT,
  type ViewPermissionKey,
} from '../data/viewPermissions';

type PermissionMap = Record<string, ViewPermissionKey[]>;

const WILDCARD_DEPARTMENT = '*';

function migrateStoredPermissions(stored: PermissionMap): PermissionMap {
  const merged: PermissionMap = {};
  for (const [rawKey, views] of Object.entries(stored)) {
    if (isCompositePermissionKey(rawKey)) {
      const { phongBan, viTri } = parsePermissionKey(rawKey);
      merged[buildPermissionKey(phongBan, viTri)] = views;
    } else {
      merged[buildPermissionKey(WILDCARD_DEPARTMENT, rawKey)] = views;
    }
  }
  for (const [position, views] of Object.entries(DEFAULT_VIEW_PERMISSIONS_BY_POSITION)) {
    const key = buildPermissionKey(WILDCARD_DEPARTMENT, position);
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = views;
    }
  }
  return merged;
}

const PermissionSettingsPage: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionMap>(() => {
    try {
      const raw = localStorage.getItem(VIEW_PERMISSION_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as PermissionMap) : {};
      return migrateStoredPermissions(stored);
    } catch {
      return migrateStoredPermissions({});
    }
  });

  const [phongBan, setPhongBan] = useState<string>(DEPARTMENT_OPTIONS[0]);
  const [viTri, setViTri] = useState<string>(POSITION_OPTIONS[0]);
  const [moduleSearch, setModuleSearch] = useState('');
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([...DEPARTMENT_OPTIONS]);
  const [positionOptions, setPositionOptions] = useState<string[]>([...POSITION_OPTIONS]);

  useEffect(() => {
    getPersonnel()
      .then((rows) => {
        const depts = new Set<string>([...DEPARTMENT_OPTIONS]);
        const positions = new Set<string>([...POSITION_OPTIONS]);
        for (const row of rows) {
          if (row.co_so?.trim()) depts.add(row.co_so.trim());
          if (row.vi_tri?.trim()) positions.add(row.vi_tri.trim());
        }
        setDepartmentOptions(Array.from(depts).sort((a, b) => a.localeCompare(b, 'vi')));
        setPositionOptions(Array.from(positions).sort((a, b) => a.localeCompare(b, 'vi')));
      })
      .catch(() => {
        /* giữ danh sách mặc định */
      });
  }, []);

  const activeKey = useMemo(
    () => buildPermissionKey(phongBan, viTri),
    [phongBan, viTri]
  );

  const configuredKeys = useMemo(
    () =>
      Object.keys(permissions).sort((a, b) =>
        formatPermissionKeyLabel(a).localeCompare(formatPermissionKeyLabel(b), 'vi')
      ),
    [permissions]
  );

  const filteredViewOptions = useMemo(() => {
    const q = removeVietnameseTones(moduleSearch.trim());
    if (!q) return VIEW_PERMISSION_OPTIONS;
    return VIEW_PERMISSION_OPTIONS.filter(
      (view) =>
        removeVietnameseTones(view.label).includes(q) ||
        removeVietnameseTones(view.key).includes(q)
    );
  }, [moduleSearch]);

  const getAllowedViews = (key: string): ViewPermissionKey[] => {
    if (permissions[key]) return permissions[key];
    const { viTri: pos } = parsePermissionKey(key);
    return DEFAULT_VIEW_PERMISSIONS_BY_POSITION[pos] || [];
  };

  const allowedViews = getAllowedViews(activeKey);

  const setViewsForActiveKey = (views: ViewPermissionKey[]) => {
    setPermissions((prev) => ({ ...prev, [activeKey]: views }));
  };

  const toggleView = (viewKey: ViewPermissionKey) => {
    const current = permissions[activeKey] || [];
    const next = current.includes(viewKey)
      ? current.filter((v) => v !== viewKey)
      : [...current, viewKey];
    setViewsForActiveKey(next);
  };

  const selectAllViews = () => {
    setViewsForActiveKey(VIEW_PERMISSION_OPTIONS.map((view) => view.key));
  };

  const clearAllViews = () => {
    setViewsForActiveKey([]);
  };

  const savePermissions = () => {
    const normalized: PermissionMap = {};
    for (const [key, views] of Object.entries(permissions)) {
      if (isCompositePermissionKey(key)) {
        const { phongBan: dept, viTri: pos } = parsePermissionKey(key);
        normalized[buildPermissionKey(dept, pos)] = views;
      } else {
        normalized[buildPermissionKey(WILDCARD_DEPARTMENT, key)] = views;
      }
    }
    localStorage.setItem(VIEW_PERMISSION_STORAGE_KEY, JSON.stringify(normalized));
    setPermissions(normalized);
    window.dispatchEvent(new Event(VIEW_PERMISSIONS_UPDATED_EVENT));
    window.alert('Đã lưu phân quyền. Menu sẽ cập nhật ngay, không cần đăng xuất.');
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Cài đặt phân quyền</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Chọn phòng ban + vị trí, sau đó tick các view được phép xem.
            </p>
          </div>
          <button
            type="button"
            onClick={savePermissions}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90"
          >
            <Save size={16} />
            Lưu
          </button>
        </div>

        {/* Bộ lọc: Phòng ban + Vị trí + tìm module */}
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/40 p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Phòng ban
              </label>
              <select
                value={phongBan}
                onChange={(e) => setPhongBan(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium"
              >
                <option value={WILDCARD_DEPARTMENT}>Tất cả phòng ban</option>
                {departmentOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Vị trí
              </label>
              <select
                value={viTri}
                onChange={(e) => setViTri(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium"
              >
                {positionOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-1">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Tìm module / phân hệ
              </label>
              <input
                type="text"
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                placeholder="Khách hàng, Đơn hàng, Kho..."
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setModuleSearch(moduleSearch.trim())}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm"
              >
                <Search size={16} />
                Tìm kiếm
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground font-mono">
            Key: <span className="text-foreground font-semibold">{activeKey}</span>
            <span className="mx-2 opacity-40">·</span>
            {formatPermissionKeyLabel(activeKey)}
          </p>
        </div>

        {/* Nhóm đã cấu hình */}
        {configuredKeys.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {configuredKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const { phongBan: dept, viTri: pos } = parsePermissionKey(key);
                  if (dept !== '*') {
                    const match = departmentOptions.find(
                      (d) => normalizeDepartmentKey(d) === dept
                    );
                    if (match) setPhongBan(match);
                  }
                  const posMatch = positionOptions.find(
                    (p) => normalizePositionKey(p) === normalizePositionKey(pos)
                  );
                  if (posMatch) setViTri(posMatch);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  key === activeKey
                    ? 'bg-primary text-white border-primary'
                    : 'bg-muted/50 text-foreground border-border hover:border-primary/40'
                }`}
              >
                {formatPermissionKeyLabel(key)}
              </button>
            ))}
          </div>
        )}

        {/* View được phép */}
        <div className="border border-border rounded-xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground uppercase">
              View được xem — {formatPermissionKeyLabel(activeKey)}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllViews}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-accent"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={clearAllViews}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-accent"
              >
                Bỏ chọn tất cả
              </button>
            </div>
          </div>

          {filteredViewOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Không có module khớp &quot;{moduleSearch}&quot;.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredViewOptions.map((view) => (
                <label
                  key={view.key}
                  className="flex items-center gap-2 text-sm text-foreground rounded-lg px-2 py-1.5 hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={allowedViews.includes(view.key)}
                    onChange={() => toggleView(view.key)}
                    className="size-4 rounded border-border text-primary"
                  />
                  {view.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Key lưu dạng{' '}
          <code className="font-mono bg-muted px-1 rounded">
            phòng_ban{PERMISSION_KEY_SEP}vị_trí
          </code>
          . Quyền cũ chỉ theo vị trí được chuyển thành &quot;Tất cả phòng ban&quot; (
          <code className="font-mono">*{PERMISSION_KEY_SEP}…</code>).
        </p>
      </div>
    </div>
  );
};

export default PermissionSettingsPage;
