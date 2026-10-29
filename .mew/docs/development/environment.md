---
title: "Server configuration initialization contract"
description: "Implementation contract for preserving the initial import order of the server configuration module and dynamic workspace and data paths. Environment variable usage belongs in the public guide."
updated: "2026-10-29"
---

`server/config.ts` alone defines the loading order and default paths. **It must be imported before other server modules in the server entry point.** If imported later, other modules may read values such as `MEW_DATA_DIR` first, preventing configuration file values from taking effect.

Do not revert `MEW_WORKSPACE` to a fixed path. Host environment variables, defaults, and operator choices are managed in [Server configuration](../../../docs/configuration/environment.md).
