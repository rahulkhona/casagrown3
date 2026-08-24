#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CasaGrown — Encrypt Local Environment Files
#
# Packages all local .env and .env.local files across root, all 10 apps,
# and Supabase into an AES-256-CBC encrypted archive: secrets/local-envs.enc
#
# Reads passphrase automatically from macOS Keychain or prompts if missing.
# ═══════════════════════════════════════════════════════════════════════════
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p "$ROOT_DIR/secrets"
ENC_FILE="$ROOT_DIR/secrets/local-envs.enc"
CHECKSUM_FILE="$ROOT_DIR/secrets/.env.checksums"

# 1. Retrieve Passphrase from macOS Keychain or Prompt
PASSPHRASE=""
if command -v security &>/dev/null; then
  PASSPHRASE=$(security find-generic-password -s "casagrown-envs-passphrase" -w 2>/dev/null || true)
fi

if [ -z "$PASSPHRASE" ]; then
  if [ -n "$CASAGROWN_ENV_PASSPHRASE" ]; then
    PASSPHRASE="$CASAGROWN_ENV_PASSPHRASE"
  else
    echo -n "Enter encryption passphrase: "
    read -s PASSPHRASE
    echo ""
  fi
fi

if [ -z "$PASSPHRASE" ]; then
  echo -e "\033[0;31mError: No passphrase provided. Cannot encrypt.\033[0m"
  exit 1
fi

# 2. Collect all existing .env and .env.local files
ENV_FILES=()
while IFS= read -r f; do
  # Avoid node_modules, .git, or dist
  if [[ "$f" != *"/node_modules/"* ]] && [[ "$f" != *"/.git/"* ]] && [[ "$f" != *"/.next/"* ]] && [[ "$f" != *"/dist/"* ]]; then
    # Store relative path
    rel_path="${f#$ROOT_DIR/}"
    ENV_FILES+=("$rel_path")
  fi
done < <(find "$ROOT_DIR" \( -name ".env" -o -name ".env.local" \) -type f)

if [ ${#ENV_FILES[@]} -eq 0 ]; then
  echo -e "\033[0;33mNo .env or .env.local files found to encrypt.\033[0m"
  exit 0
fi

echo -e "\033[1;36mEncrypting ${#ENV_FILES[@]} local environment files...\033[0m"

# 3. Create temporary tarball and encrypt
TMP_TAR=$(mktemp /tmp/casagrown-envs.tar.XXXXXX)
TMP_CHECKSUM=$(mktemp /tmp/casagrown-sums.XXXXXX)

trap 'rm -f "$TMP_TAR" "$TMP_CHECKSUM"' EXIT

# Generate checksums for change detection
for file in "${ENV_FILES[@]}"; do
  shasum -a 256 "$file" >> "$TMP_CHECKSUM"
done

# Package files into tarball
tar -czf "$TMP_TAR" "${ENV_FILES[@]}"

# Encrypt tarball with OpenSSL AES-256-CBC (PBKDF2)
openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$PASSPHRASE" -in "$TMP_TAR" -out "$ENC_FILE"
cp "$TMP_CHECKSUM" "$CHECKSUM_FILE"

echo -e "\033[1;32m✓ Successfully encrypted into: secrets/local-envs.enc\033[0m"
echo -e "  \033[0;34mArchived ${#ENV_FILES[@]} files:\033[0m"
for file in "${ENV_FILES[@]}"; do
  echo -e "    • $file"
done
