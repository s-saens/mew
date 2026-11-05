#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test "$(id -un)" = mew
export HOME=/home/mew
export PATH="$base/node/bin:$HOME/.local/bin:$PATH"
export NPM_CONFIG_PREFIX="$HOME/.local"
exec "$base/node/bin/node" "$base/cli/bin/mew.mjs" --installer --port 0 --workspace "$HOME/workspace" --data-dir "$HOME/.local/share/mew" --cache-dir "$base/runtimes"
