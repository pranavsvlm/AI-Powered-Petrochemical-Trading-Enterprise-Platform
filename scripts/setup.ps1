#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..."
pnpm install

if (-not (Test-Path ".env.local")) {
    Write-Host "Creating .env.local from .env.example..."
    Copy-Item ".env.example" ".env.local"
}

Write-Host "Generating Prisma client..."
try {
    pnpm --filter @platform/database exec prisma generate
} catch {
    Write-Host "Prisma generate skipped (not yet installed)."
}

Write-Host "Setup complete."
