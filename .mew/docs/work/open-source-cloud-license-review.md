---
title: "Mew open-source and cloud monetization license review"
created: 2026-09-14
updated: 2026-10-23
description: "A contemporaneous record of the review of MIT, use-restricted licenses, and third-party rights. Decision 0053 supersedes it regarding the adoption of a source-available license on 2026-10-23, while preserving unresolved conditions concerning existing MIT grants, contribution rights, and distribution notices."
상위파일: "_work.md"
---

> 2026-10-23 follow-up: [Decision 0053](../decisions/0053-source-available-license.md) switched new distributions of Mew itself to the [Mew Source Available License 1.0](../../../LICENSE). It permits internal business use and restricts Mew sales and paid hosting. The MIT status and non-adoption descriptions below are historical records; existing MIT grants and third-party rights remain in effect. New contributions follow the [Contribution acceptance criteria](../../../docs/development/contributing.md).

> 2026-09-28 follow-up: [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md) removed RAG and its dedicated models and dependencies. The RAG implementation and review items below are historical records, not current adoption or deployment tasks.


[Public release preparation plan](open-source-release-hardening-plan.md)

The goal is to prepare for open-source promotion and distribution by 2026-09-30 and monetize through a managed cloud. This document records the status, recommendations, and unresolved issues; it is neither a license-change decision nor an assurance of release readiness. The current MIT decision follows [ADR 0023](../history/decisions/0023-mew-selfhost-packaging-repo.md) and [ADR 0112](../history/decisions/0112-mew-public-release-security-and-credential-boundaries.md).

## Assessment and options

**The recommendation to retain MIT was put on hold as requirements became more specific in follow-up discussions.** The user wants to allow internal corporate use, private modifications, and free noncommercial redistribution while restricting sales and paid hosting of Mew itself and modified versions. A use-restricted source-available license suited to these requirements is under review but has not yet been adopted. The current MIT license remains unchanged; an actual change will first require a [Mew-specific ADR](../decisions/README.md). The initial MIT recommendation prioritized distribution, ease of adoption, and managed cloud billing, and does not meet the requirement to restrict competing services.

| Option | Mew's paid cloud | Competitors' paid hosting | Source disclosure conditions and implications |
| --- | --- | --- | --- |
| Retain MIT | Allowed | Allowed | Modified versions may remain private. Preserve copyright and license notices |
| Apache-2.0 | Allowed | Allowed | Private modifications allowed. Additional conditions include an explicit contributor patent grant, no trademark grant, and NOTICE and change notices |
| AGPL-3.0 | Allowed | Allowed | If a modified program is provided over a network, users must be offered an opportunity to receive that version's Corresponding Source free of charge |
| Source-available license with restrictions on competing services | Allowed depending on the terms | Restricted depending on the wording | Cannot be described as open source under the OSI definition because it restricts fields of endeavor |

Sources: [MIT text](https://opensource.org/license/mit), [Apache-2.0 §§3–6](https://www.apache.org/licenses/LICENSE-2.0), [AGPL §§5·13](https://opensource.org/license/agpl-3.0), [OSI definition §6](https://opensource.org/osd).

AGPL does not require free service or prohibit competition. Competitors that comply with the obligation to disclose modified source can offer paid hosting, and competition is not prohibited when running the original version unchanged either. Disclosure covers the program's Corresponding Source; it does not automatically include customer documents, passwords, or all independent systems of the operating company. Whether separate billing and operations code constitutes an independent work or a derivative or combined program depends on the actual structure. Merely separating folders or processes does not settle the question.

If the primary goal is to require disclosure of cloud improvements, consider AGPL as a candidate for the next version. In that case, the scope of integration with SDKs under separate terms, the right to offer commercial exception licenses, and the contribution policy must be designed together. Consider switching to Apache-2.0 when the goal is corporate adoption and patent grants; it offers no protection against competing clouds.

## Mew creator's commercial use rights — third-party code review

**The core OSS dependencies reviewed so far allow the creator to operate Mew as a paid cloud or distribute it as a paid product.** This is separate from which license to grant for Mew itself. This assessment was not based solely on the MIT designation at the root. In addition to the dependency list below, the review covered lock metadata for direct dependencies, LICENSE files in major installed packages, initial commits, and source attribution comments.

| Component | Verified license | Creator's commercial use and conditions |
| --- | --- | --- |
| React, Tiptap and extensions in use, CodeMirror, Yjs, xterm, node-pty, Express, rrweb | MIT | Paid services and products allowed. Preserve original copyright and license notices |
| LanceDB, Transformers.js, PDF.js, Playwright, ACP adapter | Apache-2.0 | Paid services and products allowed. Comply with the license and applicable NOTICE and change notice requirements. Excludes the separate agreement for the Claude SDK underlying the adapter |
| sharp-libvips prebuilt libraries | LGPL-3.0-or-later and others | Commercial use allowed. Binary distribution must comply with requirements for library source and notices, and replacement, relinking, and debugging rights as applicable to the linking method |
| lightningcss | MPL-2.0 | Commercial use allowed. Distribution of this code requires compliance with source and notice conditions for the MPL portions. Not regarded as an obligation to apply MPL to all of Mew |
| Chromium, FFmpeg, and other components bundled with Electron | Multiple licenses | Not all MIT. Check component-specific conditions in the remote desktop distribution documentation |

Sources: actual package-lock and installed package texts, [MIT](https://opensource.org/license/mit), [Apache-2.0 §4](https://www.apache.org/licenses/LICENSE-2.0), [LGPL §4](https://opensource.org/license/lgpl-3-0), [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [FFmpeg distribution guidance](https://ffmpeg.org/legal.html).

Using this permissive OSS does not require publishing Mew's own code under the same licenses. Separate commercial terms can be designed, but **third-party code cannot all be labeled as owned by Mew, nor can its original usage rights be removed.** Exceptions must specify that each third-party component remains subject to its original license, and Mew's usage restrictions must not block LGPL or MPL rights. In particular, no blanket promise should be made that distributed modified MPL files or modified LGPL libraries can remain private. This does not approve the compatibility of a restrictive Mew license that has not yet been written.

GPL and AGPL do not themselves prohibit commercial use. However, adding Mew's resale prohibition to derivative or combined works covered by them may create a separate conflict. The current npm lock and source attribution search found no evidence explicitly identifying Mew itself as a GPL/AGPL derivative. Optional LGPL entries in Rust follow the OR conditions in the table below.

The README in the initial `535570a` commit contains React, TypeScript, and Vite template guidance, and the initial package.json also declares editor and server library dependencies. The source attribution search found no explicit evidence that an entire separately licensed restrictive product had been imported. **On 2026-09-14, the user confirmed that they had never directly copied code from another project.** This user statement is incorporated as a premise of the review; no additional verification is requested based on a hypothetical unverified manually copied project. The scope of package and asset license verification remains unchanged.

**Remaining verification is distinct from a determination that commercial use is prohibited.** Provider agreements for the Claude SDK, official CLIs, and other optional runtimes; the rights basis for RAG conversion models; past publication of the former Oreo Cat asset; and notices and source provision for actual distributions remain outstanding as listed below. The assessment therefore allows commercial use of the core OSS, but does not report legal review of all features and distribution forms as complete.

## Implications of MIT already being public

- The unauthenticated GitHub API and public page confirmed that [liiiiv-life/mew](https://github.com/liiiiv-life/mew) was public and labeled MIT. Public main was `8d2f1d2e8dd4983abf12336543b6a6985882ffab`.
- The local baseline HEAD is `abadf3b79ef5b7c39a60de811fcd9394024f87af`, with uncommitted changes. The dependency review below is based on the current working tree. It is not treated as the same distribution as public main.
- [LICENSE](../../../LICENSE) and [package.json](../../../package.json) specify MIT, and the copyright notice is `2026 mew contributors`. `private: true` prevents npm publication; it does not restrict source use to noncommercial purposes.
- Local history records MIT being added on 2026-07-31, removed on 09-03, and added again on 09-07. Temporarily deleting the license file cannot be regarded as revoking rights already granted.

Even if future new code is released under different terms, **do not assume that use, modification, and redistribution of versions already lawfully provided under MIT can be retroactively prohibited.** Business planning must assume that competing forks can be created from older versions. Existing notices must be preserved even when applying new terms to MIT code. A single contributor name or commit count cannot establish ownership of rights belonging to companies, employers, or external works. Sources: [MIT permissions](https://choosealicense.com/licenses/mit/), [GitHub guidance on license changes and rights holders](https://opensource.guide/legal/).

Retaining MIT does not necessarily require a complex CLA. Before accepting external contributions, document verification of the right to contribute and acceptance of the same license, and use a [DCO](https://developercertificate.org/) if needed. Selling a proprietary commercial version that includes future AGPL contributions requires a contribution agreement or similar arrangement granting that right. A DCO itself is neither a copyright assignment nor unrestricted permission to relicense.

## Priority issues to resolve before public promotion

### 1. Deleted Oreo Cat images remain in public past commits

Current ADR 0112 decided to remove Oreo Cat assets whose redistribution rights had not been verified and prohibit their reintroduction. The image is absent from the current tracked tree, and the original ZIP is ignored. However, `public/oreo-cat-aichan-owo.png` was merely added in `7e344d3` on 2026-09-02 and deleted in `ac5626a` on 09-05; historical objects remain.

On the review date, the unauthenticated GitHub contents API returned **a 200 response and metadata for a 78,601-byte file** at the historical path. Deleting it from the current tree did not end public access. The reference used to verify external exposure was `7e344d3:public/oreo-cat-aichan-owo.png`.

Follow-up action is to obtain the necessary redistribution permission from the rights holder or, without permission, clean up public branches, tags, and history containing the object and remaining access paths on GitHub. Changing the prohibition on reintroduction requires a new ADR. Prepare history rewriting and force pushing as a separate task, and do not assume existing clones, forks, and caches will be automatically recalled. Remote history was not changed during this review.

#### 2026-10-02 Local and remote history cleanup

Rewrote the entire history of a separate mirror clone with `git-filter-repo --path public/oreo-cat-aichan-owo.png --invert-paths`, then applied it to `main` and the local `origin/main` reference in the current repository. The existing HEAD tree, index, and working files were preserved unchanged. Cleaned up local reflogs and ran object GC, then verified that the path and image blob were absent from all references and that the old blob could no longer be queried directly. Old commit IDs in the documentation are historical references from the review at that time. Review records concerning the problematic asset and compatibility code for previously saved skin values are retained.

At the user's request, verified that remote HEAD still matched `993ebf6ee73b4dcb27e5bb22d3132fc1a6f1f9e8` from preparation time, then used `--force-with-lease` conditioned on that value to update GitHub `main` to `f40487a08161f06b07d32046cd0fdede613b5691`. The remote has only `main` and no tags; verified that the path and blob were absent from all references in a fresh bare clone from the remote. Uncommitted working files were not included in the push.

**Direct access to the old commit remains available.** On the same day, an unauthenticated GitHub contents API query for `7e344d3:public/oreo-cat-aichan-owo.png` still returned HTTP 200. Public access therefore remains unresolved. The possibility of removing historical objects, PR references, and caches remaining on GitHub must be checked through support. Collaborators must clone again from the cleaned remote or align their history, and must not merge or push old history. Other clones, forks, and past distributions must also be checked separately.

The original recovery bundle was stored in an access-restricted local backup outside the repository. Because the backup still contains the problematic asset, it must not be published or pushed again, and must be discarded once remote cleanup is confirmed and recovery is confirmed to be unnecessary.

#### 2026-10-02 Additional asset and dependency history review

At the user's request for additional cleanup, cross-checked object and path lists across all rewritten references (1,152 unique historical paths), asset addition and deletion commits, and 21 npm lock blobs (8,493 package records). Opened asset candidates directly and checked relevant attribution comments, original notices, and existing license reviews. This is not a copyright assessment of all source code or a contract audit of all past binary distributions.

| Item | Verification and action |
| --- | --- |
| `public/mewcat-walk-8.png` | A 444,745-byte walking sprite sheet added in `3374272` and deleted in `ad2407a` remained in historical commits. No evidence of original creation or redistribution permission was verified, and it is not currently used, so it was removed as a precaution. Its appearance alone does not establish that it is an Oreo Cat derivative or infringes rights. |
| 4 IBM Plex WOFF2 files | Verified the official project's SIL OFL 1.1 and the original notices and provenance manifest in the repository. All current file SHA-256 hashes match the manifest. Retained because the assets are licensed. [IBM original text](https://github.com/IBM/plex/blob/master/LICENSE.txt) |
| AI brand icons and Windows virtual display reference code | Verified Lobe Icons MIT and Microsoft MIT. The driver's Microsoft copyright comments and `virtual-display-origin-license` notice are retained. This does not constitute blanket approval of brand trademark use or binary distribution conditions. [Lobe original text](https://github.com/lobehub/lobe-icons/blob/master/LICENSE), [Microsoft original text](https://github.com/microsoft/Windows-driver-samples/blob/main/LICENSE) |
| `.mew/assets/b7485a60-1d89-4e5e-9c63-5452d8e74952.jpg` | Uploaded dog photo. It was not deleted because there is no evidence that it is a third-party work. Confirmation of whether it was personally photographed and whether publication is authorized has been requested; rights verification is not considered complete until a response is received. |
| `.mew/files/Screenshot_20260927_204950_Brave.jpg` | Confirmed to be a screenshot of the Mew UI. No evidence was found that it contained the existing Oreo Cat image, so it is retained. |
| Models, SDKs, external executables, and archive assets | No original Oreo ZIP, ONNX or safetensors weights, or tracked external EXE, DLL, WASM, or Node addon files were found in the historical path and object lists. RAG download code and dependency declarations are retained as distinct from redistribution of weights through Git. |
| Historical npm license declarations | No noncommercial restrictions or BUSL, SSPL, or UNLICENSED declarations were found. Apache, MIT, BSD, ISC, LGPL, MPL, EPL, and other licenses, as well as references to separate Anthropic agreements, were present. For `jsbi 2.0.5` and `khroma 2.1.0`, which lacked metadata, the Apache-2.0 and MIT license texts were confirmed in their respective npm distributions. `map-stream 0.1.0` has no license text in its distribution, but upstream has an MIT license, so it is retained for collection of actual distribution notices rather than deleted as a prohibited asset. [map-stream license text](https://github.com/dominictarr/map-stream/blob/master/LICENCE) |
| Claude Agent SDK | The SDK itself is not copied into Git; only its installation dependency is declared in the lockfile. Its history is not removed merely because it is subject to a separate agreement. Official SDK guidance applies commercial terms to product integrations and requires prior approval for third-party products to offer claude.ai login, so the actual authentication and hosting arrangements require separate checks against the existing runtime contract and the provider's applicable terms. [Official guidance](https://code.claude.com/docs/en/agent-sdk/overview) |

After cleaning a separate mirror with `git-filter-repo --path public/mewcat-walk-8.png --invert-paths`, local references were updated. The HEAD tree, index, working state, and SHA-256 hashes of all existing tracked files were confirmed unchanged. The original bundle was retained outside the repository at `/home/saens/.cache/mew-license-cleanup-12ch0x6y/before.bundle` with restricted access. This backup still contains the walking sprite sheet from before deletion and must not be made public or pushed.

GitHub `main` was updated to `2359760412d7607c71dbb030986a33ca022b770e` using `--force-with-lease` with the previous remote HEAD `f40487a08161f06b07d32046cd0fdede613b5691` explicitly specified. The remote branch and tag lists and a new bare clone were inspected, confirming that the paths and blobs of both images were absent from all public references. No PR references were advertised, and the local Git integrity check also passed. No new commits were created, and uncommitted working files were not pushed.

**Direct URL access remains unresolved.** Both the rechecked Oreo Cat path at `7e344d3` and the path at the commit that added the walking sprite sheet returned HTTP 200 through the unauthenticated contents API. GitHub's official guidance explicitly states that it does not support removal of nonsensitive data, so sensitive-data removal support does not guarantee deletion of copyrighted assets. Resolving exposure of historical objects requires separate checks of the hosting service's applicable policies and rights-holder procedures; rewriting history or creating a new repository alone does not guarantee retrieval of existing clones, forks, or historical URLs. [GitHub official guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

The determination that this asset cannot be redistributed is based on the existing ADR. The original creator's sales terms could not be independently reconfirmed during this review, so the original text must also be obtained when verifying rights. The local ZIP could not be opened with a standard ZIP parser and was not used as evidence for verifying the original terms.

### 2. Separate the contracts for Claude Code hosting and SDK-based features

Read the follow-up [detailed Zed, agent, and RAG review](agent-model-license-review.md) alongside this document. Anthropic's latest notice postponing changes recognizes personal subscription use with SDK and ACP, so it must not be interpreted as a blanket prohibition. Personal subscription use and token storage, login, and resale by third-party commercial platforms have different scopes.

In the initial review, interactive Claude ran in the official CLI terminal screen. A subsequent user request restored ACP chat and official CLI authentication under [ADR 0142](../history/decisions/0142-mew-claude-acp-and-cli-authentication.md). The current execution and authentication contract follows [runtime configuration](../../../docs/configuration/agent-runtimes.md). Meanwhile, the ACP spec and the `@agentclientprotocol/claude-agent-acp@0.65.0` dependency used for scheduled tasks and other purposes remain, and the latter includes `@anthropic-ai/claude-agent-sdk@0.3.220`. The ACP adapter is Apache-2.0, but the SDK and platform packages reference a separate Anthropic agreement. The adapter's license cannot be applied directly to the SDK.

The [official legal and compliance documentation](https://code.claude.com/docs/en/legal-and-compliance) as of the review date distinguishes the following.

- Hosting the original Claude Code: conditions include accepting commercial terms, leaving the binary unmodified, preserving built-in authentication options, and using users' own credentials with direct provider billing. This must not be interpreted as a blanket prohibition that also covers users logging into their subscriptions directly through the original CLI.
- Building a proprietary SDK product: review based on API keys or supported cloud authentication. Do not assume that the platform may collect, store, or relay Claude subscription tokens on users' behalf or resell usage.

The review starts with a model that separates Mew hosting fees from Claude usage charges. Models that "include Claude subscription usage in Mew fees" or reuse subscription login for SDK-based scheduled tasks require separate verification of contractual compliance. Merely avoiding storage of provider tokens does not satisfy the SDK hosting and redistribution agreements.

Official guidance states that the SDK itself can be used in customer-facing products, so a dependency that is not open source does not by itself justify concluding that all commercial use of Mew is prohibited. However, names and logos for SDK-based features are subject to separate guidelines. Whether both official CLI guidance and SDK features may be labeled "Claude Code" must be assessed separately. Sources: [SDK terms and branding](https://code.claude.com/docs/en/agent-sdk/overview), [commercial terms](https://www.anthropic.com/legal/commercial-terms).

Also separate the code licenses for Codex, Cursor, Antigravity, and other optional runtimes from their subscription/API service agreements. This review did not approve every provider's cloud resale and hosting terms. First determine the runtimes actually offered in the initial paid product and who handles authentication and billing, then complete a contract matrix for that scope only.

### 3. Third-party notice and source provision artifacts for each distribution are incomplete

The root Mew MIT file does not replace third-party package notices. No Mew-wide SBOM or third-party notice deliverables, or release workflow to generate and verify them, were found among currently tracked files. This work also remains a release gate in the existing public release preparation plan.

Users installing from upstream after cloning the source, JS and WASM delivered to browsers, finished native installers, and future VM image and container distributions each involve different components and obligations to check. Code that runs only on the server must be distinguished from code whose copies are sent to clients. [Mozilla's distribution explanation](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) also distinguishes server execution from client delivery.

Recommended deliverables are a list of packages, versions, sources, licenses, and original notices for each distributed version; required NOTICE files; and the exact source, patches, and build information for the relevant libraries. Make them accessible from the app's notices screen or distribution files, and verify actual inclusion after frontend bundling. An SBOM list alone does not satisfy obligations to provide original notices and source.

## Dependency and asset review scope

Reviewed **552 external installation paths** in the root npm lockfile, **151** in the remote desktop npm lockfile, and **68 registry packages** in the Rust lockfile. The npm counts include optional packages for multiple operating systems and duplicate paths; they are not counts of actual distribution artifacts or running packages. Inclusion in a distribution was not determined solely from the `dev` flag. For Rust, 58 local Cargo manifests and 10 crates.io version metadata entries were checked. Checking all metadata is not equivalent to inspecting all third-party code inside each binary.

| Scope | Findings | Remaining distribution actions |
| --- | --- | --- |
| React, Tiptap, CodeMirror, Yjs, xterm, and others | Primarily MIT, Apache, BSD, and ISC according to lockfiles | Preserve copyrights and notices included in bundles. Do not confuse use of paid Tiptap products with standard MIT packages |
| Claude Agent SDK and OS packages | Separate Anthropic agreement | Finalize the CLI/SDK, authentication, and billing boundaries described above |
| sharp 0.34.5 and platform sharp-libvips packages 1.2.4 | sharp Apache-2.0, prebuilt libvips distributions LGPL-3.0-or-later. Some packages use an AND combination of multiple licenses | When redistributing binaries, verify the LGPL license text and notices, corresponding source, and rights to relink/replace and debug for each linking method |
| lightningcss 1.32.0 and platform packages | MPL-2.0 | Currently used in the Tailwind build workflow. Do not automatically treat generated CSS as MPL-licensed. If distributing the library itself, verify source access and notices for the relevant files |
| busboy 1.6.0, json-bignum 0.0.3, streamsearch 1.1.0 | Missing npm metadata; LICENSE text in installed packages is MIT | Do not mistake missing metadata for a prohibited license; collect the actual original notices |
| Remote desktop helper and Electron | A separate [distribution review](../development/remote-desktop-distribution.md) exists. The current helper includes uncommitted changes | Preserve the terms for Chromium, FFmpeg, and other components inside Electron. Do not label the entire runtime with a single MIT line |
| Rust collab | The 68 packages checked have permissive options such as MIT and Apache. unicode-ident also includes Unicode-3.0 obligations | For `OR`, select a permitted license; for `AND`, comply with all licenses. Do not mistake the LGPL option in `r-efi` for a mandatory LGPL obligation |
| 5 internal packages and Cargo manifests | No individual `license` fields | Distinguish use within a monorepo that has a root LICENSE from independent publication. For independent distribution, prepare metadata and include LICENSE files |
| RAG model | Default: `Xenova/multilingual-e5-small`. The converted model card has no separate license field. The original `intfloat/multilingual-e5-small` is marked MIT | Verify the original notices in the converted distribution, the basis for rights to the converted artifacts, and the model revision. Fix the exact file list and notices before distributing an image containing the model |
| Web fonts and AI brand icons | IBM Plex Sans KR and Mono bundle regular and bold WOFF2 files from official distributions (SIL OFL 1.1); Noto Serif KR loads remotely from Google Fonts. `@lobehub/icons-static-svg` has MIT metadata | IBM Plex's original notices, source, version, and hashes are included in the distribution assets linked from [appearance settings](../../../docs/configuration/appearance.md#appearance-settings). The icon package license does not replace permission to use brand trademarks |

Sources: installed package LICENSE files and lockfiles, [sharp-libvips third-party notices](https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md), [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [converted model card](https://huggingface.co/Xenova/multilingual-e5-small), [original model card](https://huggingface.co/intfloat/multilingual-e5-small), [Lobe Icons](https://github.com/lobehub/lobe-icons).

Within this metadata scope, no direct dependency was found that clearly requires all of Mew to switch to GPL/AGPL. LGPL and MPL do not prohibit commercial use and can be used alongside an MIT project when their conditions are met. However, reviews of embedded binaries, models, brand rights, and final distributions remain separate tasks.

## Follow-up sequence through the end of month 9

1. **Before public promotion:** Resolve public access to historical Oreo Cat objects and obtain evidence of rights. Verify actual copyright ownership of code and external assets.
2. **Finalize the licensing direction:** Review terms that meet the user's requirements to allow internal corporate use, private modifications, and free redistribution while restricting sales and paid hosting of Mew itself. If making a change, first write a [Mew-specific ADR](../decisions/README.md), then update LICENSE, metadata, and contribution policies consistently. Explain rights to use older MIT versions separately.
3. **Freeze the release candidate:** Reconcile the current uncommitted state with public main, then verify the SBOM, third-party notices, and required source provision against actual artifacts for each OS, CPU, and distribution format. Do not use the numbers in this document as a permanent approval list.
4. **Define the cloud product:** Document the boundaries between Mew operating costs and AI provider charges, official CLI and SDK features, and user credentials and service operator credentials. Exclude unverified provider features from the initial paid product's scope or offer them after verifying the contracts.
5. **Prepare for external contributions and branding:** Write procedures for contribution rights and principles for distinguishing the official Mew service from forks. Separately verify actual trademark registrability and infringement; MIT does not secure exclusive rights to a name.

Cloud terms of service, privacy practices, refunds, and liability scope require contract work separate from the OSS LICENSE. Also, because the current security model grants manager/owner roles host shell access, MIT's permission for commercial use must not be interpreted as approval for public multitenant deployment. Per-customer isolation requires separate design ([security](../../../docs/operations/security.md)).

This work adds only a review document. The legal interpretations are a preliminary review to support release decisions; rights ownership, actual provider agreements, and adoption of nonstandard licenses must be finalized through professional review with the relevant original texts and information about the contracting parties.
