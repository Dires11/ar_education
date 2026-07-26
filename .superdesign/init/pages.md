# Key Page Dependency Trees

## `/assistant`

Entry: `app/(protected)/assistant/page.tsx`

- `app/(protected)/assistant/assistant-shell.tsx`
  - `app/actions/assistant.ts`
  - `components/ui/alert.tsx`
    - `lib/utils.ts`
  - `components/ui/badge.tsx`
    - `lib/utils.ts`
  - `components/ui/button.tsx`
    - `lib/utils.ts`
  - `components/ui/card.tsx`
    - `lib/utils.ts`
  - `components/ui/sheet.tsx`
    - `components/ui/button.tsx`
    - `lib/utils.ts`
  - `components/ui/textarea.tsx`
    - `lib/utils.ts`
  - `lib/validators/assistant.ts`
- `lib/services/assistant/orchestrator.ts`
- `lib/services/assistant/dto.ts`
- `lib/utils/auth.ts`
- shared shell: `app/(protected)/layout.tsx`
  - `components/app-sidebar.tsx`
  - `components/ui/sidebar.tsx`
  - `components/ui/separator.tsx`
  - `components/ui/tooltip.tsx`
  - `components/ui/sonner.tsx`

## `/dashboard`

Entry: `app/(protected)/dashboard/page.tsx`

- `app/(protected)/dashboard/dashboard-ui.tsx`
- `components/page-hero.tsx`
- `components/meta-pill.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/button.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/schedule`

Entry: `app/(protected)/schedule/page.tsx`

- schedule calendar and session components under `app/(protected)/schedule/`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/select.tsx`
- `components/ui/tabs.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/students`

Entry: `app/(protected)/students/page.tsx`

- student list/detail components under `app/(protected)/students/components/`
- `components/page-hero.tsx`
- `components/entity-avatar.tsx`
- `components/cloudinary-image-upload.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/input.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/tutors`

Entry: `app/(protected)/tutors/page.tsx`

- tutor list components under `app/(protected)/tutors/components/`
- `components/page-hero.tsx`
- `components/entity-avatar.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/payments`

Entry: `app/(protected)/payments/page.tsx`

- payment list and filters under `app/(protected)/payments/`
- `components/page-hero.tsx`
- `components/ui/table.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/packages`

Entry: `app/(protected)/packages/page.tsx`

- package list and dialog components under `app/(protected)/packages/`
- `components/page-hero.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/button.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/enrollments`

Entry: `app/(protected)/enrollments/page.tsx`

- enrollment and group components under `app/(protected)/enrollments/`
- `components/page-hero.tsx`
- `components/ui/table.tsx`
- `components/ui/dialog.tsx`
- `components/ui/button.tsx`
- shared shell: `app/(protected)/layout.tsx`
## `/emails`

Entry: `app/(protected)/emails/page.tsx`

- email template and compose components under `app/(protected)/emails/`
- `components/page-hero.tsx`
- `components/ui/card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/textarea.tsx`
- shared shell: `app/(protected)/layout.tsx`

## `/team`

Entry: `app/(protected)/team/page.tsx`

- team member and invitation components under `app/(protected)/team/`
- `components/page-hero.tsx`
- `components/ui/table.tsx`
- `components/ui/dialog.tsx`
- `components/ui/button.tsx`
- shared shell: `app/(protected)/layout.tsx`
