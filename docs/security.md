# Dependency security status

Last reviewed: 2026-07-25

Run the production dependency audit with:

```bash
npm audit --omit=dev
```

The current audit reports 6 findings: 3 high and 3 moderate. There are no
critical findings.

## Addressed

- Next.js and Clerk are pinned to reviewed patch releases.
- `shadcn` is a development-only CLI and is no longer shipped as a production
  dependency.
- Resend was upgraded to remove the vulnerable Svix/UUID chain.
- Compatible patched releases of Hono, Valibot, and Fast URI are pinned through
  package overrides.

## Upstream residuals

- Next.js 16.2.11 brings the reported PostCSS and Sharp findings. The audit's
  proposed fix is an incompatible downgrade to Next.js 9.3.3, so it must not be
  applied with `npm audit fix --force`.
- Prisma 7.7 brings moderate findings through its development tooling. The
  remaining Node server fix requires a new major version outside Prisma's
  declared range. Prisma 7.9 was evaluated, but it introduced additional
  higher-severity routing findings into the production tree, so the project
  remains on 7.7.

Recheck these findings when either framework publishes a compatible patched
dependency tree. Any dependency update must be followed by the tests,
typecheck, lint, production build, and authentication smoke tests.
