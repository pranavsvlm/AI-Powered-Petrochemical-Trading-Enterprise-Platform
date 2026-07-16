#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
pnpm install

if [ ! -f .env.local ]; then
  echo "Creating .env.local from .env.example..."
  cp .env.example .env.local
fi

echo "Generating Prisma client..."
pnpm --filter @platform/database exec prisma generate || true

echo "Setup complete."
