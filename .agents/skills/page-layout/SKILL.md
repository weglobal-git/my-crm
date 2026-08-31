---
name: page-layout-structure
description: Standards and guidelines for the unified 2-section page layout structure in the CRM application (MAIN-NAVBAR, WORKSPACE).
---

# Page Layout Structure Guidelines

To maintain a consistent and professional user experience across the CRM application, **every page must strictly adhere to a 2-section vertical layout structure**. Agents generating or refactoring pages MUST follow these guidelines.

## Layout Overview

The layout is divided vertically into two distinct sections:

### 1. MAIN-NAVBAR (Global System Navbar)

This is the top-most navigation bar. It is divided into two columns:

- **Left Main Navbar (Quick Navigation)**:
  - Displays the current **Main Menu** name.
  - Followed by **Pills** for all the sub-menus the user has access to under that main menu (e.g., `Sales & Operations | [Pipeline] [Quotation] [Customers]`).
  - Clicking a pill navigates to that sub-menu instantly.
- **Right Main Navbar (Global Tools)**:
  - **Search Box**: A global search input for the CRM.
  - View Online Users (Active Users indicator)
  - Notification Bell
  - User Profile Menu
  - Chat (Reserved for future implementation)

### 2. WORK SPACE (Main Content Area)

This is the primary area below the Main-Navbar where the actual application content is rendered (e.g., Kanban boards, Data Tables, Permission Matrices, Dashboards).

- **Constraints**:
  - Must handle its own scrolling (e.g., `overflow-y-auto hide-scrollbar`).
  - Should span the remaining height of the screen to maximize usable area.
  - Must adhere to the strict no-shadow, flat design rules unless explicitly excepted.
- **Page-Specific Tools**: Any controls specific to the page (e.g., "Save Changes" buttons, "Add Widget" buttons, table horizontal scroll arrows) MUST be placed inside the Work Space, typically in a toolbar right above the main content (e.g., above a table or grid). Do NOT place them in the Main-Navbar.

---

## Example Implementation Skeleton

When building a new page or layout wrapper, use the following structural pattern:

```tsx
export default function StandardPageLayout({ children }) {
  return (
    <div className="flex flex-col w-full h-full bg-[#E5E5E5]">
      {/* 1. MAIN-NAVBAR (Usually implemented in ClientShell / Header.tsx) */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-800">
            Sales & Operations
          </span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <Link
              href="/pipeline"
              className="px-3 py-1.5 rounded-full bg-black text-white text-sm font-medium"
            >
              Pipeline
            </Link>
            <Link
              href="/quotations"
              className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-medium transition-colors"
            >
              Quotation
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center w-full max-w-sm bg-white rounded-full p-1.5 pl-4 border border-slate-200 focus-within:border-[#007aff] transition-all shadow-sm">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-slate-400"
            />
          </div>
          {/* Online Users, Notifications, Profile */}
        </div>
      </header>

      {/* 2. WORK SPACE */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-6">
        {/* Page-specific toolbar goes here, NOT in the navbar */}
        <div className="flex justify-end mb-4">
          <button className="btn-primary">Save Changes</button>
        </div>

        {/* Main page content goes here */}
        {children}
      </main>
    </div>
  );
}
```

## CSS/Styling Rules

- **Spacing**: Maintain consistent padding (e.g., `px-6` or `px-8`) on the left and right edges across both sections so they align perfectly vertically.
- **Scrollbars**: Use `.hide-scrollbar` on the Work Space container to maintain a clean UI without default browser scrollbars.
- **Separation**: Use a subtle bottom border (`border-b border-slate-200`) on the Main Navbar.
