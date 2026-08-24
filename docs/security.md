# Dependency security status

Last reviewed: 2026-08-23

Run the production dependency audit with:

```bash
npm audit --omit=dev
```

Both the production-only and full dependency audits report 0 findings.

## Addressed

- Next.js 16.2.12 and Clerk are pinned to reviewed patch releases.
- `shadcn` is a development-only CLI and is no longer shipped as a production
  dependency.
- Resend was upgraded to remove the vulnerable Svix/UUID chain.
- Prisma packages are aligned on 7.9.1. `deepmerge-ts` is overridden to 8.0.2
  until Prisma's configuration package updates its exact transitive pin,
  resolving GHSA-ggr8-5vv4-36mx without the audit command's unsafe Prisma 6
  downgrade.
- Compatible patched releases of Hono, its Node adapter, PostCSS, Sharp,
  Find My Way, esbuild, Valibot, Fast URI, JS-YAML, and Nano ID are pinned
  through package overrides where upstream packages still declare a vulnerable
  transitive version.

## Development dependencies

The supported ESLint 9 and Next.js lint toolchain now resolves to patched
transitive packages, so the full audit has no development-only residuals.

Any dependency update must be followed by the tests, typecheck, lint,
production build, Prisma validation, CLI smoke tests, and both audit commands.
