# Dropdown Scroll Fix (Mobile / Android)

## Overview
**Goal**: Resolve the touch scrolling issue on Android where the dropdown lists (e.g., `MultiSearchableSelect` and `SearchableSelect`) are unscrollable or clipped when the virtual keyboard is active inside a modal.

**Project Type**: WEB (Mobile-First Web App)
**Agent**: `frontend-specialist`
**Root Cause**: Nested scrollable containers (`overflow-y-auto`) combined with `absolute` positioning, fixed-sized modals (`max-h-[90vh]`), and shrinking viewports (virtual keyboard on Android) cause touch tracking conflicts and clipping.

## Verification / Success Criteria
- [ ] Users on Android devices can smoothly scroll the service dropdown list even when the virtual keyboard is active.
- [ ] The dropdown component must not overlap outside screen boundaries ungracefully.
- [ ] The fix applies to both `MultiSearchableSelect` and `SearchableSelect` components.
- [ ] Desktop layout remains unchanged and visually identical to the current design.

## Proposed Architecture
We will enhance the layout of the dropdown wrapper using Tailwind CSS's responsive prefixes (`sm:`) to adopt a "Full-Screen Mobile Modal" paradigm while retaining "Absolute Dropdown" on desktop.

- **Mobile View**: The dropdown menu becomes `fixed inset-0` (full-page) on small screens. This completely breaks it out of the nested scrolling boundary, solving the touch conflict. We will add a simple "Back/Close" button next to the search input.
- **Desktop View**: Remains `sm:absolute sm:inset-auto sm:top-full`, retaining its compact "dropdown" look.

## Task Breakdown

### TASK 1: Refactor `MultiSearchableSelect` for mobile responsiveness
- **Agent**: `frontend-specialist`
- **Skill**: frontend-design
- **INPUT**: `src/components/ui/MultiSearchableSelect.tsx`
- **OUTPUT**: Updated component with responsive `fixed` vs `absolute` logic, preventing nested scroll issues.
- **VERIFY**: Open modal on mobile, tap to add service, verify it opens full-screen or as a clear bottom-sheet, and scrolls fluidly.

### TASK 2: Refactor `SearchableSelect` for mobile responsiveness
- **Agent**: `frontend-specialist`
- **Skill**: frontend-design
- **INPUT**: `src/components/ui/SearchableSelect.tsx`
- **OUTPUT**: Symmetrical responsive updates as Task 1.
- **VERIFY**: Open modal on mobile, tap "Người phụ trách", verify scrolling works gracefully.

### TASK 3: Clean up backdrop z-index alignment
- **Agent**: `frontend-specialist`
- **INPUT**: Both select components
- **OUTPUT**: Ensure `zIndex` values (`1099`, `1100`) integrate smoothly with `SalesCardFormModal` (`zIndex: 1000` context) without stacking bugs.
- **VERIFY**: No overlapping anomalies on Desktop or Mobile.

## ✅ PHASE X: Verification Checklist
- [ ] Run `python .agent/scripts/lint_runner.py .`
- [ ] Test on Android Chrome (or simulate viewport reduction + touch).
- [ ] Verify multi-selection behavior is uninterrupted.
