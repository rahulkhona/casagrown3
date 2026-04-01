#!/bin/bash
# ============================================================================
# dev-mobile.sh — Start Next.js dev server accessible from LAN devices
#
# Usage:
#   ./dev-mobile.sh              # Auto-detect LAN IP
#   ./dev-mobile.sh 192.168.1.50 # Use specific IP
#   ./dev-mobile.sh --local      # Use localhost (default behavior)
# ============================================================================

set -e

PORT="${DEV_PORT:-3001}"

if [ "$1" = "--local" ]; then
  HOST_IP="127.0.0.1"
elif [ -n "$1" ]; then
  HOST_IP="$1"
else
  # Auto-detect LAN IP (macOS)
  HOST_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
fi

if [ "$HOST_IP" = "127.0.0.1" ]; then
  echo "🏠 Starting in local-only mode (localhost:$PORT)"
else
  echo "📱 Starting in LAN mode — accessible at:"
  echo "   http://$HOST_IP:$PORT"
  echo ""
  echo "   Supabase API: http://$HOST_IP:54321"
fi

# Export the Supabase URL with the detected/specified IP
export NEXT_PUBLIC_SUPABASE_URL="http://$HOST_IP:54321"

echo ""
echo "🚀 NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
echo ""

# Start Next.js dev server on 0.0.0.0 so it's accessible from LAN
cd "$(dirname "$0")/apps/next-market"
exec npx next dev --hostname 0.0.0.0 --port "$PORT"
