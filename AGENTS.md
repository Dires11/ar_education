<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# AR EDUCATIONAL CENTER CRM

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

## Architecture

- lib/data/[module].ts - all prisma calls go here
- lib/services/[module].ts — all business logic is here and it uses lib/data function for db calls
- app/actions/[module].ts — server actions are thin wrappers: call service, revalidatePath, return result
- app/api/[module]/route.ts — API routes also just call service functions, no logic of their own
- Never write Prisma queries directly in actions, components, or API routes

## Project Structure

/app
/actions # server actions by module

/(protected) # protected routes

- /dashboard
- /students
- /tutors
- /schedule
- /payments
- /packages

/api
/cron # scheduled reminder jobs

/lib
/data # raw Prisma queries
/services # business logic
/validators # Zod schemas
/utils # Other helpers
prisma.ts # Prisma client singleton

/prisma
schema.prisma

## Modules to build (in order)

1. Prisma schema + migrations
2. Students CRUD
3. Tutors CRUD
4. Subjects + Packages CRUD
5. Enrollments CRUD
6. Schedule / Sessions
7. Payments
8. Dashboard
9. Email notifications

## Notifications

- Email via Resend
- SMS will be added later
- Reminders stored in DB with scheduledFor field
- Cron job at /api/cron/send-reminders runs daily via Vercel Cron
