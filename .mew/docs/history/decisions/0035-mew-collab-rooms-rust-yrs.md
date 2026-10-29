---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: move mew collaboration room state to Rust (yrs) and make the disk→room bridge a protocol client. Abandon Rust for RTT and search. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning documents for the current contract."
title: "0035 — Move mew collaboration room state to Rust (yrs) and make the disk→room bridge a protocol client. Abandon Rust for RTT and search"
created: 2026-08-04
updated: 2026-08-20
---

- Date: 2026-08-04
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

This investigation began with a report that "opening documents is slow" in mew. The cause was the
number of sequential round trips, not bandwidth: document body rendering waits for `collab.synced` (`packages/editor/src/Editor.tsx`), and synced becomes true only
after the client sends sync step1 and the server responds with step2. TCP + (TLS) + WS upgrade + step1/step2 = 3–5
RTTs.

All candidates identified during the investigation were reviewed, and some were adopted while others were dropped. This ADR records that split
in one place, because the reasons for dropping options leave no trace in the code.

Already implemented (outside this ADR's scope): the server now sends unsolicited sync step2 (the room's full state) immediately
upon connection (`server/collab.ts`). 3 RTTs → 2 RTTs. In the Yjs sync protocol, step2's state vector is optional (omitted = full state), and applying
updates is idempotent, so this change works within the existing protocol and requires no client changes. Because
it does not change the protocol envelope, it is not a difficult choice to reverse.

There were three candidates for migration to Rust, ranked as follows.

1. Headless tiptap + happy-dom in `server/collabAgent.ts` (the strongest code smell)
2. Collaboration room state in `server/collab.ts` (Y.Doc + sync protocol)
3. Node line-by-line scanning in `server/search.ts`

## Options

### Rust migration targets

1. Candidate 1 (move collabAgent to Rust) — Benefit: the ~170 ms for opening the first room came
   from here. Drawback: blocked. This bridge converts Markdown ↔ ProseMirror using `tiptap-markdown` (internally markdown-it) plus
   mew's own node serializers (`serverExtensions.ts`, `databaseMarkdown.ts`, `MediaNodes.ts`, and `imageSchema.ts`). Unless a Rust implementation matches this combination's output byte for byte, user
   documents will be silently corrupted. Moreover, this ~170 ms occurs only once
   per server lifetime and disappears with warmup (evidence below).
2. Candidate 2 (move room state to Rust) — Benefit: y-protocols is language-neutral, so the implementation can be replaced without
   changing the wire format. Client changes: 0. Drawback: there is a new blocker (below).
3. Candidate 3 (move search to Rust) — Benefit: almost none (see measurements). Drawback: JS `RegExp` and Rust's `regex` crate have different
   semantics: lookahead and backreferences are unsupported, and `$1` expansion in `replaceInFile` also uses JS semantics. This changes the behavior
   of the regex mode users rely on.

### Reducing round trips (a separate track, all abandoned)

- Socket multiplexing — N rooms on one socket. Drawback: a roomKey prefix on every message changes the wire
  format. Since `npm run build` deploys immediately, open tabs encounter the new server with old JS, breaking collaboration
  in those tabs until refresh. Worse, there is no unsubscribe path: `ws.on('close')` is the only departure
  point, so switching documents does not trigger close. An explicit leave message must be sent exactly
  once from each of five paths (tab close, pane close, project switch, unmount, and StrictMode
  double mount). A leak in any one simultaneously causes missing `removeAwarenessStates` (ghost cursors), missing `closeRoomIfEmpty` (headless tiptap and fs
  watcher leaks in each room), and exhaustion of `MAX_ROOMS`. And the gain is only 1 RTT on a cold open.
- Socket pooling — keep sockets and Y.Doc alive when switching tabs. A→B→A takes 0 RTTs. Drawback: cursors remain in inactive
  documents, and 5 rooms plus 5 bridge editors stay alive per client, hitting `MAX_ROOMS=200` at ~40 concurrent users.

### The bridge losing access to room state (blocker for candidate 2)

`server/collabAgent.ts` directly holds the room's JS `Y.Doc` through `Collaboration.configure({ document: room.doc, field: 'default' })`. This file is the only external consumer
of `room.doc`. If room state moves to Rust, this coupling no
longer works.

- (a) Make the bridge a protocol client — it has its own `Y.Doc` and synchronizes with the room through sync messages. Benefit:
  decouples it and uses the same path as browser clients. Drawback: requires rewiring the bridge.
- (b) Move the bridge to Rust too — hits the same wall as candidate 1 (risk of document corruption).
- (c) Keep a doc on both sides — two sources of truth. They will inevitably diverge.

## Decision

Proceed only with candidate 2. Drop candidates 1 and 3 and round-trip reduction through multiplexing and pooling.

Move room state to Rust and convert the bridge to (a), a protocol client. Keep the boundary minimal.

What Rust owns — an in-process napi-rs native module. Only the room's `yrs::Doc` and sync protocol (step1 / step2
/ update). Do not move it to a separate process; that would require another set of ports and authentication.

What stays in Node — ws upgrades and the entire `authorizeCollab` (`server/reqAuth.ts`) authentication boundary, ws framing, the `clients`
map, `MAX_ROOMS`, `RoomLifecycle`, and all awareness handling. Awareness is a clock + JSON map, not a CRDT, so there is no reason to move
it to Rust; keeping it in Node greatly reduces the Rust surface. The permission model
does not change.

Bridge transport uses an in-process channel, not an actual loopback socket. Connecting through a loopback socket
would require creating a new route for the bridge to pass `authorizeCollab` (which blocks guests). That means creating an internal authentication
bypass and opening a hole in the authentication boundary. A channel keeps the authentication surface at 0 while preserving
the essence of (a): "the bridge is a client, not the owner of the room."

Migration uses the `MEW_COLLAB_RUST` flag. It defaults to off (the existing TS path). Enable it after verification, then remove the TS path after
it is enabled. The two implementations coexist only during this migration: a failure in the collaboration relay can wipe
out user documents, so we will not replace it immediately on the server the team uses.

## Rationale

Why candidate 3 was dropped — measurements. A warm `function` search in actual workspaces:

| Project | File count | Time |
|---|---|---|
| mew | 200 | 9ms |
| docs | 166 | 7ms |
| liiiiv-life | 234 | 4ms |

`MAX_FILES` is 4000, and the actual maximum is 234. Rust would take 1–2 ms; an 8 ms gain would not be noticeable.
The costs are requiring cargo for `./mew setup` (this is a public, self-contained repo; [ADR 0023](0023-mew-selfhost-packaging-repo.md)), platform-specific prebuilt binaries,
and changed regex semantics. Do not retry; reconsider when file counts reach the tens of thousands.

Why candidate 1 was dropped — warmup solved it. Measured time to open the first `.md` room:

```
예열 없음: 176.6ms → 5.8 → 4.4
예열 있음:  22.3ms → 6.5 → 4.6
```

Preloading the DOM shim and tiptap module graph at boot removed 154 ms from the user path. Do this instead
of risking document corruption.

Why round-trip reduction was dropped. Multiplexing breaks the wire format (combined with immediate deployment, this breaks open tabs)
and creates five leak paths while saving only 1 RTT on a cold open. Pooling offers a larger gain (A→B→A in 0 RTTs) but reduces the concurrent
connection limit by a factor of 5. The unsolicited step2 already implemented has already removed one round trip, and the remaining round trips are TCP,
TLS, and the upgrade, which the application cannot change. Do not retry either option; revisiting them requires a new ADR that supersedes
this one.

Why choose candidate 2: y-protocols is language-neutral, so the implementation can be replaced without
changing the wire format — client changes total 0, and there is no deployment
skew problem of the kind that blocked multiplexing. The ceiling is reaching `MAX_ROOMS=200` or documents on the
order of MB, and we have not reached it yet, so this decision follows an instruction rather than an urgent performance need. Compilation against
yrs 0.27.3 confirmed that the required APIs (`state_vector` · `encode_state_as_update_v1` · `apply_update` · `observe_update_v1`) actually exist.

The tradeoff, stated explicitly: we lose the ability to run `server/` directly as `.ts` without a build. Since this supported
mew's development speed, the native module is confined to room state rather than all of `server/`.

## Results

2026-08-04 — Implementation complete; deployed with JS Yjs as the default.

- Structure: `server/syncCodec.ts` (frame encoding and decoding) · `server/roomDoc.ts` (two backends) · `server/collab.ts` (rooms,
  authentication, awareness, lifecycle) · `server/collabAgent.ts` (bridge = protocol client) · `mew/native/collab` (Rust crate, napi-rs).
  The runtime contract is in the Collaboration Rooms section of mew/README.
- The protocol paths have been unified — with the bridge now an in-process client, it goes
  through the same `admit`/`handleFrame` as the ws path. Backend switching is contained within `roomDoc.ts`.
- Validation: `server/syncCodec.test.ts` performs byte-for-byte comparisons with y-protocols (the key safeguard, since a wire
  format mismatch would break every open tab at deployment) plus 6 types of
  untrusted bytes. `server/collabAgent.test.ts` verifies bridge injection and ignoring app echoes using a real ws server and
  real clients — the same tests also passed with `MEW_COLLAB_RUST=1`. All 170 tests passed.
- Deployed with the flag off. `.node` is a platform-specific artifact, so it is built with `npm run build:native` rather than committed. If the flag is enabled
  and loading fails, it throws instead of silently falling back to JS.
- Two pitfalls were caught during implementation and documented in code comments: ① Calculating broadcast diffs from state vector diffs
  loses deletion-only updates (state vectors do not contain the delete set) — obtain them from the update observer. ② Counting the
  bridge's in-process client as a room participant prevents the room from ever closing, accumulating a headless
  editor and fs watcher for each room — only actual connections determine room lifetime.

Also deployed in the same batch of work (outside this ADR's scope): bridge editor module warmup at startup (first document open: 177ms
→ 22ms) · exponential backoff for collaboration socket reconnection · image compression before upload.
