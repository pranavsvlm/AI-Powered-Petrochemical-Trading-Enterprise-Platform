# 36_Supplier_Portal.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

The Supplier Portal is a secure B2B collaboration platform that allows suppliers to work directly with the enterprise platform.

Suppliers can receive RFQs, submit quotations, manage contracts, upload compliance documents, track purchase orders, schedule deliveries, submit invoices, monitor payments, and communicate with procurement teams and AI assistants.

---

# Objectives

- Secure supplier self-service
- Digital procurement collaboration
- AI-assisted supplier experience
- Real-time procurement visibility
- Compliance management
- Faster purchasing cycle
- Multi-company support

---

# Portal Architecture

Supplier Browser
        │
        ▼
Next.js Supplier Portal
        │
        ▼
API Gateway
        │
        ▼
Procurement • Inventory • Finance • Documents • AI

---

# Authentication

- Email & Password
- MFA Ready
- Company-based supplier access
- Multiple supplier users
- Role-based permissions

---

# Supplier Modules

- Dashboard
- Company Profile
- Users
- RFQs
- Quotations
- Purchase Orders
- Deliveries
- Invoices
- Payments
- Contracts
- Documents
- AI Procurement Assistant
- Messages
- Notifications

---

# Dashboard

Displays:

- Pending RFQs
- Submitted Quotations
- Purchase Orders
- Upcoming Deliveries
- Outstanding Payments
- Compliance Alerts
- AI Daily Summary

---

# RFQ Management

Suppliers can:

- Receive RFQs
- Ask clarification questions
- Submit quotations
- Revise quotations
- Withdraw quotations before closing
- View RFQ status

---

# Purchase Orders

Suppliers can:

- View POs
- Accept or reject POs
- Request amendments
- Confirm delivery dates
- Track fulfillment
- Upload shipping documents

---

# Deliveries

Support:

- Delivery schedules
- Shipment tracking
- Goods receipt confirmation
- Delivery notes
- Partial deliveries

---

# Financials

Suppliers can:

- Submit invoices
- Track invoice approval
- View payment status
- Download remittance advice
- View account statements

---

# Compliance

Upload and manage:

- Trade License
- Tax Registration
- ISO Certificates
- COA
- SDS/MSDS
- Insurance
- Bank Details
- Other certifications

Receive expiry reminders.

---

# AI Procurement Assistant

Capabilities:

- Explain RFQs
- Summarize purchase orders
- Answer procurement questions
- Recommend missing documents
- Explain payment status
- Provide delivery guidance

---

# Communication

- AI Chat
- Procurement conversations
- File sharing
- Notification center
- Order discussions

---

# Security

- Tenant isolation
- RBAC
- Signed downloads
- Audit logs
- Session management
- Secure uploads

---

# Database Entities

SupplierPortalUser
SupplierSession
SupplierMessage
SupplierInvoice
SupplierDocument
SupplierNotification

---

# REST API

GET  /supplier/dashboard
GET  /supplier/rfqs
POST /supplier/quotations
GET  /supplier/purchase-orders
POST /supplier/invoices
GET  /supplier/payments
GET  /supplier/documents
POST /supplier/messages

---

# Permissions

View RFQs
Submit Quotations
View Purchase Orders
Submit Invoices
Upload Documents
Manage Supplier Users
Use AI Procurement Assistant

---

# Acceptance Criteria

✓ Secure supplier access
✓ RFQ & quotation workflow
✓ Purchase order management
✓ Invoice submission
✓ Compliance document management
✓ AI procurement assistant
✓ Responsive portal
✓ Automated tests

---

# Next

37_System_Administration.md
