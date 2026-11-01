---
title: "Mewlink deployment JSON output recovery"
description: "Records the 2026-11-01 Wrangler-output parser hardening, the corrected diagnosis of repeated local secrets JSON, credential-preserving recovery, early deployment validation and isolated regression checks. Distinguishes local fixes from the operator's pending deployment."
created: "2026-11-01"
updated: "2026-11-01"
---

# Mewlink deployment JSON output recovery

The initial diagnosis attributed `Unexpected non-whitespace character after JSON`, following a no-pending-migrations message, to the reserved `demo` username query. The old script did parse entire captured stdout, and a regression fixture reproduced that class of failure with a result array followed by a structured log object. The original stdout was not captured, so this did not establish the cause of the reported failure. The follow-up below corrects that diagnosis using the actual failing source expression and local file.

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


## Follow-up: local secrets JSON was the actual failing input

The repeated report pointed to `deploy.mjs:26:57`, which in the corrected script read `.secrets.json`, rather than Wrangler stdout. Parsing that file reproduced the exact reported character position and line. It contained eight consecutive copies of the same object. All credential values and the signing key agreed across those copies.

The original bytes were backed up in a private mode-0600 file under an ignored mode-0700 `.tmp/` recovery directory. The active file was atomically replaced with one equivalent JSON object, retained mode 0600, and was checked for value equality. Neither secret values nor the protected files were added to Git. The source of the repeated writes was not established.

`readDeploymentSecrets()` now validates the file before artifact copying or Cloudflare commands. Malformed JSON and non-object/non-string configurations produce a file-specific, redacted format error; validation does not modify credentials. The deployment entrypoint uses that result for the existing signing-key guards. The [central runbook](../operations/remote-central.md#when-deployment-fails-while-parsing-wrangler-json) owns validation and recovery instructions.

Follow-up verification:

- `npm --prefix mewlink run test:deploy`: eight tests passed, including the eight-copy regression, unchanged credential values, invalid shapes, redacted errors, and execution of the actual deployment entrypoint with isolated dependencies proving that invalid secrets stop before artifact or Cloudflare work.
- Local protected-file validation passed after recovery; active and backup files were confirmed ignored by Git.
- `npm run build`: parent TypeScript and production build passed with the existing Vite large-chunk warning.
- `npm --prefix mewlink run check`: Worker and client type checks passed.
- Targeted `oxlint` of `scripts/deploy.mjs`, `scripts/secrets.mjs` and `test/wrangler.node.test.mjs` passed without findings; `node --check` passed for both deployment modules.
- `npm run check:docs`: passed with 626 descriptions and no metadata or local-link errors. The private README's changed description and existing relative guide links were inspected separately.

No deployment, migration, launcher, or server lifecycle operation was performed during recovery. Actual remote deployment remains for the operator.
