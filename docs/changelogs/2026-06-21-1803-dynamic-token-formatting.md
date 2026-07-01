# Dynamic Token Formatting Precision

## Task
Update the token formatting rule (used for `k, M, B` suffixes) to dynamically adjust the number of decimal digits based on the length of the integer part.

## Changes
- **Token Formatter**: Updated `formatTokens` in `packages/dashboard/src/lib/utils.ts` to inspect the integer part length of the abbreviated value:
  - Default: max 3 decimal digits.
  - If integer part has 2 digits (e.g., `12.34k`): rounds to max 2 decimal digits.
  - If integer part has 3 or more digits (e.g., `123.4k`): rounds to max 1 decimal digit.
- Since `formatTokens` was previously consolidated into a shared helper, this change automatically propagates to all widgets using it, including the Live Sessions summary cards and the Dashboard Overview AI Usage widget.
