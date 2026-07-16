# Phase 1 Domain Model — Ratified Decisions

This document reconciles contradictions between docs 04, 06, 07, 08, 09 for the "Identity, Tenancy & Access Control" phase. It is the source of truth for Phase 1 code. Where a decision below overrides a doc, the doc text stands as historical intent; this file wins for implementation.

## 1. Company

Canonical schema is doc 08's rich version (`Company`, `CompanyProfile`, `CompanySettings`, `CompanyFeature`, `Branch`). Doc 06's minimal `Company(id, name, status)` is **superseded** — no second Company table exists. `CompanySettings.approval_rules` is kept as a jsonb placeholder for quick-glance config only; the authoritative approval configuration lives in the `ApprovalRule` table (see §4).

## 2. User / Employee

Phase 1 implements `User` exactly per doc 06 (id, company_id, employee_code, first_name, last_name, email, phone, avatar, password_hash, status, last_login, timezone, language, created_at, updated_at), unique `(company_id, email)`. `Employee` (HR extension: job title, salary, hire date, etc.) is **out of scope**. When the HR phase lands, `Employee` will be a 1:1 extension keyed on `user_id`, and must not redefine any User field.

## 3. Department / Team

Implemented per doc 06: `Department(id, company_id, name, manager_id -> User.id?)`, `Team(id, company_id, department_id, name)`. These are canonical; later HR/Org-chart phases reference, not redefine, them.

## 4. Roles & Permissions

Full doc 07 model implemented: `Role` (company_id nullable = platform-level), `Permission` (code, module, action enum), `RolePermission`, `UserRole`, `PermissionGroup`, `Policy` (jsonb definition), `ApprovalRule` (trigger_condition jsonb, approver_role_id, threshold jsonb), `ApprovalHistory`. These are **data models + CRUD + query API only**. No rule execution/evaluation engine — that is Phase 2 (Business Rules Engine, doc 23).

Exception: the ABAC **condition evaluator** (`packages/permissions/src/abac`) is implemented as a real, tested, safe JSON-logic-style evaluator over a typed `AttributeContext`, because permission _checks_ (as opposed to business rule _execution_) are in-scope for Phase 1 per doc 09 ("Permission Validation" is a mandatory security layer).

Seed roles: `PLATFORM_SUPER_ADMIN`, `PLATFORM_ADMINISTRATOR` (company_id = null), and per-company seedable: `COMPANY_ADMIN`, `FINANCE_MANAGER`, `SALES_MANAGER`, `HR_MANAGER`, `INVENTORY_MANAGER`, `PROCUREMENT_MANAGER`, `OPERATIONS_MANAGER`, `EMPLOYEE`, `VIEWER`. This **supersedes** doc 04's shorter 5-role list; doc 04's generic "Manager" is covered by the specific manager roles above.

## 5. Authentication

Per doc 09: email+password (argon2 hashing), short-lived JWT access token, rotated refresh token (hashed at rest) in `UserSession`, password reset (token-based), email verification (token-based), configurable-threshold account lockout, MFA-ready schema (`UserMfa`) with **TOTP actually implemented** (`otplib`) and **email-OTP implemented** via a minimal `EmailSenderPort` interface (defined in `packages/auth`) + a NestJS-injectable console-logging adapter (real notifications package is a later phase). OAuth2/SSO/SAML are explicitly **Future** (doc 09) — not implemented; `AuthProvider` enum left extensible (`LOCAL` implemented, `GOOGLE`/`MICROSOFT`/`SAML` reserved).

## 6. Tenant Isolation

- `TenantContextMiddleware` (apps/backend) resolves `company_id` + `userId` from the validated JWT and stores it in an AsyncLocalStorage-based `TenantContextStore` (`packages/core/src/tenant-context.ts`) — no external dependency required, production-quality request-scoped context.
- A Prisma client extension (`packages/database/src/tenant-extension.ts`) auto-injects `company_id` into `where`/`data` for all tenant-scoped models as defense-in-depth beyond service-level filtering, and throws if a tenant-scoped query is attempted with no tenant in context (fail closed).
- Dedicated integration test suite: `apps/backend/test/tenant-isolation.e2e-spec.ts`.

## 7. Audit Logging

`AuditLog` is insert-only (no update/delete controller routes exposed). `AuditService.record()` is called **inside the same Prisma transaction** as the mutating write for every event in docs 06/07/08/09; if the audit write fails, the transaction rolls back (audit-then-commit semantics), so audit logging is never best-effort.

## Module placement decision

Company and Users are implemented as full 4-layer modules (`modules/company`, `modules/users`) per doc 03's contract (domain/application/infrastructure/api). Roles, Permissions, Policies, Approval Rules, Auth, Sessions, and Audit are implemented as **sub-areas of `modules/users`** (e.g. `modules/users/domain/role.entity.ts`, `modules/users/application/assign-role.usecase.ts`) rather than a new top-level `modules/roles-permissions/`, because doc 07 explicitly treats Roles & Permissions as tightly coupled to User Management and they share the same aggregate boundary (a User's authorization state). `apps/backend/src/modules/*` contains only composition-root NestJS wiring (controllers, DTOs validated with class-validator, module registration) that imports use-cases/repositories from the `modules/*` packages — no business logic lives directly in `apps/backend`.

## Explicitly out of scope for Phase 1

- Business Rules Engine execution (doc 23)
- Workflow Engine (doc 22)
- Event Bus integration (doc 28) — audit logging does not depend on it
- OAuth2/SAML/SSO providers (doc 09, marked Future)
- Employee HR extension (doc 15)
- Notifications package build-out (doc 24) — only a minimal port + console adapter exists
