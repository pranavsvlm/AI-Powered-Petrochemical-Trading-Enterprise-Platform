# @modules/hr

Human Resources (doc 15): the core employee lifecycle — `Employee` profiles (1:1 linked to a `User`,
referencing the existing `Department`/`Team`/`Branch` models rather than redefining them), real
clock-in/clock-out `AttendanceRecord`s and `Shift` definitions, `LeaveRequest`s with a real Rules-Engine-
backed approval flow (reusing the existing `ApprovalRequest` table, the same pattern Quotations/Documents
already use — no new approval mechanism), a payroll-ready `PayrollProfile` (salary structure only, no
payroll-run computation), `PerformanceReview`s, `TrainingRecord`s, and `EmployeeAsset` assignments. A 5th AI
agent (HR Assistant, `packages/ai/src/agent-sdk/domain/agents/hr-agent.definition.ts`) answers read-only
natural-language questions (employee lookup, leave balance, team roster) through the existing tool-calling
orchestrator — no new agent infrastructure.

See `docs/DOMAIN_MODEL_PHASE7.md` (HR section) for the full ratified-decisions record, including what's
deliberately deferred (Recruitment — a separate pre-employment lifecycle with no integration dependency on
the rest of HR; payroll runs/payslip generation; a holiday calendar; training-expiry reminder jobs; AI
write-actions like drafting offer letters).

## Structure

Follows the platform module contract (see docs/03_Monorepo_Architecture.md):

- `api/` — module-facing API surface (controllers/routes)
- `application/` — use cases / application services
- `domain/` — domain entities and business rules
- `infrastructure/` — persistence and external integrations
- `ui/` — module UI components
- `hooks/` — frontend hooks
- `store/` — client-side state management
- `tests/` — module tests
- `docs/` — module-specific documentation

No module may directly depend on another module's internals.

> Status: backend + desktop UI implemented and browser-verified (Phase 7d).
