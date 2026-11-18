#!/usr/bin/env bash
set -euo pipefail

revision=812bc2ed90f7952f193a1bdb670325b7413e2652
checksum=9e43dc068b6b96259867538939fe02e2323f4a2db91489a2c7c62a034e28d99b
release_url=https://github.com/s-saens/mew/releases/download/mew-termux-v0.1.5
install_dir="$HOME/.local/opt/mew-termux"
marker="$install_dir/.mew-termux-source"

fail() { printf '[mew] %s\n' "$*" >&2; exit 1; }

[ "$(uname -o 2>/dev/null)" = Android ] && command -v pkg >/dev/null 2>&1 ||
  fail 'Run this installer in native Termux on Android.'
if ! ( : </dev/tty ) 2>/dev/null; then
  fail 'Run this installer in a Termux terminal so setup can ask for package and workspace settings.'
fi

mkdir -p -- "$(dirname -- "$install_dir")"
lock="$install_dir.lock"
mkdir -- "$lock" 2>/dev/null || fail "Installation is locked. If the installer has stopped, remove: $lock"
cleanup() {
  rm -rf -- "$lock"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  [ ! -L "$install_dir" ] && [ -f "$marker" ] && [ "$(cat "$marker")" = "$revision" ] &&
    [ -f "$install_dir/mew" ] || fail "Preserving an existing installation directory: $install_dir"
else
  printf '[mew] Downloading Mew 0.1.5 source…\n' >&2
  archive="$lock/source.tar.gz"
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 15 --max-time 600 \
    --output "$archive" "$release_url/mew-source.tar.gz"
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status ||
    fail 'Mew source archive checksum verification failed.'
  mkdir -- "$lock/source"
  tar -xzf "$archive" -C "$lock/source" --strip-components=1
  [ -f "$lock/source/mew" ] && [ -f "$lock/source/package-lock.json" ] ||
    fail 'The Mew source archive is incomplete.'
  printf '%s\n' "$revision" > "$lock/source/.mew-termux-source"
  mv -nT -- "$lock/source" "$install_dir"
  [ ! -d "$lock/source" ] || fail "Preserving an existing installation directory: $install_dir"
fi

printf '[mew] Running setup in %s\n' "$install_dir" >&2
cd -- "$install_dir"
bash ./mew setup </dev/tty
