---
name: menu-permissions
description: Comprehensive guide to the Department-Based Menu Permission System (v2). Use this when adding new menus, modifying access control, or creating new system tools.
---

# Department-Based Menu Permission System

The system uses a 3-level hierarchical menu structure governed by a Many-to-Many relationship between Users and Departments, with explicit Menu Item permissions assigned to each Department.

## Key Concepts

1. **Hierarchy Levels**:
    - **MAIN MENU (Level 1)**: Represent Functional Domains (e.g., Sales & Operations, Marketing, Service & Support). Rendered in `Sidebar.tsx`.
    - **SUB-MENU (Level 2)**: Represent tools (e.g., Pipeline, Quotations). These are strictly bound to a single Main Menu via `parentKey`. They are displayed in `Header.tsx` as pills and are dynamically re-orderable via a drag-and-drop UI.
    - **RIGHT-MENU (Level 3)**: Represent specific features within a tool (e.g., Activity Log, Information in Pipeline). These are bound to a parent Sub-Menu (`parentKey`). Rendered as tabs in components like `EditDealPanel.tsx`.

2. **Many-to-Many Departments**:
    - A `User` can belong to multiple `Department`s.
    - The menus a user can see is the UNION of all permissions granted to all of their assigned departments.
    - ADMIN users automatically see everything.

3. **Menu Registry & Database Strategy**:
    - `src/lib/menu-registry.ts` is the source of truth ONLY for initial seeding and declaring UI elements (labels, icons).
    - **Database is the source of truth for structure**. Because Admins can drag and drop Sub-Menus across Main Menus, `syncMenuRegistry()` will NEVER overwrite `parentKey` or `sortOrder` for existing Sub-Menus (Level 2).
    - When adding new Sub-Menus to `MENU_REGISTRY`, give them a logical initial `parentKey` (e.g., `sales_ops`).

## How to add a new menu or tool

1. **Add to Registry**:
   Open `src/lib/menu-registry.ts` and add a new entry to `MENU_REGISTRY`:
   ```typescript
   { key: "marketing.campaigns", label: "Campaigns", level: 3, parentKey: "marketing_tools", iconName: "Target", sortOrder: 5 }
   ```
   *Note: Ensure the `iconName` exists in `IconMap` at the bottom of the registry file.*

2. **Sync Database**:
   - Go to the System Settings page (`/system`) and click "Sync Menus" to push the new registry item to the database.

3. **Grant Permissions**:
   - In the Permission Matrix on the System Settings page, check the box for the departments that should have access.
   - Note: The matrix auto-checks parents when a child is checked, and auto-unchecks children when a parent is unchecked.

4. **Implement UI**:
   - Use the `usePermissions()` hook in your client components to check access:
   ```tsx
   const { canSee, visibleRightMenus } = usePermissions();
   
   // Check specific access
   if (!canSee('marketing.campaigns')) return null;
   
   // Render dynamic tabs
   const tabs = visibleRightMenus('marketing_tools');
   ```

## Routing & Middleware

- `src/middleware.ts` ensures that users cannot access CRM pages (`/pipeline`, etc.) unless they have at least one department assigned or are an ADMIN.
- Individual component/page rendering uses `usePermissions()` (client-side) to hide restricted data.

## Server Actions (`src/lib/actions/permission.ts`)

- `syncMenuRegistry()`: Reconciles the static registry with the database.
- `updatePermission()`: Toggles permission for a department and automatically handles subset checking (enforcing parent/child dependency).
- `getUserVisibleMenuKeys()`: Resolves the union of permissions for a specific user across all their departments.
