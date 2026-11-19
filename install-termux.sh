#!/usr/bin/env bash
set -euo pipefail

revision=c9030bb988d99b86a2085e7b82d8886188eced88
checksum=ebd51f44e4a6b5144477d1b5889d76003f55c4e5119e5ed0d455c5c5af265410
version=0.1.7
release_url="https://github.com/s-saens/mew/releases/download/mew-termux-v$version"
install_dir="$HOME/.local/opt/mew-termux-$version"
marker="$install_dir/.mew-termux-source"

fail() { printf '[mew] %s\n' "$*" >&2; exit 1; }

[ "$(uname -o 2>/dev/null)" = Android ] && command -v pkg >/dev/null 2>&1 ||
  fail 'Run this installer in native Termux on Android.'

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
  printf '[mew] Downloading Mew Termux %s source…\n' "$version" >&2
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
bash ./mew setup --termux-defaults </dev/null
