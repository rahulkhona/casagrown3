#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Decrypt Local Environment Files
#
# Unpacks all local .env and .env.local files from secrets/local-envs.enc
# across root, all 10 apps, and Supabase.
#
# Automatically reads passphrase from macOS Keychain, or prompts on a new
# machine and saves to Keychain for future automated use.
# ═══════════════════════════════════════════════════════════════════════════
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENC_FILE="$ROOT_DIR/secrets/local-envs.enc"

if [ ! -f "$ENC_FILE" ]; then
  echo -e "\033[0;31mError: Encrypted archive not found at $ENC_FILE\033[0m"
  exit 1
fi

# 1. Retrieve Passphrase from macOS Keychain or Prompt
PASSPHRASE=""
IS_FROM_KEYCHAIN=false

if command -v security &>/dev/null; then
  PASSPHRASE=$(security find-generic-password -s "casagrown-envs-passphrase" -w 2>/dev/null || true)
  if [ -n "$PASSPHRASE" ]; then
    IS_FROM_KEYCHAIN=true
  fi
fi

if [ -z "$PASSPHRASE" ]; then
  if [ -n "$CASAGROWN_ENV_PASSPHRASE" ]; then
    PASSPHRASE="$CASAGROWN_ENV_PASSPHRASE"
  else
    echo -e "\033[1;36m🔐 New machine detected / Passphrase not in Keychain.\033[0m"
    echo -n "Enter CasaGrown encryption passphrase (from Chrome Password Manager): "
    read -s PASSPHRASE
    echo ""
  fi
fi

if [ -z "$PASSPHRASE" ]; then
  echo -e "\033[0;31mError: No passphrase provided. Cannot decrypt.\033[0m"
  exit 1
fi

# 2. Decrypt temporary tarball
TMP_TAR=$(mktemp /tmp/casagrown-envs-dec.tar.XXXXXX)
trap 'rm -f "$TMP_TAR"' EXIT

if ! openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$PASSPHRASE" -in "$ENC_FILE" -out "$TMP_TAR" 2>/dev/null; then
  echo -e "\033[0;31mError: Decryption failed. Incorrect passphrase.\033[0m"
  exit 1
fi

# 3. Extract all environment files
echo -e "\033[1;36mExtracting environment files across repository...\033[0m"
tar -xzf "$TMP_TAR" -C "$ROOT_DIR"

# 4. Save to macOS Keychain if it was manually entered
if [ "$IS_FROM_KEYCHAIN" = false ] && command -v security &>/dev/null; then
  security add-generic-password -U -a "$USER" -s "casagrown-envs-passphrase" -w "$PASSPHRASE" 2>/dev/null || true
  echo -e "  \033[0;32m✓ Saved passphrase to macOS Keychain on this machine for future automated use.\033[0m"
fi

echo -e "\033[1;32m✓ All .env and .env.local files successfully restored!\033[0m"
