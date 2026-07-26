# Route Map

All business pages use the shared protected shell in
`app/(protected)/layout.tsx`. Authentication pages use only the root layout.

| URL | Entry file | Summary |
| --- | --- | --- |
| `/` | `app/page.tsx` | Redirects signed-in users to `/assistant`. |
| `/assistant` | `app/(protected)/assistant/page.tsx` | Primary conversational CRM workspace with thread history, tools, confirmations, and attachments. |
| `/dashboard` | `app/(protected)/dashboard/page.tsx` | Center summary metrics and operational alerts. |
| `/schedule` | `app/(protected)/schedule/page.tsx` | Calendar and session management. |
| `/payments` | `app/(protected)/payments/page.tsx` | Payment history and balances. |
| `/payments/new` | `app/(protected)/payments/new/page.tsx` | Record a payment. |
| `/students` | `app/(protected)/students/page.tsx` | Student roster and profile management. |
| `/tutors` | `app/(protected)/tutors/page.tsx` | Tutor roster. |
| `/tutors/new` | `app/(protected)/tutors/new/page.tsx` | Tutor creation form. |
| `/tutors/[id]` | `app/(protected)/tutors/[id]/page.tsx` | Tutor profile and workload. |
| `/tutors/[id]/edit` | `app/(protected)/tutors/[id]/edit/page.tsx` | Tutor editing form. |
| `/subjects` | `app/(protected)/subjects/page.tsx` | Subject catalog. |
| `/packages` | `app/(protected)/packages/page.tsx` | Package catalog. |
| `/packages/new` | `app/(protected)/packages/new/page.tsx` | Package creation form. |
| `/packages/[id]/edit` | `app/(protected)/packages/[id]/edit/page.tsx` | Package editing form. |
| `/enrollments` | `app/(protected)/enrollments/page.tsx` | Enrollment and group management. |
| `/enrollments/new` | `app/(protected)/enrollments/new/page.tsx` | Enrollment creation form. |
| `/emails` | `app/(protected)/emails/page.tsx` | Email templates and communications. |
| `/team` | `app/(protected)/team/page.tsx` | Owner-managed team access. |
| `/sign-in/[[...sign-in]]` | `app/sign-in/[[...sign-in]]/page.tsx` | Clerk sign-in. |
| `/sign-up/[[...sign-up]]` | `app/sign-up/[[...sign-up]]/page.tsx` | Clerk sign-up. |
