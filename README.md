# AR Educational Center CRM

AR Educational Center CRM is an ongoing project for managing students, tutors,
subjects, packages, enrollments, schedules, sessions, and payments for an
education center.

The product is actively evolving and should be treated as work in progress.
Features, schema design, and workflows may continue to change as the system is
tested against real administrative needs.

## Built With

- Next.js App Router
- Prisma ORM and Postgres
- Tailwind CSS
- shadcn/ui
- Clerk authentication
- Resend email infrastructure
- Modern AI-assisted development tools, including Codex and Claude Code

## Development

Install dependencies and run the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

See [docs/security.md](docs/security.md) for the current production dependency
audit and documented upstream residuals.

### Access and scheduled jobs

- CRM access is invite-only. Owners invite staff from the Team page.
- On a fresh database, set `INITIAL_OWNER_EMAILS` to a comma-separated
  allowlist of emails that may provision the first owner. The allowlist is
  ignored after the first Admin record exists.
- Set a non-empty `CRON_SECRET` in deployed environments. The daily cron only
  materializes recurring sessions; automatic reminder queueing and delivery
  remain disabled.

## Status

This repository is under active development. Expect ongoing changes to the CRM
modules, database migrations, and user interface as the project matures.
