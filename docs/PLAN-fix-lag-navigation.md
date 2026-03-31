# PLAN: Fix Lag & Navigation Issues on Vercel

## Vấn đề
Trang Phiếu Bán Hàng bị **lag khi thao tác** và **không hiện dữ liệu khi bấm "Quay lại" rồi vào lại** — phải reload trang mới thấy. Vấn đề xảy ra trên Vercel deploy.

---

## Phân tích Nguyên nhân gốc (Root Cause Analysis)

### 🔴 Nguyên nhân 1: `loadData` bị stale closure
```typescript
// Hiện tại — dòng 55-74
const loadData = async () => {
  setLoading(true); // ← Gây re-render toàn bộ 825 dòng
  const [cardsResult, custData, persData, servData] = await Promise.all([
    getSalesCardsPaginated(currentPage, pageSize, searchQuery),
    customers.length === 0 ? getCustomers() : Promise.resolve(customers), // ← BUG
    ...
  ]);
};
```
**Vấn đề:** `loadData` đọc `currentPage`, `pageSize`, `searchQuery` qua closure nhưng **không có trong dependency list** của `useEffect`. Khi navigate đi và quay lại, component remount với state mới nhưng `loadData` vẫn giữ giá trị cũ.

### 🔴 Nguyên nhân 2: Conditional data fetching bị lỗi logic
```typescript
customers.length === 0 ? getCustomers() : Promise.resolve(customers)
```
Khi component **unmount** (navigate đi) rồi **remount** (quay lại), `customers` state reset về `[]` (length === 0), nhưng `loadData` có thể chạy trước khi state đã reset xong → dữ liệu cũ không được fetch lại.

### 🟡 Nguyên nhân 3: Không có `useCallback` trên `loadData`
Mỗi lần render, `loadData` được tạo mới → `useEffect` không nhận diện đúng dependency → có thể skip hoặc chạy thừa.

### 🟡 Nguyên nhân 4: File 825 dòng monolithic
Toàn bộ logic (state, data fetching, modal, form, table) nằm trong 1 file duy nhất → re-render nặng mỗi khi bất kỳ state nào thay đổi.

---

## Giải pháp đề xuất

### Phase 1: Fix Critical — Data Loading (Ưu tiên cao nhất)

#### T1.1: Refactor `loadData` với `useCallback`
Wrap `loadData` trong `useCallback` với đầy đủ dependencies để tránh stale closure.

#### T1.2: Fix useEffect dependencies
```typescript
// Trước
useEffect(() => { loadData(); }, [currentPage, pageSize]);

// Sau
useEffect(() => { loadData(); }, [loadData]); // loadData đã có deps đúng
```

#### T1.3: Bỏ conditional fetching cho reference data
Luôn fetch `customers`, `personnel`, `services` khi component mount — chúng nhẹ (vài KB) và đảm bảo dữ liệu luôn fresh.

---

### Phase 2: Fix Navigation — Đảm bảo data load khi quay lại

#### T2.1: Thêm event listener cho `popstate` hoặc dùng `useEffect` cleanup
Khi user bấm "Quay lại" (browser back), React Router remount component nhưng `useEffect` có thể không fire nếu deps không đổi.

**Giải pháp:** Dùng một `key` hoặc `location` từ React Router để force re-fetch:
```typescript
const location = useLocation();
useEffect(() => { loadData(); }, [location.pathname]);
```

---

### Phase 3: Performance — Giảm Lag

#### T3.1: Tách `SalesCardFormModal` ra file riêng
Hiện tại modal nằm cùng file 825 dòng. Tách ra giúp React chỉ re-render modal khi cần.

#### T3.2: Dùng `useMemo` cho `displayItems`
```typescript
const displayItems = useMemo(() => salesCards, [salesCards]);
```

#### T3.3: Dùng `useTransition` cho search
```typescript
const [isPending, startTransition] = useTransition();
// Trong search onChange:
startTransition(() => setSearchQuery(value));
```

---

## Task Breakdown

| Task | Mô tả | Priority | Effort |
|------|--------|----------|--------|
| T1.1 | `useCallback` cho `loadData` | P0 | 5 min |
| T1.2 | Fix `useEffect` dependencies | P0 | 3 min |
| T1.3 | Bỏ conditional fetch reference data | P0 | 3 min |
| T2.1 | Thêm `location` dependency để force refetch | P0 | 5 min |
| T3.1 | Tách `SalesCardFormModal` ra file riêng | P1 | 15 min |
| T3.2 | `useMemo` cho display items | P2 | 2 min |
| T3.3 | `useTransition` cho search | P2 | 5 min |

---

## Agent Assignment

| Agent | Tasks |
|-------|-------|
| `frontend-specialist` | T1.1, T1.2, T1.3, T2.1, T3.2, T3.3 |
| `frontend-specialist` | T3.1 (refactor modal) |

---

## ✅ PHASE X: VERIFICATION

- [ ] `npm run build` — không lỗi TypeScript
- [ ] Mở trang Phiếu Bán Hàng → dữ liệu hiện ngay lập tức
- [ ] Navigate đi trang khác → bấm "Quay lại" → dữ liệu vẫn hiện (KHÔNG cần reload)
- [ ] Tìm kiếm khách hàng → kết quả hiện mượt, không lag
- [ ] Mở modal lập phiếu → thao tác nhanh, không delay
- [ ] Deploy lên Vercel → test lại tất cả các bước trên
