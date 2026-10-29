---
title: "Zed external agent comparison and commercial-use review of Mew RAG models"
created: 2026-09-14
updated: 2026-09-15
description: "A record reviewing commercial use of Zed ACP integration, Mew external agents, former RAG models, and Electron. Current authentication status and the removed RAG are distinguished as subsequent decisions."
상위파일: "_work.md"
---

> 2026-09-28 follow-up: [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md) removed RAG and its dedicated models and dependencies. The RAG implementation and review items below are historical records, not current adoption or deployment tasks.


[Full license review](open-source-cloud-license-review.md) · [Electron details](../development/remote-desktop-distribution.md)

The review date is 2026-09-14. The user confirmed that they had never directly copied code from other projects. This is recorded as the user's statement about provenance; no release conditions are added based on assumed, unverified projects copied manually. Verification of the original licenses for packages, models, and runtimes still applies. After this review, the user requested restoration of Claude ACP, which was implemented through [ADR 0142](../history/decisions/0142-mew-claude-acp-and-cli-authentication.md). The terminal status in the initial comparison below reflects the state before that change; current authentication and configuration follow [runtime configuration](../../../docs/configuration/agent-runtimes.md). The unverified scope concerning paid cloud contracts remains unchanged.

## Conclusion

- **There is no basis for treating AI tool integration itself as prohibited for commercial use.** Zed uses public ACP adapters and leaves external agent contracts and billing between users and providers. Mew can also refer to this structure.
- **Connecting external agents and selling AI usage are separate matters.** Charging for operating the Mew environment while users authenticate with their own AI accounts requires a different contract review from Mew purchasing and selling AI usage.
- **MIT is confirmed as the basis for commercial use of the original RAG model.** The Xenova conversion identifies the original source but has no independent LICENSE or license metadata. Supplement notices and version evidence for the conversion, or establish a distribution path from the official original.
- **Electron can be used in paid products.** Third-party terms included in the exact distribution must be followed. Details of checking the official Linux x64 44.3.0 ZIP and SHA-256 are recorded in the [remote desktop distribution document](../development/remote-desktop-distribution.md).

## 1. How Zed integrates

Zed's 2025-09-03 announcement explains that it created an ACP adapter that runs the Claude SDK as a separate process and released it under the Apache license so other editors could use it. It is not treated as a private adapter restricted to a specific editor. The current `@agentclientprotocol/claude-agent-acp` is also an ACP adapter using the official Claude Agent SDK. [Zed's initial announcement](https://zed.dev/blog/claude-code-via-acp), [adapter source](https://github.com/agentclientprotocol/claude-agent-acp).

The latest Zed documentation explains that external agents handle runtime, authentication, models, and configuration, with billing, legal terms, and data processing relationships between providers and users. Zed does not charge for external agents. Agents are installed from the Registry, and the Registry's Apache-2.0 license does not replace individual agent licenses. [External agent documentation](https://zed.dev/docs/ai/external-agents), [ACP Registry](https://github.com/agentclientprotocol/registry).

| Item | Zed's published approach | Current Mew code and implications |
| --- | --- | --- |
| UI and communication | ACP client and separate agent process | Mew also uses ACP. Using adapter code in a commercial app itself falls within the permissive license's scope |
| Installation | Install external agents from the Registry | Mew has Claude/Codex adapters as root npm dependencies and also provides individual installation commands for other CLIs. Record the difference in installation location |
| Claude conversations | Claude Agent or terminal thread | Mew's interactive Claude uses the official CLI's terminal screen. A separate ACP spec also exists, so scheduled and noninteractive execution must also be reviewed |
| Codex conversations | External agents handle their own login and billing | Mew specifies Codex ACP + the host Codex CLI; user account boundaries must be checked |
| Hosting location | Describes connecting tools in the user's development environment | Mew also plans cloud offerings. Sharing server processes, home directories, or credentials across different customers cannot be treated as equivalent conditions |
| AI fees | External agent usage fees are part of the provider relationship | Recommend a product that separates Mew environment, storage, and backup fees from provider AI usage fees |

Zed separately offers Zed-hosted models and charges for usage. This is a different product from external agent connections. Do not infer the contract between Zed and its providers from published pricing alone or conclude that Mew has the same resale rights. [Zed-hosted models](https://zed.dev/docs/account/zed-hosted-models), [billing documentation](https://zed.dev/docs/account/billing).

## 2. Claude — Read user subscriptions together with the provider's commercial agreement

**It is inaccurate to say that all use of SDKs or ACP through users' own subscriptions is prohibited.** Anthropic's 2026-06-15 notice deferring the change explains that SDK, `claude -p`, and third-party app usage continues to count against existing subscription limits. Zed reflected this in its 06-16 update. Do not read the old separate-credit explanations preserved lower on both pages as policy currently in effect. [Top of Anthropic's latest notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), [Zed correction notice](https://zed.dev/blog/anthropic-subscription-changes).

At the same time, Anthropic's legal documentation specifies **conditions for offering the original Claude Code in products and hosted environments**. The structure follows commercial terms, preserves the binary and built-in authentication options, and requires users to authenticate with their own credentials and pay usage fees directly. This differs from permission for a third party to collect or relay subscription tokens or resell usage. [Official hosting and authentication terms](https://code.claude.com/docs/en/legal-and-compliance).

The SDK product guide also retains language restricting claude.ai login and subscription limits in one's own products without prior approval and directing developers to API authentication. Therefore, guidance on individual SDK subscription use must not be expanded into **permission for all SDK login and billing methods on commercial platforms**. Zed's use case or a successful login alone does not establish Mew's contractual compliance. [SDK guide](https://code.claude.com/docs/en/agent-sdk/overview).

Recommendations for Mew are as follows.

1. Official CLI terminal: Preserve the original CLI and the provider's own login flow, and isolate execution and credentials per user. Under the hosting terms, avoid having Mew arbitrarily block built-in API/subscription authentication options.
2. SDK/ACP automation managed by Mew: For the initial paid offering, configure it around users' own API authentication or supported provider authentication. To also offer subscription-based commercial hosting, verify the applicability boundaries of the two documents above against the actual architecture. Do not expand this into a policy prohibiting subscription use for personal self-hosting.
3. Do not share one operator subscription account across multiple customers or sell it as a product with "unlimited Claude included." Design any proprietary AI usage offering separately with an appropriate provider contract and billing structure.
4. Distinguish names and logos for SDK-based features from those used in official CLI guidance. SDK branding guidelines and labels describing the original CLI have different scopes.

Currently, Claude in [agentRuntimes.ts](../../../server/agentRuntimes.ts) has `surface: 'terminal'` and also `spec: claudeSpawnSpec`. ACP installs `@agentclientprotocol/claude-agent-acp@0.65.0` and SDK `0.3.220` by default. If `MEW_AGENT_CONFIG_DIR` is not specified, it may use the host account's authentication environment, so this comparison does not approve offering the current small-scale trusted-user model unchanged to unspecified customers.

## 3. Codex and other external agents

OpenAI's official App Server documentation presents it as a way to integrate authentication, conversation history, approvals, and events into one's own product, and describes Codex-managed ChatGPT login and API key authentication. Therefore, interpreting connections to Codex from external editors as inherently prohibited is incorrect. Follow supported authentication methods and each account's and organization's policies; do not equate support for tool integration with permission to share accounts or resell usage. [App Server](https://learn.chatgpt.com/docs/app-server), [authentication](https://learn.chatgpt.com/docs/auth).

Mew's current Codex ACP adapter is licensed under Apache-2.0, and its default execution specifies the host's Codex rather than the CLI fetched by the adapter. Source locations for OpenAI's published CLI, SDK, and App Server are available in the [official OSS list](https://learn.chatgpt.com/docs/open-source). Zed's Codex connection also uses the agent's own authentication and billing relationship.

The mere presence of Cursor, Kimi, Antigravity, and others in Zed or the Registry does not collectively approve Mew's paid cloud offering terms. Mew can map code distribution terms to service account terms for each runtime it actually releases. This request compares Zed's integration structure with Claude/Codex; it is not an exhaustive review of every provider contract.

### Official Antigravity ACP — Additional verification on 2026-09-15

The proprietary-licensed `antigravity-acp` 1.1.1, with Google listed as its creator, is distributed at `dl.google.com`. Zed installs this executable through the ACP Registry, and Google's official Zed documentation describes `oauth-personal` for personal Free, Pro, and Ultra accounts, along with Enterprise/API authentication. Do not interpret this official integration support as permission for unofficial OAuth token extraction or API proxies. [Google's official integration documentation](https://antigravity.google/docs/ide/extensions/zed/), [registry configuration](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json).

At the user's implementation request, [ADR 0143](../history/decisions/0143-mew-antigravity-official-acp.md) changed the terminal-only decision. Mew installs the binary from the official distribution source without including it in its source, and the official ACP server owns authentication. [Runtime configuration](../../../docs/configuration/agent-runtimes.md#antigravity-official-acp) is the canonical source for current installation, configuration, and verification scope.

## 4. What the RAG conversion model is

At the time, `server/rag/embeddings.ts` converts documents and search queries into **vectors of 384 numbers**. It is an embedding model for finding related documents, not a chat model that generates answers. The current path is as follows.

```text
Microsoft E5 원본: intfloat/multilingual-e5-small
  → Xenova가 Transformers.js용 ONNX·양자화 파일로 변환
  → @huggingface/transformers 3.8.1이 q8 파일을 로드
  → Mew 서버에서 문서·검색어 임베딩 실행
  → LanceDB의 검색용 벡터와 비교
```

The current implementation uses `Xenova/multilingual-e5-small`, `dtype: 'q8'`, mean pooling, and normalization. The installed Transformers.js uses the q8 file suffix `_quantized`, so the default target is `onnx/model_quantized.onnx`. The model cache is stored in `DATA_DIR/rag/models`. Because inference runs on the server, this code path itself does not send document bodies to the Hugging Face inference API. Distinguish the network used for model downloads from where document inference runs.

## 5. Basis for RAG rights and exact versions

| Item checked | Findings |
| --- | --- |
| Original model | The model card has `license: mit`. Microsoft UniLM's E5 README links to this model and points to MIT at the project root |
| Current original revision | `614241f622f53c4eeff9890bdc4f31cfecc418b3` |
| Converted model | The model card identifies the original model and states that it is an ONNX conversion for Transformers.js. No `license` field or separate LICENSE file |
| Current conversion revision | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` |
| Converted q8 file | `onnx/model_quantized.onnx`, 118,308,185 bytes. Hub LFS oid: `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193` |
| Original ONNX | The official original repository also contains `onnx/model.onnx` and optimized and CPU-specific quantized files |
| Mew version pinning | No revision is passed to `pipeline()`, so the default `main` is used. This review did not verify which revision each installation's cache contains or whether they match |

Sources: [original model card](https://huggingface.co/intfloat/multilingual-e5-small/blob/614241f622f53c4eeff9890bdc4f31cfecc418b3/README.md), [E5 README](https://github.com/microsoft/unilm/blob/master/e5/README.md), [UniLM MIT](https://github.com/microsoft/unilm/blob/master/LICENSE), [conversion card](https://huggingface.co/Xenova/multilingual-e5-small/blob/761b726dd34fb83930e26aab4e9ac3899aa1fa78/README.md), [conversion file list](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx).

Model weights were not downloaded to recalculate hashes. File size and LFS oid were read from the Hub metadata for that revision. The original MIT license provides a basis for commercial use, conversion, and redistribution; no evidence was found that a simple format conversion prohibits commercial use. However, preservation of original notices and the scope of independent contributions and assets in the conversion must be recorded in the actual distribution inventory. Do not arbitrarily treat missing metadata as MIT approval or conclude that commercial use is prohibited.

### Recommended follow-up measures

1. Pin the release model's revision, filename, hash, original MIT license, and source. Record library licenses and weight licenses separately.
2. If continuing to use the current Xenova conversion, supplement the original notices and the conversion's permission scope with documentation and upstream materials. Downloading source files does not itself establish the right to use those files.
3. To reduce uncertainty about conversion notices, the recommended path is to **verify the ONNX files in the official original repository, or convert and quantize the MIT original directly**. Direct conversion must also preserve copyright notices and tool licenses.
4. Do not simply change the model name in an environment variable. The original does not contain Mew's default q8 filename, `model_quantized.onnx`, and `model_qint8_avx512_vnni.onnx` assumes a specific CPU. File mapping, CPU and memory, output dimensions, pooling and normalization, and existing search quality must be verified. Rebuild existing indexes if model or quantization changes alter the embedding space.

Distinguish the assessment that Mew can offer paid search features using the original MIT model from the work of completing evidence for the current converted distribution. No model replacement, inference execution, or reindexing was performed in this review.

## Specific deliverables remaining before completion

| Area | Required deliverables |
| --- | --- |
| Agents | A table identifying who installs and runs each release runtime and version, who owns authentication, and who bills usage fees. Separate execution environments per customer |
| RAG | Pinned model revision and file hashes, plus original and conversion notices. Compatibility and search quality verification if replacing the model |
| Electron | Official archive hashes and notices for each distribution OS. If bundling or rehosting binaries, corresponding source, build information, and materials demonstrating compliance with library rights |

The user's confirmation that no code was directly copied has been incorporated. This document avoids both categorical claims: "it is automatically allowed because Zed does it" and "integration is prohibited because the SDK is not open source." The assessment is based on actual distributions and account and contractual relationships.
