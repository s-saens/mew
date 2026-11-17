---
title: "Managed PostgreSQL distribution notices"
description: "Preserves primary license texts and pinned source provenance for the CLI-managed PostgreSQL binary distribution. Records the remaining per-platform bundled-library redistribution review."
---

# Managed PostgreSQL distribution notices

Mew's managed database uses `embedded-postgres` **18.6.0-beta.19**, the matching platform package, and PostgreSQL **18.6**. The npm wrapper and platform packaging are distributed under the [upstream MIT license](embedded-postgres-MIT.txt). The underlying Zonky binary-build project provides its [Apache License 2.0](zonky-Apache-2.0.txt). PostgreSQL retains its own [copyright and license](PostgreSQL-COPYRIGHT.txt).

[provenance.json](provenance.json) records exact source URLs, revisions, and SHA-256 hashes for these unmodified texts. The npm dependencies' own license files must also remain in runtime packages.

These files preserve the primary licenses. They do not replace the per-platform review of libraries bundled by the binary provider. The inspected Linux x64 package contains OpenSSL, libxslt, zlib, OSSP UUID, ICU, libxml2, and liblzma; its npm archive does not include a complete separate notice set for those libraries. Release maintainers must preserve the applicable notices for every distributed platform before publication. See the [managed PostgreSQL contract](../../../.mew/docs/development/managed-postgres.md) and [CLI release gates](../../../.mew/docs/operations/cli-release.md).
