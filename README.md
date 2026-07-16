# AI-Powered-Petrochemical-Trading-Enterprise-Platform

## Getting Started

This is a pnpm + Turborepo monorepo. See `docs/03_Monorepo_Architecture.md` for the full
architecture spec.

```bash
# install dependencies, copy env files, generate prisma client
./scripts/setup.sh      # or scripts/setup.ps1 on Windows

# start infra (postgres/redis) + all dev servers
./scripts/dev.sh        # or scripts/dev.ps1 on Windows
```

Repository layout: `apps/` (desktop, backend, mobile, portal), `packages/` (shared libraries),
`modules/` (business modules), `docker/`, `scripts/`, `docs/`.

