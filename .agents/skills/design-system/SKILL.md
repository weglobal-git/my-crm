---
name: design-system
description: UI Design System guidelines for the CRM app. Use this skill whenever you are designing UI components, adding new styling, or modifying existing layouts.
---

# UI Design System: Global Rules

This document outlines the strict UI design system and guidelines for this CRM application.

## 🚫 CRITICAL RULE: NO SHADOWS
**Under NO circumstances should you add shadows to any UI element.** 
- Do not use Tailwind shadow classes (e.g., `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `shadow-inner`, `shadow-none`, `shadow-[...]`).
- Do not use custom CSS `box-shadow` properties.
- Do not use drop-shadow filters (e.g., `drop-shadow-md`).

This applies to ALL components, including:
- Modals and Dialogs
- Floating menus (Dropdowns, Popovers)
- Cards and Containers
- Buttons and Inputs
- Sticky Headers and Sidebars

### Why?
The product design emphasizes a flat, ultra-clean, minimalist aesthetic. Depth is communicated through structural layout, subtle borders (`border border-slate-100` or `border-slate-200`), and whitespace, NOT through shadows.

## Standard Practices
- **Borders over Shadows:** When you need separation, use subtle borders: `border border-slate-100` or `border-slate-200`.
- **Rounded Corners:** Continue to use generous rounded corners (`rounded-full`, `rounded-2xl`, `rounded-[2rem]`) for a soft, modern feel.
- **Background Contrast:** Use slightly off-white backgrounds (e.g., `bg-slate-50`) to differentiate overlapping white surfaces, instead of relying on shadows to create depth.
