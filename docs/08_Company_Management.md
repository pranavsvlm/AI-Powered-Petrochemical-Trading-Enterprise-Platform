# 08_Company_Management.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

The Company Management module is the foundation of the multi-tenant platform.

It allows the Platform Owner to create, configure, secure, and manage unlimited companies from a single deployment while keeping every tenant completely isolated.

---

# Objectives

- Unlimited companies
- Complete tenant isolation
- Independent branding
- Independent AI configuration
- Independent feature enablement
- SaaS-ready architecture

---

# Company Lifecycle

Create Company
↓

Configure Branding
↓

Configure AI Policies
↓

Enable Modules
↓

Create Admin User
↓

Invite Employees
↓

Import Products & Customers
↓

Go Live

↓

Suspend / Archive (if required)

---

# Database Entities

## Company
- id (UUID)
- company_code
- legal_name
- trade_name
- registration_number
- tax_number
- country
- timezone
- currency
- language
- status
- created_at
- updated_at

## CompanyProfile
- logo
- favicon
- colors
- email_signature
- quotation_template
- invoice_template

## CompanySettings
- ai_provider
- approval_rules
- default_currency
- date_format
- number_format
- business_hours

## CompanyFeature
- company_id
- module_name
- enabled

---

# Supported Company Information

- Legal Information
- Branches
- Contacts
- Warehouses
- Bank Accounts
- Shipping Addresses
- Billing Addresses
- Licenses
- Certifications

---

# Company Branding

Each company can configure:

- Logo
- Theme Colors
- Fonts (future)
- PDF Templates
- Email Templates
- Report Templates
- Login Background
- Customer Portal Branding

---

# AI Configuration

Each company owns:

- AI Provider
- Knowledge Base
- Prompt Library
- AI Policies
- Approval Policies
- Automation Rules

No AI memory or knowledge may cross company boundaries.

---

# Module Management

Enable or disable modules without code changes.

Examples:

✓ CRM
✓ Product Management
✓ Trading
✓ Finance
✓ HR
✓ Inventory
✓ Procurement
✓ Knowledge
✓ WhatsApp
✓ Analytics

---

# Branch Management

Support:

- Headquarters
- Regional Offices
- Warehouses
- Sales Offices
- Manufacturing Plants (future)

Each branch can have:

- Users
- Address
- Contacts
- Inventory
- Business Hours

---

# REST API

GET    /companies
GET    /companies/{id}
POST   /companies
PUT    /companies/{id}
DELETE /companies/{id}

POST   /companies/{id}/activate
POST   /companies/{id}/suspend

GET    /companies/{id}/features
PUT    /companies/{id}/features

---

# User Interface

Pages

- Company List
- Create Company
- Company Profile
- Branding
- Branches
- Features
- AI Settings
- Subscription (future)
- Activity Log

---

# Audit Events

- Company Created
- Company Updated
- Company Suspended
- Feature Enabled
- Feature Disabled
- Branding Updated
- AI Settings Changed

---

# Validation

- Unique company code
- Unique registration number
- Required legal name
- Required default currency
- Required timezone
- Required company administrator

---

# Acceptance Criteria

✓ Unlimited companies
✓ Tenant isolation enforced
✓ Branding works independently
✓ Module enable/disable supported
✓ AI configuration isolated
✓ APIs documented
✓ Tests included

---

# Next

09_Authentication_&_Security.md
