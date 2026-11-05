#!/bin/sh
# Invoked only inside the installer's verified private environment.
set -eu
installation_id=$1
version=$2
node_archive=$3
runtime_archive=$4
payload=$5
runtime_sha=$6
node_sha=$7
node_version=$8
case "$installation_id" in ''|*[!a-f0-9]*) exit 2;; esac
case "$version" in ''|*[!0-9.]*) exit 2;; esac
test "$(cat /opt/mew/.installation-id)" = "$installation_id"
test "$(. /etc/os-release; printf %s "$ID:$VERSION_ID")" = 'ubuntu:24.04'
printf '%s  %s\n' "$node_sha" "$node_archive" | sha256sum --check --status
printf '%s  %s\n' "$runtime_sha" "$runtime_archive" | sha256sum --check --status
versions=/opt/mew/versions
destination="$versions/$version"
if ! id mew >/dev/null 2>&1; then useradd --create-home --user-group --shell /bin/bash mew; fi
test "$(id -u mew)" -ne 0
test "$(getent passwd mew | cut -d: -f6)" = /home/mew
group=$(id -gn mew)
install -d -o mew -g "$group" -m 700 /home/mew/workspace /home/mew/.local /home/mew/.local/share /home/mew/.local/share/mew /home/mew/.cache /home/mew/.cache/mew
if runuser -u mew -- /bin/sh "$payload/verify-linux.sh" "$version" "$runtime_sha" "$node_version"; then exit 0; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates git xz-utils xvfb ffmpeg python3 libx11-6 libxtst6 util-linux
mkdir -p "$versions"
stage=$(mktemp -d "$versions/.prepare-$version-XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT HUP INT TERM
mkdir -p "$stage/node" "$stage/cli" "$stage/runtimes/$version-linux-x64-node24"
tar --no-same-owner -xJf "$node_archive" --strip-components=1 -C "$stage/node"
tar --no-same-owner -xzf "$runtime_archive" -C "$stage/runtimes/$version-linux-x64-node24"
cp -R "$payload/cli/." "$stage/cli/"
cp "$payload/launch-linux.sh" "$stage/launch.sh"
chmod 755 "$stage/launch.sh"
export PATH="$stage/node/bin:$PATH"
runtime="$stage/runtimes/$version-linux-x64-node24"
node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.version!==process.argv[2]||m.platform!=="linux"||m.arch!=="x64"||m.nodeMajor!==24)throw Error("Runtime identity mismatch")' "$runtime/mew-runtime.json" "$version"
node "$runtime/node_modules/playwright-core/cli.js" install-deps chromium
if ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then
  node "$runtime/node_modules/playwright-core/cli.js" install chrome
fi
# Root-owned application files; browser downloads and accounts belong to mew.
chmod -R a+rX "$stage"
runuser -u mew -- env HOME=/home/mew PATH="$stage/node/bin:$PATH" node "$runtime/server/browser-dependencies.js" --install
printf %s "$runtime_sha" > "$stage/.complete"
(cd "$stage" && find . -type f ! -path './.integrity.sha256' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > .integrity.sha256)
runuser -u mew -- /bin/sh "$payload/verify-linux.sh" "$version" "$runtime_sha" "$node_version" "$stage"
backup="$versions/.previous-$version-$$"
if [ -e "$destination" ]; then mv "$destination" "$backup"; fi
if ! mv "$stage" "$destination"; then
  if [ -e "$backup" ]; then mv "$backup" "$destination"; fi
  exit 1
fi
trap - EXIT HUP INT TERM
if [ ! -e /etc/wsl.conf ]; then printf '[user]\ndefault=mew\n' > /etc/wsl.conf; fi
