<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Stack

- Next.js App Router (no Pages Router)
- Neon Postgres + Prisma ORM
- TailwindCSS for styling
- Shadcn/ui for all components
- Clerk for auth
- Resend for email, Twilio for SMS

## Conventions

- Server actions in /app/actions/[module].ts
- All DB access through Prisma only
- Zod for all form validation
- Use Shadcn components — don't install new UI libs without asking
- Clerk userId maps to an internal Admin model

## Project Structure

/app
/actions # server actions by module
/(dashboard) # protected routes
/students
/tutors
/schedule
/payments
/packages
/api
/cron # scheduled reminder jobs

## Modules to build (in order)

1. Prisma schema + migrations
2. Students CRUD
3. Tutors CRUD
4. Subjects + Packages
5. Enrollments
6. Schedule / Sessions
7. Payments
8. Dashboard
9. Email/SMS notifications

## Notifications

- Email via Resend
- SMS via Twilio
- Reminders stored in DB with scheduledFor field
- Cron job at /api/cron/send-reminders runs daily via Vercel Cron
