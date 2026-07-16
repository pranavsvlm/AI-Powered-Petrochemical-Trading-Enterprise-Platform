# 04_Multi_Tenant_Architecture.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

Define how a single platform securely supports multiple independent companies while sharing one codebase.

Each company (tenant) has isolated users, data, branding, AI knowledge, and business configuration.

---

# Multi-Tenant Model

One Platform

↓

Many Companies

- Petronik
- Company B
- Company C
- Future Customers

Each company is a tenant.

---

# Tenant Isolation

Every business table contains:

- company_id

Examples:

- users
- customers
- contacts
- products
- quotations
- orders
- invoices
- suppliers
- employees
- warehouses
- documents

Every query must automatically filter by company_id.

---

# Platform Roles

Platform Super Admin
- Create companies
- Suspend companies
- Platform analytics
- Feature management
- Billing (future)

Company Admin
- Company settings
- Users
- Roles
- Branding
- AI configuration

Manager
- Approvals
- Reports
- Team oversight

Employee
- Daily operations

Viewer
- Read-only access

---

# Company Isolation

Each tenant has independent:

- Logo
- Theme
- Domain (future)
- Email templates
- PDF templates
- AI knowledge base
- Product catalog
- Customers
- Financial records
- Export documents

No cross-company access.

---

# AI Isolation

Each company has:

- Separate RAG index
- Separate vector embeddings
- Separate prompts
- Separate memory
- Separate documents

AI must never answer using another company's knowledge.

---

# Storage

Cloudflare R2 structure:

company-id/
  products/
  quotations/
  invoices/
  documents/
  certificates/

---

# Database Strategy

Shared PostgreSQL database.

Logical isolation using company_id.

Indexes must include company_id for performance.

---

# Authentication Flow

User Login
↓

JWT
↓

Resolve company_id

↓

Attach tenant context

↓

All APIs automatically filter by tenant

---

# Feature Flags

Platform owner can enable modules per company.

Example:

Petronik
- CRM ✔
- Finance ✔
- HR ✔

Company B
- CRM ✔
- Finance ✖
- HR ✖

No code deployment required.

---

# White Label

Each tenant configures:

- Company Name
- Logo
- Colors
- PDFs
- Email Branding
- WhatsApp Branding (future)

---

# Security

- Tenant-aware middleware
- Row-level authorization in application layer
- Audit logs include company_id
- API validation for tenant ownership

---

# Scalability

Supports:

- Unlimited companies
- Unlimited users
- Unlimited product categories
- Independent company configuration
- SaaS deployment

---

# Next

05_AI_Core_Architecture.md
