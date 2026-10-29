---
title: "Excluding Mewlink integration from the development server"
description: "Records the removal of the Mewlink agent and management APIs from npm run dev on 2026-10-29, retention of production server integration, isolated regression, type, and lint check results, existing documentation link errors, and the scope not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

Prevented `npm run dev` from connecting to Mewlink using a saved device registration and using the same device's central connection as the production server. Removed the Mewlink agent import, instantiation, and management API registration from `server/plugin.ts`. The normal startup path in `server/serve.ts` is retained. Current behavior follows the [Mewlink connection contract](../development/remote-access.md#architecture-and-identity).

`server/plugin.test.ts` calls the actual development API setup function with isolated dependencies to check that it neither loads the Mewlink module nor registers management APIs. It checks both operation with an HTTP server and middleware mode, as well as local authentication and normal API registration. It does not start the app server or read saved device registrations.

Verification results:

- `node --test server/plugin.test.ts server/vite-config.test.ts`: 2 passed.
- `MEW_DATA_DIR="${TMPDIR:-/tmp}/mew-test-data" node --test server/remote-access-agent-startup.test.ts server/remote-access-registration-network.test.ts`: 24 production agent startup and registration checks passed. These are isolated checks using a mock central service and network.
- `npx tsc -b` and `npm run lint -- server/plugin.ts server/plugin.test.ts`: passed.
- `npm run check:docs`: 0 description errors. Failed due to 19 existing image path errors in README and link errors in feature and task documents. Links in the documents changed here were checked separately.
- `git diff --check` on the work files: passed.

The app was not built or deployed, the launcher was not run, and the development and production servers were not started or restarted. The user applies changes to running instances and verifies concurrent operation with the actual central service.
