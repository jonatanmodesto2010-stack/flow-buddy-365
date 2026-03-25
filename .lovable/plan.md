

## Problem

The connection status badge (`[7m] ✕ OFF`) is not vertically aligned with the overdue days badge (`38d ATRASO`) and the timeline button on the client card. The badges have inconsistent heights and vertical alignment.

## Root Cause

In `src/pages/Clients.tsx` (lines 609-614), the connection badge uses `px-2.5 py-1 text-xs rounded-full` making it a small pill shape, while `OverdueBadge` uses `rounded-lg min-w-[48px]` with larger padding — creating a height mismatch. The parent flex container in `ClientCard` uses `items-center` but the differing heights cause visual misalignment.

## Fix

**File: `src/pages/Clients.tsx`**

Adjust the online/offline connection badges to match the height and style of the `OverdueBadge`:

1. Change the connection badge layout from a horizontal pill (`rounded-full px-2.5 py-1`) to a vertical stacked layout matching `OverdueBadge` — using `flex-col items-center rounded-lg min-w-[48px]` with the duration on top and ON/OFF label below.

This gives both badges consistent dimensions and the flex container aligns them properly.

```text
Current (pill):    [7m] ✕ OFF
Proposed (block):  [7m]
                    OFF
```

## Scope
- 1 file changed: `src/pages/Clients.tsx` (lines 601-614)
- Adjust both the online (green) and offline (red) badge markup

