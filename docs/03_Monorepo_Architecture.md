# 03_Monorepo_Architecture.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

Define the repository structure, package boundaries, shared libraries, build system, and module architecture.

The monorepo must support:

- Electron Desktop
- React Native (Future)
- Next.js Portal (Future)
- NestJS Backend
- Shared business logic
- AI platform
- Plugin-based modules

---

# Monorepo

Package Manager:
- pnpm

Build System:
- Turborepo

Repository

```text
platform/

apps/
  desktop/
  backend/
  mobile/
  portal/

packages/
  ui/
  core/
  auth/
  ai/
  api/
  database/
  workflow/
  notifications/
  permissions/
  storage/
  search/
  config/
  types/
  utils/
  validation/

modules/
  company/
  users/
  customers/
  products/
  trading/
  quotations/
  orders/
  accounting/
  hr/
  inventory/
  procurement/
  reports/
  knowledge/
  whatsapp/

docker/
docs/
scripts/
specification/
```

---

# Apps

desktop/
- Electron
- React
- Vite

backend/
- NestJS API
- Workers
- Scheduler

mobile/
- React Native
- Shares packages/core

portal/
- Next.js Customer Portal

---

# Shared Packages

ui
- Design System
- Components
- Icons

core
- Domain Models
- Business Rules

ai
- AI Router
- Prompt Engine
- Agent SDK

database
- Prisma
- Repositories

workflow
- Event Bus
- Automation

storage
- Cloudflare R2 Adapter
- Future S3 Adapter

permissions
- RBAC
- Policy Engine

notifications
- Email
- In-App
- WhatsApp adapters

---

# Module Contract

Every module must contain:

```text
module/
  api/
  application/
  domain/
  infrastructure/
  ui/
  hooks/
  store/
  tests/
  docs/
```

No module may directly depend on another module's internals.

---

# Build Pipeline

Developer
→ pnpm
→ Turborepo
→ Build Packages
→ Build Backend
→ Build Electron
→ Run Tests
→ Package Installer

---

# Dependency Rules

Apps depend on packages.

Packages never depend on apps.

Modules depend only on shared packages and published interfaces.

---

# Configuration

Environment files:

.env
.env.development
.env.production
.env.local

Secrets must never be committed.

---

# Code Standards

- Strict TypeScript
- ESLint
- Prettier
- Husky
- Conventional Commits
- Playwright
- Vitest

---

# Future Ready

Support:

- New AI providers
- New modules
- Plugin marketplace
- White-label customers
- SaaS deployment
- Horizontal scaling

---

# Next

04_Multi_Tenant_Architecture.md
