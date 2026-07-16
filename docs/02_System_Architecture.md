# 02_System_Architecture.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

This document defines the overall technical architecture for the platform.

The platform is designed as an AI-first, modular, multi-tenant Enterprise Operating System.

---

# High-Level Architecture

```
Electron Desktop
React Native (Future)
Next.js Portal (Future)
        │
        ▼
API Gateway
        │
        ▼
Backend Services (NestJS)
        │
 ┌──────┼────────────────────────────────────┐
 │      │            │           │           │
 ▼      ▼            ▼           ▼           ▼
AI   Enterprise   Trading     Finance      HR
Core    Core       Engine      Engine     Engine
 │
 ▼
Shared Platform Services
 │
 ▼
PostgreSQL • Redis • Cloudflare R2
```

---

# Client Applications

## Desktop
- Electron
- React
- Vite
- TypeScript

Primary application for employees.

## Mobile (Future)
- React Native
- Shared business logic

## Customer Portal (Future)
- Next.js

---

# Backend

Framework:
- NestJS

Architecture:
- Modular
- Domain Driven
- Clean Architecture
- Repository Pattern
- Dependency Injection

Communication:
- REST APIs
- WebSockets
- Background Jobs

---

# AI Core

The AI Core is a platform service.

Components:

- AI Router
- Provider Adapter
- Prompt Manager
- Workflow Engine
- AI Memory
- RAG
- Knowledge Base
- AI Agents
- Decision Engine
- Policy Engine

Supported providers:

- OpenAI
- Anthropic
- Gemini
- Ollama
- Azure OpenAI

---

# Enterprise Core

Shared services:

- Authentication
- Companies
- Users
- Roles
- Permissions
- Notifications
- Audit Logs
- Settings
- Feature Flags

---

# Business Engines

## CRM
Customers
Contacts
Leads
Activities

## Product Information Management
Products
Categories
Dynamic Attributes
Technical Specifications
Documents
Media

## Trading
RFQs
Quotations
Orders
Contracts
Export

## Finance
General Ledger
AR
AP
Banking
Tax
Reporting

## HR
Employees
Attendance
Leave
Payroll

## Inventory
Warehouses
Stock
Batch Tracking

## Procurement
Suppliers
Purchase Orders
Approvals

---

# Data Layer

Database:
- PostgreSQL

Cache:
- Redis

Object Storage:
- Cloudflare R2

Search:
- PostgreSQL Full Text initially
- Vector Search for AI knowledge

---

# Multi-Tenant Strategy

Every business entity contains:

- company_id

All queries must be tenant-aware.

Platform administrators can manage companies.

Company users can only access their own data.

---

# Plugin Architecture

Every module registers through a module registry.

Core platform never depends on business modules.

Future modules can be added without changing existing modules.

---

# Event Driven Design

Examples:

Customer Created
→ AI Profile Generated

Quotation Approved
→ Create Order

Order Shipped
→ Generate Invoice

Invoice Paid
→ Update Accounting

---

# Security

- JWT
- Refresh Tokens
- RBAC
- Audit Logging
- Encryption
- HTTPS
- MFA Ready

---

# Scalability

Design for:

- Unlimited companies
- Unlimited users
- Unlimited product categories
- Multiple AI providers
- Horizontal backend scaling
- Future microservice extraction

---

# Development Standards

- Strict TypeScript
- SOLID
- Clean Architecture
- Unit Tests
- Integration Tests
- Playwright E2E
- Docker-first development

---

# Next Document

03_Monorepo_Architecture.md

Topics:
- Folder structure
- Shared packages
- Module loading
- Build pipeline
- Code sharing
