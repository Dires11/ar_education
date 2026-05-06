# Site-wide Form Responsiveness & Compaction

**Date:** 2026-05-06  
**Status:** Approved

## Problem

Several forms across the app have two related issues:

1. **Excessive vertical spacing** — fields are spread far apart (gap-6, space-y-6), making forms feel loose and requiring unnecessary scrolling. This affects enrollment, tutor, and student forms most visibly.
2. **Non-responsive grid layouts** — many forms use `grid grid-cols-2` or `grid grid-cols-3` without mobile breakpoints, causing fields to become extremely narrow or overflow on small screens. The schedule session form is the worst offender with 5+ such layouts.

## Goals

- Make all forms compact but not cramped
- Prevent layout shift when validation errors appear
- Ensure all forms are usable on mobile (≥ 320px) without overflow or broken columns
- No new abstractions — surgical class changes only

## Design

### 1. Global FormMessage fix

**File:** `components/ui/form.tsx`

Add `min-h-[1.25rem]` to the `FormMessage` component. Shadcn's `FormMessage` renders `null` when there is no error, causing layout shift when errors appear. This reserves one line of space (20px at `text-sm`) everywhere error messages can appear, solving the problem globally in a single edit.

### 2. Spacing compaction

Replace oversized vertical gaps with tighter values across all affected forms:

| Current | Replacement | Use case |
|---------|------------|---------|
| `gap-6` | `gap-4` | Between form fields in a `<div className="space-y-*">` or grid |
| `space-y-6` | `space-y-4` | Field stacks |
| `gap-4` (in grid rows) | `gap-3` | Horizontal gap within a row grid |

The result is a denser, more professional layout that still has enough breathing room between fields.

### 3. Responsive grid fixes

Every `grid grid-cols-N` without a mobile breakpoint gets the pattern:

```
grid grid-cols-1 sm:grid-cols-N
```

On mobile (< 640px), fields stack vertically. On sm+ they resume side-by-side. Specific instances:

| File | Current | Fixed |
|------|---------|-------|
| `tutor-form.tsx` | `grid grid-cols-2 gap-4` (×2) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `tutor-form.tsx` | `grid grid-cols-3 gap-2` | `grid grid-cols-1 sm:grid-cols-3 gap-2` |
| `tutor-edit-form.tsx` | same as above (×3) | same fixes |
| `student-form.tsx` | `grid grid-cols-2 gap-2` (progress bar) | `grid grid-cols-1 sm:grid-cols-2 gap-2` |
| `new-session-form.tsx` | `grid grid-cols-3 gap-3` (date/time/duration) | `grid grid-cols-1 sm:grid-cols-3 gap-3` |
| `new-session-form.tsx` | `grid grid-cols-2 gap-3` (tutor/subject) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `new-session-form.tsx` | `grid grid-cols-2 gap-3` (duration/room) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `new-session-form.tsx` | `grid grid-cols-2 gap-x-3 gap-y-1.5` (per-day times) | `grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5` |
| `new-session-form.tsx` | `grid grid-cols-2 gap-3` (start/end dates) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `edit-session-dialog.tsx` | `grid grid-cols-2 gap-3` (×2) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `edit-recurring-group-dialog.tsx` | `grid grid-cols-[1fr_1fr] gap-2` | `grid grid-cols-1 sm:grid-cols-2 gap-2` |
| `new-payment-form.tsx` | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-3` |
| `new-enrollment-form.tsx` | `grid grid-cols-2 gap-4` (start/end dates) | `grid grid-cols-1 sm:grid-cols-2 gap-3` |

### 4. Dialog width fixes

Dialogs with `max-w-*` without a `sm:` prefix span full screen width on mobile instead of being properly contained. Fix by adding the `sm:` prefix so the constraint only applies at tablet+:

| File | Current | Fixed |
|------|---------|-------|
| `new-enrollment-dialog.tsx` | `max-w-xl` | `sm:max-w-xl` |
| `new-tutor-dialog.tsx` | `max-w-lg` | `sm:max-w-lg` |
| `edit-tutor-dialog.tsx` | `max-w-lg` | `sm:max-w-lg` |
| `new-payment-dialog.tsx` | `max-w-xl` | `sm:max-w-xl` |

## Files to Change (13 total)

1. `components/ui/form.tsx`
2. `app/(protected)/enrollments/components/new-enrollment-form.tsx`
3. `app/(protected)/enrollments/components/new-enrollment-dialog.tsx`
4. `app/(protected)/tutors/components/tutor-form.tsx`
5. `app/(protected)/tutors/components/tutor-edit-form.tsx`
6. `app/(protected)/tutors/components/new-tutor-dialog.tsx`
7. `app/(protected)/tutors/components/edit-tutor-dialog.tsx`
8. `app/(protected)/students/components/student-form.tsx`
9. `app/(protected)/schedule/components/new-session-form.tsx`
10. `app/(protected)/schedule/components/edit-session-dialog.tsx`
11. `app/(protected)/schedule/components/edit-recurring-group-dialog.tsx`
12. `app/(protected)/payments/components/new-payment-form.tsx`
13. `app/(protected)/payments/components/new-payment-dialog.tsx`

## Out of Scope

- Forms already using `sm:` breakpoints consistently (package-form, student-edit-form, mark-paid-dialog, email form)
- Navigation/sidebar layout
- Table/list responsiveness
- New component abstractions
