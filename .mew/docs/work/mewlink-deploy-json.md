---
title: "Mewlink deployment JSON output recovery"
description: "Records the 2026-11-01 deployment-script fix for JSON mixed with Wrangler logs, isolated regression coverage, and local verification. Distinguishes source changes from the operator's pending deployment."
created: "2026-11-01"
updated: "2026-11-01"
---

# Mewlink deployment JSON output recovery

The reported deployment stopped at the reserved `demo` username query with `Unexpected non-whitespace character after JSON`, after remote migrations reported no pending changes. The script used `JSON.parse` on the entire captured stdout. The regression fixture reproduces that failure with a JSON query result followed by another structured log object; the original failed stdout was not captured during this task.

The private `mewlink/scripts/wrangler.mjs` runner fixes captured log verbosity, waits for child stream closure, and selects one result array from mixed output. Complete structured log objects are consumed together so their nested arrays do not become query results. Database and secret listing use the same path. Missing, malformed, or ambiguous results stop deployment, and query success and reserved-name checks still run. The [central runbook](../operations/remote-central.md#when-deployment-fails-while-parsing-wrangler-json) owns recovery instructions.

## Verification

- `npm --prefix mewlink run test:deploy`: six isolated tests passed, covering clean and mixed JSON output, ANSI text, nested values and escapes, invalid and ambiguous responses, reserved-name protection, captured log verbosity, complete stdout, command failure, and spawn failure.
- `node --test server/mewlink-demo.test.ts`: five existing demo routing and reserved-name protection tests passed.
- `npm --prefix mewlink run check`: Worker and client type checks passed.
- `npm run build`: passed; Vite reported its large-chunk warning.
- `npm run lint`: passed with warnings in existing source files. Explicit lint of the changed private scripts and test passed without warnings.
- `node --check mewlink/scripts/deploy.mjs` and `node --check mewlink/scripts/wrangler.mjs`: passed.
- `npm run check:docs`: description and local-link checks passed.

No Cloudflare command, deployment, migration, launcher, or server lifecycle operation was run. The operator must retry deployment to verify the actual remote path.
