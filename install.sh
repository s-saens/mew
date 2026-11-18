#!/usr/bin/env bash
# Install the prebuilt launcher in the current user's environment.
set -euo pipefail

MEW_INSTALL_VERSION_DEFAULT="0.1.2"

mew_fail() { printf '[mew] %s\n' "$*" >&2; exit 1; }
mew_log() { printf '[mew] %s\n' "$*" >&2; }
mew_quote() { printf "'%s'" "${1//\'/\'\\\'\'}"; }

mew_check_wrapper() {
  if [ -e "$1" ] || [ -L "$1" ]; then
    [ ! -L "$1" ] && [ -f "$1" ] && [ "$(sed -n '2p' "$1")" = '# Mew bootstrap launcher' ] || \
      mew_fail "Preserving an existing command at $1. Set MEW_INSTALL_BIN_DIR to another directory."
  fi
}

mew_download() {
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --tlsv1.2 --retry 3 --connect-timeout 15 --max-time 600 --max-filesize 268435456 \
    --output "$2" "$1"
}

mew_hash() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

mew_verify() {
  [ "$(mew_hash "$1")" = "$2" ] || mew_fail "SHA-256 verification failed: $3. Nothing from that archive was executed."
}

mew_bundle_paths() {
  local archive="$1" entry
  tar -tzf "$archive" > "$mew_tmp/entries"
  LC_ALL=C tar -tvzf "$archive" | awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" {exit 1}' || \
    mew_fail 'The launcher archive contains links or unsupported file types.'
  while IFS= read -r entry; do
    entry="${entry#./}"
    case "$entry" in /*|..|../*|*/../*|*/..|*\\*) mew_fail 'The launcher archive contains an unsafe path.';; esac
    case "$entry" in ''|.|package.json|LICENSE|bin|bin/|bin/*|src|src/|src/*|node_modules|node_modules/|node_modules/*) ;;
      *) mew_fail "Unexpected launcher archive entry: $entry";;
    esac
  done < "$mew_tmp/entries"
}

mew_install_main() {
  if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
    cat <<'HELP'
Install Mew in an existing WSL 2, Linux, or macOS environment:
  curl -fsSL https://raw.githubusercontent.com/s-saens/mew/main/install.sh | bash

The installer prepares a private Node.js and prebuilt Mew launcher, then runs
the same automatic Postgres and browser setup as npx mew-ide. No npm or Git
installation is required. OS package installation may require authorization.

Pass launcher options with: bash install.sh --no-open --no-autostart
Environment: MEW_INSTALL_VERSION, MEW_INSTALL_DIR, MEW_INSTALL_BIN_DIR.
HELP
    return
  fi
  [ "$(id -u)" != 0 ] || mew_fail 'Run this installer as your ordinary user, without sudo.'
  local tool platform arch node_version node_sha version install_root bin_dir wrapper node_dir cli_dir release_base expected entry
  for tool in curl tar gzip awk mktemp; do command -v "$tool" >/dev/null 2>&1 || mew_fail "Required tool is missing: $tool"; done
  command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1 || mew_fail 'Install sha256sum or shasum first.'
  case "$(uname -s)" in Linux) platform=linux;; Darwin) platform=darwin;; *) mew_fail 'Run this script inside WSL 2, Linux, or macOS. Windows CMD/PowerShell uses npx mew-ide.';; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64;; aarch64|arm64) arch=arm64;; *) mew_fail 'Mew supports x64 and arm64 hosts.';; esac
  node_version=24.21.0
  case "$platform-$arch" in
    linux-x64) node_sha=6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff;;
    linux-arm64) node_sha=724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5;;
    darwin-x64) node_sha=1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097;;
    darwin-arm64) node_sha=bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057;;
  esac
  version="${MEW_INSTALL_VERSION:-$MEW_INSTALL_VERSION_DEFAULT}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || mew_fail 'Invalid Mew release version.'
  install_root="${MEW_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mew-bootstrap}"
  bin_dir="${MEW_INSTALL_BIN_DIR:-$HOME/.local/bin}"
  for entry in "$install_root" "$bin_dir"; do
    case "$entry" in /*) ;; *) mew_fail 'Installation paths must be absolute.';; esac
    case "$entry" in *$'\n'*|*$'\r'*) mew_fail 'Installation paths cannot contain line breaks.';; esac
  done
  wrapper="$bin_dir/mew-ide"
  mew_check_wrapper "$wrapper"
  [ ! -L "$install_root" ] || mew_fail 'The installation directory cannot be a symlink.'
  if [ -e "$install_root/.mew-bootstrap" ] || [ -L "$install_root/.mew-bootstrap" ]; then
    [ ! -L "$install_root/.mew-bootstrap" ] && [ -f "$install_root/.mew-bootstrap" ] && \
      [ "$(cat "$install_root/.mew-bootstrap")" = 'mew-bootstrap-v1' ] || mew_fail 'Preserving an unrelated installation marker.'
  elif [ -d "$install_root" ]; then
    [ -z "$(ls -A "$install_root")" ] || mew_fail "Preserving an unrelated directory: $install_root"
  fi
  for entry in "$install_root/node" "$install_root/cli"; do
    [ ! -L "$entry" ] || mew_fail "Preserving an unexpected installation symlink: $entry"
    [ ! -e "$entry" ] || [ -d "$entry" ] || mew_fail "Preserving an unexpected installation file: $entry"
  done
  umask 077
  mkdir -p "$install_root"
  chmod 700 "$install_root"
  printf 'mew-bootstrap-v1\n' > "$install_root/.mew-bootstrap"
  mew_lock="$install_root/.install-lock"
  mkdir "$mew_lock" 2>/dev/null || mew_fail "Another installation is active. If it was interrupted, remove only $mew_lock and retry."
  mew_tmp=''
  trap 'rm -rf "${mew_tmp:-}"; rmdir "$mew_lock" 2>/dev/null || true' EXIT
  trap 'exit 130' INT
  trap 'exit 143' HUP TERM
  mew_tmp=$(mktemp -d "$install_root/.download.XXXXXXXX")
  release_base="https://github.com/s-saens/mew/releases/download/mew-cli-v$version"
  mew_log "Preparing Mew $version for $platform/$arch…"
  mew_download "$release_base/SHA256SUMS" "$mew_tmp/SHA256SUMS" || mew_fail "Mew $version is not published or could not be downloaded. Retry when the matching release is available."
  expected=$(awk '$2 == "mew-cli-standalone.tar.gz" {print $1}' "$mew_tmp/SHA256SUMS")
  [[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]] || mew_fail 'The release must contain exactly one standalone launcher checksum.'
  expected=$(printf '%s' "$expected" | tr 'A-F' 'a-f')
  node_dir="$install_root/node/v$node_version-$platform-$arch"
  cli_dir="$install_root/cli/$version"
  [ ! -L "$node_dir" ] && [ ! -L "$cli_dir" ] || mew_fail 'Preserving an unexpected versioned installation symlink.'
  if [ ! -e "$node_dir" ]; then
    mew_log "Installing private Node.js $node_version…"
    mew_download "https://nodejs.org/dist/v$node_version/node-v$node_version-$platform-$arch.tar.gz" "$mew_tmp/node.tar.gz"
    mew_verify "$mew_tmp/node.tar.gz" "$node_sha" 'Node.js'
    mkdir "$mew_tmp/node"
    tar -xzf "$mew_tmp/node.tar.gz" -C "$mew_tmp/node" --strip-components=1
    [ "$("$mew_tmp/node/bin/node" --version)" = "v$node_version" ] || mew_fail 'The private Node.js version does not match.'
    printf '%s\n' "$node_sha" > "$mew_tmp/node/.mew-archive-sha256"
    mkdir -p "$install_root/node"
    mv "$mew_tmp/node" "$node_dir"
  fi
  [ ! -L "$node_dir" ] && [ -x "$node_dir/bin/node" ] && \
    [ "$(cat "$node_dir/.mew-archive-sha256")" = "$node_sha" ] && \
    [ "$("$node_dir/bin/node" --version)" = "v$node_version" ] || mew_fail "Private Node.js is incomplete. Remove only $node_dir and retry."
  if [ ! -e "$cli_dir" ]; then
    mew_download "$release_base/mew-cli-standalone.tar.gz" "$mew_tmp/cli.tar.gz"
    mew_verify "$mew_tmp/cli.tar.gz" "$expected" 'Mew launcher'
    mew_bundle_paths "$mew_tmp/cli.tar.gz"
    mkdir "$mew_tmp/cli"
    tar -xzf "$mew_tmp/cli.tar.gz" -C "$mew_tmp/cli"
    "$node_dir/bin/node" --input-type=module - "$mew_tmp/cli" "$version" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const [root, version] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (metadata.name !== 'mew-ide' || metadata.version !== version) throw new Error('Mew launcher identity mismatch.');
for (const entry of ['bin/mew.mjs', 'src/runtime.mjs', 'LICENSE']) {
  if (!fs.statSync(path.join(root, entry)).isFile()) throw new Error('Mew launcher is incomplete.');
}
JS
    printf '%s\n' "$expected" > "$mew_tmp/cli/.mew-archive-sha256"
    mkdir -p "$install_root/cli"
    mv "$mew_tmp/cli" "$cli_dir"
  fi
  [ ! -L "$cli_dir" ] && [ "$(cat "$cli_dir/.mew-archive-sha256")" = "$expected" ] && \
    [ "$("$node_dir/bin/node" "$cli_dir/bin/mew.mjs" --version)" = "$version" ] || \
    mew_fail "The Mew launcher is incomplete or this release changed. Preserve your data, remove only $cli_dir, and retry."
  mkdir -p "$bin_dir"
  printf '#!/bin/sh\n# Mew bootstrap launcher\nPATH=%s/bin:$PATH\nexport PATH\nexec %s %s "$@"\n' \
    "$(mew_quote "$node_dir")" "$(mew_quote "$node_dir/bin/node")" "$(mew_quote "$cli_dir/bin/mew.mjs")" > "$mew_tmp/mew-ide"
  chmod 700 "$mew_tmp/mew-ide"
  # Copy through a file in the destination directory so replacement is atomic.
  local wrapper_tmp
  wrapper_tmp=$(mktemp "$bin_dir/.mew-ide.XXXXXXXX")
  cp "$mew_tmp/mew-ide" "$wrapper_tmp"
  chmod 700 "$wrapper_tmp"
  mew_check_wrapper "$wrapper"
  mv -f "$wrapper_tmp" "$wrapper"
  mew_log "Launcher installed: $wrapper"
  mew_log "Later: $wrapper status | $wrapper stop"
  rm -rf "$mew_tmp"
  rmdir "$mew_lock"
  trap - EXIT HUP INT TERM
  # Piped script input is finished. Restore a terminal for OS authorization.
  if [ -t 1 ] && ( : </dev/tty ) 2>/dev/null; then exec "$wrapper" "$@" </dev/tty
  else exec "$wrapper" "$@"; fi
}

mew_install_main "$@"
