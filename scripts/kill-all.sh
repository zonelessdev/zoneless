#!/bin/bash

echo "🛑 Stopping all Zoneless processes..."

if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
fi
API_PORT=${API_PORT:-3333}
DASHBOARD_PORT=${DASHBOARD_PORT:-4200}

# Force kill Nx serve processes (use -9 for stubborn processes)
pkill -9 -f "nx serve" 2>/dev/null

# Kill Node processes running the API or web app
pkill -9 -f "node.*dist/apps/api" 2>/dev/null
pkill -9 -f "node.*dist/apps/web" 2>/dev/null
pkill -9 -f "vite.*zoneless" 2>/dev/null

# Kill anything on the API port
lsof -ti:$API_PORT | xargs kill -9 2>/dev/null

# Kill anything on the web port
lsof -ti:$DASHBOARD_PORT | xargs kill -9 2>/dev/null

# Force kill all Nx daemon and plugin worker processes
pkill -9 -f "nx/src/daemon" 2>/dev/null
pkill -9 -f "nx/src/project-graph/plugins" 2>/dev/null

# Reset Nx completely (stops daemon and clears locks)
echo "🔄 Resetting Nx..."
npx nx reset 2>/dev/null

# Remove any stale lock files
rm -f .nx/workspace-data/project-graph.lock 2>/dev/null

# Small wait to ensure processes are fully terminated
sleep 1

echo "✅ All processes stopped"

