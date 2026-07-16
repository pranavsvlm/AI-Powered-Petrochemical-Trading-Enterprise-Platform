# 30_Developer_Platform.md

# AI-Powered Petrochemical Trading & Enterprise Platform

Version: 1.0

---

# Purpose

The Developer Platform provides a standardized engineering environment for building, testing, deploying, debugging, and extending the Enterprise Platform.

Every engineer should be able to clone the repository, run one command, and start developing with a fully configured local environment.

---

# Objectives

- Excellent developer experience
- Monorepo-first development
- AI-assisted engineering
- Fast onboarding
- Consistent tooling
- High code quality
- Automated testing
- CI/CD ready

---

# Technology Stack

Desktop
- Electron
- React
- Vite
- TypeScript

Backend
- NestJS
- TypeScript

Database
- PostgreSQL
- Prisma ORM

Cache
- Redis

Storage
- Cloudflare R2

AI
- OpenAI
- Anthropic
- Gemini
- Ollama

Infrastructure
- Docker
- Docker Compose
- Turborepo
- pnpm

---

# Repository Structure

apps/
packages/
modules/
docker/
scripts/
docs/
specifications/
tools/

---

# Development Workflow

Clone Repository
↓

Install Dependencies

↓

Start Docker Services

↓

Database Migration

↓

Seed Data

↓

Start Backend

↓

Start Desktop App

↓

Run Tests

---

# CLI Commands

pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm migrate
pnpm seed
pnpm generate
pnpm clean
pnpm doctor

---

# Code Generation

Generate:

- Module
- Entity
- API
- Prisma Model
- React Page
- Electron Window
- AI Agent
- Workflow Template
- Report

---

# Testing

- Unit Tests
- Integration Tests
- End-to-End Tests
- API Tests
- UI Tests
- AI Evaluation Tests
- Load Tests

Frameworks:
- Vitest
- Playwright

---

# Debugging

Support:

- VS Code
- Chrome DevTools
- Electron DevTools
- Prisma Studio
- API Logs
- Event Viewer

---

# Documentation

Generate:

- OpenAPI Docs
- Architecture Docs
- Database Docs
- Component Docs
- SDK Docs
- AI Prompt Docs

---

# Coding Standards

- Strict TypeScript
- ESLint
- Prettier
- Conventional Commits
- SOLID
- Clean Architecture

---

# CI/CD

Pipeline:

Commit
↓

Lint

↓

Tests

↓

Build

↓

Security Scan

↓

Package Desktop

↓

Deploy Backend

↓

Release

---

# Database

Development:
- Local PostgreSQL (Docker)

Production:
- Managed PostgreSQL

Migrations via Prisma.

---

# Database Entities

DeveloperProfile
Environment
BuildArtifact
Release
Deployment
PipelineRun

---

# REST API

GET  /developer/health
GET  /developer/version
POST /developer/generate
GET  /developer/releases

---

# Permissions

Developer
Maintainer
Release Manager
Platform Administrator

---

# Acceptance Criteria

✓ One-command setup
✓ Fast local development
✓ Automated code generation
✓ Full test suite
✓ CI/CD ready
✓ Complete documentation
✓ Docker-first workflow
✓ Automated quality checks

---

# Next

31_DevOps_&_Deployment.md
