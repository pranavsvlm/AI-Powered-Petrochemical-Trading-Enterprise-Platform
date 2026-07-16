#!/usr/bin/env bash
set -euo pipefail

echo "Starting infrastructure containers..."
docker compose -f docker/docker-compose.yml up -d postgres redis

echo "Starting dev servers via turbo..."
pnpm turbo run dev
