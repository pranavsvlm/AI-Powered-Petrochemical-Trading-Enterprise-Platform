# 06_User_Management.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

Define the complete User Management module.

This module manages every user across all companies while enforcing tenant isolation, security, role-based access, and AI permissions.

---

# Objectives

- Multi-tenant user management
- Enterprise security
- AI-aware permissions
- Department & team support
- Auditability
- Future SSO support

---

# User Lifecycle

Create User
↓
Assign Company
↓
Assign Department
↓
Assign Role(s)
↓
Configure Permissions
↓
Invite User
↓
Activate Account
↓
Daily Operations
↓
Suspend / Archive

---

# Database Entities

## Company
- id
- name
- status

## User
- id
- company_id
- employee_code
- first_name
- last_name
- email
- phone
- avatar
- password_hash
- status
- last_login
- timezone
- language
- created_at
- updated_at

## Department
- id
- company_id
- name
- manager_id

## Team
- id
- company_id
- department_id
- name

## UserRole
- user_id
- role_id

## UserSession
- id
- user_id
- device
- ip_address
- refresh_token
- expires_at

---

# User Status

- Pending Invitation
- Active
- Suspended
- Locked
- Archived

---

# Authentication

- JWT
- Refresh Tokens
- Password Reset
- Email Verification
- MFA Ready
- Session Revocation
- Device Management

---

# User Profile

Each profile contains:

- Personal Information
- Employment Information
- Department
- Team
- Manager
- Contact Details
- Avatar
- Time Zone
- Language
- Notification Preferences
- AI Preferences

---

# Permissions

Users inherit permissions through roles.

Additional per-user overrides are supported.

Permission Types

- View
- Create
- Edit
- Delete
- Approve
- Export
- AI Access

---

# AI Integration

Every user has an AI profile.

Examples:

- Preferred language
- Preferred AI provider (policy permitting)
- Conversation history
- Personal shortcuts
- Saved prompts
- Approval limits

AI must respect user permissions.

---

# User Interface

Pages:

- User List
- Create User
- Edit User
- User Profile
- Session Manager
- Login History
- Activity Timeline

---

# API Endpoints

GET    /users
GET    /users/{id}
POST   /users
PUT    /users/{id}
DELETE /users/{id}

GET    /departments
POST   /departments

GET    /teams
POST   /teams

POST   /users/{id}/invite
POST   /users/{id}/suspend
POST   /users/{id}/activate
POST   /users/{id}/reset-password

---

# Audit Events

- User Created
- User Updated
- Role Changed
- Password Reset
- Login
- Logout
- Session Revoked
- Account Locked

---

# Validation Rules

- Unique email per company
- Required first/last name
- Strong passwords
- Valid phone format
- Company required
- At least one role required

---

# Acceptance Criteria

✓ Company isolation enforced
✓ Session management works
✓ MFA-ready architecture
✓ Audit logging enabled
✓ AI respects permissions
✓ APIs documented
✓ Tests included

---

# Next

07_Roles_&_Permissions.md
