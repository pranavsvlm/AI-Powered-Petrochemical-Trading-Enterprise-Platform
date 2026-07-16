# 28_Event_Bus_Architecture.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

The Event Bus is the central nervous system of the Enterprise Operating System.

Every module communicates by publishing and subscribing to events instead of directly calling other modules. This enables loose coupling, scalability, resilience, AI orchestration, and future microservice adoption.

---

# Objectives

- Event-driven architecture
- Loose coupling
- Reliable message delivery
- Horizontal scalability
- Real-time processing
- AI integration
- Complete auditability

---

# Architecture

```
Business Modules
        │
        ▼
    Event Bus
        │
 ┌──────┼──────────────────────────────────────────────┐
 ▼      ▼         ▼          ▼          ▼              ▼
Workflow AI     Analytics Notifications Audit      Integrations
Engine  Agents              Center      Logs
        │
        ▼
 External Systems / Webhooks
```

---

# Event Principles

- Publish/Subscribe
- Immutable Events
- Versioned Schemas
- Idempotent Consumers
- At-Least-Once Delivery
- Retry Support
- Dead Letter Queue
- Event Replay

---

# Event Categories

Business
- CustomerCreated
- RFQReceived
- QuotationApproved
- OrderCreated
- ShipmentDelivered

Finance
- InvoiceCreated
- PaymentReceived
- JournalPosted

Inventory
- StockReserved
- GoodsReceived
- BatchExpired

HR
- EmployeeCreated
- LeaveApproved

AI
- AIRecommendationGenerated
- AgentExecutionCompleted

System
- UserLoggedIn
- BackupCompleted
- IntegrationFailed

---

# Event Lifecycle

Business Action
↓

Event Published
↓

Schema Validation
↓

Persist Event

↓

Subscribers

↓

Business Processing

↓

Acknowledgement

↓

Audit Log

---

# Event Schema

Every event contains:

- event_id
- event_type
- event_version
- company_id
- aggregate_id
- timestamp
- source
- correlation_id
- payload
- metadata

---

# Subscribers

Examples

QuotationApproved

↓

Workflow Engine

↓

Notification Center

↓

Analytics

↓

AI Memory

↓

Audit Log

↓

External Webhook

---

# Reliability

Support:

- Retry Policies
- Exponential Backoff
- Dead Letter Queue
- Poison Message Detection
- Duplicate Detection
- Event Replay

---

# Message Broker

Initial:
- Redis Streams

Future Options:
- RabbitMQ
- NATS
- Apache Kafka

Broker implementation hidden behind an abstraction layer.

---

# Observability

Track:

- Published Events
- Failed Events
- Processing Time
- Queue Length
- Retry Count
- Consumer Lag
- Throughput

---

# Database Entities

Event
EventSubscription
EventConsumer
DeadLetterEvent
EventReplay
EventAudit

---

# REST API

GET  /events
GET  /events/{id}
POST /events/replay
GET  /events/dead-letter
POST /events/dead-letter/retry

---

# Permissions

View Events
Replay Events
Manage Subscribers
Manage Brokers
View Metrics

---

# Validation

- Event schema validation
- Tenant isolation
- Version compatibility
- Consumer idempotency
- Payload integrity

---

# Audit Events

Event Published
Event Consumed
Event Failed
Replay Started
Replay Completed
Dead Letter Created

---

# Acceptance Criteria

✓ Event-driven architecture
✓ Reliable delivery
✓ Dead letter queue
✓ Event replay
✓ Versioned schemas
✓ Broker abstraction
✓ Multi-tenant support
✓ Automated tests

---

# Next

29_Plugin_SDK.md
