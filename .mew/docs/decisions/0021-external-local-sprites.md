---
title: "0021 — Separate the Local Sprite Generator into an External Project"
description: "Decision to exclude generation code, installation, and models from Mew distributions and move them to the independent local-sprites project. Integrate only through a general-purpose MCP connection and optional Mewpet skin output, reusing existing external model data."
created: 2026-10-19
updated: 2026-10-19
---

# 0021 — Separate the Local Sprite Generator into an External Project

Status: Adopted. Supersedes the source, installation, and deployment boundaries in [Decision 0017](0017-local-sprite-generation.md).

## Background

The generator is a personal local tool to reuse across multiple MCP clients and is not part of Mew's distribution. The initial implementation inside the repository did not make this boundary clear.

## Decision

1. Move generation code, installation tools, Python dependencies, model pinning information, and dedicated checks to the independent repository `local-sprites`. Mew does not distribute generation code, weights, or Python dependencies.
2. The generator runs without a Mew checkout or Node.js and connects through general-purpose stdio MCP. The external project provides a Codex registration tool and configuration output for other MCP clients.
3. Mew integrates only through existing runtime MCP settings and the optional `<DATA_DIR>/mewpet/skins` output path. The external project owns generator installation, models, and operations documentation; Mew owns the skin format and connection guidance.
4. Move the current source to `/home/saens/dev/local-sprites` and retain the models, virtual environment, and jobs in the existing `~/.local/share/mew-sprites` without downloading them again. New installations default to `LOCAL_SPRITES_HOME` and `~/.local/share/local-sprites` and remain compatible with the previous `MEW_*` settings.

## Rationale and Impact

Separate the lifetimes, dependencies, and distributions of Mew and the generator, and reuse the same models and tools in other clients. Mew's runtime, build, deployment, and renderer contracts remain unchanged, and users install the generator only in environments that need it. [External MCP Guide](../../../docs/configuration/local-sprites.md) owns the current connection instructions.
