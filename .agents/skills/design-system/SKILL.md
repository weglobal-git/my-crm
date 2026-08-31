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
The product design emphasizes a flat, ultra-clean, minimalist aesthetic. Depth is communicated through structural layout, subtle borders, and whitespace, NOT through shadows.

## Standard Practices
- **Borders over Shadows:** When you need separation, use subtle borders: `border-[#1C1C1D]` or `border-[#4E4F50]` (in Dark Mode).
- **Rounded Corners:** Continue to use generous rounded corners (`rounded-full`, `rounded-2xl`, `rounded-[2rem]`) for a soft, modern feel.

## 🌙 Dark Theme Palette & Conventions

The CRM is migrating to a custom Dark Theme. Use the following specific color mappings and Tailwind classes for all UI elements:

### 1. Backgrounds & Borders
- **App/Page Background**: `bg-[#252728]`
- **Cards, Panels, Modals, Message Bubbles, Searchboxes**: `bg-[#3A3B3C]`
- **Sub-elements (Avatars, inner containers, hover states)**: `bg-[#4E4F50]`
- **Major Layout Borders (Sidebars, Headers)**: `border-[#1C1C1D]`
- **Component Borders (Cards, Panels)**: `border-[#4E4F50]`

### 2. Accent & Interactive Elements
- **Primary Accent/Active State**: Lime Green `#C7F33C` (e.g., `bg-[#C7F33C] text-black`, `border-[#C7F33C]`).
- **Primary Hover**: `hover:bg-[#b0d635]`
- **Destructive/Danger**: `bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50`
- **Icon Buttons (default)**: `text-slate-400 hover:text-slate-200 hover:bg-[#4E4F50]`

### 3. Typography
- **Primary Text (Headers, Titles)**: `text-slate-100`
- **Secondary Text (Body, Descriptions)**: `text-slate-300`
- **Muted Text (Timestamps, placeholders, inactive icons)**: `text-slate-400` or `text-slate-500`
- **Active Text (on Accent)**: `text-black`

### 4. Input Fields & Search Boxes
- **Searchbox/Inputs**: `bg-[#3A3B3C] border border-transparent text-slate-200 placeholder-slate-500`
- **Input Focus State**: `focus:outline-none focus:border-[#C7F33C] focus:bg-[#3A3B3C]` or `focus-within:border-[#C7F33C]`

### 5. Miscellaneous
- Always favor flat colors. No gradients unless explicitly requested.
- Maintain adequate padding (`p-4`, `p-6`) to let the flat UI breathe.
