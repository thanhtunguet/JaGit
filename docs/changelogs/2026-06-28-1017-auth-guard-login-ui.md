# Implement Premium Login UI for Dashboard V2

**Date:** 2026-06-28 10:17
**Task:** Implement a login UI so that user enters the API token and saves it to local storage for further authentication across frontend pages.

## Summary of Changes

1. **Created `<AuthGuard>` Component (`packages/dashboard-v2/src/components/auth-guard.tsx`)**
   - Built a sleek, glassmorphic security gateway card with dark mode styling, radial glow accents, and responsive layout.
   - Checked `getStoredToken()` on initialization. If empty or invalid, blocks child routes and presents password/text input for the Dashboard API token.
   - Listens to global window events (`jigit:auth-unauthorized` and `jigit:auth-updated`) for reactive UI transitions without page reloading.
   - Saves token to `localStorage` via `storage.setItem("DASHBOARD_API_TOKEN", token)` and invalidates TanStack React Query cache upon successful submission.

2. **Wired Application Root (`packages/dashboard-v2/src/routes/__root.tsx`)**
   - Wrapped the root `<Outlet />` component in `<AuthGuard>` inside `QueryClientProvider`, ensuring all frontend routes enforce authentication.

3. **Enhanced API Client (`packages/dashboard-v2/src/lib/api.ts`)**
   - Added automatic dispatch of `window.dispatchEvent(new CustomEvent("jigit:auth-unauthorized"))` when HTTP 401 status responses occur.
   - Exported token management helpers `getStoredToken()`, `setStoredToken()`, and `removeStoredToken()`.

4. **Added Sidebar Logout Control (`packages/dashboard-v2/src/components/app-shell.tsx`)**
   - Added a Lock icon button in the sidebar footer allowing users to lock their session or clear the stored API token at any time.

5. **SSR & Hydration Compatibility (`storage.ts` & `auth-guard.tsx`)**
   - Added safety guards (`typeof localStorage === "undefined"`) inside `LocalStorageDriver` to ensure Server-Side Rendering (SSR) in Vite / TanStack Start does not crash with `ReferenceError: localStorage is not defined`.
   - Deferred reading local storage in `<AuthGuard>` until component mount (`useEffect`) while returning a matching blank background during initial render to completely eliminate SSR vs Client React hydration mismatch errors.

6. **Test Coverage**
   - Added comprehensive unit test suite in `packages/dashboard-v2/src/components/auth-guard.test.tsx` verifying render states, form submission, validation error messages, and custom event transitions.
   - Added unit tests for token helpers and event dispatching in `api.test.ts`.
   - Verified 40/40 tests passing in `dashboard-v2` and 147/147 tests passing across the entire monorepo.
