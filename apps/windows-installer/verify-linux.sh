#!/bin/sh
set -eu
version=$1
runtime_sha=$2
node_version=$3
case "$version" in ''|*[!0-9.]*) exit 2;; esac
base=${4:-"/opt/mew/versions/$version"}
test "$(cat "$base/.complete")" = "$runtime_sha"
test -r "$base/.integrity.sha256"
(cd "$base" && sha256sum --check --status .integrity.sha256)
test "$("$base/node/bin/node" --version)" = "v$node_version"
test -r "$base/launch.sh"
test -r "$base/cli/bin/mew.mjs"
test "$("$base/node/bin/node" "$base/cli/bin/mew.mjs" --version)" = "$version"
runtime="$base/runtimes/$version-linux-x64-node24"
test -r "$runtime/server/cli-host.js"
test -r "$runtime/server/browser-dependencies.js"
test -r "$runtime/server/first-owner-setup.js"
test -r "$runtime/server/account-storage.js"
test -r "$runtime/dist/index.html"
test -x "$runtime/bin/tmux"
"$base/node/bin/node" -e 'const fs=require("fs");const [runtime,cli,version]=process.argv.slice(1);const m=JSON.parse(fs.readFileSync(runtime)),c=JSON.parse(fs.readFileSync(cli));if(m.version!==version||m.platform!=="linux"||m.arch!=="x64"||m.nodeMajor!==24||m.entrypoint!=="server/cli-host.js"||m.browserDependencies!=="server/browser-dependencies.js"||c.version!==version)throw Error("Mew runtime verification failed")' "$runtime/mew-runtime.json" "$base/cli/package.json" "$version"
