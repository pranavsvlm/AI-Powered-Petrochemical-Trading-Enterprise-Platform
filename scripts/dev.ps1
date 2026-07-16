#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "Starting infrastructure containers..."
docker compose -f docker/docker-compose.yml up -d postgres redis

Write-Host "Starting dev servers via turbo..."
pnpm turbo run dev
