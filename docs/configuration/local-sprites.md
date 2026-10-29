---
title: "External local-sprites MCP connection"
description: "Explains how to connect local-sprites, a tool separate from Mew, through MCP, generate and select a representative image with an image-only model, then proceed to animation and optional Mewpet registration, along with reuse and distribution boundaries."
created: 2026-10-19
updated: 2026-10-19
상위파일: "agent-harness.md"
---

# External local-sprites MCP connection

`local-sprites` is an open-source tool separate from Mew. Its generation code, Python dependencies, and model weights are not included in Mew distributions. It can also be reused in other MCP clients, and the separate project's `README.md` owns installation, model, generation, and validation guidance. This follows [Decision 0021](../../.mew/docs/decisions/0021-external-local-sprites.md).

## Connect to Codex

The current tool source is at `/home/saens/dev/local-sprites`, and installed models, the virtual environment, and work data are at `~/.local/share/mew-sprites`. Existing data is preserved without downloading it again. The default data location for new installations is `~/.local/share/local-sprites`.

The following is an example of the current installation, where Mew's active `DATA_DIR` is `/home/saens/dev/mew/.data`. For other installations, replace the source, Python, data, and skin paths with their actual absolute paths. Check [Mew data location](../../.mew/docs/development/architecture.md#server-state-files-data).

```bash
"$HOME/.local/share/mew-sprites/venv/bin/python" \
  /home/saens/dev/local-sprites/register_mcp.py \
  --runtime codex \
  --python "$HOME/.local/share/mew-sprites/venv/bin/python" \
  --sprites-home "$HOME/.local/share/mew-sprites" \
  --skins-dir /home/saens/dev/mew/.data/mewpet/skins
```

Add `--replace` when moving an existing `local-sprites` entry from its old path. Preserve other MCP entries. Registration does not require a Mew checkout or Node.js. For other clients, register the stdio configuration obtained with `--print-config` in that client's format. Omit `--skins-dir` if Mewpet registration is not needed.

## Use in chat

After registration, open a **New Codex chat** in Mew and check the installation, GPU, and registration path with `local_sprite_status`. Example: **“Draw a Mewpet using the attached image as a reference. Create idle, walking, and grabbed animations and show me the results.”** A reference image is optional; provide it as a local path accessible to the agent.

The agent first creates a representative image using an image-only model with `generate_character` and shows it using `get_sprite_job` and `preview_character`. If only a representative image was requested, it stops here. Once the user selects an image, it passes the corresponding `character_job_id` or the selected image's local path to `generate_sprites` to create animations, then checks them with `preview_sprites`. Generation completion means the files are ready; the image's form and animation quality must be checked in the actual output. Motion generation is currently experimental, with unresolved appearance distortions, unwanted objects, and loop continuity issues, so the original frames and GIF must be inspected.

If the user requests registration, `install_sprite_skin` adds it to the specified `<DATA_DIR>/mewpet/skins`. Then select it under **Settings → Mewpet**. Mew owns the [skin format](../../.mew/docs/features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#registering-skins-from-files), and installing or connecting the generation tool does not require building or restarting Mew.
