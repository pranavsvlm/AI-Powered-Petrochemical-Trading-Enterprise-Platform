# 35_Customer_Portal.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

The Customer Portal is a secure self-service B2B workspace that enables customers to interact directly with the enterprise platform.

Customers can browse products, request quotations, place orders, track shipments, access technical documents, download financial documents, communicate with AI, and collaborate with their account team.

---

# Objectives

- Self-service B2B portal
- AI-first customer experience
- Secure multi-company access
- Real-time order visibility
- Product knowledge access
- Document downloads
- Digital collaboration

---

# Portal Architecture

Customer Browser
        │
        ▼
Next.js Portal
        │
        ▼
API Gateway
        │
        ▼
ERP • AI Platform • Documents • Trading

---

# Authentication

- Email & Password
- MFA Ready
- Password Reset
- Company-based access
- Multiple users per customer company

---

# Customer Modules

- Dashboard
- Company Profile
- Users
- Product Catalog
- AI Product Expert
- RFQs
- Quotations
- Orders
- Shipments
- Invoices
- Statements
- Documents
- Messages
- Notifications
- Support

---

# Dashboard

Display:

- AI Daily Summary
- Open Quotations
- Active Orders
- Shipment Status
- Outstanding Balance
- Recent Documents
- Notifications

---

# Product Catalog

Support:

- Product search
- Categories
- Technical specifications
- Packaging
- Certificates
- AI recommendations
- Related products

---

# AI Customer Assistant

Capabilities:

- Answer product questions
- Compare products
- Recommend alternatives
- Generate RFQs
- Explain quotations
- Track shipments
- Explain invoices
- Retrieve documents

---

# Orders

Customers can:

- View quotations
- Accept quotations
- Place orders
- Track fulfillment
- View shipment milestones
- Download shipping documents

---

# Documents

Access:

- Quotations
- Invoices
- Statements
- COA
- SDS/MSDS
- TDS
- Contracts
- Certificates

---

# Communication

- AI Chat
- Sales conversations
- File sharing
- Order discussions
- Notification center

---

# Company Administration

Customer administrators manage:

- Company users
- Roles
- Permissions
- Notification preferences

---

# Security

- Tenant isolation
- RBAC
- Secure downloads
- Signed URLs
- Audit logs
- Session management

---

# REST API

GET  /portal/dashboard
GET  /portal/orders
GET  /portal/quotations
GET  /portal/documents
POST /portal/rfqs
POST /portal/messages

---

# Acceptance Criteria

✓ Secure customer access
✓ AI-powered self service
✓ Order tracking
✓ Document downloads
✓ Multi-user customer companies
✓ Real-time notifications
✓ Responsive design
✓ Automated tests

---

# Next

36_Supplier_Portal.md
