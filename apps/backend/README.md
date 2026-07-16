# @platform/backend

NestJS API, background workers, and scheduler. Depends on `@platform/database` for Prisma
access (schema is centralized in `packages/database`, not duplicated here).

> Status: skeleton — a single health endpoint (`GET /` -> `{ status: 'ok' }`) plus placeholder
> worker/scheduler entrypoints.
