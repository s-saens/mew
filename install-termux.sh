#!/usr/bin/env bash
set -euo pipefail

revision=c9030bb988d99b86a2085e7b82d8886188eced88
checksum=ebd51f44e4a6b5144477d1b5889d76003f55c4e5119e5ed0d455c5c5af265410
version=0.1.8
release_url="https://github.com/s-saens/mew/releases/download/mew-termux-v$version"
install_dir="$HOME/.local/opt/mew-termux-$version"
legacy_dir="$HOME/.local/opt/mew-termux-0.1.7"

fail() { printf '[mew] %s\n' "$*" >&2; exit 1; }

[ "$(uname -o 2>/dev/null)" = Android ] && command -v pkg >/dev/null 2>&1 ||
  fail 'Run this installer in native Termux on Android.'

case "${PREFIX:-}" in
  /*) ;;
  *) fail 'Termux PREFIX is missing or is not an absolute path.' ;;
esac
bin="$PREFIX/bin"
launcher="$bin/mew"
launcher_marker='# Mew Termux launcher'
check_launcher() {
  if [ -e "$launcher" ] || [ -L "$launcher" ]; then
    [ ! -L "$launcher" ] && [ -f "$launcher" ] && [ "$(sed -n '2p' "$launcher")" = "$launcher_marker" ] ||
      fail "Preserving an existing command: $launcher"
  fi
}
check_launcher
[ -x "$bin/bash" ] && [ -w "$bin" ] || fail "Termux needs a writable command directory and Bash in $bin."

mkdir -p -- "$(dirname -- "$install_dir")"
# Serialize setup across versions because settings and the public launcher are shared.
lock="$legacy_dir.lock"
mkdir -- "$lock" 2>/dev/null || fail "Installation is locked. If the installer has stopped, remove: $lock"
cleanup() {
  if [ -n "${launcher_temp:-}" ]; then rm -rf -- "$launcher_temp"; fi
  rm -rf -- "$lock"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -e "$install_dir" ] && [ ! -L "$install_dir" ] && [ ! -L "$legacy_dir" ] &&
  [ -f "$legacy_dir/.mew-termux-source" ] && [ "$(cat "$legacy_dir/.mew-termux-source")" = "$revision" ]; then
  install_dir="$legacy_dir"
fi
marker="$install_dir/.mew-termux-source"

if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  [ ! -L "$install_dir" ] && [ -f "$marker" ] && [ "$(cat "$marker")" = "$revision" ] &&
    [ -f "$install_dir/mew" ] || fail "Preserving an existing installation directory: $install_dir"
else
  printf '[mew] Downloading Mew Termux source…\n' >&2
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
printf '%s\n' "$version" > "$lock/version"
mv -fT -- "$lock/version" "$install_dir/.mew-install-version"
cd -- "$install_dir"
bash ./mew setup --termux-defaults </dev/null

launcher_temp=$(mktemp -d "$bin/.mew.XXXXXXXX")
printf '#!%s/bash\n%s\nexec %q %q "$@"\n' "$bin" "$launcher_marker" "$bin/bash" "$install_dir/mew" > "$launcher_temp/mew"
chmod 755 -- "$launcher_temp/mew"
check_launcher
if [ -e "$launcher" ] || [ -L "$launcher" ]; then
  mv -fT -- "$launcher_temp/mew" "$launcher"
else
  mv -nT -- "$launcher_temp/mew" "$launcher"
  [ ! -e "$launcher_temp/mew" ] || fail "Preserving an existing command: $launcher"
fi
printf '[mew] Run mew help for commands.\n' >&2
