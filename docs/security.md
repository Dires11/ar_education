# Dependency security status

Last reviewed: 2026-07-25

Run the production dependency audit with:

```bash
npm audit --omit=dev
```

The production dependency audit reports 0 findings.

## Addressed

- Next.js 16.2.12 and Clerk are pinned to reviewed patch releases.
- `shadcn` is a development-only CLI and is no longer shipped as a production
  dependency.
- Resend was upgraded to remove the vulnerable Svix/UUID chain.
- Prisma was upgraded to 7.9.0.
- Compatible patched releases of Hono, its Node adapter, PostCSS, Sharp,
  Find My Way, esbuild, Valibot, and Fast URI are pinned
  through package overrides where upstream packages still declare a vulnerable
  transitive version.

## Development-only residual

The full audit reports 9 high-severity paths to the same Brace Expansion
denial-of-service advisory through ESLint 9 and Next.js lint plugins. These
packages are not installed in the production dependency tree.

The audit's proposed forced upgrade installs ESLint 10, but the React, import,
and accessibility plugins bundled by Next.js 16.2.12 do not support ESLint 10.
Forcing Brace Expansion 5 into the older Minimatch consumers also breaks
ESLint at runtime. Keep the supported ESLint 9 toolchain until those plugins
publish compatible releases; do not use `npm audit fix --force`.

Any dependency update must be followed by the tests, typecheck, lint,
production build, Prisma validation, CLI smoke tests, and both audit commands.
