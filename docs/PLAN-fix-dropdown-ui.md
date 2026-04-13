# PLAN-fix-dropdown-ui

Fix the stacking order (z-index) and potential clipping issues for filter dropdowns in the /ban-hang/khach-hang module.

## Context Check
- **Issue**: The dropdown for "Chi nhánh" (Branch) and likely "Chu kỳ" (Cycle) is being rendered behind the data table or clipped by parent container boundaries.
- **Cause**: The toolbar container (`div` surrounding the filters) lacks a defined stacking context (`relative z-index`), allowing subsequent DOM elements with their own positioning (like the table) to overlap the dropdowns.

## Phase 0: Socratic Gate (Completed)
- **Clarification**: User provided a screenshot confirming the dropdown is partially hidden/submerged.
- **Scope**: Fix is required for all dropdowns in the toolbar of `CustomerManagementPage.tsx`.

## Proposed Changes

### [Frontend Component]

#### [MODIFY] [CustomerManagementPage.tsx](file:///c:/Users/dungv\quan_ly_cua_hang_xe\src\pages\CustomerManagementPage.tsx)
- **Toolbar Overlay**: Add `relative z-20` (or higher) to the main toolbar container to ensure it sits above the table.
- **Dropdown Position**: Review `absolute` positioning to ensure it doesn't get clipped by potential `overflow-hidden` on the page body or main wrapper.
- **Responsive Check**: Ensure the dropdown doesn't overflow the screen width on mobile devices.

## Verification Plan

### Manual Verification
1. Open /ban-hang/khach-hang in a browser.
2. Click the "Chi nhánh" dropdown.
3. Verify the menu is fully visible and sits on top of the table headers and rows.
4. Repeat for the "Chu kỳ" dropdown.
5. Test on both Desktop and Mobile viewports.
