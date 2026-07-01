# Design Spec: Multi-Theme Support for Dashboard V2

## Overview
This design spec outlines how to implement support for Light and Dark themes, as well as automatic system theme synchronization, in Dashboard V2.

Currently, Dashboard V2 has a dark-only color palette and hardcodes the root `html` tag class to `"dark"`.

## Architecture & Data Flow

### 1. Theme Configuration & Persistence
We will introduce a `ThemeProvider` context to manage the active theme state:
- **Theme Type:** `'light' | 'dark' | 'system'`
- **Default Theme:** `'system'`
- **Persistence:** Stored in `localStorage` with the key `"jigit-ui-theme"`.
- **System Theme Syncing:** A CSS media query listener (`prefers-color-scheme: dark`) will dynamically add or remove the `.dark` class from the root `<html>` element if the theme is set to `'system'`.

### 2. Styling Enhancements (CSS Variables)
We will refactor `packages/dashboard-v2/src/styles.css` to define separate color palettes for light and dark modes:
- `:root` represents the light theme by default.
- `.dark` contains overrides for the dark theme.

#### Color Mapping Reference:
| UI Property / Token | Light Mode Value | Dark Mode Value |
| --- | --- | --- |
| `--background` | `#F8FAFC` (slate-50) | `#12151C` |
| `--surface` | `#FFFFFF` | `#1B1F29` |
| `--surface-2` | `#F1F5F9` (slate-100) | `#232836` |
| `--foreground` | `#0F172A` (slate-900) | `#EDEEF2` |
| `--muted` | `#F1F5F9` | `#232836` |
| `--muted-foreground` | `#64748B` (slate-500) | `#8B92A3` |
| `--border` | `#E2E8F0` (slate-200) | `#2A2F3B` |
| `--hairline` | `#E2E8F0` | `#2A2F3B` |
| `--input` | `#E2E8F0` | `#2A2F3B` |
| `--ring` | `#0D9488` | `#3FB6C0` |
| `--teal` | `#0D9488` | `#3FB6C0` |
| `--amber` | `#D97706` | `#E8A33D` |
| `--moss` | `#16A34A` | `#6FAE7F` |
| `--brick` | `#DC2626` | `#C2594F` |
| `--rail` | `#E2E8F0` | `#2A2F3B` |

### 3. Theme Selector UI
We will implement a theme selector component using `@/components/ui/dropdown-menu` and place it in:
- The sidebar bottom section of the desktop view (in `packages/dashboard-v2/src/components/app-shell.tsx`).
- The mobile header view in `app-shell.tsx`.

The selector will show three options:
- **System** (with laptop/monitor icon or dynamic indication)
- **Light** (with sun icon)
- **Dark** (with moon icon)

## File Changes
1. `packages/dashboard-v2/src/styles.css`
   - Split variables into `:root` and `.dark`.
2. `packages/dashboard-v2/src/components/theme-provider.tsx` (New Component)
   - Provides theme context, hook `useTheme()`, and handles updating the HTML root class element.
3. `packages/dashboard-v2/src/routes/__root.tsx`
   - Wrap the component hierarchy with `<ThemeProvider>` and remove the hardcoded `className="dark"` from `RootShell`.
4. `packages/dashboard-v2/src/components/theme-toggle.tsx` (New Component)
   - A dropdown menu selector allowing the user to select between System, Light, and Dark.
5. `packages/dashboard-v2/src/components/app-shell.tsx`
   - Integrate `ThemeToggle` into the sidebar and mobile header.

## Verification
- Verify that changing options in the theme toggle updates the root class (`.dark` present/absent).
- Verify settings are saved in `localStorage` and persist across page reloads.
- Verify system theme changes automatically apply when "System" option is chosen.
- Verify all sub-pages build successfully.
