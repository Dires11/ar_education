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

### AI assistant

The signed-in home page is a durable, tool-using AI assistant powered by
OpenAI GPT-5.6 Luna. Set `OPENAI_API_KEY` in the local or deployed server
environment to enable it. The key must never use a `NEXT_PUBLIC_` prefix.

Assistant conversations and tool audit records are stored in Postgres. OpenAI
Responses application-state storage is disabled by the integration with
`store: false`, but this setting alone does not mean that no provider-side data
is retained. Message text, selected CRM record fields and tool results, and any
attached image or document bytes needed for the request are sent to the OpenAI
API. Under OpenAI's default API data controls, abuse-monitoring logs may retain
customer content for up to 30 days; file and image inputs can also be subject to
additional safety-review or legal-retention handling. Review the current
[OpenAI API data controls](https://platform.openai.com/docs/guides/your-data),
your organization's Zero Data Retention eligibility, and any configured data
residency before production use.

Operators are responsible for establishing an appropriate legal basis and
student/guardian notices or consent, confirming regional and contractual
requirements, and limiting attachments and CRM data to what is necessary. Do
not enable the assistant for regulated or highly sensitive student data until
the organization's privacy, security, retention, and residency requirements
have been reviewed. Sensitive actions such as payments, outbound email,
deletions, cancellations, and team changes pause for explicit in-app
confirmation. Mutations derived from attachments—including extracted details
carried into later conversation turns—also require confirmation.

Run the optional live tool-routing evaluation with:

```bash
npm run eval:assistant
```

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
