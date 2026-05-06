# Responsive Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all forms compact and responsive across the AR Education CRM by adding mobile-first grid breakpoints and tightening vertical spacing.

**Architecture:** Pure CSS class changes — no new components, no logic changes. Each task targets one or two files with exact before/after class strings. The `FormMessage` component already has `min-h-5` and renders an invisible placeholder, so layout shift on validation errors is already handled globally.

**Tech Stack:** Next.js App Router, TailwindCSS, shadcn/ui

---

## File Map

| File | Change type |
|------|------------|
| `app/(protected)/enrollments/components/new-enrollment-dialog.tsx` | Dialog width fix |
| `app/(protected)/enrollments/components/new-enrollment-form.tsx` | Spacing + responsive dates grid |
| `app/(protected)/tutors/components/new-tutor-dialog.tsx` | Dialog width fix |
| `app/(protected)/tutors/components/edit-tutor-dialog.tsx` | Dialog width fix |
| `app/(protected)/tutors/components/tutor-form.tsx` | Responsive grids (3 grids) |
| `app/(protected)/tutors/components/tutor-edit-form.tsx` | Responsive grids (2 grids) |
| `app/(protected)/schedule/components/new-session-form.tsx` | Responsive grids (5 grids) |
| `app/(protected)/schedule/components/edit-session-dialog.tsx` | Responsive grids (2 grids) |
| `app/(protected)/schedule/components/edit-recurring-group-dialog.tsx` | Responsive grids (2 grids) |
| `app/(protected)/payments/components/new-payment-dialog.tsx` | Dialog width fix |
| `app/(protected)/payments/components/new-payment-form.tsx` | Responsive grid |

---

## Task 1: Fix dialog width classes

**Files:**
- Modify: `app/(protected)/enrollments/components/new-enrollment-dialog.tsx:59`
- Modify: `app/(protected)/tutors/components/new-tutor-dialog.tsx:30`
- Modify: `app/(protected)/tutors/components/edit-tutor-dialog.tsx:35`
- Modify: `app/(protected)/payments/components/new-payment-dialog.tsx:39`

Dialogs with `max-w-*` without a `sm:` prefix become full viewport width on mobile. Adding `sm:` means the constraint applies at ≥640px; on smaller screens the dialog is full width (handled by shadcn's default sheet behaviour).

- [ ] **Step 1: Fix new-enrollment-dialog**

In `app/(protected)/enrollments/components/new-enrollment-dialog.tsx` line 59, change:
```tsx
<DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
```
to:
```tsx
<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 2: Fix new-tutor-dialog**

In `app/(protected)/tutors/components/new-tutor-dialog.tsx` line 30, change:
```tsx
<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
```
to:
```tsx
<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 3: Fix edit-tutor-dialog**

In `app/(protected)/tutors/components/edit-tutor-dialog.tsx` line 35, change:
```tsx
<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
```
to:
```tsx
<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 4: Fix new-payment-dialog**

In `app/(protected)/payments/components/new-payment-dialog.tsx` line 39, change:
```tsx
<DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
```
to:
```tsx
<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
```

- [ ] **Step 5: Commit**

```bash
git add app/\(protected\)/enrollments/components/new-enrollment-dialog.tsx \
        app/\(protected\)/tutors/components/new-tutor-dialog.tsx \
        app/\(protected\)/tutors/components/edit-tutor-dialog.tsx \
        app/\(protected\)/payments/components/new-payment-dialog.tsx
git commit -m "fix: add sm: prefix to dialog max-width classes for mobile"
```

---

## Task 2: Fix enrollment form layout

**Files:**
- Modify: `app/(protected)/enrollments/components/new-enrollment-form.tsx`

Two changes: tighten the overall form spacing from `space-y-5` to `space-y-4`, and make the dates row stack on mobile.

- [ ] **Step 1: Tighten form spacing**

In `new-enrollment-form.tsx` line 253, change:
```tsx
<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
```
to:
```tsx
<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
```

- [ ] **Step 2: Make dates row responsive**

In `new-enrollment-form.tsx` line 476, change:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 3: Commit**

```bash
git add app/\(protected\)/enrollments/components/new-enrollment-form.tsx
git commit -m "fix: compact enrollment form spacing and make dates row responsive"
```

---

## Task 3: Fix tutor forms

**Files:**
- Modify: `app/(protected)/tutors/components/tutor-form.tsx`
- Modify: `app/(protected)/tutors/components/tutor-edit-form.tsx`

`tutor-form.tsx` has three non-responsive grids. `tutor-edit-form.tsx` has two.

- [ ] **Step 1: Fix tutor-form name row**

In `tutor-form.tsx` line 90, change:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```
(This is the First Name / Last Name row.)

- [ ] **Step 2: Fix tutor-form email/phone row**

In `tutor-form.tsx` line 118, change the second:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```
(This is the Email / Phone row.)

- [ ] **Step 3: Fix tutor-form subjects grid**

In `tutor-form.tsx` line 165, change:
```tsx
<div className="grid grid-cols-3 gap-2">
```
to:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
```
(Subjects render as checkboxes. On mobile they show in 2 columns instead of 3 — both work well.)

- [ ] **Step 4: Fix tutor-edit-form name row**

In `tutor-edit-form.tsx` line 84, change:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 5: Fix tutor-edit-form email/phone row**

In `tutor-edit-form.tsx` line 108, change:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 6: Commit**

```bash
git add app/\(protected\)/tutors/components/tutor-form.tsx \
        app/\(protected\)/tutors/components/tutor-edit-form.tsx
git commit -m "fix: make tutor form grids responsive on mobile"
```

---

## Task 4: Fix new-session-form — one-time tab

**Files:**
- Modify: `app/(protected)/schedule/components/new-session-form.tsx` (lines 651, 714, 772)

The one-time session tab has three grids without mobile breakpoints.

- [ ] **Step 1: Fix tutor + subject row**

In `new-session-form.tsx` line 651, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```
(This is the Tutor / Subject row.)

- [ ] **Step 2: Fix date + time row**

In `new-session-form.tsx` line 714, change:
```tsx
<div className="grid grid-cols-3 gap-3">
```
to:
```tsx
<div className="grid grid-cols-[2fr_1fr] gap-3">
```
And remove `col-span-2` from the date div on line 715:
```tsx
<div className="col-span-2 space-y-1.5">
```
becomes:
```tsx
<div className="space-y-1.5">
```
(The date picker gets 2/3 width and time input gets 1/3. The `2fr_1fr` proportion works well even on small screens so no `sm:` breakpoint needed here.)

- [ ] **Step 3: Fix duration + room row**

In `new-session-form.tsx` line 772, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 4: Verify no regressions in the one-time tab**

Run the dev server: `npm run dev`

Open the schedule page, click "New Session", and stay on the One-Time tab. Resize the browser to a narrow viewport (~375px). Verify:
- Tutor and Subject fields stack vertically
- Date field is wide (2fr), Time field is narrow (1fr), side by side
- Duration and Room fields stack vertically

- [ ] **Step 5: Commit**

```bash
git add app/\(protected\)/schedule/components/new-session-form.tsx
git commit -m "fix: make new-session-form one-time tab grids responsive"
```

---

## Task 5: Fix new-session-form recurring tab + edit dialogs

**Files:**
- Modify: `app/(protected)/schedule/components/new-session-form.tsx` (lines 1030, 1115)
- Modify: `app/(protected)/schedule/components/edit-session-dialog.tsx` (lines 102, 142)
- Modify: `app/(protected)/schedule/components/edit-recurring-group-dialog.tsx` (lines 235, 275)

- [ ] **Step 1: Fix recurring tab time + duration + interval row**

In `new-session-form.tsx` line 1030, change:
```tsx
<div className="grid grid-cols-3 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```
(This is the Default Time / Min / Every row seen in the mobile screenshot.)

- [ ] **Step 2: Fix recurring tab start + end dates row**

In `new-session-form.tsx` line 1115, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 3: Fix edit-session-dialog date + time row**

In `edit-session-dialog.tsx` line 102, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 4: Fix edit-session-dialog duration + room row**

In `edit-session-dialog.tsx` line 142, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 5: Fix edit-recurring-group-dialog per-rule day + time grid**

In `edit-recurring-group-dialog.tsx` line 235, change:
```tsx
className={`grid grid-cols-[1fr_1fr] gap-2 rounded-md p-1.5 -mx-1.5 ${isFocused ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
```
to:
```tsx
className={`grid grid-cols-2 gap-2 rounded-md p-1.5 -mx-1.5 ${isFocused ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
```
(Simplify `[1fr_1fr]` to `cols-2`; the dialog is `sm:max-w-sm` so on mobile this is within a full-width sheet where 2-col Day/Time pairs are still readable.)

- [ ] **Step 6: Fix edit-recurring-group-dialog shared duration + interval row**

In `edit-recurring-group-dialog.tsx` line 275, change:
```tsx
<div className="grid grid-cols-2 gap-3">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 7: Commit**

```bash
git add app/\(protected\)/schedule/components/new-session-form.tsx \
        app/\(protected\)/schedule/components/edit-session-dialog.tsx \
        app/\(protected\)/schedule/components/edit-recurring-group-dialog.tsx
git commit -m "fix: make schedule form grids responsive on mobile"
```

---

## Task 6: Fix payment form

**Files:**
- Modify: `app/(protected)/payments/components/new-payment-form.tsx` (line 113)

- [ ] **Step 1: Fix amount + method row**

In `new-payment-form.tsx` line 113, change:
```tsx
<div className="grid grid-cols-2 gap-4">
```
to:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

- [ ] **Step 2: Commit**

```bash
git add app/\(protected\)/payments/components/new-payment-form.tsx
git commit -m "fix: make payment form amount/method row responsive"
```

---

## Final Verification

- [ ] Run `npm run dev`
- [ ] Open Chrome DevTools, toggle device toolbar to iPhone 12 Pro (390px)
- [ ] Check each form that was changed:
  - Enrollment dialog: no overflow, dates stack vertically
  - New Tutor dialog: name, email/phone stack vertically; subjects in 2-col grid
  - Edit Tutor dialog: same as above
  - New Session dialog (One-Time tab): tutor/subject stack; date 2fr + time 1fr side-by-side; duration/room stack
  - New Session dialog (Recurring tab): time/min/every stack; start/end dates stack
  - Edit Session dialog: date/time stack; duration/room stack
  - Edit Recurring Group dialog: per-rule day/time in 2 cols; duration/interval stack
  - Record Payment dialog: amount/method stack
- [ ] Resize to 768px (tablet): all forms should show their 2-col / 3-col layouts
- [ ] Resize to 1280px (desktop): verify no regressions vs. current appearance
