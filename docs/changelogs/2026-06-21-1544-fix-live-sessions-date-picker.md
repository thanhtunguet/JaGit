# Fix Live Sessions Date Picker

- Fixed an issue where the native date picker calendar icon was invisible in dark mode by adding `color-scheme: dark` to the `.dark` class in `index.css`.
- Fixed a bug where typing the year manually in the date fields on the Live Sessions page would reset the input. The `SessionsFilters` component now uses uncontrolled `defaultValue` and a `ref` to sync state without breaking native typing behavior.

## Files Touched
- `packages/dashboard/src/index.css`
- `packages/dashboard/src/components/sessions/SessionsFilters.tsx`
