# @modules/communication

Communication Management (doc 19): threads (`CommsThread`) with participants — internal users or
external contacts — and messages, spanning customer/supplier/internal/announcement conversations.
Prefixed `Comms*` deliberately: `Conversation`/`ConversationMessage` already exist (Phase 6's
AI-agent chat-transcript storage), a different concern.

Real send channels: **IN_APP** and **EMAIL** (reusing the platform's existing `EmailSenderPort`,
never reimplemented). WhatsApp/SMS remain typed seams — sending on them throws the platform's
existing `ChannelNotAvailableError`, the same one `packages/notifications` already established for
`NotificationChannel`. Attachments reuse `modules/document-management`'s existing generic
`entityType`/`entityId` pattern (`Document` rows with `entityType: 'CommsMessage'`) — no new
attachment table, no new upload endpoint.

Two cross-module integrations, both narrow ports satisfied at the NestJS composition root (never a
direct service import — the same pattern `modules/quotations` already established for its
`CustomerLookupPort`/`ProductLookupPort`): sending a customer-linked message records a real
`CustomerActivity` row (`type: 'MESSAGE'`) via `CustomerService.addActivity`; a thread can generate
a real `Task` by publishing the existing `TaskGenerationRequested` event, picked up by Phase 7a's
already-running consumer with zero new code on the Tasks side.

See `docs/DOMAIN_MODEL_PHASE7.md` (Communication section) for the full ratified-decisions record,
including what's deliberately deferred (AI Receptionist, real WhatsApp Business API integration,
conversation assignment, @mentions, communication analytics, file-attachment UI).

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

> Status: backend implemented (Phase 7b). Desktop UI pending a separate follow-up pass.
